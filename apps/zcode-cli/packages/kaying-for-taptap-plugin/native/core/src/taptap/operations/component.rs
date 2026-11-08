//! TapTap component operations — add, remove, get/set properties on scene components.
//!
//! Manages UrhoX components attached to scene nodes. Operates on scene XML files directly.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::info;

use super::component_helpers;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Handle `component.add` — add a component to a scene node.
///
/// Accepts `project_root`, `scene_path`, `node_id`, `component_type`, and optional `attributes`.
pub fn component_add(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = component_helpers::get_project_root(request)?;
    let scene_path = component_helpers::resolve_scene_path(request, &root)?;

    let node_id = request
        .arguments
        .get("node_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'node_id' argument".to_string()))?;
    let component_type = request
        .arguments
        .get("component_type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            ExecuteError::NotPrepared("Missing 'component_type' argument".to_string())
        })?;
    let attributes = request
        .arguments
        .get("attributes")
        .and_then(|v| v.as_object());

    let full_path = root.join(&scene_path);
    if !full_path.exists() {
        return Ok(component_helpers::scene_not_found_result(
            request, &full_path, &root,
        ));
    }

    let content = std::fs::read_to_string(&full_path).map_err(ExecuteError::Io)?;

    // Find the node's content range (after opening tag, before closing tag)
    let (open_end, close_start) = component_helpers::find_node_range(&content, node_id)
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!("Node with id '{node_id}' not found in scene"))
        })?;

    // If the node is self-closing, convert it to a paired tag
    let new_content = if open_end == close_start {
        let tag_start = content[..open_end].rfind('<').unwrap_or(0);
        let next_id = component_helpers::find_max_component_id(&content) + 1;
        let comp_xml = component_helpers::build_component_xml(component_type, next_id, attributes);

        let before = &content[..tag_start];
        let after = &content[open_end..];
        format!(
            "{}<node id=\"{}\">\n    {}\n  </node>{}",
            before, node_id, comp_xml, after
        )
    } else {
        let next_id = component_helpers::find_max_component_id(&content) + 1;
        let comp_xml = component_helpers::build_component_xml(component_type, next_id, attributes);

        let before = &content[..close_start];
        let after = &content[close_start..];
        format!("{}{}{}", before, comp_xml, after)
    };

    std::fs::write(&full_path, &new_content).map_err(ExecuteError::Io)?;

    let next_id = component_helpers::find_max_component_id(&new_content);

    info!(
        scene = %full_path.to_string_lossy(),
        node_id = %node_id,
        component_type = %component_type,
        component_id = %next_id,
        "Component added"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "added": true,
            "path": full_path.to_string_lossy(),
            "node_id": node_id,
            "component_type": component_type,
            "component_id": next_id,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `component.remove` — remove a component from a scene node.
///
/// Accepts `project_root`, `scene_path`, `node_id`, and one of `component_index` or `component_type`.
pub fn component_remove(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = component_helpers::get_project_root(request)?;
    let scene_path = component_helpers::resolve_scene_path(request, &root)?;

    let node_id = request
        .arguments
        .get("node_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'node_id' argument".to_string()))?;
    let comp_index = request
        .arguments
        .get("component_index")
        .and_then(|v| v.as_i64());
    let comp_type = request
        .arguments
        .get("component_type")
        .and_then(|v| v.as_str());

    if comp_index.is_none() && comp_type.is_none() {
        return Err(ExecuteError::NotPrepared(
            "Missing either 'component_index' or 'component_type' argument".to_string(),
        ));
    }

    let full_path = root.join(&scene_path);
    if !full_path.exists() {
        return Ok(component_helpers::scene_not_found_result(
            request, &full_path, &root,
        ));
    }

    let content = std::fs::read_to_string(&full_path).map_err(ExecuteError::Io)?;

    let (open_end, close_start) = component_helpers::find_node_range(&content, node_id)
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!("Node with id '{node_id}' not found in scene"))
        })?;

    if open_end == close_start {
        return Ok(component_helpers::self_closing_node_result(
            request, node_id, &full_path, &root,
        ));
    }

    let node_content = &content[open_end..close_start];

    let (comp_start_rel, comp_end_rel, found_type) =
        component_helpers::find_component_range(node_content, comp_index, comp_type).ok_or_else(
            || {
                let hint = if let Some(idx) = comp_index {
                    format!("component at index {idx}")
                } else {
                    format!("component of type '{}'", comp_type.unwrap_or(""))
                };
                ExecuteError::ExternalToolFailed(format!("No {hint} found in node '{node_id}'"))
            },
        )?;

    let comp_abs_start = open_end + comp_start_rel;
    let comp_abs_end = open_end + comp_end_rel;

    let before = &content[..comp_abs_start];
    let after = &content[comp_abs_end..];
    let new_content = format!("{}{}", before, after);

    std::fs::write(&full_path, &new_content).map_err(ExecuteError::Io)?;

    info!(
        scene = %full_path.to_string_lossy(),
        node_id = %node_id,
        component_type = %found_type,
        "Component removed"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "removed": true,
            "path": full_path.to_string_lossy(),
            "node_id": node_id,
            "component_type": found_type,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `component.get_properties` — get component properties from a scene node.
///
/// Accepts `project_root`, `scene_path`, `node_id`, and one of `component_index` or `component_type`.
/// Returns the component's attributes as a JSON object.
pub fn component_get_properties(
    request: &OperationRequest,
) -> Result<OperationResult, ExecuteError> {
    let root = component_helpers::get_project_root(request)?;
    let scene_path = component_helpers::resolve_scene_path(request, &root)?;

    let node_id = request
        .arguments
        .get("node_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'node_id' argument".to_string()))?;
    let comp_index = request
        .arguments
        .get("component_index")
        .and_then(|v| v.as_i64());
    let comp_type = request
        .arguments
        .get("component_type")
        .and_then(|v| v.as_str());

    if comp_index.is_none() && comp_type.is_none() {
        return Err(ExecuteError::NotPrepared(
            "Missing either 'component_index' or 'component_type' argument".to_string(),
        ));
    }

    let full_path = root.join(&scene_path);
    if !full_path.exists() {
        return Ok(component_helpers::scene_not_found_result(
            request, &full_path, &root,
        ));
    }

    let content = std::fs::read_to_string(&full_path).map_err(ExecuteError::Io)?;

    let (open_end, close_start) = component_helpers::find_node_range(&content, node_id)
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!("Node with id '{node_id}' not found in scene"))
        })?;

    if open_end == close_start {
        return Ok(component_helpers::self_closing_node_result(
            request, node_id, &full_path, &root,
        ));
    }

    let node_content = &content[open_end..close_start];

    let (_comp_start_rel, _comp_end_rel, found_type) =
        component_helpers::find_component_range(node_content, comp_index, comp_type).ok_or_else(
            || {
                let hint = if let Some(idx) = comp_index {
                    format!("component at index {idx}")
                } else {
                    format!("component of type '{}'", comp_type.unwrap_or(""))
                };
                ExecuteError::ExternalToolFailed(format!("No {hint} found in node '{node_id}'"))
            },
        )?;

    let comp_xml = &node_content[_comp_start_rel.._comp_end_rel];
    let attributes = component_helpers::parse_component_attributes(comp_xml);

    info!(
        scene = %full_path.to_string_lossy(),
        node_id = %node_id,
        component_type = %found_type,
        attribute_count = %attributes.len(),
        "Component properties retrieved"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "path": full_path.to_string_lossy(),
            "node_id": node_id,
            "component_type": found_type,
            "attributes": attributes,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `component.set_properties` — set component properties on a scene node.
///
/// Accepts `project_root`, `scene_path`, `node_id`, one of `component_index` or `component_type`,
/// and `attributes` object.
pub fn component_set_properties(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = component_helpers::get_project_root(request)?;
    let scene_path = component_helpers::resolve_scene_path(request, &root)?;

    let node_id = request
        .arguments
        .get("node_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'node_id' argument".to_string()))?;
    let comp_index = request
        .arguments
        .get("component_index")
        .and_then(|v| v.as_i64());
    let comp_type = request
        .arguments
        .get("component_type")
        .and_then(|v| v.as_str());
    let new_attrs = request
        .arguments
        .get("attributes")
        .and_then(|v| v.as_object())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'attributes' argument".to_string()))?;

    if comp_index.is_none() && comp_type.is_none() {
        return Err(ExecuteError::NotPrepared(
            "Missing either 'component_index' or 'component_type' argument".to_string(),
        ));
    }

    let full_path = root.join(&scene_path);
    if !full_path.exists() {
        return Ok(component_helpers::scene_not_found_result(
            request, &full_path, &root,
        ));
    }

    let content = std::fs::read_to_string(&full_path).map_err(ExecuteError::Io)?;

    let (open_end, close_start) = component_helpers::find_node_range(&content, node_id)
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(format!("Node with id '{node_id}' not found in scene"))
        })?;

    if open_end == close_start {
        return Ok(component_helpers::self_closing_node_result(
            request, node_id, &full_path, &root,
        ));
    }

    let node_content = &content[open_end..close_start];

    let (comp_start_rel, _comp_end_rel, found_type) =
        component_helpers::find_component_range(node_content, comp_index, comp_type).ok_or_else(
            || {
                let hint = if let Some(idx) = comp_index {
                    format!("component at index {idx}")
                } else {
                    format!("component of type '{}'", comp_type.unwrap_or(""))
                };
                ExecuteError::ExternalToolFailed(format!("No {hint} found in node '{node_id}'"))
            },
        )?;

    let comp_xml = &node_content[comp_start_rel.._comp_end_rel];

    // Build the new component XML with updated attributes
    let comp_attrs = component_helpers::parse_component_tag_attrs(comp_xml);
    let comp_tag_type = comp_attrs
        .get("type")
        .map(|s: &String| s.as_str())
        .unwrap_or(found_type.as_str());
    let comp_tag_id: &str = comp_attrs
        .get("id")
        .map(|s: &String| s.as_str())
        .unwrap_or("0");

    let mut final_attrs = serde_json::Map::new();
    let existing_attrs = component_helpers::parse_component_attributes(comp_xml);
    for (k, v) in existing_attrs.iter() {
        final_attrs.insert(k.clone(), serde_json::Value::String(v.clone()));
    }
    for (k, v) in new_attrs {
        final_attrs.insert(k.clone(), v.clone());
    }

    let mut new_comp_xml = format!(
        "    <component type=\"{}\" id=\"{}\">",
        comp_tag_type, comp_tag_id
    );
    let mut attr_names: Vec<&String> = final_attrs.keys().collect();
    attr_names.sort();
    for name in attr_names {
        let val = &final_attrs[name];
        let val_str: String = val
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| serde_json::to_string(val).unwrap_or_default());
        let escaped = val_str.replace('"', "&quot;");
        new_comp_xml.push_str(&format!(
            "\n      <attribute name=\"{}\" value=\"{}\" />",
            name, escaped
        ));
    }
    new_comp_xml.push_str("\n    </component>");

    let comp_abs_start = open_end + comp_start_rel;
    let comp_abs_end = open_end + _comp_end_rel;
    let before = &content[..comp_abs_start];
    let after = &content[comp_abs_end..];
    let new_content = format!("{}{}{}", before, new_comp_xml, after);

    std::fs::write(&full_path, &new_content).map_err(ExecuteError::Io)?;

    info!(
        scene = %full_path.to_string_lossy(),
        node_id = %node_id,
        component_type = %found_type,
        attribute_count = %new_attrs.len(),
        "Component properties set"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "updated": true,
            "path": full_path.to_string_lossy(),
            "node_id": node_id,
            "component_type": found_type,
            "attributes": final_attrs,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Prepare a component operation — validate arguments and return a plan.
pub fn prepare_component(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root: Arc<Path> = component_helpers::get_project_root(request)
        .map_err(|e: ExecuteError| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    let effects = match request.operation_id.as_str() {
        "component.add" | "component.remove" | "component.set_properties" => {
            vec![crate::model::Effect::WriteProject]
        }
        _ => vec![crate::model::Effect::ReadProject],
    };

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(5)).to_rfc3339(),
        effect_digest: "component-effects".to_string(),
    })
}
