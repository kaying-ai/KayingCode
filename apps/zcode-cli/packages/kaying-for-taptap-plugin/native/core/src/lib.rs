//! kaying-for-taptap-core — unified KayingForTaptap native core.
//!
//! Detect, doctor, and manage game projects across engines (TapTap, Unity, etc.).

pub mod commands;
pub mod common;
pub mod engine;
pub mod model;
pub mod process;
pub mod provider_stdio;
pub mod taptap;

use crate::common::GlobalArgs;
use clap::Parser;

/// Top-level CLI arguments.
#[derive(Debug, Parser)]
#[command(
    name = "kaying-for-taptap-core",
    version,
    about = "KayingForTaptap core — TapTap Maker operations"
)]
pub struct Cli {
    /// Global flags.
    #[command(flatten)]
    pub global: GlobalArgs,

    /// Subcommand.
    #[command(subcommand)]
    pub command: commands::Command,
}
