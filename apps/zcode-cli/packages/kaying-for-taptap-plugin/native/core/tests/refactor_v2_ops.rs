//! Integration tests for `project.refactor_to_modular_v2`.
//!
//! Covers:
//! - happy path: legacy project -> modular-v2 layout with scaffolding
//! - dry_run: no writes, returns diff payload
//! - already_modular_v2: refusal
//! - no_scripts_dir: refusal
//! - backup=false: skip backup
//! - surfaces_detected: Surface candidate scaffolds created
//! - by_layer classification
//! - project.json patched to modular-v2
//! - catalog + dispatch registration
//! - before/after tree report

mod common;
use common::{assert_success, make_request, scaffold_project};
use kaying_for_taptap_core::model::{EngineProvider, ProviderContext};
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

/// Legacy single-file project with functions spanning multiple layers + a
/// Surface candidate (main_menu) so we can exercise the full v2 pipeline.
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
function update_player(player, dt)\n\
    player.x = player.x + 100 * dt\n\
end\n\
\n\
function save_game(state)\n\
    write_file(\"save.json\", json.encode(state))\n\
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

fn write_legacy_main(root: &std::path::Path) {
    std::fs::write(root.join("scripts").join("main.lua"), LEGACY_MAIN_LUA).unwrap();
}

// ============================================================
// happy path
// ============================================================

#[test]
fn refactor_to_modular_v2_creates_v2_layout() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    assert!(out["refactored"].as_bool().unwrap());
    assert_eq!(out["target"].as_str().unwrap(), "modular");
    assert_eq!(out["structure_after"].as_str().unwrap(), "modular");
    assert_eq!(out["structure_before"].as_str().unwrap(), "legacy");

    // Scaffolding files must exist.
    assert!(root.join("scripts/bootstrap.lua").exists());
    assert!(root.join("scripts/main.lua").exists());
    assert!(root.join("scripts/lib/event.lua").exists());
    assert!(root.join("scripts/lib/class.lua").exists());
    // init.lua exists for layers that received functions + lib (always).
    assert!(root.join("scripts/ui/init.lua").exists(), "ui init missing");
    assert!(
        root.join("scripts/lib/init.lua").exists(),
        "lib init missing"
    );
    assert!(root.join(".project/surfaces.json").exists());
    assert!(root.join(".project/modules.json").exists());
    assert!(root.join("AGENTS.md").exists());

    // Backup must exist.
    let backups_dir = root.join(".project/backups");
    assert!(backups_dir.exists(), "backups dir missing");
    assert_eq!(
        std::fs::read_dir(&backups_dir).unwrap().count(),
        1,
        "exactly one backup expected"
    );
}

// ============================================================
// dry_run
// ============================================================

#[test]
fn refactor_to_modular_v2_dry_run_does_not_write() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "dry_run": true }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    assert!(!out["refactored"].as_bool().unwrap());
    assert!(out["dry_run"].as_bool().unwrap());
    assert!(out["diff"].is_array(), "diff payload should be present");
    assert!(
        out["diff"].as_array().unwrap().len() >= 12,
        "diff should list >=12 planned files"
    );

    // No scaffolding should exist.
    assert!(!root.join("scripts/bootstrap.lua").exists());
    assert!(!root.join("scripts/ui").exists());
    assert!(!root.join(".project/backups").exists());

    // main.lua should still contain the legacy code.
    let body = std::fs::read_to_string(root.join("scripts/main.lua")).unwrap();
    assert!(body.contains("function draw_hud"));
}

// ============================================================
// already_modular_v2 refusal
// ============================================================

#[test]
fn refactor_to_modular_v2_refuses_already_v2() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    // Mark project as already modular-v2.
    let project_json = root.join(".project/project.json");
    let body = std::fs::read_to_string(&project_json).unwrap();
    let mut value: serde_json::Value = serde_json::from_str(&body).unwrap();
    value["structure"] = json!("modular");
    std::fs::write(&project_json, serde_json::to_string_pretty(&value).unwrap()).unwrap();

    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    assert!(!out["refactored"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "already_modular");
}

// ============================================================
// no_scripts_dir refusal
// ============================================================

#[test]
fn refactor_to_modular_v2_refuses_no_scripts_dir() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    std::fs::remove_dir_all(root.join("scripts")).unwrap();
    let root_str = root.to_str().unwrap();

    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    assert!(!out["refactored"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "no_scripts_dir");
}

