//! TapTap environment probe — check for UrhoX Runtime, Maker MCP, and Lua LSP.

use crate::model::{
    Availability, CapabilityReport, CapabilitySource, CapabilitySourceKind, CapabilityState,
    ProviderContext, Requirement, SupportState,
};
use std::path::PathBuf;

/// Possible locations for the UrhoX Runtime binary.
fn urhox_candidate_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    // 1. Environment variable override
    if let Ok(val) = std::env::var("KAYING_FOR_TAPTAP_URHOX_BIN") {
        candidates.push(PathBuf::from(val));
    }

    // 2. KayingCode official-plugin data. Do not probe another product's home directory.
    if let Ok(plugin_data) = std::env::var("KAYINGCODE_PLUGIN_DATA") {
        candidates.push(PathBuf::from(plugin_data).join("runtimes").join("urhox"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("TapTap")
                    .join("UrhoXRuntime")
                    .join("UrhoXRuntime.exe"),
            );
        }
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_appdata)
                    .join("TapTap")
                    .join("UrhoXRuntime")
                    .join("UrhoXRuntime.exe"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(
            PathBuf::from("/Applications")
                .join("TapTap UrhoX.app")
                .join("Contents")
                .join("MacOS")
                .join("UrhoXRuntime"),
        );
    }

    candidates
}

