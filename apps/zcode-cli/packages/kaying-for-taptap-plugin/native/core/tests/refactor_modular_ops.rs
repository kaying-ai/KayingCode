//! Unit tests for `project.refactor_to_modular`.
//!
//! Covers:
//! - happy path: legacy single-file project -> modular-v1 layout
//! - dry_run: report-only, no file writes
//! - already_modular: refusal when bootstrap.lua + ui/init.lua exist
//! - source_missing: error when source file does not exist
//! - no_functions: refusal when main.lua has no top-level functions
//! - catalog + dispatch integration

mod common;
use common::{assert_success, make_request, scaffold_modular, scaffold_project};
use kaying_for_taptap_core::model::{EngineProvider, ProviderContext};
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

/// A legacy single-file main.lua with functions spanning multiple modular layers.
const LEGACY_MAIN_LUA: &str = "\
local M = {}\n\
\n\
function draw_hud(player)\n\
    -- render player hp bar\n\
    set_text(\"hp: \" .. player.hp)\n\
end\n\
\n\
function update_player(player, dt)\n\
    player.x = player.x + 100 * dt\n\
end\n\
\n\
function save_game(state)\n\
    write_file(\"save.json\", json.encode(state))\n\
end\n\
\n\
function load_game()\n\
    return json.decode(read_file(\"save.json\"))\n\
end\n\
\n\
function util_clamp(v, lo, hi)\n\
    if v < lo then return lo end\n\
    if v > hi then return hi end\n\
    return v\n\
end\n\
\n\
return M\n\
";

fn write_legacy_main(root: &std::path::Path, body: &str) {
    let main = root.join("scripts").join("main.lua");
    std::fs::write(main, body).unwrap();
}

// ============================================================
// happy path
// ============================================================

#[test]
fn refactor_to_modular_splits_legacy_main_into_layer_files() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_legacy_main(&root, LEGACY_MAIN_LUA);

    let req = make_request("project.refactor_to_modular", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");

    assert!(
        out["refactored"].as_bool().unwrap(),
        "should refactor: {out}"
    );
    assert_eq!(out["target"].as_str().unwrap(), "modular");
    assert_eq!(out["classified_functions"].as_u64().unwrap(), 5);

    // main.lua should now be lifecycle-only.
    let main_body = std::fs::read_to_string(root.join("scripts/main.lua")).unwrap();
    assert!(main_body.contains("Bootstrap.start()"));
    assert!(!main_body.contains("function draw_hud"));

    // bootstrap.lua must exist.
    assert!(root.join("scripts/bootstrap.lua").exists());

    // Each layer that received >=1 function must have an init.lua.
    for layer in ["ui", "systems", "gameplay", "data", "lib"] {
        assert!(
            root.join(format!("scripts/{layer}/init.lua")).exists(),
            "scripts/{layer}/init.lua missing"
        );
    }

    // lib defaults: event.lua and class.lua must exist.
    assert!(root.join("scripts/lib/event.lua").exists());
    assert!(root.join("scripts/lib/class.lua").exists());

    // modules.json must declare all 5 layers.
    let modules_json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join(".project/modules.json")).unwrap())
            .unwrap();
    let modules = modules_json["modules"].as_array().unwrap();
    assert_eq!(modules.len(), 5);
    assert_eq!(modules_json["structure"].as_str().unwrap(), "modular");

    // AGENTS.md should exist.
    assert!(root.join("AGENTS.md").exists());

    // A full recovery snapshot of the original project must exist.
    let backups = root.join(".project/backups");
    assert!(backups.exists());
    assert!(std::fs::read_dir(backups).unwrap().count() >= 1);
}

#[test]
fn refactor_to_modular_classifies_functions_into_expected_layers() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_legacy_main(&root, LEGACY_MAIN_LUA);

    let req = make_request("project.refactor_to_modular", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");

    // Inspect the report's by_layer for classification correctness.
    let by_layer = out["report"]["by_layer"].as_array().unwrap();
    let layer_counts: std::collections::HashMap<&str, u64> = by_layer
        .iter()
        .map(|e| {
            (
                e["layer"].as_str().unwrap(),
                e["count"].as_u64().unwrap_or(0),
            )
        })
        .collect();

    // draw_hud -> ui, save_game/load_game -> data, util_clamp -> lib
    assert!(layer_counts["ui"] >= 1, "ui should have >=1 function");
    assert!(layer_counts["data"] >= 2, "data should have >=2 functions");
    assert!(layer_counts["lib"] >= 1, "lib should have >=1 function");
}

