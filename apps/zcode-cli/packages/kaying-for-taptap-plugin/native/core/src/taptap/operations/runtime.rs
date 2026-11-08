//! Persistent TapTap Runtime operations — run, status, logs, cancel, smoke.

use crate::common::{ProgressEvent, emit_progress};
use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use crate::taptap::operations::runtime_session::{self, RuntimeSession};
use serde_json::{Value, json};
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime};

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);
const DEFAULT_SMOKE_TIMEOUT_MS: u64 = 8_000;
const DEFAULT_TAIL_LINES: usize = 300;

pub fn runtime_run(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let session = start_session(request, &root)?;
    emit_progress(&ProgressEvent::completed(format!(
        "runtime.run: session {} started (pid={})",
        session.session_id, session.pid
    )));
    Ok(result(
        request,
        true,
        session_output(&session, true),
        started,
    ))
}

pub fn runtime_status(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let session_id = session_id(request)?;
    let (session, running) =
        runtime_session::refresh(&root, session_id).map_err(ExecuteError::ExternalToolFailed)?;
    Ok(result(
        request,
        true,
        session_output(&session, running),
        Instant::now(),
    ))
}

pub fn runtime_logs(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let session_id = session_id(request)?;
    let tail = request
        .arguments
        .get("tail")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(DEFAULT_TAIL_LINES);
    let (session, running) =
        runtime_session::refresh(&root, session_id).map_err(ExecuteError::ExternalToolFailed)?;
    let (stdout, stderr) = runtime_session::read_logs(&root, session_id, tail)
        .map_err(ExecuteError::ExternalToolFailed)?;
    Ok(result(
        request,
        true,
        json!({
            "session_id": session_id,
            "stdout": stdout,
            "stderr": stderr,
            "running": running,
            "status": session.status,
            "tail": tail,
        }),
        Instant::now(),
    ))
}

pub fn runtime_cancel(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let session_id = session_id(request)?;
    let (mut session, running) =
        runtime_session::refresh(&root, session_id).map_err(ExecuteError::ExternalToolFailed)?;
    if running {
        runtime_session::terminate(session.pid).map_err(ExecuteError::ExternalToolFailed)?;
    }
    session.status = "cancelled".to_string();
    runtime_session::save(&root, &session).map_err(ExecuteError::ExternalToolFailed)?;
    Ok(result(
        request,
        true,
        json!({
            "session_id": session_id,
            "cancelled": running,
            "status": session.status,
            "message": if running { "Runtime process tree terminated" } else { "Runtime was already stopped" },
        }),
        Instant::now(),
    ))
}

pub fn runtime_smoke(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let sidecar_started_at = SystemTime::now();
    let timeout_ms = request
        .arguments
        .get("timeout_ms")
        .and_then(Value::as_u64)
        .unwrap_or(DEFAULT_SMOKE_TIMEOUT_MS);
    let keep_running = request
        .arguments
        .get("keep_running")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let capture = request
        .arguments
        .get("capture")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let require_screenshot = request
        .arguments
        .get("require_screenshot")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let ready_pattern = request
        .arguments
        .get("ready_pattern")
        .and_then(Value::as_str)
        .map(str::to_lowercase);

    let mut session = start_session(request, &root)?;
    emit_progress(&ProgressEvent::running(
        format!("runtime.smoke: observing session {}", session.session_id),
        Some(25.0),
    ));
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut running = true;
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut sidecar_logs: String;
    let mut ready = false;
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(100));
        let refreshed = runtime_session::refresh(&root, &session.session_id)
            .map_err(ExecuteError::ExternalToolFailed)?;
        session = refreshed.0;
        running = refreshed.1;
        (stdout, stderr) =
            runtime_session::read_logs(&root, &session.session_id, DEFAULT_TAIL_LINES)
                .map_err(ExecuteError::ExternalToolFailed)?;
        sidecar_logs = read_runtime_sidecar_logs(request, &root, sidecar_started_at);
        let combined = format!("{stdout}\n{stderr}\n{sidecar_logs}").to_lowercase();
        ready = ready_pattern
            .as_ref()
            .is_some_and(|pattern| combined.contains(pattern));
        if ready || !running || contains_runtime_error(&combined) {
            break;
        }
    }

    sidecar_logs = read_runtime_sidecar_logs(request, &root, sidecar_started_at);
    let combined = format!("{stdout}\n{stderr}\n{sidecar_logs}").to_lowercase();
    let mut diagnostics = Vec::new();
    if contains_runtime_error(&combined) {
        diagnostics.push("Runtime log contains a fatal Lua/engine error".to_string());
    }
    if !running && !ready {
        diagnostics.push("Runtime exited before the smoke observation completed".to_string());
    }
    if ready_pattern.is_some() && !ready {
        diagnostics.push("Configured ready_pattern was not observed".to_string());
    }
    if ready_pattern.is_none() {
        diagnostics
            .push("runtime.smoke requires ready_pattern to verify runtime readiness".to_string());
    }

    let (screenshot_path, capture_available) = if capture {
        capture_screenshot(request, &root)
    } else {
        (None, false)
    };
    if require_screenshot && screenshot_path.is_none() {
        diagnostics
            .push("A screenshot was required but Runtime capture produced no artifact".to_string());
    }
    let passed = diagnostics.is_empty();
    if !keep_running {
        let _ = runtime_session::terminate(session.pid);
        session.status = "smoke_completed".to_string();
        runtime_session::save(&root, &session).map_err(ExecuteError::ExternalToolFailed)?;
        running = false;
    }
    let progress = if passed {
        ProgressEvent::completed(format!(
            "runtime.smoke: session {} passed",
            session.session_id
        ))
    } else {
        ProgressEvent::failed(format!(
            "runtime.smoke: session {} failed",
            session.session_id
        ))
    };
    emit_progress(&progress);
    Ok(result(
        request,
        passed,
        json!({
            "passed": passed,
            "session_id": session.session_id,
            "status": session.status,
            "stdout": stdout,
            "stderr": format!("{stderr}\n{sidecar_logs}"),
            "diagnostics": diagnostics,
            "screenshot_path": screenshot_path,
            "capture_available": capture_available,
            "kept_running": keep_running && running,
        }),
        started,
    ))
}

