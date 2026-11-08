//! TapTap EngineProvider implementation.

use crate::model::{
    CancelError, CancelResult, CapabilityReport, CatalogError, DetectionError, DetectionResult,
    EngineDescriptor, EngineProvider, ExecuteError, OperationPlan, OperationRequest,
    OperationResult, OperationSpec, PrepareError, ProbeError, ProviderContext, ProviderTransport,
    ShutdownError,
};
use crate::taptap::detector::TapTapDetector;
use crate::taptap::operations;
use crate::taptap::probe::probe_taptap;
use std::path::Path;

/// The TapTap/Maker engine provider.
///
/// Detects TapTap projects by examining `.project/project.json`,
/// `.maker-mcp/config.json`, `scripts/`, `assets/`, and `.cli/UrhoXRuntime*`.
/// Probes the environment for UrhoX Runtime and Maker MCP availability.
#[derive(Debug)]
pub struct TapTapProvider {
    descriptor: EngineDescriptor,
    detector: TapTapDetector,
}

impl TapTapProvider {
    /// Create a new TapTap provider.
    #[must_use]
    pub fn new() -> Self {
        Self {
            descriptor: EngineDescriptor {
                id: "taptap".to_string(),
                display_name: "TapTap / UrhoX".to_string(),
                provider_version: env!("CARGO_PKG_VERSION").to_string(),
                transport: ProviderTransport::InProcess,
                runtime_ids: vec!["urhox".to_string()],
                platform_ids: vec!["taptap-maker".to_string()],
            },
            detector: TapTapDetector::new(),
        }
    }

    /// Create a new TapTap provider with a custom detector.
    #[must_use]
    pub fn with_detector(detector: TapTapDetector) -> Self {
        Self {
            descriptor: EngineDescriptor {
                id: "taptap".to_string(),
                display_name: "TapTap / UrhoX".to_string(),
                provider_version: env!("CARGO_PKG_VERSION").to_string(),
                transport: ProviderTransport::InProcess,
                runtime_ids: vec!["urhox".to_string()],
                platform_ids: vec!["taptap-maker".to_string()],
            },
            detector,
        }
    }
}

impl Default for TapTapProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl EngineProvider for TapTapProvider {
    fn descriptor(&self) -> EngineDescriptor {
        self.descriptor.clone()
    }

    fn detect(&self, root: &Path) -> Result<Option<DetectionResult>, DetectionError> {
        self.detector.detect(root).map_err(DetectionError::Io)
    }

    fn probe(&self, context: &ProviderContext) -> Result<CapabilityReport, ProbeError> {
        Ok(probe_taptap(context))
    }

    fn operation_catalog(
        &self,
        _context: &ProviderContext,
    ) -> Result<Vec<OperationSpec>, CatalogError> {
        Ok(operations::catalog())
    }

    fn prepare(&self, request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
        operations::agent_contract::validate_arguments(request)?;
        let (prepare_fn, _) = operations::dispatch(&request.operation_id).ok_or_else(|| {
            PrepareError::OperationNotFound(format!("Unknown operation: {}", request.operation_id))
        })?;
        prepare_fn(request)
    }

    fn execute(&self, request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
        let (_, execute_fn) = operations::dispatch(&request.operation_id).ok_or_else(|| {
            ExecuteError::NotPrepared(format!("Unknown operation: {}", request.operation_id))
        })?;

        // For operations that need a plan, create a default one
        let plan = self
            .prepare(request)
            .map_err(|e| ExecuteError::NotPrepared(format!("Prepare failed: {e}")))?;

        let result = execute_fn(request, &plan)?;
        operations::agent_contract::validate_output(&request.operation_id, &result.output)
            .map_err(|error| {
                ExecuteError::ExternalToolFailed(format!(
                    "Operation '{}' returned an invalid output contract: {error}",
                    request.operation_id
                ))
            })?;
        Ok(result)
    }

    fn cancel(&self, _request_id: &str) -> Result<CancelResult, CancelError> {
        Err(CancelError::RequestNotFound(
            "No active operations".to_string(),
        ))
    }

    fn shutdown(&self) -> Result<(), ShutdownError> {
        // No resources to clean up (in-process provider)
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_provider_descriptor() {
        let provider = TapTapProvider::new();
        let desc = provider.descriptor();

        assert_eq!(desc.id, "taptap");
        assert_eq!(desc.transport, ProviderTransport::InProcess);
        assert!(desc.runtime_ids.contains(&"urhox".to_string()));
    }

    #[test]
    fn test_provider_detect_no_project() {
        let provider = TapTapProvider::new();
        let temp = tempfile::tempdir().unwrap();

        let result = provider.detect(temp.path()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_provider_detect_taptap_project() {
        let provider = TapTapProvider::new();
        let temp = tempfile::tempdir().unwrap();

        // Create .project/project.json
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

        // Create scripts/ with entry
        let scripts_dir = temp.path().join("scripts");
        fs::create_dir_all(&scripts_dir).unwrap();
        fs::write(scripts_dir.join("main.lua"), "-- placeholder").unwrap();

        let result = provider.detect(temp.path()).unwrap();
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.provider_id, "taptap");
        assert!(result.resolved_entry.is_some());
    }

    #[test]
    fn test_provider_probe() {
        let provider = TapTapProvider::new();
        let context = ProviderContext::new(None);

        let report = provider.probe(&context).unwrap();
        assert_eq!(report.provider_id, "taptap");
        assert!(!report.capabilities.is_empty());
    }

    #[test]
    fn test_provider_catalog_has_operations() {
        let provider = TapTapProvider::new();
        let context = ProviderContext::new(None);

        let catalog = provider.operation_catalog(&context).unwrap();
        // M2: catalog should have project, runtime, and maker operations
        assert!(!catalog.is_empty());
        let ids: Vec<&str> = catalog.iter().map(|o| o.id.as_str()).collect();
        assert!(ids.contains(&"project.info"));
        assert!(ids.contains(&"runtime.run"));
        assert!(ids.contains(&"maker.auth"));
    }

    #[test]
    fn test_provider_shutdown() {
        let provider = TapTapProvider::new();
        assert!(provider.shutdown().is_ok());
    }
}
