//! Integration tests for `scene.*`, `gameobject.*`, and `component.*` operations.

mod common;

use common::{assert_success, make_request, make_request_bare, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

const SCENE_XML: &str = "<scene>\n  <node id=\"1\" name=\"Root\">\n    <component type=\"Octree\" />\n  </node>\n  <node id=\"2\" name=\"Player\">\n    <component type=\"StaticModel\" />\n  </node>\n</scene>\n";

fn write_scene(root: &std::path::Path, name: &str) -> String {
    let scenes_dir = root.join("scenes");
    std::fs::create_dir_all(&scenes_dir).unwrap();
    let rel = format!("scenes/{name}.scene");
    std::fs::write(root.join(&rel), SCENE_XML).unwrap();
    rel
}

// ============================================================
// scene.*
// ============================================================

#[test]
fn scene_create_writes_default_scene_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("scene.create", root_str, json!({ "name": "level1" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.create");
    assert!(out["created"].as_bool().unwrap());
    let path = out["path"].as_str().unwrap();
    assert!(std::path::Path::new(path).exists());
    let content = std::fs::read_to_string(path).unwrap();
    assert!(content.contains("<scene>"));
}

#[test]
fn scene_create_rejects_existing_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("scene.create", root_str, json!({ "name": "dup" }));
    let _ = provider.execute(&req).unwrap();
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert_eq!(res.exit_code, Some(1));
}

#[test]
fn scene_open_reads_content() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "main");

    let req = make_request("scene.open", root_str, json!({ "path": rel }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.open");
    assert!(out["content"].as_str().unwrap().contains("<scene>"));
    assert!(out["size"].as_u64().unwrap() > 0);
}

#[test]
fn scene_open_reports_missing_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "scene.open",
        root_str,
        json!({ "path": "scenes/missing.scene" }),
    );
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
}

#[test]
fn scene_save_writes_content() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "edit");

    let new_content = r#"<?xml version="1.0"?>
<scene>
  <node id="1" name="UpdatedRoot" />
</scene>
"#;
    let req = make_request(
        "scene.save",
        root_str,
        json!({ "path": rel, "content": new_content }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.save");
    assert!(out["saved"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(body.contains("UpdatedRoot"));
}

#[test]
fn scene_hierarchy_parses_nodes() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "hierarchy");

    let req = make_request("scene.hierarchy", root_str, json!({ "path": rel }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.hierarchy");
    assert!(out["tree"].is_object());
}

#[test]
fn scene_list_finds_scene_files() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_scene(&root, "alpha");
    write_scene(&root, "beta");

    let req = make_request_bare("scene.list", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "scene.list");
    assert!(out["count"].as_u64().unwrap() >= 2);
}

// ============================================================
// gameobject.*
// ============================================================

#[test]
fn gameobject_create_adds_node_to_scene() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "go");

    let req = make_request(
        "gameobject.create",
        root_str,
        json!({ "scene_path": rel, "name": "Enemy", "parent_id": "1" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameobject.create");
    assert!(out["created"].as_bool().unwrap());
    let node_id = out["node_id"]
        .as_u64()
        .unwrap_or_else(|| out["node_id"].as_str().unwrap().parse::<u64>().unwrap());
    assert!(node_id > 0);

    let body = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(body.contains("Enemy"));
}

#[test]
fn gameobject_list_returns_hierarchy() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "list");

    let req = make_request("gameobject.list", root_str, json!({ "scene_path": rel }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameobject.list");
    assert!(out["hierarchy"].is_object());
}

#[test]
fn gameobject_set_transform_updates_node_attributes() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "transform");

    let req = make_request(
        "gameobject.set_transform",
        root_str,
        json!({
            "scene_path": rel,
            "node_id": "2",
            "position": [1.0, 2.0, 3.0],
            "rotation": [0.0, 90.0, 0.0],
            "scale": [1.0, 1.0, 1.0]
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameobject.set_transform");
    assert!(out["updated"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(body.contains("position=\"1 2 3\""));
}

#[test]
fn gameobject_set_transform_rejects_empty_attributes() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "empty");

    let req = make_request(
        "gameobject.set_transform",
        root_str,
        json!({ "scene_path": rel, "node_id": "2" }),
    );
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert_eq!(res.exit_code, Some(1));
}

#[test]
fn gameobject_delete_removes_node() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "delete");

    let req = make_request(
        "gameobject.delete",
        root_str,
        json!({ "scene_path": rel, "node_id": "2" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameobject.delete");
    assert!(out["deleted"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(!body.contains("Player"));
}

#[test]
fn gameobject_delete_reports_missing_node() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "missing");

    let req = make_request(
        "gameobject.delete",
        root_str,
        json!({ "scene_path": rel, "node_id": "999" }),
    );
    let res = provider.execute(&req);
    // Missing node returns an error, not a failed result.
    assert!(res.is_err() || !res.unwrap().success);
}

// ============================================================
// component.*
// ============================================================

#[test]
fn component_add_attaches_component_to_node() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "comp");

    let req = make_request(
        "component.add",
        root_str,
        json!({
            "scene_path": rel,
            "node_id": "2",
            "component_type": "Light",
            "attributes": { "intensity": "1.0" }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "component.add");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["component_type"].as_str().unwrap(), "Light");

    let body = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(body.contains("Light"));
}

#[test]
fn component_remove_deletes_component_by_type() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "rem");
    // Node 2 already has a StaticModel component.

    let body_before = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(body_before.contains("StaticModel"));

    let req = make_request(
        "component.remove",
        root_str,
        json!({ "scene_path": rel, "node_id": "2", "component_type": "StaticModel" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "component.remove");
    assert!(out["removed"].as_bool().unwrap());

    let body_after = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(!body_after.contains("StaticModel"));
}

#[test]
fn component_get_properties_returns_attributes() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "props");
    // The default scene already has a StaticModel component on node 2.

    let req = make_request(
        "component.get_properties",
        root_str,
        json!({ "scene_path": rel, "node_id": "2", "component_type": "StaticModel" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "component.get_properties");
    assert_eq!(out["component_type"].as_str().unwrap(), "StaticModel");
}

#[test]
fn component_set_properties_updates_attributes() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "setprops");
    // Node 2 already has a StaticModel component.

    let req = make_request(
        "component.set_properties",
        root_str,
        json!({
            "scene_path": rel,
            "node_id": "2",
            "component_type": "StaticModel",
            "attributes": { "model": "Models/Player.mdl" }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "component.set_properties");
    assert!(out["updated"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join(&rel)).unwrap();
    assert!(body.contains("value=\"Models/Player.mdl\""));
}
