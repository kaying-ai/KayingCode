//! Domain types, errors, and schemas for kaying-for-taptap-core.
//!
//! This crate defines the shared types used across all other crates:
//! - `EngineProvider` trait — the core abstraction for game engine providers
//! - `EngineDescriptor` / `DetectionResult` — provider identity and project detection
//! - `CapabilityState` — dynamic capability reporting
//! - `OperationSpec` / `OperationPlan` / `OperationResult` — operation catalog and execution
//! - Error types and error codes

pub mod capability;
pub mod detection;
pub mod engine;
pub mod error;
pub mod operation;

pub use capability::*;
pub use detection::*;
pub use engine::*;
pub use error::*;
pub use operation::*;
