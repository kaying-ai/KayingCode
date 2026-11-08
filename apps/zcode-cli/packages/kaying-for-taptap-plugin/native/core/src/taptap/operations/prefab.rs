//! TapTap prefab operations — create, instantiate, variants, overrides, unpack, save.
//!
//! Prefabs are stored as `prefabs/<name>.prefab` (UrhoX scene-fragment XML).
//! All operations work on the filesystem (no live editor required).

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use crate::taptap::operations::helpers::{
    fail_result, get_project_root, make_plan, ok_result, opt_object_arg, opt_str_arg,
    required_str_arg, write_json_file,
};
use crate::taptap::operations::prefab_xml::{
    apply_xml_overrides, extract_node_subtree, extract_prefab_nodes, stamp_prefab_instance,
};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::time::Instant;
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

const DEFAULT_PREFAB_XML: &str =
    "<?xml version=\"1.0\"?>\n<prefab>\n  <node id=\"1\" name=\"Root\">\n  </node>\n</prefab>\n";

fn prefabs_dir(root: &std::path::Path) -> PathBuf {
    root.join("prefabs")
}

fn prefab_path(root: &std::path::Path, name: &str) -> PathBuf {
    prefabs_dir(root).join(format!("{name}.prefab"))
}

// ============================================================
// prefab.create
// ============================================================

