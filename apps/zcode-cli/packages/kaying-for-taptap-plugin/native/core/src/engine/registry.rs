//! Provider registry — register, discover, and resolve engine providers.

use crate::engine::error::{RegistrationError, ResolutionError};
use crate::model::{
    CapabilityReport, DetectionResult, EngineDescriptor, EngineProvider, ProviderContext,
};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, RwLock};
use tracing::{debug, info, warn};

/// A thread-safe registry of engine providers.
///
/// Providers are registered by unique ID and can be looked up for
/// project detection, capability probing, and operation routing.
#[derive(Debug, Clone)]
pub struct ProviderRegistry {
    /// Registered providers, keyed by ID.
    providers: Arc<RwLock<HashMap<String, RegistryEntry>>>,
}

/// Internal registry entry wrapping a provider.
#[derive(Debug)]
struct RegistryEntry {
    /// The provider instance.
    provider: Box<dyn EngineProvider>,
    /// Cached descriptor (immutable after registration).
    descriptor: EngineDescriptor,
}

impl RegistryEntry {
    fn new(provider: Box<dyn EngineProvider>) -> Self {
        let descriptor = provider.descriptor();
        Self {
            provider,
            descriptor,
        }
    }
}

impl ProviderRegistry {
    /// Create a new, empty provider registry.
    #[must_use]
    pub fn new() -> Self {
        Self {
            providers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a provider.
    ///
    /// # Errors
    ///
    /// Returns `Duplicate` if a provider with the same ID is already registered.
    /// Returns `Validation` if the provider's descriptor is invalid.
    pub fn register(&self, provider: Box<dyn EngineProvider>) -> Result<(), RegistrationError> {
        let entry = RegistryEntry::new(provider);
        let id = entry.descriptor.id.clone();

        if id.is_empty() {
            return Err(RegistrationError::Validation(
                "Provider ID must not be empty".to_string(),
            ));
        }

        let mut providers = self
            .providers
            .write()
            .map_err(|e| RegistrationError::Validation(format!("Lock poisoned: {e}")))?;

        if providers.contains_key(&id) {
            return Err(RegistrationError::Duplicate(id));
        }

        info!(provider_id = %id, transport = ?entry.descriptor.transport, "Provider registered");
        providers.insert(id, entry);
        Ok(())
    }

    /// Unregister a provider by ID.
    ///
    /// Returns `true` if the provider was found and removed.
    pub fn unregister(&self, id: &str) -> bool {
        let mut providers = self.providers.write().ok();
        if let Some(ref mut providers) = providers {
            let removed = providers.remove(id).is_some();
            if removed {
                info!(provider_id = %id, "Provider unregistered");
            }
            removed
        } else {
            false
        }
    }

    /// Get the descriptor for a registered provider.
    #[must_use]
    pub fn descriptor(&self, id: &str) -> Option<EngineDescriptor> {
        let providers = self.providers.read().ok()?;
        providers.get(id).map(|e| e.descriptor.clone())
    }

    /// List all registered provider descriptors.
    #[must_use]
    pub fn list(&self) -> Vec<EngineDescriptor> {
        self.providers
            .read()
            .ok()
            .map(|providers| providers.values().map(|e| e.descriptor.clone()).collect())
            .unwrap_or_default()
    }

    /// Check if a provider is registered.
    #[must_use]
    pub fn has(&self, id: &str) -> bool {
        self.providers
            .read()
            .ok()
            .map_or(false, |p| p.contains_key(id))
    }

    /// Number of registered providers.
    #[must_use]
    pub fn len(&self) -> usize {
        self.providers.read().ok().map_or(0, |p| p.len())
    }

    /// Whether the registry is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Run `detect` on all registered providers.
    ///
    /// Returns all positive detections (where `Ok(Some(...))`).
    pub fn detect_all(&self, root: &Path) -> Vec<DetectionResult> {
        let providers = match self.providers.read() {
            Ok(p) => p,
            Err(_) => return Vec::new(),
        };

        let mut results = Vec::new();
        for (id, entry) in providers.iter() {
            match entry.provider.detect(root) {
                Ok(Some(result)) => {
                    debug!(provider = %id, confidence = %result.confidence, "Provider detected project");
                    results.push(result);
                }
                Ok(None) => {
                    debug!(provider = %id, "Provider did not detect project");
                }
                Err(e) => {
                    warn!(provider = %id, error = %e, "Provider detection failed");
                }
            }
        }
        results
    }

    /// Resolve which provider to use for a given project.
    ///
    /// If `engine_id` is `Some`, looks up that specific provider.
    /// If `None`, runs `detect_all` and picks the best match.
    ///
    /// # Errors
    ///
    /// Returns `NotSpecified` if no engine ID is given and no provider detects the project.
    /// Returns `Unknown` if the given engine ID is not registered.
    /// Returns `Ambiguous` if multiple providers detect the project and none is clearly best.
    pub fn resolve(
        &self,
        engine_id: Option<&str>,
        root: &Path,
    ) -> Result<ResolvedProvider, ResolutionError> {
        let providers = self
            .providers
            .read()
            .map_err(|_| ResolutionError::NotSpecified)?;

        match engine_id {
            Some(id) => {
                // Explicit engine selection
                let entry = providers
                    .get(id)
                    .ok_or_else(|| ResolutionError::Unknown(id.to_string()))?;
                let descriptor = entry.descriptor.clone();
                // We can't return the reference because we hold the lock
                // Instead, we return the resolved descriptor and let the caller
                // use the registry again for operations
                drop(providers);
                Ok(ResolvedProvider {
                    id: descriptor.id.clone(),
                    descriptor,
                })
            }
            None => {
                // Auto-detect: run detect on all providers
                drop(providers); // release lock before potentially long detect_all
                let mut results = self.detect_all(root);

                if results.is_empty() {
                    return Err(ResolutionError::NotDetected(root.display().to_string()));
                }

                if results.len() == 1 {
                    let result = &results[0];
                    let desc = self
                        .descriptor(&result.provider_id)
                        .ok_or_else(|| ResolutionError::Unknown(result.provider_id.clone()))?;
                    return Ok(ResolvedProvider {
                        id: result.provider_id.clone(),
                        descriptor: desc,
                    });
                }

                // Multiple detections — pick the highest confidence
                results.sort_by(|a, b| {
                    b.confidence
                        .partial_cmp(&a.confidence)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                let best = &results[0];
                let second = &results[1];

                // If confidence is very close, it's ambiguous
                if (best.confidence - second.confidence).abs() < 0.1 {
                    let mut msg = format!(
                        "Multiple providers detected the project: {} ({:.1}) and {} ({:.1})",
                        best.provider_id, best.confidence, second.provider_id, second.confidence
                    );
                    if results.len() > 2 {
                        msg.push_str(&format!(", and {} more", results.len() - 2));
                    }
                    return Err(ResolutionError::Ambiguous(msg));
                }

                let desc = self
                    .descriptor(&best.provider_id)
                    .ok_or_else(|| ResolutionError::Unknown(best.provider_id.clone()))?;
                Ok(ResolvedProvider {
                    id: best.provider_id.clone(),
                    descriptor: desc,
                })
            }
        }
    }

    /// Run `probe` on all registered providers.
    pub fn probe_all(&self, context: &ProviderContext) -> Vec<CapabilityReport> {
        let providers = match self.providers.read() {
            Ok(p) => p,
            Err(_) => return Vec::new(),
        };

        let mut reports = Vec::new();
        for (id, entry) in providers.iter() {
            match entry.provider.probe(context) {
                Ok(report) => {
                    debug!(provider = %id, capabilities = %report.capabilities.len(), "Provider probed");
                    reports.push(report);
                }
                Err(e) => {
                    warn!(provider = %id, error = %e, "Provider probe failed");
                }
            }
        }
        reports
    }

    /// Shut down all registered providers.
    pub fn shutdown_all(&self) {
        let providers = match self.providers.read() {
            Ok(p) => p,
            Err(_) => return,
        };

        for (id, entry) in providers.iter() {
            if let Err(e) = entry.provider.shutdown() {
                warn!(provider = %id, error = %e, "Provider shutdown failed");
            } else {
                info!(provider = %id, "Provider shut down");
            }
        }
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// A resolved provider reference.
///
/// This is returned by `ProviderRegistry::resolve()` and contains
/// the provider's ID and descriptor. The caller can then use the
/// registry to perform operations on the resolved provider.
#[derive(Debug, Clone)]
pub struct ResolvedProvider {
    /// Provider ID.
    pub id: String,
    /// Provider descriptor.
    pub descriptor: EngineDescriptor,
}

/// Helper to access a provider's methods through the registry.
///
/// This trait provides convenience methods that lock the registry,
/// find the provider, and call the appropriate method.
pub trait ProviderAccess {
    /// Run detect on a specific provider.
    fn detect_provider(
        &self,
        provider_id: &str,
        root: &Path,
    ) -> Result<Option<DetectionResult>, crate::engine::error::EngineError>;

    /// Get the operation catalog for a specific provider.
    fn provider_catalog(
        &self,
        provider_id: &str,
        context: &ProviderContext,
    ) -> Result<Vec<crate::model::OperationSpec>, crate::engine::error::EngineError>;

    /// Prepare an operation on a specific provider.
    fn prepare_operation(
        &self,
        provider_id: &str,
        request: &crate::model::OperationRequest,
    ) -> Result<crate::model::OperationPlan, crate::engine::error::EngineError>;

    /// Execute an operation on a specific provider.
    fn execute_operation(
        &self,
        provider_id: &str,
        request: &crate::model::OperationRequest,
    ) -> Result<crate::model::OperationResult, crate::engine::error::EngineError>;
}

impl ProviderAccess for ProviderRegistry {
    fn detect_provider(
        &self,
        provider_id: &str,
        root: &Path,
    ) -> Result<Option<DetectionResult>, crate::engine::error::EngineError> {
        let providers = self.providers.read().map_err(|_| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::NotSpecified,
            )
        })?;

        let entry = providers.get(provider_id).ok_or_else(|| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::Unknown(provider_id.to_string()),
            )
        })?;

        entry
            .provider
            .detect(root)
            .map_err(|e| crate::engine::error::EngineError::Detection {
                provider: provider_id.to_string(),
                source: e,
            })
    }

    fn provider_catalog(
        &self,
        provider_id: &str,
        context: &ProviderContext,
    ) -> Result<Vec<crate::model::OperationSpec>, crate::engine::error::EngineError> {
        let providers = self.providers.read().map_err(|_| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::NotSpecified,
            )
        })?;

        let entry = providers.get(provider_id).ok_or_else(|| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::Unknown(provider_id.to_string()),
            )
        })?;

        entry.provider.operation_catalog(context).map_err(|e| {
            crate::engine::error::EngineError::Catalog {
                provider: provider_id.to_string(),
                source: e,
            }
        })
    }

    fn prepare_operation(
        &self,
        provider_id: &str,
        request: &crate::model::OperationRequest,
    ) -> Result<crate::model::OperationPlan, crate::engine::error::EngineError> {
        let providers = self.providers.read().map_err(|_| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::NotSpecified,
            )
        })?;

        let entry = providers.get(provider_id).ok_or_else(|| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::Unknown(provider_id.to_string()),
            )
        })?;

        entry
            .provider
            .prepare(request)
            .map_err(|e| crate::engine::error::EngineError::Prepare {
                provider: provider_id.to_string(),
                source: e,
            })
    }

    fn execute_operation(
        &self,
        provider_id: &str,
        request: &crate::model::OperationRequest,
    ) -> Result<crate::model::OperationResult, crate::engine::error::EngineError> {
        let providers = self.providers.read().map_err(|_| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::NotSpecified,
            )
        })?;

        let entry = providers.get(provider_id).ok_or_else(|| {
            crate::engine::error::EngineError::Resolution(
                crate::engine::error::ResolutionError::Unknown(provider_id.to_string()),
            )
        })?;

        entry
            .provider
            .execute(request)
            .map_err(|e| crate::engine::error::EngineError::Execute {
                provider: provider_id.to_string(),
                source: e,
            })
    }
}
