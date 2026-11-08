//! Operation dispatch — maps operation IDs to prepare/execute handler pairs.
//!
//! The dispatch table is consumed by `TapTapProvider` to route operation
//! requests to their handlers. Each entry is keyed by operation ID and
//! returns `(prepare_fn, execute_fn)`.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};

/// Type alias for the prepare function signature.
pub type PrepareFn = fn(&OperationRequest) -> Result<OperationPlan, PrepareError>;
/// Type alias for the execute function signature.
pub type ExecuteFn = fn(&OperationRequest, &OperationPlan) -> Result<OperationResult, ExecuteError>;

/// Dispatch an operation to the correct handler.
///
/// Returns `(prepare_fn, execute_fn)` for the given operation ID.
/// Returns `None` if the operation ID is unknown.
#[must_use]
pub fn dispatch(operation_id: &str) -> Option<(PrepareFn, ExecuteFn)> {
    match operation_id {
        // --- Project ---
        "project.info" => Some((project::prepare_project, |req, _plan| {
            project::project_info(req)
        })),
        "project.validate" => Some((project::prepare_project, |req, _plan| {
            project::project_validate(req)
        })),
        "project.init" => Some((project::prepare_project, project::project_init)),

        // --- Build ---
        "build.list_targets" => Some((build::prepare_build, |req, _plan| {
            build::build_list_targets(req)
        })),
        "build.switch_target" => Some((build::prepare_build, build::build_switch_target)),
        "build.status" => Some((build::prepare_build, |req, _plan| build::build_status(req))),

        // --- Runtime ---
        "runtime.run" => Some((runtime::prepare_runtime, runtime::runtime_run)),
        "runtime.cancel" => Some((
            |req| runtime::prepare_runtime(req),
            |req, _plan| runtime::runtime_cancel(req),
        )),
        "runtime.logs" => Some((
            |req| runtime::prepare_runtime(req),
            |req, _plan| runtime::runtime_logs(req),
        )),
        "runtime.status" => Some((
            |req| runtime::prepare_runtime(req),
            |req, _plan| runtime::runtime_status(req),
        )),
        "runtime.smoke" => Some((runtime::prepare_runtime, runtime::runtime_smoke)),

        // --- Settings ---
        "settings.get" => Some((settings::prepare_settings, |req, _plan| {
            settings::settings_get(req)
        })),
        "settings.set" => Some((settings::prepare_settings, settings::settings_set)),

        // --- Maker ---
        "maker.auth" => Some((maker::prepare_maker, |req, _plan| maker::maker_auth(req))),
        "maker.status" => Some((maker::prepare_maker, |req, _plan| maker::maker_status(req))),
        "maker.build" => Some((maker::prepare_maker, maker::maker_build)),

        // --- Asset ---
        "asset.list" => Some((asset::prepare_asset, |req, _plan| asset::asset_list(req))),
        "asset.import" => Some((asset::prepare_asset, |req, _plan| asset::asset_import(req))),
        "asset.create_folder" => Some((asset::prepare_asset, |req, _plan| {
            asset::asset_create_folder(req)
        })),
        "asset.delete" => Some((asset::prepare_asset, |req, _plan| asset::asset_delete(req))),
        "asset.rename" => Some((asset::prepare_asset, |req, _plan| asset::asset_rename(req))),
        "asset.create" => Some((asset::prepare_asset, |req, _plan| asset::asset_create(req))),

        // --- Scene ---
        "scene.list" => Some((scene::prepare_scene, |req, _plan| scene::scene_list(req))),
        "scene.create" => Some((scene::prepare_scene, scene::scene_create)),
        "scene.open" => Some((scene::prepare_scene, |req, _plan| scene::scene_open(req))),
        "scene.save" => Some((scene::prepare_scene, scene::scene_save)),
        "scene.hierarchy" => Some((scene::prepare_scene, |req, _plan| {
            scene::scene_hierarchy(req)
        })),

        // --- Scene Design (D1) ---
        "scene.save_all" => Some((
            scene_design::prepare_scene_design,
            scene_design::scene_save_all,
        )),
        "scene.list_open" => Some((scene_design::prepare_scene_design, |req, _plan| {
            scene_design::scene_list_open(req)
        })),
        "scene.set_active" => Some((
            scene_design::prepare_scene_design,
            scene_design::scene_set_active,
        )),
        "scene.add_to_build" => Some((
            scene_design::prepare_scene_design,
            scene_design::scene_add_to_build,
        )),
        "scene.remove_from_build" => Some((
            scene_design::prepare_scene_design,
            scene_design::scene_remove_from_build,
        )),

        // --- Script ---
        "script.list" => Some((script::prepare_script, |req, _plan| {
            script::script_list(req)
        })),
        "script.create" => Some((script::prepare_script, script::script_create)),
        "script.attach" => Some((script::prepare_script, |req, _plan| {
            script::script_attach(req)
        })),

        // --- Capture ---
        "capture.game_view" => Some((capture::prepare_capture, |req, _plan| {
            capture::capture_game_view(req)
        })),
        "capture.scene_view" => Some((capture::prepare_capture, |req, _plan| {
            capture::capture_scene_view(req)
        })),

        // --- Editor ---
        "editor.play" => Some((editor::prepare_editor, |req, _plan| {
            editor::editor_play(req)
        })),
        "editor.stop" => Some((editor::prepare_editor, |req, _plan| {
            editor::editor_stop(req)
        })),
        "editor.pause" => Some((editor::prepare_editor, |req, _plan| {
            editor::editor_pause(req)
        })),
        "editor.status" => Some((editor::prepare_editor, |req, _plan| {
            editor::editor_status(req)
        })),

        // --- Gameobject ---
        "gameobject.create" => Some((
            gameobject::prepare_gameobject,
            gameobject::gameobject_create,
        )),
        "gameobject.list" => Some((gameobject::prepare_gameobject, |req, _plan| {
            gameobject::gameobject_list(req)
        })),
        "gameobject.set_transform" => Some((
            gameobject::prepare_gameobject,
            gameobject::gameobject_set_transform,
        )),
        "gameobject.set_parent" => Some((
            gameobject::prepare_gameobject,
            gameobject::gameobject_set_parent,
        )),
        "gameobject.delete" => Some((
            gameobject::prepare_gameobject,
            gameobject::gameobject_delete,
        )),

        // --- Component ---
        "component.add" => Some((component::prepare_component, component::component_add)),
        "component.remove" => Some((component::prepare_component, component::component_remove)),
        "component.get_properties" => Some((component::prepare_component, |req, _plan| {
            component::component_get_properties(req)
        })),
        "component.set_properties" => Some((
            component::prepare_component,
            component::component_set_properties,
        )),

        // --- Prefab (D1) ---
        "prefab.create" => Some((prefab::prepare_prefab, prefab::prefab_create)),
        "prefab.instantiate" => Some((prefab::prepare_prefab, prefab::prefab_instantiate)),
        "prefab.create_variant" => Some((prefab::prepare_prefab, prefab::prefab_create_variant)),
        "prefab.apply_overrides" => Some((prefab::prepare_prefab, prefab::prefab_apply_overrides)),
        "prefab.unpack" => Some((prefab::prepare_prefab, prefab::prefab_unpack)),
        "prefab.save_contents" => Some((prefab::prepare_prefab, prefab::prefab_save_contents)),

        // --- Material (D1) ---
        "material.get_properties" => Some((material::prepare_material, |req, _plan| {
            material::material_get_properties(req)
        })),
        "material.set_properties" => Some((
            material::prepare_material,
            material::material_set_properties,
        )),
        "material.list_shaders" => Some((material::prepare_material, |req, _plan| {
            material::material_list_shaders(req)
        })),
        "material.get_shader_properties" => Some((material::prepare_material, |req, _plan| {
            material::material_get_shader_properties(req)
        })),

        // --- Package (D1) ---
        "package.list" => Some((package::prepare_package, |req, _plan| {
            package::package_list(req)
        })),
        "package.add" => Some((package::prepare_package, package::package_add)),
        "package.remove" => Some((package::prepare_package, package::package_remove)),
        "package.resolve" => Some((package::prepare_package, |req, _plan| {
            package::package_resolve(req)
        })),
        "package.status" => Some((package::prepare_package, |req, _plan| {
            package::package_status(req)
        })),

        // --- Data (D2.6) ---
        "data.create_save_schema" => Some((data::prepare_data, data::data_create_save_schema)),
        "data.save_game" => Some((data::prepare_data, data::data_save_game)),
        "data.load_game" => Some((data::prepare_data, data::data_load_game)),
        "data.clear_save" => Some((data::prepare_data, data::data_clear_save)),
        "data.create_i18n" => Some((data::prepare_data, data::data_create_i18n)),
        "data.set_locale" => Some((data::prepare_data, data::data_set_locale)),
        "data.get_locale" => Some((data::prepare_data, |req, _plan| data::data_get_locale(req))),
        "data.create_config" => Some((data::prepare_data, data::data_create_config)),
        "data.validate" => Some((data::prepare_data, data::data_validate)),
        "data.migrate" => Some((data::prepare_data, data::data_migrate)),

        // --- Animation (D2.3) ---
        "animation.create_clip" => Some((
            animation::prepare_animation,
            animation::animation_create_clip,
        )),
        "animation.set_curve" => {
            Some((animation::prepare_animation, animation::animation_set_curve))
        }
        "animation.get_clip" => Some((animation::prepare_animation, |req, _plan| {
            animation::animation_get_clip(req)
        })),
        "animation.remove_curve" => Some((
            animation::prepare_animation,
            animation::animation_remove_curve,
        )),
        "animation.create_controller" => Some((
            animation::prepare_animation,
            animation::animation_create_controller,
        )),
        "animation.add_parameter" => Some((
            animation::prepare_animation,
            animation::animation_add_parameter,
        )),
        "animation.add_layer" => {
            Some((animation::prepare_animation, animation::animation_add_layer))
        }
        "animation.add_state" => {
            Some((animation::prepare_animation, animation::animation_add_state))
        }
        "animation.add_transition" => Some((
            animation::prepare_animation,
            animation::animation_add_transition,
        )),
        "animation.get_controller" => Some((animation::prepare_animation, |req, _plan| {
            animation::animation_get_controller(req)
        })),
        "animation.create_timeline" => Some((
            animation::prepare_animation,
            animation::animation_create_timeline,
        )),
        "animation.add_track" => {
            Some((animation::prepare_animation, animation::animation_add_track))
        }
        "animation.add_clip" => Some((animation::prepare_animation, animation::animation_add_clip)),
        "animation.get_timeline" => Some((animation::prepare_animation, |req, _plan| {
            animation::animation_get_timeline(req)
        })),

        // --- UI (D2.1) ---
        "ui.create_canvas" => Some((ui::prepare_ui, ui::ui_create_canvas)),
        "ui.create_element" => Some((ui::prepare_ui, ui::ui_create_element)),
        "ui.set_layout" => Some((ui::prepare_ui, ui::ui_set_layout)),
        "ui.set_style" => Some((ui::prepare_ui, ui::ui_set_style)),
        "ui.bind_event" => Some((ui::prepare_ui, ui::ui_bind_event)),
        "ui.create_text" => Some((ui::prepare_ui, ui::ui_create_text)),
        "ui.create_button" => Some((ui::prepare_ui, ui::ui_create_button)),
        "ui.create_image" => Some((ui::prepare_ui, ui::ui_create_image)),
        "ui.create_scroll_view" => Some((ui::prepare_ui, ui::ui_create_scroll_view)),
        "ui.create_joystick" => Some((ui::prepare_ui, ui::ui_create_joystick)),
        "ui.set_safe_area" => Some((ui::prepare_ui, ui::ui_set_safe_area)),
        "ui.inspect" => Some((ui::prepare_ui, |req, _plan| ui::ui_inspect(req))),
        "ui.theme.list" => Some((ui_theme::prepare_ui_theme, |req, _plan| {
            ui_theme::ui_theme_list(req)
        })),
        "ui.theme.resolve" => Some((ui_theme::prepare_ui_theme, |req, _plan| {
            ui_theme::ui_theme_resolve(req)
        })),
        "ui.theme.apply" => Some((ui_theme::prepare_ui_theme, ui_theme::ui_theme_apply)),

        // --- World (D2.5) ---
        "world.create_tilemap" => Some((world::prepare_world, world::world_create_tilemap)),
        "world.set_tile" => Some((world::prepare_world, world::world_set_tile)),
        "world.paint_tiles" => Some((world::prepare_world, world::world_paint_tiles)),
        "world.erase_tiles" => Some((world::prepare_world, world::world_erase_tiles)),
        "world.import_tileset" => Some((world::prepare_world, world::world_import_tileset)),
        "world.create_terrain" => Some((world::prepare_world, world::world_create_terrain)),
        "world.set_terrain_height" => Some((world::prepare_world, world::world_set_terrain_height)),
        "world.paint_terrain_layer" => {
            Some((world::prepare_world, world::world_paint_terrain_layer))
        }
        "world.create_nav_area" => Some((world::prepare_world, world::world_create_nav_area)),
        "world.inspect_bounds" => Some((world::prepare_world, |req, _plan| {
            world::world_inspect_bounds(req)
        })),

        // --- Physics (D2.2) ---
        "physics.create_rigidbody" => {
            Some((physics::prepare_physics, physics::physics_create_rigidbody))
        }
        "physics.create_collider" => {
            Some((physics::prepare_physics, physics::physics_create_collider))
        }
        "physics.set_collision_layer" => Some((
            physics::prepare_physics,
            physics::physics_set_collision_layer,
        )),
        "physics.set_material" => Some((physics::prepare_physics, physics::physics_set_material)),
        "physics.raycast" => Some((physics::prepare_physics, physics::physics_raycast)),
        "physics.overlap_query" => Some((physics::prepare_physics, physics::physics_overlap_query)),
        "physics.create_character_controller" => Some((
            physics::prepare_physics,
            physics::physics_create_character_controller,
        )),
        "physics.create_joint" => Some((physics::prepare_physics, physics::physics_create_joint)),
        "physics.set_gravity" => Some((physics::prepare_physics, physics::physics_set_gravity)),

        // --- VFX (D2.4) ---
        "vfx.create_emitter" => Some((vfx::prepare_vfx, vfx::vfx_create_emitter)),
        "vfx.set_properties" => Some((vfx::prepare_vfx, vfx::vfx_set_properties)),
        "vfx.play" => Some((vfx::prepare_vfx, vfx::vfx_play)),
        "vfx.stop" => Some((vfx::prepare_vfx, vfx::vfx_stop)),
        "vfx.create_trail" => Some((vfx::prepare_vfx, vfx::vfx_create_trail)),
        "vfx.create_decal" => Some((vfx::prepare_vfx, vfx::vfx_create_decal)),

        // --- Gameplay (D2.8) ---
        "gameplay.create_state_machine" => Some((
            gameplay::prepare_gameplay,
            gameplay::gameplay_create_state_machine,
        )),
        "gameplay.add_state" => Some((gameplay::prepare_gameplay, gameplay::gameplay_add_state)),
        "gameplay.add_transition" => Some((
            gameplay::prepare_gameplay,
            gameplay::gameplay_add_transition,
        )),
        "gameplay.create_spawn_table" => Some((
            gameplay::prepare_gameplay,
            gameplay::gameplay_create_spawn_table,
        )),
        "gameplay.create_loot_table" => Some((
            gameplay::prepare_gameplay,
            gameplay::gameplay_create_loot_table,
        )),
        "gameplay.create_quest" => {
            Some((gameplay::prepare_gameplay, gameplay::gameplay_create_quest))
        }
        "gameplay.create_dialogue" => Some((
            gameplay::prepare_gameplay,
            gameplay::gameplay_create_dialogue,
        )),
        "gameplay.create_behavior_tree" => Some((
            gameplay::prepare_gameplay,
            gameplay::gameplay_create_behavior_tree,
        )),
        "gameplay.validate" => Some((gameplay::prepare_gameplay, |req, _plan| {
            gameplay::gameplay_validate(req)
        })),

        // --- Network (D2.7) ---
        "network.create_session" => {
            Some((network::prepare_network, network::network_create_session))
        }
        "network.join_session" => Some((network::prepare_network, network::network_join_session)),
        "network.leave_session" => Some((network::prepare_network, network::network_leave_session)),
        "network.send_rpc" => Some((network::prepare_network, network::network_send_rpc)),
        "network.set_replication" => {
            Some((network::prepare_network, network::network_set_replication))
        }
        "network.configure_matchmaking" => Some((
            network::prepare_network,
            network::network_configure_matchmaking,
        )),

        // --- Debug (D3) ---
        "debug.start_profiler" => Some((debug::prepare_debug, debug::debug_start_profiler)),
        "debug.stop_profiler" => Some((debug::prepare_debug, debug::debug_stop_profiler)),
        "debug.get_frame_metrics" => Some((debug::prepare_debug, debug::debug_get_frame_metrics)),
        "debug.export_diagnostics" => Some((debug::prepare_debug, debug::debug_export_diagnostics)),
        "debug.assert_state" => Some((debug::prepare_debug, debug::debug_assert_state)),

        // --- Refactor (Stage F) ---
        "refactor.analyze" => Some((
            |req| refactor_mutate::prepare_refactor(req, &["path"]),
            |req, _plan| refactor::refactor_analyze(req),
        )),
        "refactor.rename_symbol" => Some((
            |req| refactor_mutate::prepare_refactor(req, &["path", "old_name", "new_name"]),
            refactor_mutate::refactor_rename_symbol,
        )),
        "refactor.extract_function" => Some((
            |req| {
                refactor_mutate::prepare_refactor(req, &["path", "name", "start_line", "end_line"])
            },
            refactor_mutate::refactor_extract_function,
        )),
        "refactor.inline_local" => Some((
            |req| refactor_mutate::prepare_refactor(req, &["path", "name"]),
            refactor_mutate::refactor_inline_local,
        )),
        "refactor.move_module" => Some((
            |req| refactor_mutate::prepare_refactor(req, &["old_path", "new_path"]),
            refactor_move_split::refactor_move_module,
        )),
        "refactor.split_file" => Some((
            |req| {
                refactor_mutate::prepare_refactor(
                    req,
                    &["path", "target_path", "start_line", "end_line"],
                )
            },
            refactor_move_split::refactor_split_file,
        )),
        "project.refactor_to_modular" => Some((
            refactor_modular::prepare_refactor_to_modular,
            refactor_modular::project_refactor_to_modular,
        )),
        "project.backup" => Some((
            refactor_backup::prepare_project_backup,
            refactor_backup::project_backup,
        )),
        "project.list_backups" => Some((
            refactor_backup::prepare_project_list_backups,
            refactor_backup::project_list_backups,
        )),
        "project.refactor_rollback" => Some((
            refactor_backup::prepare_project_refactor_rollback,
            refactor_backup::project_refactor_rollback,
        )),

        // --- Surface (Stage I) ---
        "surface.create" => Some((surface::prepare_surface, surface::surface_create)),
        "surface.list" => Some((surface::prepare_surface, |req, _plan| {
            surface::surface_list(req)
        })),
        "surface.get" => Some((surface::prepare_surface, |req, _plan| {
            surface::surface_get(req)
        })),
        "surface.switch" => Some((surface::prepare_surface, surface::surface_switch)),
        "surface.sync" => Some((surface::prepare_surface, |req, _plan| {
            surface::surface_sync(req)
        })),
        "surface.delete" => Some((surface::prepare_surface, surface::surface_delete)),
        "surface.add_transition" => {
            Some((surface::prepare_surface, surface::surface_add_transition))
        }

        _ => None,
    }
}

// Bring operation modules into scope so the match arms compile.
use super::{
    animation, asset, build, capture, component, data, debug, editor, gameobject, gameplay, maker,
    material, network, package, physics, prefab, project, refactor, refactor_backup,
    refactor_modular, refactor_move_split, refactor_mutate, runtime, scene, scene_design, script,
    settings, surface, ui, ui_theme, vfx, world,
};
