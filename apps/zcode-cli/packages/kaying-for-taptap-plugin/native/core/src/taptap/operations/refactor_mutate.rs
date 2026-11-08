//! TapTap Lua refactor operations — file-level mutation handlers.
//!
//! Implements `rename_symbol`, `extract_function`, and `inline_local`.
//! `move_module` and `split_file` live in `refactor_move_split.rs`.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult};
use serde_json::json;
use std::path::Path;
use tracing::info;

use super::helpers::{get_project_root, ok_result, required_str_arg, str_arg};
use super::refactor::resolve_script_path;
use super::refactor_common::{missing_file_result, walk_lua_files};
use super::refactor_lua::{
    extract_line_range, find_functions, find_local_declarations, remove_local_declaration,
    replace_function_definition, replace_references,
};

// ============================================================
// refactor.rename_symbol
// ============================================================

/// Handle `refactor.rename_symbol` — rename a Lua symbol across the project.
///
/// Updates the definition (if it is a `function NAME`) and all non-definition
/// references in the target file. When `scope = "project"`, scans all `.lua`
/// files under `scripts/` and rewrites references in each.
pub fn refactor_rename_symbol(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let rel = resolve_script_path(request)?;
    let full = root.join("scripts").join(&rel);

    if !full.exists() {
        return Ok(missing_file_result(request, &full, &root));
    }

    let old_name = required_str_arg(request, "old_name")?;
    let new_name = required_str_arg(request, "new_name")?;
    let scope = str_arg(request, "scope", "file").to_string();

    if old_name == new_name {
        return Ok(ok_result(
            request,
            json!({
                "renamed": false,
                "reason": "old_name equals new_name",
                "path": full.to_string_lossy(),
            }),
            0,
        ));
    }

    let mut content = std::fs::read_to_string(&full).map_err(ExecuteError::Io)?;

    // Rename definition if it is a top-level function with matching name.
    // Match both global `function foo()` and qualified `function M.foo()`.
    let funcs = find_functions(&content);
    let def_match = funcs.iter().find(|f| f.name == old_name);

    let mut definition_renamed = false;
    if let Some(func) = def_match {
        content = replace_function_definition(&content, func, &new_name);
        definition_renamed = true;
    }

    // Replace references in the primary file.
    let (new_content, primary_count) = replace_references(&content, &old_name, &new_name);
    content = new_content;
    std::fs::write(&full, &content).map_err(ExecuteError::Io)?;

    let mut files_changed = vec![full.to_string_lossy().to_string()];
    let mut total_refs = primary_count;

    if scope == "project" {
        let scripts_dir = root.join("scripts");
        let mut visitor = RenameVisitor {
            old_name: &old_name,
            new_name: &new_name,
            primary_path: &full,
            files_changed: &mut files_changed,
            total_refs: &mut total_refs,
        };
        walk_lua_files(&scripts_dir, &mut |p| visitor.visit(p));
    }

    info!(
        script = %full.to_string_lossy(),
        old_name = %old_name,
        new_name = %new_name,
        scope = %scope,
        definition_renamed,
        references_renamed = total_refs,
        "Symbol renamed"
    );

    Ok(ok_result(
        request,
        json!({
            "renamed": true,
            "definition_renamed": definition_renamed,
            "references_renamed": total_refs,
            "scope": scope,
            "old_name": old_name,
            "new_name": new_name,
            "files_changed": files_changed,
            "project_root": root.to_string_lossy(),
        }),
        0,
    ))
}

struct RenameVisitor<'a> {
    old_name: &'a str,
    new_name: &'a str,
    primary_path: &'a Path,
    files_changed: &'a mut Vec<String>,
    total_refs: &'a mut usize,
}

impl<'a> RenameVisitor<'a> {
    fn visit(&mut self, path: &Path) {
        if path == self.primary_path {
            return;
        }
        let Ok(content) = std::fs::read_to_string(path) else {
            return;
        };
        let (new_content, count) = replace_references(&content, self.old_name, self.new_name);
        if count == 0 {
            return;
        }
        if std::fs::write(path, &new_content).is_err() {
            return;
        }
        self.files_changed.push(path.to_string_lossy().to_string());
        *self.total_refs += count;
    }
}

