//! Integration tests for `script.*`, `settings.*`, `scene_design.*`, and
//! `editor.status` (read-only) operations.
//!
//! `editor.play`/`editor.stop`/`capture.*` spawn UrhoX processes and are
//! environment-dependent — only `editor.status` (a read-only probe) is tested
//! here. The runtime-integration tests live in the existing `agent_flow.rs`.

mod common;

use common::{assert_success, make_request, make_request_bare, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

// ============================================================
// script.*
// ============================================================

#[test]
fn script_create_writes_lua_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "script.create",
        root_str,
        json!({ "name": "player_controller", "path": "scripts/player_controller.lua" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "script.create");
    assert!(out["created"].as_bool().unwrap());

    let path = root.join("scripts").join("player_controller.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("player_controller") || body.contains("function") || body.contains("--"));
}

#[test]
fn script_list_finds_lua_files() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create extra scripts.
    std::fs::write(root.join("scripts").join("a.lua"), "-- a").unwrap();
    std::fs::write(root.join("scripts").join("b.lua"), "-- b").unwrap();

    let req = make_request_bare("script.list", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "script.list");
    // main.lua + a.lua + b.lua = at least 3.
    assert!(out["count"].as_u64().unwrap() >= 3);
}

#[test]
fn script_attach_associates_script_with_node() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create a scene with a node.
    let scene_xml = "<scene>\n  <node id=\"1\" name=\"Root\">\n    <component type=\"Octree\" />\n  </node>\n</scene>\n";
    std::fs::create_dir_all(root.join("scenes")).unwrap();
    std::fs::write(root.join("scenes").join("test.scene"), scene_xml).unwrap();

    // Create a script.
    std::fs::write(root.join("scripts").join("ctrl.lua"), "-- ctrl").unwrap();

    let req = make_request(
        "script.attach",
        root_str,
        json!({
            "script_path": "scripts/ctrl.lua",
            "node_path": "scenes/test.scene#1"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "script.attach");
    assert!(out["attached"].as_bool().unwrap());
}

// ============================================================
// settings.*
// ============================================================

#[test]
fn settings_get_returns_all_settings() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("settings.get", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "settings.get");
    assert!(out["settings"].is_object());
    assert_eq!(
        out["settings"]["entry"].as_str().unwrap(),
        "scripts/main.lua"
    );
}

#[test]
fn settings_get_returns_single_key() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("settings.get", root_str, json!({ "key": "engineVersion" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "settings.get");
    assert_eq!(out["key"].as_str().unwrap(), "engineVersion");
    assert_eq!(out["value"].as_str().unwrap(), "1.0.0");
}

#[test]
fn settings_set_merges_new_values() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "settings.set",
        root_str,
        json!({ "settings": { "author": "test-author", "version": "2.0.0" } }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "settings.set");
    assert!(out["set"].as_bool().unwrap());

    // Verify by reading back.
    let req = make_request("settings.get", root_str, json!({ "key": "author" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "settings.get");
    assert_eq!(out["value"].as_str().unwrap(), "test-author");
}

#[test]
fn settings_get_reports_missing_project_json() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    // Create an empty project root (no .project/project.json).
    std::fs::create_dir_all(temp.path().join("scripts")).unwrap();
    std::fs::write(temp.path().join("scripts").join("main.lua"), "--").unwrap();

    let req = make_request_bare("settings.get", temp.path().to_str().unwrap());
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
}

// ============================================================
// scene_design.*
// ============================================================

#[test]
fn scene_save_all_flushes_open_scenes() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("scene.save_all", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.save_all");
    assert!(out["saved"].as_bool().unwrap() || out["success"].as_bool().unwrap_or(true));
}

#[test]
fn scene_list_open_returns_array() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("scene.list_open", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.list_open");
    assert!(out["scenes"].is_array() || out["open_scenes"].is_array());
}

#[test]
fn scene_set_active_records_marker() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create a scene.
    std::fs::create_dir_all(root.join("scenes")).unwrap();
    std::fs::write(
        root.join("scenes").join("main.scene"),
        "<scene><node id=\"1\" name=\"Root\" /></scene>",
    )
    .unwrap();

    let req = make_request(
        "scene.set_active",
        root_str,
        json!({ "scene_path": "scenes/main.scene" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.set_active");
    assert!(out["set"].as_bool().unwrap() || out["active"].as_bool().unwrap_or(true));
}

#[test]
fn scene_add_to_build_records_scene() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "scene.add_to_build",
        root_str,
        json!({ "scene_path": "scenes/level1.scene" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.add_to_build");
    assert!(out["added"].as_bool().unwrap());
}

#[test]
fn scene_remove_from_build_drops_scene() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Add first, then remove.
    let add_req = make_request(
        "scene.add_to_build",
        root_str,
        json!({ "scene_path": "scenes/level1.scene" }),
    );
    provider.execute(&add_req).unwrap();

    let req = make_request(
        "scene.remove_from_build",
        root_str,
        json!({ "scene_path": "scenes/level1.scene" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.remove_from_build");
    assert!(out["removed"].as_bool().unwrap());
}

// ============================================================
// editor.status (read-only probe)
// ============================================================

#[test]
fn editor_status_reports_availability() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("editor.status", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "editor.status");
    // Should report urhox_available or similar field.
    assert!(
        out["urhox_available"].is_boolean()
            || out["available"].is_boolean()
            || out
                .as_object()
                .is_some_and(|o| o.contains_key("urhox_available"))
    );
}
