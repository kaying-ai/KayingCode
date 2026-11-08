//! Canonical project refactor operation.
//!
//! Pipeline:
//! 1. Scan and classify the existing Lua tree.
//! 2. Build the complete target tree in a sibling staging directory.
//! 3. Validate the staged tree before changing the project.
//! 4. Snapshot the project and commit staged files with automatic recovery.

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use chrono::Utc;
use serde_json::{Value, json};
use std::path::Path;
use tracing::info;

use super::helpers::{fail_result, get_project_root, ok_result};
use super::project::is_modular_structure;
use super::refactor_modular_metadata::{
    canonical_structure, detect_raw_structure, normalize_modular_metadata,
};
use super::refactor_redistribute::{RedistributionPlan, build_plan};
use super::refactor_redistribute_scaffold::ScaffoldMode;
use super::refactor_scan::scan_project;
use super::refactor_transaction::{
    cleanup_stage, commit_stage, create_stage, project_fingerprint, snapshot_project,
    validate_stage, write_planned_file,
};

// ============================================================
// project.refactor_to_modular
// ============================================================

/// Handle `project.refactor_to_modular`.
///
/// Arguments:
/// - `project_root` (required)
/// - `target` (optional, default `modular`): target structure.
/// - `dry_run` (optional, default `false`): analyze only, no file writes.
/// - A full-project snapshot is always created before commit for recovery.
/// - `scan_glob` (optional, default `scripts/**/*.lua`): glob for files to scan.
/// - `mode` (optional, default `"split"`): scaffold mode.
///   - `"split"`: extract safe functions into grouped layer modules.
///   - `"skeleton"`: preserve all legacy logic under `scripts/legacy/main.lua`.
pub fn project_refactor_to_modular(
    request: &OperationRequest,
    plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let dry_run = request
        .arguments
        .get("dry_run")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let scan_glob = request
        .arguments
        .get("scan_glob")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let mode = request
        .arguments
        .get("mode")
        .and_then(|v| v.as_str())
        .map(ScaffoldMode::from_str)
        .unwrap_or(ScaffoldMode::Split);
    let source_fingerprint = project_fingerprint(&root)?;
    if let Some(expected_fingerprint) = plan.project_fingerprint.as_deref() {
        if expected_fingerprint != source_fingerprint {
            return Err(ExecuteError::PlanInvalid(
                "Project changed after the refactor plan was prepared; prepare a new plan"
                    .to_string(),
            ));
        }
    }

    // --- 1. Pre-checks ---
    let raw_structure = detect_raw_structure(&root);
    let structure = canonical_structure(&raw_structure);
    if is_modular_structure(&raw_structure) {
        if raw_structure != "modular" {
            return normalize_modular_metadata(request, &root, &source_fingerprint, dry_run);
        }
        return Ok(ok_result(
            request,
            json!({
                "refactored": false,
                "reason": "already_modular",
                "project_root": root.to_string_lossy(),
                "hint": "Project is already modular; refusing to overwrite.",
            }),
            0,
        ));
    }

    let scripts_dir = root.join("scripts");
    if !scripts_dir.exists() {
        return Ok(ok_result(
            request,
            json!({
                "refactored": false,
                "reason": "no_scripts_dir",
                "project_root": root.to_string_lossy(),
                "hint": "Project has no scripts/ directory; nothing to refactor.",
            }),
            0,
        ));
    }

    // --- 2. Scan and build a complete plan before touching the project ---
    let report = scan_project(&root, scan_glob.as_deref());
    if report.files.is_empty() {
        return Ok(ok_result(
            request,
            json!({
                "refactored": false,
                "reason": "no_lua_files_scanned",
                "project_root": root.to_string_lossy(),
                "scanned_file_count": 0,
            }),
            0,
        ));
    }

    // --- 3. Build redistribution plan ---
    let plan = build_plan(&report, dry_run, mode);

    // --- 4. Build the before/after tree report ---
    let before_tree = build_tree_snapshot(&root, &["scripts", "scenes", ".project"]);
    let after_tree = build_after_tree(&plan);

    // Dry-run never creates a backup and never writes into the project.
    let mut written_files: Vec<String> = Vec::new();
    let mut backup_info: Option<Value> = None;
    if !dry_run {
        let stage = create_stage(&root)?;
        let staged_result = (|| {
            for file in &plan.files {
                write_planned_file(&stage.root, file)?;
                written_files.push(file.rel_path.clone());
            }
            patch_project_json(&stage.root)?;
            let validation = validate_stage(request, &stage.root)?;
            if validation["valid"] != true {
                return Ok::<_, ExecuteError>(Some(fail_result(
                    request,
                    json!({
                        "refactored": false,
                        "reason": "staged_validation_failed",
                        "validation": validation["result"],
                        "before_tree": before_tree.clone(),
                        "after_tree": after_tree.clone(),
                        "warnings": plan.warnings.clone(),
                    }),
                    0,
                )));
            }
            if project_fingerprint(&root)? != source_fingerprint {
                return Err(ExecuteError::PlanInvalid(
                    "Project changed while the refactor plan was being prepared".to_string(),
                ));
            }
            let (backup_id, backup_path) = snapshot_project(&root, "project_refactor")?;
            commit_stage(&stage, &backup_path)?;
            backup_info = Some(json!({
                "backup_id": backup_id,
                "path": backup_path.to_string_lossy(),
            }));
            Ok(None)
        })();
        cleanup_stage(&stage);
        if let Some(result) = staged_result? {
            return Ok(result);
        }
    }

    info!(
        project = %root.to_string_lossy(),
        scanned_files = report.files.len(),
        classified_functions = report.total_functions,
        surfaces = plan.surfaces_created.len(),
        written = written_files.len(),
        dry_run,
        "refactor_to_modular completed"
    );

    // --- 7. Compose the response (J4 report + J6 diff) ---
    let by_layer: Vec<Value> = plan
        .by_layer
        .iter()
        .map(|(layer, count)| json!({ "layer": layer, "count": count }))
        .collect();

    let diff_payload: Vec<Value> = plan
        .files
        .iter()
        .map(|f| {
            json!({
                "file": f.rel_path,
                "action": f.action,
                "before_lines": f.before_lines,
                "after_lines": f.after_lines,
            })
        })
        .collect();

    let mode_str = match mode {
        ScaffoldMode::Skeleton => "skeleton",
        ScaffoldMode::Split => "split",
    };
    let mut output = json!({
        "refactored": !dry_run,
        "dry_run": dry_run,
        "target": "modular",
        "mode": mode_str,
        "project_root": root.to_string_lossy(),
        "structure_before": structure,
        "structure_after": if dry_run { structure.clone() } else { "modular".to_string() },
        "backup": backup_info,
        "scanned_files": report.files.len(),
        "classified_functions": report.total_functions,
        "by_layer": by_layer,
        "surfaces_created": plan.surfaces_created,
        "warnings": plan.warnings,
        "unclassified": plan.unclassified,
        "before_tree": before_tree,
        "after_tree": after_tree,
        "diff": diff_payload,
        "written_files": written_files,
        "next_step": if dry_run {
            "Re-run without dry_run=true to apply the refactor."
        } else if mode == ScaffoldMode::Skeleton {
            "Run project.validate on the committed project, then migrate any deferred shared-state functions reported by the refactor."
        } else {
            "Run project.validate to confirm modular structure compliance."
        },
    });
    if let Value::Object(ref mut map) = output {
        map.insert(
            "report".to_string(),
            json!({
                "scanned_files": report.files.len(),
                "classified_functions": report.total_functions,
                "surfaces_detected": report.surfaces.len(),
                "by_layer": by_layer,
                "unclassified_count": plan.unclassified.len(),
            }),
        );
    }

    Ok(ok_result(request, output, 0))
}

