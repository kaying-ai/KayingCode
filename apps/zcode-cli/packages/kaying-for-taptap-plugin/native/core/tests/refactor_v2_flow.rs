//! End-to-end Agent flow regression for the Stage J refactor workflow.
//!
//! Simulates the full refactor lifecycle an Agent would drive:
//! 1. `project.backup` → snapshot original state
//! 2. `project.refactor_to_modular_v2` → apply v2 restructure
//! 3. `project.validate` → confirm structure compliance
//! 4. `project.list_backups` → verify backup is present
//! 5. `project.refactor_rollback` → restore original state
//!
//! This locks the Stage J workflow contract.

mod common;
use common::{assert_success, make_request, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

const LEGACY_MAIN_LUA: &str = "\
local M = {}\n\
\n\
function ShowMainMenu()\n\
    UI.SetRoot({})\n\
end\n\
\n\
function draw_hud(player)\n\
    set_text(\"hp: \" .. player.hp)\n\
end\n\
\n\
function save_game(state)\n\
    write_file(\"save.json\", json.encode(state))\n\
end\n\
\n\
return M\n\
";

#[test]
fn agent_refactor_v2_workflow_backup_validate_rollback() {
    let provider = TapTapProvider::new();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    std::fs::write(root.join("scripts/main.lua"), LEGACY_MAIN_LUA).unwrap();
    let root_str = root.to_str().unwrap();

    // --- Step 1: backup original state ---
    let req = make_request(
        "project.backup",
        root_str,
        json!({ "reason": "pre-refactor" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.backup");
    let original_backup_id = out["backup_id"].as_str().unwrap().to_string();

    // --- Step 2: apply refactor_to_modular_v2 ---
    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");
    assert!(
        out["refactored"].as_bool().unwrap(),
        "refactor should succeed"
    );
    assert_eq!(out["structure_after"].as_str().unwrap(), "modular");

    // Scaffolding must be in place.
    assert!(root.join("scripts/bootstrap.lua").exists());
    assert!(root.join("scripts/lib/event.lua").exists());
    assert!(root.join(".project/surfaces.json").exists());

    // --- Step 3: project.validate must pass structural checks ---
    let req = make_request("project.validate", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.validate");
    let checks = out["modular"]["checks"].as_array();
    if let Some(checks) = checks {
        let errors: Vec<_> = checks
            .iter()
            .filter(|c| c["severity"].as_str() == Some("error"))
            .collect();
        assert!(
            errors.is_empty(),
            "post-refactor project should pass Error checks: {errors:?}"
        );
    }

    // --- Step 4: list_backups confirms original snapshot exists ---
    let req = make_request("project.list_backups", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.list_backups");
    let backups = out["backups"].as_array().unwrap();
    assert!(
        backups
            .iter()
            .any(|b| b["id"].as_str() == Some(&original_backup_id)),
        "original backup {original_backup_id} should be listed"
    );

    // --- Step 5: rollback to the pre-refactor snapshot ---
    let req = make_request(
        "project.refactor_rollback",
        root_str,
        json!({ "backup_id": original_backup_id, "snapshot_before": false }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_rollback");
    assert!(out["restored"].as_bool().unwrap());

    // The rolled-back main.lua should contain the original legacy code.
    let body = std::fs::read_to_string(root.join("scripts/main.lua")).unwrap();
    assert!(
        body.contains("function draw_hud"),
        "rolled-back main.lua should contain original function, got: {body}"
    );

    // The v2 scaffolding should be gone after rollback.
    assert!(
        !root.join("scripts/bootstrap.lua").exists(),
        "bootstrap.lua should be removed after rollback"
    );
    assert!(
        !root.join("scripts/lib/event.lua").exists(),
        "lib/event.lua should be removed after rollback"
    );
}
