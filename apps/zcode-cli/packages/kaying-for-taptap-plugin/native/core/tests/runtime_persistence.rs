//! Cross-provider Runtime session persistence and smoke coverage.

mod common;

use common::make_request;
use kaying_for_taptap_core::model::EngineProvider;
use kaying_for_taptap_core::taptap::TapTapProvider;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[test]
fn runtime_session_survives_provider_recreation() {
    let temp = tempfile::tempdir().unwrap();
    let root = common::scaffold_project(temp.path());
    let runtime = fake_runtime(&root);
    let provider = TapTapProvider::new();
    let run = provider
        .execute(&make_request(
            "runtime.run",
            root.to_str().unwrap(),
            json!({ "runtime_path": runtime }),
        ))
        .expect("runtime.run should start");
    assert!(run.success, "runtime.run failed: {:?}", run.output);
    let session_id = run.output["session_id"].as_str().unwrap().to_string();

    let stdout_path = PathBuf::from(run.output["stdout_path"].as_str().unwrap());
    wait_for_log(&stdout_path, "READY");
    let recreated_provider = TapTapProvider::new();
    let status = recreated_provider
        .execute(&make_request(
            "runtime.status",
            root.to_str().unwrap(),
            json!({ "session_id": session_id }),
        ))
        .expect("runtime.status should load persisted metadata");
    assert!(status.output["running"].as_bool().unwrap_or(false));

    let logs = recreated_provider
        .execute(&make_request(
            "runtime.logs",
            root.to_str().unwrap(),
            json!({ "session_id": session_id, "tail": 20 }),
        ))
        .expect("runtime.logs should load persisted files");
    assert!(
        logs.output["stdout"]
            .as_str()
            .unwrap_or_default()
            .contains("READY")
    );

    let cancelled = recreated_provider
        .execute(&make_request(
            "runtime.cancel",
            root.to_str().unwrap(),
            json!({ "session_id": session_id }),
        ))
        .expect("runtime.cancel should terminate persisted session");
    assert_eq!(cancelled.output["status"], "cancelled");
}

#[test]
fn runtime_smoke_observes_ready_log_and_cleans_up() {
    let temp = tempfile::tempdir().unwrap();
    let root = common::scaffold_project(temp.path());
    let runtime = fake_runtime(&root);
    let result = TapTapProvider::new()
        .execute(&make_request(
            "runtime.smoke",
            root.to_str().unwrap(),
            json!({
                "runtime_path": runtime,
                "ready_pattern": "READY",
                "timeout_ms": 3_000,
                "capture": false
            }),
        ))
        .expect("runtime.smoke should execute");
    assert!(result.success, "smoke failed: {:?}", result.output);
    assert_eq!(result.output["passed"], true);
    assert_eq!(result.output["kept_running"], false);
    assert!(!root.join(".project/gameflow").exists());
}

#[test]
fn failed_runtime_start_preserves_retired_user_data() {
    let temp = tempfile::tempdir().unwrap();
    let root = common::scaffold_project(temp.path());
    let evidence_path = root.join(".project/gameflow/runtime-evidence.json");
    fs::create_dir_all(evidence_path.parent().unwrap()).unwrap();
    fs::write(&evidence_path, r#"{"status":"passed"}"#).unwrap();
    let result = TapTapProvider::new().execute(&make_request(
        "runtime.smoke",
        root.to_str().unwrap(),
        json!({
            "runtime_path": root.join("missing-runtime"),
            "ready_pattern": "READY", "capture": false
        }),
    ));
    assert!(result.is_err());
    assert_eq!(
        fs::read_to_string(&evidence_path).unwrap(),
        r#"{"status":"passed"}"#
    );
}

fn fake_runtime(root: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let path = root.join("fake-runtime.cmd");
        fs::write(
            &path,
            "@echo READY\r\n@powershell.exe -NoLogo -NoProfile -Command \"Start-Sleep -Seconds 30\"\r\n",
        )
        .unwrap();
        path
    }
    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = root.join("fake-runtime.sh");
        fs::write(&path, "#!/bin/sh\necho READY\nsleep 30\n").unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&path, permissions).unwrap();
        path
    }
}

fn wait_for_log(path: &Path, pattern: &str) {
    for _ in 0..50 {
        if fs::read_to_string(path)
            .unwrap_or_default()
            .contains(pattern)
        {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!(
        "Runtime log did not contain '{pattern}': {}",
        path.display()
    );
}
