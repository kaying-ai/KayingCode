//! `kaying-for-taptap-core doctor` — diagnose the development environment.

use crate::engine::ProviderRegistry;
use crate::model::{CapabilityReport, ProviderContext};
use clap::Args;
use std::path::PathBuf;

/// Arguments for the `doctor` subcommand.
#[derive(Debug, Args)]
pub struct DoctorArgs {
    /// Project root directory to inspect (optional).
    #[arg(default_value = ".")]
    pub path: PathBuf,

    /// Explicit engine ID (check only this engine).
    #[arg(long)]
    pub engine: Option<String>,

    /// Deep check — may perform network requests.
    #[arg(long)]
    pub deep: bool,
}

/// A single capability check result.
#[derive(Debug, serde::Serialize)]
pub struct CapabilityCheck {
    /// Capability ID.
    pub id: String,
    /// Whether the capability is supported.
    pub supported: bool,
    /// Whether the capability is currently available.
    pub available: bool,
    /// Reason for the current state.
    pub reason: Option<String>,
    /// Requirements not met.
    pub unmet_requirements: Vec<String>,
}

/// Summary of a provider's health.
#[derive(Debug, serde::Serialize)]
pub struct ProviderHealth {
    /// Provider ID.
    pub provider_id: String,
    /// Provider display name.
    pub display_name: String,
    /// Overall health status.
    pub healthy: bool,
    /// Capability checks.
    pub capabilities: Vec<CapabilityCheck>,
    /// Number of supported capabilities.
    pub supported_count: usize,
    /// Number of available capabilities.
    pub available_count: usize,
}

/// Output of the doctor command.
#[derive(Debug, serde::Serialize)]
pub struct DoctorOutput {
    /// Current project root (if detected).
    pub project_root: Option<PathBuf>,
    /// Provider health summaries.
    pub providers: Vec<ProviderHealth>,
    /// Overall health status.
    pub healthy: bool,
    /// Whether deep check was performed.
    pub deep: bool,
}

/// Execute the doctor command.
pub fn execute(
    args: &DoctorArgs,
    registry: &ProviderRegistry,
) -> Result<DoctorOutput, crate::common::Error> {
    let root = if args.path.is_absolute() {
        args.path.clone()
    } else {
        std::env::current_dir().unwrap_or_default().join(&args.path)
    };

    let project_root = if root.exists() && root.is_dir() {
        Some(root.clone())
    } else {
        None
    };

    let context = ProviderContext::new(project_root.clone());

    let reports: Vec<CapabilityReport> = match args.engine.as_deref() {
        Some(engine_id) => {
            // Check only the specified engine
            let _desc = registry.descriptor(engine_id).ok_or_else(|| {
                crate::common::Error::new(
                    "ENGINE_UNKNOWN",
                    format!("Engine provider '{engine_id}' is not registered"),
                )
            })?;

            // We need to probe just this one provider
            // Since we can't call probe on a single provider directly through the registry,
            // we use probe_all which covers all. For now, just probe all and filter.
            let all_reports = registry.probe_all(&context);
            all_reports
                .into_iter()
                .filter(|r| r.provider_id == engine_id)
                .collect()
        }
        None => registry.probe_all(&context),
    };

    let mut providers: Vec<ProviderHealth> = Vec::new();
    let mut overall_healthy = true;

    for report in &reports {
        let desc = registry.descriptor(&report.provider_id);
        let display_name = desc
            .as_ref()
            .map(|d| d.display_name.clone())
            .unwrap_or_else(|| report.provider_id.clone());

        let checks: Vec<CapabilityCheck> = report
            .capabilities
            .iter()
            .map(|c| {
                let unmet: Vec<String> = c
                    .requirements
                    .iter()
                    .filter(|r| !r.met)
                    .map(|r| r.description.clone())
                    .collect();

                CapabilityCheck {
                    id: c.id.clone(),
                    supported: c.supports(),
                    available: c.is_available(),
                    reason: c.reason.clone(),
                    unmet_requirements: unmet,
                }
            })
            .collect();

        let supported_count = checks.iter().filter(|c| c.supported).count();
        let available_count = checks.iter().filter(|c| c.available).count();
        let healthy = supported_count > 0 && available_count > 0;

        if !healthy {
            overall_healthy = false;
        }

        providers.push(ProviderHealth {
            provider_id: report.provider_id.clone(),
            display_name,
            healthy,
            capabilities: checks,
            supported_count,
            available_count,
        });
    }

    Ok(DoctorOutput {
        project_root,
        providers,
        healthy: overall_healthy,
        deep: args.deep,
    })
}
