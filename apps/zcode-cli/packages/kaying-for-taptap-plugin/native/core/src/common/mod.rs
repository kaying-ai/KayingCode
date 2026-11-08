//! Shared CLI types and helpers for Kaying Rust CLI modules.
//!
//! See `packages/RUST-CLI-CONVENTIONS.md` for the full specification.
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use clap::Parser;
//! use kaying_for_taptap_core::common::{CommandOutput, ExitCode, GlobalArgs, Meta, Timer};
//!
//! #[derive(Parser)]
//! struct Cli {
//!     #[command(flatten)]
//!     global: GlobalArgs,
//! }
//!
//! fn main() {
//!     let cli = Cli::parse();
//!     let timer = Timer::start();
//!     let meta = Meta::new("kaying-<x>", env!("CARGO_PKG_VERSION"))
//!         .with_duration_ms(timer.elapsed_ms());
//!     let output = CommandOutput::success(42, meta);
//!     output.print(cli.global.pretty, cli.global.no_meta);
//!     std::process::exit(ExitCode::Success.as_i32());
//! }
//! ```

pub mod exit_code;
pub mod global_args;
pub mod output;
pub mod progress;

pub use exit_code::ExitCode;
pub use global_args::GlobalArgs;
pub use output::{CommandOutput, Error, Meta, NextStep, NextStepPriority, Timer};
pub use progress::{
    ProgressEvent, ProgressStage, emit_progress, init_tracing, init_tracing_with_level,
};

/// Build the full command string from `std::env::args`.
///
/// Use this to populate `Meta.command`.
pub fn command_string() -> String {
    std::env::args().collect::<Vec<_>>().join(" ")
}