/// Check if the UrhoX Runtime binary is available.
pub fn find_urhox_runtime() -> Option<PathBuf> {
    for candidate in urhox_candidate_paths() {
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Check if Maker MCP config exists.
pub fn find_maker_mcp(project_root: Option<&std::path::Path>) -> Option<PathBuf> {
    // Check project-local config
    if let Some(root) = project_root {
        let local_config = root.join(".maker-mcp").join("config.json");
        if local_config.exists() {
            return Some(local_config);
        }
    }

    // Check global config
    let home = std::env::var("HOME").ok()?;
    let global_config = PathBuf::from(&home).join(".maker-mcp").join("config.json");
    if global_config.exists() {
        return Some(global_config);
    }

    None
}

/// Probe the environment for all TapTap capabilities.
pub fn probe_taptap(context: &ProviderContext) -> CapabilityReport {
    let urhox_path = find_urhox_runtime();
    let maker_config = find_maker_mcp(context.project_root.as_deref());
    let is_windows = cfg!(target_os = "windows");

    let probed_at = chrono::Utc::now().to_rfc3339();

    // --- Runtime capabilities ---
    let runtime_available = match (&urhox_path, is_windows) {
        (Some(_), _) => Availability::Available,
        (None, true) => Availability::Unavailable,
        (None, false) => {
            // UrhoX is Windows-only, so on macOS/Linux it's N/A
            Availability::Unavailable
        }
    };

    let runtime_support = match is_windows {
        true => SupportState::Supported,
        false => SupportState::NotApplicable,
    };

    let capabilities = vec![
        // --- Project capabilities ---
        CapabilityState {
            id: "project.detect".to_string(),
            support: SupportState::Supported,
            availability: Availability::Available,
            requirements: vec![],
            effects: vec![],
            reason: None,
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
        CapabilityState {
            id: "project.info".to_string(),
            support: SupportState::Supported,
            availability: Availability::Available,
            requirements: vec![],
            effects: vec![crate::model::Effect::ReadProject],
            reason: None,
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
        CapabilityState {
            id: "project.validate".to_string(),
            support: SupportState::Supported,
            // Structural validation is filesystem-only; it must remain usable
            // before the optional Windows UrhoX Runtime is installed.
            availability: Availability::Available,
            requirements: vec![],
            effects: vec![crate::model::Effect::ReadProject],
            reason: None,
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
        // --- Runtime capabilities ---
        CapabilityState {
            id: "runtime.run".to_string(),
            support: runtime_support,
            availability: runtime_available.clone(),
            requirements: vec![Requirement {
                id: "urhox_runtime".to_string(),
                description: "UrhoX Runtime binary".to_string(),
                met: urhox_path.is_some(),
            }],
            effects: vec![
                crate::model::Effect::SpawnProcess,
                crate::model::Effect::ReadProject,
            ],
            reason: if !is_windows {
                Some("UrhoX Runtime is Windows-only".to_string())
            } else {
                urhox_path
                    .as_ref()
                    .map(|p| format!("UrhoX Runtime found at {}", p.display()))
            },
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
        CapabilityState {
            id: "runtime.capture".to_string(),
            support: runtime_support,
            availability: runtime_available.clone(),
            requirements: vec![Requirement {
                id: "urhox_runtime".to_string(),
                description: "UrhoX Runtime binary".to_string(),
                met: urhox_path.is_some(),
            }],
            effects: vec![
                crate::model::Effect::SpawnProcess,
                crate::model::Effect::WriteAppData,
            ],
            reason: urhox_path
                .as_ref()
                .map(|p| format!("UrhoX Runtime found at {}", p.display())),
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
        CapabilityState {
            id: "runtime.logs".to_string(),
            support: runtime_support,
            availability: runtime_available.clone(),
            requirements: vec![Requirement {
                id: "urhox_runtime".to_string(),
                description: "UrhoX Runtime binary".to_string(),
                met: urhox_path.is_some(),
            }],
            effects: vec![crate::model::Effect::ReadProject],
            reason: None,
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
        // --- Maker Cloud capabilities ---
        CapabilityState {
            id: "maker.auth".to_string(),
            support: SupportState::Experimental,
            availability: if maker_config.is_some() {
                Availability::Available
            } else {
                Availability::Unavailable
            },
            requirements: vec![Requirement {
                id: "maker_config".to_string(),
                description: "Maker MCP configuration file".to_string(),
                met: maker_config.is_some(),
            }],
            effects: vec![crate::model::Effect::Network],
            reason: maker_config
                .as_ref()
                .map(|p| format!("Maker MCP config found at {}", p.display())),
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
        CapabilityState {
            id: "maker.build".to_string(),
            support: SupportState::Experimental,
            availability: if maker_config.is_some() {
                Availability::Available
            } else {
                Availability::Unavailable
            },
            requirements: vec![
                Requirement {
                    id: "maker_config".to_string(),
                    description: "Maker MCP configuration file".to_string(),
                    met: maker_config.is_some(),
                },
                Requirement {
                    id: "maker_auth".to_string(),
                    description: "Maker authentication".to_string(),
                    met: false, // Requires login check
                },
            ],
            effects: vec![
                crate::model::Effect::Network,
                crate::model::Effect::RemoteBuild,
            ],
            reason: None,
            source: CapabilitySource {
                kind: CapabilitySourceKind::Provider,
                version: "1.0.0".to_string(),
            },
        },
    ];

    CapabilityReport {
        provider_id: "taptap".to_string(),
        capabilities,
        probed_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probe_basic_structure() {
        let context = ProviderContext::new(None);
        let report = probe_taptap(&context);

        assert_eq!(report.provider_id, "taptap");
        assert!(!report.capabilities.is_empty());
        assert!(!report.probed_at.is_empty());
    }

    #[test]
    fn test_project_detect_always_available() {
        let context = ProviderContext::new(None);
        let report = probe_taptap(&context);

        let detect = report
            .capabilities
            .iter()
            .find(|c| c.id == "project.detect")
            .expect("project.detect capability should exist");

        assert_eq!(detect.support, SupportState::Supported);
        assert_eq!(detect.availability, Availability::Available);
    }

    #[test]
    fn test_runtime_capabilities_windows_aware() {
        let context = ProviderContext::new(None);
        let report = probe_taptap(&context);

        let runtime_run = report
            .capabilities
            .iter()
            .find(|c| c.id == "runtime.run")
            .expect("runtime.run capability should exist");

        if cfg!(target_os = "windows") {
            assert_eq!(runtime_run.support, SupportState::Supported);
        } else {
            assert_eq!(runtime_run.support, SupportState::NotApplicable);
        }
    }

    #[test]
    fn test_project_validate_does_not_require_runtime() {
        let context = ProviderContext::new(None);
        let report = probe_taptap(&context);

        let validate = report
            .capabilities
            .iter()
            .find(|c| c.id == "project.validate")
            .expect("project.validate capability should exist");

        assert_eq!(validate.support, SupportState::Supported);
        assert_eq!(validate.availability, Availability::Available);
        assert!(validate.requirements.is_empty());
    }
}
