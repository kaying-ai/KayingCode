//! Scaffolding generators for `project.refactor_to_modular`.
//!
//! All templates use the TapTap engine lifecycle:
//! - `Start()` / `Stop()` (NOT `init/update/exit`)
//! - `SubscribeToEvent("Update", "HandleUpdate")` for per-frame updates
//! - Module state via `require "scripts.state"` (shared state module)
//!
//! Generates:
//! - Layer `init.lua` files (only for layers with functions)
//! - `scripts/lib/event.lua` + `scripts/lib/class.lua`
//! - `scripts/state.lua` (shared state stub, manual fill-in)
//! - `scripts/bootstrap.lua` (only requires layers with functions)
//! - `scripts/main.lua` (Start/Stop + event subscription forwarding)
//! - `.project/surfaces.json` + `.project/modules.json` (v2 format)
//! - `AGENTS.md` (v2 template)
//! - Per-Surface `init/view/state/style.lua` quadruples

use serde_json::{Value, json};

use super::refactor_redistribute::{PlannedFile, RedistributionPlan};
use super::refactor_scan::{ScanReport, SurfaceCandidate};

// ============================================================
// Surface file generation
// ============================================================

/// Build the four-file Surface quadruple (`init/view/state/style.lua`).
pub(crate) fn build_surface_files(surface: &SurfaceCandidate) -> Vec<(&'static str, String)> {
    let id = &surface.id;
    let pascal = to_pascal_case(id);
    let label = &surface.label;
    vec![
        (
            "init",
            format!(
                "-- scripts/ui/surfaces/{id}/init.lua — {label}\n\
				 \n\
				 local View = require \"scripts.ui.surfaces.{id}.view\"\n\
				 local State = require \"scripts.ui.surfaces.{id}.state\"\n\
				 local Style = require \"scripts.ui.surfaces.{id}.style\"\n\
				 \n\
				 local {pascal} = {{}}\n\
				 \n\
				 function {pascal}.create()\n\
				     State.reset()\n\
				     return View.build(Style)\n\
				 end\n\
				 \n\
				 function {pascal}.destroy()\n\
				     State.reset()\n\
				 end\n\
				 \n\
				 function {pascal}.handleInput(x, y, pressed)\n\
				     -- forward to view hit-test\n\
				 end\n\
				 \n\
				 return {pascal}\n",
                id = id,
                label = label,
                pascal = pascal,
            ),
        ),
        (
            "view",
            format!(
                "-- scripts/ui/surfaces/{id}/view.lua — UI construction\n\
				 \n\
				 local View = {{}}\n\
				 \n\
				 function View.build(style)\n\
				     -- TODO: build UI elements from style constants\n\
				     return {{}}\n\
				 end\n\
				 \n\
				 return View\n",
                id = id,
            ),
        ),
        (
            "state",
            format!(
                "-- scripts/ui/surfaces/{id}/state.lua — local state\n\
				 \n\
				 local State = {{}}\n\
				 local data = {{}}\n\
				 \n\
				 function State.reset()\n\
				     data = {{}}\n\
				 end\n\
				 \n\
				 function State.get(key)\n\
				     return data[key]\n\
				 end\n\
				 \n\
				 function State.set(key, value)\n\
				     data[key] = value\n\
				 end\n\
				 \n\
				 return State\n",
                id = id,
            ),
        ),
        (
            "style",
            format!(
                "-- scripts/ui/surfaces/{id}/style.lua — style constants\n\
				 \n\
				 local Style = {{}}\n\
				 \n\
				 Style.colors = {{}}\n\
				 Style.sizes = {{}}\n\
				 \n\
				 return Style\n",
                id = id,
            ),
        ),
    ]
}

// ============================================================
// Scaffolding generation
// ============================================================

