//! Build the target modular project tree for a legacy Lua project.
//!
//! The default strategy is conservative: only global functions that do not
//! reference top-level local state are extracted from `scripts/main.lua`.
//! Those functions are grouped by domain, while stateful functions remain in
//! `scripts/legacy/main.lua` until an Agent explicitly migrates their state.

use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::Path;

use super::refactor_lua::{LuaFunction, find_local_declarations, find_references};
use super::refactor_redistribute_scaffold::{ScaffoldMode, push_scaffolding};
use super::refactor_scan::ScanReport;

/// A file to be written as part of the target tree.
#[derive(Debug, Clone)]
pub struct PlannedFile {
    pub rel_path: String,
    pub content: String,
    pub action: &'static str,
    pub after_lines: usize,
    pub before_lines: usize,
}

/// Complete generated tree and its migration diagnostics.
#[derive(Debug, Clone)]
pub struct RedistributionPlan {
    pub files: Vec<PlannedFile>,
    pub by_layer: BTreeMap<&'static str, usize>,
    pub surfaces_created: Vec<String>,
    pub warnings: Vec<Value>,
    pub unclassified: Vec<String>,
}

impl RedistributionPlan {
    #[must_use]
    pub fn to_value(&self) -> Value {
        json!({
            "files": self.files.iter().map(|file| json!({
                "path": file.rel_path,
                "action": file.action,
                "before_lines": file.before_lines,
                "after_lines": file.after_lines,
            })).collect::<Vec<_>>(),
            "by_layer": self.by_layer.iter().map(|(layer, count)| json!({
                "layer": layer,
                "count": count,
            })).collect::<Vec<_>>(),
            "surfaces_created": self.surfaces_created,
            "warnings": self.warnings,
            "unclassified": self.unclassified,
        })
    }
}

/// Build the full target tree without writing to disk.
pub fn build_plan(report: &ScanReport, dry_run: bool, mode: ScaffoldMode) -> RedistributionPlan {
    let mut plan = RedistributionPlan {
        files: Vec::new(),
        by_layer: BTreeMap::new(),
        surfaces_created: Vec::new(),
        warnings: Vec::new(),
        unclassified: report.unclassified.clone(),
    };

    if mode == ScaffoldMode::Skeleton {
        preserve_legacy_main(report, dry_run, &mut plan);
    } else {
        build_grouped_plan(report, dry_run, &mut plan);
    }
    push_scaffolding(&mut plan, report, mode);
    for file in &mut plan.files {
        file.after_lines = file.content.lines().count();
    }
    plan
}

fn preserve_legacy_main(report: &ScanReport, dry_run: bool, plan: &mut RedistributionPlan) {
    let Some(file) = report
        .files
        .iter()
        .find(|file| file.rel_path == "scripts/main.lua")
    else {
        return;
    };
    let Ok(content) = std::fs::read_to_string(&file.abs_path) else {
        plan.warnings
            .push(json!({ "file": file.rel_path, "reason": "read_failed" }));
        return;
    };
    plan.files.push(PlannedFile {
        rel_path: "scripts/legacy/main.lua".to_string(),
        before_lines: content.lines().count(),
        after_lines: content.lines().count(),
        content,
        action: "rewrite",
    });
    plan.warnings.push(json!({
        "file": "scripts/main.lua",
        "reason": "legacy_preserved",
        "resolution": "preserved as scripts/legacy/main.lua",
        "action": if dry_run { "would_preserve" } else { "preserved" },
    }));
}

