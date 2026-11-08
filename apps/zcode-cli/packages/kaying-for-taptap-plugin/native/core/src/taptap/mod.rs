//! TapTap / Maker game engine provider.
//!
//! Implements `EngineProvider` for TapTap Maker projects and UrhoX Runtime.
//! Uses `TapTapDetector` for project detection and `probe_taptap` for
//! environment capability probing.

pub mod detector;
pub mod maker;
pub mod operations;
pub mod probe;
pub mod provider;

pub use detector::{TapTapDetector, TapTapDetectorConfig};
pub use provider::TapTapProvider;
