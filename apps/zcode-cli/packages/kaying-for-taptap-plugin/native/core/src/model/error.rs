//! Error types for the KayingForTaptap CLI model.

use thiserror::Error;

/// Errors during project detection.
#[derive(Debug, Error)]
pub enum DetectionError {
    #[error("I/O error during detection: {0}")]
    Io(#[from] std::io::Error),
    #[error("Detection probe failed: {0}")]
    Probe(String),
}

/// Errors during capability probing.
#[derive(Debug, Error)]
pub enum ProbeError {
    #[error("I/O error during probe: {0}")]
    Io(#[from] std::io::Error),
    #[error("Provider not available: {0}")]
    ProviderUnavailable(String),
    #[error("Probe timeout")]
    Timeout,
}

/// Errors during catalog retrieval.
#[derive(Debug, Error)]
pub enum CatalogError {
    #[error("Catalog not available: {0}")]
    Unavailable(String),
    #[error("Catalog parse error: {0}")]
    Parse(String),
}

/// Errors during operation preparation.
#[derive(Debug, Error)]
pub enum PrepareError {
    #[error("Invalid arguments: {0}")]
    InvalidArguments(String),
    #[error("Operation not found: {0}")]
    OperationNotFound(String),
    #[error("Capability unavailable: {0}")]
    CapabilityUnavailable(String),
}

/// Errors during operation execution.
#[derive(Debug, Error)]
pub enum ExecuteError {
    #[error("Operation not prepared: {0}")]
    NotPrepared(String),
    #[error("Plan expired or invalid: {0}")]
    PlanInvalid(String),
    #[error("External tool failed: {0}")]
    ExternalToolFailed(String),
    #[error("Timeout")]
    Timeout,
    #[error("Execution cancelled")]
    Cancelled,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Errors during cancellation.
#[derive(Debug, Error)]
pub enum CancelError {
    #[error("Request not found: {0}")]
    RequestNotFound(String),
    #[error("Failed to cancel: {0}")]
    Failed(String),
}

/// Errors during shutdown.
#[derive(Debug, Error)]
pub enum ShutdownError {
    #[error("Shutdown failed: {0}")]
    Failed(String),
}

/// Standard error codes for the KayingForTaptap CLI module.
///
/// These map to the GAMECLI_* error codes defined in the plan.
pub mod error_codes {
    /// Cannot determine which engine provider to use.
    pub const ENGINE_NOT_SPECIFIED: &str = "GAMECLI_ENGINE_NOT_SPECIFIED";
    /// Specified engine provider is not registered.
    pub const ENGINE_UNKNOWN: &str = "GAMECLI_ENGINE_UNKNOWN";
    /// Multiple providers detected the same project.
    pub const AMBIGUOUS_ENGINE: &str = "GAMECLI_AMBIGUOUS_ENGINE";
    /// No project found at the given root.
    pub const PROJECT_NOT_FOUND: &str = "GAMECLI_PROJECT_NOT_FOUND";
    /// Invalid input arguments or schema.
    pub const INVALID_INPUT: &str = "GAMECLI_INVALID_INPUT";
    /// Provider does not support this capability.
    pub const CAPABILITY_UNSUPPORTED: &str = "GAMECLI_CAPABILITY_UNSUPPORTED";
    /// Capability is supported but currently unavailable.
    pub const CAPABILITY_UNAVAILABLE: &str = "GAMECLI_CAPABILITY_UNAVAILABLE";
    /// Effect confirmation required but missing or expired.
    pub const EFFECT_CONFIRMATION_REQUIRED: &str = "GAMECLI_EFFECT_CONFIRMATION_REQUIRED";
    /// Provider failed to start.
    pub const PROVIDER_UNAVAILABLE: &str = "GAMECLI_PROVIDER_UNAVAILABLE";
    /// stdio protocol version mismatch.
    pub const PROVIDER_PROTOCOL_MISMATCH: &str = "GAMECLI_PROVIDER_PROTOCOL_MISMATCH";
    /// External tool (Unity/UrhoX/Maker) failed.
    pub const EXTERNAL_TOOL_FAILED: &str = "GAMECLI_EXTERNAL_TOOL_FAILED";
    /// Upstream output does not match expected codec.
    pub const OUTPUT_INVALID: &str = "GAMECLI_OUTPUT_INVALID";
    /// Runtime is not running but operation requires it.
    pub const RUNTIME_NOT_RUNNING: &str = "GAMECLI_RUNTIME_NOT_RUNNING";
    /// Operation timed out.
    pub const TIMEOUT: &str = "GAMECLI_TIMEOUT";
    /// Aggregate operation partially failed.
    pub const PARTIAL_FAILURE: &str = "GAMECLI_PARTIAL_FAILURE";
}
