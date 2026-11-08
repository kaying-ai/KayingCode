//! Operation catalog — declarative specs for all supported operations.
//!
//! Each `OperationSpec` describes one operation's id, domain, scope, schemas,
//! effects, and stability. The catalog is consumed by the provider to advertise
//! capabilities to the host (and ultimately to Agents).

use super::catalog_project::project_catalog;
use crate::model::{Effect, OperationScope, OperationSpec, Stability};
use serde_json::json;

/// Build the full operation catalog for the TapTap provider.
#[must_use]
pub fn catalog() -> Vec<OperationSpec> {
    let mut entries = Vec::new();
    entries.extend(project_catalog());
    entries.extend(build_catalog());
    entries.extend(runtime_catalog());
    entries.extend(settings_catalog());
    entries.extend(maker_catalog());
    entries.extend(asset_catalog());
    entries.extend(scene_catalog());
    entries.extend(scene_design_catalog());
    entries.extend(script_catalog());
    entries.extend(capture_catalog());
    entries.extend(editor_catalog());
    entries.extend(gameobject_catalog());
    entries.extend(component_catalog());
    entries.extend(prefab_catalog());
    entries.extend(material_catalog());
    entries.extend(package_catalog());
    entries.extend(data_catalog());
    entries.extend(animation_catalog());
    entries.extend(ui_catalog());
    entries.extend(ui_theme_catalog());
    entries.extend(world_catalog());
    entries.extend(physics_catalog());
    entries.extend(vfx_catalog());
    entries.extend(gameplay_catalog());
    entries.extend(network_catalog());
    entries.extend(debug_catalog());
    entries.extend(crate::taptap::operations::catalog_extended::refactor_catalog());
    entries.extend(crate::taptap::operations::catalog_extended::surface_catalog());
    let entries = crate::taptap::operations::catalog_maturity::enrich_catalog(entries);
    crate::taptap::operations::agent_contract::enrich_catalog(entries)
}

// ============================================================
// Project
// ============================================================

// ============================================================
// Build
// ============================================================

fn build_catalog() -> Vec<OperationSpec> {
    fn read_only(id: &str, desc: &str) -> OperationSpec {
        simple_spec(
            id,
            "build",
            desc,
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        )
    }
    vec![
        read_only(
            "build.list_targets",
            "List all available build targets for TapTap",
        ),
        OperationSpec {
            id: "build.switch_target".to_string(),
            domain: "build".to_string(),
            scope: OperationScope::ProviderExtension,
            description: "Switch the build target in project settings".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project_root": { "type": "string", "description": "Project root directory" },
                    "target": { "type": "string", "description": "Build target (android, ios, windows, macos, linux, web)" }
                },
                "required": ["project_root", "target"]
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
        read_only(
            "build.status",
            "Check the current build status (target, Maker availability, remote status)",
        ),
    ]
}

// ============================================================
// Runtime
// ============================================================

fn runtime_catalog() -> Vec<OperationSpec> {
    vec![
        OperationSpec {
            id: "runtime.run".to_string(),
            domain: "runtime".to_string(),
            scope: OperationScope::ProviderExtension,
            description: "Launch UrhoX Runtime to run the project".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "project_root": { "type": "string" },
                    "entry": { "type": "string" },
                    "args": { "type": "array", "items": { "type": "string" } },
                    "runtime_path": { "type": "string", "description": "Optional explicit Runtime executable" }
                },
                "required": ["project_root"]
            }),
            output_schema: json!({ "type": "object" }),
            effects: vec![
                Effect::SpawnProcess,
                Effect::ReadProject,
                Effect::WriteProject,
            ],
            stability: Stability::Experimental,
            idempotent: false,
            requires_runtime: false,
            implementation_tier: None,
            verified_on: Vec::new(),
            known_limitations: Vec::new(),
            success_criteria: Vec::new(),
            evidence_capabilities: Vec::new(),
            fallback_reason: None,
        },
        simple_spec(
            "runtime.cancel",
            "runtime",
            "Cancel a persistent UrhoX Runtime session and its process tree",
            vec![Effect::WriteProject],
            Stability::Experimental,
            false,
        ),
        simple_spec(
            "runtime.logs",
            "runtime",
            "Fetch persisted logs from a running or completed UrhoX Runtime session",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "runtime.status",
            "runtime",
            "Inspect a persistent UrhoX Runtime session",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "runtime.smoke",
            "runtime",
            "Launch, observe, diagnose, and optionally capture a Runtime smoke session",
            vec![
                Effect::SpawnProcess,
                Effect::ReadProject,
                Effect::WriteProject,
            ],
            Stability::Experimental,
            false,
        ),
    ]
}

