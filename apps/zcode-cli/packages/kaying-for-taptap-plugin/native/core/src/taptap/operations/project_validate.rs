//! Modular project structure validation.
//!
//! Implements the modular project structural compliance checks.
//! Runs when `project.json.structure` uses the modular contract.

use serde_json::{Value, json};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Maximum lines allowed in `scripts/main.lua` (lifecycle forwarder only).
const MAIN_LUA_MAX_LINES: usize = 50;

/// Maximum lines allowed in any single `.lua` file before bloat warning.
const LUA_FILE_MAX_LINES: usize = 500;

/// Run modular structural checks against `root`.
///
/// Returns a JSON array of check results. Each entry has:
/// `{name, valid, severity, message, file?, lines?}`
pub fn run_modular_checks(root: &Path) -> Vec<Value> {
    let mut checks: Vec<Value> = Vec::new();

    // 1. main_lua_size
    checks.push(check_main_lua_size(root));

    // 2. main_lua_business_logic
    checks.push(check_main_lua_business_logic(root));

    // 3. TapTap lifecycle contract (Error)
    checks.push(
        crate::taptap::operations::project_validate_lifecycle::check_lifecycle_contract(root),
    );

    // 4. module_init_exists (Error)
    checks.push(check_module_init_exists(root));

    // 5. bootstrap_exists (Error)
    checks.push(check_bootstrap_exists(root));

    // 6. agents_md_exists
    checks.push(check_agents_md_exists(root));

    // 7. single_file_bloat
    checks.push(check_single_file_bloat(root));

    // 8. circular_dependency (Error)
    checks.push(check_circular_dependency(root));

    // 9. cross_layer_violation
    checks.push(check_cross_layer_violation(root));

    // 10. entry_structure_field (Info)
    checks.push(check_entry_structure_field(root));

    checks
}

/// Determine if any check is an Error (blocks execute).
pub fn has_errors(checks: &[Value]) -> bool {
    checks
        .iter()
        .any(|c| c.get("severity").and_then(|s| s.as_str()) == Some("Error") && c["valid"] == false)
}

// ============================================================
// Individual checks
// ============================================================

fn check_main_lua_size(root: &Path) -> Value {
    let main_path = root.join("scripts/main.lua");
    let (valid, lines, message) = read_line_count(&main_path)
		.map_or((false, 0, "scripts/main.lua not found".to_string()), |n| {
			if n <= MAIN_LUA_MAX_LINES {
				(true, n, format!("scripts/main.lua is {n} lines (≤{MAIN_LUA_MAX_LINES})"))
			} else {
				(false, n, format!("scripts/main.lua is {n} lines (>{MAIN_LUA_MAX_LINES}, should be lifecycle forwarder only)"))
			}
		});

    json!({
        "name": "main_lua_size",
        "valid": valid,
        "severity": "Warning",
        "message": message,
        "file": "scripts/main.lua",
        "lines": lines
    })
}

fn check_main_lua_business_logic(root: &Path) -> Value {
    let main_path = root.join("scripts/main.lua");
    let content = fs::read_to_string(&main_path).unwrap_or_default();

    // Heuristic: detect business logic patterns beyond lifecycle forwarding.
    // Allow: function init/update/exit, require, comments, blank lines.
    // Flag: top-level if/for/while, data table definitions, complex expressions.
    let mut violations: Vec<String> = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("--") {
            continue;
        }
        if trimmed.starts_with("function ")
            || trimmed.starts_with("local ")
            || trimmed.starts_with("return ")
        {
            continue;
        }
        if trimmed == "end" {
            continue;
        }
        // Flag control flow and data definitions at file scope
        if trimmed.starts_with("if ")
            || trimmed.starts_with("for ")
            || trimmed.starts_with("while ")
        {
            violations.push(format!("line {}: {}", i + 1, trimmed));
        }
    }

    let (valid, message) = if violations.is_empty() {
        (true, "main.lua appears to be lifecycle-only".to_string())
    } else {
        (
            false,
            format!(
                "main.lua contains business logic: {}",
                violations.join("; ")
            ),
        )
    };

    json!({
        "name": "main_lua_business_logic",
        "valid": valid,
        "severity": "Warning",
        "message": message,
        "file": "scripts/main.lua"
    })
}

fn check_module_init_exists(root: &Path) -> Value {
    let layers = ["ui", "systems", "gameplay", "data", "lib"];
    let mut missing: Vec<String> = Vec::new();

    for layer in &layers {
        let init_path = root.join("scripts").join(layer).join("init.lua");
        if !init_path.exists() {
            missing.push(format!("scripts/{layer}/init.lua"));
        }
    }

    let (valid, message) = if missing.is_empty() {
        (true, "All module layers have init.lua".to_string())
    } else {
        (
            false,
            format!("Missing module init.lua: {}", missing.join(", ")),
        )
    };

    json!({
        "name": "module_init_exists",
        "valid": valid,
        "severity": "Error",
        "message": message,
        "missing": missing
    })
}

