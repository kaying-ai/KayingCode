//! Integration tests for `prefab.*`, `material.*`, and `package.*` operations.

mod common;

use common::{assert_success, make_request, make_request_bare, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

/// Safe scene XML fixture: parent node uses non-self-closing form so
/// `prefab.instantiate` can locate `</node>` and insert under it.
const SCENE_XML: &str = "<scene>\n  <node id=\"1\" name=\"Root\">\n    <component type=\"Octree\" />\n  </node>\n</scene>\n";

fn write_scene(root: &std::path::Path, name: &str) -> String {
    let scenes_dir = root.join("scenes");
    std::fs::create_dir_all(&scenes_dir).unwrap();
    let rel = format!("scenes/{name}.scene");
    std::fs::write(root.join(&rel), SCENE_XML).unwrap();
    rel
}

// ============================================================
// prefab.*
// ============================================================

#[test]
fn prefab_create_writes_default_prefab_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("prefab.create", root_str, json!({ "name": "enemy" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "prefab.create");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["name"].as_str().unwrap(), "enemy");

    let prefab_file = root.join("prefabs").join("enemy.prefab");
    assert!(prefab_file.exists());
    let body = std::fs::read_to_string(&prefab_file).unwrap();
    assert!(body.contains("<prefab>"));
}

#[test]
fn prefab_create_rejects_duplicate() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("prefab.create", root_str, json!({ "name": "dup" }));
    let _ = provider.execute(&req).unwrap();
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert_eq!(res.exit_code, Some(1));
    assert!(
        res.output["error"]
            .as_str()
            .unwrap()
            .contains("already exists")
    );
}

