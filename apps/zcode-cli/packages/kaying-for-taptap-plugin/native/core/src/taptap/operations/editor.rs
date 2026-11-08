//! TapTap editor/runtime lifecycle operations — play, stop, pause, status.
//!
//! These operations manage the UrhoX Runtime in tool-mode (play/stop/pause).
//! On macOS where UrhoX is not available, they return meaningful diagnostics.

use crate::common::{ProgressEvent, emit_progress};
use crate::model::{
    Diagnostic, DiagnosticSeverity, ExecuteError, OperationPlan, OperationRequest, OperationResult,
    PrepareError,
};
use crate::process::ProcessSupervisor;
use serde_json::json;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Session state for editor play-mode.
#[derive(Debug, Clone, PartialEq, Eq)]
enum SessionState {
    Running,
    Paused,
}

/// Metadata for an active editor session.
#[derive(Debug, Clone)]
struct Session {
    state: SessionState,
    entry: String,
    project_root: Arc<Path>,
    pid: Option<u32>,
}

/// In-memory editor state tracking active sessions.
struct EditorState {
    supervisor: Mutex<ProcessSupervisor>,
    sessions: Mutex<HashMap<String, Session>>,
}

impl EditorState {
    fn new() -> Self {
        Self {
            supervisor: Mutex::new(ProcessSupervisor::new()),
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

/// Global editor state (lazily initialized).
fn editor_state() -> &'static EditorState {
    static STATE: std::sync::OnceLock<EditorState> = std::sync::OnceLock::new();
    STATE.get_or_init(EditorState::new)
}

/// Find the UrhoX Runtime binary path.
fn find_urhox_binary() -> Option<std::path::PathBuf> {
    if let Ok(val) = std::env::var("KAYING_FOR_TAPTAP_URHOX_BIN") {
        let path = std::path::PathBuf::from(val);
        if path.exists() {
            return Some(path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            let candidate = std::path::PathBuf::from(program_files)
                .join("TapTap")
                .join("UrhoXRuntime")
                .join("UrhoXRuntime.exe");
            if candidate.exists() {
                return Some(candidate);
            }
        }
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let candidate = std::path::PathBuf::from(local_appdata)
                .join("TapTap")
                .join("UrhoXRuntime")
                .join("UrhoXRuntime.exe");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let candidate = std::path::PathBuf::from("/Applications")
            .join("TapTap UrhoX.app")
            .join("Contents")
            .join("MacOS")
            .join("UrhoXRuntime");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

/// Check if UrhoX Runtime is available on the current platform.
fn is_urhox_available() -> bool {
    find_urhox_binary().is_some()
}

/// Build a diagnostic describing why UrhoX is unavailable.
fn urhox_unavailable_diagnostic() -> Diagnostic {
    #[cfg(target_os = "macos")]
    {
        Diagnostic {
            code: "URHOX_UNAVAILABLE".to_string(),
            message: "UrhoX Runtime is not available on macOS. \
                Editor play/stop/pause operations require the UrhoX Runtime tool-mode, \
                which is only supported on Windows. \
                Install TapTap UrhoX on Windows or use the TapTap Maker Cloud for remote builds."
                .to_string(),
            severity: DiagnosticSeverity::Error,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Diagnostic {
            code: "URHOX_UNAVAILABLE".to_string(),
            message: "UrhoX Runtime binary not found. \
                Install TapTap UrhoX or set the KAYING_FOR_TAPTAP_URHOX_BIN environment variable \
                to point to the UrhoX Runtime executable."
                .to_string(),
            severity: DiagnosticSeverity::Error,
        }
    }
}

// ============================================================
// editor.play — enter play mode
// ============================================================

/// Handle `editor.play` — launch the project in UrhoX Runtime tool-mode.
pub fn editor_play(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let state = editor_state();
    let started = Instant::now();

    // Check UrhoX availability
    let urhox_path = match find_urhox_binary() {
        Some(path) => path,
        None => {
            info!(
                project_root = %root.to_string_lossy(),
                "editor.play attempted but UrhoX is unavailable"
            );
            return Ok(OperationResult {
                request_id: request.request_id.clone(),
                success: false,
                output: json!({
                    "error": "UrhoX Runtime is not available",
                    "diagnostics": [urhox_unavailable_diagnostic()],
                    "project_root": root.to_string_lossy(),
                    "session_id": null,
                }),
                exit_code: Some(1),
                duration_ms: started.elapsed().as_millis() as u64,
                log_path: None,
            });
        }
    };

    emit_progress(&ProgressEvent::started(format!(
        "editor.play: launching UrhoX tool-mode ({})",
        urhox_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    )));

    // Determine entry point
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
        })
        .ok_or_else(|| {
            ExecuteError::NotPrepared(
                "No entry point specified and project.json has no entry".to_string(),
            )
        })?;

    let entry_path = root.join(&entry);
    if !entry_path.exists() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Entry point not found: {}",
            entry_path.display()
        )));
    }