/// Handle `prefab.create` — write a new prefab file.
pub fn prefab_create(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let content = opt_str_arg(request, "content").unwrap_or_else(|| DEFAULT_PREFAB_XML.to_string());

    let path = prefab_path(&root, &name);
    if path.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Prefab '{name}' already exists"),
                "path": path.to_string_lossy(),
                "project_root": root.to_string_lossy(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    std::fs::write(&path, &content).map_err(ExecuteError::Io)?;
    info!(name = %name, path = %path.to_string_lossy(), "Prefab created");

    Ok(ok_result(
        request,
        json!({
            "created": true,
            "name": name,
            "path": path.to_string_lossy(),
            "size": content.len(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// prefab.instantiate
// ============================================================

/// Handle `prefab.instantiate` — insert a prefab's node tree into a target scene.
pub fn prefab_instantiate(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let scene_path = required_str_arg(request, "scene_path")?;
    let parent_id = opt_str_arg(request, "parent_id").unwrap_or_else(|| "1".to_string());

    let prefab_file = prefab_path(&root, &name);
    if !prefab_file.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Prefab '{name}' not found"),
                "expected_path": prefab_file.to_string_lossy(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    let scene_file = root.join(&scene_path);
    if !scene_file.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Scene '{scene_path}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    }

    let prefab_xml = std::fs::read_to_string(&prefab_file).map_err(ExecuteError::Io)?;
    let mut scene_xml = std::fs::read_to_string(&scene_file).map_err(ExecuteError::Io)?;

    let nodes_fragment = extract_prefab_nodes(&prefab_xml);
    if nodes_fragment.is_empty() {
        return Ok(fail_result(
            request,
            json!({
                "error": "Prefab contains no nodes",
                "prefab_path": prefab_file.to_string_lossy(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    // Insert nodes under the parent node's closing tag.
    let parent_marker = format!("id=\"{parent_id}\"");
    let insertion_idx = scene_xml.find(&parent_marker);
    let inserted = if let Some(idx) = insertion_idx {
        let after_open = scene_xml[idx..].find('>').map(|o| idx + o + 1);
        if let Some(start) = after_open {
            let close_rel = scene_xml[start..].find("</node>");
            if let Some(close_off) = close_rel {
                let insert_at = start + close_off;
                let stamped = stamp_prefab_instance(&nodes_fragment, &name);
                scene_xml.insert_str(insert_at, &stamped);
                true
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    if !inserted {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Could not locate parent node '{parent_id}' in scene"),
                "scene_path": scene_path,
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    std::fs::write(&scene_file, &scene_xml).map_err(ExecuteError::Io)?;
    info!(prefab = %name, scene = %scene_path, parent = %parent_id, "Prefab instantiated");

    Ok(ok_result(
        request,
        json!({
            "instantiated": true,
            "prefab": name,
            "scene_path": scene_path,
            "parent_id": parent_id,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// prefab.create_variant
// ============================================================

/// Handle `prefab.create_variant` — derive a new prefab from a base with overrides.
pub fn prefab_create_variant(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let base = required_str_arg(request, "base")?;
    let variant_name = required_str_arg(request, "name")?;
    let overrides = opt_object_arg(request, "overrides").unwrap_or(json!({}));

    let base_path = prefab_path(&root, &base);
    if !base_path.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Base prefab '{base}' not found"),
                "expected_path": base_path.to_string_lossy(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    let base_xml = std::fs::read_to_string(&base_path).map_err(ExecuteError::Io)?;
    let variant_xml = apply_xml_overrides(&base_xml, &overrides, &base, &variant_name);

    let variant_path = prefab_path(&root, &variant_name);
    if let Some(parent) = variant_path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    std::fs::write(&variant_path, &variant_xml).map_err(ExecuteError::Io)?;
    info!(base = %base, variant = %variant_name, "Prefab variant created");

    Ok(ok_result(
        request,
        json!({
            "created": true,
            "base": base,
            "name": variant_name,
            "path": variant_path.to_string_lossy(),
            "overrides_applied": overrides,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// prefab.apply_overrides
// ============================================================

/// Handle `prefab.apply_overrides` — capture node-level overrides and write back to prefab.
///
/// Naive implementation: records the overrides provided in the request and persists
/// them as `.prefab.overrides.json` next to the prefab file. A future editor bridge can
/// diff scene-vs-prefab automatically; for now we trust the caller's diff payload.
pub fn prefab_apply_overrides(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let overrides = opt_object_arg(request, "overrides").unwrap_or(json!({}));

    let prefab_file = prefab_path(&root, &name);
    if !prefab_file.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Prefab '{name}' not found"),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    let overrides_path = prefab_path(&root, &name).with_extension("prefab.overrides.json");
    write_json_file(&overrides_path, &overrides).map_err(ExecuteError::Io)?;
    info!(prefab = %name, fields = overrides.as_object().map(|o| o.len()).unwrap_or(0), "Overrides applied");

    Ok(ok_result(
        request,
        json!({
            "applied": true,
            "prefab": name,
            "overrides_path": overrides_path.to_string_lossy(),
            "overrides": overrides,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// prefab.unpack
// ============================================================

/// Handle `prefab.unpack` — remove the `prefab="..."` attribute from a scene node,
/// leaving the instantiated node tree in place.
pub fn prefab_unpack(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let scene_path = required_str_arg(request, "scene_path")?;
    let node_id = required_str_arg(request, "node_id")?;

    let scene_file = root.join(&scene_path);
    if !scene_file.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Scene '{scene_path}' not found"),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    let mut xml = std::fs::read_to_string(&scene_file).map_err(ExecuteError::Io)?;
    let needle = format!("id=\"{node_id}\"");
    let node_idx = xml.find(&needle);
    let removed = if let Some(idx) = node_idx {
        // Look for `prefab="..."` within the same opening tag.
        let tag_end = xml[idx..].find('>').map(|e| idx + e).unwrap_or(xml.len());
        let slice = &xml[idx..tag_end];
        if let Some(p_start_rel) = slice.find("prefab=\"") {
            let p_start = idx + p_start_rel;
            let value_start = p_start + "prefab=\"".len();
            if let Some(value_end_rel) = xml[value_start..].find('"') {
                let value_end = value_start + value_end_rel + 1;
                // Also drop a leading space if present.
                let trim_start = if p_start > 0 && xml.as_bytes()[p_start - 1] == b' ' {
                    p_start - 1
                } else {
                    p_start
                };
                xml.replace_range(trim_start..value_end, "");
                true
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    if !removed {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Node '{node_id}' has no prefab reference to unpack"),
                "scene_path": scene_path,
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    std::fs::write(&scene_file, &xml).map_err(ExecuteError::Io)?;
    info!(scene = %scene_path, node = %node_id, "Prefab unpacked");

    Ok(ok_result(
        request,
        json!({
            "unpacked": true,
            "scene_path": scene_path,
            "node_id": node_id,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// prefab.save_contents
// ============================================================

/// Handle `prefab.save_contents` — extract a scene node subtree and persist it as a prefab.
pub fn prefab_save_contents(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let scene_path = required_str_arg(request, "scene_path")?;
    let node_id = required_str_arg(request, "node_id")?;

    let scene_file = root.join(&scene_path);
    if !scene_file.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Scene '{scene_path}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    }

    let scene_xml = std::fs::read_to_string(&scene_file).map_err(ExecuteError::Io)?;
    let subtree = extract_node_subtree(&scene_xml, &node_id);
    if subtree.is_empty() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Node '{node_id}' not found in scene '{scene_path}'"),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    let prefab_xml = format!("<?xml version=\"1.0\"?>\n<prefab>\n{subtree}\n</prefab>\n");
    let prefab_file = prefab_path(&root, &name);
    if let Some(parent) = prefab_file.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    std::fs::write(&prefab_file, &prefab_xml).map_err(ExecuteError::Io)?;
    info!(prefab = %name, scene = %scene_path, node = %node_id, "Prefab saved from scene");

    Ok(ok_result(
        request,
        json!({
            "saved": true,
            "name": name,
            "path": prefab_file.to_string_lossy(),
            "scene_path": scene_path,
            "node_id": node_id,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Prepare
// ============================================================

/// Prepare a prefab operation — validate args and return a plan.
pub fn prepare_prefab(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let effects = match request.operation_id.as_str() {
        "prefab.create"
        | "prefab.create_variant"
        | "prefab.apply_overrides"
        | "prefab.instantiate"
        | "prefab.unpack"
        | "prefab.save_contents" => {
            vec![Effect::ReadProject, Effect::WriteProject]
        }
        _ => vec![Effect::ReadProject],
    };
    make_plan(request, &PLAN_COUNTER, effects, "prefab-effects")
}
