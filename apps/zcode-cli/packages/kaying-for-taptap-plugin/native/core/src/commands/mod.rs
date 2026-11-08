//! KayingForTaptap core subcommands for TapTap Maker operations.

pub mod command;
pub mod detect;
pub mod doctor;
pub mod list;
pub mod maker;
pub mod project;
pub mod runtime;
pub mod schema;

use clap::Subcommand;

/// All available subcommands.
#[derive(Debug, Subcommand)]
pub enum Command {
    /// Discover, prepare, or execute an engine operation.
    Command(self::command::CommandArgs),

    /// Detect the game engine used by a project.
    Detect(self::detect::DetectArgs),

    /// Diagnose the development environment.
    Doctor(self::doctor::DoctorArgs),

    /// List capabilities, providers, or operations.
    List(self::list::ListArgs),

    /// Manage TapTap projects (info, validate, init).
    Project(self::project::ProjectArgs),

    /// Manage UrhoX Runtime (run, cancel, logs).
    Runtime(self::runtime::RuntimeArgs),

    /// Manage Maker Cloud operations (auth, status, build).
    Maker(self::maker::MakerArgs),

    /// Print JSON Schema for types or commands.
    Schema(self::schema::SchemaArgs),
}

/// Execute a command and return the output as a serde_json::Value.
pub fn execute(
    cmd: &Command,
    registry: &crate::engine::ProviderRegistry,
    _timer: &crate::common::Timer,
) -> Result<serde_json::Value, crate::common::Error> {
    match cmd {
        Command::Command(args) => self::command::execute(args, registry),
        Command::Detect(args) => self::detect::execute(args, registry)
            .map(|v| serde_json::to_value(v).unwrap_or(serde_json::json!(null))),
        Command::Doctor(args) => self::doctor::execute(args, registry)
            .map(|v| serde_json::to_value(v).unwrap_or(serde_json::json!(null))),
        Command::List(args) => self::list::execute(args, registry)
            .map(|v| serde_json::to_value(v).unwrap_or(serde_json::json!(null))),
        Command::Project(args) => self::project::execute(args, registry)
            .map(|v| serde_json::to_value(v).unwrap_or(serde_json::json!(null))),
        Command::Runtime(args) => self::runtime::execute(args, registry)
            .map(|v| serde_json::to_value(v).unwrap_or(serde_json::json!(null))),
        Command::Maker(args) => self::maker::execute(args, registry)
            .map(|v| serde_json::to_value(v).unwrap_or(serde_json::json!(null))),
        Command::Schema(args) => self::schema::execute(args),
    }
}
