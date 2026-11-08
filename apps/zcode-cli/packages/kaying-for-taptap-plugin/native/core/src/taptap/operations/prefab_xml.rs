//! XML helpers for prefab operations.
//!
//! These functions operate on the UrhoX scene-fragment XML format used by
//! `.prefab` files. They are intentionally simple string-scanning parsers
//! (no full XML dependency) — sufficient for the deterministic transforms
//! the prefab operations need.

/// Extract the inner XML of `<prefab>...</prefab>`, returning the node fragment.
pub fn extract_prefab_nodes(xml: &str) -> String {
    let start_marker = "<prefab";
    let end_marker = "</prefab>";
    let Some(s) = xml.find(start_marker) else {
        return String::new();
    };
    let after_open = xml[s..].find('>').map(|o| s + o + 1).unwrap_or(s);
    let Some(e) = xml.rfind(end_marker) else {
        return String::new();
    };
    xml[after_open..e].trim().to_string()
}

/// Add a `prefab="<name>"` attribute to the outermost `<node>` of the fragment
/// so instances can be tracked back to their source prefab.
pub fn stamp_prefab_instance(fragment: &str, name: &str) -> String {
    let Some(node_open) = fragment.find("<node") else {
        return fragment.to_string();
    };
    let after_tag = fragment[node_open..]
        .find('>')
        .map(|e| node_open + e)
        .unwrap_or(fragment.len());
    let insert_at = after_tag;
    let mut out = String::with_capacity(fragment.len() + name.len() + 12);
    out.push_str(&fragment[..insert_at]);
    // Back up to before the `>` so we can inject the attribute before the close.
    if out.ends_with('/') {
        out.pop();
        out.push_str(&format!(" prefab=\"{name}\"/"));
    } else {
        out.push_str(&format!(" prefab=\"{name}\""));
    }
    out.push_str(&fragment[insert_at..]);
    out
}

/// Apply overrides to base prefab XML (simplistic — appends override notes
/// as XML comments near the root node). Real override semantics require editor bridge.
pub fn apply_xml_overrides(
    base_xml: &str,
    overrides: &serde_json::Value,
    base_name: &str,
    variant_name: &str,
) -> String {
    let mut out = String::with_capacity(base_xml.len() + 256);
    out.push_str(&format!(
        "<!-- variant: {variant_name} (base: {base_name}) -->\n"
    ));
    if let Some(obj) = overrides.as_object() {
        if !obj.is_empty() {
            out.push_str("<!-- overrides:\n");
            for (k, v) in obj {
                out.push_str(&format!("     {k} = {v}\n"));
            }
            out.push_str("-->\n");
        }
    }
    out.push_str(base_xml);
    out
}

/// Extract a `<node>` subtree (including children) from `xml` by `id`.
///
/// Scans for `<node ... id="<node_id>" ...>` and returns the full element
/// including its children, accounting for nesting.
pub fn extract_node_subtree(xml: &str, node_id: &str) -> String {
    let needle = format!("id=\"{node_id}\"");
    let Some(idx) = xml.find(&needle) else {
        return String::new();
    };
    // Find the start of the `<node` tag that contains this id.
    let tag_start = xml[..idx].rfind("<node").unwrap_or(0);
    // Find the matching `</node>` accounting for nesting.
    let mut depth = 0i32;
    let mut cursor = tag_start;
    let bytes = xml.as_bytes();
    while cursor < xml.len() {
        if bytes[cursor..].starts_with(b"<node") {
            depth += 1;
            // Skip to end of opening tag.
            if let Some(e) = xml[cursor..].find('>') {
                cursor += e + 1;
                continue;
            }
        }
        if bytes[cursor..].starts_with(b"</node>") {
            depth -= 1;
            cursor += "</node>".len();
            if depth == 0 {
                return xml[tag_start..cursor].to_string();
            }
            continue;
        }
        cursor += 1;
    }
    xml[tag_start..].to_string()
}
