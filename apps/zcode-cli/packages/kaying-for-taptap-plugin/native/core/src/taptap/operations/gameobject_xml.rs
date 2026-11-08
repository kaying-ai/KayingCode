//! XML manipulation helpers for game object operations.
//!
//! Provides string-based XML parsing and manipulation for UrhoX scene files.
//! These operate at the file level when the UrhoX Runtime tool-mode is unavailable.

use serde_json::json;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use super::scene;

// --- XML parsing helpers ---

/// Find the matching closing tag for an opening tag, handling nesting.
/// Returns the position after the closing `</tag_name>`.
pub(crate) fn find_matching_tag_close(xml: &str, open_end: usize, tag_name: &str) -> Option<usize> {
    let mut depth = 1u32;
    let mut pos = open_end;
    let open_fmt = format!("<{tag_name}");
    let close_fmt = format!("</{tag_name}>");

    while pos < xml.len() && depth > 0 {
        let rest = &xml[pos..];
        let next_lt = rest.find('<')?;
        let abs = pos + next_lt;

        if xml[abs..].starts_with(&close_fmt) {
            depth -= 1;
            if depth == 0 {
                return Some(abs + close_fmt.len());
            }
            pos = abs + close_fmt.len();
        } else if xml[abs..].starts_with(&open_fmt) {
            depth += 1;
            pos = abs + open_fmt.len();
        } else {
            pos = abs + 1;
        }
    }
    None
}

/// Find the bounds of a `<node>` element by its `id` attribute.
/// Returns `(start, end)` where `end` is the position after the closing `</node>`.
pub(crate) fn find_node_element_bounds(xml: &str, target_id: &str) -> Option<(usize, usize)> {
    let mut search_pos = 0;
    loop {
        let tag_start = scene::find_tag_start(xml, search_pos, "node")?;
        let after_name = scene::skip_tag_name(xml, tag_start);
        let (attrs, self_closing, tag_end) = scene::parse_attrs(xml, after_name)?;

        if let Some(id_val) = attrs.get("id").and_then(|v| v.as_str()) {
            if id_val == target_id {
                if self_closing {
                    return Some((tag_start, tag_end));
                }
                let close_end = find_matching_tag_close(xml, tag_end, "node")?;
                return Some((tag_start, close_end));
            }
        }

        search_pos = if self_closing {
            tag_end
        } else {
            find_matching_tag_close(xml, tag_end, "node").unwrap_or(tag_end)
        };
    }
}

/// Find the position right before the closing `</node>` tag of the parent node.
/// New child content should be inserted at this position.
pub(crate) fn find_parent_close_pos(xml: &str, parent_id: &str) -> Option<usize> {
    let (_start, end) = find_node_element_bounds(xml, parent_id)?;

    let close_tag = "</node>";
    let search_from = if end >= close_tag.len() {
        end - close_tag.len()
    } else {
        0
    };
    let window = &xml[search_from..end];
    let close_pos = window.rfind(close_tag)?;
    Some(search_from + close_pos)
}

/// Get the next available node id (max existing id + 1).
pub(crate) fn get_next_node_id(xml: &str) -> u64 {
    let mut max_id = 0u64;
    let mut pos = 0;
    loop {
        let tag_start = match scene::find_tag_start(xml, pos, "node") {
            Some(s) => s,
            None => break,
        };
        let after_name = scene::skip_tag_name(xml, tag_start);
        let (attrs, _self_closing, tag_end) = match scene::parse_attrs(xml, after_name) {
            Some(a) => a,
            None => {
                pos = tag_start + 5;
                continue;
            }
        };
        pos = tag_end;
        if let Some(id_str) = attrs.get("id").and_then(|v| v.as_str()) {
            if let Ok(id) = id_str.parse::<u64>() {
                if id > max_id {
                    max_id = id;
                }
            }
        }
    }
    max_id + 1
}