/// Prepare stub for the canonical project refactor operation.
pub fn prepare_refactor_to_modular(
    request: &OperationRequest,
) -> Result<OperationPlan, PrepareError> {
    let root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;
    let project_fingerprint =
        project_fingerprint(&root).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;
    let plan_id = format!("refactor-modular-plan-{}", std::process::id());
    let now = Utc::now();
    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![root.to_string_lossy().to_string()],
        effects: vec![Effect::ReadProject, Effect::WriteProject],
        project_fingerprint: Some(project_fingerprint),
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: "refactor-modular-effects".to_string(),
    })
}

/// Build a textual snapshot of the current project tree (top-level dirs only).
fn build_tree_snapshot(root: &Path, dirs: &[&str]) -> String {
    let mut lines = Vec::new();
    for dir in dirs {
        let path = root.join(dir);
        if !path.exists() {
            continue;
        }
        lines.push(format!("{dir}/"));
        if let Ok(entries) = std::fs::read_dir(&path) {
            let mut names: Vec<String> = entries
                .flatten()
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if e.path().is_dir() {
                        format!("  {name}/")
                    } else {
                        format!("  {name}")
                    }
                })
                .collect();
            names.sort();
            lines.extend(names);
        }
    }
    lines.join("\n")
}

/// Build a textual snapshot of the projected tree from a redistribution plan.
fn build_after_tree(plan: &RedistributionPlan) -> String {
    let mut by_top: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for file in &plan.files {
        let top = file.rel_path.split('/').next().unwrap_or("").to_string();
        by_top.entry(top).or_default().push(file.rel_path.clone());
    }
    let mut lines = Vec::new();
    for (top, mut entries) in by_top {
        lines.push(format!("{top}/"));
        entries.sort();
        for entry in entries {
            lines.push(format!("  {entry}"));
        }
    }
    lines.join("\n")
}

