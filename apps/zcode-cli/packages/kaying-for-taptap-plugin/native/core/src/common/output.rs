//! Unified output envelope `CommandOutput<T>` and metadata types.
//!
//! Every CLI command returns a `CommandOutput<T>` which serializes to:
//!
//! ```json
//! {
//!   "schema_version": 1,
//!   "ok": true,
//!   "data": { ... },
//!   "error": null,
//!   "meta": {
//!     "command": "kaying-<x> inspect foo.png",
//!     "version": "0.1.0",
//!     "duration_ms": 123,
//!     "next_steps": [ ... ]
//!   }
//! }
//! ```

use serde::{Serialize, Serializer};
use std::time::Instant;

/// Priority hint for `NextStep`, helping agents decide what to surface to the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NextStepPriority {
    /// Strongly recommended next action.
    Recommended,
    /// Optional but useful follow-up.
    Optional,
    /// Required to complete the current goal.
    Required,
}

/// A suggested next step for the agent or user.
///
/// Agents should read `description` and `command` (if present) and decide
/// whether to execute or propose it.
#[derive(Debug, Clone, Serialize)]
pub struct NextStep {
    /// Short human-readable description of the next step.
    pub description: String,

    /// Optional shell command to execute.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,

    /// Priority hint.
    #[serde(default = "default_priority")]
    pub priority: NextStepPriority,
}

#[allow(dead_code)]
fn default_priority() -> NextStepPriority {
    NextStepPriority::Recommended
}

impl NextStep {
    /// Create a new `NextStep` with `Recommended` priority.
    #[must_use]
    pub fn new(description: impl Into<String>) -> Self {
        Self {
            description: description.into(),
            command: None,
            priority: NextStepPriority::Recommended,
        }
    }

    /// Attach a shell command to this next step.
    #[must_use]
    pub fn with_command(mut self, command: impl Into<String>) -> Self {
        self.command = Some(command.into());
        self
    }

    /// Set the priority.
    #[must_use]
    pub fn with_priority(mut self, priority: NextStepPriority) -> Self {
        self.priority = priority;
        self
    }
}

/// Metadata attached to every `CommandOutput`.
#[derive(Debug, Clone, Serialize)]
pub struct Meta {
    /// The full command string that was executed.
    pub command: String,

    /// CLI version string.
    pub version: String,

    /// Wall-clock duration in milliseconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,

    /// Suggested next steps for the agent or user.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub next_steps: Vec<NextStep>,
}

impl Meta {
    /// Create a new `Meta` with the given CLI name and version.
    #[must_use]
    pub fn new(cli_name: &str, version: &str) -> Self {
        Self {
            command: format!("{cli_name} {version}"),
            version: version.to_string(),
            duration_ms: None,
            next_steps: Vec::new(),
        }
    }

    /// Set the command string (usually from `crate::command_string()`).
    #[must_use]
    pub fn with_command(mut self, command: impl Into<String>) -> Self {
        self.command = command.into();
        self
    }

    /// Set the duration.
    #[must_use]
    pub fn with_duration_ms(mut self, ms: u64) -> Self {
        self.duration_ms = Some(ms);
        self
    }

    /// Add a next step.
    #[must_use]
    pub fn with_next_step(mut self, step: NextStep) -> Self {
        self.next_steps.push(step);
        self
    }

    /// Add multiple next steps.
    #[must_use]
    pub fn with_next_steps(mut self, steps: Vec<NextStep>) -> Self {
        self.next_steps.extend(steps);
        self
    }
}

/// Error payload for `CommandOutput`.
#[derive(Debug, Clone, Serialize)]
pub struct Error {
    /// Machine-readable error code (e.g. `"FILE_NOT_FOUND"`).
    pub code: String,

    /// Human-readable error message.
    pub message: String,

    /// Optional structured error details (e.g. available values).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,

    /// Optional remediation hints for the agent.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub suggestions: Vec<String>,

    /// Optional remediation hint for the agent (deprecated, use `suggestions`).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[deprecated(since = "0.2.0", note = "use `suggestions` instead")]
    pub hint: Option<String>,
}

impl Error {
    /// Create a new `Error`.
    #[must_use]
    #[allow(deprecated)]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
            suggestions: Vec::new(),
            hint: None,
        }
    }

    /// Attach structured error details.
    #[must_use]
    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }

    /// Add a suggestion for the agent.
    #[must_use]
    pub fn with_suggestion(mut self, suggestion: impl Into<String>) -> Self {
        self.suggestions.push(suggestion.into());
        self
    }

    /// Add multiple suggestions.
    #[must_use]
    pub fn with_suggestions(mut self, suggestions: Vec<String>) -> Self {
        self.suggestions.extend(suggestions);
        self
    }

    /// Attach a remediation hint (deprecated).
    #[must_use]
    #[allow(deprecated)]
    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }
}

