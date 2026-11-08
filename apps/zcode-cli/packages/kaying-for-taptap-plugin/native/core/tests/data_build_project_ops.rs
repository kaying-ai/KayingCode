//! Integration tests for `data.*`, `build.*`, and `project.*` operations.

mod common;

use common::{assert_success, make_request, make_request_bare, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

// ============================================================
// data.*
// ============================================================

#[test]
fn data_create_save_schema_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "data.create_save_schema",
        root_str,
        json!({
            "name": "player",
            "fields": [
                { "name": "hp", "type": "number", "required": true },
                { "name": "level", "type": "number", "required": true },
                { "name": "inventory", "type": "table", "required": false }
            ]
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.create_save_schema");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["fields"].as_u64().unwrap(), 3);

    let path = root.join("scripts").join("data").join("save_schema.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("player"));
    assert!(body.contains("hp"));
    assert!(body.contains("Schema.validate"));
}

#[test]
fn data_save_game_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("data.save_game", root_str, json!({ "slot": "auto" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.save_game");
    assert!(out["written"].as_bool().unwrap());
    assert_eq!(out["slot"].as_str().unwrap(), "auto");

    let path = root.join("scripts").join("data").join("save.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("Save.write"));
}

#[test]
fn data_load_game_ensures_read_function() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("data.load_game", root_str, json!({ "slot": "auto" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.load_game");
    assert!(out["ensured"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join("scripts").join("data").join("save.lua")).unwrap();
    assert!(body.contains("Save.read"));
}

#[test]
fn data_clear_save_ensures_clear_function() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("data.clear_save", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.clear_save");
    assert!(out["ensured"].as_bool().unwrap());

    let body = std::fs::read_to_string(root.join("scripts").join("data").join("save.lua")).unwrap();
    assert!(body.contains("Save.clear"));
}

#[test]
fn data_create_i18n_writes_locale_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "data.create_i18n",
        root_str,
        json!({
            "locale": "zh-CN",
            "table": {
                "start": "开始",
                "settings": "设置"
            }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.create_i18n");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["locale"].as_str().unwrap(), "zh-CN");
    assert_eq!(out["entries"].as_u64().unwrap(), 2);

    let path = root
        .join("scripts")
        .join("data")
        .join("i18n")
        .join("zh-CN.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("开始"));
}

#[test]
fn data_set_and_get_locale_round_trip() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let set_req = make_request("data.set_locale", root_str, json!({ "locale": "ja-JP" }));
    let set_res = provider.execute(&set_req).unwrap();
    let set_out = assert_success(&set_res, "data.set_locale");
    assert!(set_out["updated"].as_bool().unwrap());

    let get_req = make_request_bare("data.get_locale", root_str);
    let get_res = provider.execute(&get_req).unwrap();
    let get_out = assert_success(&get_res, "data.get_locale");
    assert_eq!(get_out["locale"].as_str().unwrap(), "ja-JP");
}

#[test]
fn data_create_config_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "data.create_config",
        root_str,
        json!({
            "name": "balance",
            "config": {
                "max_hp": 100,
                "respawn_seconds": 5,
                "friendly_fire": false
            }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.create_config");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["entries"].as_u64().unwrap(), 3);

    let path = root.join("scripts").join("data").join("balance_config.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("max_hp"));
    assert!(body.contains("balance"));
}

#[test]
fn data_validate_ensures_validator_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("data.validate", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.validate");
    assert!(out["ensured"].as_bool().unwrap());

    let path = root.join("scripts").join("data").join("validator.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("Validator"));
}

#[test]
fn data_migrate_appends_function() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "data.migrate",
        root_str,
        json!({ "from_version": "1", "to_version": "2" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "data.migrate");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["from_version"].as_str().unwrap(), "1");
    assert_eq!(out["to_version"].as_str().unwrap(), "2");

    let body = std::fs::read_to_string(root.join("scripts").join("data").join("save.lua")).unwrap();
    assert!(body.contains("Save.migrate_1_to_2"));
}

#[test]
fn data_migrate_rejects_duplicate() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "data.migrate",
        root_str,
        json!({ "from_version": "1", "to_version": "2" }),
    );
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

// ============================================================
// build.*
// ============================================================

#[test]
fn build_list_targets_returns_all_targets() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("build.list_targets", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "build.list_targets");
    let targets = out["targets"].as_array().unwrap();
    // android, ios, windows, macos, linux, web
    assert_eq!(targets.len(), 6);

    let ids: Vec<&str> = targets.iter().map(|t| t["id"].as_str().unwrap()).collect();
    assert!(ids.contains(&"android"));
    assert!(ids.contains(&"ios"));
    assert!(ids.contains(&"windows"));
    assert!(ids.contains(&"web"));
}

#[test]
fn build_switch_target_writes_build_target_json() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "build.switch_target",
        root_str,
        json!({ "target": "android" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "build.switch_target");
    assert!(out["switched"].as_bool().unwrap());
    assert_eq!(out["target"].as_str().unwrap(), "android");

    let path = root.join(".project").join("build-target.json");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("android"));
}

#[test]
fn build_switch_target_rejects_unknown_target() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("build.switch_target", root_str, json!({ "target": "ps5" }));
    let error = provider.prepare(&req).unwrap_err().to_string();
    assert!(error.contains("must be one of"), "{error}");
}

#[test]
fn build_status_reports_local_target_and_no_active_build() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Switch target first so build-target.json exists.
    let switch_req = make_request(
        "build.switch_target",
        root_str,
        json!({ "target": "windows" }),
    );
    let _ = provider.execute(&switch_req).unwrap();

    let req = make_request_bare("build.status", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "build.status");
    assert_eq!(out["current_target"].as_str().unwrap(), "windows");
    // No last-build.json present → no active build id.
    assert!(out["active_build_id"].is_null());
    // Maker not configured in temp dir → should be false.
    assert!(!out["maker_available"].as_bool().unwrap());
    assert_eq!(out["remote_status"]["status"].as_str().unwrap(), "none");
}

// ============================================================
// project.*
// ============================================================

#[test]
fn project_info_reads_project_metadata() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("project.info", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.info");
    assert_eq!(out["entry"].as_str().unwrap(), "scripts/main.lua");
    // Entry exists in the scaffold → no warnings expected.
    let warnings = out["warnings"].as_array().unwrap();
    assert!(warnings.is_empty());
}

#[test]
fn project_validate_passes_on_clean_scaffold() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("project.validate", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.validate");
    assert!(out["valid"].as_bool().unwrap());
    let checks = out["checks"].as_array().unwrap();
    // project.json, entry_point, scripts_dir, assets_dir — at least 4 checks.
    assert!(checks.len() >= 4);
}

#[test]
fn project_validate_flags_missing_entry() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Delete the entry file to break validation.
    std::fs::remove_file(root.join("scripts").join("main.lua")).unwrap();

    let req = make_request_bare("project.validate", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.validate");
    assert!(!out["valid"].as_bool().unwrap());
}

#[test]
fn project_init_modular_generates_full_scaffold() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root_str = temp.path().to_str().unwrap();

    let req = make_request(
        "project.init",
        root_str,
        json!({
            "template": "modular",
            "project_name": "demo-modular",
            "engine_version": "1.0.0",
            "ui_theme": "astroon"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.init");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["template"].as_str().unwrap(), "modular");
    assert_eq!(out["structure"].as_str().unwrap(), "modular");
    assert_eq!(out["ui_theme"].as_str().unwrap(), "astroon");

    // Verify modular scaffold artifacts.
    assert!(temp.path().join("scripts").join("main.lua").exists());
    assert!(temp.path().join("scripts").join("bootstrap.lua").exists());
    assert!(temp.path().join("AGENTS.md").exists());
    assert!(
        temp.path()
            .join("scripts")
            .join("ui")
            .join("init.lua")
            .exists()
    );
    assert!(
        temp.path()
            .join("scripts")
            .join("systems")
            .join("init.lua")
            .exists()
    );
    assert!(
        temp.path()
            .join("scripts")
            .join("gameplay")
            .join("init.lua")
            .exists()
    );
    assert!(
        temp.path()
            .join("scripts")
            .join("data")
            .join("init.lua")
            .exists()
    );
    assert!(
        temp.path()
            .join("scripts")
            .join("lib")
            .join("init.lua")
            .exists()
    );
    assert!(temp.path().join(".project").join("modules.json").exists());
    let theme: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(temp.path().join(".project").join("ui-theme.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(theme["selectedTheme"], "astroon");
    assert!(theme.get("visualSourcePolicy").is_none());

    // The modular scaffold should also pass project.validate.
    let validate_req = make_request_bare("project.validate", root_str);
    let validate_res = provider.execute(&validate_req).unwrap();
    let validate_out = assert_success(&validate_res, "project.validate");
    assert!(validate_out["valid"].as_bool().unwrap());
    assert!(validate_out["modular"]["enabled"].as_bool().unwrap());
}

#[test]
fn project_init_rejects_invalid_template() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root_str = temp.path().to_str().unwrap();

    let req = make_request(
        "project.init",
        root_str,
        json!({ "template": "unknown_template" }),
    );
    let error = provider.prepare(&req).unwrap_err().to_string();
    assert!(error.contains("must be one of"), "{error}");
}