// ============================================================
// backup=false
// ============================================================

#[test]
fn refactor_to_modular_v2_skips_backup_when_disabled() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    assert!(out["refactored"].as_bool().unwrap());
    assert!(
        out["backup"].is_object(),
        "a recovery snapshot is always created"
    );
    assert!(root.join(".project/backups").exists());
}

// ============================================================
// surfaces_detected
// ============================================================

#[test]
fn refactor_to_modular_v2_detects_and_scaffolds_surfaces() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    let surfaces = out["surfaces_created"].as_array().unwrap();
    assert!(
        !surfaces.is_empty(),
        "expected at least one Surface candidate (main_menu), got empty"
    );
    let surface_id = surfaces[0].as_str().unwrap();
    assert!(
        root.join(format!("scripts/ui/surfaces/{surface_id}/init.lua"))
            .exists(),
        "Surface init.lua missing for {surface_id}"
    );
    assert!(
        root.join(format!("scripts/ui/surfaces/{surface_id}/view.lua"))
            .exists(),
        "Surface view.lua missing for {surface_id}"
    );
    assert!(
        root.join(format!("scripts/ui/surfaces/{surface_id}/state.lua"))
            .exists(),
        "Surface state.lua missing for {surface_id}"
    );
    assert!(
        root.join(format!("scripts/ui/surfaces/{surface_id}/style.lua"))
            .exists(),
        "Surface style.lua missing for {surface_id}"
    );
}

// ============================================================
// by_layer classification
// ============================================================

#[test]
fn refactor_to_modular_v2_classifies_functions_into_layers() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    let by_layer = out["by_layer"].as_array().unwrap();
    let layer_counts: std::collections::HashMap<&str, u64> = by_layer
        .iter()
        .map(|e| {
            (
                e["layer"].as_str().unwrap(),
                e["count"].as_u64().unwrap_or(0),
            )
        })
        .collect();

    // draw_hud -> ui, save_game -> data, util_clamp -> lib
    assert!(layer_counts["ui"] >= 1, "ui should have >=1 function");
    assert!(layer_counts["data"] >= 1, "data should have >=1 function");
    assert!(layer_counts["lib"] >= 1, "lib should have >=1 function");
}

// ============================================================
// project.json patched
// ============================================================

#[test]
fn refactor_to_modular_v2_patches_project_json() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    assert_success(&res, "project.refactor_to_modular_v2");

    let project_json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join(".project/project.json")).unwrap())
            .unwrap();
    assert_eq!(project_json["structure"].as_str().unwrap(), "modular");
    assert_eq!(project_json["engine"].as_str().unwrap(), "taptap");
}

// ============================================================
// before/after tree report
// ============================================================

#[test]
fn refactor_to_modular_v2_emits_before_after_tree_report() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    let before = out["before_tree"].as_str().unwrap();
    let after = out["after_tree"].as_str().unwrap();
    assert!(!before.is_empty(), "before_tree should be non-empty");
    assert!(!after.is_empty(), "after_tree should be non-empty");
    assert!(
        after.contains("scripts/"),
        "after_tree should list scripts/"
    );
    assert!(
        after.contains(".project/"),
        "after_tree should list .project/"
    );
    assert!(
        after.contains("surfaces/"),
        "after_tree should list surfaces/ subdir"
    );
}

// ============================================================
// catalog + dispatch integration
// ============================================================

#[test]
fn refactor_to_modular_v2_is_listed_in_catalog() {
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    let ids: Vec<&str> = catalog.iter().map(|s| s.id.as_str()).collect();
    assert!(
        ids.contains(&"project.refactor_to_modular"),
        "catalog missing project.refactor_to_modular"
    );
    assert!(ids.contains(&"project.backup"));
    assert!(ids.contains(&"project.list_backups"));
    assert!(ids.contains(&"project.refactor_rollback"));
}

#[test]
fn refactor_to_modular_v2_prepares_with_minimal_request() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    let req = make_request("project.refactor_to_modular_v2", root_str, json!({}));
    let plan = provider.prepare(&req).expect("prepare should succeed");
    assert!(!plan.plan_id.is_empty());
}

// ============================================================
// skeleton mode (default) — preserve main.lua as main_legacy.lua
// ============================================================