/// The unified output envelope for all Kaying Rust CLIs.
///
/// Generic over `T: Serialize` — the `data` payload type.
///
/// See `packages/RUST-CLI-CONVENTIONS.md` §4 for the full JSON schema.
#[derive(Debug, Serialize)]
pub struct CommandOutput<T: Serialize> {
    /// Schema version. Currently always `1`.
    pub schema_version: u32,

    /// `true` if the command succeeded, `false` if it failed.
    pub ok: bool,

    /// The result data (present when `ok == true`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,

    /// The error (present when `ok == false`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Error>,

    /// Metadata (always present in serialized output, unless `no_meta` is used).
    pub meta: Meta,
}

impl<T: Serialize> CommandOutput<T> {
    /// Create a success output with data and metadata.
    #[must_use]
    pub fn success(data: T, meta: Meta) -> Self {
        Self {
            schema_version: 1,
            ok: true,
            data: Some(data),
            error: None,
            meta,
        }
    }

    /// Create a failure output with an error and metadata.
    #[must_use]
    pub fn failure(error: Error, meta: Meta) -> Self {
        Self {
            schema_version: 1,
            ok: false,
            data: None,
            error: Some(error),
            meta,
        }
    }

    /// Print the output to stdout as JSON.
    ///
    /// - `pretty`: indent with 2 spaces + newlines
    /// - `no_meta`: strip the `meta` field before serializing
    /// - `no_next_steps`: strip `meta.next_steps` before serializing
    pub fn print(&self, pretty: bool, no_meta: bool) {
        self.print_with_options(pretty, no_meta, false)
    }

    /// Print with full control over stripping.
    pub fn print_with_options(&self, pretty: bool, no_meta: bool, no_next_steps: bool) {
        let json = if no_meta || no_next_steps {
            self.strip_meta(no_meta, no_next_steps)
        } else {
            serde_json::to_value(self).unwrap_or_else(|_| {
                serde_json::json!({"ok": false, "error": {"code": "SERIALIZE_ERROR", "message": "Failed to serialize output"}})
            })
        };
        if pretty {
            println!(
                "{}",
                serde_json::to_string_pretty(&json).unwrap_or_else(|_| "{}".into())
            );
        } else {
            println!(
                "{}",
                serde_json::to_string(&json).unwrap_or_else(|_| "{}".into())
            );
        }
    }

    /// Serialize to a `serde_json::Value` with meta partially or fully stripped.
    fn strip_meta(&self, no_meta: bool, no_next_steps: bool) -> serde_json::Value {
        let mut val = serde_json::to_value(self).unwrap_or_else(|_| {
            serde_json::json!({"ok": false, "error": {"code": "SERIALIZE_ERROR", "message": "Failed to serialize output"}})
        });
        if let Some(obj) = val.as_object_mut() {
            if no_meta {
                obj.remove("meta");
            } else if no_next_steps {
                if let Some(meta) = obj.get_mut("meta").and_then(|m| m.as_object_mut()) {
                    meta.remove("next_steps");
                }
            }
        }
        val
    }
}

/// A timing guard that measures elapsed time from creation to drop.
///
/// Use with `Meta::with_duration_ms(timer.elapsed_ms())`.
pub struct Timer {
    start: Instant,
}

impl Timer {
    /// Start a new timer.
    #[must_use]
    pub fn start() -> Self {
        Self {
            start: Instant::now(),
        }
    }

    /// Elapsed time in milliseconds.
    #[must_use]
    pub fn elapsed_ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }
}

/// Helper to serialize `Option<T>` as `null` when `None` (used internally).
fn _serialize_optional_null<S, T: Serialize>(
    val: &Option<T>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match val {
        Some(v) => v.serialize(serializer),
        None => serializer.serialize_none(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn success_output_serializes() {
        let meta = Meta::new("kaying-test", "0.1.0");
        let out = CommandOutput::success(42, meta);
        let json = serde_json::to_string(&out).unwrap();
        assert!(json.contains("\"ok\":true"));
        assert!(json.contains("\"data\":42"));
    }

    #[test]
    fn failure_output_serializes() {
        let meta = Meta::new("kaying-test", "0.1.0");
        let err = Error::new("FILE_NOT_FOUND", "missing.png").with_hint("Check the path");
        let out: CommandOutput<()> = CommandOutput::failure(err, meta);
        let json = serde_json::to_string(&out).unwrap();
        assert!(json.contains("\"ok\":false"));
        assert!(json.contains("FILE_NOT_FOUND"));
        assert!(json.contains("Check the path"));
    }

    #[test]
    fn next_step_builder() {
        let step = NextStep::new("Convert the image")
            .with_command("kaying-imagex convert foo.png")
            .with_priority(NextStepPriority::Required);
        assert_eq!(step.priority, NextStepPriority::Required);
        assert_eq!(
            step.command.as_deref(),
            Some("kaying-imagex convert foo.png")
        );
    }
}
