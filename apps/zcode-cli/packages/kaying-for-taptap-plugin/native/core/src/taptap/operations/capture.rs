//! TapTap capture/screenshot operations — game view and scene view capture.
//!
//! Capture operations spawn the UrhoX Runtime in tool-mode to capture the
//! game/scene viewport as an image file. On platforms where UrhoX is not
//! available (e.g. macOS), they return a clear `available: false` diagnostic
//! and report how to provide an official runtime executable.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tracing::{info, warn};

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Default timeout for a single screenshot capture (15 seconds).
const DEFAULT_CAPTURE_TIMEOUT_MS: u64 = 15_000;

/// Handle `capture.game_view` — capture the game viewport.
///
/// Spawns `urhox --screenshot <output_path>` (tool-mode), waits for it to
/// exit, and verifies the image file was produced. Returns the file path
/// plus image metadata. If UrhoX is not available, returns `available: false`.
pub fn capture_game_view(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    run_capture(request, CaptureKind::GameView)
}

/// Handle `capture.scene_view` — capture the scene viewport.
///
/// Same as [`capture_game_view`] but uses `--scene-screenshot <output_path>`
/// to capture the editor scene view rather than the game viewport.
pub fn capture_scene_view(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    run_capture(request, CaptureKind::SceneView)
}

/// Prepare a capture operation — validate arguments and return a plan.
pub fn prepare_capture(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    let effects = match request.operation_id.as_str() {
        "capture.game_view" | "capture.scene_view" => {
            vec![
                crate::model::Effect::SpawnProcess,
                crate::model::Effect::ReadProject,
            ]
        }
        _ => vec![],
    };

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(5)).to_rfc3339(),
        effect_digest: "capture-effects".to_string(),
    })
}

// ============================================================
// Internal capture implementation
// ============================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CaptureKind {
    GameView,
    SceneView,
}

impl CaptureKind {
    fn flag(&self) -> &'static str {
        match self {
            CaptureKind::GameView => "--screenshot",
            CaptureKind::SceneView => "--scene-screenshot",
        }
    }

    fn label(&self) -> &'static str {
        match self {
            CaptureKind::GameView => "game_view",
            CaptureKind::SceneView => "scene_view",
        }
    }
}

