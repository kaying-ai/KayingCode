//! TapTap/Maker project detection logic.

use crate::model::{DetectionEvidence, DetectionResult, Diagnostic, DiagnosticSeverity};
use std::path::{Path, PathBuf};

/// Configuration for TapTap project detection.
#[derive(Debug, Clone)]
pub struct TapTapDetectorConfig {
    /// Custom UrhoX binary path override.
    pub urhox_bin_override: Option<PathBuf>,
}

impl Default for TapTapDetectorConfig {
    fn default() -> Self {
        Self {
            urhox_bin_override: None,
        }
    }
}

/// Detects TapTap/Maker projects by examining the project root.
#[derive(Debug)]
pub struct TapTapDetector {
    config: TapTapDetectorConfig,
}

impl TapTapDetector {
    /// Create a new detector with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: TapTapDetectorConfig::default(),
        }
    }

    /// Create a new detector with custom configuration.
    #[must_use]
    pub fn with_config(config: TapTapDetectorConfig) -> Self {
        Self { config }
    }

    /// Detect whether the given root is a TapTap project.
    ///
    /// Returns `None` if the project is not recognized as a TapTap project.
    pub fn detect(&self, root: &Path) -> Result<Option<DetectionResult>, std::io::Error> {
        if !root.exists() {
            return Ok(None);
        }
        if !root.is_dir() {
            return Ok(None);
        }

        let mut evidence: Vec<DetectionEvidence> = Vec::new();
        let mut warnings: Vec<Diagnostic> = Vec::new();
        let mut total_weight: f32 = 0.0;
        let mut configured_entry: Option<String> = None;
        let mut resolved_entry: Option<PathBuf> = None;
        let mut engine_version: Option<String> = None;

        // --- Evidence 1: .project/project.json (strongest) ---
        let project_json = root.join(".project").join("project.json");
        if project_json.exists() {
            let weight = 0.40;
            evidence.push(DetectionEvidence {
                path: ".project/project.json".to_string(),
                indicator: "TapTap project.json".to_string(),
                weight,
            });
            total_weight += weight;

            // Try to read entry point and engine version from project.json
            if let Ok(content) = std::fs::read_to_string(&project_json) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(entry) = json.get("entry").and_then(|v| v.as_str()) {
                        configured_entry = Some(entry.to_string());
                        // Resolve the entry relative to project root
                        let resolved = root.join(entry);
                        if resolved.exists() {
                            resolved_entry = Some(resolved);
                        } else {
                            warnings.push(Diagnostic {
                                code: "ENTRY_NOT_FOUND".to_string(),
                                message: format!(
                                    "Configured entry '{}' does not exist at {}",
                                    entry,
                                    resolved.display()
                                ),
                                severity: DiagnosticSeverity::Warning,
                            });
                        }
                    }
                    if let Some(ver) = json.get("engineVersion").and_then(|v| v.as_str()) {
                        engine_version = Some(ver.to_string());
                    }
                }
            } else {
                warnings.push(Diagnostic {
                    code: "PROJECT_JSON_UNREADABLE".to_string(),
                    message: format!(
                        "Found .project/project.json but could not read it at {}",
                        project_json.display()
                    ),
                    severity: DiagnosticSeverity::Warning,
                });
            }
        }

        // --- Evidence 2: .maker-mcp/config.json ---
        let maker_config = root.join(".maker-mcp").join("config.json");
        if maker_config.exists() {
            let weight = 0.25;
            evidence.push(DetectionEvidence {
                path: ".maker-mcp/config.json".to_string(),
                indicator: "Maker MCP config".to_string(),
                weight,
            });
            total_weight += weight;
        }

        // --- Evidence 3: scripts/ directory ---
        let scripts_dir = root.join("scripts");
        if scripts_dir.is_dir() {
            let weight = 0.15;
            evidence.push(DetectionEvidence {
                path: "scripts/".to_string(),
                indicator: "Scripts directory (TapTap convention)".to_string(),
                weight,
            });
            total_weight += weight;
        }

        // --- Evidence 4: assets/ directory ---
        let assets_dir = root.join("assets");
        if assets_dir.is_dir() {
            let weight = 0.10;
            evidence.push(DetectionEvidence {
                path: "assets/".to_string(),
                indicator: "Assets directory (TapTap convention)".to_string(),
                weight,
            });
            total_weight += weight;
        }

        // --- Evidence 5: .cli/UrhoXRuntime* ---
        let cli_dir = root.join(".cli");
        if cli_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&cli_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("UrhoXRuntime") {
                        let weight = 0.20;
                        evidence.push(DetectionEvidence {
                            path: format!(".cli/{}", name_str),
                            indicator: "UrhoX Runtime binary".to_string(),
                            weight,
                        });
                        total_weight += weight;
                        break;
                    }
                }
            }
        }

        // --- Evidence 6: Custom UrhoX binary override ---
        if let Some(ref urhox_bin) = self.config.urhox_bin_override {
            if urhox_bin.exists() {
                evidence.push(DetectionEvidence {
                    path: urhox_bin.to_string_lossy().to_string(),
                    indicator: "UrhoX Runtime (KAYING_FOR_TAPTAP_URHOX_BIN)".to_string(),
                    weight: 0.20,
                });
                total_weight += 0.20;
            }
        }

        // --- Decision ---
        if total_weight < 0.35 {
            return Ok(None);
        }

        // Clamp confidence to [0.0, 1.0]
        let confidence = total_weight.min(1.0);

        Ok(Some(DetectionResult {
            provider_id: "taptap".to_string(),
            project_root: root.to_path_buf(),
            confidence,
            evidence,
            configured_entry: configured_entry.clone(),
            resolved_entry: resolved_entry.clone(),
            engine_version: engine_version.clone(),
            warnings,
        }))
    }
}

