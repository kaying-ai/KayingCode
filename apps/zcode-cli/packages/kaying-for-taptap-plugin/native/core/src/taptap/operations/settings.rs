//! TapTap project settings operations — get and set project settings
//! from `.project/project.json`.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Handle `settings.get` — get one or all project settings from .project/project.json.
///
/// If `key` is provided (dot notation, e.g. "engineVersion" or "entry"), returns
/// just that key's value. If omitted, returns all settings.
pub fn settings_get(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
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

    let content = std::fs::read_to_string(&project_json_path).map_err(ExecuteError::Io)?;
    let settings: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();

    let key = request
        .arguments
        .get("key")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let output = if let Some(ref key) = key {
        let value = resolve_dot_notation(&settings, key);
        json!({
            "key": key,
            "value": value,
            "project_root": root.to_string_lossy()
        })
    } else {
        json!({
            "settings": settings,
            "project_root": root.to_string_lossy()
        })
    };

    info!(
        project_root = %root.to_string_lossy(),
        key = %key.as_deref().unwrap_or("*"),
        "Settings retrieved"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output,
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `settings.set` — set one or more project settings in .project/project.json.
///
/// Takes a `settings` object parameter with key-value pairs to merge into the
/// existing project.json. Creates the file with default values if it does not exist.
pub fn settings_set(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;

    let new_settings = request
        .arguments
        .get("settings")
        .and_then(|v| v.as_object())
        .ok_or_else(|| {
            ExecuteError::NotPrepared(
                "Missing or invalid 'settings' argument: expected an object".to_string(),
            )
        })?;

    // Load existing project.json, or start with empty defaults
    let project_json_path = root.join(".project").join("project.json");
    let mut current: serde_json::Value = if project_json_path.exists() {
        let content = std::fs::read_to_string(&project_json_path).map_err(ExecuteError::Io)?;
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        // Ensure .project directory exists
        std::fs::create_dir_all(root.join(".project")).map_err(ExecuteError::Io)?;
        json!({
            "entry": "scripts/main.lua",
            "engineVersion": "1.0.0"
        })
    };

    // Merge provided settings into current
    if let Some(obj) = current.as_object_mut() {
        for (k, v) in new_settings {
            obj.insert(k.clone(), v.clone());
        }
    }

    // Write back
    let pretty = serde_json::to_string_pretty(&current).map_err(|e| {
        ExecuteError::ExternalToolFailed(format!("Failed to serialize settings: {e}"))
    })?;
    std::fs::write(&project_json_path, pretty).map_err(ExecuteError::Io)?;

    info!(
        project_root = %root.to_string_lossy(),
        keys = ?new_settings.keys().collect::<Vec<_>>(),
        "Settings updated"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "set": true,
            "updated": true,
            "settings": current,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Prepare a settings operation — validate arguments and return a plan.
pub fn prepare_settings(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

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

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/// Resolve a dot-notation key against a JSON value.
///
/// Supports simple dotted paths like `"engineVersion"` or `"a.b.c"`.
/// Returns `serde_json::Value::Null` for any unresolvable path segment.
fn resolve_dot_notation<'a>(value: &'a serde_json::Value, key: &str) -> &'a serde_json::Value {
    let parts: Vec<&str> = key.split('.').collect();
    let mut current = value;
    for part in parts {
        match current {
            serde_json::Value::Object(map) => {
                current = map.get(part).unwrap_or(&serde_json::Value::Null);
            }
            _ => return &serde_json::Value::Null,
        }
    }
    current
}

fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, ExecuteError> {
    let root_str = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
        .or_else(|| request.project_root.as_ref().and_then(|p| p.to_str()))
        .ok_or_else(|| ExecuteError::NotPrepared("Missing project_root argument".to_string()))?;

    let path = std::path::PathBuf::from(root_str);
    if !path.exists() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Project root does not exist: {}",
            path.display()
        )));
    }

    Ok(Arc::from(path))
}