    // Build the run command
    let mut cmd = std::process::Command::new(&urhox_path);
    cmd.arg("--tool-mode")
        .arg("--project")
        .arg(root.to_string_lossy().as_ref())
        .arg("--entry")
        .arg(&entry)
        .current_dir(&root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Add extra CLI arguments
    if let Some(args) = request.arguments.get("args").and_then(|v| v.as_array()) {
        for arg in args {
            if let Some(s) = arg.as_str() {
                cmd.arg(s);
            }
        }
    }

    // Spawn via supervisor
    let session_id = format!("editor-{}", uuid::Uuid::new_v4());
    let mut supervisor = state.supervisor.lock().unwrap();

    let handle = supervisor
        .spawn(session_id.clone(), "UrhoX Editor", &mut cmd)
        .map_err(|e| {
            ExecuteError::ExternalToolFailed(format!("Failed to spawn UrhoX Runtime editor: {e}"))
        })?;

    let pid = handle.pid;

    // Register the session
    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(
            session_id.clone(),
            Session {
                state: SessionState::Running,
                entry: entry.clone(),
                project_root: Arc::clone(&root),
                pid: Some(pid),
            },
        );
    }

    info!(
        session_id = %session_id,
        pid = %pid,
        entry = %entry,
        project_root = %root.to_string_lossy(),
        "Editor play mode started"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "session_id": session_id,
            "pid": pid,
            "entry": entry,
            "state": "running",
            "project_root": root.to_string_lossy(),
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// editor.stop — stop play mode
// ============================================================

/// Handle `editor.stop` — stop a running editor session.
pub fn editor_stop(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let session_id = request
        .arguments
        .get("session_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing session_id argument".to_string()))?;

    let state = editor_state();
    let mut supervisor = state.supervisor.lock().unwrap();
    let mut sessions = state.sessions.lock().unwrap();

    // Check if the session exists
    let is_known = sessions.contains_key(session_id);
    if !is_known {
        info!(session_id, "editor.stop: unknown session");
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Session '{session_id}' not found"),
                "session_id": session_id,
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    // Check if the process is still running
    let is_running = supervisor.is_running(session_id);

    if is_running {
        match supervisor.kill(session_id) {
            Ok(()) => {
                info!(session_id, "Editor session stopped");
            }
            Err(e) => {
                info!(
                    session_id,
                    error = %e,
                    "Failed to kill editor session process, removing from tracking"
                );
            }
        }
    } else {
        info!(session_id, "Editor session already stopped");
    }

    sessions.remove(session_id);

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "session_id": session_id,
            "stopped": is_running,
            "message": if is_running {
                format!("Session '{session_id}' stopped")
            } else {
                format!("Session '{session_id}' was already stopped")
            },
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// editor.pause — toggle pause
// ============================================================

/// Handle `editor.pause` — toggle pause state for a running session.
pub fn editor_pause(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let session_id = request
        .arguments
        .get("session_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing session_id argument".to_string()))?;

    let state = editor_state();
    let mut supervisor = state.supervisor.lock().unwrap();
    let mut sessions = state.sessions.lock().unwrap();

    let session = sessions.get_mut(session_id).ok_or_else(|| {
        ExecuteError::ExternalToolFailed(format!("Session '{session_id}' not found"))
    })?;

    // Check if the underlying process is still alive
    let is_running = supervisor.is_running(session_id);
    if !is_running {
        // Process died — remove the session and report
        let dead_session = sessions.remove(session_id).unwrap();
        info!(
            session_id,
            entry = %dead_session.entry,
            "Editor session process died, cannot pause"
        );
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Session '{session_id}' is no longer running"),
                "session_id": session_id,
                "state": "dead",
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    // Toggle pause state — try OS-level suspension; fall back to in-memory flag.
    let (new_state, process_suspended, suspend_error) = match session.state {
        SessionState::Running => {
            let suspended = if let Some(pid) = session.pid {
                suspend_process(pid)
            } else {
                SuspendResult::NoPid
            };
            let err = match &suspended {
                SuspendResult::Suspended => None,
                SuspendResult::Failed(msg) => Some(msg.clone()),
                SuspendResult::Unsupported => {
                    Some("OS-level process suspension not implemented on this platform".to_string())
                }
                SuspendResult::NoPid => Some("No pid available for session".to_string()),
            };
            session.state = SessionState::Paused;
            (
                SessionState::Paused,
                suspended == SuspendResult::Suspended,
                err,
            )
        }
        SessionState::Paused => {
            let suspended = if let Some(pid) = session.pid {
                resume_process(pid)
            } else {
                SuspendResult::NoPid
            };
            let err = match &suspended {
                SuspendResult::Suspended => None,
                SuspendResult::Failed(msg) => Some(msg.clone()),
                SuspendResult::Unsupported => {
                    Some("OS-level process suspension not implemented on this platform".to_string())
                }
                SuspendResult::NoPid => Some("No pid available for session".to_string()),
            };
            session.state = SessionState::Running;
            (
                SessionState::Running,
                suspended == SuspendResult::Suspended,
                err,
            )
        }
    };

    let state_str = match new_state {
        SessionState::Running => "running",
        SessionState::Paused => "paused",
    };

    info!(
        session_id,
        state = state_str,
        process_suspended,
        "Editor session pause toggled"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "session_id": session_id,
            "state": state_str,
            "paused": new_state == SessionState::Paused,
            "process_suspended": process_suspended,
            "suspend_warning": suspend_error,
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// Platform-specific process suspension
// ============================================================

/// Result of an attempt to suspend or resume a process at the OS level.
#[derive(Debug, PartialEq, Eq)]
enum SuspendResult {
    /// The OS-level operation succeeded.
    Suspended,
    /// The operation failed at the OS level (e.g. permission denied, invalid pid).
    Failed(String),
    /// The current platform has no implementation (state flag was toggled only).
    #[allow(dead_code)]
    Unsupported,
    /// The session had no recorded pid.
    NoPid,
}

/// Suspend (pause) the process with the given pid at the OS level.
///
/// - Unix: sends `SIGSTOP` via `libc::kill`.
/// - Windows: calls `NtSuspendProcess` via direct FFI to ntdll.
fn suspend_process(pid: u32) -> SuspendResult {
    #[cfg(unix)]
    {
        // SAFETY: pid is valid and owned by us (we spawned the process).
        let rc = unsafe { libc::kill(pid as i32, libc::SIGSTOP) };
        if rc == 0 {
            SuspendResult::Suspended
        } else {
            let err = std::io::Error::last_os_error();
            SuspendResult::Failed(format!(
                "SIGSTOP failed: {err} (errno={})",
                err.raw_os_error().unwrap_or(-1)
            ))
        }
    }

    #[cfg(windows)]
    {
        nt_suspend_resume(pid, true)
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        SuspendResult::Unsupported
    }
}

/// Resume (unpause) the process with the given pid at the OS level.
///
/// - Unix: sends `SIGCONT` via `libc::kill`.
/// - Windows: calls `NtResumeProcess` via direct FFI to ntdll.
fn resume_process(pid: u32) -> SuspendResult {
    #[cfg(unix)]
    {
        // SAFETY: pid is valid and owned by us.
        let rc = unsafe { libc::kill(pid as i32, libc::SIGCONT) };
        if rc == 0 {
            SuspendResult::Suspended
        } else {
            let err = std::io::Error::last_os_error();
            SuspendResult::Failed(format!(
                "SIGCONT failed: {err} (errno={})",
                err.raw_os_error().unwrap_or(-1)
            ))
        }
    }

    #[cfg(windows)]
    {
        nt_suspend_resume(pid, false)
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        SuspendResult::Unsupported
    }
}

// ============================================================
// Windows: NtSuspendProcess / NtResumeProcess via direct FFI to ntdll
// ============================================================
#[cfg(windows)]
mod nt_suspend {
    use std::ffi::c_void;

    use super::SuspendResult;

    /// ntstatus success code (STATUS_SUCCESS == 0).
    const STATUS_SUCCESS: i32 = 0;
    /// OpenProcess permission bit allowing suspend/resume.
    const PROCESS_SUSPEND_RESUME: u32 = 0x0800;

    unsafe extern "system" {
        fn LoadLibraryA(lpLibFileName: *const u8) -> *mut c_void;
        fn GetProcAddress(hModule: *mut c_void, lpProcName: *const u8) -> *mut c_void;
    }

    type OpenProcessFn = unsafe extern "system" fn(u32, i32, u32) -> *mut c_void;
    type CloseHandleFn = unsafe extern "system" fn(*mut c_void) -> i32;
    type NtSuspendProcessFn = unsafe extern "system" fn(*mut c_void) -> i32;
    type NtResumeProcessFn = unsafe extern "system" fn(*mut c_void) -> i32;

    const KERNEL32_NAME: &[u8] = b"kernel32.dll\0";
    const NTDLL_NAME: &[u8] = b"ntdll.dll\0";
    const OPEN_PROCESS_NAME: &[u8] = b"OpenProcess\0";
    const CLOSE_HANDLE_NAME: &[u8] = b"CloseHandle\0";
    const NT_SUSPEND_NAME: &[u8] = b"NtSuspendProcess\0";
    const NT_RESUME_NAME: &[u8] = b"NtResumeProcess\0";

    /// Suspend or resume the process by pid via NtSuspendProcess/NtResumeProcess.
    ///
    /// Returns `SuspendResult::Suspended` on `STATUS_SUCCESS`, otherwise a
    /// `Failed` variant with a human-readable message.
    pub fn nt_suspend_resume(pid: u32, suspend: bool) -> SuspendResult {
        // SAFETY: FFI calls to kernel32/ntdll are safe; we null-check every
        // returned pointer before transmuting/dereferencing.
        unsafe {
            let k32 = LoadLibraryA(KERNEL32_NAME.as_ptr());
            if k32.is_null() {
                return SuspendResult::Failed(
                    "LoadLibraryA(kernel32.dll) returned NULL".to_string(),
                );
            }
            let open_proc_ptr = GetProcAddress(k32, OPEN_PROCESS_NAME.as_ptr());
            if open_proc_ptr.is_null() {
                return SuspendResult::Failed(
                    "GetProcAddress(OpenProcess) returned NULL".to_string(),
                );
            }
            let open_proc: OpenProcessFn = std::mem::transmute(open_proc_ptr);

            let close_handle_ptr = GetProcAddress(k32, CLOSE_HANDLE_NAME.as_ptr());
            if close_handle_ptr.is_null() {
                return SuspendResult::Failed(
                    "GetProcAddress(CloseHandle) returned NULL".to_string(),
                );
            }
            let close_handle: CloseHandleFn = std::mem::transmute(close_handle_ptr);

            let ntdll = LoadLibraryA(NTDLL_NAME.as_ptr());
            if ntdll.is_null() {
                return SuspendResult::Failed("LoadLibraryA(ntdll.dll) returned NULL".to_string());
            }
            let proc_name = if suspend {
                NT_SUSPEND_NAME
            } else {
                NT_RESUME_NAME
            };
            let nt_proc_ptr = GetProcAddress(ntdll, proc_name.as_ptr());
            if nt_proc_ptr.is_null() {
                return SuspendResult::Failed(format!(
                    "GetProcAddress({}) returned NULL",
                    if suspend {
                        "NtSuspendProcess"
                    } else {
                        "NtResumeProcess"
                    }
                ));
            }

            let handle = open_proc(PROCESS_SUSPEND_RESUME, 0, pid);
            if handle.is_null() {
                let err = std::io::Error::last_os_error();
                return SuspendResult::Failed(format!(
                    "OpenProcess(pid={pid}) failed: {err} (errno={})",
                    err.raw_os_error().unwrap_or(-1)
                ));
            }

            let status: i32 = if suspend {
                let nt_fn: NtSuspendProcessFn = std::mem::transmute(nt_proc_ptr);
                nt_fn(handle)
            } else {
                let nt_fn: NtResumeProcessFn = std::mem::transmute(nt_proc_ptr);
                nt_fn(handle)
            };

            let _ = close_handle(handle);

            if status == STATUS_SUCCESS {
                SuspendResult::Suspended
            } else {
                SuspendResult::Failed(format!(
                    "{} returned ntstatus=0x{:X}",
                    if suspend {
                        "NtSuspendProcess"
                    } else {
                        "NtResumeProcess"
                    },
                    status as u32
                ))
            }
        }
    }
}

#[cfg(windows)]
fn nt_suspend_resume(pid: u32, suspend: bool) -> SuspendResult {
    nt_suspend::nt_suspend_resume(pid, suspend)
}

// ============================================================
// editor.status — get editor/runtime status
// ============================================================

/// Handle `editor.status` — report editor/runtime availability and session state.
pub fn editor_status(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let _root = get_project_root(request).ok();
    let state = editor_state();

    let urhox_available = is_urhox_available();
    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    if !urhox_available {
        diagnostics.push(urhox_unavailable_diagnostic());
    }

    let mut supervisor = state.supervisor.lock().unwrap();
    let sessions = state.sessions.lock().unwrap();

    // Collect active session info
    let active_sessions: Vec<serde_json::Value> = sessions
        .iter()
        .filter_map(|(id, session)| {
            let alive = supervisor.is_running(id);
            if alive {
                Some(json!({
                    "session_id": id,
                    "state": match session.state {
                        SessionState::Running => "running",
                        SessionState::Paused => "paused",
                    },
                    "entry": session.entry,
                    "project_root": session.project_root.to_string_lossy(),
                    "pid": session.pid,
                }))
            } else {
                None
            }
        })
        .collect();

    // Clean up dead sessions
    let dead_ids: Vec<String> = sessions
        .iter()
        .filter(|(id, _)| !supervisor.is_running(id))
        .map(|(id, _)| id.clone())
        .collect();
    for dead_id in &dead_ids {
        let _ = supervisor.detach(dead_id);
    }
    drop(sessions);
    {
        let mut sessions = state.sessions.lock().unwrap();
        for dead_id in &dead_ids {
            sessions.remove(dead_id);
        }
    }

    let has_active_session = !active_sessions.is_empty();
    let current_state = if !urhox_available {
        "unavailable"
    } else if active_sessions.is_empty() {
        "idle"
    } else {
        "active"
    };

    info!(
        urhox_available,
        active_sessions = active_sessions.len(),
        state = current_state,
        "Editor status checked"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "urhox_available": urhox_available,
            "has_active_session": has_active_session,
            "state": current_state,
            "active_sessions": active_sessions,
            "diagnostics": diagnostics,
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

// ============================================================
// Prepare
// ============================================================

/// Prepare an editor operation — validate arguments and return a plan.
pub fn prepare_editor(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    let (effects, targets) = match request.operation_id.as_str() {
        "editor.play" => (
            vec![
                crate::model::Effect::SpawnProcess,
                crate::model::Effect::ReadProject,
            ],
            vec![
                request
                    .arguments
                    .get("project_root")
                    .and_then(|v| v.as_str())
                    .unwrap_or(".")
                    .to_string(),
            ],
        ),
        "editor.stop" | "editor.pause" => (vec![], vec![]),
        "editor.status" => (vec![crate::model::Effect::ReadProject], vec![]),
        _ => (vec![], vec![]),
    };

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets,
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(5)).to_rfc3339(),
        effect_digest: "editor-effects".to_string(),
    })
}

// ============================================================
// Helpers
// ============================================================

fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, ExecuteError> {
    let root_str = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
        .or_else(|| request.project_root.as_ref().and_then(|p| p.to_str()))
        .ok_or_else(|| ExecuteError::NotPrepared("Missing project_root argument".to_string()))?;

    let path = std::path::PathBuf::from(root_str);
    if !path.exists() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Project root does not exist: {}",
            path.display()
        )));
    }

    Ok(Arc::from(path))
}
