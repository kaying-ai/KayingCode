//! TapTap scene operations — list, create, open, save, hierarchy.
//!
//! Manages UrhoX scene files (.scene, .xml) in a TapTap project.

use crate::model::{
    Diagnostic, DiagnosticSeverity, ExecuteError, OperationPlan, OperationRequest, OperationResult,
    PrepareError,
};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

const DEFAULT_SCENE_XML: &str = r#"<?xml version="1.0"?>
<scene>
  <node id="1" name="Root">
    <component type="Octree" />
  </node>
</scene>
"#;

/// Handle `scene.list` — list all scene files in the project.
pub fn scene_list(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let mut scenes: Vec<serde_json::Value> = Vec::new();
    visit_dirs(&root, &root, &mut scenes).map_err(ExecuteError::Io)?;
    info!(project_root = %root.to_string_lossy(), count = %scenes.len(), "Scene list retrieved");
    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({ "scenes": scenes, "count": scenes.len(), "project_root": root.to_string_lossy() }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `scene.create` — create a new empty scene file.
pub fn scene_create(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let name = request
        .arguments
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("new_scene");
    let path_str = request
        .arguments
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let scene_path = if path_str.is_empty() {
        root.join("scenes").join(format!("{name}.scene"))
    } else {
        root.join(path_str)
    };

    if let Some(parent) = scene_path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    if scene_path.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({ "error": "Scene file already exists", "path": scene_path.to_string_lossy(), "project_root": root.to_string_lossy() }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }
    std::fs::write(&scene_path, DEFAULT_SCENE_XML).map_err(ExecuteError::Io)?;
    info!(path = %scene_path.to_string_lossy(), "Scene created");
    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({ "created": true, "path": scene_path.to_string_lossy(), "name": name, "project_root": root.to_string_lossy() }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `scene.open` — read and return the contents of a scene file.
pub fn scene_open(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let path = resolve_scene_path(request, &root)?;
    let full_path = root.join(&path);
    if !full_path.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({ "error": "Scene file not found", "path": full_path.to_string_lossy(), "project_root": root.to_string_lossy() }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }
    let content = std::fs::read_to_string(&full_path).map_err(ExecuteError::Io)?;
    let file_size = content.len();
    info!(path = %full_path.to_string_lossy(), size = %file_size, "Scene opened");
    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({ "path": full_path.to_string_lossy(), "content": content, "size": file_size, "project_root": root.to_string_lossy() }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `scene.save` — save content to a scene file.
pub fn scene_save(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let path = resolve_scene_path(request, &root)?;
    let full_path = root.join(&path);
    let content = request
        .arguments
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'content' argument".to_string()))?;
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    std::fs::write(&full_path, content).map_err(ExecuteError::Io)?;
    let file_size = content.len();
    info!(path = %full_path.to_string_lossy(), size = %file_size, "Scene saved");
    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({ "saved": true, "path": full_path.to_string_lossy(), "size": file_size, "project_root": root.to_string_lossy() }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `scene.hierarchy` — parse a scene file and return the node hierarchy tree.
pub fn scene_hierarchy(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let path = resolve_scene_path(request, &root)?;
    let full_path = root.join(&path);
    if !full_path.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({ "error": "Scene file not found", "path": full_path.to_string_lossy(), "project_root": root.to_string_lossy() }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }
    let content = std::fs::read_to_string(&full_path).map_err(ExecuteError::Io)?;
    let mut warnings: Vec<Diagnostic> = Vec::new();
    let tree = parse_scene_xml(&content, &mut warnings);
    info!(path = %full_path.to_string_lossy(), node_count = ?tree.as_ref().map(|t| t.get("node_count")), "Scene hierarchy parsed");
    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({ "path": full_path.to_string_lossy(), "tree": tree, "warnings": warnings, "project_root": root.to_string_lossy() }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Prepare a scene operation — validate arguments and return a plan.
pub fn prepare_scene(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;
    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();
    let effects = match request.operation_id.as_str() {
        "scene.create" | "scene.save" => vec![crate::model::Effect::WriteProject],
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
        effect_digest: "scene-effects".to_string(),
    })
}

// ============================================================
// Helpers
// ============================================================

fn resolve_scene_path(request: &OperationRequest, root: &Path) -> Result<Arc<Path>, ExecuteError> {
    let path_str = request
        .arguments
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing 'path' argument".to_string()))?;
    let path = std::path::PathBuf::from(path_str);
    let full_path = if path.is_relative() {
        root.join(&path)
    } else {
        path
    };
    Ok(Arc::from(full_path))
}

fn visit_dirs(
    base: &Path,
    dir: &Path,
    scenes: &mut Vec<serde_json::Value>,
) -> Result<(), std::io::Error> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if !name.starts_with('.') {
                    visit_dirs(base, &path, scenes)?;
                }
            }
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ext_str == "scene" || ext_str == "xml" {
                    let relative = path
                        .strip_prefix(base)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    let file_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    scenes.push(json!({ "path": relative, "name": path.file_stem().and_then(|n| n.to_str()).unwrap_or(""), "extension": ext_str, "size": file_size }));
                }
            }
        }
    }
    Ok(())
}

// --- Simple XML parser for UrhoX scene format ---

fn parse_scene_xml(content: &str, warnings: &mut Vec<Diagnostic>) -> Option<serde_json::Value> {
    let body = if let Some(start) = content.find("<scene") {
        &content[start..]
    } else if let Some(start) = content.find("<Scene") {
        &content[start..]
    } else {
        warnings.push(Diagnostic {
            code: "NO_SCENE_ROOT".to_string(),
            message: "No <scene> root element found in file".to_string(),
            severity: DiagnosticSeverity::Warning,
        });
        return None;
    };
    let close_tag = if let Some(end) = body.rfind("</scene>") {
        end + 8
    } else if let Some(end) = body.rfind("</Scene>") {
        end + 8
    } else {
        warnings.push(Diagnostic {
            code: "UNCLOSED_SCENE".to_string(),
            message: "Scene element is not properly closed".to_string(),
            severity: DiagnosticSeverity::Warning,
        });
        return None;
    };
    let scene_body = &body[..close_tag];
    let mut root_nodes: Vec<serde_json::Value> = Vec::new();
    let mut pos = 0;
    let node_count = Arc::new(AtomicU64::new(0));
    while let Some(node) = parse_next_node(scene_body, &mut pos, node_count.clone()) {
        root_nodes.push(node);
    }
    Some(json!({ "nodes": root_nodes, "node_count": node_count.load(Ordering::Relaxed) }))
}

pub(crate) fn parse_next_node(
    xml: &str,
    pos: &mut usize,
    node_count: Arc<AtomicU64>,
) -> Option<serde_json::Value> {
    let tag_start = find_tag_start(xml, *pos, "node")?;
    *pos = tag_start;
    let after_tag_name = skip_tag_name(xml, *pos);
    let (attrs, self_closing, end_pos) = parse_attrs(xml, after_tag_name)?;
    *pos = end_pos;
    let id = attrs
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .to_string();
    let name = attrs
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unnamed")
        .to_string();
    let position = attrs.get("position").and_then(|v| v.as_str());
    node_count.fetch_add(1, Ordering::Relaxed);
    let mut children: Vec<serde_json::Value> = Vec::new();
    let mut components: Vec<serde_json::Value> = Vec::new();
    if !self_closing {
        loop {
            skip_ws(xml, pos);
            if *pos >= xml.len() {
                break;
            }
            if xml[*pos..].starts_with("</node") || xml[*pos..].starts_with("</Node") {
                let close_end = xml[*pos..].find('>')?;
                *pos += close_end + 1;
                break;
            }
            if let Some(child) = parse_next_node(xml, pos, node_count.clone()) {
                children.push(child);
                continue;
            }
            if let Some(comp) = parse_component(xml, pos) {
                components.push(comp);
                continue;
            }
            if let Some(skip_to) = skip_element(xml, *pos) {
                *pos = skip_to;
            } else {
                break;
            }
        }
    }
    let mut node = json!({ "id": id, "name": name });
    if let Some(p) = position {
        node["position"] = json!(p);
    }
    if !components.is_empty() {
        node["components"] = json!(components);
    }
    if !children.is_empty() {
        node["children"] = json!(children);
    }
    Some(node)
}

pub(crate) fn parse_component(xml: &str, pos: &mut usize) -> Option<serde_json::Value> {
    let start = find_tag_start(xml, *pos, "component")?;
    *pos = start;
    let after_tag_name = skip_tag_name(xml, *pos);
    let (attrs, self_closing, end_pos) = parse_attrs(xml, after_tag_name)?;
    *pos = end_pos;
    let comp_type = attrs
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let mut component = json!({ "type": comp_type });
    for (key, value) in &attrs {
        if key != "type" {
            component[key] = value.clone();
        }
    }
    if !self_closing {
        let close = xml[*pos..].find("</component>")?;
        *pos += close + 12;
    }
    Some(component)
}

pub(crate) fn find_tag_start(xml: &str, from: usize, tag_name: &str) -> Option<usize> {
    let lower = xml[from..].to_lowercase();
    lower.find(&format!("<{tag_name}")).map(|idx| from + idx)
}

pub(crate) fn skip_tag_name(xml: &str, from: usize) -> usize {
    let rest = &xml[from..];
    let mut i = 0;
    if rest.starts_with('<') {
        i += 1;
    }
    while i < rest.len() {
        let c = rest.as_bytes()[i];
        if c.is_ascii_alphanumeric() || c == b'_' || c == b'-' {
            i += 1;
        } else {
            break;
        }
    }
    from + i
}

pub(crate) fn parse_attrs(
    xml: &str,
    from: usize,
) -> Option<(
    std::collections::HashMap<String, serde_json::Value>,
    bool,
    usize,
)> {
    let mut attrs = std::collections::HashMap::new();
    let mut pos = from;
    let mut self_closing = false;
    loop {
        skip_ws(xml, &mut pos);
        if pos >= xml.len() {
            return None;
        }
        let c = xml.as_bytes()[pos];
        if c == b'>' {
            pos += 1;
            break;
        }
        if c == b'/' && pos + 1 < xml.len() && xml.as_bytes()[pos + 1] == b'>' {
            self_closing = true;
            pos += 2;
            break;
        }
        let name_start = pos;
        while pos < xml.len() {
            let bc = xml.as_bytes()[pos];
            if bc.is_ascii_alphanumeric() || bc == b'_' || bc == b'-' {
                pos += 1;
            } else {
                break;
            }
        }
        if pos == name_start {
            pos += 1;
            continue;
        }
        let attr_name = &xml[name_start..pos];
        skip_ws(xml, &mut pos);
        if pos < xml.len() && xml.as_bytes()[pos] == b'=' {
            pos += 1;
        }
        skip_ws(xml, &mut pos);
        if pos < xml.len() && (xml.as_bytes()[pos] == b'"' || xml.as_bytes()[pos] == b'\'') {
            let quote = xml.as_bytes()[pos];
            pos += 1;
            let val_start = pos;
            while pos < xml.len() && xml.as_bytes()[pos] != quote {
                pos += 1;
            }
            let attr_value = &xml[val_start..pos];
            if pos < xml.len() {
                pos += 1;
            }
            attrs.insert(
                attr_name.to_string(),
                serde_json::Value::String(attr_value.to_string()),
            );
        }
    }
    Some((attrs, self_closing, pos))
}

pub(crate) fn skip_ws(xml: &str, pos: &mut usize) {
    while *pos < xml.len() {
        let c = xml.as_bytes()[*pos];
        if c == b' ' || c == b'\t' || c == b'\n' || c == b'\r' {
            *pos += 1;
        } else {
            break;
        }
    }
}

pub(crate) fn skip_element(xml: &str, from: usize) -> Option<usize> {
    let rest = &xml[from..];
    let close = rest.find('>')?;
    let tag_end = from + close + 1;
    if close > 0 && rest.as_bytes()[close - 1] == b'/' {
        return Some(tag_end);
    }
    let tag_content = &rest[1..close];
    let tag_name = tag_content.split_whitespace().next()?;
    if tag_name.is_empty() {
        return Some(tag_end);
    }
    let remaining = &xml[tag_end..];
    remaining
        .find(&format!("</{}>", tag_name))
        .map(|end| tag_end + end + tag_name.len() + 3)
        .or(Some(tag_end))
}

pub(crate) fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, ExecuteError> {
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