// ============================================================
// Settings, Maker, Asset, Scene, Scene-Design, Script, Capture, Editor, Gameobject, Component
// ============================================================

fn settings_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "settings.get",
            "settings",
            "Get one or all project settings",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "settings.set",
            "settings",
            "Set one or more project settings",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
    ]
}

fn maker_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "maker.auth",
            "maker",
            "Check Maker authentication status",
            vec![Effect::Network],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "maker.status",
            "maker",
            "Check Maker build/service status",
            vec![Effect::Network],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "maker.build",
            "maker",
            "Prepare and submit a remote build via Maker Cloud",
            vec![Effect::Network, Effect::RemoteBuild],
            Stability::Experimental,
            false,
        ),
    ]
}

fn asset_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "asset.list",
            "asset",
            "List all assets in the assets/ directory",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "asset.import",
            "asset",
            "Import a file into the assets/ directory",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "asset.create_folder",
            "asset",
            "Create a subfolder under assets/",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "asset.delete",
            "asset",
            "Delete an asset file or folder",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "asset.rename",
            "asset",
            "Rename or move an asset",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "asset.create",
            "asset",
            "Create a new asset file with optional content",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
    ]
}

fn scene_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "scene.list",
            "scene",
            "List all scene files in the project",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "scene.create",
            "scene",
            "Create a new empty scene file",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "scene.open",
            "scene",
            "Read and return the contents of a scene file",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "scene.save",
            "scene",
            "Save content to a scene file",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "scene.hierarchy",
            "scene",
            "Parse a scene file and return the node hierarchy tree",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
    ]
}

fn scene_design_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "scene.save_all",
            "scene",
            "Flush all open scenes to disk",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "scene.list_open",
            "scene",
            "List currently open scenes",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "scene.set_active",
            "scene",
            "Set the active scene marker",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "scene.add_to_build",
            "scene",
            "Add a scene to the build-scene list",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "scene.remove_from_build",
            "scene",
            "Remove a scene from the build-scene list",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn script_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "script.list",
            "script",
            "List all Lua scripts in the scripts/ directory",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "script.create",
            "script",
            "Create a new Lua script file with a basic template",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "script.attach",
            "script",
            "Associate a script with a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
    ]
}

fn capture_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "capture.game_view",
            "capture",
            "Capture the game viewport",
            vec![Effect::ReadProject, Effect::SpawnProcess],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "capture.scene_view",
            "capture",
            "Capture the scene viewport",
            vec![Effect::ReadProject, Effect::SpawnProcess],
            Stability::Experimental,
            true,
        ),
    ]
}

fn editor_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "editor.play",
            "editor",
            "Launch the project in UrhoX Runtime tool-mode",
            vec![Effect::ReadProject, Effect::SpawnProcess],
            Stability::Experimental,
            false,
        ),
        simple_spec(
            "editor.stop",
            "editor",
            "Stop a running editor session",
            vec![],
            Stability::Experimental,
            false,
        ),
        simple_spec(
            "editor.pause",
            "editor",
            "Toggle pause state for a running editor session",
            vec![],
            Stability::Experimental,
            false,
        ),
        simple_spec(
            "editor.status",
            "editor",
            "Report editor/runtime availability and session state",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn gameobject_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "gameobject.create",
            "gameobject",
            "Create a new node in a scene",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "gameobject.list",
            "gameobject",
            "List all nodes in a scene with their hierarchy",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "gameobject.set_transform",
            "gameobject",
            "Set position/rotation/scale of a node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "gameobject.set_parent",
            "gameobject",
            "Reparent a node to a new parent",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "gameobject.delete",
            "gameobject",
            "Delete a node from a scene",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
    ]
}

fn component_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "component.add",
            "component",
            "Add a component to a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "component.remove",
            "component",
            "Remove a component from a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "component.get_properties",
            "component",
            "Get component properties from a scene node",
            vec![Effect::ReadProject],
            Stability::Stable,
            true,
        ),
        simple_spec(
            "component.set_properties",
            "component",
            "Set component properties on a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Stable,
            true,
        ),
    ]
}

// ============================================================
// D1: Prefab, Material, Package
// ============================================================