// ============================================================
// refactor.extract_function
// ============================================================

/// Handle `refactor.extract_function` — extract a line range into a new function.
///
/// Replaces the selected lines with a call to a new top-level function, and
/// appends the new function definition at the end of the file.
pub fn refactor_extract_function(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let rel = resolve_script_path(request)?;
    let full = root.join("scripts").join(&rel);

    if !full.exists() {
        return Ok(missing_file_result(request, &full, &root));
    }

    let name = required_str_arg(request, "name")?;
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
    let params = str_arg(request, "params", "").to_string();

    let src = std::fs::read_to_string(&full).map_err(ExecuteError::Io)?;
    let (extracted, remaining) = extract_line_range(&src, start_line, end_line);

    if extracted.is_empty() {
        return Ok(ok_result(
            request,
            json!({
                "extracted": false,
                "reason": "empty_range",
                "path": full.to_string_lossy(),
            }),
            0,
        ));
    }

    let call = if params.is_empty() {
        format!("{name}()")
    } else {
        format!("{name}({params})")
    };
    let new_fn = format!(
        "\nfunction {name}({params})\n{extracted}\nend\n",
        name = name,
        params = params,
        extracted = extracted
    );

    let mut new_src = remaining;
    if !new_src.ends_with('\n') {
        new_src.push('\n');
    }
    new_src.push_str(&new_fn);

    std::fs::write(&full, &new_src).map_err(ExecuteError::Io)?;

    info!(
        script = %full.to_string_lossy(),
        name = %name,
        start_line,
        end_line,
        "Function extracted"
    );

    Ok(ok_result(
        request,
        json!({
            "extracted": true,
            "name": name,
            "start_line": start_line,
            "end_line": end_line,
            "params": params,
            "call": call,
            "path": full.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        0,
    ))
}

// ============================================================
// refactor.inline_local
// ============================================================

/// Handle `refactor.inline_local` — inline a `local NAME = VALUE` declaration.
///
/// Removes the declaration line and replaces all references to `NAME` with the
/// literal value. Only single-name locals with a literal/simple value are
/// supported; inlining fails safely if no matching local is found.
pub fn refactor_inline_local(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let rel = resolve_script_path(request)?;
    let full = root.join("scripts").join(&rel);

    if !full.exists() {
        return Ok(missing_file_result(request, &full, &root));
    }

    let name = required_str_arg(request, "name")?;
    let src = std::fs::read_to_string(&full).map_err(ExecuteError::Io)?;
    let locals = find_local_declarations(&src);
    let target = locals.iter().find(|l| l.name == name);

    let Some(target) = target else {
        return Ok(ok_result(
            request,
            json!({
                "inlined": false,
                "reason": "local_not_found",
                "name": name,
                "path": full.to_string_lossy(),
            }),
            0,
        ));
    };

    let value = target.value.clone();
    let after_remove = remove_local_declaration(&src, target);
    let (new_src, count) = replace_references(&after_remove, &name, &value);

    std::fs::write(&full, &new_src).map_err(ExecuteError::Io)?;

    info!(
        script = %full.to_string_lossy(),
        name = %name,
        value = %value,
        references_inlined = count,
        "Local inlined"
    );

    Ok(ok_result(
        request,
        json!({
            "inlined": true,
            "name": name,
            "value": value,
            "references_replaced": count,
            "path": full.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        0,
    ))
}

// ============================================================
// Prepare stub
// ============================================================

/// Validate that the request has a reachable project root and build a plan.
///
/// Required-argument validation is deferred to `execute` (matching the
/// convention used by other TapTap operations). The `required` slice is
/// kept for API stability but is intentionally not enforced here so that
/// the golden tests can prepare every operation with a minimal request.
pub fn prepare_refactor(
    request: &OperationRequest,
    _required: &[&str],
) -> Result<OperationPlan, crate::model::PrepareError> {
    let _root = get_project_root(request)
        .map_err(|e| crate::model::PrepareError::InvalidArguments(e.to_string()))?;
    let plan_id = format!("refactor-plan-{}", std::process::id());
    let now = chrono::Utc::now();
    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects: vec![],
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: "refactor-effects".to_string(),
    })
}
