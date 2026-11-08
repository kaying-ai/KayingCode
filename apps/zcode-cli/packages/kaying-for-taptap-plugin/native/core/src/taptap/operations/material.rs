//! TapTap material/shader operations.
//!
//! Materials are stored as `assets/materials/<name>.material` (XML or JSON).
//! Shaders live in `assets/shaders/`.

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use crate::taptap::operations::helpers::{
    fail_result, get_project_root, make_plan, ok_result, opt_object_arg, opt_str_arg,
    required_str_arg,
};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::time::Instant;
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

fn materials_dir(root: &std::path::Path) -> PathBuf {
    root.join("assets").join("materials")
}

fn material_path(root: &std::path::Path, name: &str) -> PathBuf {
    materials_dir(root).join(format!("{name}.material"))
}

fn shaders_dir(root: &std::path::Path) -> PathBuf {
    root.join("assets").join("shaders")
}

const DEFAULT_MATERIAL_XML: &str =
    "<?xml version=\"1.0\"?>\n<material>\n  <shader name=\"Lit\" />\n  <uniforms />\n</material>\n";

// ============================================================
// material.get_properties
// ============================================================

/// Handle `material.get_properties` — read a material file's properties.
pub fn material_get_properties(
    request: &OperationRequest,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let path = material_path(&root, &name);

    if !path.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Material '{name}' not found"),
                "expected_path": path.to_string_lossy(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    let content = std::fs::read_to_string(&path).map_err(ExecuteError::Io)?;
    let props = parse_material_properties(&content);
    info!(name = %name, fields = props.len(), "Material properties read");

    Ok(ok_result(
        request,
        json!({
            "name": name,
            "path": path.to_string_lossy(),
            "properties": props,
            "raw_content": content,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// material.set_properties
// ============================================================

/// Handle `material.set_properties` — write material properties.
pub fn material_set_properties(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let properties = opt_object_arg(request, "properties").unwrap_or(json!({}));

    let path = material_path(&root, &name);
    let content = if path.exists() {
        std::fs::read_to_string(&path).map_err(ExecuteError::Io)?
    } else {
        DEFAULT_MATERIAL_XML.to_string()
    };

    let updated = write_material_properties(&content, &properties);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    std::fs::write(&path, &updated).map_err(ExecuteError::Io)?;
    info!(name = %name, fields = properties.as_object().map(|o| o.len()).unwrap_or(0), "Material properties written");

    Ok(ok_result(
        request,
        json!({
            "updated": true,
            "name": name,
            "path": path.to_string_lossy(),
            "properties": properties,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// material.list_shaders
// ============================================================

/// Handle `material.list_shaders` — list shader files under `assets/shaders/`.
pub fn material_list_shaders(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let dir = shaders_dir(&root);

    let mut shaders: Vec<serde_json::Value> = Vec::new();
    if dir.exists() {
        collect_shaders(&dir, &dir, &mut shaders).map_err(ExecuteError::Io)?;
    }

    info!(count = shaders.len(), "Shaders listed");

    Ok(ok_result(
        request,
        json!({
            "shaders": shaders,
            "count": shaders.len(),
            "shaders_dir": dir.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

/// Recursively collect shader files.
fn collect_shaders(
    base: &std::path::Path,
    dir: &std::path::Path,
    out: &mut Vec<serde_json::Value>,
) -> Result<(), std::io::Error> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_shaders(base, &path, out)?;
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                let e = ext.to_string_lossy().to_lowercase();
                if matches!(
                    e.as_str(),
                    "shader" | "glsl" | "hlsl" | "msl" | "vert" | "frag"
                ) {
                    let rel = path
                        .strip_prefix(base)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    out.push(json!({
                        "name": path.file_stem().and_then(|n| n.to_str()).unwrap_or(""),
                        "path": rel,
                        "extension": e,
                        "size": size,
                    }));
                }
            }
        }
    }
    Ok(())
}

// ============================================================
// material.get_shader_properties
// ============================================================

/// Handle `material.get_shader_properties` — read shader uniform declarations.
pub fn material_get_shader_properties(
    request: &OperationRequest,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let ext = opt_str_arg(request, "extension").unwrap_or_else(|| "shader".to_string());

    let path = shaders_dir(&root).join(format!("{name}.{ext}"));
    if !path.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Shader '{name}' not found"),
                "expected_path": path.to_string_lossy(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    let content = std::fs::read_to_string(&path).map_err(ExecuteError::Io)?;
    let uniforms = parse_shader_uniforms(&content);
    info!(shader = %name, uniforms = uniforms.len(), "Shader properties read");

    Ok(ok_result(
        request,
        json!({
            "name": name,
            "path": path.to_string_lossy(),
            "uniforms": uniforms,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Material/shader parsing helpers (very lightweight)
// ============================================================

/// Parse `<uniform name="..." value="..." />` tags from material XML.
fn parse_material_properties(xml: &str) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let mut cursor = 0;
    while let Some(start) = xml[cursor..].find("<uniform") {
        let abs = cursor + start;
        let end_rel = xml[abs..].find('/').or_else(|| xml[abs..].find('>'));
        let Some(end) = end_rel else { break };
        let tag = &xml[abs..abs + end + 1];
        let name = extract_attr(tag, "name").unwrap_or_default();
        let value = extract_attr(tag, "value").unwrap_or_default();
        let kind = extract_attr(tag, "type").unwrap_or_else(|| "auto".to_string());
        out.push(json!({"name": name, "value": value, "type": kind}));
        cursor = abs + end + 1;
    }
    out
}

fn extract_attr(tag: &str, key: &str) -> Option<String> {
    let needle = format!("{key}=\"");
    let s = tag.find(&needle)?;
    let value_start = s + needle.len();
    let value_end = tag[value_start..].find('"')?;
    Some(tag[value_start..value_start + value_end].to_string())
}

/// Replace or insert `<uniform>` entries in material XML.
fn write_material_properties(xml: &str, props: &serde_json::Value) -> String {
    let Some(obj) = props.as_object() else {
        return xml.to_string();
    };
    let mut out = String::with_capacity(xml.len() + 256);
    // Strip existing `<uniforms>...</uniforms>` block, if any.
    let uniforms_start = xml.find("<uniforms>");
    let uniforms_end = xml.find("</uniforms>");
    let (head, tail) = match (uniforms_start, uniforms_end) {
        (Some(s), Some(e)) => (&xml[..s], &xml[e + "</uniforms>".len()..]),
        _ => (xml, ""),
    };
    out.push_str(head);
    out.push_str("<uniforms>\n");
    for (k, v) in obj {
        out.push_str(&format!("  <uniform name=\"{k}\" value=\"{v}\" />\n"));
    }
    out.push_str("</uniforms>\n");
    out.push_str(tail);
    out
}

/// Scan shader source for `uniform <type> <name>;` declarations.
fn parse_shader_uniforms(src: &str) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for line in src.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("uniform ") {
            let rest = rest.trim_start();
            let mut parts = rest.split_whitespace();
            let ty = parts.next().unwrap_or("");
            let name = parts.next().unwrap_or("");
            let name = name.trim_end_matches(';');
            if !name.is_empty() {
                out.push(json!({"name": name, "type": ty}));
            }
        }
    }
    out
}

// ============================================================
// Prepare
// ============================================================

/// Prepare a material operation — validate args and return a plan.
pub fn prepare_material(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let effects = match request.operation_id.as_str() {
        "material.set_properties" => vec![Effect::ReadProject, Effect::WriteProject],
        _ => vec![Effect::ReadProject],
    };
    make_plan(request, &PLAN_COUNTER, effects, "material-effects")
}
