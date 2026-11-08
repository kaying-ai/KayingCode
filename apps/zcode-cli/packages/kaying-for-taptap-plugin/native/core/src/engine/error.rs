//! Core-level error types for the KayingForTaptap CLI engine.

use thiserror::Error;

/// Errors during provider registration.
#[derive(Debug, Error)]
pub enum RegistrationError {
    /// A provider with the same ID is already registered.
    #[error("Provider already registered: {0}")]
    Duplicate(String),

    /// Provider validation failed.
    #[error("Provider validation failed: {0}")]
    Validation(String),
}

/// Errors during provider resolution.
#[derive(Debug, Error)]
pub enum ResolutionError {
    /// No engine provider was specified and none could be auto-detected.
    #[error("No engine specified and auto-detection failed")]
    NotSpecified,

    /// The specified engine provider is not registered.
    #[error("Unknown engine provider: {0}")]
    Unknown(String),

    /// Multiple providers detected the same project.
    #[error("Multiple providers detected the project: {0}")]
    Ambiguous(String),

    /// No provider detected the project.
    #[error("No provider detected the project at {0}")]
    NotDetected(String),
}

/// Errors during engine operations.
#[derive(Debug, Error)]
pub enum EngineError {
    /// Registration error.
    #[error("{0}")]
    Registration(#[from] RegistrationError),

    /// Resolution error.
    #[error("{0}")]
    Resolution(#[from] ResolutionError),

    /// Provider returned a detection error.
    #[error("Detection error from {provider}: {source}")]
    Detection {
        provider: String,
        #[source]
        source: crate::model::DetectionError,
    },

    /// Provider returned a probe error.
    #[error("Probe error from {provider}: {source}")]
    Probe {
        provider: String,
        #[source]
        source: crate::model::ProbeError,
    },

    /// Provider returned a catalog error.
    #[error("Catalog error from {provider}: {source}")]
    Catalog {
        provider: String,
        #[source]
        source: crate::model::CatalogError,
    },

    /// Provider returned a prepare error.
    #[error("Prepare error from {provider}: {source}")]
    Prepare {
        provider: String,
        #[source]
        source: crate::model::PrepareError,
    },

    /// Provider returned an execute error.
    #[error("Execute error from {provider}: {source}")]
    Execute {
        provider: String,
        #[source]
        source: crate::model::ExecuteError,
    },

    /// Provider returned a cancel error.
    #[error("Cancel error from {provider}: {source}")]
    Cancel {
        provider: String,
        #[source]
        source: crate::model::CancelError,
    },

    /// Provider returned a shutdown error.
    #[error("Shutdown error from {provider}: {source}")]
    Shutdown {
        provider: String,
        #[source]
        source: crate::model::ShutdownError,
    },

    /// Process error.
    #[error("{0}")]
    Process(#[from] crate::process::ProcessError),
}

impl EngineError {
    /// Get the error code string for this error.
    #[must_use]
    pub fn error_code(&self) -> &'static str {
        use crate::model::error_codes as codes;
        match self {
            Self::Registration(e) => match e {
                RegistrationError::Duplicate(_) => codes::ENGINE_UNKNOWN,
                RegistrationError::Validation(_) => codes::INVALID_INPUT,
            },
            Self::Resolution(e) => match e {
                ResolutionError::NotSpecified => codes::ENGINE_NOT_SPECIFIED,
                ResolutionError::Unknown(_) => codes::ENGINE_UNKNOWN,
                ResolutionError::Ambiguous(_) => codes::AMBIGUOUS_ENGINE,
                ResolutionError::NotDetected(_) => codes::PROJECT_NOT_FOUND,
            },
            Self::Detection { .. } => codes::PROJECT_NOT_FOUND,
            Self::Probe { .. } => codes::PROVIDER_UNAVAILABLE,
            Self::Catalog { .. } => codes::CAPABILITY_UNSUPPORTED,
            Self::Prepare { .. } => codes::INVALID_INPUT,
            Self::Execute { .. } => codes::EXTERNAL_TOOL_FAILED,
            Self::Cancel { .. } => codes::EXTERNAL_TOOL_FAILED,
            Self::Shutdown { .. } => codes::EXTERNAL_TOOL_FAILED,
            Self::Process(_) => codes::EXTERNAL_TOOL_FAILED,
        }
    }
}