impl Default for TapTapDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("Failed to create temp dir")
    }

    #[test]
    fn test_no_project_dir() {
        let detector = TapTapDetector::new();
        let temp = create_temp_dir();
        let result = detector.detect(temp.path()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_minimal_project_json_only() {
        let detector = TapTapDetector::new();
        let temp = create_temp_dir();
        let project_dir = temp.path().join(".project");
        fs::create_dir_all(&project_dir).unwrap();
        let project_json = serde_json::json!({
            "entry": "scripts/main.lua",
            "engineVersion": "1.0.0"
        });
        fs::write(
            project_dir.join("project.json"),
            serde_json::to_string_pretty(&project_json).unwrap(),
        )
        .unwrap();

        let result = detector.detect(temp.path()).unwrap();
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.provider_id, "taptap");
        assert!(result.confidence > 0.35);
        assert_eq!(
            result.configured_entry,
            Some("scripts/main.lua".to_string())
        );
        assert_eq!(result.engine_version, Some("1.0.0".to_string()));
    }

    #[test]
    fn test_full_project_detection() {
        let detector = TapTapDetector::new();
        let temp = create_temp_dir();

        // Create .project/project.json
        let project_dir = temp.path().join(".project");
        fs::create_dir_all(&project_dir).unwrap();
        let project_json = serde_json::json!({
            "entry": "scripts/main.lua",
            "engineVersion": "2.1.0"
        });
        fs::write(
            project_dir.join("project.json"),
            serde_json::to_string_pretty(&project_json).unwrap(),
        )
        .unwrap();

        // Create .maker-mcp/config.json
        let maker_dir = temp.path().join(".maker-mcp");
        fs::create_dir_all(&maker_dir).unwrap();
        fs::write(maker_dir.join("config.json"), "{}").unwrap();

        // Create scripts/ and assets/ directories
        let scripts_dir = temp.path().join("scripts");
        fs::create_dir_all(&scripts_dir).unwrap();
        let _main_lua = scripts_dir.join("main.lua");
        fs::write(&_main_lua, "-- placeholder").unwrap();
        let assets_dir = temp.path().join("assets");
        fs::create_dir_all(&assets_dir).unwrap();

        // Create .cli/UrhoXRuntime
        let cli_dir = temp.path().join(".cli");
        fs::create_dir_all(&cli_dir).unwrap();
        fs::write(cli_dir.join("UrhoXRuntime"), "placeholder").unwrap();

        let result = detector.detect(temp.path()).unwrap();
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.provider_id, "taptap");
        assert!(result.confidence > 0.5);
        assert_eq!(result.evidence.len(), 5);
        assert_eq!(result.engine_version, Some("2.1.0".to_string()));
        // entry exists now
        assert!(result.resolved_entry.is_some());
    }

    #[test]
    fn test_missing_entry_warning() {
        let detector = TapTapDetector::new();
        let temp = create_temp_dir();

        let project_dir = temp.path().join(".project");
        fs::create_dir_all(&project_dir).unwrap();
        let project_json = serde_json::json!({
            "entry": "scripts/nonexistent.lua"
        });
        fs::write(
            project_dir.join("project.json"),
            serde_json::to_string_pretty(&project_json).unwrap(),
        )
        .unwrap();

        let result = detector.detect(temp.path()).unwrap();
        assert!(result.is_some());
        let result = result.unwrap();
        assert!(!result.warnings.is_empty());
        assert_eq!(result.warnings[0].code, "ENTRY_NOT_FOUND");
    }
}
