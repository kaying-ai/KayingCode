//! Strict JSON-contract helpers for Agent-facing operations.

use crate::model::{OperationRequest, OperationSpec};
use serde_json::{Map, Value, json};

const STRICT_OPERATIONS: &[&str] = &[
    "project.info",
    "project.validate",
    "project.init",
    "build.list_targets",
    "build.switch_target",
    "build.status",
    "runtime.run",
    "runtime.cancel",
    "runtime.logs",
    "runtime.status",
    "runtime.smoke",
    "settings.get",
    "settings.set",
    "asset.list",
    "asset.import",
    "asset.create_folder",
    "asset.delete",
    "asset.rename",
    "asset.create",
    "scene.list",
    "scene.create",
    "scene.open",
    "scene.save",
    "scene.hierarchy",
    "script.list",
    "script.create",
    "script.attach",
    "capture.game_view",
    "capture.scene_view",
];

pub fn apply_operation_contract(
    entry: &mut OperationSpec,
    properties: Map<String, Value>,
    required: Vec<String>,
    example: Map<String, Value>,
) {
    let strict = is_strict(&entry.id);
    entry.input_schema = json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": !strict,
        "examples": [example],
        "x-kaying-contract": if strict { "strict-v1" } else { "permissive-v1" }
    });
    entry.output_schema = output_schema(&entry.id);
    entry.requires_runtime = matches!(
        entry.id.as_str(),
        "runtime.cancel"
            | "runtime.logs"
            | "runtime.status"
            | "capture.game_view"
            | "capture.scene_view"
            | "editor.stop"
            | "editor.pause"
            | "editor.status"
    );
}

pub fn argument_schema(operation_id: &str, name: &str) -> Value {
    match (operation_id, name) {
        ("project.init", "template") => json!({
            "type": "string", "enum": ["modular", "minimal", "empty"], "default": "modular"
        }),
        ("project.init", "ui_theme") => json!({
            "type": "string", "enum": ["brawlforge", "astroon", "pixelforge"], "default": "brawlforge"
        }),
        ("build.switch_target", "target") => json!({
            "type": "string", "enum": ["android", "ios", "windows", "macos", "linux", "web"]
        }),
        ("ui.theme.resolve" | "ui.theme.apply", "theme") => json!({
            "type": "string", "enum": ["brawlforge", "astroon", "pixelforge"]
        }),
        ("settings.set", "settings") => json!({ "type": "object", "minProperties": 1 }),
        ("physics.create_character_controller", "height" | "radius") => {
            json!({ "type": "number", "minimum": 0.0 })
        }
        ("world.paint_terrain_layer", "layer") => json!({ "type": "string", "minLength": 1 }),
        ("runtime.run" | "runtime.smoke", "args")
        | ("capture.game_view" | "capture.scene_view", "args") => {
            json!({ "type": "array", "items": { "type": "string" } })
        }
        ("runtime.smoke", "ready_pattern") => json!({ "type": "string", "minLength": 1 }),
        (_, "timeout_ms") => json!({ "type": "integer", "minimum": 100, "maximum": 1_200_000 }),
        (_, "tail") => json!({ "type": "integer", "minimum": 1, "maximum": 10_000 }),
        (_, "keep_running" | "capture" | "require_screenshot" | "skip_remote") => {
            json!({ "type": "boolean" })
        }
        (
            _,
            "start_line" | "end_line" | "width" | "height" | "layer" | "mask" | "max_backups"
            | "track_index",
        ) => json!({ "type": "integer" }),
        (
            _,
            "mass" | "friction" | "restitution" | "top" | "bottom" | "left" | "right" | "radius",
        ) => {
            json!({ "type": "number" })
        }
        (_, "dry_run" | "backup_assets" | "snapshot_before_rollback" | "default") => {
            json!({ "type": "boolean" })
        }
        (_, "position" | "rotation" | "scale" | "size" | "gravity" | "args") => {
            json!({ "type": "array" })
        }
        (_, "attributes" | "layout" | "style") => json!({ "type": "object" }),
        _ => json!({ "type": "string", "minLength": 1, "description": argument_description(name) }),
    }
}

pub fn example_value(operation_id: &str, name: &str) -> Value {
    let schema = argument_schema(operation_id, name);
    if let Some(first) = schema
        .get("enum")
        .and_then(Value::as_array)
        .and_then(|v| v.first())
    {
        return first.clone();
    }
    match schema["type"].as_str() {
        Some("integer") => json!(1),
        Some("number") => json!(1.0),
        Some("boolean") => json!(false),
        Some("array") => json!([]),
        Some("object") => json!({ "key": "value" }),
        _ if name == "project_root" => json!("/absolute/path/to/game"),
        _ => json!(format!("<{name}>")),
    }
}

