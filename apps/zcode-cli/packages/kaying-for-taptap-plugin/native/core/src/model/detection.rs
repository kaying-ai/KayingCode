//! Project detection types.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// The result of a successful project detection.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct DetectionResult {
    /// Which provider detected this project.
    pub provider_id: String,
    /// Absolute path to the project root.
    pub project_root: PathBuf,
    /// Detection confidence (0.0 – 1.0).
    pub confidence: f32,
    /// Evidence that led to this detection.
    pub evidence: Vec<DetectionEvidence>,
    /// Configured entry point from project config (if any).
    pub configured_entry: Option<String>,
    /// Resolved absolute path to the entry point (if found).
    pub resolved_entry: Option<PathBuf>,
    /// Detected engine version string.
    pub engine_version: Option<String>,
    /// Non-fatal warnings about the project.
    #[serde(default)]
    pub warnings: Vec<Diagnostic>,
}

/// A single piece of evidence supporting a detection.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct DetectionEvidence {
    /// Path to the evidence file relative to project root.
    pub path: String,
    /// What was found (e.g. `"ProjectVersion.txt"`, `".project/project.json"`).
    pub indicator: String,
    /// Weight of this evidence (higher = more convincing).
    pub weight: f32,
}

/// A diagnostic message (warning or info).
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct Diagnostic {
    /// Diagnostic code (e.g. `"DEPRECATED_CONFIG"`).
    pub code: String,
    /// Human-readable message.
    pub message: String,
    /// Severity level.
    #[serde(rename = "type")]
    pub severity: DiagnosticSeverity,
}

/// Severity of a diagnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DiagnosticSeverity {
    Info,
    Warning,
    Error,
}

impl DetectionResult {
    /// Create a new detection result.
    #[must_use]
    pub fn new(
        provider_id: impl Into<String>,
        project_root: PathBuf,
        confidence: f32,
        evidence: Vec<DetectionEvidence>,
    ) -> Self {
        Self {
            provider_id: provider_id.into(),
            project_root,
            confidence,
            evidence,
            configured_entry: None,
            resolved_entry: None,
            engine_version: None,
            warnings: Vec::new(),
        }
    }
}
