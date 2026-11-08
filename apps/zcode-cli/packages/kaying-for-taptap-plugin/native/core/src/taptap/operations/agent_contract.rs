//! Agent-facing operation schemas and early argument validation.

use crate::model::{OperationRequest, OperationSpec, PrepareError};
use serde_json::{Map, Value};

pub fn enrich_catalog(mut entries: Vec<OperationSpec>) -> Vec<OperationSpec> {
    for entry in &mut entries {
        let required = required_arguments(&entry.id);
        let optional = optional_arguments(&entry.id);
        let mut properties = entry
            .input_schema
            .get("properties")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        for name in required.iter().chain(optional.iter()) {
            let generated =
                crate::taptap::operations::agent_contract_schema::argument_schema(&entry.id, name);
            let property = properties
                .entry((*name).to_string())
                .or_insert_with(|| generated.clone());
            if let (Some(existing), Some(generated)) =
                (property.as_object_mut(), generated.as_object())
            {
                for (key, value) in generated {
                    existing.insert(key.clone(), value.clone());
                }
            }
        }
        let mut required_fields = entry
            .input_schema
            .get("required")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        for name in required {
            if !required_fields.iter().any(|field| field == name) {
                required_fields.push((*name).to_string());
            }
        }
        let example = required_fields
            .iter()
            .map(|name| {
                (
                    name.to_string(),
                    crate::taptap::operations::agent_contract_schema::example_value(
                        &entry.id, name,
                    ),
                )
            })
            .collect::<Map<String, Value>>();
        crate::taptap::operations::agent_contract_schema::apply_operation_contract(
            entry,
            properties,
            required_fields,
            example,
        );
    }
    entries
}

pub fn validate_arguments(request: &OperationRequest) -> Result<(), PrepareError> {
    let missing = required_arguments(&request.operation_id)
        .iter()
        .filter(|name| match request.arguments.get(**name) {
            None | Some(Value::Null) => true,
            Some(Value::String(value)) => value.trim().is_empty(),
            _ => false,
        })
        .copied()
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(PrepareError::InvalidArguments(format!(
            "Operation '{}' is missing required argument(s): {}. Call command describe and use its input_schema.",
            request.operation_id,
            missing.join(", ")
        )));
    }
    crate::taptap::operations::agent_contract_schema::validate_arguments(request)
        .map_err(PrepareError::InvalidArguments)
}

pub fn validate_output(operation_id: &str, output: &Value) -> Result<(), String> {
    crate::taptap::operations::agent_contract_schema::validate_output(operation_id, output)
}

fn required_arguments(id: &str) -> &'static [&'static str] {
    match id {
        "build.switch_target" => &["target"],
        "settings.set" => &["settings"],
        "runtime.cancel" | "runtime.logs" | "runtime.status" => &["session_id"],
        "runtime.smoke" => &["ready_pattern"],
        "asset.import" => &["source_path", "target_path"],
        "asset.create_folder" => &["folder_path"],
        "asset.delete" | "asset.create" => &["path"],
        "asset.rename" => &["source", "target"],
        "scene.open" | "scene.hierarchy" => &["path"],
        "scene.save" => &["path", "content"],
        "scene.set_active" | "scene.add_to_build" | "scene.remove_from_build" => &["scene_path"],
        "script.attach" => &["script_path", "node_path"],
        "gameobject.create" => &["scene_path", "name"],
        "gameobject.list" => &["scene_path"],
        "gameobject.set_transform" | "gameobject.delete" => &["scene_path", "node_id"],
        "gameobject.set_parent" => &["scene_path", "node_id", "new_parent_id"],
        "component.add" => &["scene_path", "node_id", "component_type"],
        "component.remove" | "component.get_properties" => &["scene_path", "node_id"],
        "component.set_properties" => &["scene_path", "node_id", "attributes"],
        "ui.create_canvas"
        | "ui.create_text"
        | "ui.create_button"
        | "ui.create_image"
        | "ui.create_scroll_view"
        | "ui.create_joystick" => &["name"],
        "ui.create_element" => &["module", "element_name"],
        "ui.theme.resolve" => &["intent"],
        "ui.theme.apply" => &["theme"],
        "ui.set_layout" | "ui.set_style" => &["module"],
        "ui.bind_event" => &["module", "event"],
        "physics.create_rigidbody"
        | "physics.set_collision_layer"
        | "physics.set_material"
        | "physics.raycast"
        | "physics.overlap_query"
        | "physics.create_character_controller" => &["name"],
        "physics.create_collider" => &["node_id"],
        "physics.create_joint" => &["body_a", "body_b"],
        "world.create_tilemap"
        | "world.set_tile"
        | "world.paint_tiles"
        | "world.erase_tiles"
        | "world.create_terrain"
        | "world.set_terrain_height"
        | "world.create_nav_area" => &["name"],
        "world.import_tileset" => &["source", "name"],
        "world.paint_terrain_layer" => &["name", "layer"],
        "world.inspect_bounds" => &["scene_path", "node_id"],
        "prefab.create" | "prefab.apply_overrides" => &["name"],
        "prefab.instantiate" => &["name", "scene_path"],
        "prefab.create_variant" => &["base", "name"],
        "prefab.unpack" => &["scene_path", "node_id"],
        "prefab.save_contents" => &["name", "scene_path", "node_id"],
        "material.get_properties"
        | "material.set_properties"
        | "material.get_shader_properties"
        | "package.add"
        | "package.remove" => &["name"],
        "animation.create_clip"
        | "animation.get_clip"
        | "animation.create_controller"
        | "animation.get_controller"
        | "animation.create_timeline"
        | "animation.get_timeline" => &["name"],
        "animation.set_curve" | "animation.remove_curve" => &["name", "curve"],
        "animation.add_parameter" => &["name", "param_name"],
        "animation.add_layer" => &["name", "layer_name"],
        "animation.add_state" => &["name", "state_name"],
        "animation.add_transition" => &["name", "from", "to"],
        "animation.add_track" => &["name", "track_type"],
        "animation.add_clip" => &["name", "clip"],
        "data.create_save_schema" | "data.create_config" => &["name"],
        "data.create_i18n" | "data.set_locale" => &["locale"],
        "data.migrate" => &["from_version", "to_version"],
        "gameplay.add_state" => &["state_name"],
        "gameplay.add_transition" => &["from", "to"],
        "gameplay.create_quest" | "gameplay.create_dialogue" => &["id"],
        "gameplay.create_behavior_tree" => &["name"],
        "network.send_rpc" => &["rpc_name"],
        "network.set_replication" => &["object"],
        "debug.assert_state" => &["name"],
        "vfx.create_emitter" | "vfx.set_properties" | "vfx.play" | "vfx.stop"
        | "vfx.create_trail" | "vfx.create_decal" => &["name"],
        "surface.get" | "surface.create" | "surface.switch" | "surface.delete" => &["id"],
        "surface.add_transition" => &["id", "to", "event"],
        "refactor.analyze" => &["path"],
        "refactor.rename_symbol" => &["path", "old_name", "new_name"],
        "refactor.extract_function" => &["path", "name", "start_line", "end_line"],
        "refactor.inline_local" => &["path", "name"],
        "refactor.move_module" => &["old_path", "new_path"],
        "refactor.split_file" => &["path", "target_path", "start_line", "end_line"],
        _ => &[],
    }
}

