//! Integration tests for `animation.*` operations.
//!
//! Covers clips, curves, animator controllers (parameters/layers/states/
//! transitions), and timelines (tracks/clip entries).

mod common;

use common::{assert_success, make_request, scaffold_project};
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;

fn provider() -> TapTapProvider {
    TapTapProvider::new()
}

// ============================================================
// Clips
// ============================================================

#[test]
fn animation_create_clip_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "animation.create_clip",
        root_str,
        json!({ "name": "idle", "duration": 1.5, "loop": "loop" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.create_clip");
    assert!(out["created"].as_bool().unwrap());

    let clip_path = root
        .join("assets")
        .join("animations")
        .join("idle.anim.json");
    assert!(clip_path.exists());
    let body = std::fs::read_to_string(&clip_path).unwrap();
    assert!(body.contains("idle"));
    assert!(body.contains("\"loop\""));
}

#[test]
fn animation_create_clip_rejects_duplicate() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request("animation.create_clip", root_str, json!({ "name": "dup" }));
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
fn animation_set_curve_adds_curve_to_clip() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request("animation.create_clip", root_str, json!({ "name": "walk" }));
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.set_curve",
        root_str,
        json!({
            "name": "walk",
            "curve": "position_x",
            "keyframes": [{ "t": 0.0, "v": 0.0 }, { "t": 1.0, "v": 10.0 }]
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.set_curve");
    assert!(out["set"].as_bool().unwrap());

    let clip_path = root
        .join("assets")
        .join("animations")
        .join("walk.anim.json");
    let body = std::fs::read_to_string(&clip_path).unwrap();
    assert!(body.contains("position_x"));
}

#[test]
fn animation_get_clip_returns_payload() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_clip",
        root_str,
        json!({ "name": "run", "duration": 0.8 }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request("animation.get_clip", root_str, json!({ "name": "run" }));
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.get_clip");
    assert!(out["clip"].is_object());
    assert_eq!(out["clip"]["name"].as_str().unwrap(), "run");
}

#[test]
fn animation_remove_curve_strips_curve_from_clip() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request("animation.create_clip", root_str, json!({ "name": "jump" }));
    let _ = provider.execute(&create_req).unwrap();
    let set_req = make_request(
        "animation.set_curve",
        root_str,
        json!({ "name": "jump", "curve": "height" }),
    );
    let _ = provider.execute(&set_req).unwrap();

    let req = make_request(
        "animation.remove_curve",
        root_str,
        json!({ "name": "jump", "curve": "height" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.remove_curve");
    assert!(out["removed"].as_u64().unwrap() >= 1);
}

// ============================================================
// Animator Controllers
// ============================================================

#[test]
fn animation_create_controller_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "animation.create_controller",
        root_str,
        json!({ "name": "player_ctl" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.create_controller");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("assets")
        .join("animator")
        .join("player_ctl.controller.json");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("player_ctl"));
    assert!(body.contains("parameters"));
}

#[test]
fn animation_add_parameter_appends_to_controller() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_controller",
        root_str,
        json!({ "name": "ctl_param" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.add_parameter",
        root_str,
        json!({
            "name": "ctl_param",
            "param_name": "speed",
            "param_type": "float",
            "default": 0.0
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.add_parameter");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["parameter"]["name"].as_str().unwrap(), "speed");
}

#[test]
fn animation_add_layer_appends_to_controller() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_controller",
        root_str,
        json!({ "name": "ctl_layer" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.add_layer",
        root_str,
        json!({ "name": "ctl_layer", "layer_name": "upper_body", "weight": 0.7 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.add_layer");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["layer"]["name"].as_str().unwrap(), "upper_body");
}

#[test]
fn animation_add_state_appends_and_sets_entry() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_controller",
        root_str,
        json!({ "name": "ctl_state" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.add_state",
        root_str,
        json!({ "name": "ctl_state", "state_name": "idle", "motion": "idle_clip" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.add_state");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["state"]["name"].as_str().unwrap(), "idle");

    // entry_state should now be "idle".
    let get_req = make_request(
        "animation.get_controller",
        root_str,
        json!({ "name": "ctl_state" }),
    );
    let get_res = provider.execute(&get_req).unwrap();
    let get_out = assert_success(&get_res, "animation.get_controller");
    assert_eq!(
        get_out["controller"]["entry_state"].as_str().unwrap(),
        "idle"
    );
}

#[test]
fn animation_add_transition_appends_edge() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_controller",
        root_str,
        json!({ "name": "ctl_trans" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.add_transition",
        root_str,
        json!({
            "name": "ctl_trans",
            "from": "idle",
            "to": "walk",
            "condition": { "param": "speed", "op": ">", "value": 0.1 }
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.add_transition");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["transition"]["from"].as_str().unwrap(), "idle");
    assert_eq!(out["transition"]["to"].as_str().unwrap(), "walk");
}

#[test]
fn animation_get_controller_returns_payload() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_controller",
        root_str,
        json!({ "name": "ctl_get" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.get_controller",
        root_str,
        json!({ "name": "ctl_get" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.get_controller");
    assert!(out["controller"].is_object());
    assert_eq!(out["controller"]["name"].as_str().unwrap(), "ctl_get");
}

#[test]
fn animation_get_controller_reports_missing() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "animation.get_controller",
        root_str,
        json!({ "name": "ghost" }),
    );
    let res = provider.execute(&req).unwrap();
    assert!(!res.success);
    assert!(res.output["error"].as_str().unwrap().contains("not found"));
}

// ============================================================
// Timelines
// ============================================================

#[test]
fn animation_create_timeline_writes_file() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let req = make_request(
        "animation.create_timeline",
        root_str,
        json!({ "name": "intro", "duration": 3.0, "fps": 60 }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.create_timeline");
    assert!(out["created"].as_bool().unwrap());

    let path = root
        .join("assets")
        .join("timelines")
        .join("intro.timeline.json");
    assert!(path.exists());
    let body = std::fs::read_to_string(&path).unwrap();
    assert!(body.contains("intro"));
    assert!(body.contains("\"fps\""));
}

#[test]
fn animation_add_track_appends_to_timeline() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_timeline",
        root_str,
        json!({ "name": "tl_track" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.add_track",
        root_str,
        json!({ "name": "tl_track", "track_type": "animation", "target": "Player" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.add_track");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["track"]["type"].as_str().unwrap(), "animation");
}

#[test]
fn animation_add_clip_appends_to_track() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_timeline",
        root_str,
        json!({ "name": "tl_clip" }),
    );
    let _ = provider.execute(&create_req).unwrap();
    let track_req = make_request(
        "animation.add_track",
        root_str,
        json!({ "name": "tl_clip", "track_type": "animation" }),
    );
    let _ = provider.execute(&track_req).unwrap();

    let req = make_request(
        "animation.add_clip",
        root_str,
        json!({
            "name": "tl_clip",
            "track_index": 0,
            "clip": "idle",
            "start": 0.0,
            "end": 1.5
        }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.add_clip");
    assert!(out["added"].as_bool().unwrap());
    assert_eq!(out["clip"]["clip"].as_str().unwrap(), "idle");
}

#[test]
fn animation_get_timeline_returns_payload() {
    let provider = provider();
    let temp = tempfile::tempdir().unwrap();
    let root = scaffold_project(temp.path());
    let root_str = root.to_str().unwrap();

    let create_req = make_request(
        "animation.create_timeline",
        root_str,
        json!({ "name": "tl_get" }),
    );
    let _ = provider.execute(&create_req).unwrap();

    let req = make_request(
        "animation.get_timeline",
        root_str,
        json!({ "name": "tl_get" }),
    );
    let res = provider.execute(&req).unwrap();
    let out = assert_success(&res, "animation.get_timeline");
    assert!(out["timeline"].is_object());
    assert_eq!(out["timeline"]["name"].as_str().unwrap(), "tl_get");
}
