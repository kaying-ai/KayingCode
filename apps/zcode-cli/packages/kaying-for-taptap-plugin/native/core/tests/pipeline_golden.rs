//! Pipeline golden tests — verify catalog/dispatch consistency and prepare
//! stability for every native operation.
//!
//! These tests lock down:
//! 1. The catalog advertises the expected operation count.
//! 2. Every catalog entry resolves to a dispatch handler.
//! 3. Every dispatch handler is advertised in the catalog.
//! 4. Agent-facing schemas expose required arguments before execution.

use kaying_for_taptap_core::model::{
    EngineProvider, OperationRequest, ProviderContext, ProviderTransport,
};
use kaying_for_taptap_core::taptap::TapTapProvider;
use kaying_for_taptap_core::taptap::operations;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

fn minimal_request(op_id: &str, root: &str) -> OperationRequest {
    OperationRequest {
        request_id: format!("golden-{op_id}"),
        provider_id: "taptap".to_string(),
        operation_id: op_id.to_string(),
        project_root: None,
        arguments: json!({ "project_root": root }),
        timeout_ms: None,
        dry_run: true,
        plan_id: None,
        effect_digest: None,
    }
}

#[test]
fn catalog_advertises_expected_operation_count() {
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    // 166 = canonical operations plus persistent Runtime and built-in UI theme support.
    assert_eq!(
        catalog.len(),
        166,
        "catalog should advertise the canonical operation set"
    );
}

#[test]
fn every_catalog_entry_has_a_dispatch_handler() {
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();

    let missing: Vec<&str> = catalog
        .iter()
        .filter(|spec| operations::dispatch(&spec.id).is_none())
        .map(|spec| spec.id.as_str())
        .collect();

    assert!(
        missing.is_empty(),
        "operations without a dispatch handler: {missing:?}"
    );
}

#[test]
fn every_dispatch_handler_is_in_the_catalog() {
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    let catalog_ids: std::collections::HashSet<&str> =
        catalog.iter().map(|s| s.id.as_str()).collect();

    // Sample of known dispatch IDs across all modules — if any of these are
    // missing from the catalog, registration is incomplete.
    let sampled_ids = [
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
        "maker.auth",
        "maker.status",
        "maker.build",
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
        "scene.save_all",
        "scene.list_open",
        "scene.set_active",
        "scene.add_to_build",
        "scene.remove_from_build",
        "script.list",
        "script.create",
        "script.attach",
        "capture.game_view",
        "capture.scene_view",
        "editor.play",
        "editor.stop",
        "editor.pause",
        "editor.status",
        "gameobject.create",
        "gameobject.list",
        "gameobject.set_transform",
        "gameobject.set_parent",
        "gameobject.delete",
        "component.add",
        "component.remove",
        "component.get_properties",
        "component.set_properties",
        "prefab.create",
        "prefab.instantiate",
        "prefab.create_variant",
        "prefab.apply_overrides",
        "prefab.unpack",
        "prefab.save_contents",
        "material.get_properties",
        "material.set_properties",
        "material.list_shaders",
        "material.get_shader_properties",
        "package.list",
        "package.add",
        "package.remove",
        "package.resolve",
        "package.status",
        "data.create_save_schema",
        "data.save_game",
        "data.load_game",
        "data.clear_save",
        "data.create_i18n",
        "data.set_locale",
        "data.get_locale",
        "data.create_config",
        "data.validate",
        "data.migrate",
        "animation.create_clip",
        "animation.set_curve",
        "animation.get_clip",
        "animation.remove_curve",
        "animation.create_controller",
        "animation.add_parameter",
        "animation.add_layer",
        "animation.add_state",
        "animation.add_transition",
        "animation.get_controller",
        "animation.create_timeline",
        "animation.add_track",
        "animation.add_clip",
        "animation.get_timeline",
        "ui.create_canvas",
        "ui.create_element",
        "ui.set_layout",
        "ui.set_style",
        "ui.bind_event",
        "ui.create_text",
        "ui.create_button",
        "ui.create_image",
        "ui.create_scroll_view",
        "ui.create_joystick",
        "ui.set_safe_area",
        "ui.inspect",
        "ui.theme.list",
        "ui.theme.resolve",
        "ui.theme.apply",
        "world.create_tilemap",
        "world.set_tile",
        "world.paint_tiles",
        "world.erase_tiles",
        "world.import_tileset",
        "world.create_terrain",
        "world.set_terrain_height",
        "world.paint_terrain_layer",
        "world.create_nav_area",
        "world.inspect_bounds",
        "physics.create_rigidbody",
        "physics.create_collider",
        "physics.set_collision_layer",
        "physics.set_material",
        "physics.raycast",
        "physics.overlap_query",
        "physics.create_character_controller",
        "physics.create_joint",
        "physics.set_gravity",
        "vfx.create_emitter",
        "vfx.set_properties",
        "vfx.play",
        "vfx.stop",
        "vfx.create_trail",
        "vfx.create_decal",
        "gameplay.create_state_machine",
        "gameplay.add_state",
        "gameplay.add_transition",
        "gameplay.create_spawn_table",
        "gameplay.create_loot_table",
        "gameplay.create_quest",
        "gameplay.create_dialogue",
        "gameplay.create_behavior_tree",
        "gameplay.validate",
        "network.create_session",
        "network.join_session",
        "network.leave_session",
        "network.send_rpc",
        "network.set_replication",
        "network.configure_matchmaking",
        "debug.start_profiler",
        "debug.stop_profiler",
        "debug.get_frame_metrics",
        "debug.export_diagnostics",
        "debug.assert_state",
        "project.refactor_to_modular",
    ];

    let missing: Vec<&str> = sampled_ids
        .iter()
        .filter(|id| !catalog_ids.contains(**id))
        .copied()
        .collect();
    assert!(
        missing.is_empty(),
        "dispatch IDs missing from catalog: {missing:?}"
    );
}

#[test]
fn descriptor_and_transport_are_stable() {
    let provider = provider();
    let desc = provider.descriptor();
    assert_eq!(desc.id, "taptap");
    assert_eq!(desc.transport, ProviderTransport::InProcess);
    assert!(desc.runtime_ids.contains(&"urhox".to_string()));
}

#[test]
fn prepare_enforces_the_advertised_required_arguments() {
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().to_str().unwrap().to_string();

    for spec in &catalog {
        let request = minimal_request(&spec.id, &root);
        let required = spec.input_schema["required"].as_array().unwrap();
        let requires_operation_arguments = required
            .iter()
            .any(|value| value.as_str() != Some("project_root"));
        let prepared = provider.prepare(&request);
        if requires_operation_arguments {
            assert!(
                prepared.is_err(),
                "{} should reject a request missing {:?}",
                spec.id,
                required
            );
        } else {
            assert!(
                prepared.is_ok(),
                "{} should prepare with project_root",
                spec.id
            );
        }
    }
}

#[test]
fn every_operation_exposes_machine_usable_schemas() {
    let catalog = provider()
        .operation_catalog(&ProviderContext::new(None))
        .unwrap();
    for spec in catalog {
        assert!(
            spec.input_schema["properties"].is_object(),
            "{} input",
            spec.id
        );
        assert!(
            spec.input_schema["examples"].is_array(),
            "{} examples",
            spec.id
        );
        assert!(
            spec.output_schema["properties"].is_object(),
            "{} output",
            spec.id
        );
    }
}
