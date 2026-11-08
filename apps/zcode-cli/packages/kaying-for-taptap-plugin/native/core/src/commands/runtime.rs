//! `kaying-for-taptap-core runtime` — manage UrhoX Runtime.

use crate::engine::{ProviderAccess, ProviderRegistry};
use crate::model::OperationRequest;
use clap::{Args, Subcommand};
use std::path::PathBuf;

/// Arguments for the `runtime` subcommand.
#[derive(Debug, Args)]
pub struct RuntimeArgs {
    /// Project root directory.
    #[arg(default_value = ".")]
    pub path: PathBuf,

    /// Explicit engine ID (default: auto-detect).
    #[arg(long)]
    pub engine: Option<String>,

    /// Subcommand.
    #[command(subcommand)]
    pub action: RuntimeAction,
}

/// Available runtime actions.
#[derive(Debug, Subcommand)]
pub enum RuntimeAction {
    /// Launch UrhoX Runtime to run the project.
    Run {
        /// Entry script (optional, read from project.json if not specified).
        #[arg(long)]
        entry: Option<String>,
        /// Additional runtime arguments.
        #[arg(long)]
        arg: Vec<String>,
        /// Explicit Runtime executable (otherwise auto-detected).
        #[arg(long)]
        runtime_path: Option<PathBuf>,
    },
    /// Cancel a running runtime process.
    Cancel {
        /// Session ID returned by `runtime run`.
        session_id: String,
    },
    /// Fetch logs from a runtime session.
    Logs {
        /// Session ID returned by `runtime run`.
        session_id: String,
        /// Number of lines to tail.
        #[arg(long)]
        tail: Option<u32>,
    },
    /// Inspect a Runtime session.
    Status {
        /// Session ID returned by `runtime run`.
        session_id: String,
    },
    /// Launch a bounded Runtime smoke test.
    Smoke {
        /// Entry script (optional, read from project.json if omitted).
        #[arg(long)]
        entry: Option<String>,
        /// Explicit Runtime executable (otherwise auto-detected).
        #[arg(long)]
        runtime_path: Option<PathBuf>,
        /// Additional Runtime arguments (for example `-tool_mode`).
        #[arg(long = "arg")]
        arg: Vec<String>,
        /// Observation timeout in milliseconds.
        #[arg(long, default_value_t = 8000)]
        timeout_ms: u64,
        /// Require this text to appear in Runtime logs.
        #[arg(long)]
        ready_pattern: Option<String>,
        /// Keep the Runtime running after a successful smoke check.
        #[arg(long)]
        keep_running: bool,
        /// Require a screenshot artifact.
        #[arg(long)]
        require_screenshot: bool,
    },
}

/// Output of a runtime command.
#[derive(Debug, serde::Serialize)]
pub struct RuntimeOutput {
    /// Operation ID that was executed.
    pub operation: String,
    /// Result data from the provider.
    pub data: serde_json::Value,
}

/// Execute the runtime command.
pub fn execute(
    args: &RuntimeArgs,
    registry: &ProviderRegistry,
) -> Result<RuntimeOutput, crate::common::Error> {
    let root = resolve_root(&args.path)?;
    let engine_id = resolve_engine(registry, args.engine.as_deref(), &root)?;

    let (operation_id, arguments) = match &args.action {
        RuntimeAction::Run {
            entry,
            arg,
            runtime_path,
        } => {
            let mut args = serde_json::json!({
                "project_root": root.to_string_lossy()
            });
            if let Some(e) = entry {
                args["entry"] = serde_json::json!(e);
            }
            if !arg.is_empty() {
                args["args"] = serde_json::json!(arg);
            }
            if let Some(runtime_path) = runtime_path {
                args["runtime_path"] = serde_json::json!(runtime_path);
            }
            ("runtime.run", args)
        }
        RuntimeAction::Cancel { session_id } => {
            let args = serde_json::json!({
                "project_root": root.to_string_lossy(),
                "session_id": session_id
            });
            ("runtime.cancel", args)
        }
        RuntimeAction::Logs { session_id, tail } => {
            let mut args = serde_json::json!({
                "project_root": root.to_string_lossy(),
                "session_id": session_id
            });
            if let Some(n) = tail {
                args["tail"] = serde_json::json!(n);
            }
            ("runtime.logs", args)
        }
        RuntimeAction::Status { session_id } => (
            "runtime.status",
            serde_json::json!({
                "project_root": root.to_string_lossy(),
                "session_id": session_id
            }),
        ),
        RuntimeAction::Smoke {
            entry,
            runtime_path,
            arg,
            timeout_ms,
            ready_pattern,
            keep_running,
            require_screenshot,
        } => {
            let mut args = serde_json::json!({
                "project_root": root.to_string_lossy(),
                "timeout_ms": timeout_ms,
                "keep_running": keep_running,
                "capture": true,
                "require_screenshot": require_screenshot,
            });
            if let Some(entry) = entry {
                args["entry"] = serde_json::json!(entry);
            }
            if let Some(runtime_path) = runtime_path {
                args["runtime_path"] = serde_json::json!(runtime_path);
            }
            if !arg.is_empty() {
                args["args"] = serde_json::json!(arg);
            }
            if let Some(pattern) = ready_pattern {
                args["ready_pattern"] = serde_json::json!(pattern);
            }
            ("runtime.smoke", args)
        }
    };

    let request = OperationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        provider_id: engine_id.clone(),
        operation_id: operation_id.to_string(),
        project_root: Some(root),
        arguments,
        timeout_ms: None,
        dry_run: false,
        plan_id: None,
        effect_digest: None,
    };

    let result = registry
        .execute_operation(&engine_id, &request)
        .map_err(|e| crate::common::Error::new("OPERATION_FAILED", format!("{e}")))?;

    Ok(RuntimeOutput {
        operation: operation_id.to_string(),
        data: result.output,
    })
}

fn resolve_root(path: &PathBuf) -> Result<PathBuf, crate::common::Error> {
    let root = if path.is_absolute() {
        path.clone()
    } else {
        std::env::current_dir()
            .map_err(|e| {
                crate::common::Error::new(
                    "FILE_NOT_FOUND",
                    format!("Cannot get current directory: {e}"),
                )
            })?
            .join(path)
    };

    if !root.exists() {
        return Err(crate::common::Error::new(
            "FILE_NOT_FOUND",
            format!("Project root does not exist: {}", root.display()),
        ));
    }

    Ok(root)
}

fn resolve_engine(
    registry: &ProviderRegistry,
    engine: Option<&str>,
    root: &PathBuf,
) -> Result<String, crate::common::Error> {
    match engine {
        Some(id) => {
            if !registry.has(id) {
                return Err(crate::common::Error::new(
                    "ENGINE_UNKNOWN",
                    format!("Engine provider '{id}' is not registered"),
                ));
            }
            Ok(id.to_string())
        }
        None => {
            let resolved = registry
                .resolve(None, root)
                .map_err(|e| crate::common::Error::new("ENGINE_NOT_SPECIFIED", format!("{e}")))?;
            Ok(resolved.id)
        }
    }
}
