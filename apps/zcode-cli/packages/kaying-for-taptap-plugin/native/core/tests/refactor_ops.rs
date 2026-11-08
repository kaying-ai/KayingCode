//! Unit tests for `refactor.*` operations.

mod common;
use common::{assert_success, make_request, scaffold_project};
use kaying_for_taptap_core::model::{EngineProvider, ProviderContext};
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

/// Write a script file under `scripts/<rel>` with the given content.
fn write_script(root: &std::path::Path, rel: &str, body: &str) -> String {
    let path = root.join("scripts").join(rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(&path, body).unwrap();
    rel.to_string()
}

const SAMPLE_GAMEPLAY: &str = "-- gameplay module\n\
local M = {}\n\
\n\
local SPEED = 100\n\
\n\
function M.update(dt)\n\
    local player = get_player()\n\
    player.x = player.x + SPEED * dt\n\
    return player\n\
end\n\
\n\
function M.reset()\n\
    local player = get_player()\n\
    player.x = 0\n\
    player.y = 0\n\
end\n\
\n\
return M\n";

// ============================================================
// refactor.analyze
// ============================================================

#[test]
fn analyze_returns_functions_locals_and_requires() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/gameplay.lua", SAMPLE_GAMEPLAY);

    let req = make_request(
        "refactor.analyze",
        root_str,
        json!({ "path": "scripts/systems/gameplay.lua" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.analyze");

    assert!(out["analyzed"].as_bool().unwrap());
    assert_eq!(out["line_count"].as_u64().unwrap(), 18);
    let funcs = out["functions"].as_array().unwrap();
    assert_eq!(funcs.len(), 2);
    assert_eq!(funcs[0]["name"].as_str().unwrap(), "update");
    assert_eq!(funcs[0]["qualifier"].as_str().unwrap(), "M.");
    assert!(!funcs[0]["is_global"].as_bool().unwrap());
    assert_eq!(funcs[1]["name"].as_str().unwrap(), "reset");

    // find_local_declarations discovers ALL `local NAME = VALUE` forms,
    // including `local M = {}` and `local player = get_player()` inside
    // function bodies: M, SPEED, player (in update), player (in reset).
    let locals = out["locals"].as_array().unwrap();
    assert_eq!(locals.len(), 4);
    let local_names: Vec<&str> = locals
        .iter()
        .map(|l| l["name"].as_str().unwrap_or(""))
        .collect();
    assert!(
        local_names.contains(&"SPEED"),
        "SPEED not in locals: {local_names:?}"
    );
    assert!(
        local_names.contains(&"M"),
        "M not in locals: {local_names:?}"
    );
}

#[test]
fn analyze_with_symbol_returns_references() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/gameplay.lua", SAMPLE_GAMEPLAY);

    let req = make_request(
        "refactor.analyze",
        root_str,
        json!({
            "path": "scripts/systems/gameplay.lua",
            "symbol": "player"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.analyze");

    let refs = out["references"].as_array().unwrap();
    // `player` appears 5 times in SAMPLE_GAMEPLAY (locals + references).
    assert!(
        refs.len() >= 3,
        "expected >= 3 references, got {}",
        refs.len()
    );
}

#[test]
fn analyze_returns_false_for_missing_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "refactor.analyze",
        root_str,
        json!({ "path": "scripts/missing.lua" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.analyze");
    assert!(!out["analyzed"].as_bool().unwrap());
    assert_eq!(out["error"].as_str().unwrap(), "File not found");
}

// ============================================================
// refactor.rename_symbol
// ============================================================

#[test]
fn rename_symbol_updates_definition_and_references() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/gameplay.lua", SAMPLE_GAMEPLAY);

    let req = make_request(
        "refactor.rename_symbol",
        root_str,
        json!({
            "path": "scripts/systems/gameplay.lua",
            "old_name": "update",
            "new_name": "tick",
            "scope": "file"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.rename_symbol");

    assert!(out["renamed"].as_bool().unwrap());
    assert!(out["definition_renamed"].as_bool().unwrap());
    assert!(out["references_renamed"].as_u64().is_some());

    let body = std::fs::read_to_string(root.join("scripts/systems/gameplay.lua")).unwrap();
    assert!(body.contains("function M.tick(dt)"));
    assert!(!body.contains("M.update("));
}

#[test]
fn rename_symbol_project_scope_updates_other_files() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/gameplay.lua", SAMPLE_GAMEPLAY);
    write_script(
        &root,
        "systems/bridge.lua",
        "local gameplay = require \"scripts.systems.gameplay\"\n\n\
         function call_update(dt)\n\
             gameplay.update(dt)\n\
         end\n",
    );

    let req = make_request(
        "refactor.rename_symbol",
        root_str,
        json!({
            "path": "scripts/systems/gameplay.lua",
            "old_name": "update",
            "new_name": "tick",
            "scope": "project"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.rename_symbol");

    assert!(out["renamed"].as_bool().unwrap());
    let files = out["files_changed"].as_array().unwrap();
    assert!(
        files.len() >= 2,
        "expected >= 2 files changed, got {}",
        files.len()
    );

    let bridge = std::fs::read_to_string(root.join("scripts/systems/bridge.lua")).unwrap();
    assert!(bridge.contains("gameplay.tick("));
    assert!(!bridge.contains("gameplay.update("));
}

#[test]
fn rename_symbol_rejects_same_name() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/gameplay.lua", SAMPLE_GAMEPLAY);

    let req = make_request(
        "refactor.rename_symbol",
        root_str,
        json!({
            "path": "scripts/systems/gameplay.lua",
            "old_name": "update",
            "new_name": "update"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.rename_symbol");
    assert!(!out["renamed"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "old_name equals new_name");
}

// ============================================================
// refactor.extract_function
// ============================================================

#[test]
fn extract_function_appends_new_function_at_end() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(
        &root,
        "systems/player.lua",
        "local M = {}\n\n\
         function M.apply_gravity(player, dt)\n\
             player.vy = player.vy + 9.8 * dt\n\
             player.y = player.y + player.vy * dt\n\
         end\n\n\
         return M\n",
    );

    // Extract the two body lines (lines 4-5).
    let req = make_request(
        "refactor.extract_function",
        root_str,
        json!({
            "path": "scripts/systems/player.lua",
            "name": "integrate",
            "start_line": 4,
            "end_line": 5,
            "params": "player, dt"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.extract_function");

    assert!(out["extracted"].as_bool().unwrap());
    assert_eq!(out["call"].as_str().unwrap(), "integrate(player, dt)");

    let body = std::fs::read_to_string(root.join("scripts/systems/player.lua")).unwrap();
    assert!(body.contains("function integrate(player, dt)"));
    assert!(body.contains("player.vy = player.vy + 9.8 * dt"));
}

#[test]
fn extract_function_rejects_empty_range() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/empty.lua", "return nil\n");

    let req = make_request(
        "refactor.extract_function",
        root_str,
        json!({
            "path": "scripts/systems/empty.lua",
            "name": "noop",
            "start_line": 0,
            "end_line": 0
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.extract_function");
    assert!(!out["extracted"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "empty_range");
}

// ============================================================
// refactor.inline_local
// ============================================================

#[test]
fn inline_local_substitutes_value_at_references() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(
        &root,
        "systems/physics.lua",
        "local SPEED = 100\n\n\
         function move(dt)\n\
             return SPEED * dt\n\
         end\n",
    );

    let req = make_request(
        "refactor.inline_local",
        root_str,
        json!({
            "path": "scripts/systems/physics.lua",
            "name": "SPEED"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.inline_local");

    assert!(out["inlined"].as_bool().unwrap());
    assert_eq!(out["value"].as_str().unwrap(), "100");
    assert!(out["references_replaced"].as_u64().unwrap() >= 1);

    let body = std::fs::read_to_string(root.join("scripts/systems/physics.lua")).unwrap();
    assert!(!body.contains("local SPEED"));
    assert!(body.contains("return 100 * dt"));
}

#[test]
fn inline_local_returns_false_when_not_found() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/none.lua", "return nil\n");

    let req = make_request(
        "refactor.inline_local",
        root_str,
        json!({
            "path": "scripts/systems/none.lua",
            "name": "MISSING"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.inline_local");
    assert!(!out["inlined"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "local_not_found");
}

// ============================================================
// refactor.move_module
// ============================================================

#[test]
fn move_module_relocates_file_and_rewrites_requires() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(
        &root,
        "lib/event.lua",
        "local M = {}\nfunction M.emit() return 1 end\nreturn M\n",
    );
    write_script(
        &root,
        "systems/host.lua",
        "local event = require \"scripts.lib.event\"\nreturn event.emit()\n",
    );

    let req = make_request(
        "refactor.move_module",
        root_str,
        json!({
            "old_path": "lib/event.lua",
            "new_path": "lib/event_bus.lua"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.move_module");

    assert!(out["moved"].as_bool().unwrap());
    assert_eq!(out["old_require"].as_str().unwrap(), "scripts.lib.event");
    assert_eq!(
        out["new_require"].as_str().unwrap(),
        "scripts.lib.event_bus"
    );
    assert!(out["files_updated"].as_u64().unwrap() >= 1);

    assert!(!root.join("scripts/lib/event.lua").exists());
    assert!(root.join("scripts/lib/event_bus.lua").exists());

    let host = std::fs::read_to_string(root.join("scripts/systems/host.lua")).unwrap();
    assert!(host.contains("require \"scripts.lib.event_bus\""));
    assert!(!host.contains("scripts.lib.event\""));
}

#[test]
fn move_module_rejects_existing_target() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "lib/a.lua", "return {}\n");
    write_script(&root, "lib/b.lua", "return {}\n");

    let req = make_request(
        "refactor.move_module",
        root_str,
        json!({
            "old_path": "lib/a.lua",
            "new_path": "lib/b.lua"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.move_module");
    assert!(!out["moved"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "target_exists");
}

#[test]
fn move_module_reports_missing_source() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "refactor.move_module",
        root_str,
        json!({
            "old_path": "lib/ghost.lua",
            "new_path": "lib/real.lua"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.move_module");
    assert!(!out["moved"].as_bool().unwrap());
    assert_eq!(out["error"].as_str().unwrap(), "File not found");
}

// ============================================================
// refactor.split_file
// ============================================================

#[test]
fn split_file_extracts_range_to_new_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(
        &root,
        "systems/main.lua",
        "local M = {}\n\n\
         function M.helper_a()\n\
             return 1\n\
         end\n\n\
         function M.helper_b()\n\
             return 2\n\
         end\n\n\
         return M\n",
    );

    // Extract helper_b's body (lines 8-9) into a new module.
    let req = make_request(
        "refactor.split_file",
        root_str,
        json!({
            "path": "scripts/systems/main.lua",
            "target_path": "lib/helper_b.lua",
            "start_line": 8,
            "end_line": 9,
            "module_name": "helper_b"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.split_file");

    assert!(out["split"].as_bool().unwrap());
    assert_eq!(out["module_name"].as_str().unwrap(), "helper_b");
    assert_eq!(
        out["require_path"].as_str().unwrap(),
        "scripts.lib.helper_b"
    );
    assert!(
        out["require_call"]
            .as_str()
            .unwrap()
            .contains("require \"scripts.lib.helper_b\"")
    );

    let target = std::fs::read_to_string(root.join("scripts/lib/helper_b.lua")).unwrap();
    assert!(target.contains("local helper_b = {}"));
    assert!(target.contains("return helper_b"));
    assert!(target.contains("return 2"));

    let source = std::fs::read_to_string(root.join("scripts/systems/main.lua")).unwrap();
    assert!(source.contains("local helper_b = require \"scripts.lib.helper_b\""));
    // The original `return 2` line should be gone from the source.
    let count = source.matches("return 2").count();
    assert_eq!(count, 0);
}

#[test]
fn split_file_rejects_empty_range() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();
    write_script(&root, "systems/short.lua", "return nil\n");

    let req = make_request(
        "refactor.split_file",
        root_str,
        json!({
            "path": "scripts/systems/short.lua",
            "target_path": "lib/out.lua",
            "start_line": 0,
            "end_line": 0
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.split_file");
    assert!(!out["split"].as_bool().unwrap());
    assert_eq!(out["reason"].as_str().unwrap(), "empty_range");
}

#[test]
fn split_file_reports_missing_source() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "refactor.split_file",
        root_str,
        json!({
            "path": "scripts/systems/missing.lua",
            "target_path": "lib/out.lua",
            "start_line": 1,
            "end_line": 2
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "refactor.split_file");
    assert!(!out["split"].as_bool().unwrap());
    assert_eq!(out["error"].as_str().unwrap(), "File not found");
}

// ============================================================
// Catalog + dispatch integration
// ============================================================

#[test]
fn refactor_operations_are_listed_in_catalog() {
    use kaying_for_taptap_core::model::EngineProvider;
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    let ids: Vec<&str> = catalog.iter().map(|s| s.id.as_str()).collect();
    for expected in [
        "refactor.analyze",
        "refactor.rename_symbol",
        "refactor.extract_function",
        "refactor.inline_local",
        "refactor.move_module",
        "refactor.split_file",
    ] {
        assert!(ids.contains(&expected), "catalog missing {expected}");
    }
}

#[test]
fn refactor_domain_is_present() {
    let provider = provider();
    let context = ProviderContext::new(None);
    let catalog = provider.operation_catalog(&context).unwrap();
    let domains: Vec<&str> = catalog
        .iter()
        .filter(|s| s.domain == "refactor")
        .map(|s| s.id.as_str())
        .collect();
    // 6 symbolic refactor.* ops + canonical modular refactor +
    // backup/list/rollback.
    assert_eq!(domains.len(), 10);
}
