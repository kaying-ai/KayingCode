//! Process supervisor — manages child process lifecycle.
//!
//! On Unix, processes are spawned into a new process group (via `setid` before exec)
//! so that the supervisor can kill the entire process tree. On Windows, the supervisor
//! uses `job-object`-style tracking via `kill_tree` fallback.

use crate::process::error::ProcessError;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tracing::{debug, error, info, warn};

/// A tracked child process handle.
#[derive(Debug)]
pub struct ProcessHandle {
    /// Unique identifier for this process.
    pub id: String,
    /// System PID.
    pub pid: u32,
    /// Human-readable label.
    pub label: String,
    /// Underlying child process.
    child: Option<std::process::Child>,
}

impl ProcessHandle {
    /// Wait for the process to exit and return the exit code.
    ///
    /// Returns `None` if the process was already reaped or detached.
    pub fn wait(&mut self) -> Result<Option<i32>, ProcessError> {
        if let Some(child) = self.child.as_mut() {
            let status = child.wait().map_err(ProcessError::Spawn)?;
            Ok(Some(status.code().unwrap_or(-1)))
        } else {
            Ok(None)
        }
    }

    /// Try to wait with a timeout.
    pub fn wait_with_timeout(&mut self, timeout: Duration) -> Result<Option<i32>, ProcessError> {
        let pid = self.pid;
        let deadline = std::time::Instant::now() + timeout;

        loop {
            if let Some(child) = self.child.as_mut() {
                // Try non-blocking wait
                match child.try_wait() {
                    Ok(Some(status)) => return Ok(Some(status.code().unwrap_or(-1))),
                    Ok(None) => {
                        // Still running
                        if std::time::Instant::now() >= deadline {
                            return Err(ProcessError::Timeout {
                                pid,
                                timeout_ms: timeout.as_millis() as u64,
                            });
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Err(e) => return Err(ProcessError::Spawn(e)),
                }
            } else {
                return Ok(None);
            }
        }
    }

    /// Take ownership of the child's stdout handle (if piped).
    ///
    /// After this call, `wait()` still works but the stdout pipe is no longer
    /// owned by the child. The caller is responsible for reading it to completion
    /// to avoid the child blocking on a full pipe buffer.
    pub fn take_stdout(&mut self) -> Option<std::process::ChildStdout> {
        self.child.as_mut().and_then(|c| c.stdout.take())
    }

    /// Take ownership of the child's stderr handle (if piped).
    ///
    /// See `take_stdout` for caveats.
    pub fn take_stderr(&mut self) -> Option<std::process::ChildStderr> {
        self.child.as_mut().and_then(|c| c.stderr.take())
    }

    /// Detach — stop tracking the child (it will become an orphan).
    pub fn detach(&mut self) {
        if let Some(child) = self.child.take() {
            // Child was already spawned with a new pgid, just forget about it
            let _ = child.id();
        }
    }
}

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let pid = child.id();
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Already exited, nothing to do
                }
                _ => {
                    // Still running — kill it
                    warn!(pid, "Process still running during drop, killing");
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }
}

/// Configuration for the process supervisor.
#[derive(Debug, Clone)]
pub struct SupervisorConfig {
    /// Maximum number of tracked processes (default: 64).
    pub max_processes: usize,
    /// Grace period for graceful shutdown (default: 5s).
    pub graceful_timeout: Duration,
    /// Whether to kill tracked processes on supervisor drop (default: true).
    pub kill_on_drop: bool,
}

impl Default for SupervisorConfig {
    fn default() -> Self {
        Self {
            max_processes: 64,
            graceful_timeout: Duration::from_secs(5),
            kill_on_drop: true,
        }
    }
}

/// A process supervisor that tracks and manages child processes.
///
/// Ensures that all spawned processes are properly cleaned up when the
/// supervisor is dropped. On Unix, processes are spawned in their own
/// process group for proper tree management.
#[derive(Debug)]
pub struct ProcessSupervisor {
    /// Tracked processes.
    processes: HashMap<String, ProcessHandle>,
    /// Configuration.
    config: SupervisorConfig,
    /// Whether the supervisor has been shut down.
    shut_down: Arc<AtomicBool>,
}

