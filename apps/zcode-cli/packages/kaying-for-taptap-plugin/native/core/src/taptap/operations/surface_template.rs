//! Surface module directory scaffolding — 5 built-in templates.
//!
//! Per `dev.v5.plan.md` §4.4 (I3) each Surface is
//! `scripts/ui/surfaces/<id>/` with `init.lua` + `view.lua` + `state.lua` +
//! `style.lua`. Templates: `main_menu` / `gameplay_hud` / `result_panel` /
//! `pause` / `blank`.

use serde_json::{Value, json};
use std::fs;
use std::path::Path;

use super::project_migrate_scan::surface_pascal;

/// Label overrides per template id.
fn template_label(template: &str, surface_id: &str) -> String {
    match template {
        "main_menu" => "主菜单",
        "gameplay_hud" => "游戏 HUD",
        "result_panel" => "结算界面",
        "pause" => "暂停界面",
        "blank" => surface_id,
        _ => surface_id,
    }
    .to_string()
}

/// Is `template` a recognized built-in template id?
pub fn is_valid_template(template: &str) -> bool {
    matches!(
        template,
        "main_menu" | "gameplay_hud" | "result_panel" | "pause" | "blank"
    )
}

/// Return the known template ids (for error messages / discovery).
pub fn template_ids() -> &'static [&'static str] {
    &[
        "main_menu",
        "gameplay_hud",
        "result_panel",
        "pause",
        "blank",
    ]
}

/// Build the four Lua file contents for a Surface, then write them to
/// `scripts/ui/surfaces/<id>/`. Returns the module path (relative).
pub fn create_surface_skeleton(
    root: &Path,
    surface_id: &str,
    template: &str,
) -> Result<String, std::io::Error> {
    if !is_valid_template(template) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!(
                "Invalid template '{template}'; valid: {}",
                template_ids().join(", ")
            ),
        ));
    }
    let pascal = surface_pascal(surface_id);
    let module = format!("scripts/ui/surfaces/{surface_id}");
    let dir = root.join(&module);
    fs::create_dir_all(&dir)?;

    let view_body = view_body(template, &pascal);
    let state_body = state_body(template, &pascal);
    let style_body = style_body(template);

    fs::write(dir.join("init.lua"), init_lua(&pascal, surface_id))?;
    fs::write(dir.join("view.lua"), view_lua(&pascal, &view_body))?;
    fs::write(dir.join("state.lua"), state_lua(&state_body))?;
    fs::write(dir.join("style.lua"), style_lua(&style_body))?;

    Ok(module)
}

/// Build a manifest Surface entry for a freshly-created surface.
pub fn surface_entry(surface_id: &str, template: &str, default: bool) -> Value {
    let pascal = surface_pascal(surface_id);
    json!({
        "id": surface_id,
        "label": template_label(template, surface_id),
        "module": format!("scripts/ui/surfaces/{surface_id}"),
        "entry": "init.lua",
        "backend": "static-ui",
        "default": default,
        "initialState": {},
        "symbols": [format!("{pascal}.create"), format!("{pascal}.destroy")],
        "assets": [format!("assets/textures/surfaces/{surface_id}/")],
        "transitions": []
    })
}

// ============================================================
// Template bodies
// ============================================================

fn view_body(template: &str, _pascal: &str) -> String {
    let title = match template {
        "main_menu" => "标题",
        "gameplay_hud" => "分数",
        "result_panel" => "结算",
        _ => "面板",
    };
    format!(
        "\tlocal panel = {{}}\n\
		 \t-- {title}\n\
		 \treturn panel"
    )
}

fn state_body(template: &str, _pascal: &str) -> String {
    let key = match template {
        "gameplay_hud" => "score",
        _ => "value",
    };
    format!(
        "\tdata.{} = 0\n\
		 \treturn State",
        key
    )
}

fn style_body(template: &str) -> String {
    match template {
        "gameplay_hud" => "\tStyle.color = { 0.9, 0.9, 0.95 }\n\tStyle.fontSize = 18",
        _ => "\tStyle.color = { 1, 1, 1 }\n\tStyle.fontSize = 16",
    }
    .to_string()
}

// ============================================================
// File renderers
// ============================================================

fn init_lua(pascal: &str, surface_id: &str) -> String {
    format!(
        "-- scripts/ui/surfaces/{surface_id}/init.lua\n\
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
		 \t-- 转发到 view 命中检测\n\
		 end\n\
		 \n\
		 return {pascal}\n"
    )
}

fn view_lua(pascal: &str, body: &str) -> String {
    format!(
        "-- view.lua — UI 元素构造\n\
		 local {pascal}View = {{}}\n\
		 \n\
		 function {pascal}View.build(style)\n\
		 {body}\n\
		 end\n\
		 \n\
		 return {pascal}View\n"
    )
}

fn state_lua(body: &str) -> String {
    format!(
        "-- state.lua — Surface 局部状态\n\
		 local State = {{}}\n\
		 local data = {{}}\n\
		 \n\
		 function State.reset() data = {{}} end\n\
		 function State.get(key) return data[key] end\n\
		 function State.set(key, value) data[key] = value end\n\
		 \n\
		 {body}\n"
    )
}

fn style_lua(body: &str) -> String {
    format!(
        "-- style.lua — 样式常量\n\
		 local Style = {{}}\n\
		 \n\
		 {body}\n\
		 \n\
		 return Style\n"
    )
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_is_valid_template() {
        assert!(is_valid_template("main_menu"));
        assert!(is_valid_template("blank"));
        assert!(!is_valid_template("bogus"));
    }

    #[test]
    fn test_create_skeleton_writes_four_files() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        let module = create_surface_skeleton(root, "main_menu", "main_menu").unwrap();
        assert_eq!(module, "scripts/ui/surfaces/main_menu");
        let dir = root.join(&module);
        assert!(dir.join("init.lua").exists());
        assert!(dir.join("view.lua").exists());
        assert!(dir.join("state.lua").exists());
        assert!(dir.join("style.lua").exists());
        let init = fs::read_to_string(dir.join("init.lua")).unwrap();
        assert!(init.contains(".create"));
        assert!(init.contains(".destroy"));
    }

    #[test]
    fn test_create_skeleton_rejects_unknown_template() {
        let temp = tempdir().unwrap();
        let err = create_surface_skeleton(temp.path(), "x", "nope");
        assert!(err.is_err());
    }

    #[test]
    fn test_surface_entry_default_flag() {
        let e = surface_entry("pause", "pause", true);
        assert_eq!(e["id"], "pause");
        assert_eq!(e["default"], true);
        assert_eq!(e["label"], "暂停界面");
        assert_eq!(e["symbols"][0], "Pause.create");
    }

    #[test]
    fn test_state_lua_has_reset_get_set() {
        let state = state_lua("\tdata.score = 0");
        assert!(state.contains("function State.reset"));
        assert!(state.contains("function State.get"));
        assert!(state.contains("function State.set"));
    }
}