pub fn validate_arguments(request: &OperationRequest) -> Result<(), String> {
    let spec = crate::taptap::operations::catalog()
        .into_iter()
        .find(|spec| spec.id == request.operation_id)
        .ok_or_else(|| format!("Unknown operation '{}'", request.operation_id))?;
    validate_value(&request.arguments, &spec.input_schema, "arguments")
}

pub fn validate_output(operation_id: &str, output: &Value) -> Result<(), String> {
    if !is_strict(operation_id) {
        return Ok(());
    }
    let spec = crate::taptap::operations::catalog()
        .into_iter()
        .find(|spec| spec.id == operation_id)
        .ok_or_else(|| format!("Unknown operation '{operation_id}'"))?;
    validate_value(output, &spec.output_schema, "output")
}

fn validate_value(value: &Value, schema: &Value, path: &str) -> Result<(), String> {
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        if !values.contains(value) {
            return Err(format!(
                "{path} must be one of {}",
                Value::Array(values.clone())
            ));
        }
    }
    if let Some(kind) = schema.get("type").and_then(Value::as_str) {
        let valid = match kind {
            "object" => value.is_object(),
            "array" => value.is_array(),
            "string" => value.is_string(),
            "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
            "number" => value.is_number(),
            "boolean" => value.is_boolean(),
            "null" => value.is_null(),
            _ => true,
        };
        if !valid {
            return Err(format!("{path} must be {kind}, got {}", value_kind(value)));
        }
    }
    if let (Some(text), Some(minimum)) = (
        value.as_str(),
        schema.get("minLength").and_then(Value::as_u64),
    ) {
        if text.chars().count() < minimum as usize {
            return Err(format!(
                "{path} must contain at least {minimum} character(s)"
            ));
        }
    }
    if let Some(number) = value.as_f64() {
        if let Some(minimum) = schema.get("minimum").and_then(Value::as_f64) {
            if number < minimum {
                return Err(format!("{path} must be at least {minimum}"));
            }
        }
        if let Some(maximum) = schema.get("maximum").and_then(Value::as_f64) {
            if number > maximum {
                return Err(format!("{path} must be at most {maximum}"));
            }
        }
    }
    if let Some(object) = value.as_object() {
        if let Some(minimum) = schema.get("minProperties").and_then(Value::as_u64) {
            if object.len() < minimum as usize {
                return Err(format!(
                    "{path} must contain at least {minimum} propertie(s)"
                ));
            }
        }
        let properties = schema.get("properties").and_then(Value::as_object);
        if let Some(required) = schema.get("required").and_then(Value::as_array) {
            for name in required.iter().filter_map(Value::as_str) {
                if !object.contains_key(name) {
                    return Err(format!("{path}.{name} is required"));
                }
            }
        }
        if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
            for name in object.keys() {
                if properties.is_none_or(|items| !items.contains_key(name)) {
                    return Err(format!("{path}.{name} is not accepted by this operation"));
                }
            }
        }
        if let Some(properties) = properties {
            for (name, child_schema) in properties {
                if let Some(child) = object.get(name) {
                    validate_value(child, child_schema, &format!("{path}.{name}"))?;
                }
            }
        }
    }
    if let (Some(array), Some(item_schema)) = (value.as_array(), schema.get("items")) {
        for (index, item) in array.iter().enumerate() {
            validate_value(item, item_schema, &format!("{path}[{index}]"))?;
        }
    }
    Ok(())
}

