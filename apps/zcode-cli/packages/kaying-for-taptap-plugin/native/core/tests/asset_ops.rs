//! Integration tests for `asset.*` operations.

mod common;

use common::{assert_success, make_request, make_request_bare, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

#[test]
fn asset_list_returns_empty_when_no_assets() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("asset.list", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "asset.list");
    assert_eq!(out["count"].as_u64().unwrap_or(1), 0);
    assert!(out["assets"].is_array());
}

#[test]
fn asset_list_reports_missing_assets_dir() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    // Scaffold project but remove assets/ to simulate misconfiguration.
    std::fs::create_dir_all(temp.path().join(".project")).unwrap();
    std::fs::write(
        temp.path().join(".project").join("project.json"),
        "{\"entry\":\"scripts/main.lua\"}",
    )
    .unwrap();
    std::fs::create_dir_all(temp.path().join("scripts")).unwrap();
    std::fs::write(temp.path().join("scripts").join("main.lua"), "--").unwrap();

    let req = make_request_bare("asset.list", temp.path().to_str().unwrap());
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert_eq!(res.exit_code, Some(1));
    assert!(res.output["error"].as_str().unwrap().contains("assets/"));
}

#[test]
fn asset_create_folder_creates_nested_directory() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "asset.create_folder",
        root_str,
        json!({ "folder_path": "textures/tilesets" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "asset.create_folder");
    assert!(out["created"].as_bool().unwrap());
    assert!(
        root.join("assets")
            .join("textures")
            .join("tilesets")
            .is_dir()
    );
}

#[test]
fn asset_create_writes_file_with_content() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "asset.create",
        root_str,
        json!({ "path": "config/settings.json", "content": "{\"volume\":0.8}" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "asset.create");
    assert!(out["created"].as_bool().unwrap());

    let body =
        std::fs::read_to_string(root.join("assets").join("config").join("settings.json")).unwrap();
    assert!(body.contains("volume"));
}

#[test]
fn asset_import_copies_file_into_assets() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create a source file outside assets/.
    let src = root.join("source.png");
    std::fs::write(&src, b"fake-png-bytes").unwrap();

    let req = make_request(
        "asset.import",
        root_str,
        json!({ "source_path": src.to_string_lossy(), "target_path": "sprites/hero.png" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "asset.import");
    assert!(out["imported"].as_bool().unwrap());

    let dest = root.join("assets").join("sprites").join("hero.png");
    assert!(dest.exists());
    assert_eq!(std::fs::read(&dest).unwrap(), b"fake-png-bytes");
}

#[test]
fn asset_delete_removes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create a file to delete.
    let target = root.join("assets").join("junk.txt");
    std::fs::write(&target, "delete-me").unwrap();
    assert!(target.exists());

    let req = make_request("asset.delete", root_str, json!({ "path": "junk.txt" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "asset.delete");
    assert!(out["deleted"].as_bool().unwrap());
    assert!(!target.exists());
}

#[test]
fn asset_rename_moves_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let src = root.join("assets").join("old-name.txt");
    std::fs::write(&src, "data").unwrap();

    let req = make_request(
        "asset.rename",
        root_str,
        json!({ "source": "old-name.txt", "target": "new-name.txt" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "asset.rename");
    assert!(out["renamed"].as_bool().unwrap());
    assert!(!src.exists());
    assert!(root.join("assets").join("new-name.txt").exists());
}

#[test]
fn asset_list_includes_directories_and_files_recursively() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    std::fs::write(root.join("assets").join("a.txt"), "a").unwrap();
    std::fs::create_dir_all(root.join("assets").join("sub")).unwrap();
    std::fs::write(root.join("assets").join("sub").join("b.txt"), "b").unwrap();

    let req = make_request_bare("asset.list", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "asset.list");
    // a.txt + sub/ (directory) + sub/b.txt = 3 entries.
    assert_eq!(out["count"].as_u64().unwrap(), 3);
}