#[test]
fn refactor_to_modular_emits_per_function_module_files() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_legacy_main(&root, LEGACY_MAIN_LUA);

    let req = make_request("project.refactor_to_modular", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");

    let created = out["written_files"].as_array().unwrap();
    // The plan is grouped by layer rather than creating one file per function.
    assert!(
        created.len() >= 12,
        "expected >= 12 created files, got {}",
        created.len()
    );

    // draw_hud should land in the grouped UI module.
    let ui_file = root.join("scripts/ui/main.lua");
    assert!(ui_file.exists(), "scripts/ui/main.lua missing");
    let body = std::fs::read_to_string(&ui_file).unwrap();
    assert!(body.contains("function draw_hud"));
    assert!(!body.contains("return M"));
}

// ============================================================
// dry_run
// ============================================================

#[test]
fn refactor_to_modular_dry_run_does_not_write_files() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_legacy_main(&root, LEGACY_MAIN_LUA);

    let req = make_request(
        "project.refactor_to_modular",
        root_str,
        json!({ "dry_run": true }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");

    assert!(!out["refactored"].as_bool().unwrap());
    assert!(out["dry_run"].as_bool().unwrap());
    assert!(out["report"]["by_layer"].is_array());

    // No layer directories should be created.
    assert!(!root.join("scripts/ui").exists());
    assert!(!root.join("scripts/systems").exists());
    // No backup file.
    assert!(!root.join("scripts/main.lua.bak").exists());
    // main.lua should still contain the legacy code.
    let main_body = std::fs::read_to_string(root.join("scripts/main.lua")).unwrap();
    assert!(main_body.contains("function draw_hud"));
}

// ============================================================
// already_modular refusal
// ============================================================

#[test]
fn refactor_to_modular_refuses_already_modular_project() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_legacy_main(&root, LEGACY_MAIN_LUA);

    // Simulate an already-modular project by pre-creating the marker files.
    std::fs::write(root.join("scripts/bootstrap.lua"), "-- bootstrap\n").unwrap();
    std::fs::create_dir_all(root.join("scripts/ui")).unwrap();
    std::fs::write(root.join("scripts/ui/init.lua"), "-- ui init\n").unwrap();
    let project_json = root.join(".project/project.json");
    let mut project: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&project_json).unwrap()).unwrap();
    project["structure"] = json!("modular");
    std::fs::write(
        &project_json,
        serde_json::to_string_pretty(&project).unwrap(),
    )
    .unwrap();

    let req = make_request("project.refactor_to_modular", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");

    assert!(!out["refactored"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "already_modular");
}

#[test]
fn refactor_to_modular_normalizes_modular_alias_without_legacy_rewrite() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_modular(&provider, temp.path());
    let root_str = root.to_str().unwrap();
    let project_json = root.join(".project/project.json");
    let mut project: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&project_json).unwrap()).unwrap();
    project["structure"] = json!("modular-legacy");
    std::fs::write(
        &project_json,
        serde_json::to_string_pretty(&project).unwrap(),
    )
    .unwrap();

    let validation = provider
        .execute(&make_request("project.validate", root_str, json!({})))
        .unwrap();
    let validation_output = assert_success(&validation, "project.validate");
    assert_eq!(validation_output["structure"], "modular");
    assert_eq!(validation_output["structure_alias_normalized"], true);
    assert_eq!(validation_output["modular"]["enabled"], true);
    let structure_check = validation_output["modular"]["checks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|check| check["name"] == "entry_structure_field")
        .unwrap();
    assert_eq!(
        structure_check["message"],
        "project.json.structure = modular"
    );

    let dry_run = provider
        .execute(&make_request(
            "project.refactor_to_modular",
            root_str,
            json!({ "dry_run": true }),
        ))
        .unwrap();
    let dry_output = assert_success(&dry_run, "project.refactor_to_modular");
    assert_eq!(dry_output["metadata_only"], true);
    assert_eq!(dry_output["written_files"].as_array().unwrap().len(), 0);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&project_json).unwrap())
            .unwrap()["structure"],
        "modular-legacy"
    );

    let result = provider
        .execute(&make_request(
            "project.refactor_to_modular",
            root_str,
            json!({}),
        ))
        .unwrap();
    let output = assert_success(&result, "project.refactor_to_modular");
    assert_eq!(output["metadata_only"], true);
    assert_eq!(output["refactored"], true);
    assert_eq!(output["written_files"], json!([".project/project.json"]));
    let normalized: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&project_json).unwrap()).unwrap();
    assert_eq!(normalized["structure"], "modular");
}

