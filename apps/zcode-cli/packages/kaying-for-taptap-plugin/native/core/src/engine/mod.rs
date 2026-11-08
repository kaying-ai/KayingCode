//! KayingForTaptap CLI core engine — provider registry, routing, and orchestration.
//!
//! This crate provides the central orchestration layer for the KayingForTaptap CLI:
//! - `ProviderRegistry` — register, discover, and resolve engine providers
//! - `ProviderAccess` — convenience trait for provider operations via the registry
//! - Error types for registration, resolution, and engine operations

pub mod error;
pub mod registry;

pub use error::{EngineError, RegistrationError, ResolutionError};
pub use registry::{ProviderAccess, ProviderRegistry, ResolvedProvider};
