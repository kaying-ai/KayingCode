//! Capability truth metadata for the TapTap operation catalog.
//!
//! The operation implementations predate workflow planning and therefore do
//! not all carry maturity information at their declaration site. Keeping the
//! first version of this mapping in one place makes the catalog auditable and
//! lets us migrate individual entries to richer declarations later without
//! changing the provider contract.

use crate::model::{Effect, ImplementationTier, OperationSpec};

/// Populate workflow-facing maturity and evidence metadata for every catalog
/// entry.
pub(super) fn enrich_catalog(mut entries: Vec<OperationSpec>) -> Vec<OperationSpec> {
    for entry in &mut entries {
        let tier = implementation_tier_for(&entry.id, &entry.domain);
        entry.implementation_tier = Some(tier);
        entry.verified_on = vec![verification_target(tier).to_string()];
        entry.known_limitations = known_limitations(tier);
        entry.success_criteria = success_criteria(entry, tier);
        entry.evidence_capabilities = evidence_capabilities(entry, tier);
        entry.fallback_reason = fallback_reason(tier);
    }
    entries
}

fn implementation_tier_for(id: &str, domain: &str) -> ImplementationTier {
    if matches!(
        id,
        "runtime.run"
            | "runtime.smoke"
            | "editor.play"
            | "capture.game_view"
            | "capture.scene_view"
    ) {
        return ImplementationTier::RuntimeBacked;
    }

    // These operations produce project content or generated code. They are
    // useful building blocks, but the generated result still needs a separate
    // runtime/integration gate before it can be presented as playable.
    if matches!(
        domain,
        "animation" | "data" | "gameplay" | "network" | "vfx"
    ) || id.starts_with("ui.")
        || matches!(
            id,
            "debug.start_profiler" | "debug.stop_profiler" | "debug.assert_state"
        )
    {
        return ImplementationTier::ScaffoldOnly;
    }

    ImplementationTier::ProjectBacked
}

fn verification_target(tier: ImplementationTier) -> &'static str {
    match tier {
        ImplementationTier::RuntimeBacked => "taptap/urhox-runtime@1.x",
        ImplementationTier::ProjectBacked => "taptap/urhox-project@1.x",
        ImplementationTier::ScaffoldOnly => "taptap/urhox-project@1.x (scaffold contract)",
    }
}

fn known_limitations(tier: ImplementationTier) -> Vec<String> {
    let limitation = match tier {
        ImplementationTier::RuntimeBacked => {
            "Runtime evidence depends on an available UrhoX Runtime and a valid project entry"
        }
        ImplementationTier::ProjectBacked => {
            "Project success does not prove gameplay behaviour in a running Runtime"
        }
        ImplementationTier::ScaffoldOnly => {
            "Generated or scaffolded content requires a later implementation and Runtime gate"
        }
    };
    vec![limitation.to_string()]
}

fn success_criteria(entry: &OperationSpec, tier: ImplementationTier) -> Vec<String> {
    let criterion = match tier {
        ImplementationTier::RuntimeBacked => {
            "The requested Runtime operation completes and returns a schema-valid result"
        }
        ImplementationTier::ScaffoldOnly => {
            "The documented scaffold artifact is written and the result identifies the generated output"
        }
        ImplementationTier::ProjectBacked if has_write_effect(entry) => {
            "The requested project artifact is written and the result is schema-valid"
        }
        ImplementationTier::ProjectBacked => {
            "The requested project data is read or validated and the result is schema-valid"
        }
    };
    vec![criterion.to_string()]
}

fn evidence_capabilities(entry: &OperationSpec, tier: ImplementationTier) -> Vec<String> {
    let mut evidence = vec!["operation_result".to_string()];
    if has_write_effect(entry) {
        evidence.push("project_diff".to_string());
    }
    if has_read_effect(entry) {
        evidence.push("static_validation".to_string());
    }
    if matches!(tier, ImplementationTier::RuntimeBacked) {
        evidence.push("runtime_log".to_string());
        evidence.push("runtime_snapshot".to_string());
    }
    evidence
}

fn fallback_reason(tier: ImplementationTier) -> Option<String> {
    match tier {
        ImplementationTier::ScaffoldOnly => Some(
            "This operation exposes a project scaffold; use a separate logic/integration gate before treating it as playable"
                .to_string(),
        ),
        ImplementationTier::RuntimeBacked | ImplementationTier::ProjectBacked => None,
    }
}

fn has_read_effect(entry: &OperationSpec) -> bool {
    entry
        .effects
        .iter()
        .any(|effect| matches!(effect, Effect::ReadProject))
}

fn has_write_effect(entry: &OperationSpec) -> bool {
    entry
        .effects
        .iter()
        .any(|effect| matches!(effect, Effect::WriteProject))
}

#[cfg(test)]
mod tests {
    use super::super::catalog;
    use crate::model::Stability;

    #[test]
    fn every_catalog_entry_has_explicit_maturity_metadata() {
        let entries = catalog();
        assert!(!entries.is_empty());
        for entry in entries {
            assert!(
                entry.implementation_tier.is_some(),
                "{} is missing implementation_tier",
                entry.id
            );
            assert!(
                !entry
                    .verified_on
                    .iter()
                    .all(|value| value.trim().is_empty()),
                "{} is missing verified_on",
                entry.id
            );
        }
    }

    #[test]
    fn stable_operations_have_success_criteria_and_evidence_capabilities() {
        let entries = catalog();
        for entry in entries
            .into_iter()
            .filter(|entry| entry.stability == Stability::Stable)
        {
            assert!(
                !entry
                    .success_criteria
                    .iter()
                    .all(|value| value.trim().is_empty()),
                "{} is missing success_criteria",
                entry.id
            );
            assert!(
                !entry
                    .evidence_capabilities
                    .iter()
                    .all(|value| value.trim().is_empty()),
                "{} is missing evidence_capabilities",
                entry.id
            );
        }
    }
}
