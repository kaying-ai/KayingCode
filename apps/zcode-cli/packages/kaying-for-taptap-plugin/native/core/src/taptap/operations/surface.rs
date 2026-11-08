//! `surface.*` operations — Surface 场景化独立维护（Stage I, I2）。
//!
//! Implements create/list/get/switch/sync/delete/add_transition. All read
//! `.project/surfaces.json` as the single source of truth, falling back to
//! directory scanning when the manifest is absent.

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::info;

use super::helpers::{get_project_root, ok_result};
use super::surface_manifest::{
    DEFAULT_ENGINE, active_surface, add_transition as manifest_add_transition,
    build_manifest_from_dirs, get_surface, list_manifest_ids, read_manifest, read_manifest_opt,
    remove_surface, scan_surface_dirs, set_active, surfaces_array, upsert_surface, write_manifest,
};
use super::surface_template::{
    create_surface_skeleton, is_valid_template, surface_entry, template_ids,
};

static SURFACE_PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

// ============================================================
// Prepare
// ============================================================

/// Prepare a surface operation — validate project root and return a plan.
pub fn prepare_surface(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;
    let effects = match request.operation_id.as_str() {
        "surface.create" | "surface.switch" | "surface.delete" | "surface.add_transition" => {
            vec![Effect::ReadProject, Effect::WriteProject]
        }
        _ => vec![Effect::ReadProject],
    };
    let plan_id = format!(
        "plan-surface-{}",
        SURFACE_PLAN_COUNTER.fetch_add(1, Ordering::SeqCst)
    );
    let now = chrono::Utc::now();
    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: format!("surface-{}", request.operation_id),
    })
}

// ============================================================
// surface.list
// ============================================================

/// Handle `surface.list` — list all Surfaces (manifest first, dir fallback).
pub fn surface_list(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let manifest = read_manifest(&root);
    let surfaces = if surfaces_array(&manifest).is_empty() {
        surfaces_array(&build_manifest_from_dirs(&root, DEFAULT_ENGINE))
    } else {
        surfaces_array(&manifest)
    };
    let active = active_surface(&manifest);
    info!(project_root = %root.to_string_lossy(), count = surfaces.len(), "Surfaces listed");
    Ok(ok_result(
        request,
        json!({
            "surfaces": surfaces,
            "active": active,
            "count": surfaces.len(),
            "source": if read_manifest_opt(&root).is_some() { "manifest" } else { "directory-scan" }
        }),
        0,
    ))
}

// ============================================================
// surface.get
// ============================================================

/// Handle `surface.get` — return a single Surface detail (id required).
pub fn surface_get(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let id = required_id(request)?;
    let manifest = read_manifest(&root);
    let entry = get_surface(&manifest, &id);
    let Some(entry) = entry else {
        return Ok(ok_result(
            request,
            json!({
                "error": format!("Surface '{id}' not found"),
                "id": id,
                "known": list_manifest_ids(&manifest)
            }),
            0,
        ));
    };
    // Include source files if the module directory exists.
    let module = entry
        .get("module")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("scripts/ui/surfaces/{id}"));
    let source = read_surface_sources(&root, &module);
    Ok(ok_result(
        request,
        json!({
            "surface": entry,
            "active": active_surface(&manifest) == Some(id.clone()),
            "source": source
        }),
        0,
    ))
}

// ============================================================
// surface.create
// ============================================================

/// Handle `surface.create` — scaffold a Surface dir + register in manifest.
pub fn surface_create(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let id = required_id(request)?;
    let template = request
        .arguments
        .get("template")
        .and_then(|v| v.as_str())
        .unwrap_or("blank")
        .to_string();
    let make_default = request
        .arguments
        .get("default")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !is_valid_template(&template) {
        return Ok(ok_result(
            request,
            json!({
                "error": "Invalid template",
                "template": template,
                "valid_templates": template_ids()
            }),
            0,
        ));
    }

    let manifest = read_manifest(&root);
    if get_surface(&manifest, &id).is_some() {
        return Ok(ok_result(
            request,
            json!({
                "created": false,
                "error": format!("Surface '{id}' already exists"),
                "id": id
            }),
            0,
        ));
    }

    let module = create_surface_skeleton(&root, &id, &template).map_err(|e| ExecuteError::Io(e))?;

    // First surface becomes default if none requested explicitly.
    let is_first = surfaces_array(&manifest).is_empty();
    let default = make_default || (is_first && active_surface(&manifest).is_none());
    let entry = surface_entry(&id, &template, default);
    let mut updated = upsert_surface(&manifest, entry);
    if default || is_first {
        updated = set_active(&updated, &id);
    }
    write_manifest(&root, &updated).map_err(|e| ExecuteError::Io(e))?;

    info!(project_root = %root.to_string_lossy(), id = %id, template = %template, "Surface created");
    Ok(ok_result(
        request,
        json!({
            "created": true,
            "id": id,
            "template": template,
            "module": module,
            "default": default,
            "surfaces": surfaces_array(&updated)
        }),
        0,
    ))
}

// ============================================================
// surface.switch
// ============================================================

