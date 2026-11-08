//! Engine provider trait and descriptor types.

use super::{
    CancelError, CancelResult, CapabilityReport, CatalogError, DetectionError, DetectionResult,
    ExecuteError, OperationPlan, OperationRequest, OperationResult, OperationSpec, PrepareError,
    ProbeError, ShutdownError,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// How a provider communicates with the Application Core.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProviderTransport {
    /// Provider is linked as a Rust crate (in-process).
    InProcess,
    /// Provider communicates over JSON-RPC/NDJSON stdio.
    Stdio,
}

/// Describes a registered engine provider.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct EngineDescriptor {
    /// Unique provider identifier (e.g. `"unity"`, `"taptap"`).
    pub id: String,
    /// Human-readable display name.
    pub display_name: String,
    /// Provider implementation version.
    pub provider_version: String,
    /// Transport mechanism.
    pub transport: ProviderTransport,
    /// Runtime identifiers this provider can manage (e.g. `"unity-editor"`, `"urhox"`).
    #[serde(default)]
    pub runtime_ids: Vec<String>,
    /// Platform identifiers (e.g. `"unity-cloud"`, `"taptap-maker"`).
    #[serde(default)]
    pub platform_ids: Vec<String>,
}

impl EngineDescriptor {
    /// Create a new engine descriptor.
    #[must_use]
    pub fn new(
        id: impl Into<String>,
        display_name: impl Into<String>,
        provider_version: impl Into<String>,
        transport: ProviderTransport,
    ) -> Self {
        Self {
            id: id.into(),
            display_name: display_name.into(),
            provider_version: provider_version.into(),
            transport,
            runtime_ids: Vec::new(),
            platform_ids: Vec::new(),
        }
    }
}

/// The core `EngineProvider` trait.
///
/// All game engine providers (Unity, TapTap, etc.) implement this trait.
/// Business capabilities are exposed via the dynamic `OperationSpec` catalog
/// rather than adding methods to this trait.
pub trait EngineProvider: Send + Sync + std::fmt::Debug {
    /// Return the provider's static descriptor.
    fn descriptor(&self) -> EngineDescriptor;

    /// Detect whether this provider applies to the given project root.
    ///
    /// Returns `Ok(None)` if the project is not recognized.
    fn detect(&self, root: &Path) -> Result<Option<DetectionResult>, DetectionError>;

    /// Probe the current environment for dynamic capability availability.
    fn probe(&self, context: &ProviderContext) -> Result<CapabilityReport, ProbeError>;

    /// Return the full catalog of operations this provider supports.
    fn operation_catalog(
        &self,
        context: &ProviderContext,
    ) -> Result<Vec<OperationSpec>, CatalogError>;

    /// Prepare an operation: validate arguments, resolve effects, return a plan.
    fn prepare(&self, request: &OperationRequest) -> Result<OperationPlan, PrepareError>;

    /// Execute a prepared operation.
    fn execute(&self, request: &OperationRequest) -> Result<OperationResult, ExecuteError>;

    /// Cancel a running operation by request ID.
    fn cancel(&self, request_id: &str) -> Result<CancelResult, CancelError>;

    /// Shut down the provider and release all resources.
    fn shutdown(&self) -> Result<(), ShutdownError>;
}

/// Context passed to provider methods for environment-aware decisions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderContext {
    /// The project root directory, if applicable.
    pub project_root: Option<std::path::PathBuf>,
    /// Platform-specific information.
    pub os: String,
    /// Whether the provider is running in a headless/CI environment.
    pub headless: bool,
}

impl ProviderContext {
    /// Create a new provider context.
    #[must_use]
    pub fn new(project_root: Option<std::path::PathBuf>) -> Self {
        Self {
            project_root,
            os: std::env::consts::OS.to_string(),
            headless: std::env::var("CI").is_ok() || std::env::var("GAMECLI_HEADLESS").is_ok(),
        }
    }
}