fn read_runtime_sidecar_logs(
    request: &OperationRequest,
    root: &Path,
    started_at: SystemTime,
) -> String {
    let runtime_path = request
        .arguments
        .get("runtime_path")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                root.join(path)
            }
        })
        .or_else(|| find_urhox_binary(root));
    let Some(runtime_dir) = runtime_path.and_then(|path| path.parent().map(Path::to_path_buf))
    else {
        return String::new();
    };
    let mut files = Vec::new();
    for directory in [
        runtime_dir.join("logs").join("lua"),
        runtime_dir.join("logs").join("game"),
    ] {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let modified = fs::metadata(&path).and_then(|meta| meta.modified()).ok();
            if path.extension().and_then(|value| value.to_str()) == Some("log")
                && modified.is_some_and(|value| value >= started_at)
            {
                files.push(path);
            }
        }
    }
    files.sort_by_key(|path| fs::metadata(path).and_then(|meta| meta.modified()).ok());
    files
        .into_iter()
        .rev()
        .take(3)
        .filter_map(|path| fs::read_to_string(path).ok())
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn prepare_runtime(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root = get_project_root(request)
        .map_err(|error| PrepareError::InvalidArguments(error.to_string()))?;
    let effects = match request.operation_id.as_str() {
        "runtime.run" | "runtime.smoke" => vec![
            Effect::SpawnProcess,
            Effect::ReadProject,
            Effect::WriteProject,
        ],
        "runtime.cancel" => vec![Effect::WriteProject],
        "runtime.logs" | "runtime.status" => vec![Effect::ReadProject],
        _ => vec![],
    };
    Ok(OperationPlan {
        plan_id: format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst)),
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects,
        project_fingerprint: None,
        expires_at: (chrono::Utc::now() + chrono::Duration::minutes(5)).to_rfc3339(),
        effect_digest: "runtime-effects".to_string(),
    })
}

fn start_session(request: &OperationRequest, root: &Path) -> Result<RuntimeSession, ExecuteError> {
    let runtime_path = resolve_runtime_binary(request, root)?;
    let (entry, entry_path) = resolve_entry(request, root)?;
    let session_id = format!("runtime-{}", uuid::Uuid::new_v4());
    let paths = runtime_session::create_paths(root, &session_id)
        .map_err(ExecuteError::ExternalToolFailed)?;
    let stdout = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&paths.stdout)
        .map_err(ExecuteError::Io)?;
    let stderr = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&paths.stderr)
        .map_err(ExecuteError::Io)?;
    let mut command = Command::new(&runtime_path);
    let runtime_cwd = runtime_path.parent().unwrap_or(root);
    command
        .arg(&entry_path)
        .current_dir(runtime_cwd)
        .env("KAYING_FOR_TAPTAP_PROJECT_ROOT", root)
        .env("KAYING_FOR_TAPTAP_TARGET", "project")
        .env("KAYING_FOR_TAPTAP_TARGET_PATH", root)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    if let Some(arguments) = request.arguments.get("args").and_then(Value::as_array) {
        for argument in arguments.iter().filter_map(Value::as_str) {
            command.arg(argument);
        }
    }
    let child = command.spawn().map_err(|error| {
        ExecuteError::ExternalToolFailed(format!(
            "Failed to spawn Runtime '{}': {error}",
            runtime_path.display()
        ))
    })?;
    let session = RuntimeSession {
        session_id,
        pid: child.id(),
        status: "running".to_string(),
        started_at: chrono::Utc::now().to_rfc3339(),
        entry,
        runtime_path: runtime_path.to_string_lossy().to_string(),
        stdout_path: paths.stdout.to_string_lossy().to_string(),
        stderr_path: paths.stderr.to_string_lossy().to_string(),
    };
    runtime_session::save(root, &session).map_err(ExecuteError::ExternalToolFailed)?;
    Ok(session)
}

