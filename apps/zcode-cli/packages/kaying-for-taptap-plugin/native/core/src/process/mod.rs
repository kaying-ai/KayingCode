//! Process management for kaying-for-taptap-core.
//!
//! Provides `ProcessSupervisor` for tracking and managing child process
//! lifecycles with cross-platform process group handling.

pub mod error;
pub mod supervisor;

pub use error::ProcessError;
pub use supervisor::{ProcessHandle, ProcessSupervisor, SupervisorConfig};
