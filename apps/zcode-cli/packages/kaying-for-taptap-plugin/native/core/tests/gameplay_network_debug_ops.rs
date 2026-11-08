//! Integration tests for `gameplay.*`, `network.*`, and `debug.*` operations.

mod common;

use common::{assert_success, make_request, make_request_bare, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

// ============================================================
// gameplay.*
// ============================================================

#[test]
fn gameplay_create_state_machine_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "gameplay.create_state_machine",
        root_str,
        json!({ "name": "player_sm" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.create_state_machine");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["name"].as_str().unwrap(), "player_sm");

    let path = root.join("scripts").join("gameplay").join("player_sm.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("SM"));
    assert!(body.contains("addState"));
}

#[test]
fn gameplay_create_state_machine_rejects_duplicate() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "gameplay.create_state_machine",
        root_str,
        json!({ "name": "dup_sm" }),
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

#[test]
fn gameplay_add_state_records_into_manifest() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "gameplay.create_state_machine",
        root_str,
        json!({ "name": "ai_sm" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "gameplay.add_state",
        root_str,
        json!({ "name": "ai_sm", "state_name": "patrol" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.add_state");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["state"].as_str().unwrap(), "patrol");

    let manifest_path = root
        .join("scripts")
        .join("gameplay")
        .join("ai_sm.states.json");
    assert!(manifest_path.exists());
    let body = std::fs::read_to_string(&manifest_path).unwrap();
    assert!(body.contains("patrol"));
}

#[test]
fn gameplay_add_transition_appends_to_manifest() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "gameplay.create_state_machine",
        root_str,
        json!({ "name": "flow_sm" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "gameplay.add_transition",
        root_str,
        json!({ "name": "flow_sm", "from": "idle", "to": "run" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.add_transition");
    assert!(out["added"].as_bool().unwrap());

    let manifest_path = root
        .join("scripts")
        .join("gameplay")
        .join("flow_sm.states.json");
    let body = std::fs::read_to_string(&manifest_path).unwrap();
    assert!(body.contains("idle"));
    assert!(body.contains("run"));
}

#[test]
fn gameplay_create_spawn_table_writes_data_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "gameplay.create_spawn_table",
        root_str,
        json!({
            "name": "wave_1",
            "entries": [
                { "enemy": "goblin", "weight": 2.0, "count": 5 },
                { "enemy": "orc", "weight": 1.0, "count": 2 }
            ]
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.create_spawn_table");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["entries"].as_u64().unwrap(), 2);

    let path = root.join("scripts").join("data").join("wave_1.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("goblin"));
    assert!(body.contains("orc"));
}

#[test]
fn gameplay_create_loot_table_writes_data_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "gameplay.create_loot_table",
        root_str,
        json!({
            "name": "chest_basic",
            "entries": [
                { "item": "gold", "weight": 5.0, "min_qty": 10, "max_qty": 50 }
            ]
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.create_loot_table");
    assert!(out["created"].as_bool().unwrap());

    let path = root.join("scripts").join("data").join("chest_basic.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("gold"));
}

#[test]
fn gameplay_create_quest_writes_data_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "gameplay.create_quest",
        root_str,
        json!({
            "id": "main_001",
            "title": "Rescue the Villager",
            "objectives": [{ "type": "talk", "target": "villager" }]
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.create_quest");
    assert!(out["created"].as_bool().unwrap());
    assert_eq!(out["id"].as_str().unwrap(), "main_001");

    let path = root
        .join("scripts")
        .join("data")
        .join("quests")
        .join("main_001.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("main_001"));
    assert!(body.contains("Rescue"));
}

#[test]
fn gameplay_create_dialogue_writes_data_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "gameplay.create_dialogue",
        root_str,
        json!({
            "id": "npc_blacksmith",
            "nodes": [{ "id": "start", "text": "Hello there!" }]
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.create_dialogue");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("data")
        .join("dialogues")
        .join("npc_blacksmith.lua");
    assert!(path.exists());
}

#[test]
fn gameplay_create_behavior_tree_writes_module() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "gameplay.create_behavior_tree",
        root_str,
        json!({
            "name": "enemy_bt",
            "root": { "type": "sequence", "children": [] }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.create_behavior_tree");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("gameplay")
        .join("bt")
        .join("enemy_bt.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("BT"));
    assert!(body.contains("tick"));
}

#[test]
fn gameplay_validate_clean_project_returns_valid() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("gameplay.validate", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.validate");
    assert!(out["valid"].as_bool().unwrap());
    let checks = out["checks"].as_array().unwrap();
    assert!(checks.is_empty());
}

#[test]
fn gameplay_validate_flags_missing_state_targets() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Create an SM and add a transition referencing non-existent states.
    let create_req = make_request(
        "gameplay.create_state_machine",
        root_str,
        json!({ "name": "broken_sm" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let trans_req = make_request(
        "gameplay.add_transition",
        root_str,
        json!({ "name": "broken_sm", "from": "ghost_from", "to": "ghost_to" }),
    );
    let _ = provider.execute(&trans_req).unwrap();

    let req = make_request_bare("gameplay.validate", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "gameplay.validate");
    assert!(!out["valid"].as_bool().unwrap());
    let checks = out["checks"].as_array().unwrap();
    assert!(!checks.is_empty());
}

// ============================================================
// network.*
// ============================================================

#[test]
fn network_create_session_appends_helper() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "network.create_session",
        root_str,
        json!({ "max_players": 8 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "network.create_session");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["max_players"].as_u64().unwrap(), 8);

    let path = root.join("scripts").join("systems").join("network.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("Network.createSession"));
    assert!(body.contains("maxPlayers"));
}

#[test]
fn network_create_session_idempotent_on_repeat() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("network.create_session", root_str, json!({}));
    let _ = provider.execute(&req).unwrap();
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "network.create_session");
    // Second call should not re-append the helper.
    assert!(!out["added"].as_bool().unwrap());
}

#[test]
fn network_join_session_appends_helper() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("network.join_session", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "network.join_session");
    assert!(out["added"].as_bool().unwrap());

    let body =
        std::fs::read_to_string(root.join("scripts").join("systems").join("network.lua")).unwrap();
    assert!(body.contains("Network.joinSession"));
}

#[test]
fn network_leave_session_appends_helper() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("network.leave_session", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "network.leave_session");
    assert!(out["added"].as_bool().unwrap());

    let body =
        std::fs::read_to_string(root.join("scripts").join("systems").join("network.lua")).unwrap();
    assert!(body.contains("Network.leaveSession"));
}

#[test]
fn network_send_rpc_appends_named_helper() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "network.send_rpc",
        root_str,
        json!({ "rpc_name": "fire_projectile" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "network.send_rpc");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["rpc_name"].as_str().unwrap(), "fire_projectile");

    let body =
        std::fs::read_to_string(root.join("scripts").join("systems").join("network.lua")).unwrap();
    assert!(body.contains("Network.sendRpc_fire_projectile"));
}

#[test]
fn network_set_replication_writes_config() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "network.set_replication",
        root_str,
        json!({ "object": "PlayerAvatar", "mode": "client_predicted" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "network.set_replication");
    assert!(out["written"].as_bool().unwrap());

    let path = root
        .join("scripts")
        .join("systems")
        .join("network_config.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("PlayerAvatar"));
    assert!(body.contains("client_predicted"));
}

#[test]
fn network_configure_matchmaking_writes_json() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "network.configure_matchmaking",
        root_str,
        json!({
            "region": "cn-east-1",
            "max_players": 6,
            "timeout_seconds": 60
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "network.configure_matchmaking");
    assert!(out["written"].as_bool().unwrap());
    assert_eq!(out["config"]["region"].as_str().unwrap(), "cn-east-1");

    let path = root
        .join("scripts")
        .join("systems")
        .join("matchmaking.json");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("cn-east-1"));
}

// ============================================================
// debug.*
// ============================================================

#[test]
fn debug_start_profiler_appends_marker() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "debug.start_profiler",
        root_str,
        json!({ "sample_interval_ms": 8, "max_samples": 500 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "debug.start_profiler");
    assert!(out["generated"].as_bool().unwrap());
    assert_eq!(out["sample_interval_ms"].as_u64().unwrap(), 8);

    let path = root.join("scripts").join("systems").join("profiler.lua");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("Profiler.start"));
    assert!(body.contains("sample_interval"));
}

#[test]
fn debug_stop_profiler_appends_marker() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request_bare("debug.stop_profiler", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "debug.stop_profiler");
    assert!(out["generated"].as_bool().unwrap());

    let body =
        std::fs::read_to_string(root.join("scripts").join("systems").join("profiler.lua")).unwrap();
    assert!(body.contains("Profiler.stop"));
    assert!(body.contains("Profiler.elapsed"));
}

#[test]
fn debug_get_frame_metrics_returns_persisted_when_present() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Pre-populate persisted metrics.
    let diag_dir = root.join(".project").join("diagnostics");
    std::fs::create_dir_all(&diag_dir).unwrap();
    std::fs::write(
        diag_dir.join("frame-metrics.json"),
        serde_json::to_string_pretty(&json!({ "fps": 60, "frame_ms": 16.6 })).unwrap(),
    )
    .unwrap();

    let req = make_request_bare("debug.get_frame_metrics", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "debug.get_frame_metrics");
    assert!(out["generated"].as_bool().unwrap());
    assert!(out["has_persisted_metrics"].as_bool().unwrap());
    assert_eq!(out["metrics"]["fps"].as_u64().unwrap(), 60);
}

#[test]
fn debug_export_diagnostics_writes_snapshot() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    // Add an extra Lua file so the count is non-trivial.
    std::fs::write(root.join("scripts").join("extra.lua"), "-- extra\n").unwrap();

    let req = make_request_bare("debug.export_diagnostics", root_str);
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "debug.export_diagnostics");
    assert!(out["exported"].as_bool().unwrap());
    // Two Lua files: main.lua + extra.lua.
    assert_eq!(out["lua_files"].as_u64().unwrap(), 2);

    let snapshot_path = out["path"].as_str().unwrap();
    assert!(std::path::Path::new(snapshot_path).exists());
    let body = std::fs::read_to_string(snapshot_path).unwrap();
    assert!(body.contains("exported_at"));
    assert!(body.contains("counts"));
}

#[test]
fn debug_assert_state_appends_named_function() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "debug.assert_state",
        root_str,
        json!({
            "name": "player_alive",
            "condition": "player.hp > 0",
            "message": "player should be alive"
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "debug.assert_state");
    assert!(out["generated"].as_bool().unwrap());
    assert_eq!(
        out["function"].as_str().unwrap(),
        "Profiler.assert_player_alive"
    );

    let body =
        std::fs::read_to_string(root.join("scripts").join("systems").join("profiler.lua")).unwrap();
    assert!(body.contains("assert_player_alive"));
    assert!(body.contains("player.hp > 0"));
}
