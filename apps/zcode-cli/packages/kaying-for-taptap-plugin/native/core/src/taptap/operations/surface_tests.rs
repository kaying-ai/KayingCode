use super::*;
use crate::model::OperationRequest as Req;
use tempfile::tempdir;

fn req(root: &Path, op: &str) -> Req {
    Req {
        request_id: "r1".to_string(),
        provider_id: "taptap".to_string(),
        operation_id: op.to_string(),
        project_root: Some(root.to_path_buf()),
        arguments: serde_json::json!({}),
        timeout_ms: None,
        dry_run: false,
        plan_id: None,
        effect_digest: None,
    }
}

fn with_args(root: &Path, op: &str, args: serde_json::Value) -> Req {
    let mut r = req(root, op);
    r.arguments = args;
    r
}

fn plan(op: &str) -> OperationPlan {
    OperationPlan {
        plan_id: "p".into(),
        normalized_operation: op.into(),
        normalized_arguments: serde_json::json!({}),
        targets: vec![],
        effects: vec![],
        project_fingerprint: None,
        expires_at: "x".into(),
        effect_digest: "d".into(),
    }
}

#[test]
fn test_surface_create_then_list() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    let create = surface_create(
        &with_args(
            root,
            "surface.create",
            json!({"id": "main_menu", "template": "main_menu"}),
        ),
        &plan("surface.create"),
    )
    .unwrap();
    assert_eq!(create.output["created"], true);
    assert_eq!(create.output["default"], true);

    let list = surface_list(&req(root, "surface.list")).unwrap();
    assert_eq!(list.output["count"], 1);
    assert_eq!(list.output["surfaces"][0]["id"], "main_menu");
}

#[test]
fn test_surface_create_duplicate_rejected() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    surface_create(
        &with_args(
            root,
            "surface.create",
            json!({"id": "pause", "template": "pause"}),
        ),
        &plan("surface.create"),
    )
    .unwrap();
    let dup = surface_create(
        &with_args(
            root,
            "surface.create",
            json!({"id": "pause", "template": "pause"}),
        ),
        &plan("surface.create"),
    )
    .unwrap();
    assert_eq!(dup.output["created"], false);
    assert!(dup.output["error"].as_str().unwrap().contains("already"));
}

#[test]
fn test_surface_get_and_switch() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    for id in ["a", "b"] {
        surface_create(
            &with_args(
                root,
                "surface.create",
                json!({"id": id, "template": "blank"}),
            ),
            &plan("surface.create"),
        )
        .unwrap();
    }
    let g = surface_get(&with_args(root, "surface.get", json!({"id": "b"}))).unwrap();
    assert_eq!(g.output["surface"]["id"], "b");

    let sw = surface_switch(
        &with_args(root, "surface.switch", json!({"id": "b"})),
        &plan("surface.switch"),
    )
    .unwrap();
    assert_eq!(sw.output["active"], "b");
}

#[test]
fn test_surface_sync_reports_drift() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    surface_create(
        &with_args(
            root,
            "surface.create",
            json!({"id": "a", "template": "blank"}),
        ),
        &plan("surface.create"),
    )
    .unwrap();
    fs::create_dir_all(root.join("scripts/ui/surfaces/orphan")).unwrap();

    let sync = surface_sync(&req(root, "surface.sync")).unwrap();
    assert_eq!(sync.output["in_sync"], false);
    assert_eq!(sync.output["in_dir_not_manifest"][0], "orphan");
}

#[test]
fn test_surface_add_transition_validates() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    for id in ["menu", "hud"] {
        surface_create(
            &with_args(
                root,
                "surface.create",
                json!({"id": id, "template": "blank"}),
            ),
            &plan("surface.create"),
        )
        .unwrap();
    }
    let ok = surface_add_transition(
        &with_args(
            root,
            "surface.add_transition",
            json!({"id": "menu", "to": "hud", "event": "start_game"}),
        ),
        &plan("surface.add_transition"),
    )
    .unwrap();
    assert_eq!(ok.output["added"], true);
}