/// Push all Surface-aware scaffolding files onto `plan.files` in write order.
///
/// `layers_with_functions` is the list of layers that actually have functions
/// classified into them. Only these layers get a `require` line in
/// `bootstrap.lua` (avoids referencing non-existent modules). However, ALL
/// standard layers (lib/ui/systems/gameplay/data) get an `init.lua` file
/// generated, per the modular project contract.
pub(crate) fn push_scaffolding(
    plan: &mut RedistributionPlan,
    report: &ScanReport,
    mode: ScaffoldMode,
) {
    let layers_with_functions: Vec<&'static str> = plan.by_layer.keys().copied().collect();

    // Generate init.lua for ALL standard layers (modular project requirement),
    // even if a layer has no classified functions. Bootstrap will only require
    // layers that have functions (see build_bootstrap_v2).
    const STANDARD_LAYERS: [&'static str; 5] = ["lib", "ui", "systems", "gameplay", "data"];

    for layer in &STANDARD_LAYERS {
        let rel = format!("scripts/{layer}/init.lua");
        let modules: Vec<String> = plan
            .files
            .iter()
            .filter(|file| file.rel_path.starts_with(&format!("scripts/{layer}/")))
            .filter(|file| file.rel_path != rel)
            .map(|file| file.rel_path.trim_end_matches(".lua").replace('/', "."))
            .collect();
        plan.files.push(PlannedFile {
            rel_path: rel,
            content: build_layer_init(layer, &modules),
            action: "create",
            after_lines: 0,
            before_lines: 0,
        });
    }

    // Keep the Surface root present even when no heuristic candidate was found.
    // The validator treats this directory as part of the modular contract.
    plan.files.push(PlannedFile {
        rel_path: "scripts/ui/surfaces/.gitkeep".to_string(),
        content: String::new(),
        action: "create",
        after_lines: 0,
        before_lines: 0,
    });

    // lib/event.lua + lib/class.lua.
    plan.files.push(PlannedFile {
        rel_path: "scripts/lib/event.lua".to_string(),
        content: build_event_bus().to_string(),
        action: "create",
        after_lines: 0,
        before_lines: 0,
    });
    plan.files.push(PlannedFile {
        rel_path: "scripts/lib/class.lua".to_string(),
        content: build_class().to_string(),
        action: "create",
        after_lines: 0,
        before_lines: 0,
    });

    // state.lua — shared state stub (manual fill-in).
    plan.files.push(PlannedFile {
        rel_path: "scripts/state.lua".to_string(),
        content: build_state_stub(),
        action: "create",
        after_lines: 0,
        before_lines: 0,
    });

    // Per-Surface init/view/state/style quadruple.
    // This populates both the on-disk files and plan.surfaces_created.
    for surface in &report.surfaces {
        let files = build_surface_files(surface);
        for (suffix, content) in files {
            let rel = format!("scripts/ui/surfaces/{}/{}.lua", surface.id, suffix);
            plan.files.push(PlannedFile {
                rel_path: rel,
                content,
                action: "create",
                after_lines: 0,
                before_lines: 0,
            });
        }
        plan.surfaces_created.push(surface.id.clone());
    }

    // bootstrap.lua (only requires layers with functions).
    plan.files.push(PlannedFile {
        rel_path: "scripts/bootstrap.lua".to_string(),
        content: build_bootstrap_v2(&layers_with_functions, &report.surfaces, mode),
        action: "create",
        after_lines: 0,
        before_lines: 0,
    });

    // main.lua — Start/Stop + event subscription forwarding.
    // In skeleton mode, main.lua is rewritten to a thin entry that requires
    // the original game code (preserved as scripts/legacy/main.lua
    // by the caller). In split mode, main.lua is a pure lifecycle stub.
    plan.files.push(PlannedFile {
        rel_path: "scripts/main.lua".to_string(),
        content: build_main_lua(mode),
        action: "rewrite",
        after_lines: 0,
        before_lines: 0,
    });

    // .project/surfaces.json
    let surfaces_value: Vec<Value> = report
        .surfaces
        .iter()
        .map(|s| {
            json!({
                "id": s.id,
                "label": s.label,
                "module": format!("scripts/ui/surfaces/{}", s.id),
                "entry": "init.lua",
                "backend": "static-ui",
                "initialState": {},
                "symbols": [],
                "assets": [],
                "transitions": [],
            })
        })
        .collect();
    let surfaces_json = json!({
        "version": 1,
        "surfaces": surfaces_value,
        "activeSurface": report.surfaces.first().map(|s| s.id.clone()).unwrap_or_default(),
    });
    plan.files.push(PlannedFile {
        rel_path: ".project/surfaces.json".to_string(),
        content: serde_json::to_string_pretty(&surfaces_json).unwrap(),
        action: "create",
        after_lines: 0,
        before_lines: 0,
    });

    // .project/modules.json
    plan.files.push(PlannedFile {
        rel_path: ".project/modules.json".to_string(),
        content: build_modules_json_v2(&STANDARD_LAYERS, &report.surfaces, mode),
        action: "rewrite",
        after_lines: 0,
        before_lines: 0,
    });

    // AGENTS.md
    plan.files.push(PlannedFile {
        rel_path: "AGENTS.md".to_string(),
        content: build_agents_md_v2(mode),
        action: "create",
        after_lines: 0,
        before_lines: 0,
    });
}

/// Scaffold mode controls how aggressive the refactor is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScaffoldMode {
    /// Skeleton: create the modular structure + stubs, preserve original
    /// main.lua as `scripts/legacy/main.lua`. Game stays runnable.
    Skeleton,
    /// Split: extract functions into per-layer files (risky for shared state).
    Split,
}

