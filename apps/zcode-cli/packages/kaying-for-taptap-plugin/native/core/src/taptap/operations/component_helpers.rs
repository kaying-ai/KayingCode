//! XML helper functions for component operations.
//!
//! Provides string-based XML parsing and manipulation for UrhoX scene format.

use std::path::Path;
use std::sync::Arc;

use crate::model::ExecuteError;
use serde_json::json;

/// Build a component XML string for the given type, id, and optional attributes.
pub fn build_component_xml(
    component_type: &str,
    component_id: u64,
    attributes: Option<&serde_json::Map<String, serde_json::Value>>,
) -> String {
    let mut xml = format!(
        "    <component type=\"{}\" id=\"{}\">",
        component_type, component_id
    );
    if let Some(attrs) = attributes {
        let mut names: Vec<&String> = attrs.keys().collect();
        names.sort();
        for name in names {
            let val = &attrs[name];
            let val_str: String = val
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| serde_json::to_string(val).unwrap_or_default());
            let escaped = val_str.replace('"', "&quot;");
            xml.push_str(&format!(
                "\n      <attribute name=\"{}\" value=\"{}\" />",
                name, escaped
            ));
        }
    }
    xml.push_str("\n    </component>");
    xml
}

/// Find the content range of a node by ID.
///
/// Returns `(open_tag_end, close_tag_start)`. If the node is self-closing,
/// both values are the same (the position after `/>`).
pub fn find_node_range(xml: &str, node_id: &str) -> Option<(usize, usize)> {
    let lower = xml.to_lowercase();
    let pattern = format!("<node id=\"{}\"", node_id.to_lowercase());
    let start = lower.find(&pattern)?;

    let rest = &xml[start..];
    let gt = rest.find('>')?;
    let open_end = start + gt + 1;

    let tag_content = &rest[..gt];
    if tag_content.trim_end().ends_with('/') {
        return Some((open_end, open_end));
    }

    let mut depth: u32 = 1;
    let mut pos = open_end;
    let bytes = xml.as_bytes();

    while pos < xml.len() && depth > 0 {
        if pos + 7 < xml.len()
            && bytes[pos] == b'<'
            && bytes[pos + 1] == b'/'
            && (bytes[pos + 2] == b'n' || bytes[pos + 2] == b'N')
            && (bytes[pos + 3] == b'o' || bytes[pos + 3] == b'O')
            && (bytes[pos + 4] == b'd' || bytes[pos + 4] == b'D')
            && (bytes[pos + 5] == b'e' || bytes[pos + 5] == b'E')
            && bytes[pos + 6] == b'>'
        {
            depth -= 1;
            if depth == 0 {
                return Some((open_end, pos));
            }
            pos += 7;
            continue;
        }

        if pos + 5 < xml.len()
            && bytes[pos] == b'<'
            && (bytes[pos + 1] == b'n' || bytes[pos + 1] == b'N')
            && (bytes[pos + 2] == b'o' || bytes[pos + 2] == b'O')
            && (bytes[pos + 3] == b'd' || bytes[pos + 3] == b'D')
            && (bytes[pos + 4] == b'e' || bytes[pos + 4] == b'E')
        {
            let next = bytes[pos + 5];
            if next == b' ' || next == b'>' || next == b'/' || next == b'\n' || next == b'\r' {
                depth += 1;
                if let Some(gt_pos) = xml[pos..].find('>') {
                    pos += gt_pos + 1;
                    continue;
                }
            }
        }

        pos += 1;
    }

    None
}

/// Find a component's range within node content by index or type.
///
/// Returns `(start_offset, end_offset, component_type)` relative to the start of `node_xml`.
/// `node_xml` should be the content between the node's opening and closing tags.
pub fn find_component_range(
    node_xml: &str,
    index: Option<i64>,
    comp_type: Option<&str>,
) -> Option<(usize, usize, String)> {
    let mut pos = 0;
    let mut current_index: i64 = 0;

    loop {
        let lower = node_xml[pos..].to_lowercase();
        let tag_start = lower.find("<component")?;
        let abs_start = pos + tag_start;

        let rest = &node_xml[abs_start..];
        let gt = rest.find('>')?;
        let tag_content = &rest[..gt];
        let is_self_closing = tag_content.trim_end().ends_with('/');
        let open_end = abs_start + gt + 1;

        let found_type = extract_attr_value(tag_content, "type");

        let comp_end = if is_self_closing {
            open_end
        } else {
            let after_open = &node_xml[open_end..];
            let close_tag = after_open
                .find("</component>")
                .or_else(|| after_open.find("</Component>"))?;
            open_end + close_tag + 13
        };

        let matches = if let Some(idx) = index {
            current_index == idx
        } else if let Some(t) = comp_type {
            found_type.as_deref() == Some(t)
        } else {
            false
        };

        if matches {
            return Some((abs_start, comp_end, found_type.unwrap_or_default()));
        }

        current_index += 1;
        pos = comp_end;
    }
}