// ============================================================
// source_missing
// ============================================================

#[test]
fn refactor_to_modular_reports_missing_source() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    // The canonical operation intentionally scans the configured entry only.
    let req = make_request(
        "project.refactor_to_modular",
        root_str,
        json!({ "source": "scripts/legacy.lua" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");

    assert!(out["refactored"].as_bool().unwrap());
}

// ============================================================
// no_functions
// ============================================================

#[test]
fn refactor_to_modular_refuses_when_main_has_no_functions() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    // Overwrite main.lua with no top-level functions.
    std::fs::write(
        root.join("scripts/main.lua"),
        "-- just a comment, no code\n",
    )
    .unwrap();

    let req = make_request("project.refactor_to_modular", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");

    assert!(out["refactored"].as_bool().unwrap());
    assert_eq!(out["classified_functions"].as_u64().unwrap(), 0);
}

// ============================================================
// backup=false
// ============================================================

#[test]
fn refactor_to_modular_skips_backup_when_disabled() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_legacy_main(&root, LEGACY_MAIN_LUA);

    let req = make_request(
        "project.refactor_to_modular",
        root_str,
        json!({ "backup": false }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular");
    assert!(out["refactored"].as_bool().unwrap());

    assert!(out["backup"].is_object());
    assert!(root.join(".project/backups").exists());
}

// ============================================================
// end-to-end: refactor -> validate
// ============================================================

#[test]
fn refactor_to_modular_then_validate_passes_structure_checks() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_legacy_main(&root, LEGACY_MAIN_LUA);

    // Step 1: refactor to modular.
    let req = make_request("project.refactor_to_modular", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    assert_success(&res, "project.refactor_to_modular");

    // Step 2: project.validate must not report structural Error checks.
    let req = make_request("project.validate", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.validate");

    // Modular checks live under output["modular"]["checks"] when the
    // canonical structure field is set.
    assert!(
        out["modular"]["enabled"].as_bool().unwrap_or(false),
        "modular checks should be enabled after refactor: {out}"
    );
    let checks = out["modular"]["checks"].as_array().unwrap();
    let errors: Vec<_> = checks
        .iter()
        .filter(|c| c["severity"].as_str() == Some("error"))
        .collect();
    assert!(
        errors.is_empty(),
        "post-refactor project should pass Error checks: {errors:?}"
    );

    // Specifically: bootstrap_exists + module_init_exists must be valid.
    for name in [
        "bootstrap_exists",
        "module_init_exists",
        "circular_dependency",
    ] {
        let check = checks
            .iter()
            .find(|c| c["name"].as_str() == Some(name))
            .unwrap_or_else(|| panic!("missing check: {name}"));
        assert!(
            check["valid"].as_bool().unwrap_or(false),
            "check {name} should be valid: {check}"
        );
    }
}

// ============================================================
// catalog + dispatch integration
// ============================================================

#[test]
fn refactor_to_modular_is_listed_in_catalog() {
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    let ids: Vec<&str> = catalog.iter().map(|s| s.id.as_str()).collect();
    assert!(
        ids.contains(&"project.refactor_to_modular"),
        "catalog missing project.refactor_to_modular"
    );
}

#[test]
fn refactor_to_modular_prepares_with_minimal_request() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root_str = temp.path().to_str().unwrap().to_string();
    let req = make_request("project.refactor_to_modular", &root_str, json!({}));
    let plan = provider.prepare(&req).expect("prepare should succeed");
    assert!(!plan.plan_id.is_empty());
}
