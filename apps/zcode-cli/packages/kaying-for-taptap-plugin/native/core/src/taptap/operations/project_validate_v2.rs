//! Modular structural validation - Surface-aware checks.
//!
//! Extends `project_validate::run_modular_checks` with Surface-specific rules
//! when `project.json.structure == "modular"`.
//!
//! Cross-Surface require validation lives in
//! [`project_validate_v2_cross`] to keep files under the 500-line limit.

use super::project_validate_surfaces_cross::check_surface_cross_require;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

/// Run Surface-aware modular structural checks against `root`.
///
/// These checks complement `run_modular_checks`. Returns a JSON array of
/// Surface-specific check results.
pub fn run_surface_checks(root: &Path) -> Vec<Value> {
    let mut checks: Vec<Value> = Vec::new();

    // 1. surface_dir_exists (Error)
    checks.push(check_surface_dir_exists(root));

    // 2. surface_init_exists (Error)
    checks.push(check_surface_init_exists(root));

    // 3. surface_view_state_split (Warning)
    checks.push(check_surface_view_state_split(root));

    // 4. surface_manifest_sync (Warning)
    checks.push(check_surface_manifest_sync(root));

    // 5. surface_cross_require (Warning)
    checks.push(check_surface_cross_require(root));

    // 6. engine_field_exists (Info)
    checks.push(check_engine_field_exists(root));

    // 7. scene_flow_uses_surfaces (Warning)
    checks.push(check_scene_flow_uses_surfaces(root));

    checks
}

/// Determine if any Surface check is an Error (blocks execute).
pub fn has_surface_errors(checks: &[Value]) -> bool {
    checks
        .iter()
        .any(|c| c.get("severity").and_then(|s| s.as_str()) == Some("Error") && c["valid"] == false)
}

// ============================================================
// Individual Surface checks
// ============================================================

fn check_surface_dir_exists(root: &Path) -> Value {
    let surfaces_dir = root.join("scripts/ui/surfaces");
    let exists = surfaces_dir.is_dir();
    json!({
        "name": "surface_dir_exists",
        "valid": exists,
        "severity": "Error",
        "message": if exists {
            "scripts/ui/surfaces/ exists".to_string()
        } else {
            "scripts/ui/surfaces/ missing (required for modular projects)".to_string()
        },
        "file": "scripts/ui/surfaces/"
    })
}

