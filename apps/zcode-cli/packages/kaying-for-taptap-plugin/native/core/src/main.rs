//! kaying-for-taptap-core binary entry point.

use clap::Parser;
use kaying_for_taptap_core::common::{CommandOutput, ExitCode, Meta, Timer};
use kaying_for_taptap_core::engine::ProviderRegistry;
use kaying_for_taptap_core::taptap::TapTapProvider;

fn main() {
    let cli = kaying_for_taptap_core::Cli::parse();

    let timer = Timer::start();

    // Initialize tracing
    let env_filter = cli.global.env_filter();
    kaying_for_taptap_core::common::init_tracing_with_level(&env_filter, cli.global.quiet);

    // Build the provider registry
    let registry = ProviderRegistry::new();

    // Register the TapTap provider (in-process)
    if let Err(e) = registry.register(Box::new(TapTapProvider::new())) {
        let meta = Meta::new("kaying-for-taptap-core", env!("CARGO_PKG_VERSION"))
            .with_duration_ms(timer.elapsed_ms());
        let err = kaying_for_taptap_core::common::Error::new(
            "REGISTRATION_FAILED",
            format!("Failed to register TapTap provider: {e}"),
        );
        let output: CommandOutput<()> = CommandOutput::failure(err, meta);
        output.print_with_options(
            cli.global.pretty,
            cli.global.no_meta,
            cli.global.no_next_steps,
        );
        std::process::exit(ExitCode::GeneralError.as_i32());
    }

    // Execute the command
    let result = kaying_for_taptap_core::commands::execute(&cli.command, &registry, &timer);

    // Build and print the output
    let meta = Meta::new("kaying-for-taptap-core", env!("CARGO_PKG_VERSION"))
        .with_duration_ms(timer.elapsed_ms());

    match result {
        Ok(data) => {
            let output = CommandOutput::success(data, meta);
            output.print_with_options(
                cli.global.pretty,
                cli.global.no_meta,
                cli.global.no_next_steps,
            );
            std::process::exit(ExitCode::Success.as_i32());
        }
        Err(err) => {
            let output: CommandOutput<()> = CommandOutput::failure(err, meta);
            output.print_with_options(
                cli.global.pretty,
                cli.global.no_meta,
                cli.global.no_next_steps,
            );
            std::process::exit(ExitCode::GeneralError.as_i32());
        }
    }
}