fn check_bootstrap_exists(root: &Path) -> Value {
    let bootstrap_path = root.join("scripts/bootstrap.lua");
    let exists = bootstrap_path.exists();
    let message = if exists {
        "scripts/bootstrap.lua exists".to_string()
    } else {
        "scripts/bootstrap.lua missing (required for modular projects)".to_string()
    };

    json!({
        "name": "bootstrap_exists",
        "valid": exists,
        "severity": "Error",
        "message": message,
        "file": "scripts/bootstrap.lua"
    })
}

fn check_agents_md_exists(root: &Path) -> Value {
    let agents_path = root.join("AGENTS.md");
    let exists = agents_path.exists();
    let message = if exists {
        "AGENTS.md exists".to_string()
    } else {
        "AGENTS.md policy is missing".to_string()
    };

    json!({
        "name": "agents_md_exists",
        "valid": exists,
        "severity": "Warning",
        "message": message,
        "file": "AGENTS.md"
    })
}

fn check_single_file_bloat(root: &Path) -> Value {
    let scripts_dir = root.join("scripts");
    let mut bloated: Vec<Value> = Vec::new();

    if scripts_dir.is_dir() {
        collect_lua_files(&scripts_dir, &mut Vec::new());
        let mut all_files = Vec::new();
        collect_lua_files(&scripts_dir, &mut all_files);

        for file_path in &all_files {
            if let Some(lines) = read_line_count(file_path) {
                if lines > LUA_FILE_MAX_LINES {
                    let rel = file_path.strip_prefix(root).unwrap_or(file_path);
                    bloated.push(json!({
                        "file": rel.to_string_lossy(),
                        "lines": lines
                    }));
                }
            }
        }
    }

    let (valid, message) = if bloated.is_empty() {
        (true, "All Lua files within line limit".to_string())
    } else {
        let files: Vec<String> = bloated
            .iter()
            .map(|b| format!("{} ({} lines)", b["file"].as_str().unwrap(), b["lines"]))
            .collect();
        (
            false,
            format!(
                "Files exceeding {LUA_FILE_MAX_LINES} lines: {}",
                files.join(", ")
            ),
        )
    };

    json!({
        "name": "single_file_bloat",
        "valid": valid,
        "severity": "Warning",
        "message": message,
        "bloated_files": bloated
    })
}

fn check_circular_dependency(root: &Path) -> Value {
    let scripts_dir = root.join("scripts");
    if !scripts_dir.is_dir() {
        return json!({
            "name": "circular_dependency",
            "valid": true,
            "severity": "Error",
            "message": "scripts/ directory missing, skipping circular dependency check"
        });
    }

    // Collect all Lua files and build a require graph.
    let mut all_files = Vec::new();
    collect_lua_files(&scripts_dir, &mut all_files);

    let mut graph: Vec<(String, Vec<String>)> = Vec::new();
    for file_path in &all_files {
        let requires = extract_requires(file_path);
        let rel = file_path
            .strip_prefix(root)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();
        graph.push((rel, requires));
    }

    // Detect cycles via DFS.
    let cycle = detect_cycle(&graph);
    let (valid, message) = match cycle {
        None => (true, "No circular dependencies detected".to_string()),
        Some(path) => (false, format!("Circular dependency: {}", path.join(" → "))),
    };

    json!({
        "name": "circular_dependency",
        "valid": valid,
        "severity": "Error",
        "message": message
    })
}

fn check_cross_layer_violation(root: &Path) -> Value {
    let scripts_dir = root.join("scripts");
    if !scripts_dir.is_dir() {
        return json!({
            "name": "cross_layer_violation",
            "valid": true,
            "severity": "Warning",
            "message": "scripts/ directory missing"
        });
    }

    // Forbidden: ui/ requires gameplay/ directly (should use event bus).
    // Forbidden: gameplay/ requires ui/ directly.
    let mut violations: Vec<String> = Vec::new();
    let layers_to_check = [("ui", "gameplay"), ("gameplay", "ui")];

    for (from_layer, to_layer) in &layers_to_check {
        let from_dir = scripts_dir.join(from_layer);
        if !from_dir.is_dir() {
            continue;
        }
        let mut from_files = Vec::new();
        collect_lua_files(&from_dir, &mut from_files);
        for file_path in &from_files {
            let requires = extract_requires(file_path);
            for req in &requires {
                // Match patterns like "scripts.gameplay." or "scripts/gameplay/"
                let normalized = req.replace('/', ".");
                if normalized.starts_with(&format!("scripts.{to_layer}."))
                    || normalized == format!("scripts.{to_layer}")
                {
                    let rel = file_path
                        .strip_prefix(root)
                        .unwrap_or(file_path)
                        .to_string_lossy()
                        .to_string();
                    violations.push(format!(
                        "{rel} requires {to_layer}/ ({req}) — should use event bus"
                    ));
                }
            }
        }
    }

    let (valid, message) = if violations.is_empty() {
        (true, "No cross-layer violations detected".to_string())
    } else {
        (false, violations.join("; "))
    };

    json!({
        "name": "cross_layer_violation",
        "valid": valid,
        "severity": "Warning",
        "message": message
    })
}

