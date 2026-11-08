//! Process-related error types.

use thiserror::Error;

/// Errors during process management.
#[derive(Debug, Error)]
pub enum ProcessError {
    /// Failed to spawn a child process.
    #[error("Failed to spawn process: {0}")]
    Spawn(#[from] std::io::Error),

    /// Process ID not found in supervisor.
    #[error("Process not found: {0}")]
    NotFound(String),

    /// Failed to kill a process.
    #[error("Failed to kill process {pid}: {source}")]
    KillFailed {
        pid: u32,
        #[source]
        source: std::io::Error,
    },

    /// Process exited with non-zero status.
    #[error("Process {pid} exited with code {code}")]
    NonZeroExit { pid: u32, code: i32 },

    /// Timeout waiting for process.
    #[error("Process {pid} timed out after {timeout_ms}ms")]
    Timeout { pid: u32, timeout_ms: u64 },

    /// Process table is full.
    #[error("Process table is full (max {max})")]
    TableFull { max: usize },
}
