//! `kaying-for-taptap-core command` — dynamic operation discovery and execution.

use crate::engine::{ProviderAccess, ProviderRegistry};
use crate::model::{Effect, OperationPlan, OperationRequest, OperationSpec, ProviderContext};
use clap::{Args, Subcommand};
use serde::Serialize;
use serde_json::{Value, json};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// Arguments for the dynamic command bridge.
#[derive(Debug, Args)]
pub struct CommandArgs {
    /// Command action.
    #[command(subcommand)]
    pub action: CommandAction,
}

/// Dynamic command actions used by Agent and MCP bridges.
#[derive(Debug, Subcommand)]
pub enum CommandAction {
    /// Describe one operation, including schemas and effects.
    Describe(OperationTarget),
    /// Validate arguments and create a confirmable effect plan.
    Prepare(OperationInput),
    /// Execute an operation. Mutating operations require a matching prepared plan.
    Execute(ExecuteInput),
}

/// Provider operation selection.
#[derive(Debug, Args)]
pub struct OperationTarget {
    /// Operation ID from `list operations`.
    pub operation: String,
    /// Project root used for provider detection and capability context.
    #[arg(long, default_value = ".")]
    pub path: PathBuf,
    /// Explicit provider ID. If omitted, detect it from the project.
    #[arg(long)]
    pub engine: Option<String>,
}

/// Operation selection plus JSON arguments.
#[derive(Debug, Args)]
pub struct OperationInput {
    /// Operation ID from `list operations`.
    pub operation: String,
    /// Project root used for provider detection and injected as `project_root`.
    #[arg(long, default_value = ".")]
    pub path: PathBuf,
    /// Explicit provider ID. If omitted, detect it from the project.
    #[arg(long)]
    pub engine: Option<String>,
    /// Operation arguments as a JSON object.
    #[arg(long, default_value = "{}")]
    pub arguments: String,
    /// Optional operation timeout in milliseconds.
    #[arg(long)]
    pub timeout_ms: Option<u64>,
}

/// Confirmed execution input.
#[derive(Debug, Args)]
pub struct ExecuteInput {
    /// Shared operation input.
    #[command(flatten)]
    pub input: OperationInput,
    /// Plan ID returned by `command prepare`.
    #[arg(long)]
    pub plan_id: Option<String>,
    /// Effect digest returned by `command prepare`.
    #[arg(long)]
    pub effect_digest: Option<String>,
    /// Plan expiry returned by `command prepare`.
    #[arg(long)]
    pub plan_expires_at: Option<String>,
    /// Confirm the effects declared by the prepared plan.
    #[arg(long)]
    pub confirm_effects: bool,
}

/// Agent-oriented dynamic command response.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommandOutput {
    Description {
        provider: String,
        operation: OperationSpec,
        confirmation_required: bool,
    },
    Plan {
        provider: String,
        operation: OperationSpec,
        confirmation_required: bool,
        plan: OperationPlan,
    },
    Result {
        provider: String,
        operation: String,
        data: crate::model::OperationResult,
    },
}

/// Execute the dynamic command action.
pub fn execute(
    args: &CommandArgs,
    registry: &ProviderRegistry,
) -> Result<Value, crate::common::Error> {
    let output = match &args.action {
        CommandAction::Describe(target) => describe(target, registry)?,
        CommandAction::Prepare(input) => prepare(input, registry)?,
        CommandAction::Execute(input) => execute_prepared(input, registry)?,
    };
    serde_json::to_value(output)
        .map_err(|e| crate::common::Error::new("SERIALIZATION_FAILED", e.to_string()))
}

fn describe(
    target: &OperationTarget,
    registry: &ProviderRegistry,
) -> Result<CommandOutput, crate::common::Error> {
    let root = resolve_root(&target.path)?;
    let provider = resolve_provider(registry, target.engine.as_deref(), &root)?;
    let operation = find_operation(registry, &provider, &root, &target.operation)?;
    let confirmation_required = requires_confirmation(&operation.effects);
    Ok(CommandOutput::Description {
        provider,
        operation,
        confirmation_required,
    })
}