fn check_surface_init_exists(root: &Path) -> Value {
    let surfaces_dir = root.join("scripts/ui/surfaces");
    if !surfaces_dir.is_dir() {
        return json!({
            "name": "surface_init_exists",
            "valid": false,
            "severity": "Error",
            "message": "scripts/ui/surfaces/ directory missing, cannot check Surface init.lua",
            "missing": []
        });
    }

    let mut missing: Vec<String> = Vec::new();
    let mut invalid_contract: Vec<String> = Vec::new();

    for entry in fs::read_dir(&surfaces_dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let surface_id = match path.file_name().and_then(|n| n.to_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let init_path = path.join("init.lua");
        if !init_path.exists() {
            missing.push(format!("scripts/ui/surfaces/{surface_id}/init.lua"));
            continue;
        }
        // Check contract: init.lua must export create() and destroy().
        let content = fs::read_to_string(&init_path).unwrap_or_default();
        let has_create = content.contains(".create") || content.contains("function create");
        let has_destroy = content.contains(".destroy") || content.contains("function destroy");
        if !has_create || !has_destroy {
            invalid_contract.push(format!(
                "scripts/ui/surfaces/{surface_id}/init.lua (missing {})",
                if !has_create && !has_destroy {
                    "create() and destroy()"
                } else if !has_create {
                    "create()"
                } else {
                    "destroy()"
                }
            ));
        }
    }

    let (valid, message) = if missing.is_empty() && invalid_contract.is_empty() {
        (
            true,
            "All Surface init.lua files exist with create/destroy contract".to_string(),
        )
    } else {
        let mut parts: Vec<String> = Vec::new();
        if !missing.is_empty() {
            parts.push(format!("Missing: {}", missing.join(", ")));
        }
        if !invalid_contract.is_empty() {
            parts.push(format!("Invalid contract: {}", invalid_contract.join(", ")));
        }
        (false, parts.join("; "))
    };

    json!({
        "name": "surface_init_exists",
        "valid": valid,
        "severity": "Error",
        "message": message,
        "missing": missing,
        "invalid_contract": invalid_contract
    })
}

fn check_surface_view_state_split(root: &Path) -> Value {
    let surfaces_dir = root.join("scripts/ui/surfaces");
    if !surfaces_dir.is_dir() {
        return json!({
            "name": "surface_view_state_split",
            "valid": true,
            "severity": "Warning",
            "message": "scripts/ui/surfaces/ missing, skipping view/state split check"
        });
    }

    let mut incomplete: Vec<String> = Vec::new();
    for entry in fs::read_dir(&surfaces_dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let surface_id = match path.file_name().and_then(|n| n.to_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let has_view = path.join("view.lua").exists();
        let has_state = path.join("state.lua").exists();
        if !has_view || !has_state {
            let missing = match (!has_view, !has_state) {
                (true, true) => "view.lua and state.lua",
                (true, false) => "view.lua",
                (false, true) => "state.lua",
                _ => "",
            };
            incomplete.push(format!("scripts/ui/surfaces/{surface_id}/ ({missing})"));
        }
    }

    let (valid, message) = if incomplete.is_empty() {
        (true, "All Surfaces have view.lua and state.lua".to_string())
    } else {
        (
            false,
            format!(
                "Surfaces missing view/state split: {}",
                incomplete.join(", ")
            ),
        )
    };

    json!({
        "name": "surface_view_state_split",
        "valid": valid,
        "severity": "Warning",
        "message": message,
        "incomplete": incomplete
    })
}

fn check_surface_manifest_sync(root: &Path) -> Value {
    let surfaces_json_path = root.join(".project/surfaces.json");
    let surfaces_dir = root.join("scripts/ui/surfaces");

    // Collect directory-level surface ids.
    let mut dir_surfaces: Vec<String> = Vec::new();
    if surfaces_dir.is_dir() {
        for entry in fs::read_dir(&surfaces_dir).into_iter().flatten().flatten() {
            if entry.path().is_dir() {
                if let Some(id) = entry.file_name().to_str() {
                    dir_surfaces.push(id.to_string());
                }
            }
        }
    }
    dir_surfaces.sort();

    // Collect manifest-declared surface ids.
    let mut manifest_surfaces: Vec<String> = Vec::new();
    if surfaces_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&surfaces_json_path) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
                if let Some(arr) = parsed["surfaces"].as_array() {
                    for s in arr {
                        if let Some(id) = s["id"].as_str() {
                            manifest_surfaces.push(id.to_string());
                        }
                    }
                }
            }
        }
    }
    manifest_surfaces.sort();

    let in_dir_not_manifest: Vec<&String> = dir_surfaces
        .iter()
        .filter(|d| !manifest_surfaces.contains(d))
        .collect();
    let in_manifest_not_dir: Vec<&String> = manifest_surfaces
        .iter()
        .filter(|m| !dir_surfaces.contains(m))
        .collect();

    let (valid, message) = if in_dir_not_manifest.is_empty() && in_manifest_not_dir.is_empty() {
        (
            true,
            "surfaces.json manifest in sync with directories".to_string(),
        )
    } else {
        let mut parts: Vec<String> = Vec::new();
        if !in_dir_not_manifest.is_empty() {
            parts.push(format!(
                "In dir not manifest: {}",
                in_dir_not_manifest
                    .iter()
                    .map(|s| s.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        if !in_manifest_not_dir.is_empty() {
            parts.push(format!(
                "In manifest not dir: {}",
                in_manifest_not_dir
                    .iter()
                    .map(|s| s.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        (false, parts.join("; "))
    };

    json!({
        "name": "surface_manifest_sync",
        "valid": valid,
        "severity": "Warning",
        "message": message,
        "dir_surfaces": dir_surfaces,
        "manifest_surfaces": manifest_surfaces
    })
}

fn check_engine_field_exists(root: &Path) -> Value {
    let project_json_path = root.join(".project/project.json");
    let content = fs::read_to_string(&project_json_path).unwrap_or_default();
    let parsed: Value = serde_json::from_str(&content).unwrap_or(Value::Null);
    let has_engine = parsed.get("engine").is_some();

    json!({
        "name": "engine_field_exists",
        "valid": true,
        "severity": "Info",
        "message": if has_engine {
            format!("project.json.engine = {}", parsed["engine"])
        } else {
            "project.json.engine field missing (recommended for multi-engine support)".to_string()
        }
    })
}

fn check_scene_flow_uses_surfaces(root: &Path) -> Value {
    let scene_flow_path = root.join("scripts/systems/scene_flow.lua");
    if !scene_flow_path.exists() {
        return json!({
            "name": "scene_flow_uses_surfaces",
            "valid": true,
            "severity": "Warning",
            "message": "scripts/systems/scene_flow.lua missing, skipping Surface usage check"
        });
    }
    let content = fs::read_to_string(&scene_flow_path).unwrap_or_default();
    let uses_surfaces = content.contains("Surfaces") || content.contains("surface:switch");

    json!({
        "name": "scene_flow_uses_surfaces",
        "valid": uses_surfaces,
        "severity": "Warning",
        "message": if uses_surfaces {
            "scene_flow.lua references registered Surfaces".to_string()
        } else {
            "scene_flow.lua does not reference Surfaces or surface:switch event".to_string()
        }
    })
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::taptap::operations::project_scaffold::generate_modular_scaffold;
    use tempfile::tempdir;

    #[test]
    fn test_v2_checks_clean_project() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        generate_modular_scaffold(root, "clean", "1.0.0", "taptap").unwrap();

        let checks = run_surface_checks(root);
        let errors: Vec<&Value> = checks
            .iter()
            .filter(|c| c["severity"] == "Error" && c["valid"] == false)
            .collect();
        assert!(
            errors.is_empty(),
            "Clean v2 project should have no Error checks: {:?}",
            errors
        );
    }

    #[test]
    fn test_check_surface_dir_exists_detects_missing() {
        let temp = tempdir().unwrap();
        let result = check_surface_dir_exists(temp.path());
        assert_eq!(result["valid"], false);
        assert_eq!(result["severity"], "Error");
    }

    #[test]
    fn test_check_surface_init_exists_detects_missing_create() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        let surface_dir = root.join("scripts/ui/surfaces/broken");
        fs::create_dir_all(&surface_dir).unwrap();
        fs::write(
            surface_dir.join("init.lua"),
            "-- no create/destroy\nlocal M = {}\nreturn M\n",
        )
        .unwrap();

        let result = check_surface_init_exists(root);
        assert_eq!(result["valid"], false);
        assert_eq!(result["severity"], "Error");
        assert!(result["invalid_contract"].as_array().unwrap().len() > 0);
    }

    #[test]
    fn test_check_surface_manifest_sync_detects_drift() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        // Create surface dir but no manifest entry.
        fs::create_dir_all(root.join("scripts/ui/surfaces/orphan")).unwrap();
        fs::write(
            root.join("scripts/ui/surfaces/orphan/init.lua"),
            "local M = {}\nfunction M.create() end\nfunction M.destroy() end\nreturn M\n",
        )
        .unwrap();
        // Empty manifest.
        fs::create_dir_all(root.join(".project")).unwrap();
        fs::write(root.join(".project/surfaces.json"), r#"{"surfaces":[]}"#).unwrap();

        let result = check_surface_manifest_sync(root);
        assert_eq!(result["valid"], false);
        assert_eq!(result["severity"], "Warning");
    }

    #[test]
    fn test_check_engine_field_exists() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        fs::create_dir_all(root.join(".project")).unwrap();
        fs::write(root.join(".project/project.json"), r#"{"engine":"taptap"}"#).unwrap();

        let result = check_engine_field_exists(root);
        assert_eq!(result["severity"], "Info");
        assert!(result["message"].as_str().unwrap().contains("taptap"));
    }

    #[test]
    fn test_has_v2_errors_detects_error_severity() {
        let checks = vec![
            json!({"name": "a", "valid": true, "severity": "Warning"}),
            json!({"name": "b", "valid": false, "severity": "Error"}),
        ];
        assert!(has_surface_errors(&checks));
    }

    #[test]
    fn test_has_v2_errors_false_when_only_warnings() {
        let checks = vec![json!({"name": "a", "valid": false, "severity": "Warning"})];
        assert!(!has_surface_errors(&checks));
    }
}
