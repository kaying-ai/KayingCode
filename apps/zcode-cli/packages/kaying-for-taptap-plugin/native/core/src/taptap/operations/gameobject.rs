//! TapTap game object (UrhoX node) operations — create, list, transform, reparent, delete.
//!
//! These operations manage UrhoX scene nodes. When the UrhoX Runtime tool-mode is not
//! available (e.g., on macOS), they operate on scene XML files directly (file-level
//! manipulation).

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::info;

use super::{gameobject_xml, scene};

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

// ============================================================
// gameobject.create
// ============================================================

/// Handle `gameobject.create` — create a new node in a scene.
pub fn gameobject_create(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = scene::get_project_root(request)?;
    let scene_path = resolve_scene_path(request, &root)?;
    let name = request
        .arguments
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'name' argument".to_string()))?;
    let parent_id = request
        .arguments
        .get("parent_id")
        .and_then(|v| v.as_str())
        .unwrap_or("1");

    let (full_path, content) = read_scene_file(request, &root, &scene_path)?;
    let next_id = gameobject_xml::get_next_node_id(&content);

    let new_node = format!(
        "    <node id=\"{}\" name=\"{}\" />\n",
        next_id,
        escape_xml(name)
    );

    let insert_pos =
        gameobject_xml::find_parent_close_pos(&content, parent_id).ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!(
                "Parent node '{}' not found in scene",
                parent_id
            ))
        })?;

    let new_content = format!(
        "{}{}{}",
        &content[..insert_pos],
        new_node,
        &content[insert_pos..]
    );
    std::fs::write(&full_path, &new_content).map_err(ExecuteError::Io)?;

    info!(
        scene = %scene_path.to_string_lossy(),
        node_id = %next_id,
        name = %name,
        parent_id = %parent_id,
        "Game object created"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "created": true,
            "node_id": next_id,
            "name": name,
            "parent_id": parent_id,
            "path": full_path.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// gameobject.list
// ============================================================

/// Handle `gameobject.list` — list all nodes in a scene with their hierarchy.
///
/// Returns a full node tree including position, rotation, scale, components, and children.
pub fn gameobject_list(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = scene::get_project_root(request)?;
    let scene_path = resolve_scene_path(request, &root)?;
    let (full_path, content) = read_scene_file(request, &root, &scene_path)?;
    let hierarchy = gameobject_xml::parse_node_hierarchy(&content);

    info!(
        scene = %scene_path.to_string_lossy(),
        node_count = ?hierarchy.as_ref().map(|h| h.get("node_count")),
        "Game object list retrieved"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "path": full_path.to_string_lossy(),
            "hierarchy": hierarchy,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// gameobject.set_transform
// ============================================================

/// Handle `gameobject.set_transform` — set position/rotation/scale of a node.
pub fn gameobject_set_transform(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = scene::get_project_root(request)?;
    let scene_path = resolve_scene_path(request, &root)?;
    let node_id = request
        .arguments
        .get("node_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'node_id' argument".to_string()))?;

    let (full_path, content) = read_scene_file(request, &root, &scene_path)?;

    let mut transform_attrs: Vec<(&str, String)> = Vec::new();

    if let Some(pos) = request.arguments.get("position").and_then(|v| v.as_array()) {
        let val = pos
            .iter()
            .filter_map(|v| v.as_f64())
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(" ");
        transform_attrs.push(("position", val));
    }
    if let Some(rot) = request.arguments.get("rotation").and_then(|v| v.as_array()) {
        let val = rot
            .iter()
            .filter_map(|v| v.as_f64())
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(" ");
        transform_attrs.push(("rotation", val));
    }
    if let Some(scale) = request.arguments.get("scale").and_then(|v| v.as_array()) {
        let val = scale
            .iter()
            .filter_map(|v| v.as_f64())
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(" ");
        transform_attrs.push(("scale", val));
    }

    if transform_attrs.is_empty() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": "No transform attributes provided (position, rotation, or scale)",
                "path": full_path.to_string_lossy(),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    let new_content = gameobject_xml::set_node_attributes(&content, node_id, &transform_attrs)
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!("Node '{}' not found in scene", node_id))
        })?;

    std::fs::write(&full_path, &new_content).map_err(ExecuteError::Io)?;

    info!(
        scene = %scene_path.to_string_lossy(),
        node_id = %node_id,
        "Game object transform updated"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "updated": true,
            "node_id": node_id,
            "path": full_path.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// gameobject.set_parent
// ============================================================

/// Handle `gameobject.set_parent` — reparent a node to a new parent.
pub fn gameobject_set_parent(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = scene::get_project_root(request)?;
    let scene_path = resolve_scene_path(request, &root)?;
    let node_id = request
        .arguments
        .get("node_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'node_id' argument".to_string()))?;
    let new_parent_id = request
        .arguments
        .get("new_parent_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'new_parent_id' argument".to_string()))?;

    let (full_path, content) = read_scene_file(request, &root, &scene_path)?;

    let (src_start, src_end) = gameobject_xml::find_node_element_bounds(&content, node_id)
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!("Node '{}' not found in scene", node_id))
        })?;

    if node_id == new_parent_id {
        return Ok(scene_not_found_result(
            &request.request_id,
            &full_path,
            "Cannot reparent a node to itself",
        ));
    }

    if gameobject_xml::is_descendant(&content, new_parent_id, src_start, src_end) {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": "Cannot reparent: new parent is a descendant of the source node",
                "node_id": node_id,
                "new_parent_id": new_parent_id,
                "path": full_path.to_string_lossy(),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    let node_element = &content[src_start..src_end];

    let insert_pos =
        gameobject_xml::find_parent_close_pos(&content, new_parent_id).ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!(
                "New parent node '{}' not found in scene",
                new_parent_id
            ))
        })?;

    let content_without_src = format!("{}{}", &content[..src_start], &content[src_end..]);
    let adjusted_insert = if insert_pos > src_start {
        insert_pos - (src_end - src_start)
    } else {
        insert_pos
    };

    let final_content = format!(
        "{}{}{}",
        &content_without_src[..adjusted_insert],
        node_element,
        &content_without_src[adjusted_insert..]
    );

    std::fs::write(&full_path, &final_content).map_err(ExecuteError::Io)?;

    info!(
        scene = %scene_path.to_string_lossy(),
        node_id = %node_id,
        new_parent_id = %new_parent_id,
        "Game object reparented"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "reparented": true,
            "node_id": node_id,
            "new_parent_id": new_parent_id,
            "path": full_path.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// gameobject.delete
// ============================================================

/// Handle `gameobject.delete` — delete a node from a scene.
pub fn gameobject_delete(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = scene::get_project_root(request)?;
    let scene_path = resolve_scene_path(request, &root)?;
    let node_id = request
        .arguments
        .get("node_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'node_id' argument".to_string()))?;

    let (full_path, content) = read_scene_file(request, &root, &scene_path)?;

    let (node_start, node_end) = gameobject_xml::find_node_element_bounds(&content, node_id)
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!("Node '{}' not found in scene", node_id))
        })?;

    let new_content = format!("{}{}", &content[..node_start], &content[node_end..]);
    std::fs::write(&full_path, &new_content).map_err(ExecuteError::Io)?;

    info!(
        scene = %scene_path.to_string_lossy(),
        node_id = %node_id,
        "Game object deleted"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "deleted": true,
            "node_id": node_id,
            "path": full_path.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// Prepare
// ============================================================

/// Prepare a game object operation — validate arguments and return a plan.
pub fn prepare_gameobject(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root = scene::get_project_root(request)
        .map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    let effects = match request.operation_id.as_str() {
        "gameobject.list" => vec![crate::model::Effect::ReadProject],
        _ => vec![
            crate::model::Effect::ReadProject,
            crate::model::Effect::WriteProject,
        ],
    };

    let targets = vec![
        request
            .arguments
            .get("scene_path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    ];

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets,
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(5)).to_rfc3339(),
        effect_digest: "gameobject-effects".to_string(),
    })
}