#[test]
fn skeleton_mode_default_preserves_main_lua_as_legacy() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    // Skeleton mode is explicit and preserves shared-state code safely.
    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false, "mode": "skeleton" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    assert_eq!(out["mode"].as_str().unwrap(), "skeleton");
    assert!(out["refactored"].as_bool().unwrap());

    // Original main.lua content is preserved as scripts/legacy/main.lua.
    let legacy_path = root.join("scripts/legacy/main.lua");
    assert!(
        legacy_path.exists(),
        "legacy/main.lua must exist in skeleton mode"
    );
    let legacy_body = std::fs::read_to_string(&legacy_path).unwrap();
    assert!(
        legacy_body.contains("function draw_hud"),
        "legacy/main.lua must contain original functions"
    );
    assert!(
        legacy_body.contains("function save_game"),
        "legacy/main.lua must contain original functions"
    );

    // main.lua is rewritten to a thin entry that requires bootstrap.
    let main_body = std::fs::read_to_string(root.join("scripts/main.lua")).unwrap();
    assert!(
        main_body.contains("function Start()"),
        "main.lua must use Start() (TapTap lifecycle)"
    );
    assert!(
        main_body.contains("function Stop()"),
        "main.lua must use Stop() (TapTap lifecycle)"
    );
    assert!(
        !main_body.contains("function init("),
        "main.lua must NOT use init() lifecycle"
    );
    assert!(
        main_body.contains("require \"scripts.bootstrap\""),
        "main.lua must require bootstrap"
    );
}

#[test]
fn skeleton_mode_bootstrap_requires_legacy_and_only_layers_with_functions() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false, "mode": "skeleton" }),
    );
    let res = provider.execute(&req).unwrap();
    assert_success(&res, "project.refactor_to_modular_v2");

    let bootstrap = std::fs::read_to_string(root.join("scripts/bootstrap.lua")).unwrap();
    // Skeleton mode must require the preserved legacy main.
    assert!(
        bootstrap.contains("require \"scripts.legacy.main\""),
        "bootstrap must require scripts.legacy.main in skeleton mode"
    );
    assert!(
        bootstrap.contains("Legacy.Start()"),
        "bootstrap.start() must call Legacy.Start()"
    );
    assert!(
        bootstrap.contains("Legacy.Stop()"),
        "bootstrap.stop() must call Legacy.Stop()"
    );

    // Critical bug fix: every `require "scripts.X.init"` in bootstrap must
    // correspond to an actual on-disk `scripts/X/init.lua` file. The original
    // bug referenced scripts.gameplay.init / scripts.data.init that didn't exist.
    let require_pattern = "require \"scripts.";
    let mut required_layers: Vec<String> = Vec::new();
    for line in bootstrap.lines() {
        if !line.contains(require_pattern) {
            continue;
        }
        // Extract "scripts.X.init" or "scripts.legacy.main" etc.
        if let Some(start) = line.find("scripts.") {
            let rest = &line[start + "scripts.".len()..];
            // Take up to the next quote.
            if let Some(end) = rest.find('"') {
                let path = &rest[..end];
                // Top-level layer is the first segment.
                if let Some(layer) = path.split('.').next() {
                    // Skip "legacy.main" (legacy file, not a layer init).
                    if path == "legacy.main" {
                        continue;
                    }
                    required_layers.push(layer.to_string());
                }
            }
        }
    }
    for layer in &required_layers {
        let init_path = root.join(format!("scripts/{layer}/init.lua"));
        assert!(
            init_path.exists(),
            "bootstrap requires scripts.{layer}.init but scripts/{layer}/init.lua does not exist (the original bug). bootstrap:\n{bootstrap}"
        );
    }
}

#[test]
fn skeleton_mode_emits_state_hub_and_surfaces_quadruple() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false, "mode": "skeleton" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    // state.lua shared state hub must exist.
    let state_path = root.join("scripts/state.lua");
    assert!(state_path.exists(), "scripts/state.lua must exist");
    let state_body = std::fs::read_to_string(&state_path).unwrap();
    assert!(
        state_body.contains("local State = {}"),
        "state.lua must define State module"
    );
    assert!(
        state_body.contains("return State"),
        "state.lua must return State"
    );

    // Surface quadruple must exist (legacy main has ShowMainMenu -> main_menu).
    let surfaces = out["surfaces_created"].as_array().unwrap();
    assert!(!surfaces.is_empty(), "surfaces_created must be populated");
    let surface_id = surfaces[0].as_str().unwrap();
    for suffix in ["init", "view", "state", "style"] {
        let path = root.join(format!("scripts/ui/surfaces/{surface_id}/{suffix}.lua"));
        assert!(
            path.exists(),
            "Surface {surface_id}/{suffix}.lua must exist"
        );
    }
}