/// Patch `.project/project.json` to the single canonical `modular` structure.
fn patch_project_json(root: &Path) -> Result<(), ExecuteError> {
    let path = root.join(".project").join("project.json");
    let mut value: Value = if path.exists() {
        let body = std::fs::read_to_string(&path).map_err(ExecuteError::Io)?;
        serde_json::from_str(&body).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    if let Value::Object(ref mut map) = value {
        map.insert(
            "structure".to_string(),
            Value::String("modular".to_string()),
        );
        map.insert("engine".to_string(), Value::String("taptap".to_string()));
    }
    let body = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string());
    std::fs::write(&path, body).map_err(ExecuteError::Io)?;
    Ok(())
}

// ============================================================
// Unit tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::taptap::operations::refactor_redistribute::PlannedFile;

    #[test]
    fn detect_structure_returns_legacy_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(detect_raw_structure(tmp.path()), "legacy");
    }

    #[test]
    fn detect_structure_reads_project_json() {
        let tmp = tempfile::tempdir().unwrap();
        let project_dir = tmp.path().join(".project");
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("project.json"),
            "{\"structure\":\"modular-legacy\"}",
        )
        .unwrap();
        assert_eq!(detect_raw_structure(tmp.path()), "modular-legacy");
        assert_eq!(canonical_structure("modular-legacy"), "modular");
    }

    #[test]
    fn build_after_tree_groups_by_top_level() {
        let plan = RedistributionPlan {
            files: vec![
                PlannedFile {
                    rel_path: "scripts/ui/init.lua".to_string(),
                    content: "x".to_string(),
                    action: "create",
                    after_lines: 1,
                    before_lines: 0,
                },
                PlannedFile {
                    rel_path: ".project/surfaces.json".to_string(),
                    content: "{}".to_string(),
                    action: "create",
                    after_lines: 1,
                    before_lines: 0,
                },
            ],
            by_layer: std::collections::BTreeMap::new(),
            surfaces_created: Vec::new(),
            warnings: Vec::new(),
            unclassified: Vec::new(),
        };
        let tree = build_after_tree(&plan);
        assert!(tree.contains(".project/"));
        assert!(tree.contains("scripts/"));
    }
}