fn prepare(
    input: &OperationInput,
    registry: &ProviderRegistry,
) -> Result<CommandOutput, crate::common::Error> {
    let (provider, operation, request) = build_request(input, registry, true)?;
    let plan = registry
        .prepare_operation(&provider, &request)
        .map_err(operation_error)?;
    let plan = finalize_plan(plan, &operation, &request.arguments);
    let confirmation_required = requires_confirmation(&operation.effects);
    Ok(CommandOutput::Plan {
        provider,
        operation,
        confirmation_required,
        plan,
    })
}

fn execute_prepared(
    input: &ExecuteInput,
    registry: &ProviderRegistry,
) -> Result<CommandOutput, crate::common::Error> {
    let (provider, operation, mut request) = build_request(&input.input, registry, false)?;
    let mut current = registry
        .prepare_operation(&provider, &request)
        .map_err(operation_error)?;
    if let Some(expires_at) = &input.plan_expires_at {
        current.expires_at = expires_at.clone();
    }
    let current = finalize_plan(current, &operation, &request.arguments);

    if requires_confirmation(&operation.effects) {
        if !input.confirm_effects {
            return Err(crate::common::Error::new(
                "CONFIRMATION_REQUIRED",
                "This operation has mutating or remote effects. Prepare it first, then pass --confirm-effects with the returned plan.",
            ));
        }
        if input.plan_id.as_deref() != Some(current.plan_id.as_str())
            || input.effect_digest.as_deref() != Some(current.effect_digest.as_str())
        {
            return Err(crate::common::Error::new(
                "PLAN_MISMATCH",
                "The plan does not match the current operation arguments. Prepare the operation again.",
            ));
        }
        validate_expiry(&current.expires_at)?;
    }

    request.plan_id = input.plan_id.clone();
    request.effect_digest = input.effect_digest.clone();
    let data = registry
        .execute_operation(&provider, &request)
        .map_err(operation_error)?;
    Ok(CommandOutput::Result {
        provider,
        operation: operation.id,
        data,
    })
}

fn build_request(
    input: &OperationInput,
    registry: &ProviderRegistry,
    dry_run: bool,
) -> Result<(String, OperationSpec, OperationRequest), crate::common::Error> {
    let root = resolve_root(&input.path)?;
    let provider = resolve_provider(registry, input.engine.as_deref(), &root)?;
    let operation = find_operation(registry, &provider, &root, &input.operation)?;
    let mut arguments: Value = serde_json::from_str(&input.arguments).map_err(|e| {
        crate::common::Error::new("INVALID_ARGUMENTS", format!("Invalid JSON arguments: {e}"))
    })?;
    let object = arguments.as_object_mut().ok_or_else(|| {
        crate::common::Error::new("INVALID_ARGUMENTS", "--arguments must be a JSON object")
    })?;
    object
        .entry("project_root")
        .or_insert_with(|| json!(root.to_string_lossy()));

    let request = OperationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        provider_id: provider.clone(),
        operation_id: operation.id.clone(),
        project_root: Some(root),
        arguments,
        timeout_ms: input.timeout_ms,
        dry_run,
        plan_id: None,
        effect_digest: None,
    };
    Ok((provider, operation, request))
}

fn find_operation(
    registry: &ProviderRegistry,
    provider: &str,
    root: &Path,
    operation: &str,
) -> Result<OperationSpec, crate::common::Error> {
    let context = ProviderContext::new(Some(root.to_path_buf()));
    registry
        .provider_catalog(provider, &context)
        .map_err(operation_error)?
        .into_iter()
        .find(|spec| spec.id == operation)
        .ok_or_else(|| {
            crate::common::Error::new(
                "OPERATION_NOT_FOUND",
                format!("Operation '{operation}' is not available for provider '{provider}'"),
            )
        })
}

