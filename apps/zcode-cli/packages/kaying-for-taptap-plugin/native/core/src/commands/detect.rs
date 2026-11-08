//! `kaying-for-taptap-core detect` — detect the game engine used by a project.

use crate::engine::{ProviderAccess, ProviderRegistry};
use crate::model::DetectionResult;
use clap::Args;
use std::path::PathBuf;

/// Arguments for the `detect` subcommand.
#[derive(Debug, Args)]
pub struct DetectArgs {
    /// Project root directory to inspect.
    #[arg(default_value = ".")]
    pub path: PathBuf,

    /// Explicit engine ID (skip auto-detection).
    #[arg(long)]
    pub engine: Option<String>,
}

/// Output of the detect command.
#[derive(Debug, serde::Serialize)]
pub struct DetectOutput {
    /// Whether a project was detected.
    pub detected: bool,
    /// The provider ID that detected the project.
    pub provider_id: Option<String>,
    /// Full detection result, if detected.
    pub result: Option<DetectionResult>,
    /// All detection results (for debugging).
    pub all_results: Vec<DetectionResult>,
}

/// Execute the detect command.
pub fn execute(
    args: &DetectArgs,
    registry: &ProviderRegistry,
) -> Result<DetectOutput, crate::common::Error> {
    let root = if args.path.is_absolute() {
        args.path.clone()
    } else {
        std::env::current_dir()
            .map_err(|e| {
                crate::common::Error::new(
                    "FILE_NOT_FOUND",
                    format!("Cannot get current directory: {e}"),
                )
            })?
            .join(&args.path)
    };

    if !root.exists() {
        return Err(crate::common::Error::new(
            "FILE_NOT_FOUND",
            format!("Project root does not exist: {}", root.display()),
        ));
    }

    match args.engine.as_deref() {
        Some(engine_id) => {
            // Explicit engine detection
            let resolved = registry
                .resolve(Some(engine_id), &root)
                .map_err(|e| crate::common::Error::new("ENGINE_UNKNOWN", format!("{e}")))?;

            let result = registry
                .detect_provider(&resolved.id, &root)
                .map_err(|e| crate::common::Error::new("DETECTION_FAILED", format!("{e}")))?;

            match result {
                Some(detection) => Ok(DetectOutput {
                    detected: true,
                    provider_id: Some(resolved.id),
                    result: Some(detection),
                    all_results: Vec::new(),
                }),
                None => Err(crate::common::Error::new(
                    "PROJECT_NOT_FOUND",
                    format!(
                        "Engine '{engine_id}' did not detect a project at {}",
                        root.display()
                    ),
                )),
            }
        }
        None => {
            // Auto-detection
            let results = registry.detect_all(&root);

            if results.is_empty() {
                return Ok(DetectOutput {
                    detected: false,
                    provider_id: None,
                    result: None,
                    all_results: results,
                });
            }

            // Pick the best result
            let best = results
                .iter()
                .max_by(|a, b| {
                    a.confidence
                        .partial_cmp(&b.confidence)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .expect("results is non-empty");

            Ok(DetectOutput {
                detected: true,
                provider_id: Some(best.provider_id.clone()),
                result: Some(best.clone()),
                all_results: results,
            })
        }
    }
}