impl ProcessSupervisor {
    /// Create a new process supervisor with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            processes: HashMap::new(),
            config: SupervisorConfig::default(),
            shut_down: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Create a new process supervisor with custom configuration.
    #[must_use]
    pub fn with_config(config: SupervisorConfig) -> Self {
        Self {
            processes: HashMap::new(),
            config,
            shut_down: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Spawn a command and track it.
    ///
    /// On Unix, the command is spawned into a new process group.
    /// On Windows, the process is tracked by PID for later tree kill.
    ///
    /// # Errors
    ///
    /// Returns `TableFull` if the process table is full.
    /// Returns `Spawn` if the command fails to start.
    pub fn spawn(
        &mut self,
        id: impl Into<String>,
        label: impl Into<String>,
        cmd: &mut std::process::Command,
    ) -> Result<&mut ProcessHandle, ProcessError> {
        let id: String = id.into();
        let label: String = label.into();

        if self.processes.len() >= self.config.max_processes {
            return Err(ProcessError::TableFull {
                max: self.config.max_processes,
            });
        }

        // Set up process group on Unix
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    // Create a new process group
                    libc::setsid();
                    Ok(())
                });
            }
        }

        let child = cmd.spawn().map_err(ProcessError::Spawn)?;
        let pid = child.id();

        debug!(pid, label, "Process spawned");

        let handle = ProcessHandle {
            id: id.clone(),
            pid,
            label,
            child: Some(child),
        };

        self.processes.insert(id.clone(), handle);
        Ok(self.processes.get_mut(&id).expect("just inserted"))
    }

    /// Spawn a command with auto-generated ID.
    ///
    /// # Errors
    ///
    /// Returns `TableFull` if the process table is full.
    /// Returns `Spawn` if the command fails to start.
    pub fn spawn_auto(
        &mut self,
        label: impl Into<String>,
        cmd: &mut std::process::Command,
    ) -> Result<&mut ProcessHandle, ProcessError> {
        let id = uuid::Uuid::new_v4().to_string();
        self.spawn(id, label, cmd)
    }

    /// Get a handle to a tracked process by ID.
    #[must_use]
    pub fn get(&self, id: &str) -> Option<&ProcessHandle> {
        self.processes.get(id)
    }

    /// Get a mutable handle to a tracked process by ID.
    pub fn get_mut(&mut self, id: &str) -> Option<&mut ProcessHandle> {
        self.processes.get_mut(id)
    }

    /// Check if a process is still running.
    #[must_use]
    pub fn is_running(&mut self, id: &str) -> bool {
        self.processes.get_mut(id).map_or(false, |handle| {
            if let Some(child) = handle.child.as_mut() {
                match child.try_wait() {
                    Ok(Some(_)) => false,
                    _ => true,
                }
            } else {
                false
            }
        })
    }

    /// Gracefully kill a specific process.
    ///
    /// # Errors
    ///
    /// Returns `NotFound` if the process is not tracked.
    /// Returns `KillFailed` if the kill fails.
    pub fn kill(&mut self, id: &str) -> Result<(), ProcessError> {
        let handle = self
            .processes
            .get_mut(id)
            .ok_or_else(|| ProcessError::NotFound(id.to_string()))?;

        let pid = handle.pid;
        if handle.child.is_some() {
            kill_process_group(pid)?;
            // Wait briefly for graceful exit
            let _ = handle.wait_with_timeout(self.config.graceful_timeout);
            info!(pid, "Process killed");
        }

        self.processes.remove(id);
        Ok(())
    }

    /// Force-kill a specific process (SIGKILL on Unix).
    ///
    /// # Errors
    ///
    /// Returns `NotFound` if the process is not tracked.
    /// Returns `KillFailed` if the kill fails.
    pub fn force_kill(&mut self, id: &str) -> Result<(), ProcessError> {
        let handle = self
            .processes
            .get_mut(id)
            .ok_or_else(|| ProcessError::NotFound(id.to_string()))?;

        let pid = handle.pid;
        if let Some(ref mut child) = handle.child {
            child
                .kill()
                .map_err(|e| ProcessError::KillFailed { pid, source: e })?;
            let _ = child.wait();
            info!(pid, "Process force-killed");
        }

        self.processes.remove(id);
        Ok(())
    }

    /// Kill all tracked processes.
    pub fn kill_all(&mut self) -> Vec<(String, Result<(), ProcessError>)> {
        let ids: Vec<String> = self.processes.keys().cloned().collect();
        ids.iter()
            .map(|id| {
                let result = self.kill(id);
                (id.clone(), result)
            })
            .collect()
    }

    /// Detach a process (stop tracking, let it become an orphan).
    ///
    /// # Errors
    ///
    /// Returns `NotFound` if the process is not tracked.
    pub fn detach(&mut self, id: &str) -> Result<(), ProcessError> {
        let mut handle = self
            .processes
            .remove(id)
            .ok_or_else(|| ProcessError::NotFound(id.to_string()))?;
        handle.detach();
        debug!(pid = handle.pid, "Process detached");
        Ok(())
    }

    /// Number of currently tracked processes.
    #[must_use]
    pub fn len(&self) -> usize {
        self.processes.len()
    }

    /// Whether the supervisor is tracking any processes.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.processes.is_empty()
    }

    /// Shut down the supervisor, killing all tracked processes.
    pub fn shutdown(&mut self) {
        if self.shut_down.swap(true, Ordering::SeqCst) {
            return; // Already shut down
        }

        if self.config.kill_on_drop {
            let results = self.kill_all();
            for (id, result) in &results {
                if let Err(e) = result {
                    warn!(id, error = %e, "Failed to kill process during shutdown");
                }
            }
        }
    }
}

impl Drop for ProcessSupervisor {
    fn drop(&mut self) {
        if self.config.kill_on_drop {
            let results = self.kill_all();
            for (id, result) in &results {
                if let Err(e) = result {
                    error!(id, error = %e, "Failed to kill process during drop");
                }
            }
        }
    }
}

impl Default for ProcessSupervisor {
    fn default() -> Self {
        Self::new()
    }
}

// --- Platform-specific helpers ---

/// Kill an entire process group.
#[cfg(unix)]
fn kill_process_group(pid: u32) -> Result<(), ProcessError> {
    // Negative PID means process group
    let result = unsafe { libc::kill(-(pid as i32), libc::SIGTERM) };
    if result == 0 {
        Ok(())
    } else {
        let err = std::io::Error::last_os_error();
        Err(ProcessError::KillFailed { pid, source: err })
    }
}

/// Kill a process on Windows.
#[cfg(windows)]
fn kill_process_group(pid: u32) -> Result<(), ProcessError> {
    // On Windows, we use taskkill /T to kill the process tree
    let status = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .map_err(|e| ProcessError::KillFailed { pid, source: e })?;

    if status.success() {
        Ok(())
    } else {
        Err(ProcessError::KillFailed {
            pid,
            source: std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("taskkill failed with exit code {:?}", status.code()),
            ),
        })
    }
}