// ============================================================
// Helpers
// ============================================================

fn resolve_scene_path(request: &OperationRequest, root: &Path) -> Result<Arc<Path>, ExecuteError> {
    let path_str = request
        .arguments
        .get("scene_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'scene_path' argument".to_string()))?;
    let path = std::path::PathBuf::from(path_str);
    let full_path = if path.is_relative() {
        root.join(&path)
    } else {
        path
    };
    Ok(Arc::from(full_path))
}

/// Escape XML special characters in a string value.
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Read a scene file, returning an `ExecuteError` if the file doesn't exist or can't be read.
fn read_scene_file(
    _request: &OperationRequest,
    root: &Path,
    scene_path: &Path,
) -> Result<(std::path::PathBuf, String), ExecuteError> {
    let full_path = root.join(scene_path);
    if !full_path.exists() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Scene file not found: {}",
            full_path.to_string_lossy()
        )));
    }
    let content = std::fs::read_to_string(&full_path)?;
    Ok((full_path, content))
}

/// Build a "not found" error result.
fn scene_not_found_result(request_id: &str, full_path: &Path, error: &str) -> OperationResult {
    OperationResult {
        request_id: request_id.to_string(),
        success: false,
        output: json!({
            "error": error,
            "path": full_path.to_string_lossy()
        }),
        exit_code: Some(1),
        duration_ms: 0,
        log_path: None,
    }
}
