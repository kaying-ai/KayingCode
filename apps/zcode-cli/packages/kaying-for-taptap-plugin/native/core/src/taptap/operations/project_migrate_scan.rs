//! Surface candidate scanning and heuristic source splitting for v1->v2 migration.
//!
//! Extracted from `project_migrate` to keep file sizes under 500 lines.

use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};

/// Heuristic rules for detecting Surface candidates (mirrors
/// `scene-discovery.ts` CANDIDATE_RULES). Each rule is a list of lowercase
/// substrings; if any matches the file name + content, the candidate fires.
pub const CANDIDATE_RULES: &[(&str, &str, &[&str])] = &[
    (
        "main_menu",
        "主菜单",
        &["main_menu", "mainmenu", "menu_screen", "mainmenu"],
    ),
    (
        "gameplay_hud",
        "游戏 HUD",
        &["hud", "game_ui", "gamehud", "gameplayhud"],
    ),
    (
        "result_panel",
        "结算界面",
        &["result", "game_over", "gameover", "complete", "score_panel"],
    ),
    ("pause", "暂停界面", &["pause"]),
    (
        "settings",
        "设置界面",
        &["settings", "options", "config_ui"],
    ),
];

/// A detected Surface candidate from scanning legacy UI files.
pub struct SurfaceCandidate {
    pub id: String,
    pub label: String,
    pub source_file: String,
    pub confidence: f64,
}

/// Scan `scripts/ui/*.lua` (top-level, excluding init.lua) for Surface candidates.
pub fn scan_surface_candidates(ui_dir: &Path) -> Vec<SurfaceCandidate> {
    let mut candidates: Vec<SurfaceCandidate> = Vec::new();
    if !ui_dir.is_dir() {
        return candidates;
    }

    let mut lua_files: Vec<PathBuf> = Vec::new();
    collect_lua_files_top_level(ui_dir, &mut lua_files);

    for file_path in &lua_files {
        let file_name = file_path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let content = fs::read_to_string(file_path).unwrap_or_default();
        let combined = format!("{file_name}\n{}", content.to_lowercase());

        for (id, label, needles) in CANDIDATE_RULES {
            let matched = needles.iter().any(|needle| combined.contains(needle));
            if matched && !candidates.iter().any(|c| c.id == *id) {
                let confidence = if content.contains("Show") || content.contains("Render") {
                    0.82
                } else {
                    0.68
                };
                candidates.push(SurfaceCandidate {
                    id: id.to_string(),
                    label: label.to_string(),
                    source_file: file_path.to_string_lossy().to_string(),
                    confidence,
                });
            }
        }
    }
    candidates
}

/// Collect top-level `.lua` files under `dir` (excluding `init.lua` and subdirs).
pub fn collect_lua_files_top_level(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("lua") {
            if path.file_name().and_then(|n| n.to_str()) == Some("init.lua") {
                continue;
            }
            out.push(path);
        }
    }
}

/// Split a legacy UI file's content into view/state/style bodies (heuristic).
///
/// - Drawing calls (nvg/UI./draw/rect/text) -> view
/// - Color/size constants -> style
/// - `local <name> = <literal>` -> state
pub fn heuristic_split_surface(content: &str, surface_id: &str) -> (String, String, String) {
    let pascal = surface_pascal(surface_id);
    let mut view_lines: Vec<String> = Vec::new();
    let mut state_lines: Vec<String> = Vec::new();
    let mut style_lines: Vec<String> = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("--") {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if lower.contains("nvg")
            || lower.contains("ui.")
            || lower.contains("draw")
            || lower.contains("rect")
            || lower.contains("text")
        {
            view_lines.push(line.to_string());
        } else if lower.contains("r =")
            || lower.contains("g =")
            || lower.contains("b =")
            || lower.contains("width")
            || lower.contains("height")
            || lower.contains("size")
            || lower.contains("color")
        {
            style_lines.push(line.to_string());
        } else if trimmed.starts_with("local ") {
            state_lines.push(line.to_string());
        } else {
            view_lines.push(line.to_string());
        }
    }

    let view = format!(
        "-- scripts/ui/surfaces/{surface_id}/view.lua (migrated)\n\
		 local {pascal}View = {{}}\n\
		 \n\
		 function {pascal}View.build(style)\n\
		 \t-- Migrated UI construction code:\n\
		 {}\n\
		 \treturn {{}}\n\
		 end\n\
		 \n\
		 return {pascal}View\n",
        view_lines
            .iter()
            .map(|l| format!("\t{l}"))
            .collect::<Vec<_>>()
            .join("\n")
    );

    let state = format!(
        "-- scripts/ui/surfaces/{surface_id}/state.lua (migrated)\n\
		 local State = {{}}\n\
		 local data = {{}}\n\
		 \n\
		 function State.reset() data = {{}} end\n\
		 function State.get(key) return data[key] end\n\
		 function State.set(key, value) data[key] = value end\n\
		 \n\
		 -- Migrated state declarations:\n\
		 {}\n\
		 \n\
		 return State\n",
        state_lines
            .iter()
            .map(|l| format!("\t{l}"))
            .collect::<Vec<_>>()
            .join("\n")
    );

    let style = format!(
        "-- scripts/ui/surfaces/{surface_id}/style.lua (migrated)\n\
		 local Style = {{}}\n\
		 \n\
		 -- Migrated style constants:\n\
		 {}\n\
		 \n\
		 return Style\n",
        style_lines
            .iter()
            .map(|l| format!("\t{l}"))
            .collect::<Vec<_>>()
            .join("\n")
    );

    (view, state, style)
}