fn optional_arguments(id: &str) -> &'static [&'static str] {
    match id {
        "project.init" => &[
            "entry",
            "engine_version",
            "template",
            "project_name",
            "ui_theme",
        ],
        "project.refactor_to_modular" => &["dry_run", "mode"],
        "build.status" => &["skip_remote"],
        "settings.get" => &["key"],
        "project.backup" => &["reason", "note", "backup_assets", "max_backups"],
        "project.refactor_rollback" => &["backup_id", "snapshot_before_rollback"],
        "gameobject.create" => &["parent_id"],
        "gameobject.set_transform" => &["position", "rotation", "scale"],
        "component.add" | "component.set_properties" => {
            &["attributes", "component_index", "component_type"]
        }
        "component.remove" | "component.get_properties" => &["component_index", "component_type"],
        "ui.create_canvas" => &["width", "height"],
        "ui.create_element" => &["kind"],
        "ui.set_layout" => &["layout"],
        "ui.set_style" => &["style"],
        "ui.bind_event" => &["handler"],
        "ui.create_image" => &["texture"],
        "ui.set_safe_area" => &["top", "bottom", "left", "right"],
        "ui.theme.resolve" => &["theme"],
        "physics.create_rigidbody" => &["body_type", "mass", "node_id"],
        "physics.create_collider" => &["shape", "size"],
        "physics.set_collision_layer" => &["layer", "mask"],
        "physics.set_material" => &["friction", "restitution"],
        "physics.create_character_controller" => &["height", "radius"],
        "physics.create_joint" => &["joint_type"],
        "physics.set_gravity" => &["gravity"],
        "surface.create" => &["template", "label", "default"],
        "animation.add_clip" => &["track_index"],
        "gameplay.create_state_machine" | "gameplay.add_state" | "gameplay.add_transition" => {
            &["name"]
        }
        "asset.create" => &["content"],
        "scene.create" => &["name", "path"],
        "script.create" => &["name", "path"],
        "capture.game_view" | "capture.scene_view" => {
            &["entry", "args", "runtime_path", "timeout_ms", "output_path"]
        }
        "runtime.run" => &["entry", "args", "runtime_path"],
        "runtime.logs" => &["tail"],
        "runtime.smoke" => &[
            "entry",
            "args",
            "runtime_path",
            "timeout_ms",
            "ready_pattern",
            "keep_running",
            "capture",
            "require_screenshot",
        ],
        "maker.build" => &["dry_run", "message", "env"],
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn exposes_and_validates_button_name() {
        let spec = crate::taptap::operations::catalog()
            .into_iter()
            .find(|entry| entry.id == "ui.create_button")
            .unwrap();
        assert!(
            spec.input_schema["required"]
                .as_array()
                .unwrap()
                .contains(&json!("name"))
        );
        assert!(spec.output_schema["properties"].is_object());
    }
}