fn build_grouped_plan(report: &ScanReport, dry_run: bool, plan: &mut RedistributionPlan) {
    let Some(main_file) = report
        .files
        .iter()
        .find(|file| file.rel_path == "scripts/main.lua")
    else {
        plan.warnings.push(json!({
            "reason": "entry_file_missing",
            "hint": "No scripts/main.lua was found; existing Lua files were preserved.",
        }));
        return;
    };
    let Ok(source) = std::fs::read_to_string(&main_file.abs_path) else {
        plan.warnings
            .push(json!({ "file": main_file.rel_path, "reason": "read_failed" }));
        return;
    };
    let shared_locals = top_level_local_names(&source, &main_file.functions);
    let mut groups: BTreeMap<(&'static str, String), Vec<LuaFunction>> = BTreeMap::new();
    let mut extracted = Vec::new();

    for (index, function) in main_file.functions.iter().enumerate() {
        let layer = main_file
            .path_layer
            .unwrap_or(main_file.classified[index].layer);
        *plan.by_layer.entry(layer).or_insert(0) += 1;
        let body = extract_function_body(&main_file.abs_path, function);
        let depends_on_shared = !function.is_global
            || shared_locals
                .iter()
                .any(|name| !find_references(&body, name).is_empty());
        if depends_on_shared {
            plan.warnings.push(json!({
                "file": main_file.rel_path,
                "function": function.name,
                "reason": "deferred_shared_state",
                "resolution": "kept in scripts/legacy/main.lua until state is explicitly exported",
            }));
            continue;
        }
        groups
            .entry((layer, source_stem(&main_file.rel_path)))
            .or_default()
            .push(function.clone());
        extracted.push(function.clone());
    }

    for ((layer, stem), functions) in groups {
        let mut content = format!("-- scripts/{layer}/{stem}.lua -- generated grouped module\n\n");
        for function in functions {
            content.push_str(&extract_function_body(&main_file.abs_path, &function));
            content.push_str("\n\n");
        }
        plan.files.push(PlannedFile {
            rel_path: format!("scripts/{layer}/{stem}.lua"),
            content,
            action: "rewrite",
            before_lines: 0,
            after_lines: 0,
        });
    }

    let legacy = remove_functions(&source, &extracted);
    plan.files.push(PlannedFile {
        rel_path: "scripts/legacy/main.lua".to_string(),
        before_lines: source.lines().count(),
        after_lines: legacy.lines().count(),
        content: legacy,
        action: "rewrite",
    });
    if dry_run && extracted.is_empty() {
        plan.warnings.push(json!({
			"reason": "no_safe_functions_to_extract",
			"hint": "All functions depend on shared local state; migrate state explicitly before another refactor.",
		}));
    }
}

fn source_stem(path: &str) -> String {
    path.rsplit('/')
        .next()
        .unwrap_or("main.lua")
        .trim_end_matches(".lua")
        .to_string()
}

fn top_level_local_names(source: &str, functions: &[LuaFunction]) -> Vec<String> {
    find_local_declarations(source)
        .into_iter()
        .filter(|local| {
            !functions
                .iter()
                .any(|function| local.start >= function.start && local.start < function.end)
        })
        .map(|local| local.name)
        .collect()
}

fn remove_functions(source: &str, functions: &[LuaFunction]) -> String {
    let mut ranges: Vec<(usize, usize)> = functions
        .iter()
        .map(|function| (function.start, function.end))
        .collect();
    ranges.sort_by(|left, right| right.0.cmp(&left.0));
    let mut output = source.to_string();
    for (start, end) in ranges {
        if start <= end && end <= output.len() {
            output.replace_range(start..end, "");
        }
    }
    output
}

fn extract_function_body(path: &Path, function: &LuaFunction) -> String {
    let Ok(source) = std::fs::read_to_string(path) else {
        return String::new();
    };
    if function.end > source.len() {
        return String::new();
    }
    source[function.start..function.end].to_string()
}

#[cfg(test)]
mod tests {
    use super::super::refactor_redistribute_scaffold::ScaffoldMode;
    use super::*;

    #[test]
    fn remove_functions_keeps_non_function_source() {
        let source = "local value = 1\nfunction draw()\nend\nreturn value\n";
        let functions = super::super::refactor_lua::find_functions(source);
        assert_eq!(
            remove_functions(source, &functions),
            "local value = 1\n\nreturn value\n"
        );
    }

    #[test]
    fn empty_report_still_builds_target_scaffold() {
        let report = ScanReport {
            files: vec![],
            unclassified: vec![],
            total_functions: 0,
            surfaces: vec![],
        };
        let plan = build_plan(&report, true, ScaffoldMode::Split);
        assert!(
            plan.files
                .iter()
                .any(|file| file.rel_path == "scripts/ui/surfaces/.gitkeep")
        );
    }
}
