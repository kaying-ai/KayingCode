//! Project operation specifications.
use crate::model::{Effect, OperationScope, OperationSpec, Stability};
use serde_json::json;

pub(super) fn project_catalog() -> Vec<OperationSpec> {
    vec![
        OperationSpec {
            id: "project.info".to_string(),
            domain: "project".to_string(),
            scope: OperationScope::ProviderExtension,
            description: "Read project metadata from .project/project.json".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project_root": { "type": "string", "description": "Project root directory" }
                },
                "required": ["project_root"]
            }),
            output_schema: json!({ "type": "object" }),
            effects: vec![Effect::ReadProject],
            stability: Stability::Stable,
            idempotent: true,
            requires_runtime: false,
            implementation_tier: None,
            verified_on: Vec::new(),
            known_limitations: Vec::new(),
            success_criteria: Vec::new(),
            evidence_capabilities: Vec::new(),
            fallback_reason: None,
        },
        OperationSpec {
            id: "project.validate".to_string(),
            domain: "project".to_string(),
            scope: OperationScope::ProviderExtension,
            description: "Validate project structure and entry point integrity".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project_root": { "type": "string", "description": "Project root directory" }
                },
                "required": ["project_root"]
            }),
            output_schema: json!({ "type": "object" }),
            effects: vec![Effect::ReadProject, Effect::SpawnProcess],
            stability: Stability::Experimental,
            idempotent: true,
            requires_runtime: false,
            implementation_tier: None,
            verified_on: Vec::new(),
            known_limitations: Vec::new(),
            success_criteria: Vec::new(),
            evidence_capabilities: Vec::new(),
            fallback_reason: None,
        },
        OperationSpec {
            id: "project.init".to_string(),
            domain: "project".to_string(),
            scope: OperationScope::ProviderExtension,
            description: "Initialize a TapTap project with the modular scaffold (default, with Surface support), minimal entry, or empty config".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project_root": { "type": "string", "description": "Target directory" },
                    "entry": { "type": "string", "description": "Entry script path", "default": "scripts/main.lua" },
                    "engine_version": { "type": "string", "description": "Engine version", "default": "1.0.0" },
                    "template": {
                        "type": "string",
                        "enum": ["modular", "minimal", "empty"],
                        "description": "Scaffold template: modular (default, with Surface), minimal, empty",
                        "default": "modular"
                    },
                    "project_name": { "type": "string", "description": "Project name for AGENTS.md" },
                    "ui_theme": {
                        "type": "string",
                        "enum": ["brawlforge", "astroon", "pixelforge"],
                        "description": "TapTap engine built-in UI fallback theme",
                        "default": "brawlforge"
                    }
                },
                "required": ["project_root"]
            }),
            output_schema: json!({ "type": "object" }),
            effects: vec![Effect::WriteProject],
            stability: Stability::Experimental,
            idempotent: true,
            requires_runtime: false,
            implementation_tier: None,
            verified_on: Vec::new(),
            known_limitations: Vec::new(),
            success_criteria: Vec::new(),
            evidence_capabilities: Vec::new(),
            fallback_reason: None,
        },
    ]
}