fn check_entry_structure_field(root: &Path) -> Value {
    let project_json_path = root.join(".project/project.json");
    let content = fs::read_to_string(&project_json_path).unwrap_or_default();
    let json: Value = serde_json::from_str(&content).unwrap_or(Value::Null);
    let has_structure = json.get("structure").is_some();
    let structure = json
        .get("structure")
        .and_then(Value::as_str)
        .map(|value| {
            if value == "modular" || value.starts_with("modular-") {
                "modular"
            } else {
                value
            }
        })
        .unwrap_or("");

    json!({
        "name": "entry_structure_field",
        "valid": true,
        "severity": "Info",
        "message": if has_structure {
            format!("project.json.structure = {structure}")
        } else {
            "project.json.structure field missing (modular checks skipped)".to_string()
        }
    })
}

// ============================================================
// Helpers
// ============================================================

/// Read the number of lines in a file, if it exists.
fn read_line_count(path: &Path) -> Option<usize> {
    let content = fs::read_to_string(path).ok()?;
    Some(content.lines().count())
}

/// Recursively collect all `.lua` files under `dir`.
fn collect_lua_files(dir: &Path, out: &mut Vec<PathBuf>) {
    if !dir.is_dir() {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_lua_files(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("lua") {
            out.push(path);
        }
    }
}

/// Extract `require "module.path"` strings from a Lua file.
fn extract_requires(path: &Path) -> Vec<String> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let mut requires: Vec<String> = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        // Match: require "scripts.foo.bar"  /  require 'scripts.foo.bar'
        // Match: local X = require "scripts.foo"
        if let Some(rest) = trimmed.find("require") {
            let after_require = &trimmed[rest + "require".len()..];
            let module = extract_quoted_string(after_require.trim());
            if let Some(m) = module {
                requires.push(m);
            }
        }
    }
    requires
}

/// Extract the first quoted string from `s` (handles both " and ').
fn extract_quoted_string(s: &str) -> Option<String> {
    let s = s.trim_start();
    if s.is_empty() {
        return None;
    }
    let quote = s.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let inner = &s[1..];
    let end = inner.find(quote)?;
    Some(inner[..end].to_string())
}

/// Detect a cycle in the require graph via DFS.
/// Returns the cycle path if found, else None.
fn detect_cycle(graph: &[(String, Vec<String>)]) -> Option<Vec<String>> {
    let mut visited: HashSet<String> = HashSet::new();
    let mut stack: Vec<String> = Vec::new();
    let mut on_stack: HashSet<String> = HashSet::new();

    for (node, _) in graph {
        if !visited.contains(node) {
            if let Some(cycle) = dfs_cycle(node, graph, &mut visited, &mut stack, &mut on_stack) {
                return Some(cycle);
            }
        }
    }
    None
}

fn dfs_cycle(
    node: &str,
    graph: &[(String, Vec<String>)],
    visited: &mut HashSet<String>,
    stack: &mut Vec<String>,
    on_stack: &mut HashSet<String>,
) -> Option<Vec<String>> {
    visited.insert(node.to_string());
    stack.push(node.to_string());
    on_stack.insert(node.to_string());

    // Find this node's edges
    let edges: Vec<&String> = graph
        .iter()
        .find(|(n, _)| n == node)
        .map(|(_, e)| e.iter().collect::<Vec<_>>())
        .unwrap_or_default();

    for edge in edges {
        // Normalize edge to match graph node format (strip_prefix form)
        let normalized = edge.replace('/', ".");
        if !visited.contains(&normalized) {
            if let Some(cycle) = dfs_cycle(&normalized, graph, visited, stack, on_stack) {
                return Some(cycle);
            }
        } else if on_stack.contains(&normalized) {
            // Found cycle: extract from stack
            let start_idx = stack.iter().position(|n| n == &normalized).unwrap();
            let mut cycle: Vec<String> = stack[start_idx..].to_vec();
            cycle.push(normalized.clone());
            return Some(cycle);
        }
    }

    stack.pop();
    on_stack.remove(node);
    None
}

#[cfg(test)]
#[path = "project_validate_tests.rs"]
mod project_validate_tests;