fn prefab_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "prefab.create",
            "prefab",
            "Create a new prefab file under prefabs/",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "prefab.instantiate",
            "prefab",
            "Insert a prefab's node tree into a target scene",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "prefab.create_variant",
            "prefab",
            "Derive a new prefab from a base with overrides",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "prefab.apply_overrides",
            "prefab",
            "Capture node-level overrides and persist them next to the prefab",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "prefab.unpack",
            "prefab",
            "Remove the prefab reference attribute from a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "prefab.save_contents",
            "prefab",
            "Extract a scene node subtree and save it as a prefab",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn material_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "material.get_properties",
            "material",
            "Read a material file's properties",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "material.set_properties",
            "material",
            "Write material properties",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "material.list_shaders",
            "material",
            "List shader files under assets/shaders/",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "material.get_shader_properties",
            "material",
            "Read shader uniform declarations",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn package_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "package.list",
            "package",
            "List all Lua modules under scripts/lib/",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "package.add",
            "package",
            "Create a new Lua module stub under scripts/lib/",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "package.remove",
            "package",
            "Remove a Lua module and update manifest",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "package.resolve",
            "package",
            "Statically verify require chains resolve to existing files",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "package.status",
            "package",
            "Return module dependency graph",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
    ]
}

// ============================================================
// D2: Data (game content creation)
// ============================================================

fn data_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "data.create_save_schema",
            "data",
            "Write scripts/data/save_schema.lua with declared fields",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.save_game",
            "data",
            "Generate save.write(slot, data) in scripts/data/save.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.load_game",
            "data",
            "Ensure Save.read(slot) exists in scripts/data/save.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.clear_save",
            "data",
            "Ensure Save.clear(slot) exists in scripts/data/save.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.create_i18n",
            "data",
            "Write scripts/data/i18n/<locale>.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.set_locale",
            "data",
            "Set .project/project.json locale",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.get_locale",
            "data",
            "Read .project/project.json locale",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.create_config",
            "data",
            "Write scripts/data/<name>_config.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.validate",
            "data",
            "Ensure scripts/data/validator.lua exists",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "data.migrate",
            "data",
            "Append a migration step to scripts/data/save.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

// ============================================================
// D2: Animation
// ============================================================

fn animation_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "animation.create_clip",
            "animation",
            "Write assets/animations/<name>.anim.json keyframe clip",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.set_curve",
            "animation",
            "Add/replace a curve on an animation clip",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.get_clip",
            "animation",
            "Read an animation clip file",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.remove_curve",
            "animation",
            "Remove a curve from an animation clip",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.create_controller",
            "animation",
            "Write assets/animator/<name>.controller.json state machine",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.add_parameter",
            "animation",
            "Append a parameter to an animator controller",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.add_layer",
            "animation",
            "Append a layer to an animator controller",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.add_state",
            "animation",
            "Append a state to an animator controller",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.add_transition",
            "animation",
            "Append a transition to an animator controller",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.get_controller",
            "animation",
            "Read an animator controller file",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.create_timeline",
            "animation",
            "Write assets/timelines/<name>.timeline.json",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.add_track",
            "animation",
            "Append a track to a timeline",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.add_clip",
            "animation",
            "Append a clip entry to a timeline track",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "animation.get_timeline",
            "animation",
            "Read a timeline file",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
    ]
}

// ============================================================
// D2: UI
// ============================================================

fn ui_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "ui.create_canvas",
            "ui",
            "Generate Canvas module under scripts/ui/<name>.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.create_element",
            "ui",
            "Append an element factory to a UI module",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.set_layout",
            "ui",
            "Append/replace a layout block on a UI module",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.set_style",
            "ui",
            "Append/replace a style block on a UI module",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.bind_event",
            "ui",
            "Append an event handler to a UI module",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.create_text",
            "ui",
            "Generate a text widget under scripts/ui/widgets/",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.create_button",
            "ui",
            "Generate a button widget with click event",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.create_image",
            "ui",
            "Generate an image widget referencing assets/textures/",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.create_scroll_view",
            "ui",
            "Generate a scroll view widget",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.create_joystick",
            "ui",
            "Generate a virtual joystick widget (mobile)",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.set_safe_area",
            "ui",
            "Write safe-area adaptation constants to scripts/ui/safe_area.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.inspect",
            "ui",
            "Statically scan UI modules and return an element tree",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn ui_theme_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "ui.theme.list",
            "ui",
            "List TapTap engine built-in UI themes",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.theme.resolve",
            "ui",
            "Resolve BrawlForge, Astroon, or PixelForge from an interface intent; returns choices when ambiguous",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "ui.theme.apply",
            "ui",
            "Apply a TapTap engine built-in UI theme when explicitly requested",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

// ============================================================
// D2: World, Physics, VFX, Gameplay, Network
// ============================================================

