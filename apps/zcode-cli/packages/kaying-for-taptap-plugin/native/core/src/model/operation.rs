//! Operation catalog, plan, and result types.

use super::capability::Effect;
use serde::{Deserialize, Serialize};

/// Scope of an operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum OperationScope {
    /// Generic operation available across all providers.
    Generic,
    /// Provider-specific extension.
    ProviderExtension,
}

/// Stability level of an operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Stability {
    /// Stable API.
    Stable,
    /// May change in future versions.
    Experimental,
    /// May be removed or changed.
    Deprecated,
}

/// How much of an operation's advertised capability is backed by a real
/// provider/runtime implementation.
///
/// This is intentionally separate from [`Stability`]. An operation can be a
/// stable project-file operation while still not providing runtime behaviour
/// (for example, a code-generation helper). Keeping the two dimensions
/// separate lets workflow planning reject scaffold-only capabilities without
/// treating every non-experimental operation as runtime-ready.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ImplementationTier {
    /// The operation has been exercised against a running engine/runtime and
    /// can provide runtime evidence.
    RuntimeBacked,
    /// The operation is backed by deterministic project-file/provider logic,
    /// but does not itself prove runtime behaviour.
    ProjectBacked,
    /// The operation creates a scaffold or generated project content whose
    /// runtime behaviour still needs a separate implementation and gate.
    ScaffoldOnly,
}

/// A specification for a single operation in the catalog.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct OperationSpec {
    /// Operation identifier (e.g. `"build.execute"`, `"unity.license.activate"`).
    pub id: String,
    /// Domain name (e.g. `"build"`, `"project"`, `"runtime"`).
    pub domain: String,
    /// Whether this is a generic or provider-extension operation.
    pub scope: OperationScope,
    /// Human-readable description.
    pub description: String,
    /// JSON Schema for the input arguments.
    pub input_schema: serde_json::Value,
    /// JSON Schema for the output.
    pub output_schema: serde_json::Value,
    /// Side effects this operation may cause.
    #[serde(default)]
    pub effects: Vec<Effect>,
    /// Stability of this operation.
    pub stability: Stability,
    /// Whether the operation is idempotent.
    pub idempotent: bool,
    /// Whether a running engine/runtime is required.
    pub requires_runtime: bool,
    /// Capability maturity used by the GameCLI workflow planner.
    ///
    /// This is optional on the wire for backwards compatibility with older
    /// providers. Built-in catalogs must populate it before being returned to
    /// callers; the safe absence/default is therefore not runtime-backed.
    #[serde(default)]
    pub implementation_tier: Option<ImplementationTier>,
    /// Platform/runtime versions on which this operation contract was
    /// verified. Entries are intentionally strings so providers can describe
    /// their own versioning scheme without coupling the shared model to one
    /// engine.
    #[serde(default)]
    pub verified_on: Vec<String>,
    /// Known limitations that workflow planning and acceptance should expose.
    #[serde(default)]
    pub known_limitations: Vec<String>,
    /// Human-readable success conditions for the operation.
    #[serde(default)]
    pub success_criteria: Vec<String>,
    /// Evidence kinds that can be produced to substantiate success.
    #[serde(default)]
    pub evidence_capabilities: Vec<String>,
    /// Why a lower implementation tier is advertised, when applicable.
    #[serde(default)]
    pub fallback_reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{ImplementationTier, OperationSpec};

    #[test]
    fn operation_spec_deserializes_legacy_payload_without_maturity_fields() {
        let value = serde_json::json!({
            "id": "legacy.operation",
            "domain": "legacy",
            "scope": "provider_extension",
            "description": "Legacy operation",
            "input_schema": { "type": "object" },
            "output_schema": { "type": "object" },
            "stability": "experimental",
            "idempotent": true,
            "requires_runtime": false
        });

        let spec: OperationSpec = serde_json::from_value(value).expect("legacy payload is valid");
        assert_eq!(spec.implementation_tier, None);
        assert!(spec.verified_on.is_empty());
        assert!(spec.success_criteria.is_empty());
        assert!(spec.evidence_capabilities.is_empty());
    }

    #[test]
    fn implementation_tier_uses_stable_snake_case_wire_values() {
        let value = serde_json::to_value(ImplementationTier::ScaffoldOnly).unwrap();
        assert_eq!(value, serde_json::json!("scaffold_only"));
    }
}

/// A request to prepare or execute an operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationRequest {
    /// Unique request ID.
    pub request_id: String,
    /// Target provider ID.
    pub provider_id: String,
    /// Operation ID from the catalog.
    pub operation_id: String,
    /// Project root (optional, for context).
    pub project_root: Option<std::path::PathBuf>,
    /// Arguments for the operation.
    pub arguments: serde_json::Value,
    /// Timeout in milliseconds.
    pub timeout_ms: Option<u64>,
    /// If true, only prepare without executing.
    pub dry_run: bool,
    /// Previously obtained plan ID (for confirmed execution).
    pub plan_id: Option<String>,
    /// Previously obtained effect digest (for confirmed execution).
    pub effect_digest: Option<String>,
}

/// A prepared operation plan.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct OperationPlan {
    /// Unique plan ID.
    pub plan_id: String,
    /// Normalized operation identifier.
    pub normalized_operation: String,
    /// Normalized arguments.
    pub normalized_arguments: serde_json::Value,
    /// Target resources.
    #[serde(default)]
    pub targets: Vec<String>,
    /// Side effects the execution will cause.
    #[serde(default)]
    pub effects: Vec<Effect>,
    /// Project fingerprint for validation.
    pub project_fingerprint: Option<String>,
    /// Plan expiry timestamp.
    pub expires_at: String,
    /// Digest of the effect plan (for confirmation).
    pub effect_digest: String,
}

/// The result of an operation execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult {
    /// Request ID this result corresponds to.
    pub request_id: String,
    /// Whether the operation succeeded.
    pub success: bool,
    /// Output data.
    pub output: serde_json::Value,
    /// Exit code of the underlying process (if applicable).
    pub exit_code: Option<i32>,
    /// Duration in milliseconds.
    pub duration_ms: u64,
    /// Path to the full log file (if applicable).
    pub log_path: Option<std::path::PathBuf>,
}

/// Result of a cancel request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelResult {
    /// Request ID that was cancelled.
    pub request_id: String,
    /// Whether cancellation was successful.
    pub success: bool,
    /// Human-readable message.
    pub message: String,
}