#[test]
fn prefab_instantiate_inserts_under_parent() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create the prefab first.
    let create_req = make_request(
        "prefab.create",
        root_str,
        json!({
            "name": "crate",
            "content": "<?xml version=\"1.0\"?>\n<prefab>\n  <node id=\"1\" name=\"Crate\" />\n</prefab>\n"
        }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let rel = write_scene(&root, "level");

    let req = make_request(
        "prefab.instantiate",
        root_str,
        json!({ "name": "crate", "scene_path": rel, "parent_id": "1" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "prefab.instantiate");
    assert!(out["instantiated"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join(&rel)).unwrap();
    // The prefab's node should have been stamped with prefab="crate".
    assert!(body.contains("prefab=\"crate\""));
}

#[test]
fn prefab_instantiate_reports_missing_prefab() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let rel = write_scene(&root, "main");

    let req = make_request(
        "prefab.instantiate",
        root_str,
        json!({ "name": "ghost", "scene_path": rel, "parent_id": "1" }),
    );
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert!(res.output["error"].as_str().unwrap().contains("not found"));
}

#[test]
fn prefab_create_variant_derives_from_base() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Base prefab.
    let base_req = make_request("prefab.create", root_str, json!({ "name": "base" }));
    let _ = provider.execute(&base_req).unwrap();

    let req = make_request(
        "prefab.create_variant",
        root_str,
        json!({
            "base": "base",
            "name": "variant_a",
            "overrides": { "color": "red" }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "prefab.create_variant");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["base"].as_str().unwrap(), "base");
    assert_eq!(out["name"].as_str().unwrap(), "variant_a");

    let variant_file = root.join("prefabs").join("variant_a.prefab");
    assert!(variant_file.exists());
    let body = std::fs::read_to_string(&variant_file).unwrap();
    assert!(body.contains("variant: variant_a"));
}

#[test]
fn prefab_apply_overrides_writes_sidecar_json() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request("prefab.create", root_str, json!({ "name": "hero" }));
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "prefab.apply_overrides",
        root_str,
        json!({ "name": "hero", "overrides": { "scale": 1.5, "color": "blue" } }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "prefab.apply_overrides");
    assert!(out["applied"].as_bool().unwrap());

    let sidecar = root.join("prefabs").join("hero.prefab.overrides.json");
    assert!(sidecar.exists());
    let body = std::fs::read_to_string(&sidecar).unwrap();
    assert!(body.contains("scale"));
    assert!(body.contains("blue"));
}

#[test]
fn prefab_unpack_removes_prefab_attribute() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Set up a scene with a node that already has prefab="..." attribute.
    let scene_xml = "<scene>\n  <node id=\"1\" name=\"Root\">\n    <component type=\"Octree\" />\n  </node>\n  <node id=\"2\" name=\"Crate\" prefab=\"crate\" />\n</scene>\n";
    std::fs::create_dir_all(root.join("scenes")).unwrap();
    let rel = "scenes/unpack.scene";
    std::fs::write(root.join(rel), scene_xml).unwrap();

    let req = make_request(
        "prefab.unpack",
        root_str,
        json!({ "scene_path": rel, "node_id": "2" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "prefab.unpack");
    assert!(out["unpacked"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join(rel)).unwrap();
    assert!(!body.contains("prefab=\"crate\""));
}

#[test]
fn prefab_save_contents_extracts_subtree() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Scene with two nodes.
    let scene_xml = "<scene>\n  <node id=\"1\" name=\"Root\">\n    <node id=\"2\" name=\"Player\">\n      <component type=\"StaticModel\" />\n    </node>\n  </node>\n</scene>\n";
    std::fs::create_dir_all(root.join("scenes")).unwrap();
    let rel = "scenes/extract.scene";
    std::fs::write(root.join(rel), scene_xml).unwrap();

    let req = make_request(
        "prefab.save_contents",
        root_str,
        json!({ "name": "player_prefab", "scene_path": rel, "node_id": "2" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "prefab.save_contents");
    assert!(out["saved"].as_bool().unwrap());

    let prefab_file = root.join("prefabs").join("player_prefab.prefab");
    assert!(prefab_file.exists());
    let body = std::fs::read_to_string(&prefab_file).unwrap();
    assert!(body.contains("Player"));
}

// ============================================================
// material.*
// ============================================================

#[test]
fn material_set_properties_writes_uniforms() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "material.set_properties",
        root_str,
        json!({
            "name": "skin",
            "properties": { "baseColor": [1.0, 0.0, 0.0], "roughness": 0.5 }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "material.set_properties");
    assert!(out["updated"].as_bool().unwrap());

    let mat_file = root.join("assets").join("materials").join("skin.material");
    assert!(mat_file.exists());
    let body = std::fs::read_to_string(&mat_file).unwrap();
    assert!(body.contains("baseColor"));
    assert!(body.contains("roughness"));
}

#[test]
fn material_get_properties_reads_uniforms() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Write a material first.
    let set_req = make_request(
        "material.set_properties",
        root_str,
        json!({ "name": "metal", "properties": { "shine": 0.8 } }),
    );
    let _ = provider.execute(&set_req).unwrap();

    let req = make_request(
        "material.get_properties",
        root_str,
        json!({ "name": "metal" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "material.get_properties");
    assert_eq!(out["name"].as_str().unwrap(), "metal");
    assert!(out["properties"].is_array());
}

#[test]
fn material_get_properties_reports_missing_material() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "material.get_properties",
        root_str,
        json!({ "name": "ghost" }),
    );
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert!(res.output["error"].as_str().unwrap().contains("not found"));
}

#[test]
fn material_list_shaders_returns_array() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Drop a fake shader file.
    let shaders_dir = root.join("assets").join("shaders");
    std::fs::create_dir_all(&shaders_dir).unwrap();
    std::fs::write(shaders_dir.join("lit.shader"), "uniform vec3 color;\n").unwrap();

    let req = make_request_bare("material.list_shaders", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "material.list_shaders");
    assert!(out["shaders"].is_array());
    assert!(out["count"].as_u64().unwrap() >= 1);
}

#[test]
fn material_get_shader_properties_parses_uniforms() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Drop a fake shader file.
    let shaders_dir = root.join("assets").join("shaders");
    std::fs::create_dir_all(&shaders_dir).unwrap();
    std::fs::write(
        shaders_dir.join("fxaa.shader"),
        "uniform vec2 resolution;\nuniform float intensity;\n",
    )
    .unwrap();

    let req = make_request(
        "material.get_shader_properties",
        root_str,
        json!({ "name": "fxaa" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "material.get_shader_properties");
    assert!(out["uniforms"].is_array());
    // Should have at least 2 uniforms.
    assert!(out["uniforms"].as_array().unwrap().len() >= 2);
}

// ============================================================
// package.*
// ============================================================

#[test]
fn package_list_returns_empty_when_no_lib() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("package.list", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "package.list");
    assert_eq!(out["count"].as_u64().unwrap(), 0);
    assert!(out["modules"].is_array());
}

#[test]
fn package_add_creates_module_stub() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("package.add", root_str, json!({ "name": "event_bus" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "package.add");
    assert!(out["added"].as_bool().unwrap());

    let module_path = root.join("scripts").join("lib").join("event_bus.lua");
    assert!(module_path.exists());
    let body = std::fs::read_to_string(&module_path).unwrap();
    assert!(body.contains("event_bus"));
}

#[test]
fn package_add_rejects_duplicate() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("package.add", root_str, json!({ "name": "dup" }));
    let _ = provider.execute(&req).unwrap();
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert!(
        res.output["error"]
            .as_str()
            .unwrap()
            .contains("already exists")
    );
}

#[test]
fn package_remove_deletes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let add_req = make_request("package.add", root_str, json!({ "name": "trash" }));
    let _ = provider.execute(&add_req).unwrap();
    let module_path = root.join("scripts").join("lib").join("trash.lua");
    assert!(module_path.exists());

    let req = make_request("package.remove", root_str, json!({ "name": "trash" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "package.remove");
    assert!(out["removed"].as_bool().unwrap());
    assert!(!module_path.exists());
}

#[test]
fn package_resolve_detects_missing_requires() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // main.lua requires a module that doesn't exist.
    std::fs::write(
        root.join("scripts").join("main.lua"),
        "require \"scripts.lib.does_not_exist\"\n",
    )
    .unwrap();

    let req = make_request_bare("package.resolve", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "package.resolve");
    // At least one missing require should be reported.
    assert!(out["missing"].is_array());
    assert!(out["missing"].as_array().unwrap().len() >= 1);
    assert!(!out["all_resolved"].as_bool().unwrap());
}

#[test]
fn package_resolve_reports_all_resolved_when_clean() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // main.lua has no requires.
    std::fs::write(root.join("scripts").join("main.lua"), "-- no deps\n").unwrap();

    let req = make_request_bare("package.resolve", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "package.resolve");
    assert!(out["all_resolved"].as_bool().unwrap());
}

#[test]
fn package_status_builds_dependency_graph() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Add a lib module and a require edge.
    std::fs::create_dir_all(root.join("scripts").join("lib")).unwrap();
    std::fs::write(
        root.join("scripts").join("lib").join("util.lua"),
        "-- util\n",
    )
    .unwrap();
    std::fs::write(
        root.join("scripts").join("main.lua"),
        "require \"scripts.lib.util\"\n",
    )
    .unwrap();

    let req = make_request_bare("package.status", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "package.status");
    assert!(out["nodes"].is_array());
    assert!(out["edges"].is_array());
    // At least 2 nodes (main + util) and 1 edge.
    assert!(out["nodes"].as_array().unwrap().len() >= 2);
    assert!(out["edges"].as_array().unwrap().len() >= 1);
}