fn world_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "world.create_tilemap",
            "world",
            "Write assets/tilemaps/<name>.tilemap.json",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.set_tile",
            "world",
            "Modify a single tile in a tilemap",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.paint_tiles",
            "world",
            "Batch-paint a region of a tilemap",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.erase_tiles",
            "world",
            "Clear a region of a tilemap",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.import_tileset",
            "world",
            "Copy image into assets/textures/tilesets/ and write tileset config",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.create_terrain",
            "world",
            "Write assets/terrain/<name>.terrain.json heightmap reference",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.set_terrain_height",
            "world",
            "Modify heightmap data of a terrain",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.paint_terrain_layer",
            "world",
            "Modify splatmap layer data of a terrain",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.create_nav_area",
            "world",
            "Add a navigation component to a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "world.inspect_bounds",
            "world",
            "Read scene node bounds",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn physics_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "physics.create_rigidbody",
            "physics",
            "Register a rigidbody in scripts/systems/physics.lua and scene component",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.create_collider",
            "physics",
            "Add a collider component to a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.set_collision_layer",
            "physics",
            "Modify a component's collision mask layer",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.set_material",
            "physics",
            "Write .project/physics-materials/<name>.json",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.raycast",
            "physics",
            "Generate a raycast query function in scripts/systems/physics.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.overlap_query",
            "physics",
            "Generate an overlap query function in scripts/systems/physics.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.create_character_controller",
            "physics",
            "Generate a character controller module",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.create_joint",
            "physics",
            "Add a joint component to a scene node",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "physics.set_gravity",
            "physics",
            "Set physics.gravity field in .project/project.json",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn vfx_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "vfx.create_emitter",
            "vfx",
            "Write assets/vfx/<name>.particle.json particle parameters",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "vfx.set_properties",
            "vfx",
            "Modify particle emitter properties",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "vfx.play",
            "vfx",
            "Generate a play function in scripts/systems/vfx.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "vfx.stop",
            "vfx",
            "Generate a stop function in scripts/systems/vfx.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "vfx.create_trail",
            "vfx",
            "Generate a trail effect module",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "vfx.create_decal",
            "vfx",
            "Generate a decal effect module",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn gameplay_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "gameplay.create_state_machine",
            "gameplay",
            "Write scripts/gameplay/state_machine.lua framework",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.add_state",
            "gameplay",
            "Append a state to the state machine",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.add_transition",
            "gameplay",
            "Append a transition to the state machine",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.create_spawn_table",
            "gameplay",
            "Write scripts/data/spawn_table.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.create_loot_table",
            "gameplay",
            "Write scripts/data/loot_table.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.create_quest",
            "gameplay",
            "Write scripts/data/quests/<id>.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.create_dialogue",
            "gameplay",
            "Write scripts/data/dialogues/<id>.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.create_behavior_tree",
            "gameplay",
            "Write scripts/gameplay/bt/<name>.lua BT framework",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "gameplay.validate",
            "gameplay",
            "Statically verify state machine / BT graph integrity",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
    ]
}

fn network_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "network.create_session",
            "network",
            "Generate session management code in scripts/systems/network.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "network.join_session",
            "network",
            "Generate a join session function",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "network.leave_session",
            "network",
            "Generate a leave session function",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "network.send_rpc",
            "network",
            "Generate an RPC send function",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "network.set_replication",
            "network",
            "Generate replication configuration code",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "network.configure_matchmaking",
            "network",
            "Generate matchmaking configuration",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

// ============================================================
// D3: Debug / Diagnostics
// ============================================================

fn debug_catalog() -> Vec<OperationSpec> {
    vec![
        simple_spec(
            "debug.start_profiler",
            "debug",
            "Generate performance sampling code in scripts/systems/profiler.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "debug.stop_profiler",
            "debug",
            "Generate stop/elapsed functions in profiler.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "debug.get_frame_metrics",
            "debug",
            "Generate metrics reader and return persisted frame metrics",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "debug.export_diagnostics",
            "debug",
            "Export a diagnostics snapshot to .project/diagnostics/<ts>.json",
            vec![Effect::ReadProject],
            Stability::Experimental,
            true,
        ),
        simple_spec(
            "debug.assert_state",
            "debug",
            "Generate an assertion function in profiler.lua",
            vec![Effect::ReadProject, Effect::WriteProject],
            Stability::Experimental,
            true,
        ),
    ]
}

// Internal helper
/// Build a minimal `OperationSpec` with a permissive input schema (`project_root` + free-form args).
fn simple_spec(
    id: &str,
    domain: &str,
    desc: &str,
    effects: Vec<Effect>,
    stability: Stability,
    idempotent: bool,
) -> OperationSpec {
    OperationSpec {
        id: id.to_string(),
        domain: domain.to_string(),
        scope: OperationScope::ProviderExtension,
        description: desc.to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "project_root": { "type": "string", "description": "Project root directory" }
            },
            "required": ["project_root"]
        }),
        output_schema: json!({ "type": "object" }),
        effects,
        stability,
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
