//! Dynamic capability types.

use serde::{Deserialize, Serialize};

/// Whether a provider supports a given capability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SupportState {
    /// Fully supported.
    Supported,
    /// Experimental — may change or break.
    Experimental,
    /// Not implemented by this provider.
    Unsupported,
    /// Not applicable to this engine type (e.g. license for TapTap).
    NotApplicable,
}

/// Whether a capability is currently available in the environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Availability {
    /// Ready to use.
    Available,
    /// Supported but not available (e.g. missing tool, not authenticated).
    Unavailable,
    /// Available but with degraded functionality.
    Degraded,
    /// Availability cannot be determined without deeper probe.
    Unknown,
}

/// The source of a capability definition.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct CapabilitySource {
    /// Which part of the system defines this capability.
    pub kind: CapabilitySourceKind,
    /// Version of the definition.
    pub version: String,
}

/// Kind of capability source.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CapabilitySourceKind {
    /// Defined by the Application Core (generic).
    Core,
    /// Defined by the provider (static).
    Provider,
    /// Discovered at runtime (e.g. Unity Editor Pipeline commands).
    Runtime,
}

/// Effect of an operation (used for safety and planning).
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Effect {
    /// Reads project files (no mutation).
    ReadProject,
    /// Writes project files.
    WriteProject,
    /// Writes to app-owned data directory.
    WriteAppData,
    /// Spawns a child process.
    SpawnProcess,
    /// Makes network requests.
    Network,
    /// Downloads files from remote.
    Download,
    /// Creates a git commit.
    GitCommit,
    /// Pushes to remote git.
    GitPush,
    /// Triggers a remote build.
    RemoteBuild,
    /// Mutates remote resources.
    RemoteMutation,
    /// Uses a paid generation API.
    PaidGeneration,
    /// Executes arbitrary code (risk).
    ArbitraryCode,
    /// Bypasses engine sandbox (risk).
    EngineSandboxBypass,
}

/// A requirement that must be met for a capability to be available.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Requirement {
    /// What is required (e.g. `"urhox_runtime"`, `"maker_auth"`).
    pub id: String,
    /// Human-readable description.
    pub description: String,
    /// Whether this requirement is currently met.
    pub met: bool,
}

/// Complete capability state for a single capability.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct CapabilityState {
    /// Capability identifier (e.g. `"build.execute"`).
    pub id: String,
    /// Whether the provider supports this capability.
    pub support: SupportState,
    /// Whether it's currently available.
    pub availability: Availability,
    /// Requirements that must be met.
    #[serde(default)]
    pub requirements: Vec<Requirement>,
    /// Side effects this capability may produce.
    #[serde(default)]
    pub effects: Vec<Effect>,
    /// Reason for the current support/availability state.
    pub reason: Option<String>,
    /// Where this capability is defined.
    pub source: CapabilitySource,
}

impl CapabilityState {
    /// Whether the capability is supported (including experimental).
    #[must_use]
    pub fn supports(&self) -> bool {
        matches!(
            self.support,
            SupportState::Supported | SupportState::Experimental
        )
    }

    /// Whether the capability is currently available.
    #[must_use]
    pub fn is_available(&self) -> bool {
        matches!(self.availability, Availability::Available)
    }
}

/// Report of all capabilities for a provider.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct CapabilityReport {
    /// Provider ID.
    pub provider_id: String,
    /// All capabilities.
    pub capabilities: Vec<CapabilityState>,
    /// Timestamp of the probe.
    pub probed_at: String,
}