impl ScaffoldMode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "skeleton" => ScaffoldMode::Skeleton,
            "split" => ScaffoldMode::Split,
            _ => ScaffoldMode::Split, // default
        }
    }
}

fn build_layer_init(layer: &str, modules: &[String]) -> String {
    let pascal = to_pascal_case(layer);
    let requires = modules
        .iter()
        .map(|module| format!("require \"{module}\"\n"))
        .collect::<String>();
    format!(
        "-- scripts/{layer}/init.lua — {layer} module entry (auto-generated)\n\
		 -- TapTap lifecycle: Start()/Stop() + SubscribeToEvent for updates.\n\
		 {requires}\
		 \n\
		 local {pascal} = {{}}\n\
		 \n\
		 function {pascal}.start()\n\
		     -- TODO: initialize {layer} layer\n\
		 end\n\
		 \n\
		 function {pascal}.update(dt)\n\
		     -- TODO: update {layer} layer\n\
		 end\n\
		 \n\
		 function {pascal}.stop()\n\
		     -- TODO: shutdown {layer} layer\n\
		 end\n\
		 \n\
		 return {pascal}\n",
        layer = layer,
        pascal = pascal,
    )
}

fn build_event_bus() -> &'static str {
    "-- scripts/lib/event.lua — event bus (cross-layer comms)\n\
	 local Event = {}\n\
	 Event.__index = Event\n\
	 \n\
	 function Event.new()\n\
	     return setmetatable({ listeners = {} }, Event)\n\
	 end\n\
	 \n\
	 function Event:on(event, handler)\n\
	     self.listeners[event] = self.listeners[event] or {}\n\
	     table.insert(self.listeners[event], handler)\n\
	     return self\n\
	 end\n\
	 \n\
	 function Event:emit(event, ...)\n\
	     local handlers = self.listeners[event]\n\
	     if not handlers then return end\n\
	     for i = 1, #handlers do handlers[i](...) end\n\
	 end\n\
	 \n\
	 local bus = Event.new()\n\
	 return { new = Event.new, global = bus }\n"
}

fn build_class() -> &'static str {
    "-- scripts/lib/class.lua — OOP helper\n\
	 local function new(base)\n\
	     local cls = {}\n\
	     cls.__index = cls\n\
	     if base then setmetatable(cls, { __index = base }) end\n\
	     function cls.new(...)\n\
	         local self = setmetatable({}, cls)\n\
	         if self.init then self:init(...) end\n\
	         return self\n\
	     end\n\
	     return cls\n\
	 end\n\
	 \n\
	 return { new = new }\n"
}

fn build_state_stub() -> String {
    "-- scripts/state.lua — shared state hub (auto-generated stub)\n\
	 -- \n\
	 -- This module centralizes cross-module state that was previously held in\n\
	 -- module-level `local` variables in the original single-file main.lua.\n\
	 -- Each module requires this file and reads/writes via State.get / State.set.\n\
	 -- \n\
	 -- Manual fill-in: migrate shared locals from the original main.lua here.\n\
	 -- Example:\n\
	 --   State.scene_ = nil\n\
	 --   State.playerBody_ = nil\n\
	 --   State.gameState = 0\n\
	 \n\
	 local State = {}\n\
	 \n\
	 -- TODO: migrate shared locals here, e.g.:\n\
	 -- State.scene_ = nil\n\
	 -- State.physicsWorld_ = nil\n\
	 -- State.nvg_ = nil\n\
	 -- State.gameState = 0\n\
	 \n\
	 return State\n"
        .to_string()
}

