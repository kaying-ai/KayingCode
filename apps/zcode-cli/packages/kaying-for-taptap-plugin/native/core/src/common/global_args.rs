//! Global CLI arguments shared by all Kaying Rust CLIs.
//!
//! Each module's CLI should embed `GlobalArgs` (or its fields) at the top level
//! so that `--pretty`, `--no-meta`, and `--quiet` work consistently.

use clap::{ArgAction, Args};

/// Global flags shared by all Kaying Rust CLIs.
///
/// Embed via `#[command(flatten)] global: GlobalArgs` in your top-level `Cli` struct.
///
/// Full spec: `packages/RUST-CLI-CONVENTIONS.md` §3.3.
#[derive(Args, Debug, Clone)]
pub struct GlobalArgs {
    /// Output JSON (default behavior, explicit declaration).
    #[arg(long, global = true, action = ArgAction::SetTrue)]
    pub json: bool,

    /// Pretty-print JSON output (2-space indent).
    ///
    /// Default is compact single-line JSON (agent-friendly).
    #[arg(long, global = true, action = ArgAction::SetTrue)]
    pub pretty: bool,

    /// Suppress stderr tracing logs (errors still emitted).
    #[arg(long, global = true, action = ArgAction::SetTrue)]
    pub quiet: bool,

    /// Omit the `meta` object from JSON output.
    ///
    /// Useful when piping output to another tool that only needs `data`.
    #[arg(long, global = true, action = ArgAction::SetTrue)]
    pub no_meta: bool,

    /// Omit `meta.next_steps` from JSON output.
    #[arg(long, global = true, action = ArgAction::SetTrue)]
    pub no_next_steps: bool,

    /// Progress stream format: `ndjson` | `none`.
    #[arg(long, global = true, default_value = "ndjson")]
    pub progress: String,

    /// Verbose stderr logging: -v info, -vv debug, -vvv trace.
    #[arg(short, long, global = true, action = ArgAction::Count)]
    pub verbose: u8,
}

impl GlobalArgs {
    /// Build a tracing `EnvFilter` string from the verbose count.
    ///
    /// - `0` → `warn`
    /// - `1` → `info`
    /// - `2` → `debug`
    /// - `3+` → `trace`
    #[must_use]
    pub fn env_filter(&self) -> String {
        match self.verbose {
            0 => "warn".to_string(),
            1 => "info".to_string(),
            2 => "debug".to_string(),
            _ => "trace".to_string(),
        }
    }
}
