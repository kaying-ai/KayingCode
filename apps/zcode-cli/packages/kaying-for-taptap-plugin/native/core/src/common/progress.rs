//! Progress events for long-running CLI tasks.
//!
//! Progress events are emitted as NDJSON (newline-delimited JSON) lines on **stderr**.
//! This keeps stdout clean for the final `CommandOutput` JSON.
//!
//! ## Format
//!
//! ```json
//! {"type":"progress","stage":"running","message":"Processing 3/10","percent":30}
//! ```
//!
//! ## Usage
//!
//! ```rust,no_run
//! use kaying_for_taptap_core::common::{emit_progress, ProgressEvent, ProgressStage};
//!
//! for i in 0..10 {
//!     emit_progress(&ProgressEvent::running(
//!         format!("Processing {}/10", i + 1),
//!         Some((i as f64 + 1.0) / 10.0 * 100.0),
//!     ));
//! }
//! ```

use serde::Serialize;
use std::io::Write;
use tracing_subscriber::EnvFilter;

/// Stage of a long-running task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProgressStage {
    /// Task has started.
    Started,
    /// Task is running.
    Running,
    /// Task completed successfully.
    Completed,
    /// Task failed.
    Failed,
}

/// A progress event emitted on stderr.
#[derive(Debug, Clone, Serialize)]
pub struct ProgressEvent {
    /// Always `"progress"` — helps agents distinguish from other stderr lines.
    pub r#type: String,

    /// Current stage.
    pub stage: ProgressStage,

    /// Human-readable progress message.
    pub message: String,

    /// Optional percentage (0–100).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
}

impl ProgressEvent {
    /// Create a `started` event.
    #[must_use]
    pub fn started(message: impl Into<String>) -> Self {
        Self {
            r#type: "progress".into(),
            stage: ProgressStage::Started,
            message: message.into(),
            percent: None,
        }
    }

    /// Create a `running` event with optional percentage.
    #[must_use]
    pub fn running(message: impl Into<String>, percent: Option<f64>) -> Self {
        Self {
            r#type: "progress".into(),
            stage: ProgressStage::Running,
            message: message.into(),
            percent,
        }
    }

    /// Create a `completed` event.
    #[must_use]
    pub fn completed(message: impl Into<String>) -> Self {
        Self {
            r#type: "progress".into(),
            stage: ProgressStage::Completed,
            message: message.into(),
            percent: Some(100.0),
        }
    }

    /// Create a `failed` event.
    #[must_use]
    pub fn failed(message: impl Into<String>) -> Self {
        Self {
            r#type: "progress".into(),
            stage: ProgressStage::Failed,
            message: message.into(),
            percent: None,
        }
    }
}

/// Emit a progress event as NDJSON on stderr.
///
/// Each call writes one JSON object followed by a newline and flushes.
/// If stderr is not a TTY, this is safe to call from any thread.
pub fn emit_progress(event: &ProgressEvent) {
    let mut stderr = std::io::stderr().lock();
    if let Ok(json) = serde_json::to_string(event) {
        let _ = writeln!(stderr, "{json}");
        let _ = stderr.flush();
    }
}

/// Initialize `tracing_subscriber` with a sensible default for CLI tools.
///
/// Reads `RUST_LOG` env var; falls back to `level_str` (default: `"warn"`).
/// Logs go to stderr.
///
/// If `quiet` is `true`, no tracing logs are emitted (errors still go to stderr).
pub fn init_tracing_with_level(level_str: &str, quiet: bool) {
    if quiet {
        return;
    }
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(level_str));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_writer(std::io::stderr)
        .init();
}

/// Initialize `tracing_subscriber` (alias, defaults to `warn`).
pub fn init_tracing() {
    init_tracing_with_level("warn", false);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_event_serializes() {
        let event = ProgressEvent::running("step 1", Some(50.0));
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"progress\""));
        assert!(json.contains("\"stage\":\"running\""));
        assert!(json.contains("\"percent\":50.0"));
    }

    #[test]
    fn completed_event_has_100_percent() {
        let event = ProgressEvent::completed("done");
        assert_eq!(event.percent, Some(100.0));
    }
}
