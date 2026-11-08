//! `kaying-for-taptap-core list` — list providers, capabilities, or operations.

use crate::engine::{ProviderAccess, ProviderRegistry};
use crate::model::ProviderContext;
use clap::{Args, Subcommand};

/// Arguments for the `list` subcommand.
#[derive(Debug, Args)]
pub struct ListArgs {
    /// What to list.
    #[command(subcommand)]
    pub target: ListTarget,
}

/// What to list.
#[derive(Debug, Subcommand)]
pub enum ListTarget {
    /// List all registered providers.
    Providers,
    /// List capabilities for a provider.
    Capabilities {
        /// Provider ID (e.g. "taptap").
        provider: String,
        /// Project root for context (optional).
        #[arg(default_value = ".")]
        path: std::path::PathBuf,
    },
    /// List all operations for a provider.
    Operations {
        /// Provider ID (e.g. "taptap").
        provider: String,
        /// Project root for context (optional).
        #[arg(default_value = ".")]
        path: std::path::PathBuf,
    },
}

/// Output of the list command.
#[derive(Debug, serde::Serialize)]
#[serde(untagged)]
pub enum ListOutput {
    /// List of providers.
    Providers {
        /// All registered providers.
        providers: Vec<crate::model::EngineDescriptor>,
    },
    /// List of capabilities.
    Capabilities {
        /// Provider ID.
        provider: String,
        /// Capability report.
        report: crate::model::CapabilityReport,
    },
    /// List of operations.
    Operations {
        /// Provider ID.
        provider: String,
        /// Operation catalog.
        operations: Vec<crate::model::OperationSpec>,
    },
}

/// Execute the list command.
pub fn execute(
    args: &ListArgs,
    registry: &ProviderRegistry,
) -> Result<ListOutput, crate::common::Error> {
    match &args.target {
        ListTarget::Providers => Ok(ListOutput::Providers {
            providers: registry.list(),
        }),
        ListTarget::Capabilities { provider, path } => {
            if !registry.has(provider) {
                return Err(crate::common::Error::new(
                    "ENGINE_UNKNOWN",
                    format!("Engine provider '{provider}' is not registered"),
                ));
            }

            let root = if path.is_absolute() {
                path.clone()
            } else {
                std::env::current_dir().unwrap_or_default().join(path)
            };

            let project_root = if root.exists() && root.is_dir() {
                Some(root)
            } else {
                None
            };

            let context = ProviderContext::new(project_root);
            let reports = registry.probe_all(&context);
            let report = reports.into_iter().find(|r| r.provider_id == *provider);

            match report {
                Some(r) => Ok(ListOutput::Capabilities {
                    provider: provider.clone(),
                    report: r,
                }),
                None => Err(crate::common::Error::new(
                    "PROBE_FAILED",
                    format!("Failed to probe capabilities for '{provider}'"),
                )),
            }
        }
        ListTarget::Operations { provider, path } => {
            if !registry.has(provider) {
                return Err(crate::common::Error::new(
                    "ENGINE_UNKNOWN",
                    format!("Engine provider '{provider}' is not registered"),
                ));
            }

            let root = if path.is_absolute() {
                path.clone()
            } else {
                std::env::current_dir().unwrap_or_default().join(path)
            };

            let project_root = if root.exists() && root.is_dir() {
                Some(root)
            } else {
                None
            };

            let context = ProviderContext::new(project_root);
            let operations = registry
                .provider_catalog(provider, &context)
                .map_err(|e| crate::common::Error::new("CATALOG_ERROR", format!("{e}")))?;

            Ok(ListOutput::Operations {
                provider: provider.clone(),
                operations,
            })
        }
    }
}
