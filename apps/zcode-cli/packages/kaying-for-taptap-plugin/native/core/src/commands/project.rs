//! `kaying-for-taptap-core project` — manage TapTap projects.

use crate::engine::{ProviderAccess, ProviderRegistry};
use crate::model::OperationRequest;
use clap::{Args, Subcommand};
use std::path::PathBuf;

/// Arguments for the `project` subcommand.
#[derive(Debug, Args)]
pub struct ProjectArgs {
    /// Project root directory.
    #[arg(default_value = ".")]
    pub path: PathBuf,

    /// Explicit engine ID (default: auto-detect).
    #[arg(long)]
    pub engine: Option<String>,

    /// Subcommand.
    #[command(subcommand)]
    pub action: ProjectAction,
}

/// Available project actions.
#[derive(Debug, Subcommand)]
pub enum ProjectAction {
    /// Read project metadata from .project/project.json.
    Info,
    /// Validate project structure and entry point.
    Validate,
    /// Initialize a TapTap project with default config.
    Init {
        /// Entry script path.
        #[arg(long, default_value = "scripts/main.lua")]
        entry: String,
        /// Engine version.
        #[arg(long, default_value = "1.0.0")]
        engine_version: String,
    },
}

/// Output of a project command.
#[derive(Debug, serde::Serialize)]
pub struct ProjectOutput {
    /// Operation ID that was executed.
    pub operation: String,
    /// Result data from the provider.
    pub data: serde_json::Value,
}

/// Execute the project command.
pub fn execute(
    args: &ProjectArgs,
    registry: &ProviderRegistry,
) -> Result<ProjectOutput, crate::common::Error> {
    let root = resolve_root(&args.path)?;
    let engine_id = resolve_engine(registry, args.engine.as_deref(), &root)?;

    let operation_id = match &args.action {
        ProjectAction::Info => "project.info",
        ProjectAction::Validate => "project.validate",
        ProjectAction::Init { .. } => "project.init",
    };

    let mut arguments = serde_json::json!({
        "project_root": root.to_string_lossy()
    });

    if let ProjectAction::Init {
        entry,
        engine_version,
    } = &args.action
    {
        arguments["entry"] = serde_json::json!(entry);
        arguments["engine_version"] = serde_json::json!(engine_version);
    }

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

    Ok(ProjectOutput {
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
