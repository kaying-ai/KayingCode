//! TapTap Lua refactor operations — `move_module` and `split_file`.
//!
//! These handlers restructure the file layout: they move or extract Lua
//! scripts and rewrite `require "..."` paths across the project.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult};
use serde_json::json;
use std::path::PathBuf;
use tracing::info;

use super::helpers::{get_project_root, ok_result, required_str_arg};
use super::refactor::resolve_script_path;
use super::refactor_common::{
    find_first_code_line, missing_file_result, require_path_from_rel, strip_scripts_prefix,
    walk_lua_files,
};
use super::refactor_lua::extract_line_range;

// ============================================================
// refactor.move_module
// ============================================================

/// Handle `refactor.move_module` — move a Lua module file and rewrite require() paths.
///
/// Moves `scripts/<old_path>.lua` to `scripts/<new_path>.lua`, then scans every
/// `.lua` file under `scripts/` and rewrites `require "<old>"` to `require "<new>"`.
pub fn refactor_move_module(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let old_rel = strip_scripts_prefix(&required_str_arg(request, "old_path")?);
    let new_rel = strip_scripts_prefix(&required_str_arg(request, "new_path")?);

    let old_full = root.join("scripts").join(&old_rel);
    let new_full = root.join("scripts").join(&new_rel);

    if !old_full.exists() {
        return Ok(missing_file_result(request, &old_full, &root));
    }
    if new_full.exists() {
        return Ok(ok_result(
            request,
            json!({
                "moved": false,
                "reason": "target_exists",
                "old_path": old_full.to_string_lossy(),
                "new_path": new_full.to_string_lossy(),
            }),
            0,
        ));
    }

    if let Some(parent) = new_full.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    std::fs::rename(&old_full, &new_full).map_err(ExecuteError::Io)?;

    let old_require = require_path_from_rel(&old_rel);
    let new_require = require_path_from_rel(&new_rel);

    let mut files_updated = 0usize;
    let mut total_replacements = 0usize;
    let scripts_dir = root.join("scripts");
    let mut visitor = MoveRewriteVisitor {
        old: &old_require,
        new: &new_require,
        files_updated: &mut files_updated,
        total: &mut total_replacements,
    };
    walk_lua_files(&scripts_dir, &mut |p| visitor.visit(p));

    info!(
        old_path = %old_full.to_string_lossy(),
        new_path = %new_full.to_string_lossy(),
        files_updated,
        replacements = total_replacements,
        "Module moved"
    );

    Ok(ok_result(
        request,
        json!({
            "moved": true,
            "old_path": old_full.to_string_lossy(),
            "new_path": new_full.to_string_lossy(),
            "old_require": old_require,
            "new_require": new_require,
            "files_updated": files_updated,
            "require_replacements": total_replacements,
            "project_root": root.to_string_lossy(),
        }),
        0,
    ))
}

struct MoveRewriteVisitor<'a> {
    old: &'a str,
    new: &'a str,
    files_updated: &'a mut usize,
    total: &'a mut usize,
}

impl<'a> MoveRewriteVisitor<'a> {
    fn visit(&mut self, path: &std::path::Path) {
        let Ok(content) = std::fs::read_to_string(path) else {
            return;
        };
        let (new_content, count) =
            super::refactor_lua::replace_require_path(&content, self.old, self.new);
        if count == 0 {
            return;
        }
        if std::fs::write(path, &new_content).is_err() {
            return;
        }
        *self.files_updated += 1;
        *self.total += count;
    }
}

// ============================================================
// refactor.split_file
// ============================================================

/// Handle `refactor.split_file` — split a large script into a new module.
///
/// Extracts a contiguous line range into a new file under `scripts/<target_path>`
/// and rewrites the source file to require the new module in place of the
/// extracted lines.
pub fn refactor_split_file(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let rel = resolve_script_path(request)?;
    let full = root.join("scripts").join(&rel);

    if !full.exists() {
        return Ok(missing_file_result(request, &full, &root));
    }

    let target_path = required_str_arg(request, "target_path")?;
    let start_line = request
        .arguments
        .get("start_line")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'start_line' argument".to_string()))?
        as usize;
    let end_line = request
        .arguments
        .get("end_line")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'end_line' argument".to_string()))?
        as usize;

    let target_rel = strip_scripts_prefix(&target_path);
    let target_full = root.join("scripts").join(&target_rel);

    let src = std::fs::read_to_string(&full).map_err(ExecuteError::Io)?;
    let (extracted, remaining) = extract_line_range(&src, start_line, end_line);

    if extracted.is_empty() {
        return Ok(ok_result(
            request,
            json!({
                "split": false,
                "reason": "empty_range",
                "path": full.to_string_lossy(),
            }),
            0,
        ));
    }

    if let Some(parent) = target_full.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }

    let module_name = request
        .arguments
        .get("module_name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            PathBuf::from(&target_rel)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("module")
                .to_string()
        });

    let module_body = format!(
        "local {module_name} = {{}}\n\n{extracted}\n\nreturn {module_name}\n",
        module_name = module_name,
        extracted = extracted
    );
    std::fs::write(&target_full, &module_body).map_err(ExecuteError::Io)?;

    let require_path = require_path_from_rel(&target_rel);
    let require_call = format!("local {module_name} = require \"{require_path}\"");

    let mut new_src = String::with_capacity(remaining.len() + require_call.len() + 2);
    let insert_pos = find_first_code_line(&remaining);
    new_src.push_str(&remaining[..insert_pos]);
    new_src.push_str(&require_call);
    new_src.push('\n');
    new_src.push_str(&remaining[insert_pos..]);
    if !new_src.ends_with('\n') {
        new_src.push('\n');
    }

    std::fs::write(&full, &new_src).map_err(ExecuteError::Io)?;

    info!(
        source = %full.to_string_lossy(),
        target = %target_full.to_string_lossy(),
        start_line,
        end_line,
        "File split"
    );

    Ok(ok_result(
        request,
        json!({
            "split": true,
            "source_path": full.to_string_lossy(),
            "target_path": target_full.to_string_lossy(),
            "module_name": module_name,
            "require_path": require_path,
            "require_call": require_call,
            "start_line": start_line,
            "end_line": end_line,
            "project_root": root.to_string_lossy(),
        }),
        0,
    ))
}
