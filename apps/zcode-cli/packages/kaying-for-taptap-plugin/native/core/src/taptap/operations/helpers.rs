//! Shared helpers for TapTap operations.
//!
//! Provides common utilities used across multiple operation modules:
//! project root resolution, plan construction, and JSON file I/O.

use crate::model::{Effect, ExecuteError, OperationPlan, OperationRequest, PrepareError};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

/// Resolve the project root from `request.project_root` or the `project_root` argument.
///
/// Returns an error if the project root is missing or does not exist on disk.
pub fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, ExecuteError> {
    let root_str = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
        .or_else(|| request.project_root.as_ref().and_then(|p| p.to_str()))
        .ok_or_else(|| ExecuteError::NotPrepared("Missing project_root argument".to_string()))?;

    let path = PathBuf::from(root_str);
    if !path.exists() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Project root does not exist: {}",
            path.display()
        )));
    }

    Ok(Arc::from(path))
}

/// Build a generic `OperationPlan` for the given request.
///
/// `effect_digest` should be a short stable label (e.g. `"prefab-effects"`)
/// used to deduplicate plans with identical effects.
pub fn make_plan(
    request: &OperationRequest,
    counter: &AtomicU64,
    effects: Vec<Effect>,
    effect_digest: &str,
) -> Result<OperationPlan, PrepareError> {
    // Validate project root is reachable.
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", counter.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: effect_digest.to_string(),
    })
}

/// Read a JSON file, returning `None` if the file does not exist.
///
/// Returns an error for malformed JSON or other I/O failures.
pub fn read_json_file_opt(path: &Path) -> Result<Option<serde_json::Value>, std::io::Error> {
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(path)?;
    let value = serde_json::from_str(&content)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(Some(value))
}

/// Write a JSON value to a file, creating parent directories as needed.
pub fn write_json_file(path: &Path, value: &serde_json::Value) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let body = serde_json::to_string_pretty(value)?;
    std::fs::write(path, body)
}

/// Ensure a directory exists, creating it (and parents) if necessary.
pub fn ensure_dir(path: &Path) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(path)
}

/// Format a string argument from the request, falling back to `default`.
pub fn str_arg<'a>(request: &'a OperationRequest, key: &str, default: &'a str) -> &'a str {
    request
        .arguments
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or(default)
}

/// Read an optional string argument from the request.
pub fn opt_str_arg(request: &OperationRequest, key: &str) -> Option<String> {
    request
        .arguments
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Read a required string argument from the request, erroring if missing.
pub fn required_str_arg(request: &OperationRequest, key: &str) -> Result<String, ExecuteError> {
    opt_str_arg(request, key)
        .ok_or_else(|| ExecuteError::NotPrepared(format!("Missing required argument: {key}")))
}

/// Read an optional object argument from the request.
pub fn opt_object_arg(request: &OperationRequest, key: &str) -> Option<serde_json::Value> {
    request.arguments.get(key).cloned()
}

/// Count lines in a string (used by file-bloat checks).
pub fn line_count(s: &str) -> usize {
    if s.is_empty() {
        return 0;
    }
    s.lines().count()
}

/// Build a standard success `OperationResult`.
pub fn ok_result(
    request: &OperationRequest,
    output: serde_json::Value,
    duration_ms: u64,
) -> crate::model::OperationResult {
    crate::model::OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output,
        exit_code: Some(0),
        duration_ms,
        log_path: None,
    }
}

/// Build a standard failure `OperationResult` (exit_code=1).
pub fn fail_result(
    request: &OperationRequest,
    output: serde_json::Value,
    duration_ms: u64,
) -> crate::model::OperationResult {
    crate::model::OperationResult {
        request_id: request.request_id.clone(),
        success: false,
        output,
        exit_code: Some(1),
        duration_ms,
        log_path: None,
    }
}