/// Extract an attribute value from an XML tag string.
/// E.g., `extract_attr_value("component type=\"Camera\" id=\"1\"", "type")` -> Some("Camera")
pub fn extract_attr_value(tag: &str, attr_name: &str) -> Option<String> {
    let lower_tag = tag.to_lowercase();
    let search = format!("{}=\"", attr_name.to_lowercase());
    let search2 = format!("{}='", attr_name.to_lowercase());

    if let Some(idx) = lower_tag.find(&search) {
        let val_start = idx + search.len();
        let remaining = &tag[val_start..];
        let end = remaining.find('"')?;
        return Some(remaining[..end].to_string());
    }

    if let Some(idx) = lower_tag.find(&search2) {
        let val_start = idx + search2.len();
        let remaining = &tag[val_start..];
        let end = remaining.find('\'')?;
        return Some(remaining[..end].to_string());
    }

    None
}

/// Parse the attributes of a component's opening tag into a map.
pub fn parse_component_tag_attrs(comp_xml: &str) -> std::collections::HashMap<String, String> {
    let mut attrs = std::collections::HashMap::new();
    let gt = comp_xml.find('>').unwrap_or(comp_xml.len());
    let tag_content = &comp_xml[1..gt];

    if let Some(t) = extract_attr_value(tag_content, "type") {
        attrs.insert("type".to_string(), t);
    }
    if let Some(id) = extract_attr_value(tag_content, "id") {
        attrs.insert("id".to_string(), id);
    }

    attrs
}

/// Parse `<attribute name="..." value="..." />` elements from a component's XML body.
pub fn parse_component_attributes(comp_xml: &str) -> std::collections::HashMap<String, String> {
    let mut attrs = std::collections::HashMap::new();
    let mut search_from = 0;

    loop {
        let lower = comp_xml[search_from..].to_lowercase();
        let tag_start = match lower.find("<attribute") {
            Some(pos) => search_from + pos,
            None => break,
        };

        let rest = &comp_xml[tag_start..];
        let gt = match rest.find('>') {
            Some(pos) => pos,
            None => break,
        };
        let tag_content = &rest[..gt];

        let name = extract_attr_value(tag_content, "name");
        let value = extract_attr_value(tag_content, "value");

        if let (Some(n), Some(v)) = (name, value) {
            attrs.insert(n, v);
        }

        search_from = tag_start + gt + 1;
    }

    attrs
}

/// Find the maximum component ID used in the scene XML.
pub fn find_max_component_id(xml: &str) -> u64 {
    let mut max_id: u64 = 0;
    let mut pos = 0;

    loop {
        let lower = xml[pos..].to_lowercase();
        let tag_start = match lower.find("<component") {
            Some(p) => pos + p,
            None => break,
        };

        let rest = &xml[tag_start..];
        let gt = match rest.find('>') {
            Some(p) => p,
            None => break,
        };
        let tag_content = &rest[..gt];

        if let Some(id_str) = extract_attr_value(tag_content, "id") {
            if let Ok(id) = id_str.parse::<u64>() {
                if id > max_id {
                    max_id = id;
                }
            }
        }

        pos = tag_start + gt + 1;
    }

    max_id
}

/// Resolve a scene path relative to the project root, returning an Arc<Path>.
pub fn resolve_scene_path(
    request: &crate::model::OperationRequest,
    root: &Path,
) -> Result<Arc<Path>, ExecuteError> {
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

/// Get the project root from the request arguments.
pub fn get_project_root(
    request: &crate::model::OperationRequest,
) -> Result<Arc<Path>, ExecuteError> {
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

/// Build a "not found" error result for operations.
pub fn scene_not_found_result(
    request: &crate::model::OperationRequest,
    full_path: &Path,
    root: &Path,
) -> crate::model::OperationResult {
    crate::model::OperationResult {
        request_id: request.request_id.clone(),
        success: false,
        output: json!({
            "error": "Scene file not found",
            "path": full_path.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(1),
        duration_ms: 0,
        log_path: None,
    }
}

/// Build a "self-closing node" error result for operations.
pub fn self_closing_node_result(
    request: &crate::model::OperationRequest,
    node_id: &str,
    full_path: &Path,
    root: &Path,
) -> crate::model::OperationResult {
    crate::model::OperationResult {
        request_id: request.request_id.clone(),
        success: false,
        output: json!({
            "error": "Node is self-closing and has no components",
            "node_id": node_id,
            "path": full_path.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(1),
        duration_ms: 0,
        log_path: None,
    }
}