#[test]
fn skeleton_mode_main_lua_uses_start_stop_not_init_update_exit() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false, "mode": "skeleton" }),
    );
    let res = provider.execute(&req).unwrap();
    assert_success(&res, "project.refactor_to_modular_v2");

    let main = std::fs::read_to_string(root.join("scripts/main.lua")).unwrap();
    let bootstrap = std::fs::read_to_string(root.join("scripts/bootstrap.lua")).unwrap();

    // All entry points must use TapTap Start/Stop — never init/update/exit.
    assert!(main.contains("function Start()"));
    assert!(main.contains("function Stop()"));
    assert!(main.contains("SubscribeToEvent(\"Update\", \"HandleUpdate\")"));
    assert!(!main.contains("function init("));
    assert!(!main.contains("function update("));
    assert!(!main.contains("function exit("));

    // Bootstrap uses start()/update()/stop() — lowercase, called by the TapTap entry.
    assert!(bootstrap.contains("function Bootstrap.start()"));
    assert!(bootstrap.contains("function Bootstrap.update("));
    assert!(bootstrap.contains("function Bootstrap.stop()"));
    assert!(!bootstrap.contains("function Bootstrap.init("));
}

#[test]
fn skeleton_mode_bootstrap_captures_legacy_globals_not_module_return() {
    // Critical bug fix: the original main.lua is a SCRIPT (no `return M`),
    // so `require` returns `true`. Bootstrap must capture the GLOBAL Start/Stop
    // function references AFTER requiring scripts/legacy/main.lua, so that Legacy.Start
    // is callable when main.lua later overrides the global Start.
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false, "mode": "skeleton" }),
    );
    let res = provider.execute(&req).unwrap();
    assert_success(&res, "project.refactor_to_modular_v2");

    let bootstrap = std::fs::read_to_string(root.join("scripts/bootstrap.lua")).unwrap();

    // Must NOT assign the return value of the legacy script to Legacy.
    assert!(
        !bootstrap.contains("local Legacy = require \"scripts.legacy.main\""),
        "bootstrap must NOT assign require result to Legacy (returns true for scripts). bootstrap:\n{bootstrap}"
    );

    // MUST load the legacy script then capture globals.
    assert!(
        bootstrap.contains("require \"scripts.legacy.main\""),
        "bootstrap must require scripts/legacy/main.lua to load its globals"
    );
    assert!(
        bootstrap
            .contains("local Legacy = { Start = Start, Stop = Stop, HandleUpdate = HandleUpdate }"),
        "bootstrap must capture global Start/Stop/HandleUpdate into Legacy table. bootstrap:\n{bootstrap}"
    );
}

// ============================================================
// split mode — explicit opt-in, risky for shared state
// ============================================================

#[test]
fn split_mode_extracts_functions_with_warning() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    write_legacy_main(&root);
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "project.refactor_to_modular_v2",
        root_str,
        json!({ "backup": false, "mode": "split" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "project.refactor_to_modular_v2");

    assert_eq!(out["mode"].as_str().unwrap(), "split");

    // Split mode reports deferred shared-state work when it detects it.
    let warnings = out["warnings"].as_array().unwrap();
    assert!(
        warnings.iter().all(|w| w.get("reason").is_some()),
        "split mode warnings must be structured: {warnings:?}"
    );

    // Safe functions are grouped by classified layer to keep the module tree
    // small and avoid one-file-per-function sprawl.
    assert!(
        std::fs::read_to_string(root.join("scripts/ui/main.lua"))
            .unwrap()
            .contains("function draw_hud"),
        "split mode must extract draw_hud to scripts/ui/main.lua"
    );
    assert!(
        std::fs::read_to_string(root.join("scripts/data/main.lua"))
            .unwrap()
            .contains("function save_game"),
        "split mode must extract save_game to scripts/data/main.lua"
    );

    // The residual legacy file retains non-function top-level state/returns;
    // the extracted functions are grouped into layer modules.
    assert!(
        root.join("scripts/legacy/main.lua").exists(),
        "split mode must retain the residual legacy module"
    );
}
