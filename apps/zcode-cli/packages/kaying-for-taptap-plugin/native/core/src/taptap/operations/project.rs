//! TapTap project operations — info, validate, init.

use crate::model::{
    Diagnostic, DiagnosticSeverity, OperationPlan, OperationRequest, OperationResult,
};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Handle `project.info` — read project metadata from .project/project.json.
pub fn project_info(
    request: &OperationRequest,
) -> Result<OperationResult, crate::model::ExecuteError> {
    let root = get_project_root(request)?;

    let project_json_path = root.join(".project").join("project.json");
    if !project_json_path.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": "No .project/project.json found",
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    let content = std::fs::read_to_string(&project_json_path)
        .map_err(|e| crate::model::ExecuteError::Io(e))?;

    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();

    let entry = json.get("entry").and_then(|v| v.as_str());
    let engine_version = json.get("engineVersion").and_then(|v| v.as_str());
    let mut warnings: Vec<Diagnostic> = Vec::new();

    let resolved_entry = entry.map(|e| root.join(e));
    let entry_exists = resolved_entry.as_ref().map_or(false, |p| p.exists());
    if let Some(ref e) = entry {
        if !entry_exists {
            warnings.push(Diagnostic {
                code: "ENTRY_NOT_FOUND".to_string(),
                message: format!("Configured entry '{e}' does not exist"),
                severity: DiagnosticSeverity::Warning,
            });
        }
    }

    info!(project_root = %root.to_string_lossy(), "Project info retrieved");

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "entry": entry,
            "engine_version": engine_version,
            "resolved_entry": resolved_entry.map(|p| p.to_string_lossy().to_string()),
            "warnings": warnings,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `project.validate` — validate project structure and entry point.
///
/// When `project.json.structure` is the canonical modular value or a legacy
/// modular alias, additionally runs the full modular structural compliance
/// checks, including Surface conventions.
pub fn project_validate(
    request: &OperationRequest,
) -> Result<OperationResult, crate::model::ExecuteError> {
    let root = get_project_root(request)?;

    let mut checks: Vec<serde_json::Value> = Vec::new();
    let mut all_valid = true;

    // Check 1: .project/project.json exists and is valid JSON
    let project_json_path = root.join(".project").join("project.json");
    let (project_json_valid, project_json_value) = if project_json_path.exists() {
        match std::fs::read_to_string(&project_json_path) {
            Ok(content) => {
                let json: serde_json::Value =
                    serde_json::from_str(&content).unwrap_or(serde_json::Value::Null);
                (!json.is_null(), json)
            }
            Err(_) => (false, serde_json::Value::Null),
        }
    } else {
        (false, serde_json::Value::Null)
    };
    checks.push(json!({
        "name": "project.json",
        "valid": project_json_valid,
        "message": if project_json_valid { "OK" } else { "Missing or invalid .project/project.json" }
    }));
    if !project_json_valid {
        all_valid = false;
    }

    // Check 2: Entry point exists
    let entry = if project_json_valid {
        project_json_value
            .get("entry")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    } else {
        None
    };

    // Entry may be relative to project root ("scripts/main.lua") or to
    // scripts/ ("main.lua"). Accept either convention.
    let entry_exists = entry.as_ref().map_or(false, |e| {
        root.join(e).exists() || root.join("scripts").join(e).exists()
    });
    checks.push(json!({
        "name": "entry_point",
        "valid": entry_exists,
        "message": match (&entry, entry_exists) {
            (Some(e), true) => format!("Entry '{e}' found"),
            (Some(e), false) => format!("Entry '{e}' not found"),
            (None, _) => "No entry configured in project.json".to_string(),
        }
    }));
    if !entry_exists {
        all_valid = false;
    }

    // Check 3: scripts/ directory exists
    let scripts_exists = root.join("scripts").is_dir();
    checks.push(json!({
        "name": "scripts_dir",
        "valid": scripts_exists,
        "message": if scripts_exists { "OK" } else { "Missing scripts/ directory" }
    }));

    // Check 4: assets/ directory exists (optional)
    let assets_exists = root.join("assets").is_dir();
    checks.push(json!({
        "name": "assets_dir",
        "valid": true,
        "message": if assets_exists { "OK" } else { "No assets/ directory (optional)" }
    }));

    // --- Check 5+: Modular structural compliance (when enabled) ---
    let raw_structure = project_json_value
        .get("structure")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let modular_enabled = is_modular_structure(&raw_structure);
    let structure = if modular_enabled {
        "modular"
    } else {
        raw_structure.as_str()
    };
    let modular_report = if modular_enabled {
        let modular_checks = crate::taptap::operations::project_validate::run_modular_checks(&root);
        if crate::taptap::operations::project_validate::has_errors(&modular_checks) {
            all_valid = false;
        }
        let surface_checks =
            crate::taptap::operations::project_validate_surfaces::run_surface_checks(&root);
        if crate::taptap::operations::project_validate_surfaces::has_surface_errors(&surface_checks)
        {
            all_valid = false;
        }
        json!({
            "enabled": true,
            "checks": modular_checks,
            "surfaces": {
                "enabled": true,
                "checks": surface_checks
            }
        })
    } else {
        json!({
            "enabled": false,
            "message": "project.json.structure is not modular; structural checks skipped"
        })
    };

    info!(project_root = %root.to_string_lossy(), valid = %all_valid, structure = %structure, "Project validated");

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "valid": all_valid,
            "checks": checks,
            "structure": structure,
            "structure_alias_normalized": modular_enabled && raw_structure != "modular",
            "modular": modular_report,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(if all_valid { 0 } else { 1 }),
        duration_ms: 0,
        log_path: None,
    })
}