/// Shared implementation for `capture.game_view` and `capture.scene_view`.
fn run_capture(
    request: &OperationRequest,
    kind: CaptureKind,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();

    let urhox_path = match find_urhox_binary(&request.arguments, &root) {
        Some(path) => path,
        None => {
            info!(
                project_root = %root.to_string_lossy(),
                kind = kind.label(),
                "UrhoX Runtime not found, returning platform diagnostic",
            );
            return Ok(unavailable_result(request, &root));
        }
    };

    // Resolve output path. Default to .project/screenshots/<kind>_<timestamp>.png
    let output_path = resolve_output_path(request, &root, kind);

    // Ensure parent directory exists
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ExecuteError::ExternalToolFailed(format!(
                    "Failed to create screenshot directory {}: {e}",
                    parent.display()
                ))
            })?;
        }
    }

    // Resolve optional timeout (ms)
    let timeout_ms = request
        .arguments
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_CAPTURE_TIMEOUT_MS);

    // Resolve entry point (optional for capture — UrhoX needs it to bootstrap the scene)
    let entry = request
        .arguments
        .get("entry")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            let project_json_path = root.join(".project").join("project.json");
            if project_json_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&project_json_path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        return json
                            .get("entry")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                    }
                }
            }
            None
        });

    info!(
        project_root = %root.to_string_lossy(),
        urhox = %urhox_path.to_string_lossy(),
        kind = kind.label(),
        output = %output_path.to_string_lossy(),
        timeout_ms,
        "Starting capture",
    );

    // Build command: urhox --tool-mode [--project <root>] [--entry <entry>] <flag> <output>
    let mut cmd = std::process::Command::new(&urhox_path);
    cmd.arg("--tool-mode")
        .arg("--project")
        .arg(root.to_string_lossy().as_ref())
        .arg(kind.flag())
        .arg(output_path.to_string_lossy().as_ref())
        .current_dir(urhox_path.parent().unwrap_or(&root))
        .env("KAYING_FOR_TAPTAP_PROJECT_ROOT", root.as_os_str())
        .env("KAYING_FOR_TAPTAP_TARGET", "project")
        .env("KAYING_FOR_TAPTAP_TARGET_PATH", root.as_os_str())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(ref entry) = entry {
        let entry_path = root.join(entry);
        if entry_path.exists() {
            cmd.arg("--entry")
                .arg(entry_path.to_string_lossy().as_ref());
        }
    }

    // Pass through extra args (e.g. --width, --height)
    if let Some(args) = request.arguments.get("args").and_then(|v| v.as_array()) {
        for arg in args {
            if let Some(s) = arg.as_str() {
                cmd.arg(s);
            }
        }
    }

    // Spawn
    let mut child = cmd.spawn().map_err(|e| {
        ExecuteError::ExternalToolFailed(format!("Failed to spawn UrhoX Runtime: {e}"))
    })?;

    let pid = child.id();

    // Wait with timeout. We poll try_wait in a loop so we can also collect exit
    // status precisely when the timeout fires.
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let exit_status: Result<std::process::ExitStatus, std::io::Error> = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    // Timeout — kill the process
                    let _ = child.kill();
                    let _ = child.wait();
                    warn!(
                        pid,
                        kind = kind.label(),
                        timeout_ms,
                        "Capture timed out, process killed"
                    );
                    return Ok(OperationResult {
                        request_id: request.request_id.clone(),
                        success: false,
                        output: json!({
                            "available": true,
                            "captured": false,
                            "kind": kind.label(),
                            "error": "capture_timeout",
                            "message": format!("UrhoX capture did not complete within {timeout_ms} ms"),
                            "pid": pid,
                            "project_root": root.to_string_lossy(),
                        }),
                        exit_code: Some(-1),
                        duration_ms: started.elapsed().as_millis() as u64,
                        log_path: None,
                    });
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => break Err(e),
        }
    };

    let exit_code = match exit_status {
        Ok(status) => status.code().unwrap_or(-1),
        Err(e) => {
            return Err(ExecuteError::ExternalToolFailed(format!(
                "Failed to wait for UrhoX capture: {e}"
            )));
        }
    };

    // Drain stdout/stderr so the pipe buffers don't deadlock the child on exit.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_str = read_to_string_lossy(stdout);
    let stderr_str = read_to_string_lossy(stderr);

    let duration_ms = started.elapsed().as_millis() as u64;

    // Verify the screenshot file was produced
    let file_exists = output_path.exists();
    let file_size = if file_exists {
        std::fs::metadata(&output_path)
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    if !file_exists || file_size == 0 {
        warn!(
            pid,
            exit_code,
            kind = kind.label(),
            output = %output_path.to_string_lossy(),
            file_exists,
            file_size,
            "Capture completed but output file is missing or empty"
        );
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "available": true,
                "captured": false,
                "kind": kind.label(),
                "error": "no_output_file",
                "message": "UrhoX exited but did not produce a screenshot file",
                "exit_code": exit_code,
                "expected_output": output_path.to_string_lossy(),
                "stdout": stdout_str,
                "stderr": stderr_str,
                "pid": pid,
                "project_root": root.to_string_lossy(),
            }),
            exit_code: Some(exit_code),
            duration_ms,
            log_path: None,
        });
    }

    info!(
        pid,
        exit_code,
        kind = kind.label(),
        output = %output_path.to_string_lossy(),
        file_size,
        duration_ms,
        "Capture succeeded"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "available": true,
            "captured": true,
            "kind": kind.label(),
            "image_path": output_path.to_string_lossy(),
            "file_size": file_size,
            "exit_code": exit_code,
            "pid": pid,
            "duration_ms": duration_ms,
            "project_root": root.to_string_lossy(),
            "stdout": stdout_str,
            "stderr": stderr_str,
        }),
        exit_code: Some(exit_code),
        duration_ms,
        log_path: None,
    })
}

