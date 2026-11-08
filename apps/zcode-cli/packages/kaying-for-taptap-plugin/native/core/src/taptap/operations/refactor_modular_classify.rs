//! Function classification for `project.refactor_to_modular`.
//!
//! Decides which modular layer (`ui` / `systems` / `gameplay` / `data` / `lib`)
//! a top-level Lua function belongs to, based on its name and body keywords.

use crate::taptap::operations::refactor_lua::LuaFunction;

/// The five canonical modular layers.
pub const LAYERS: &[&str] = &["ui", "systems", "gameplay", "data", "lib"];

/// A function that has been classified into a modular layer.
#[derive(Debug, Clone)]
pub struct ClassifiedFunction {
    /// Original function (name, range, params, etc.).
    pub func: LuaFunction,
    /// Target modular layer (one of [`LAYERS`]).
    pub layer: &'static str,
    /// Confidence score in [0.0, 1.0]. Higher = more confident.
    pub score: f32,
    /// Reason for the classification (used for the report).
    pub reason: String,
}

/// Classify a single function into a modular layer.
///
/// Strategy:
/// 1. Strong name-prefix match (e.g. `draw_` → ui).
/// 2. Body keyword density (e.g. `Save()` / `Load()` calls → data).
/// 3. Fallback to `lib` (general utilities).
pub fn classify_function(func: &LuaFunction) -> ClassifiedFunction {
    let name = func.name.to_lowercase();
    let body = func_body_text(func).to_lowercase();
    let mut best_layer = "lib";
    let mut best_score = 0.2f32;
    let mut best_reason = "fallback: no strong signal".to_string();

    for (layer, score, reason) in score_by_name_prefix(&name, &body) {
        if score > best_score {
            best_layer = layer;
            best_score = score;
            best_reason = reason;
        }
    }

    for (layer, score, reason) in score_by_body_keywords(&body) {
        if score > best_score {
            best_layer = layer;
            best_score = score;
            best_reason = reason;
        }
    }

    ClassifiedFunction {
        func: func.clone(),
        layer: best_layer,
        score: best_score,
        reason: best_reason,
    }
}

/// Classify a slice of functions and group them by layer.
pub fn group_by_layer(funcs: &[LuaFunction]) -> Vec<(&'static str, Vec<ClassifiedFunction>)> {
    let mut groups: Vec<(&'static str, Vec<ClassifiedFunction>)> =
        LAYERS.iter().map(|l| (*l, Vec::new())).collect();
    for f in funcs {
        let classified = classify_function(f);
        if let Some(entry) = groups.iter_mut().find(|(l, _)| *l == classified.layer) {
            entry.1.push(classified);
        }
    }
    groups
}

fn func_body_text(func: &LuaFunction) -> String {
    // We don't have the original source here; the caller passes the function
    // table which only contains offsets. For classification we approximate by
    // examining the function name (already done) and the params field, which
    // often reveals intent (e.g. `event` → event bus user).
    format!("{} {}", func.name, func.params)
}

fn score_by_name_prefix(name: &str, _body: &str) -> Vec<(&'static str, f32, String)> {
    let mut out = Vec::new();

    // UI layer
    let ui_prefixes = [
        "ui_", "draw_", "render_", "show_", "hide_", "button_", "text_", "widget_", "canvas_",
        "image_", "label_", "panel_", "dialog_", "menu_", "hud_",
    ];
    if ui_prefixes.iter().any(|p| name.starts_with(p)) {
        out.push(("ui", 0.85, "name prefix matches ui".to_string()));
    }

    // Systems layer
    let sys_prefixes = [
        "update_", "tick_", "physics_", "input_", "audio_", "scene_", "time_", "camera_", "spawn_",
        "tick", "update",
    ];
    if sys_prefixes.iter().any(|p| name.starts_with(p)) {
        out.push(("systems", 0.8, "name prefix matches systems".to_string()));
    }

    // Gameplay layer
    let gp_prefixes = [
        "player_",
        "enemy_",
        "combat_",
        "attack_",
        "game_",
        "state_",
        "ai_",
        "skill_",
        "level_",
        "quest_",
        "dialogue_",
        "npc_",
    ];
    if gp_prefixes.iter().any(|p| name.starts_with(p)) {
        out.push(("gameplay", 0.8, "name prefix matches gameplay".to_string()));
    }

    // Data layer
    let data_prefixes = [
        "save_",
        "load_",
        "config_",
        "setting_",
        "inventory_",
        "item_",
        "shop_",
        "i18n_",
        "locale_",
        "data_",
    ];
    if data_prefixes.iter().any(|p| name.starts_with(p)) {
        out.push(("data", 0.8, "name prefix matches data".to_string()));
    }

    // Lib layer
    let lib_prefixes = ["util_", "helper_", "common_", "math_", "string_", "table_"];
    if lib_prefixes.iter().any(|p| name.starts_with(p)) {
        out.push(("lib", 0.7, "name prefix matches lib".to_string()));
    }

    out
}

fn score_by_body_keywords(body: &str) -> Vec<(&'static str, f32, String)> {
    let mut out = Vec::new();

    let ui_kw = [
        "set_text",
        "set_image",
        "create_button",
        "ui.create",
        "widget",
    ];
    let ui_hits = ui_kw.iter().filter(|k| body.contains(*k)).count();
    if ui_hits > 0 {
        out.push((
            "ui",
            0.5 + 0.1 * ui_hits as f32,
            format!("body keyword: {ui_hits} ui hit(s)"),
        ));
    }

    let data_kw = [
        "Save(",
        "Load(",
        "write_file",
        "read_file",
        "json.encode",
        "json.decode",
    ];
    let data_hits = data_kw.iter().filter(|k| body.contains(*k)).count();
    if data_hits > 0 {
        out.push((
            "data",
            0.5 + 0.1 * data_hits as f32,
            format!("body keyword: {data_hits} data hit(s)"),
        ));
    }

    let sys_kw = ["SetGravity", "Raycast", "SetTimeScale", "GetFrameRate"];
    let sys_hits = sys_kw.iter().filter(|k| body.contains(*k)).count();
    if sys_hits > 0 {
        out.push((
            "systems",
            0.5 + 0.1 * sys_hits as f32,
            format!("body keyword: {sys_hits} systems hit(s)"),
        ));
    }

    out
}
