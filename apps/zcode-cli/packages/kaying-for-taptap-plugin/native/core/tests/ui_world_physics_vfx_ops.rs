//! Integration tests for `ui.*`, `world.*`, `physics.*`, and `vfx.*` operations.

mod common;

use common::{assert_success, make_request, make_request_bare, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

// ============================================================
// ui.*
// ============================================================

#[test]
fn ui_create_canvas_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("ui.create_canvas", root_str, json!({ "name": "hud" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.create_canvas");
    assert!(out["created"].as_bool().unwrap());

    let path = root.join("scripts").join("ui").join("hud.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("Hud"));
}

#[test]
fn ui_create_element_appends_factory() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // First create the canvas so the module exists.
    let canvas_req = make_request("ui.create_canvas", root_str, json!({ "name": "menu" }));
    let _ = provider.execute(&canvas_req).unwrap();

    let req = make_request(
        "ui.create_element",
        root_str,
        json!({
            "module": "menu",
            "element_name": "button_start",
            "kind": "container"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.create_element");
    assert!(out["added"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join("scripts").join("ui").join("menu.lua")).unwrap();
    assert!(body.contains("ButtonStart"));
}

#[test]
fn ui_set_layout_updates_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let canvas_req = make_request("ui.create_canvas", root_str, json!({ "name": "lyr" }));
    let _ = provider.execute(&canvas_req).unwrap();

    let req = make_request(
        "ui.set_layout",
        root_str,
        json!({ "module": "lyr", "layout": { "type": "vertical", "padding": 8 } }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.set_layout");
    assert!(out["updated"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join("scripts").join("ui").join("lyr.lua")).unwrap();
    assert!(body.contains("LAYOUT BEGIN"));
}

#[test]
fn ui_set_style_updates_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let canvas_req = make_request("ui.create_canvas", root_str, json!({ "name": "sty" }));
    let _ = provider.execute(&canvas_req).unwrap();

    let req = make_request(
        "ui.set_style",
        root_str,
        json!({ "module": "sty", "style": { "bg": "#222", "fg": "#eee" } }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.set_style");
    assert!(out["updated"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join("scripts").join("ui").join("sty.lua")).unwrap();
    assert!(body.contains("STYLE BEGIN"));
}

#[test]
fn ui_bind_event_appends_handler() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let canvas_req = make_request("ui.create_canvas", root_str, json!({ "name": "evt" }));
    let _ = provider.execute(&canvas_req).unwrap();

    let req = make_request(
        "ui.bind_event",
        root_str,
        json!({ "module": "evt", "event": "click", "handler": "print('clicked')" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.bind_event");
    assert!(out["bound"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join("scripts").join("ui").join("evt.lua")).unwrap();
    assert!(body.contains("M:onClick"));
}

#[test]
fn ui_create_text_widget_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("ui.create_text", root_str, json!({ "name": "score" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.create_text");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("ui")
        .join("widgets")
        .join("score.lua");
    assert!(path.exists());
}

#[test]
fn ui_create_button_widget_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("ui.create_button", root_str, json!({ "name": "play_btn" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.create_button");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("ui")
        .join("widgets")
        .join("play_btn.lua");
    assert!(path.exists());
}

#[test]
fn ui_create_image_widget_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "ui.create_image",
        root_str,
        json!({ "name": "icon", "texture": "textures/icon.png" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.create_image");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("ui")
        .join("widgets")
        .join("icon.lua");
    assert!(path.exists());
}

#[test]
fn ui_create_scroll_view_widget_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("ui.create_scroll_view", root_str, json!({ "name": "inv" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.create_scroll_view");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("ui")
        .join("widgets")
        .join("inv.lua");
    assert!(path.exists());
}

#[test]
fn ui_create_joystick_widget_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "ui.create_joystick",
        root_str,
        json!({ "name": "move_stick" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.create_joystick");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("ui")
        .join("widgets")
        .join("move_stick.lua");
    assert!(path.exists());
}

#[test]
fn ui_set_safe_area_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "ui.set_safe_area",
        root_str,
        json!({ "top": 44.0, "bottom": 34.0, "left": 0.0, "right": 0.0 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.set_safe_area");
    assert!(out["written"].as_bool().unwrap());

    let path = root.join("scripts").join("ui").join("safe_area.lua");
    assert!(path.exists());
}

#[test]
fn ui_inspect_returns_modules_array() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Drop a canvas module to ensure inspect picks it up.
    let canvas_req = make_request("ui.create_canvas", root_str, json!({ "name": "scan" }));
    let _ = provider.execute(&canvas_req).unwrap();

    let req = make_request_bare("ui.inspect", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "ui.inspect");
    assert!(out["modules"].is_array());
    assert!(out["count"].as_u64().unwrap() >= 1);
}

// ============================================================
// world.*
// ============================================================

#[test]
fn world_create_tilemap_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "world.create_tilemap",
        root_str,
        json!({ "name": "field", "width": 8, "height": 8, "tile_size": 32 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.create_tilemap");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("assets")
        .join("tilemaps")
        .join("field.tilemap.json");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("\"width\": 8"));
}

#[test]
fn world_set_tile_updates_cell() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "world.create_tilemap",
        root_str,
        json!({ "name": "grid", "width": 4, "height": 4 }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "world.set_tile",
        root_str,
        json!({ "name": "grid", "x": 1, "y": 2, "value": 7 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.set_tile");
    assert!(out["set"].as_bool().unwrap());
    assert_eq!(out["value"].as_u64().unwrap(), 7);
}

#[test]
fn world_set_tile_rejects_out_of_bounds() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "world.create_tilemap",
        root_str,
        json!({ "name": "oob", "width": 2, "height": 2 }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "world.set_tile",
        root_str,
        json!({ "name": "oob", "x": 9, "y": 9, "value": 1 }),
    );
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert!(
        res.output["error"]
            .as_str()
            .unwrap()
            .contains("out of bounds")
    );
}

#[test]
fn world_paint_tiles_fills_region() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "world.create_tilemap",
        root_str,
        json!({ "name": "painted", "width": 4, "height": 4 }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "world.paint_tiles",
        root_str,
        json!({ "name": "painted", "x0": 0, "y0": 0, "x1": 1, "y1": 1, "value": 5 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.paint_tiles");
    assert!(out["painted"].as_u64().unwrap() > 0);
}

#[test]
fn world_erase_tiles_clears_region() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "world.create_tilemap",
        root_str,
        json!({ "name": "erase", "width": 4, "height": 4 }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "world.erase_tiles",
        root_str,
        json!({ "name": "erase", "x0": 0, "y0": 0, "x1": 1, "y1": 1, "value": 0 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.erase_tiles");
    // erase_tiles swaps `painted` for `erased: true`.
    assert!(out["erased"].as_bool().unwrap());
}

#[test]
fn world_import_tileset_copies_image_and_writes_config() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create a fake source image outside assets/.
    let src = root.join("source_tileset.png");
    std::fs::write(&src, b"fake-png").unwrap();

    let req = make_request(
        "world.import_tileset",
        root_str,
        json!({ "source": src.to_string_lossy(), "name": "outdoor", "tile_size": 16 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.import_tileset");
    assert!(out["imported"].as_bool().unwrap());

    let img_dest = root
        .join("assets")
        .join("textures")
        .join("tilesets")
        .join("outdoor.png");
    assert!(img_dest.exists());

    let config_path = root
        .join("assets")
        .join("textures")
        .join("tilesets")
        .join("outdoor.tileset.json");
    assert!(config_path.exists());
}

#[test]
fn world_create_terrain_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "world.create_terrain",
        root_str,
        json!({ "name": "island", "width": 128, "height": 128 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.create_terrain");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("assets")
        .join("terrain")
        .join("island.terrain.json");
    assert!(path.exists());
}

#[test]
fn world_set_terrain_height_appends_edit() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request("world.create_terrain", root_str, json!({ "name": "hills" }));
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "world.set_terrain_height",
        root_str,
        json!({ "name": "hills", "x": 4.0, "y": 5.0, "height": 12.5 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.set_terrain_height");
    assert!(out["set"].as_bool().unwrap());

    let path = root
        .join("assets")
        .join("terrain")
        .join("hills.terrain.json");
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("height_edits"));
}

#[test]
fn world_paint_terrain_layer_appends_layer() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request("world.create_terrain", root_str, json!({ "name": "splat" }));
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "world.paint_terrain_layer",
        root_str,
        json!({ "name": "splat", "layer": "grass", "texture": "textures/grass.png" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.paint_terrain_layer");
    assert!(out["painted"].as_bool().unwrap());
    assert_eq!(out["layer"]["name"].as_str().unwrap(), "grass");
}

#[test]
fn world_create_nav_area_appends_to_registry() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "world.create_nav_area",
        root_str,
        json!({ "name": "patrol_a", "bounds": { "min": [0, 0, 0], "max": [10, 0, 10] } }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.create_nav_area");
    assert!(out["added"].as_bool().unwrap());

    let nav_path = root.join(".project").join("navigation-areas.json");
    assert!(nav_path.exists());
    let body = std::fs::read_to_string(&nav_path).unwrap();
    assert!(body.contains("patrol_a"));
}

#[test]
fn world_inspect_bounds_reads_node_position() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let scene_xml = "<scene>\n  <node id=\"1\" name=\"Root\" position=\"1 2 3\" />\n</scene>\n";
    std::fs::create_dir_all(root.join("scenes")).unwrap();
    let rel = "scenes/bounds.scene";
    std::fs::write(root.join(rel), scene_xml).unwrap();

    let req = make_request(
        "world.inspect_bounds",
        root_str,
        json!({ "scene_path": rel, "node_id": "1" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "world.inspect_bounds");
    assert_eq!(out["node_id"].as_str().unwrap(), "1");
    assert!(out["bounds"]["position"].is_string());
}

// ============================================================
// physics.*
// ============================================================

#[test]
fn physics_create_rigidbody_appends_to_overrides() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.create_rigidbody",
        root_str,
        json!({ "name": "player_body", "body_type": "dynamic", "mass": 2.5 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.create_rigidbody");
    assert!(out["created"].as_bool().unwrap());

    let overrides_path = root.join(".project").join("physics-overrides.json");
    assert!(overrides_path.exists());
    let body = std::fs::read_to_string(&overrides_path).unwrap();
    assert!(body.contains("player_body"));
}

#[test]
fn physics_create_collider_appends_to_overrides() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.create_collider",
        root_str,
        json!({ "node_id": "1", "shape": "sphere", "size": [0.5, 0.5, 0.5] }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.create_collider");
    assert!(out["created"].as_bool().unwrap());

    let body =
        std::fs::read_to_string(root.join(".project").join("physics-overrides.json")).unwrap();
    assert!(body.contains("sphere"));
}

#[test]
fn physics_set_collision_layer_updates_body() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "physics.create_rigidbody",
        root_str,
        json!({ "name": "enemy_body" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "physics.set_collision_layer",
        root_str,
        json!({ "name": "enemy_body", "layer": 2, "mask": 0xFF }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.set_collision_layer");
    assert!(out["set"].as_bool().unwrap());
    assert_eq!(out["layer"].as_u64().unwrap(), 2);
}

#[test]
fn physics_set_collision_layer_reports_missing_body() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.set_collision_layer",
        root_str,
        json!({ "name": "ghost_body", "layer": 1 }),
    );
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert!(res.output["error"].as_str().unwrap().contains("not found"));
}

#[test]
fn physics_set_material_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.set_material",
        root_str,
        json!({ "name": "ice", "friction": 0.05, "restitution": 0.3 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.set_material");
    assert!(out["written"].as_bool().unwrap());

    let path = root
        .join(".project")
        .join("physics-materials")
        .join("ice.json");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("ice"));
}

#[test]
fn physics_raycast_appends_helper_function() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("physics.raycast", root_str, json!({ "name": "aim" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.raycast");
    assert!(out["added"].as_bool().unwrap());

    let path = root.join("scripts").join("systems").join("physics.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("raycast_aim"));
}

#[test]
fn physics_overlap_query_appends_helper() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.overlap_query",
        root_str,
        json!({ "name": "explosion" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.overlap_query");
    assert!(out["added"].as_bool().unwrap());

    let path = root.join("scripts").join("systems").join("physics.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("overlap_explosion"));
}

#[test]
fn physics_create_character_controller_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.create_character_controller",
        root_str,
        json!({ "name": "player", "height": 1.8, "radius": 0.3 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.create_character_controller");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("systems")
        .join("character_controllers")
        .join("player.lua");
    assert!(path.exists());
}

#[test]
fn physics_create_joint_appends_to_overrides() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.create_joint",
        root_str,
        json!({ "joint_type": "hinge", "body_a": "door", "body_b": "frame" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.create_joint");
    assert!(out["created"].as_bool().unwrap());

    let body =
        std::fs::read_to_string(root.join(".project").join("physics-overrides.json")).unwrap();
    assert!(body.contains("hinge"));
    assert!(body.contains("door"));
}

#[test]
fn physics_set_gravity_updates_project_json() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "physics.set_gravity",
        root_str,
        json!({ "gravity": [0.0, -20.0, 0.0] }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "physics.set_gravity");
    assert!(out["updated"].as_bool().unwrap());

    let path = root.join(".project").join("project.json");
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("gravity"));
}

// ============================================================
// vfx.*
// ============================================================

#[test]
fn vfx_create_emitter_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "vfx.create_emitter",
        root_str,
        json!({ "name": "fire", "max_particles": 500, "lifetime": 1.5 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "vfx.create_emitter");
    assert!(out["created"].as_bool().unwrap());

    let path = root.join("assets").join("vfx").join("fire.particle.json");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("fire"));
}

#[test]
fn vfx_set_properties_patches_emitter() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request("vfx.create_emitter", root_str, json!({ "name": "smoke" }));
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "vfx.set_properties",
        root_str,
        json!({ "name": "smoke", "properties": { "emission_rate": 50.0, "shape": "cone" } }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "vfx.set_properties");
    assert!(out["updated"].as_u64().unwrap() >= 1);

    let body = std::fs::read_to_string(root.join("assets").join("vfx").join("smoke.particle.json"))
        .unwrap();
    assert!(body.contains("cone"));
}

#[test]
fn vfx_play_appends_helper_function() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("vfx.play", root_str, json!({ "name": "burst" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "vfx.play");
    assert!(out["added"].as_bool().unwrap());

    let path = root.join("scripts").join("systems").join("vfx.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("play_burst"));
}

#[test]
fn vfx_stop_appends_helper_function() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("vfx.stop", root_str, json!({ "name": "burst" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "vfx.stop");
    assert!(out["added"].as_bool().unwrap());

    let body =
        std::fs::read_to_string(root.join("scripts").join("systems").join("vfx.lua")).unwrap();
    assert!(body.contains("stop_burst"));
}

#[test]
fn vfx_create_trail_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "vfx.create_trail",
        root_str,
        json!({ "name": "spark_trail" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "vfx.create_trail");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("systems")
        .join("vfx")
        .join("trail_spark_trail.lua");
    assert!(path.exists());
}

#[test]
fn vfx_create_decal_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("vfx.create_decal", root_str, json!({ "name": "scorch" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "vfx.create_decal");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("systems")
        .join("vfx")
        .join("decal_scorch.lua");
    assert!(path.exists());
}