/// Update or add attributes on a node's opening tag.
/// Returns the modified XML string, or `None` if the node is not found.
pub(crate) fn set_node_attributes(
    xml: &str,
    target_id: &str,
    attrs: &[(&str, String)],
) -> Option<String> {
    let (node_start, node_end) = find_node_element_bounds(xml, target_id)?;

    let tag_section = &xml[node_start..node_end];
    let tag_header_end = if let Some(close) = tag_section.find("/>") {
        node_start + close + 2
    } else if let Some(close) = tag_section.find('>') {
        node_start + close + 1
    } else {
        return None;
    };

    let opening_tag = &xml[node_start..tag_header_end];
    let mut result = opening_tag.to_string();
    let mut had_any = false;

    for (attr_name, attr_value) in attrs {
        let pattern = format!("{attr_name}=\"");
        if let Some(existing_start) = result.find(&pattern) {
            let val_start = existing_start + pattern.len();
            let val_end = result[val_start..].find('"')? + val_start;
            let before = &result[..existing_start];
            let after = &result[val_end + 1..];
            result = format!("{before}{attr_name}=\"{attr_value}\"{after}");
            had_any = true;
        } else {
            let insert_before = if result.ends_with("/>") {
                result.len() - 2
            } else if result.ends_with('>') {
                result.len() - 1
            } else {
                result.len()
            };
            result.insert_str(insert_before, &format!(" {attr_name}=\"{attr_value}\""));
            had_any = true;
        }
    }

    if !had_any {
        return None;
    }

    let new_xml = format!("{}{}{}", &xml[..node_start], result, &xml[tag_header_end..]);
    Some(new_xml)
}

/// Check if a node (by id) is a descendant of the given element bounds.
pub(crate) fn is_descendant(
    xml: &str,
    descendant_id: &str,
    ancestor_start: usize,
    ancestor_end: usize,
) -> bool {
    let ancestor_body = &xml[ancestor_start..ancestor_end];
    let tag_start = match scene::find_tag_start(ancestor_body, 0, "node") {
        Some(s) => s,
        None => return false,
    };
    let after_name = scene::skip_tag_name(ancestor_body, tag_start);
    let (_attrs, _self_closing, tag_end) = match scene::parse_attrs(ancestor_body, after_name) {
        Some(a) => a,
        None => return false,
    };

    let body = &ancestor_body[tag_end..];
    let search_within = if body.ends_with("</node>") || body.ends_with("</Node>") {
        &body[..body.len() - 7]
    } else {
        body
    };

    let target = format!("id=\"{descendant_id}\"");
    search_within.contains(&target)
}

/// Parse the node hierarchy from a scene XML string, including transform attributes.
pub(crate) fn parse_node_hierarchy(xml: &str) -> Option<serde_json::Value> {
    let body = if let Some(start) = xml.find("<scene") {
        &xml[start..]
    } else if let Some(start) = xml.find("<Scene") {
        &xml[start..]
    } else {
        return None;
    };

    let close_tag = if let Some(end) = body.rfind("</scene>") {
        end + 8
    } else if let Some(end) = body.rfind("</Scene>") {
        end + 8
    } else {
        return None;
    };

    let scene_body = &body[..close_tag];
    let mut root_nodes: Vec<serde_json::Value> = Vec::new();
    let mut pos = 0;
    let node_count = Arc::new(AtomicU64::new(0));

    while let Some(node) = parse_node_with_transform(scene_body, &mut pos, node_count.clone()) {
        root_nodes.push(node);
    }

    Some(json!({
        "nodes": root_nodes,
        "node_count": node_count.load(Ordering::Relaxed)
    }))
}

/// Parse a single `<node>` element including transform attributes (position/rotation/scale).
fn parse_node_with_transform(
    xml: &str,
    pos: &mut usize,
    node_count: Arc<AtomicU64>,
) -> Option<serde_json::Value> {
    let tag_start = scene::find_tag_start(xml, *pos, "node")?;
    *pos = tag_start;
    let after_tag_name = scene::skip_tag_name(xml, *pos);
    let (attrs, self_closing, end_pos) = scene::parse_attrs(xml, after_tag_name)?;
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
    let rotation = attrs.get("rotation").and_then(|v| v.as_str());
    let scale = attrs.get("scale").and_then(|v| v.as_str());

    node_count.fetch_add(1, Ordering::Relaxed);

    let mut children: Vec<serde_json::Value> = Vec::new();
    let mut components: Vec<serde_json::Value> = Vec::new();

    if !self_closing {
        loop {
            scene::skip_ws(xml, pos);
            if *pos >= xml.len() {
                break;
            }
            if xml[*pos..].starts_with("</node") || xml[*pos..].starts_with("</Node") {
                let close_end = xml[*pos..].find('>')?;
                *pos += close_end + 1;
                break;
            }
            if let Some(child) = parse_node_with_transform(xml, pos, node_count.clone()) {
                children.push(child);
                continue;
            }
            if let Some(comp) = scene::parse_component(xml, pos) {
                components.push(comp);
                continue;
            }
            if let Some(skip_to) = scene::skip_element(xml, *pos) {
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
    if let Some(r) = rotation {
        node["rotation"] = json!(r);
    }
    if let Some(s) = scale {
        node["scale"] = json!(s);
    }
    if !components.is_empty() {
        node["components"] = json!(components);
    }
    if !children.is_empty() {
        node["children"] = json!(children);
    }

    Some(node)
}