fn build_bootstrap_v2(
    layers: &[&'static str],
    surfaces: &[SurfaceCandidate],
    mode: ScaffoldMode,
) -> String {
    // Only require layers that actually have functions.
    let mut requires = String::new();
    for layer in layers {
        let pascal = to_pascal_case(layer);
        requires.push_str(&format!(
            "local {pascal} = require \"scripts.{layer}.init\"\n",
            pascal = pascal,
            layer = layer,
        ));
    }

    // Surface requires (always, since surfaces are explicitly created).
    let mut surface_requires = String::new();
    for s in surfaces {
        let pascal = to_pascal_case(&s.id);
        surface_requires.push_str(&format!(
            "local {pascal} = require \"scripts.ui.surfaces.{id}.init\"\n",
            pascal = pascal,
            id = s.id,
        ));
    }

    // In skeleton mode, also require the preserved legacy main.
    // IMPORTANT: the original main.lua is a SCRIPT (not a module) — it does NOT
    // return a table. It defines GLOBAL functions `Start()` / `Stop()` and other
    // event handlers (HandleUpdate, HandleRender, etc.). So we `require` it for
    // its side effects (defining globals), then capture the global Start/Stop
    // references BEFORE main.lua overrides them with its thin entry wrapper.
    let legacy_require = if mode == ScaffoldMode::Skeleton {
        "\nrequire \"scripts.legacy.main\"\n\
		 local Legacy = { Start = Start, Stop = Stop, HandleUpdate = HandleUpdate }\n"
    } else {
        ""
    };

    // Build start() calls — only for layers that exist.
    let mut start_calls = String::new();
    for layer in layers {
        let pascal = to_pascal_case(layer);
        start_calls.push_str(&format!("    {pascal}.start()\n", pascal = pascal));
    }
    if mode == ScaffoldMode::Skeleton {
        start_calls.push_str("    Legacy.Start()\n");
    }

    let mut stop_calls = String::new();
    if mode == ScaffoldMode::Skeleton {
        stop_calls.push_str("    Legacy.Stop()\n");
    }
    // Stop in reverse order.
    for layer in layers.iter().rev() {
        let pascal = to_pascal_case(layer);
        stop_calls.push_str(&format!("    {pascal}.stop()\n", pascal = pascal));
    }
    let update_calls = layers
        .iter()
        .map(|layer| format!("    {}.update(dt)\n", to_pascal_case(layer)))
        .collect::<String>();
    let legacy_update = if mode == ScaffoldMode::Skeleton {
        "    if Legacy.HandleUpdate then Legacy.HandleUpdate(eventType, eventData) end\n"
    } else {
        ""
    };

    format!(
        "-- bootstrap.lua — module loader (auto-generated by refactor_to_modular)\n\
		 -- TapTap lifecycle: Start()/Stop() + SubscribeToEvent for updates.\n\
		 -- \n\
		 -- Only requires layers that have functions (avoids referencing\n\
		 -- non-existent scripts.gameplay.init / scripts.data.init).\n\
		 \n\
		 {requires}{surface_requires}{legacy_require}\n\
		 local Bootstrap = {{}}\n\
		 \n\
		 function Bootstrap.start()\n\
		 {start_calls}end\n\
		 \n\
		 function Bootstrap.update(eventType, eventData)\n\
		 {legacy_update}    local dt = eventData[\"TimeStep\"]:GetFloat()\n\
		 {update_calls}end\n\
		 \n\
		 function Bootstrap.stop()\n\
		 {stop_calls}end\n\
		 \n\
		 return Bootstrap\n",
        requires = requires,
        surface_requires = surface_requires,
        legacy_require = legacy_require,
        start_calls = start_calls,
        legacy_update = legacy_update,
        update_calls = update_calls,
        stop_calls = stop_calls,
    )
}

fn build_main_lua(mode: ScaffoldMode) -> String {
    if mode == ScaffoldMode::Skeleton {
        // Skeleton: thin entry that delegates to Bootstrap.start/stop.
        "-- main.lua — project entry (auto-generated, skeleton mode)\n\
		 -- TapTap lifecycle: Start() / Stop() + SubscribeToEvent.\n\
		 -- All deferred game logic is preserved in scripts/legacy/main.lua.\n\
		 \n\
		 local Bootstrap = require \"scripts.bootstrap\"\n\
		 \n\
		 function HandleUpdate(eventType, eventData)\n\
		     Bootstrap.update(eventType, eventData)\n\
		 end\n\
		 \n\
		 function Start()\n\
		     Bootstrap.start()\n\
		     SubscribeToEvent(\"Update\", \"HandleUpdate\")\n\
		 end\n\
		 \n\
		 function Stop()\n\
		     Bootstrap.stop()\n\
		 end\n"
            .to_string()
    } else {
        // Split: pure lifecycle stub (game logic lives in layer modules).
        "-- main.lua — project entry (auto-generated, split mode)\n\
		 -- TapTap lifecycle: Start() / Stop() + SubscribeToEvent.\n\
		 -- All game logic lives in scripts/ submodules.\n\
		 \n\
		 local Bootstrap = require \"scripts.bootstrap\"\n\
		 \n\
		 function HandleUpdate(eventType, eventData)\n\
		     Bootstrap.update(eventType, eventData)\n\
		 end\n\
		 \n\
		 function Start()\n\
		     Bootstrap.start()\n\
		     SubscribeToEvent(\"Update\", \"HandleUpdate\")\n\
		 end\n\
		 \n\
		 function Stop()\n\
		     Bootstrap.stop()\n\
		 end\n"
            .to_string()
    }
}

fn build_modules_json_v2(
    layers: &[&'static str],
    surfaces: &[SurfaceCandidate],
    mode: ScaffoldMode,
) -> String {
    let modules: Vec<Value> = layers
        .iter()
        .map(|l| {
            json!({
                "path": format!("scripts/{l}"),
                "entry": "init.lua",
                "layer": l,
            })
        })
        .collect();
    let surface_ids: Vec<Value> = surfaces.iter().map(|s| json!(s.id)).collect();
    let mode_str = match mode {
        ScaffoldMode::Skeleton => "skeleton",
        ScaffoldMode::Split => "split",
    };
    let body = json!({
        "structure": "modular",
        "engine": "taptap",
        "mode": mode_str,
        "modules": modules,
        "surfaces": surface_ids,
        "dependency_direction": "lib <- data <- systems <- {ui, gameplay}",
        "lifecycle": "Start/Stop + SubscribeToEvent",
        "max_file_lines": 500,
        "main_lua_max_lines": 50,
    });
    serde_json::to_string_pretty(&body).unwrap()
}

fn build_agents_md_v2(mode: ScaffoldMode) -> String {
    let mode_str = match mode {
        ScaffoldMode::Skeleton => "skeleton",
        ScaffoldMode::Split => "split",
    };
    format!(
        "# Refactored Project — Agent Strategy (modular, {mode_str} mode)\n\
		 \n\
		 ## Module Structure\n\
		 - Entry: scripts/main.lua (Start/Stop lifecycle only)\n\
		 - Loader: scripts/bootstrap.lua\n\
		 - Layers: scripts/ui/, scripts/systems/, scripts/gameplay/, scripts/data/, scripts/lib/\n\
		 - Surfaces: scripts/ui/surfaces/<id>/ (independent previewable UI units)\n\
		 - State: scripts/state.lua (shared state hub)\n\
		 \n\
		 ## TapTap Engine Lifecycle\n\
		 - Entry: `function Start()` — called once on engine start\n\
		 - Exit: `function Stop()` — called once on engine stop\n\
		 - Update: `SubscribeToEvent(\"Update\", \"HandleUpdate\")` — per-frame\n\
		 - Render: `SubscribeToEvent(\"NanoVGRender\", \"HandleRender\")` — per-frame\n\
		 - Do NOT use `init/update/exit` — TapTap does not recognize them.\n\
		 \n\
		 ## Dependency Direction (enforced)\n\
		 - lib <- all modules\n\
		 - data <- ui, systems, gameplay\n\
		 - systems <- ui, gameplay\n\
		 - gameplay -> ui via event bus (scripts/lib/event.lua) only\n\
		 \n\
		 ## Shared State\n\
		 - Cross-module state lives in scripts/state.lua (not module-level `local`).\n\
		 - Each module does `local State = require \"scripts.state\"` then\n\
		   reads/writes `State.<var>`.\n\
		 - This preserves the closure-shared state pattern from single-file Lua.\n\
		 \n\
		 ## Surface Development Rules\n\
		 1. New UI screens MUST be created as scripts/ui/surfaces/<id>/ directories.\n\
		 2. Surface directories contain init.lua + view.lua + state.lua + style.lua.\n\
		 3. Surfaces communicate via scripts/lib/event.lua, never direct require.\n\
		 4. Surface assets live under assets/textures/surfaces/<id>/.\n\
		 \n\
		 ## Agent Rules\n\
		 1. Add new logic to the appropriate layer; never put business logic in main.lua.\n\
		 2. Single file > 500 lines must be split.\n\
		 3. Cross-layer comms use the event bus, not direct require.\n\
		 4. Run project.validate before declaring done.\n",
        mode_str = mode_str,
    )
}

// ============================================================
// Shared helpers
// ============================================================

/// Convert snake/kebab/space case to PascalCase.
pub(crate) fn to_pascal_case(s: &str) -> String {
    let mut out = String::new();
    let mut up = true;
    for ch in s.chars() {
        if ch == '_' || ch == '-' || ch == ' ' {
            up = true;
        } else if up {
            out.push(ch.to_ascii_uppercase());
            up = false;
        } else {
            out.push(ch);
        }
    }
    out
}
