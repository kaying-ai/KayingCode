//! `kaying-for-taptap-core maker` — manage Maker Cloud operations.

use crate::engine::{ProviderAccess, ProviderRegistry};
use crate::model::OperationRequest;
use clap::{Args, Subcommand};
use std::path::PathBuf;

/// Arguments for the `maker` subcommand.
#[derive(Debug, Args)]
pub struct MakerArgs {
    /// Project root directory.
    #[arg(default_value = ".")]
    pub path: PathBuf,

    /// Explicit engine ID (default: auto-detect).
    #[arg(long)]
    pub engine: Option<String>,

    /// Subcommand.
    #[command(subcommand)]
    pub action: MakerAction,
}

/// Available maker actions.
#[derive(Debug, Subcommand)]
pub enum MakerAction {
    /// Check Maker authentication status.
    Auth,
    /// Check Maker build/service status.
    Status,
    /// Prepare and submit a remote build via Maker Cloud.
    Build {
        /// Build target platform.
        #[arg(long, default_value = "android")]
        target: String,
        /// Only prepare without submitting (default: true).
        #[arg(long)]
        dry_run: bool,
    },
}

/// Output of a maker command.
#[derive(Debug, serde::Serialize)]
pub struct MakerOutput {
    /// Operation ID that was executed.
    pub operation: String,
    /// Result data from the provider.
    pub data: serde_json::Value,
}

/// Execute the maker command.
pub fn execute(
    args: &MakerArgs,
    registry: &ProviderRegistry,
) -> Result<MakerOutput, crate::common::Error> {
    let root = resolve_root(&args.path)?;
    let engine_id = resolve_engine(registry, args.engine.as_deref(), &root)?;

    let (operation_id, arguments) = match &args.action {
        MakerAction::Auth => {
            let args = serde_json::json!({
                "project_root": root.to_string_lossy()
            });
            ("maker.auth", args)
        }
        MakerAction::Status => {
            let args = serde_json::json!({
                "project_root": root.to_string_lossy()
            });
            ("maker.status", args)
        }
        MakerAction::Build { target, dry_run } => {
            let args = serde_json::json!({
                "project_root": root.to_string_lossy(),
                "build_target": target,
                "dry_run": dry_run
            });
            ("maker.build", args)
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

    Ok(MakerOutput {
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