fn resolve_runtime_binary(
    request: &OperationRequest,
    root: &Path,
) -> Result<PathBuf, ExecuteError> {
    let explicit = request
        .arguments
        .get("runtime_path")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                root.join(path)
            }
        });
    let path = explicit
        .or_else(|| {
            std::env::var("KAYING_FOR_TAPTAP_URHOX_BIN")
                .ok()
                .map(PathBuf::from)
        })
        .or_else(|| find_urhox_binary(root))
        .ok_or_else(|| {
            ExecuteError::ExternalToolFailed(
                "UrhoX Runtime not found. Install it or set KAYING_FOR_TAPTAP_URHOX_BIN"
                    .to_string(),
            )
        })?;
    if !path.is_file() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Runtime binary does not exist: {}",
            path.display()
        )));
    }
    Ok(path)
}

fn resolve_entry(
    request: &OperationRequest,
    root: &Path,
) -> Result<(String, PathBuf), ExecuteError> {
    let entry = request
        .arguments
        .get("entry")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            fs::read_to_string(root.join(".project").join("project.json"))
                .ok()
                .and_then(|value| serde_json::from_str::<Value>(&value).ok())
                .and_then(|value| {
                    value
                        .get("entry")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                })
        })
        .ok_or_else(|| ExecuteError::NotPrepared("No Runtime entry was configured".to_string()))?;
    let path = root.join(&entry);
    if !path.is_file() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Runtime entry does not exist: {}",
            path.display()
        )));
    }
    Ok((entry, path))
}

fn capture_screenshot(request: &OperationRequest, root: &Path) -> (Option<String>, bool) {
    let mut capture_request = request.clone();
    capture_request.operation_id = "capture.game_view".to_string();
    capture_request.project_root = Some(root.to_path_buf());
    match crate::taptap::operations::capture::capture_game_view(&capture_request) {
        Ok(result) => {
            let available = result
                .output
                .get("available")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            let path = result
                .output
                .get("image_path")
                .or_else(|| result.output.get("path"))
                .or_else(|| result.output.get("output_path"))
                .and_then(Value::as_str)
                .map(ToString::to_string);
            (path.filter(|value| Path::new(value).is_file()), available)
        }
        Err(_) => (None, false),
    }
}

fn contains_runtime_error(value: &str) -> bool {
    [
        "stack traceback",
        "module '",
        "module not found",
        "attempt to ",
        "fatal error",
        "lua error",
        "failed to load script",
        "cannot load script",
    ]
    .iter()
    .any(|pattern| value.contains(pattern))
}

fn find_urhox_binary(root: &Path) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    candidates.push(root.join(".cli").join("UrhoXRuntime.exe"));
    if let Some(parent) = root.parent() {
        candidates.push(parent.join(".cli").join("UrhoXRuntime.exe"));
    }
    #[cfg(target_os = "windows")]
    {
        for variable in ["ProgramFiles", "LOCALAPPDATA"] {
            if let Ok(directory) = std::env::var(variable) {
                candidates.push(
                    PathBuf::from(directory)
                        .join("TapTap")
                        .join("UrhoXRuntime")
                        .join("UrhoXRuntime.exe"),
                );
            }
        }
    }
    #[cfg(target_os = "macos")]
    candidates.push(PathBuf::from(
        "/Applications/TapTap UrhoX.app/Contents/MacOS/UrhoXRuntime",
    ));
    candidates.into_iter().find(|path| path.is_file())
}

fn session_id(request: &OperationRequest) -> Result<&str, ExecuteError> {
    request
        .arguments
        .get("session_id")
        .and_then(Value::as_str)
        .ok_or_else(|| ExecuteError::NotPrepared("Missing session_id argument".to_string()))
}

fn session_output(session: &RuntimeSession, running: bool) -> Value {
    json!({
        "session_id": session.session_id, "pid": session.pid,
        "status": session.status, "running": running, "started_at": session.started_at,
        "entry": session.entry, "stdout_path": session.stdout_path, "stderr_path": session.stderr_path,
    })
}

fn result(
    request: &OperationRequest,
    success: bool,
    output: Value,
    started: Instant,
) -> OperationResult {
    OperationResult {
        request_id: request.request_id.clone(),
        success,
        output,
        exit_code: Some(if success { 0 } else { 1 }),
        duration_ms: started.elapsed().as_millis() as u64,
        log_path: None,
    }
}

fn get_project_root(request: &OperationRequest) -> Result<PathBuf, ExecuteError> {
    let root = request
        .arguments
        .get("project_root")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .or_else(|| request.project_root.clone())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing project_root argument".to_string()))?;
    if !root.is_dir() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Project root does not exist: {}",
            root.display()
        )));
    }
    Ok(root)
}