/// Build the "UrhoX unavailable" result, describing the missing official runtime.
fn unavailable_result(request: &OperationRequest, root: &Path) -> OperationResult {
    OperationResult {
        request_id: request.request_id.clone(),
        success: true, // not a hard failure — caller should check `available`
        output: json!({
            "available": false,
            "captured": false,
            "reason": "UrhoX Runtime is not available on this platform",
            "platform": std::env::consts::OS,
            "project_root": root.to_string_lossy(),
            "fallback": {
                "tool": "kaying-for-taptap_game_command",
                "description": "When local execution is requested, configure the official TapTap runtime for capture.",
                "hint": "Set KAYING_FOR_TAPTAP_URHOX_BIN to a UrhoX Runtime executable to enable real capture.",
            },
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    }
}

/// Resolve the screenshot output path.
///
/// Priority:
/// 1. Explicit `output_path` argument (resolved relative to project root)
/// 2. Default: `<project_root>/.project/screenshots/<kind>_<timestamp>.png`
fn resolve_output_path(request: &OperationRequest, root: &Path, kind: CaptureKind) -> PathBuf {
    if let Some(s) = request
        .arguments
        .get("output_path")
        .and_then(|v| v.as_str())
    {
        let p = PathBuf::from(s);
        if p.is_absolute() {
            return p;
        }
        return root.join(p);
    }

    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%S");
    root.join(".project")
        .join("screenshots")
        .join(format!("{}_{}.png", kind.label(), ts))
}

/// Read an optional piped stdout/stderr to a lossy string (drains the pipe).
fn read_to_string_lossy<R: std::io::Read>(mut reader: Option<R>) -> String {
    let Some(ref mut r) = reader else {
        return String::new();
    };
    let mut buf = Vec::with_capacity(4096);
    // Read up to 64 KiB to avoid unbounded memory use on a runaway child.
    let mut chunk = [0u8; 4096];
    while buf.len() < 65536 {
        match r.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
    }
    String::from_utf8_lossy(&buf).to_string()
}

// ============================================================
// Binary discovery & helpers
// ============================================================

/// Find the UrhoX Runtime binary path.
///
/// Checks the `KAYING_FOR_TAPTAP_URHOX_BIN` environment variable first,
/// then falls back to platform-specific installation paths.
fn find_urhox_binary(arguments: &serde_json::Value, root: &Path) -> Option<PathBuf> {
    if let Some(value) = arguments
        .get("runtime_path")
        .and_then(|value| value.as_str())
    {
        let path = PathBuf::from(value);
        let path = if path.is_absolute() {
            path
        } else {
            root.join(path)
        };
        if path.is_file() {
            return Some(path);
        }
    }

    // Check environment variable override first
    if let Ok(val) = std::env::var("KAYING_FOR_TAPTAP_URHOX_BIN") {
        let path = PathBuf::from(val);
        if path.exists() {
            return Some(path);
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    candidates.push(root.join(".cli").join("UrhoXRuntime.exe"));
    if let Some(parent) = root.parent() {
        candidates.push(parent.join(".cli").join("UrhoXRuntime.exe"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("TapTap")
                    .join("UrhoXRuntime")
                    .join("UrhoXRuntime.exe"),
            );
        }
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_appdata)
                    .join("TapTap")
                    .join("UrhoXRuntime")
                    .join("UrhoXRuntime.exe"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(
            PathBuf::from("/Applications")
                .join("TapTap UrhoX.app")
                .join("Contents")
                .join("MacOS")
                .join("UrhoXRuntime"),
        );
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Some(candidate.clone());
        }
    }

    None
}

fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, ExecuteError> {
    let root_str = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
        .or_else(|| request.project_root.as_ref().and_then(|p| p.to_str()))
        .ok_or_else(|| ExecuteError::NotPrepared("Missing project_root argument".to_string()))?;

    let path = PathBuf::from(root_str);
    if !path.exists() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Project root does not exist: {}",
            path.display()
        )));
    }

    Ok(Arc::from(path))
}
