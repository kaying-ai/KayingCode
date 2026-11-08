//! Persistent Runtime session metadata, logs, liveness, and termination.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSession {
    pub session_id: String,
    pub pid: u32,
    pub status: String,
    pub started_at: String,
    pub entry: String,
    pub runtime_path: String,
    pub stdout_path: String,
    pub stderr_path: String,
}

pub struct RuntimeSessionPaths {
    pub metadata: PathBuf,
    pub stdout: PathBuf,
    pub stderr: PathBuf,
}

pub fn create_paths(root: &Path, session_id: &str) -> Result<RuntimeSessionPaths, String> {
    validate_session_id(session_id)?;
    let directory = root.join(".project").join("runtime").join("sessions");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create Runtime session directory: {error}"))?;
    Ok(RuntimeSessionPaths {
        metadata: directory.join(format!("{session_id}.json")),
        stdout: directory.join(format!("{session_id}.stdout.log")),
        stderr: directory.join(format!("{session_id}.stderr.log")),
    })
}

pub fn save(root: &Path, session: &RuntimeSession) -> Result<(), String> {
    let paths = create_paths(root, &session.session_id)?;
    let payload = serde_json::to_string_pretty(session)
        .map_err(|error| format!("Failed to encode Runtime session: {error}"))?;
    fs::write(paths.metadata, payload)
        .map_err(|error| format!("Failed to persist Runtime session: {error}"))
}

pub fn load(root: &Path, session_id: &str) -> Result<RuntimeSession, String> {
    let path = create_paths(root, session_id)?.metadata;
    let payload = fs::read_to_string(&path)
        .map_err(|error| format!("Runtime session '{session_id}' was not found: {error}"))?;
    serde_json::from_str(&payload)
        .map_err(|error| format!("Runtime session '{session_id}' is invalid: {error}"))
}

pub fn refresh(root: &Path, session_id: &str) -> Result<(RuntimeSession, bool), String> {
    let mut session = load(root, session_id)?;
    let running = session.status == "running" && is_process_running(session.pid);
    if session.status == "running" && !running {
        session.status = "exited".to_string();
        save(root, &session)?;
    }
    Ok((session, running))
}

pub fn read_logs(
    root: &Path,
    session_id: &str,
    tail_lines: usize,
) -> Result<(String, String), String> {
    let paths = create_paths(root, session_id)?;
    let stdout = fs::read_to_string(paths.stdout).unwrap_or_default();
    let stderr = fs::read_to_string(paths.stderr).unwrap_or_default();
    Ok((tail(&stdout, tail_lines), tail(&stderr, tail_lines)))
}

pub fn terminate(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return terminate_windows_process_tree(pid);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let result = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
        if result == 0 || !is_process_running(pid) {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error().to_string())
        }
    }
}

#[cfg(target_os = "windows")]
fn terminate_windows_process_tree(pid: u32) -> Result<(), String> {
    for descendant in windows_process_descendants(pid) {
        let _ = terminate_windows_process(descendant);
    }
    terminate_windows_process(pid)
}

#[cfg(target_os = "windows")]
fn windows_process_descendants(pid: u32) -> Vec<u32> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Vec::new();
        }
        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut processes = Vec::new();
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        let mut descendants = Vec::new();
        collect_windows_descendants(pid, &processes, &mut descendants);
        descendants
    }
}

#[cfg(target_os = "windows")]
fn collect_windows_descendants(pid: u32, processes: &[(u32, u32)], output: &mut Vec<u32>) {
    for (child_pid, parent_pid) in processes {
        if *parent_pid == pid && *child_pid != pid && !output.contains(child_pid) {
            collect_windows_descendants(*child_pid, processes, output);
            output.push(*child_pid);
        }
    }
}

#[cfg(target_os = "windows")]
fn terminate_windows_process(pid: u32) -> Result<(), String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_TERMINATE, TerminateProcess, WaitForSingleObject,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE | 0x0010_0000, 0, pid);
        if handle.is_null() {
            return if is_process_running(pid) {
                Err(format!(
                    "Failed to open Runtime process {pid}: {}",
                    std::io::Error::last_os_error()
                ))
            } else {
                Ok(())
            };
        }
        let terminated = TerminateProcess(handle, 1) != 0;
        if terminated {
            WaitForSingleObject(handle, 5_000);
        }
        CloseHandle(handle);
        if terminated || !is_process_running(pid) {
            Ok(())
        } else {
            Err(format!(
                "Failed to terminate Runtime process {pid}: {}",
                std::io::Error::last_os_error()
            ))
        }
    }
}

#[cfg(target_os = "windows")]
fn is_process_running(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code = 0;
        let queried = GetExitCodeProcess(handle, &mut exit_code) != 0;
        CloseHandle(handle);
        queried && exit_code == STILL_ACTIVE as u32
    }
}

#[cfg(not(target_os = "windows"))]
fn is_process_running(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as i32, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    let valid = !session_id.is_empty()
        && session_id.len() <= 96
        && session_id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-' || value == b'_');
    if valid {
        Ok(())
    } else {
        Err("Runtime session_id contains unsupported characters".to_string())
    }
}

fn tail(value: &str, lines: usize) -> String {
    if lines == 0 {
        return value.to_string();
    }
    let values = value.lines().collect::<Vec<_>>();
    values[values.len().saturating_sub(lines)..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_session_path_traversal() {
        let root = tempfile::tempdir().unwrap();
        assert!(create_paths(root.path(), "../escape").is_err());
    }

    #[test]
    fn persists_and_reads_session_logs() {
        let root = tempfile::tempdir().unwrap();
        let paths = create_paths(root.path(), "runtime-test").unwrap();
        fs::write(&paths.stdout, "one\ntwo\nthree\n").unwrap();
        fs::write(&paths.stderr, "warning\n").unwrap();
        let session = RuntimeSession {
            session_id: "runtime-test".to_string(),
            pid: u32::MAX,
            status: "exited".to_string(),
            started_at: chrono::Utc::now().to_rfc3339(),
            entry: "scripts/main.lua".to_string(),
            runtime_path: "runtime".to_string(),
            stdout_path: paths.stdout.to_string_lossy().to_string(),
            stderr_path: paths.stderr.to_string_lossy().to_string(),
        };
        save(root.path(), &session).unwrap();
        assert_eq!(load(root.path(), "runtime-test").unwrap().pid, u32::MAX);
        assert_eq!(
            read_logs(root.path(), "runtime-test", 2).unwrap().0,
            "two\nthree"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn detects_the_current_windows_process() {
        assert!(is_process_running(std::process::id()));
        assert!(!is_process_running(u32::MAX));
    }
}
