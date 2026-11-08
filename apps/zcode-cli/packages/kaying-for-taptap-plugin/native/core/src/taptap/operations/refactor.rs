//! TapTap Lua refactor operations — read-only symbol analysis.
//!
//! Provides `refactor.analyze`: discovers functions, references, locals, and
//! require() dependencies in a Lua script. Pure read-only — no file mutation.

use crate::model::{ExecuteError, OperationRequest, OperationResult};
use serde_json::json;
use std::path::PathBuf;
use tracing::info;

use super::helpers::{get_project_root, ok_result};
use super::refactor_lua::{
    extract_requires, find_functions, find_local_declarations, find_references, function_to_json,
    reference_to_json,
};

// ============================================================
// refactor.analyze
// ============================================================

/// Handle `refactor.analyze` — analyze a Lua script for refactor opportunities.
///
/// Returns the discovered functions, locals, require dependencies, and (when
/// `symbol` is supplied) all references to that symbol.
///
/// Arguments:
/// - `project_root` (required)
/// - `path` (required): script path relative to project root, e.g. `scripts/systems/event.lua`
/// - `symbol` (optional): when provided, also returns `references` for that name
pub fn refactor_analyze(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let rel = resolve_script_path(request)?;
    let full = root.join("scripts").join(&rel);

    if !full.exists() {
        return Ok(ok_result(
            request,
            json!({
                "analyzed": false,
                "error": "File not found",
                "path": full.to_string_lossy(),
                "project_root": root.to_string_lossy(),
            }),
            0,
        ));
    }

    let content = std::fs::read_to_string(&full).map_err(ExecuteError::Io)?;

    let funcs: Vec<serde_json::Value> = find_functions(&content)
        .iter()
        .map(function_to_json)
        .collect();
    let locals: Vec<serde_json::Value> = find_local_declarations(&content)
        .iter()
        .map(|l| {
            json!({
                "name": l.name,
                "value": l.value,
                "start_line": l.start_line,
                "end_line": l.end_line,
            })
        })
        .collect();
    let requires: Vec<serde_json::Value> = extract_requires(&content)
        .iter()
        .map(|r| json!({ "path": r.path, "line": r.line }))
        .collect();

    let symbol = request
        .arguments
        .get("symbol")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let references = if let Some(ref sym) = symbol {
        find_references(&content, sym)
            .iter()
            .map(reference_to_json)
            .collect()
    } else {
        Vec::new()
    };

    info!(
        script = %full.to_string_lossy(),
        functions = funcs.len(),
        locals = locals.len(),
        requires = requires.len(),
        symbol = %symbol.as_deref().unwrap_or(""),
        "Refactor analyze complete"
    );

    Ok(ok_result(
        request,
        json!({
            "analyzed": true,
            "path": full.to_string_lossy(),
            "project_root": root.to_string_lossy(),
            "line_count": content.lines().count(),
            "functions": funcs,
            "locals": locals,
            "requires": requires,
            "symbol": symbol,
            "references": references,
        }),
        0,
    ))
}

// ============================================================
// Shared path resolution helpers
// ============================================================

/// Resolve the script `path` argument, stripping a leading `scripts/` if the
/// caller passed the full path. Returns the relative path inside the project.
pub(crate) fn resolve_script_path(request: &OperationRequest) -> Result<PathBuf, ExecuteError> {
    let rel = request
        .arguments
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'path' argument".to_string()))?;

    let normalized = rel
        .strip_prefix("scripts/")
        .or_else(|| rel.strip_prefix("scripts\\"))
        .unwrap_or(rel);

    Ok(PathBuf::from(normalized))
}
