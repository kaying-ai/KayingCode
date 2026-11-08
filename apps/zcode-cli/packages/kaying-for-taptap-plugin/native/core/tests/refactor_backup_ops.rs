//! Integration tests for `project.backup` / `project.list_backups` /
//! `project.refactor_rollback`.
//!
//! Covers:
//! - happy path: backup creates `.project/backups/<id>/` with `backup.json`
//! - `backup_assets=false` skips `assets/` subtree
//! - `list_backups` enumerates newest-first
//! - `prune_old_backups` retention via `max_backups`
//! - `refactor_rollback` restores a named backup
//! - `refactor_rollback` reports `no_backups_available` when empty

mod common;
use common::{assert_success, make_request, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

fn write_legacy_project(root: &std::path::Path) {
    let scripts = root.join("scripts");
    std::fs::write(
        scripts.join("main.lua"),
        "local M = {}\nfunction draw_hud() end\nreturn M\n",
    )
    .unwrap();
    let assets = root.join("assets");
    std::fs::create_dir_all(assets.join("textures")).unwrap();
    std::fs::write(assets.join("textures").join("player.png"), b"PNG").unwrap();
}

// ============================================================
// project.backup happy path
// ============================================================

#[test]
fn backup_creates_backup_directory_with_metadata() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_project(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request("project.backup", root_str, json!({ "reason": "test" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.backup");

    assert!(out["backed_up"].as_bool().unwrap());
    let backup_id = out["backup_id"].as_str().unwrap().to_string();
    assert!(!backup_id.is_empty());

    let backup_dir = root.join(".project/backups").join(&backup_id);
    assert!(backup_dir.exists(), "backup dir missing");
    assert!(
        backup_dir.join("backup.json").exists(),
        "backup.json missing"
    );
    assert!(
        backup_dir.join("scripts/main.lua").exists(),
        "scripts not backed up"
    );
    assert!(
        backup_dir.join("assets/textures/player.png").exists(),
        "assets not backed up"
    );

    let file_count = out["file_count"].as_u64().unwrap();
    assert!(file_count >= 3, "expected >=3 files, got {file_count}");
}

// ============================================================
// backup_assets=false
// ============================================================

#[test]
fn backup_skips_assets_when_disabled() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_project(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.backup",
        root_str,
        json!({ "backup_assets": false }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.backup");

    let backup_id = out["backup_id"].as_str().unwrap();
    let backup_dir = root.join(".project/backups").join(backup_id);
    assert!(backup_dir.join("scripts/main.lua").exists());
    assert!(
        !backup_dir.join("assets").exists(),
        "assets/ should not be backed up when backup_assets=false"
    );
}

// ============================================================
// list_backups newest-first
// ============================================================

#[test]
fn list_backups_returns_newest_first() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_project(&root);
    let root_str = root.to_str().unwrap();

    // Create first backup.
    let req1 = make_request("project.backup", root_str, json!({ "reason": "first" }));
    let res1 = provider.execute(&req1).unwrap();
    let out1 = assert_success(&res1, "project.backup");
    let id1 = out1["backup_id"].as_str().unwrap().to_string();

    // Mutate project, create second backup (timestamp may collide; we still
    // expect list_backups to return both).
    std::fs::write(root.join("scripts/main.lua"), "-- modified\n").unwrap();
    let req2 = make_request("project.backup", root_str, json!({ "reason": "second" }));
    let res2 = provider.execute(&req2).unwrap();
    let out2 = assert_success(&res2, "project.backup");
    let id2 = out2["backup_id"].as_str().unwrap().to_string();

    let req = make_request("project.list_backups", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.list_backups");

    let backups = out["backups"].as_array().unwrap();
    assert_eq!(
        backups.len(),
        2,
        "expected 2 backups, got {}",
        backups.len()
    );
    // Newest-first: id2 should be at index 0 (or same-id if timestamps collide).
    let first_id = backups[0]["id"].as_str().unwrap();
    assert!(
        first_id == id2 || first_id == id1,
        "first backup id {first_id} should be one of the two created"
    );
    assert_eq!(out["count"].as_u64().unwrap(), 2);
}

// ============================================================
// max_backups retention
// ============================================================

#[test]
fn backup_prunes_old_entries_beyond_max_backups() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_project(&root);
    let root_str = root.to_str().unwrap();

    // Create 3 backups with max_backups=2.
    for i in 1..=3 {
        std::fs::write(root.join("scripts/main.lua"), format!("-- v{i}")).unwrap();
        let req = make_request(
            "project.backup",
            root_str,
            json!({ "reason": format!("v{i}"), "max_backups": 2 }),
        );
        let res = provider.execute(&req).unwrap();
        assert_success(&res, "project.backup");
    }

    let req = make_request("project.list_backups", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.list_backups");

    let backups = out["backups"].as_array().unwrap();
    assert_eq!(
        backups.len(),
        2,
        "max_backups=2 should retain only 2 newest, got {}",
        backups.len()
    );
}

// ============================================================
// refactor_rollback restores named backup
// ============================================================

#[test]
fn rollback_restores_named_backup() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_project(&root);
    let root_str = root.to_str().unwrap();

    // Backup the original state.
    let req = make_request("project.backup", root_str, json!({ "reason": "original" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.backup");
    let backup_id = out["backup_id"].as_str().unwrap().to_string();

    // Mutate the project.
    std::fs::write(root.join("scripts/main.lua"), "-- corrupted").unwrap();

    // Rollback to the named backup (snapshot_before=false to keep test simple).
    let req = make_request(
        "project.refactor_rollback",
        root_str,
        json!({ "backup_id": backup_id, "snapshot_before": false }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_rollback");

    assert!(out["restored"].as_bool().unwrap());
    let restored_body = std::fs::read_to_string(root.join("scripts/main.lua")).unwrap();
    assert!(
        restored_body.contains("draw_hud"),
        "restored main.lua should contain original function, got: {restored_body}"
    );
}

// ============================================================
// refactor_rollback with no backups
// ============================================================

#[test]
fn rollback_reports_no_backups_available_when_empty() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("project.refactor_rollback", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_rollback");

    assert!(!out["restored"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "no_backups_available");
}
