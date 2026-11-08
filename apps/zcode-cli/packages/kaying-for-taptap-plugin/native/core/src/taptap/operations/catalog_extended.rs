//! Larger operation catalog sections split out to keep the main catalog maintainable.

use crate::model::{Effect, OperationScope, OperationSpec, Stability};
use serde_json::json;

pub(super) fn refactor_catalog() -> Vec<OperationSpec> {
    vec![
        spec(
            "refactor.analyze",
            "Analyze a Lua script for refactor opportunities: functions, locals, require deps, and references to a symbol",
            vec![Effect::ReadProject],
            true,
        ),
        spec(
            "refactor.rename_symbol",
            "Rename a Lua symbol (function or global) and update all references in the file or project",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec(
            "refactor.extract_function",
            "Extract a contiguous line range into a new top-level function in the same script",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec(
            "refactor.inline_local",
            "Inline a local declaration and substitute the value at all references",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec(
            "refactor.move_module",
            "Move a Lua module under scripts/ and rewrite require paths across the project",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec(
            "refactor.split_file",
            "Split a large script into a new module and require it from the source",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec(
            "project.refactor_to_modular",
            "Safely refactor a legacy Lua project into the modular layout using staging, validation, snapshots, and rollback",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec(
            "project.backup",
            "Snapshot mutable project directories under .project/backups with metadata and retention",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec(
            "project.list_backups",
            "List project backups newest-first with metadata",
            vec![Effect::ReadProject],
            true,
        ),
        spec(
            "project.refactor_rollback",
            "Restore the project from a backup and capture a reversible pre-rollback snapshot",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
    ]
}

pub(super) fn surface_catalog() -> Vec<OperationSpec> {
    vec![
        spec_for(
            "surface.create",
            "surface",
            "Create and register a Surface with a built-in layout template",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec_for(
            "surface.list",
            "surface",
            "List Surfaces from the manifest with directory-scan fallback",
            vec![Effect::ReadProject],
            true,
        ),
        spec_for(
            "surface.get",
            "surface",
            "Return one Surface manifest entry and source previews",
            vec![Effect::ReadProject],
            true,
        ),
        spec_for(
            "surface.switch",
            "surface",
            "Set the active Surface in .project/surfaces.json",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec_for(
            "surface.sync",
            "surface",
            "Report drift between the Surface manifest and directories",
            vec![Effect::ReadProject],
            true,
        ),
        spec_for(
            "surface.delete",
            "surface",
            "Back up and delete a Surface and its manifest entry",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
        spec_for(
            "surface.add_transition",
            "surface",
            "Declare a validated Surface-to-Surface transition",
            vec![Effect::ReadProject, Effect::WriteProject],
            false,
        ),
    ]
}

fn spec(id: &str, description: &str, effects: Vec<Effect>, idempotent: bool) -> OperationSpec {
    spec_for(id, "refactor", description, effects, idempotent)
}

fn spec_for(
    id: &str,
    domain: &str,
    description: &str,
    effects: Vec<Effect>,
    idempotent: bool,
) -> OperationSpec {
    OperationSpec {
        id: id.to_string(),
        domain: domain.to_string(),
        scope: OperationScope::ProviderExtension,
        description: description.to_string(),
        input_schema: json!({
            "type": "object",
            "properties": { "project_root": { "type": "string", "description": "Project root directory" } },
            "required": ["project_root"]
        }),
        output_schema: json!({ "type": "object" }),
        effects,
        stability: Stability::Experimental,
        idempotent,
        requires_runtime: false,
        implementation_tier: None,
        verified_on: Vec::new(),
        known_limitations: Vec::new(),
        success_criteria: Vec::new(),
        evidence_capabilities: Vec::new(),
        fallback_reason: None,
    }
}