/// Handle `surface.switch` — set the active Surface in the manifest.
pub fn surface_switch(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let id = required_id(request)?;
    let mut manifest = read_manifest(&root);
    if get_surface(&manifest, &id).is_none() {
        return Ok(ok_result(
            request,
            json!({
                "error": format!("Surface '{id}' not found"),
                "id": id
            }),
            0,
        ));
    }
    manifest = set_active(&manifest, &id);
    write_manifest(&root, &manifest).map_err(|e| ExecuteError::Io(e))?;
    Ok(ok_result(
        request,
        json!({
            "switched": true,
            "active": id,
            "surfaces": surfaces_array(&manifest)
        }),
        0,
    ))
}

// ============================================================
// surface.sync
// ============================================================

/// Handle `surface.sync` — reconcile manifest vs directories, report drift.
pub fn surface_sync(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let manifest = read_manifest(&root);
    let dir_ids = scan_surface_dirs(&root);
    let manifest_ids = list_manifest_ids(&manifest);

    let in_dir_not_manifest: Vec<String> = dir_ids
        .iter()
        .filter(|d| !manifest_ids.contains(d))
        .cloned()
        .collect();
    let in_manifest_not_dir: Vec<String> = manifest_ids
        .iter()
        .filter(|m| !dir_ids.contains(m))
        .cloned()
        .collect();

    Ok(ok_result(
        request,
        json!({
            "in_sync": in_dir_not_manifest.is_empty() && in_manifest_not_dir.is_empty(),
            "dir_surfaces": dir_ids,
            "manifest_surfaces": manifest_ids,
            "in_dir_not_manifest": in_dir_not_manifest,
            "in_manifest_not_dir": in_manifest_not_dir
        }),
        0,
    ))
}

// ============================================================
// surface.delete
// ============================================================

/// Handle `surface.delete` — remove Surface dir + manifest entry (backup).
pub fn surface_delete(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let id = required_id(request)?;
    let mut manifest = read_manifest(&root);
    if get_surface(&manifest, &id).is_none() {
        return Ok(ok_result(
            request,
            json!({
                "error": format!("Surface '{id}' not found"),
                "id": id
            }),
            0,
        ));
    }

    // Backup the module dir to .project/backups/surfaces/<ts>-<id>/.
    let module_dir = root.join(format!("scripts/ui/surfaces/{id}"));
    if module_dir.is_dir() {
        backup_surface_dir(&root, &id, &module_dir).map_err(|e| ExecuteError::Io(e))?;
        fs::remove_dir_all(&module_dir).map_err(|e| ExecuteError::Io(e))?;
    }

    manifest = remove_surface(&manifest, &id);
    write_manifest(&root, &manifest).map_err(|e| ExecuteError::Io(e))?;
    Ok(ok_result(
        request,
        json!({
            "deleted": true,
            "id": id,
            "active": active_surface(&manifest),
            "surfaces": surfaces_array(&manifest)
        }),
        0,
    ))
}

// ============================================================
// surface.add_transition
// ============================================================

/// Handle `surface.add_transition` — declare a Surface->Surface transition.
pub fn surface_add_transition(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let from = required_id(request)?;
    let to = request
        .arguments
        .get("to")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing required argument: to".to_string()))?
        .to_string();
    let event = request
        .arguments
        .get("event")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing required argument: event".to_string()))?
        .to_string();

    let manifest = read_manifest(&root);
    match manifest_add_transition(&manifest, &from, &to, &event) {
        Ok(updated) => {
            write_manifest(&root, &updated).map_err(|e| ExecuteError::Io(e))?;
            Ok(ok_result(
                request,
                json!({
                    "added": true,
                    "from": from,
                    "to": to,
                    "event": event,
                    "surfaces": surfaces_array(&updated)
                }),
                0,
            ))
        }
        Err(e) => Ok(ok_result(
            request,
            json!({ "error": e, "from": from, "to": to, "event": event }),
            0,
        )),
    }
}

// ============================================================
// Helpers
// ============================================================

fn required_id(request: &OperationRequest) -> Result<String, ExecuteError> {
    request
        .arguments
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing required argument: id".to_string()))
}

fn backup_surface_dir(root: &Path, id: &str, dir: &Path) -> Result<(), std::io::Error> {
    let ts = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let dest = root.join(format!(".project/backups/surfaces/{ts}-{id}"));
    copy_dir_recursive(dir, &dest)
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let target = dest.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            fs::copy(&path, &target)?;
        }
    }
    Ok(())
}

fn read_surface_sources(root: &Path, module: &str) -> serde_json::Value {
    let dir = root.join(module);
    if !dir.is_dir() {
        return json!({ "module": module, "files": [] });
    }
    let mut files = Vec::new();
    for name in ["init.lua", "view.lua", "state.lua", "style.lua"] {
        let path = dir.join(name);
        if path.exists() {
            let content = fs::read_to_string(&path).unwrap_or_default();
            files.push(json!({ "file": format!("{module}/{name}"), "lines": content.lines().count(), "preview": first_lines(&content, 8) }));
        }
    }
    json!({ "module": module, "files": files })
}

fn first_lines(content: &str, n: usize) -> String {
    content.lines().take(n).collect::<Vec<_>>().join("\n")
}

// ============================================================
// Tests
// ============================================================

// Test module lives in surface_tests.rs (extracted to keep this file under
// the 500-line limit). `#[path]` keeps it a child module so `super::*`
// still reaches the private fns and helpers above.
#[cfg(test)]
#[path = "surface_tests.rs"]
mod tests;