/// Return whether a project uses the modular contract.
///
/// Older local projects may still carry a suffixed structure marker. The
/// suffix is metadata history, not a different runtime contract, so the
/// validator must not silently skip structural checks for those projects.
pub(crate) fn is_modular_structure(value: &str) -> bool {
    value == "modular" || value.starts_with("modular-")
}

/// Handle `project.init` — initialize a TapTap project with default config.
///
/// `template` argument controls scaffold generation:
/// - `modular` (default): full modular directory structure with Surface support
/// - `minimal`: only `scripts/main.lua` + `.project/project.json` (legacy)
/// - `empty`: only `.project/project.json` (no scripts/)
pub fn project_init(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, crate::model::ExecuteError> {
    let root = get_project_root(request)?;

    let entry = request
        .arguments
        .get("entry")
        .and_then(|v| v.as_str())
        .unwrap_or("scripts/main.lua");
    let engine_version = request
        .arguments
        .get("engine_version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0.0");
    let template = request
        .arguments
        .get("template")
        .and_then(|v| v.as_str())
        .unwrap_or("modular");
    let project_name = request
        .arguments
        .get("project_name")
        .and_then(|v| v.as_str())
        .unwrap_or("untitled");
    let ui_theme = request
        .arguments
        .get("ui_theme")
        .and_then(|v| v.as_str())
        .unwrap_or("brawlforge");

    // Validate template value
    if !matches!(template, "modular" | "minimal" | "empty") {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": "Invalid template",
                "template": template,
                "valid_templates": ["modular", "minimal", "empty"]
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    // Create .project directory
    let project_dir = root.join(".project");
    std::fs::create_dir_all(&project_dir).map_err(|e| crate::model::ExecuteError::Io(e))?;

    // Determine structure and engine fields based on template
    let (structure, engine) = match template {
        "modular" => ("modular", "taptap"),
        _ => ("", ""),
    };

    // Write project.json
    let mut project_json = json!({
        "entry": entry,
        "engineVersion": engine_version
    });
    if !structure.is_empty() {
        project_json["structure"] = json!(structure);
    }
    if !engine.is_empty() {
        project_json["engine"] = json!(engine);
    }
    std::fs::write(
        project_dir.join("project.json"),
        serde_json::to_string_pretty(&project_json).unwrap(),
    )
    .map_err(|e| crate::model::ExecuteError::Io(e))?;

    // Generate scaffold based on template
    let scaffold_report = match template {
        "modular" => {
            match crate::taptap::operations::project_scaffold::generate_modular_scaffold(
                &root,
                project_name,
                engine_version,
                engine,
            ) {
                Ok(report) => report,
                Err(e) => {
                    return Ok(OperationResult {
                        request_id: request.request_id.clone(),
                        success: false,
                        output: json!({
                            "error": "Scaffold generation failed",
                            "details": e.to_string()
                        }),
                        exit_code: Some(1),
                        duration_ms: 0,
                        log_path: None,
                    });
                }
            }
        }
        "minimal" => {
            // Legacy: only scripts/ + main.lua entry
            let scripts_dir = root.join("scripts");
            std::fs::create_dir_all(&scripts_dir).map_err(|e| crate::model::ExecuteError::Io(e))?;
            let entry_path = root.join(entry);
            if !entry_path.exists() {
                if let Some(parent) = entry_path.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                std::fs::write(&entry_path, "-- main.lua\n-- TapTap project entry point\n")
                    .map_err(|e| crate::model::ExecuteError::Io(e))?;
            }
            json!({"template": "minimal", "created_files": [entry]})
        }
        _ => {
            // empty: no scripts/ created
            json!({"template": "empty"})
        }
    };

    if template == "modular" {
        crate::taptap::operations::ui_theme::write_theme_contract(&root, ui_theme, "project-init")
            .map_err(crate::model::ExecuteError::Io)?;
    }

    info!(project_root = %root.to_string_lossy(), entry = %entry, template = %template, "Project initialized");

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "created": true,
            "project_root": root.to_string_lossy(),
            "entry": entry,
            "engine_version": engine_version,
            "template": template,
            "structure": structure,
            "ui_theme": if template == "modular" { Some(ui_theme) } else { None },
            "scaffold": scaffold_report
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Prepare a project operation — validate arguments and return a plan.
pub fn prepare_project(
    request: &OperationRequest,
) -> Result<OperationPlan, crate::model::PrepareError> {
    let _root = get_project_root(request)
        .map_err(|e| crate::model::PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![
            request
                .arguments
                .get("project_root")
                .and_then(|v| v.as_str())
                .unwrap_or(".")
                .to_string(),
        ],
        effects: vec![],
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(5)).to_rfc3339(),
        effect_digest: "no-effects".to_string(),
    })
}

fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, crate::model::ExecuteError> {
    let root_str = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
        .or_else(|| request.project_root.as_ref().and_then(|p| p.to_str()))
        .ok_or_else(|| {
            crate::model::ExecuteError::NotPrepared("Missing project_root argument".to_string())
        })?;

    let path = std::path::PathBuf::from(root_str);
    if !path.exists() {
        return Err(crate::model::ExecuteError::ExternalToolFailed(format!(
            "Project root does not exist: {}",
            path.display()
        )));
    }

    Ok(Arc::from(path))
}