/// Build the Surface init.lua content (create/destroy/handleInput contract).
pub fn build_surface_init(surface_id: &str) -> String {
    let pascal = surface_pascal(surface_id);
    format!(
        "-- scripts/ui/surfaces/{surface_id}/init.lua (migrated)\n\
		 local View = require \"scripts.ui.surfaces.{surface_id}.view\"\n\
		 local State = require \"scripts.ui.surfaces.{surface_id}.state\"\n\
		 local Style = require \"scripts.ui.surfaces.{surface_id}.style\"\n\
		 \n\
		 local {pascal} = {{}}\n\
		 \n\
		 function {pascal}.create()\n\
		 \tState.reset()\n\
		 \treturn View.build(Style)\n\
		 end\n\
		 \n\
		 function {pascal}.destroy()\n\
		 \tState.reset()\n\
		 end\n\
		 \n\
		 function {pascal}.handleInput(x, y, pressed)\n\
		 end\n\
		 \n\
		 return {pascal}\n"
    )
}

/// Build a multi-surface manifest for `.project/surfaces.json`.
pub fn build_multi_surface_manifest(surface_ids: &[String], engine: &str, active: &str) -> Value {
    let surfaces: Vec<Value> = surface_ids
		.iter()
		.map(|id| {
			json!({
				"id": id,
				"label": id,
				"module": format!("scripts/ui/surfaces/{id}"),
				"entry": "init.lua",
				"backend": "static-ui",
				"default": id == active,
				"initialState": {},
				"symbols": [format!("{}.create", surface_pascal(id)), format!("{}.destroy", surface_pascal(id))],
				"assets": [format!("assets/textures/surfaces/{id}/")],
				"transitions": []
			})
		})
		.collect();
    json!({
        "version": 1,
        "engine": engine,
        "surfaces": surfaces,
        "activeSurface": active
    })
}

/// Convert a surface id (snake_case) to PascalCase for the module identifier.
pub fn surface_pascal(surface_id: &str) -> String {
    surface_id
        .split('_')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_surface_pascal_converts_snake_case() {
        assert_eq!(surface_pascal("main_menu"), "MainMenu");
        assert_eq!(surface_pascal("gameplay_hud"), "GameplayHud");
        assert_eq!(surface_pascal("result"), "Result");
    }

    #[test]
    fn test_heuristic_split_separates_view_state_style() {
        let content = "local score = 0\nlocal color = { r = 0.2, g = 0.6, b = 1.0 }\nUI.SetRoot(\"panel\")\nnvg.beginPath()\n";
        let (view, state, style) = heuristic_split_surface(content, "test");
        assert!(view.contains("UI.SetRoot"));
        assert!(view.contains("nvg.beginPath"));
        assert!(state.contains("local score"));
        assert!(style.contains("color"));
    }

    #[test]
    fn test_build_surface_init_has_contract() {
        let init = build_surface_init("main_menu");
        assert!(init.contains(".create"));
        assert!(init.contains(".destroy"));
        assert!(init.contains(".handleInput"));
    }

    #[test]
    fn test_build_multi_surface_manifest() {
        let manifest = build_multi_surface_manifest(
            &["main_menu".to_string(), "pause".to_string()],
            "taptap",
            "main_menu",
        );
        let surfaces = manifest["surfaces"].as_array().unwrap();
        assert_eq!(surfaces.len(), 2);
        assert_eq!(surfaces[0]["default"], true);
        assert_eq!(surfaces[1]["default"], false);
        assert_eq!(manifest["activeSurface"], "main_menu");
    }
}