fn output_schema(id: &str) -> Value {
    let properties = match id {
        "project.info" => {
            json!({ "project_root": string(), "entry": nullable_string(), "engine_version": nullable_string(), "resolved_entry": nullable_string(), "warnings": array(), "error": string() })
        }
        "project.validate" => {
            json!({ "project_root": string(), "valid": boolean(), "checks": array(), "structure": string(), "structure_alias_normalized": boolean(), "modular": object() })
        }
        "project.init" => {
            json!({ "created": boolean(), "project_root": string(), "entry": string(), "engine_version": string(), "template": string(), "structure": string(), "scaffold": object(), "error": string(), "details": string(), "valid_templates": array() })
        }
        "runtime.run" => {
            json!({ "session_id": string(), "pid": integer(), "status": string(), "stdout_path": string(), "stderr_path": string() })
        }
        "runtime.cancel" => {
            json!({ "session_id": string(), "cancelled": boolean(), "status": string(), "message": string() })
        }
        "runtime.logs" => {
            json!({ "session_id": string(), "stdout": string(), "stderr": string(), "running": boolean(), "status": string(), "tail": integer() })
        }
        "runtime.status" => {
            json!({ "session_id": string(), "pid": integer(), "running": boolean(), "status": string(), "started_at": string(), "entry": string() })
        }
        "runtime.smoke" => {
            json!({ "passed": boolean(), "session_id": string(), "status": string(), "stdout": string(), "stderr": string(), "diagnostics": array(), "screenshot_path": nullable_string(), "capture_available": boolean(), "kept_running": boolean(), "evidence_path": string() })
        }
        "build.list_targets" => json!({ "targets": array(), "current_os": string() }),
        "build.switch_target" => {
            json!({ "switched": boolean(), "target": string(), "project_root": string(), "error": string() })
        }
        "build.status" => {
            json!({ "current_target": nullable_string(), "maker_available": boolean(), "supported_targets": array(), "project_root": string(), "active_build_id": nullable_string(), "last_recorded_status": nullable_string(), "last_recorded_preview_url": nullable_string(), "remote_status": object() })
        }
        "settings.get" => {
            json!({ "key": string(), "value": {}, "settings": object(), "project_root": string(), "error": string() })
        }
        "settings.set" => {
            json!({ "set": boolean(), "updated": boolean(), "settings": object(), "project_root": string() })
        }
        _ if is_strict(id) => {
            json!({ "project_root": string(), "created": boolean(), "saved": boolean(), "updated": boolean(), "deleted": boolean(), "renamed": boolean(), "imported": boolean(), "attached": boolean(), "captured": boolean(), "available": boolean(), "path": string(), "full_path": string(), "absolute_path": string(), "source": string(), "target": string(), "folder": string(), "name": string(), "content": string(), "size": integer(), "count": integer(), "assets": array(), "scenes": array(), "scripts": array(), "tree": {}, "warnings": array(), "kind": string(), "message": string(), "error": string(), "stdout": string(), "stderr": string(), "file_size": integer() })
        }
        _ => {
            return json!({ "type": "object", "description": format!("Result payload for {id}"), "properties": {}, "additionalProperties": true, "x-kaying-contract": "permissive-v1" });
        }
    };
    json!({
        "type": "object",
        "description": format!("Operation-specific result payload for {id}"),
        "properties": properties,
        "additionalProperties": true,
        "x-kaying-contract": "strict-v1"
    })
}

fn is_strict(id: &str) -> bool {
    STRICT_OPERATIONS.contains(&id)
}
fn string() -> Value {
    json!({ "type": "string" })
}
fn nullable_string() -> Value {
    json!({})
}
fn boolean() -> Value {
    json!({ "type": "boolean" })
}
fn integer() -> Value {
    json!({ "type": "integer" })
}
fn array() -> Value {
    json!({ "type": "array" })
}
fn object() -> Value {
    json!({ "type": "object" })
}

fn argument_description(name: &str) -> &'static str {
    match name {
        "scene_path" => "Project-relative scene XML path",
        "node_id" | "parent_id" | "new_parent_id" => "UrhoX scene node identifier",
        "module" => "Project-relative Lua module path",
        "name" => "Stable snake_case resource or module name",
        "path" | "source" | "target" | "source_path" | "target_path" => {
            "Project-relative path unless documented otherwise"
        }
        "id" => "Stable semantic identifier",
        _ => "Operation-specific string parameter",
    }
}

fn value_kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(operation_id: &str, arguments: Value) -> OperationRequest {
        OperationRequest {
            request_id: "contract-test".to_string(),
            provider_id: "taptap".to_string(),
            operation_id: operation_id.to_string(),
            project_root: None,
            arguments,
            timeout_ms: None,
            dry_run: true,
            plan_id: None,
            effect_digest: None,
        }
    }

    #[test]
    fn rejects_wrong_types_even_for_permissive_operations() {
        let error = validate_arguments(&request(
            "ui.create_button",
            json!({ "project_root": ".", "name": 123 }),
        ))
        .unwrap_err();
        assert!(error.contains("arguments.name must be string"), "{error}");
    }

    #[test]
    fn strict_contract_rejects_unknown_fields_and_invalid_enums() {
        assert!(
            validate_arguments(&request(
                "project.init",
                json!({ "project_root": ".", "template": "modular", "surprise": true }),
            ))
            .unwrap_err()
            .contains("surprise")
        );
        assert!(
            validate_arguments(&request(
                "build.switch_target",
                json!({ "project_root": ".", "target": "dreamcast" }),
            ))
            .unwrap_err()
            .contains("must be one of")
        );
    }

    #[test]
    fn runtime_contract_exposes_truthful_lifecycle_metadata() {
        let catalog = crate::taptap::operations::catalog();
        let run = catalog
            .iter()
            .find(|item| item.id == "runtime.run")
            .unwrap();
        let status = catalog
            .iter()
            .find(|item| item.id == "runtime.status")
            .unwrap();
        let smoke = catalog
            .iter()
            .find(|item| item.id == "runtime.smoke")
            .unwrap();
        assert!(!run.requires_runtime);
        assert!(status.requires_runtime);
        assert!(!smoke.requires_runtime);
        assert_eq!(status.input_schema["additionalProperties"], false);
        assert_eq!(smoke.output_schema["x-kaying-contract"], "strict-v1");
        assert!(
            smoke.input_schema["required"]
                .as_array()
                .unwrap()
                .contains(&json!("ready_pattern"))
        );
    }
}