fn finalize_plan(
    mut plan: OperationPlan,
    operation: &OperationSpec,
    arguments: &Value,
) -> OperationPlan {
    plan.effects = operation.effects.clone();
    plan.normalized_operation = operation.id.clone();
    plan.normalized_arguments = arguments.clone();
    if plan.targets.is_empty() {
        plan.targets = ["path", "source", "target", "node_path", "project_root"]
            .iter()
            .filter_map(|key| arguments.get(key).and_then(Value::as_str))
            .map(ToString::to_string)
            .collect();
    }
    let payload = serde_json::to_string(&json!({
        "provider_operation": operation.id,
        "arguments": arguments,
        "effects": operation.effects,
        "expires_at": plan.expires_at,
    }))
    .unwrap_or_default();
    let digest = stable_digest(&payload);
    plan.plan_id = format!("plan-{digest}");
    plan.effect_digest = digest;
    plan
}

fn validate_expiry(expires_at: &str) -> Result<(), crate::common::Error> {
    let expiry = chrono::DateTime::parse_from_rfc3339(expires_at).map_err(|_| {
        crate::common::Error::new("PLAN_MISMATCH", "The prepared plan has an invalid expiry")
    })?;
    if expiry < chrono::Utc::now() {
        return Err(crate::common::Error::new(
            "PLAN_EXPIRED",
            "The prepared plan expired. Prepare the operation again.",
        ));
    }
    Ok(())
}

fn stable_digest(value: &str) -> String {
    let mut hasher = StableHasher::default();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[derive(Default)]
struct StableHasher(u64);

impl Hasher for StableHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        if self.0 == 0 {
            self.0 = 0xcbf29ce484222325;
        }
        for byte in bytes {
            self.0 ^= u64::from(*byte);
            self.0 = self.0.wrapping_mul(0x100000001b3);
        }
    }
}

fn requires_confirmation(effects: &[Effect]) -> bool {
    effects.iter().any(|effect| {
        matches!(
            effect,
            Effect::WriteProject
                | Effect::WriteAppData
                | Effect::Download
                | Effect::GitCommit
                | Effect::GitPush
                | Effect::RemoteBuild
                | Effect::RemoteMutation
                | Effect::PaidGeneration
                | Effect::ArbitraryCode
                | Effect::EngineSandboxBypass
        )
    })
}

fn resolve_root(path: &Path) -> Result<PathBuf, crate::common::Error> {
    let root = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|e| crate::common::Error::new("FILE_NOT_FOUND", e.to_string()))?
            .join(path)
    };
    if !root.is_dir() {
        return Err(crate::common::Error::new(
            "FILE_NOT_FOUND",
            format!("Project root does not exist: {}", root.display()),
        ));
    }
    Ok(root)
}

fn resolve_provider(
    registry: &ProviderRegistry,
    engine: Option<&str>,
    root: &Path,
) -> Result<String, crate::common::Error> {
    registry
        .resolve(engine, root)
        .map(|resolved| resolved.id)
        .map_err(|e| crate::common::Error::new("ENGINE_RESOLUTION_FAILED", e.to_string()))
}

fn operation_error(error: impl std::fmt::Display) -> crate::common::Error {
    crate::common::Error::new("OPERATION_FAILED", error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digest_is_stable_and_input_sensitive() {
        assert_eq!(stable_digest("same"), stable_digest("same"));
        assert_ne!(stable_digest("one"), stable_digest("two"));
    }

    #[test]
    fn confirmation_tracks_dangerous_effects() {
        assert!(!requires_confirmation(&[
            Effect::ReadProject,
            Effect::Network
        ]));
        assert!(requires_confirmation(&[Effect::WriteProject]));
        assert!(requires_confirmation(&[Effect::RemoteBuild]));
    }
}
