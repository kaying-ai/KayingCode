#![allow(dead_code)]

//! Shared test utilities for TapTap operation integration tests.
//!
//! Provides request builders and a minimal project scaffold helper so that
//! each per-module test file can stay focused on behaviour assertions.

use kaying_for_taptap_core::model::{EngineProvider, OperationRequest};
use serde_json::json;
use std::path::{Path, PathBuf};

/// Build an `OperationRequest` for the given operation id and project root.
///
/// `extra` is merged into `arguments` alongside `project_root`.
pub fn make_request(op: &str, root: &str, extra: serde_json::Value) -> OperationRequest {
    let operation_id = match op {
        "project.refactor_to_modular_v2" => "project.refactor_to_modular",
        _ => op,
    };
    let mut args = json!({ "project_root": root });
    if let serde_json::Value::Object(map) = extra {
        if let serde_json::Value::Object(target) = &mut args {
            for (k, v) in map {
                target.insert(k, v);
            }
        }
    }
    OperationRequest {
        request_id: format!("test-{op}"),
        provider_id: "taptap".to_string(),
        operation_id: operation_id.to_string(),
        project_root: None,
        arguments: args,
        timeout_ms: None,
        dry_run: false,
        plan_id: None,
        effect_digest: None,
    }
}

/// Build a request with no extra arguments.
pub fn make_request_bare(op: &str, root: &str) -> OperationRequest {
    make_request(op, root, json!({}))
}

/// Scaffold a minimal TapTap project: `.project/project.json` + `assets/` +
/// `scripts/main.lua`. Returns the project root path.
pub fn scaffold_project(temp: &Path) -> PathBuf {
    let root = temp.to_path_buf();
    let project_dir = root.join(".project");
    std::fs::create_dir_all(&project_dir).unwrap();
    let project_json = json!({
        "entry": "scripts/main.lua",
        "engineVersion": "1.0.0",
        "name": "test-project"
    });
    std::fs::write(
        project_dir.join("project.json"),
        serde_json::to_string_pretty(&project_json).unwrap(),
    )
    .unwrap();

    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::fs::create_dir_all(root.join("scripts")).unwrap();
    std::fs::write(root.join("scripts").join("main.lua"), "-- entry\n").unwrap();
    root
}

/// Scaffold a modular TapTap project via `project.init template=modular` for
/// tests that depend on the modular directory layout.
pub fn scaffold_modular(
    provider: &kaying_for_taptap_core::taptap::TapTapProvider,
    temp: &Path,
) -> PathBuf {
    let root = temp.to_path_buf();
    let req = make_request(
        "project.init",
        root.to_str().unwrap(),
        json!({ "template": "modular", "project_name": "test-modular" }),
    );
    let res = provider
        .execute(&req)
        .expect("project.init modular should succeed");
    assert!(res.success, "modular scaffold failed: {:?}", res.output);
    root
}

/// Read a JSON file and parse it, panicking on failure.
pub fn read_json(path: &Path) -> serde_json::Value {
    let body = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()));
    serde_json::from_str(&body)
        .unwrap_or_else(|e| panic!("failed to parse JSON {}: {e}", path.display()))
}

/// Assert that the result succeeded, returning the output for further checks.
pub fn assert_success<'a>(
    res: &'a kaying_for_taptap_core::model::OperationResult,
    op: &'a str,
) -> &'a serde_json::Value {
    assert!(res.success, "{op} should succeed, got: {:?}", res.output);
    &res.output
}
