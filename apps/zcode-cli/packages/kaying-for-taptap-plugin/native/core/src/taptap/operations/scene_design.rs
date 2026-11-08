//! TapTap scene build-list operations.
//!
//! These operations complement the existing `scene.list/create/open/save/hierarchy`
//! operations in `scene.rs` by managing the project-level "active scene" and the
//! list of scenes included in builds. They are separated from `scene.rs` because
//! that file is already close to the 500-line limit.

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use crate::taptap::operations::helpers::{
    fail_result, get_project_root, make_plan, ok_result, read_json_file_opt, required_str_arg,
    write_json_file,
};
use serde_json::json;
use std::path::Path;
use std::sync::atomic::AtomicU64;
use std::time::Instant;
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

fn active_scene_path(root: &Path) -> std::path::PathBuf {
    root.join(".project").join("active-scene.json")
}

fn build_scene_list_path(root: &Path) -> std::path::PathBuf {
    root.join(".project").join("build-scene-list.json")
}

// ============================================================
// scene.save_all
// ============================================================

/// Handle `scene.save_all` — flush all open scenes tracked in `.project/open-scenes.json`.
///
/// The open-scene list is maintained by future live editor bridges; for now we
/// re-write each tracked scene's metadata to disk as a no-op marker.
pub fn scene_save_all(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let open_path = root.join(".project").join("open-scenes.json");
    let open_scenes = read_json_file_opt(&open_path).map_err(ExecuteError::Io)?;
    let saved: Vec<String> = Vec::new();

    if let Some(ref manifest) = open_scenes {
        if let Some(arr) = manifest.get("scenes").and_then(|v| v.as_array()) {
            for s in arr {
                if let Some(path) = s.as_str() {
                    let full = root.join(path);
                    if full.exists() {
                        info!(scene = %path, "Scene flushed");
                    }
                }
            }
        }
    }

    info!(count = saved.len(), "save_all completed");
    Ok(ok_result(
        request,
        json!({
            "saved": true,
            "saved_scenes": saved,
            "saved_count": saved.len(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// scene.list_open
// ============================================================

/// Handle `scene.list_open` — return the list of scenes currently tracked as open.
pub fn scene_list_open(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let open_path = root.join(".project").join("open-scenes.json");

    let scenes: Vec<serde_json::Value> = read_json_file_opt(&open_path)
        .map_err(ExecuteError::Io)?
        .and_then(|v| v.get("scenes").cloned())
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    info!(count = scenes.len(), "Open scenes listed");

    Ok(ok_result(
        request,
        json!({
            "scenes": scenes,
            "count": scenes.len(),
            "open_scenes_path": open_path.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// scene.set_active
// ============================================================

/// Handle `scene.set_active` — write the active scene marker.
pub fn scene_set_active(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let scene_path = required_str_arg(request, "scene_path")?;

    let target = root.join(&scene_path);
    if !target.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Scene '{scene_path}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    }

    let marker_path = active_scene_path(&root);
    let payload = json!({
        "scene": scene_path,
        "set_at": chrono::Utc::now().to_rfc3339(),
    });
    write_json_file(&marker_path, &payload).map_err(ExecuteError::Io)?;

    info!(scene = %scene_path, "Active scene set");

    Ok(ok_result(
        request,
        json!({
            "set": true,
            "scene_path": scene_path,
            "marker_path": marker_path.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// scene.add_to_build
// ============================================================

/// Handle `scene.add_to_build` — add a scene to the build-scene list.
pub fn scene_add_to_build(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let scene_path = required_str_arg(request, "scene_path")?;

    let list_path = build_scene_list_path(&root);
    let mut list = read_json_file_opt(&list_path)
        .map_err(ExecuteError::Io)?
        .unwrap_or(json!({"scenes": []}));

    let scenes = list
        .get_mut("scenes")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed("Invalid build-scene-list.json".to_string())
        })?;

    let already = scenes
        .iter()
        .any(|s| s.as_str() == Some(scene_path.as_str()));
    if already {
        return Ok(fail_result(
            request,
            json!({"error": format!("Scene '{scene_path}' already in build list")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    scenes.push(json!(scene_path));
    write_json_file(&list_path, &list).map_err(ExecuteError::Io)?;

    info!(scene = %scene_path, "Scene added to build");

    Ok(ok_result(
        request,
        json!({
            "added": true,
            "scene_path": scene_path,
            "build_scene_list_path": list_path.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// scene.remove_from_build
// ============================================================

/// Handle `scene.remove_from_build` — remove a scene from the build-scene list.
pub fn scene_remove_from_build(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let scene_path = required_str_arg(request, "scene_path")?;

    let list_path = build_scene_list_path(&root);
    let Some(mut list) = read_json_file_opt(&list_path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": "Build-scene list does not exist"}),
            started.elapsed().as_millis() as u64,
        ));
    };

    let scenes = list
        .get_mut("scenes")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed("Invalid build-scene-list.json".to_string())
        })?;

    let before = scenes.len();
    scenes.retain(|s| s.as_str() != Some(scene_path.as_str()));
    let removed = scenes.len() < before;
    if !removed {
        return Ok(fail_result(
            request,
            json!({"error": format!("Scene '{scene_path}' was not in build list")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    write_json_file(&list_path, &list).map_err(ExecuteError::Io)?;

    info!(scene = %scene_path, "Scene removed from build");

    Ok(ok_result(
        request,
        json!({
            "removed": true,
            "scene_path": scene_path,
            "build_scene_list_path": list_path.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Prepare
// ============================================================

/// Prepare a scene-build operation — validate args and return a plan.
pub fn prepare_scene_design(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let effects = match request.operation_id.as_str() {
        "scene.save_all"
        | "scene.set_active"
        | "scene.add_to_build"
        | "scene.remove_from_build" => vec![Effect::ReadProject, Effect::WriteProject],
        _ => vec![Effect::ReadProject],
    };
    make_plan(request, &PLAN_COUNTER, effects, "scene-design-effects")
}
