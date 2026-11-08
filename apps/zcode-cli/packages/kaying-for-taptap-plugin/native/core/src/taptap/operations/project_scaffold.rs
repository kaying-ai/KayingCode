//! Modular scaffold generation (template=modular).
//!
//! Single implementation: generates the complete modular scaffold — shared
//! structure (entries, module layers, lib infrastructure) plus Surface
//! directories and the `.project/surfaces.json` manifest.

use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tracing::info;

/// Default Surface created by the modular scaffold.
const DEFAULT_SURFACE_ID: &str = "main_menu";

/// Lua module layer descriptor.
const MODULE_LAYERS: &[(&str, &str)] = &[
    ("ui", "UI 模块（界面、HUD、控件）"),
    ("systems", "系统模块（输入、物理、音频、场景流转）"),
    ("gameplay", "玩法模块（玩家、敌人、生成、状态机）"),
    ("data", "数据模块（存档、配置、关卡、物品表）"),
    ("lib", "工具库（OOP、事件总线、计时器，叶子节点）"),
];

/// Generate the modular scaffold under `root`.
///
/// Creates directories, entry scripts, module init.lua files, AGENTS.md,
/// and `.project/modules.json`. Existing files are preserved (skip-if-exists
/// for entry scripts; directories are create_dir_all).
fn generate_base_scaffold(
    root: &Path,
    project_name: &str,
    engine_version: &str,
) -> Result<Value, std::io::Error> {
    let mut created_files: Vec<String> = Vec::new();
    let mut skipped_files: Vec<String> = Vec::new();

    // --- 1. scripts/ entry files ---
    let scripts_dir = root.join("scripts");
    fs::create_dir_all(&scripts_dir)?;

    let main_lua = scripts_dir.join("main.lua");
    if !main_lua.exists() {
        fs::write(&main_lua, main_lua_template())?;
        created_files.push("scripts/main.lua".to_string());
    } else {
        skipped_files.push("scripts/main.lua".to_string());
    }

    let bootstrap_lua = scripts_dir.join("bootstrap.lua");
    if !bootstrap_lua.exists() {
        fs::write(&bootstrap_lua, bootstrap_template())?;
        created_files.push("scripts/bootstrap.lua".to_string());
    } else {
        skipped_files.push("scripts/bootstrap.lua".to_string());
    }

    // --- 2. config/ ---
    let config_dir = scripts_dir.join("config");
    fs::create_dir_all(&config_dir)?;
    let game_config = config_dir.join("game.config.lua");
    if !game_config.exists() {
        fs::write(&game_config, game_config_template(project_name))?;
        created_files.push("scripts/config/game.config.lua".to_string());
    }

    // --- 3. module layers (ui/systems/gameplay/data/lib) ---
    for (layer, _desc) in MODULE_LAYERS {
        let layer_dir = scripts_dir.join(layer);
        fs::create_dir_all(&layer_dir)?;
        let init_lua = layer_dir.join("init.lua");
        if !init_lua.exists() {
            fs::write(&init_lua, module_init_template(layer))?;
            created_files.push(format!("scripts/{layer}/init.lua"));
        } else {
            skipped_files.push(format!("scripts/{layer}/init.lua"));
        }
        // lib/event.lua 是关键基础设施，预生成
        if *layer == "lib" {
            let event_lua = layer_dir.join("event.lua");
            if !event_lua.exists() {
                fs::write(&event_lua, event_bus_template())?;
                created_files.push("scripts/lib/event.lua".to_string());
            }
            let class_lua = layer_dir.join("class.lua");
            if !class_lua.exists() {
                fs::write(&class_lua, class_template())?;
                created_files.push("scripts/lib/class.lua".to_string());
            }
        }
    }

    // --- 4. widgets/ 子目录（UI 可复用控件） ---
    let widgets_dir = scripts_dir.join("ui").join("widgets");
    fs::create_dir_all(&widgets_dir)?;

    // --- 5. scenes/ ---
    let scenes_dir = root.join("scenes");
    fs::create_dir_all(&scenes_dir)?;

    // --- 6. assets/ 子目录 ---
    for kind in &["textures", "audio", "fonts", "shaders"] {
        fs::create_dir_all(root.join("assets").join(kind))?;
    }

    // --- 8. .project/modules.json ---
    // Ensure .project/ exists (project_init creates it, but scaffold may run standalone)
    fs::create_dir_all(root.join(".project"))?;
    let modules_json = root.join(".project").join("modules.json");
    fs::write(
        &modules_json,
        serde_json::to_string_pretty(&modules_json_manifest()).unwrap(),
    )?;
    created_files.push(".project/modules.json".to_string());

    // --- 9. tests/ (optional, empty) ---
    let tests_dir = root.join("tests");
    fs::create_dir_all(&tests_dir)?;

    info!(
        project_root = %root.display(),
        project_name = %project_name,
        engine_version = %engine_version,
        created = created_files.len(),
        skipped = skipped_files.len(),
        "Modular scaffold generated"
    );

    Ok(json!({
        "structure": "modular",
        "project_name": project_name,
        "engine_version": engine_version,
        "created_files": created_files,
        "skipped_files": skipped_files,
        "module_layers": MODULE_LAYERS.iter().map(|(l, d)| {
            json!({"layer": l, "description": d})
        }).collect::<Vec<_>>(),
        "dependency_direction": "lib ← data ← systems ← {ui, gameplay}",
        "max_file_lines": 500,
        "main_lua_max_lines": 50
    }))
}

/// Return the manifest for `.project/modules.json`.
fn modules_json_manifest() -> Value {
    json!({
        "structure": "modular",
        "modules": MODULE_LAYERS.iter().map(|(layer, _)| {
            json!({
                "path": format!("scripts/{layer}"),
                "entry": "init.lua",
                "layer": layer
            })
        }).collect::<Vec<_>>(),
        "dependency_direction": "lib ← data ← systems ← {ui, gameplay}",
        "max_file_lines": 500,
        "main_lua_max_lines": 50
    })
}

// ============================================================
// Lua / Markdown templates
// ============================================================

fn main_lua_template() -> &'static str {
    "-- main.lua — 项目入口，仅负责 lifecycle 转发\n\
	 -- 禁止在此文件实现游戏逻辑；所有逻辑放入 scripts/ 子模块。\n\
	 \n\
	 local Bootstrap = require \"scripts.bootstrap\"\n\
	 \n\
	 function HandleUpdate(eventType, eventData)\n\
	 \tBootstrap.update(eventData[\"TimeStep\"]:GetFloat())\n\
	 end\n\
	 \n\
	 function Start()\n\
	 \tBootstrap.start()\n\
	 \tSubscribeToEvent(\"Update\", \"HandleUpdate\")\n\
	 end\n\
	 \n\
	 function Stop()\n\
	 \tBootstrap.stop()\n\
	 end\n"
}

fn bootstrap_template() -> &'static str {
    "-- bootstrap.lua — 模块加载与依赖注入\n\
	 -- 初始化顺序：data → systems → gameplay → ui（依赖正序）\n\
	 -- 销毁顺序：ui → gameplay → systems → data（逆序）\n\
	 \n\
	 local UI = require \"scripts.ui.init\"\n\
	 local Systems = require \"scripts.systems.init\"\n\
	 local Gameplay = require \"scripts.gameplay.init\"\n\
	 local Data = require \"scripts.data.init\"\n\
	 \n\
	 local Bootstrap = {}\n\
	 \n\
	 function Bootstrap.start()\n\
	 \tData.start()\n\
	 \tSystems.start()\n\
	 \tGameplay.start()\n\
	 \tUI.start()\n\
	 end\n\
	 \n\
	 function Bootstrap.update(dt)\n\
	 \tSystems.update(dt)\n\
	 \tGameplay.update(dt)\n\
	 \tUI.update(dt)\n\
	 end\n\
	 \n\
	 function Bootstrap.stop()\n\
	 \tUI.stop()\n\
	 \tGameplay.stop()\n\
	 \tSystems.stop()\n\
	 \tData.stop()\n\
	 end\n\
	 \n\
	 return Bootstrap\n"
}

fn game_config_template(project_name: &str) -> String {
    format!(
        "-- game.config.lua — 全局常量\n\
		-- 项目：{project_name}\n\
		\n\
		local Config = {{\n\
		\t-- 渲染\n\
		\tdesign_width = 1280,\n\
		\tdesign_height = 720,\n\
		\ttarget_framerate = 60,\n\
		\n\
		\t-- 物理\n\
		\tgravity = {{ x = 0, y = -9.8 }},\n\
		\n\
		\t-- 游戏状态\n\
		\tinitial_state = \"main_menu\",\n\
		}}\n\
		\n\
		return Config\n"
    )
}

fn module_init_template(layer: &str) -> String {
    let layer_name = layer_pascal(layer);
    format!(
        "-- scripts/{layer}/init.lua — {layer} 模块入口\n\
		-- 依赖方向见 AGENTS.md。在此 require 子模块并导出模块表。\n\
		\n\
		local {layer_name} = {{}}\n\
		\n\
		-- TODO: 在此 require 子模块，例如：\n\
		-- {layer_name}.Example = require \"scripts.{layer}.example\"\n\
		\n\
		function {layer_name}.start() end\n\
		function {layer_name}.update(dt) end\n\
		function {layer_name}.stop() end\n\
		\n\
		return {layer_name}\n"
    )
}

fn event_bus_template() -> &'static str {
    "-- scripts/lib/event.lua — 事件总线\n\
	 -- 跨层通信的唯一合法通道（gameplay → ui 解耦用）\n\
	 \n\
	 local Event = {{}}\n\
	 Event.__index = Event\n\
	 \n\
	 function Event.new()\n\
	 \treturn setmetatable({{ listeners = {{}} }}, Event)\n\
	 end\n\
	 \n\
	 function Event:on(event, handler)\n\
	 \tself.listeners[event] = self.listeners[event] or {{}}\n\
	 \ttable.insert(self.listeners[event], handler)\n\
	 \treturn self\n\
	 end\n\
	 \n\
	 function Event:emit(event, ...)\n\
	 \tlocal handlers = self.listeners[event]\n\
	 \tif not handlers then return end\n\
	 \tfor i = 1, #handlers do\n\
	 \t\thandlers[i](...)\n\
	 \tend\n\
	 end\n\
	 \n\
	 function Event:off(event, handler)\n\
	 \tlocal handlers = self.listeners[event]\n\
	 \tif not handlers then return end\n\
	 \tfor i = #handlers, 1, -1 do\n\
	 \t\tif handlers[i] == handler then\n\
	 \t\t\ttable.remove(handlers, i)\n\
	 \t\tend\n\
	 \tend\n\
	 end\n\
	 \n\
	 -- 全局事件总线实例\n\
	 local bus = Event.new()\n\
	 \n\
	 return {{\n\
	 \tnew = Event.new,\n\
	 \tglobal = bus,\n\
	 }}\n"
}

fn class_template() -> &'static str {
    "-- scripts/lib/class.lua — OOP 工具\n\
	 \n\
	 local function new(base)\n\
	 \tlocal cls = {{}}\n\
	 \tcls.__index = cls\n\
	 \tif base then\n\
	 \t\tsetmetatable(cls, {{ __index = base }})\n\
	 \tend\n\
	 \tfunction cls.new(...)\n\
	 \t\tlocal self = setmetatable({{}}, cls)\n\
	 \t\tif self.init then self:init(...) end\n\
	 \t\treturn self\n\
	 \tend\n\
	 \treturn cls\n\
	 end\n\
	 \n\
	 return {{ new = new }}\n"
}

/// Generate the modular scaffold under `root`.
///
/// Runs the shared base structure first (directories, entry scripts, module
/// layers, lib infrastructure), then layers on the Surface structure:
/// - `scripts/ui/surfaces/main_menu/` (init/view/state/style)
/// - `scripts/systems/scene_flow.lua` (Surface flow dispatcher)
/// - `.project/surfaces.json` (Surface manifest)
/// - patched `bootstrap.lua` with Surface registration
pub fn generate_modular_scaffold(
    root: &Path,
    project_name: &str,
    engine_version: &str,
    engine: &str,
) -> Result<Value, std::io::Error> {
    // --- 1. Reuse the shared scaffold for common structure ---
    let base_report = generate_base_scaffold(root, project_name, engine_version)?;
    let mut created_files: Vec<String> = base_report["created_files"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    // --- 2. Surface directory: scripts/ui/surfaces/main_menu/ ---
    let surfaces_dir = root.join("scripts").join("ui").join("surfaces");
    let default_surface_dir = surfaces_dir.join(DEFAULT_SURFACE_ID);
    fs::create_dir_all(&default_surface_dir)?;

    let surface_files: [(&str, String); 4] = [
        ("init.lua", surface_init_template(DEFAULT_SURFACE_ID)),
        ("view.lua", surface_view_template(DEFAULT_SURFACE_ID)),
        ("state.lua", surface_state_template().to_string()),
        ("style.lua", surface_style_template().to_string()),
    ];
    for (name, content) in &surface_files {
        let path = default_surface_dir.join(name);
        let rel = format!("scripts/ui/surfaces/{DEFAULT_SURFACE_ID}/{name}");
        if !path.exists() {
            fs::write(&path, content)?;
            created_files.push(rel);
        }
    }

    // --- 3. scenes/surfaces/ ---
    let scenes_surfaces_dir = root.join("scenes").join("surfaces");
    fs::create_dir_all(&scenes_surfaces_dir)?;

    // --- 4. assets/textures/surfaces/ ---
    let textures_surfaces_dir = root.join("assets").join("textures").join("surfaces");
    fs::create_dir_all(&textures_surfaces_dir)?;

    // --- 5. systems/scene_flow.lua (Surface flow dispatcher) ---
    let scene_flow_path = root.join("scripts").join("systems").join("scene_flow.lua");
    if !scene_flow_path.exists() {
        fs::write(&scene_flow_path, scene_flow_template())?;
        created_files.push("scripts/systems/scene_flow.lua".to_string());
    }

    // --- 6. .project/surfaces.json manifest ---
    let surfaces_json_path = root.join(".project").join("surfaces.json");
    let surfaces_manifest = surfaces_json_manifest(DEFAULT_SURFACE_ID, engine);
    fs::write(
        &surfaces_json_path,
        serde_json::to_string_pretty(&surfaces_manifest).unwrap(),
    )?;
    created_files.push(".project/surfaces.json".to_string());

    // --- 6b. Default TapTap built-in UI theme contract ---
    super::ui_theme::write_default_theme_contract(root)?;
    created_files.push(".project/ui-theme.json".to_string());

    // --- 7. Patch bootstrap.lua with Surface registration ---
    patch_bootstrap_with_surfaces(root)?;

    // --- 8. Write the Surface-aware AGENTS.md template ---
    let agents_md = root.join("AGENTS.md");
    fs::write(&agents_md, agents_md_template(project_name))?;

    info!(
        project_root = %root.display(),
        project_name = %project_name,
        engine = %engine,
        surface = %DEFAULT_SURFACE_ID,
        "Modular scaffold generated"
    );

    Ok(json!({
        "structure": "modular",
        "engine": engine,
        "project_name": project_name,
        "engine_version": engine_version,
        "created_files": created_files,
        "default_surface": DEFAULT_SURFACE_ID,
        "surfaces": [DEFAULT_SURFACE_ID],
        "base_report": base_report
    }))
}

/// Return the Surface manifest for `.project/surfaces.json`.
pub fn surfaces_json_manifest(surface_id: &str, engine: &str) -> Value {
    json!({
        "version": 1,
        "engine": engine,
        "surfaces": [
            {
                "id": surface_id,
                "label": "主菜单",
                "module": format!("scripts/ui/surfaces/{surface_id}"),
                "entry": "init.lua",
                "backend": "static-ui",
                "default": true,
                "initialState": { "menu": "main" },
                "symbols": [format!("{}.create", surface_pascal(surface_id)), format!("{}.destroy", surface_pascal(surface_id))],
                "assets": [format!("assets/textures/surfaces/{surface_id}/")],
                "transitions": []
            }
        ],
        "activeSurface": surface_id
    })
}

/// Return the modular modules.json manifest with Surface entries.
pub fn modular_modules_manifest(surface_id: &str, engine: &str) -> Value {
    let layers = ["ui", "systems", "gameplay", "data", "lib"];
    let mut modules: Vec<Value> = layers
        .iter()
        .map(|layer| {
            json!({
                "path": format!("scripts/{layer}"),
                "entry": "init.lua",
                "layer": layer
            })
        })
        .collect();
    // Insert the Surface module after the ui entry.
    let surface_entry = json!({
        "path": format!("scripts/ui/surfaces/{surface_id}"),
        "entry": "init.lua",
        "layer": "ui",
        "kind": "surface",
        "surfaceId": surface_id
    });
    modules.insert(1, surface_entry);

    json!({
        "structure": "modular",
        "engine": engine,
        "modules": modules,
        "surfaces": [surface_id],
        "dependency_direction": "lib ← data ← systems ← {ui, gameplay}",
        "max_file_lines": 500,
        "main_lua_max_lines": 50
    })
}

/// Patch `scripts/bootstrap.lua` to register the default Surface.
fn patch_bootstrap_with_surfaces(root: &Path) -> Result<(), std::io::Error> {
    let bootstrap_path = root.join("scripts").join("bootstrap.lua");
    if !bootstrap_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&bootstrap_path)?;
    // Only patch if not already patched.
    if content.contains("Surfaces") {
        return Ok(());
    }
    // Append a Surface registration block before "return Bootstrap".
    let patched = if let Some(idx) = content.rfind("return Bootstrap") {
        let registration = format!(
            "\n\
             -- Surface 注册（modular）\n\
             local UI = require \"scripts.ui.init\"\n\
             UI.Surfaces = UI.Surfaces or {{}}\n\
             UI.Surfaces[\"{DEFAULT_SURFACE_ID}\"] = require \"scripts.ui.surfaces.{DEFAULT_SURFACE_ID}.init\"\n\
             \n"
        );
        format!("{}{}", &content[..idx], registration) + &content[idx..]
    } else {
        content
    };
    fs::write(&bootstrap_path, patched)
}

// ============================================================
// Lua / Markdown templates (v2)
// ============================================================

fn surface_init_template(surface_id: &str) -> String {
    let pascal = surface_pascal(surface_id);
    format!(
        "-- scripts/ui/surfaces/{surface_id}/init.lua - {surface_id} Surface 入口\n\
         -- 契约：导出 create() / destroy() / handleInput(x, y, pressed)\n\
         \n\
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

fn surface_view_template(surface_id: &str) -> String {
    let pascal = surface_pascal(surface_id);
    format!(
        "-- scripts/ui/surfaces/{surface_id}/view.lua - UI 元素构造\n\
         \n\
         local {pascal}View = {{}}\n\
         \n\
         function {pascal}View.build(style)\n\
         \t-- TODO: 构造 UI 元素（NanoVG 或 UI table）\n\
         \t-- 使用 style 中的颜色/尺寸常量\n\
         \treturn {{}}\n\
         end\n\
         \n\
         return {pascal}View\n"
    )
}

fn surface_state_template() -> &'static str {
    "-- scripts/ui/surfaces/<id>/state.lua - Surface 局部状态\n\
     \n\
     local State = {{}}\n\
     \n\
     local data = {{}}\n\
     \n\
     function State.reset()\n\
     \tdata = {{}}\n\
     end\n\
     \n\
     function State.get(key)\n\
     \treturn data[key]\n\
     end\n\
     \n\
     function State.set(key, value)\n\
     \tdata[key] = value\n\
     end\n\
     \n\
     return State\n"
}

fn surface_style_template() -> &'static str {
    "-- scripts/ui/surfaces/<id>/style.lua - 样式常量\n\
     \n\
     local Style = {{\n\
     \tbg_color = {{ r = 0.1, g = 0.1, b = 0.15, a = 1.0 }},\n\
     \ttext_color = {{ r = 1.0, g = 1.0, b = 1.0, a = 1.0 }},\n\
     \taccent_color = {{ r = 0.2, g = 0.6, b = 1.0, a = 1.0 }},\n\
     \tfont_size = 18,\n\
     \tbutton_height = 48,\n\
     }}\n\
     \n\
     return Style\n"
}

fn scene_flow_template() -> String {
    "-- scripts/systems/scene_flow.lua - Surface 流转调度（modular）\n\
     -- 监听 surface:switch 事件，调用对应 Surface 的 create/destroy。\n\
     \n\
     local Event = require \"scripts.lib.event\"\n\
     local UI = require \"scripts.ui.init\"\n\
     \n\
     local SceneFlow = {{}}\n\
     local current_surface = nil\n\
     \n\
     function SceneFlow.init()\n\
     \tEvent.global:on(\"surface:switch\", function(surface_id)\n\
     \t\tSceneFlow.switch(surface_id)\n\
     \tend)\n\
     end\n\
     \n\
     function SceneFlow.switch(surface_id)\n\
     \tlocal Surfaces = UI.Surfaces or {{}}\n\
     \tlocal target = Surfaces[surface_id]\n\
     \tif not target then return end\n\
     \tif current_surface and current_surface.destroy then\n\
     \t\tcurrent_surface.destroy()\n\
     \tend\n\
     \tcurrent_surface = target\n\
     \ttarget.create()\n\
     end\n\
     \n\
     function SceneFlow.update(dt)\n\
     \t-- 转发 update 到当前 Surface（如支持）\n\
     end\n\
     \n\
     function SceneFlow.exit()\n\
     \tif current_surface and current_surface.destroy then\n\
     \t\tcurrent_surface.destroy()\n\
     \tend\n\
     \tcurrent_surface = nil\n\
     end\n\
     \n\
     return SceneFlow\n"
        .to_string()
}

fn agents_md_template(project_name: &str) -> String {
    format!(
        "# {project_name} - Agent 开发策略\n\
        \n\
        ## 模块结构（modular）\n\
        - 入口：scripts/main.lua（仅 lifecycle 转发，禁止业务逻辑）\n\
        - 加载：scripts/bootstrap.lua（模块加载 + Surface 注册）\n\
        - 业务模块：scripts/ui/、scripts/systems/、scripts/gameplay/、scripts/data/\n\
        - 工具库：scripts/lib/（叶子节点，不依赖业务）\n\
        - Surface：scripts/ui/surfaces/<id>/（独立界面单元，含 init/view/state/style）\n\
        \n\
        ## Surface 开发规则（v2 强制）\n\
        1. 新界面必须创建 scripts/ui/surfaces/<id>/ 目录，含 init.lua（导出 create/destroy）。\n\
        2. Surface 间不直接 require，通过 scripts/lib/event.lua 的 surface:switch 事件通信。\n\
        3. 绘制调用入 view.lua，局部状态入 state.lua，颜色/尺寸常量入 style.lua。\n\
        4. Surface 专属资源放 assets/textures/surfaces/<id>/，共享资源放 assets/textures/。\n\
        \n\
        ## 依赖方向（强制）\n\
        - lib/ ← 所有模块\n\
        - data/ ← ui/、systems/、gameplay/\n\
        - systems/ ← ui/、gameplay/\n\
        - gameplay/ -> ui/ 仅通过事件总线（scripts/lib/event.lua）\n\
        - 禁止跨层反向依赖（ui 不能被 gameplay 直接 require）\n\
        \n\
        ## Agent 开发规则\n\
        1. 新增功能时，优先放入对应模块目录，不要向 main.lua 添加逻辑。\n\
        2. 单文件超过 500 行时，必须拆分为子模块。\n\
        3. 跨模块通信使用事件总线，不直接 require 其他层的内部模块。\n\
        4. 数据驱动内容放入 scripts/data/，用 Lua table 或 JSON。\n\
        5. 修改前先调用 kaying-for-taptap_game_command action=describe 了解操作影响。\n\
        6. 写操作必须 prepare -> 确认 effects -> execute，保留 plan_id。\n\
        \n\
        ## 输入与按键处理规则（重要）\n\
        新功能涉及键盘/摇杆/按键输入时，必须走 scripts/systems/input.lua 统一输入系统，禁止在 gameplay/ui 内零散监听按键。机制要点：\n\
        1. 键码双兼容：同一语义同时映射引擎 KEY_* 枚举（真机/原生，见 .emmylua/InputEvents.d.lua：W=23 A=1 S=19 D=4 空格=49 回车=39 P=16 Esc=48 J=10 K=11 L=12 上=55 下=57 左=54 右=56）与 DOM keyCode（PC/Web 预览：W=87 A=65 S=83 D=68 空格=32 回车=13 P=80 Esc=27 J=74 K=75 L=76 上=38 下=40 左=37 右=39）。新增按键必须同时登记两套键码，绝不能假设单一键码体系。\n\
        2. 事件为主：语义发射以 KeyDown/KeyUp 事件为主（PC 与真机均验证可靠），经事件总线（scripts/lib/event.lua）转发给 gameplay/ui。\n\
        3. 轮询兜底且非破坏：每帧 input:GetKeyDown 仅作补充（上升沿检测 + 已处理去重），不得覆盖或清除事件记录的按键状态；轮询调用需 pcall 保护。\n\
        4. 状态查询按语义判断：Input.isDown/getDirState 检查语义下全部键码，任一命中即为按下。\n\
        排查「某个方向/按键无响应」时优先检查：键码表是否漏了对应平台（KEY_* 或 DOM）的码、事件与轮询是否互相覆盖状态。\n\
        \n\
        ## 扩展规则\n\
        （项目可在此追加游戏特定规则）\n"
    )
}

/// Convert a surface id (snake_case) to PascalCase for the module identifier.
/// Convert layer name to PascalCase for the module table identifier.
fn layer_pascal(layer: &str) -> String {
    match layer {
        "ui" => "UI".to_string(),
        _ => {
            let mut chars = layer.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        }
    }
}

fn surface_pascal(surface_id: &str) -> String {
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
    use tempfile::tempdir;

    #[test]
    fn test_generate_modular_scaffold_creates_surface() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        let result = generate_modular_scaffold(root, "test-game", "1.0.0", "taptap").unwrap();

        assert_eq!(result["structure"], "modular");
        assert_eq!(result["engine"], "taptap");
        assert_eq!(result["default_surface"], "main_menu");

        // Surface files
        assert!(root.join("scripts/ui/surfaces/main_menu/init.lua").exists());
        assert!(root.join("scripts/ui/surfaces/main_menu/view.lua").exists());
        assert!(
            root.join("scripts/ui/surfaces/main_menu/state.lua")
                .exists()
        );
        assert!(
            root.join("scripts/ui/surfaces/main_menu/style.lua")
                .exists()
        );

        // scene_flow
        assert!(root.join("scripts/systems/scene_flow.lua").exists());

        // surfaces.json manifest
        assert!(root.join(".project/surfaces.json").exists());
        let manifest = fs::read_to_string(root.join(".project/surfaces.json")).unwrap();
        let parsed: Value = serde_json::from_str(&manifest).unwrap();
        assert_eq!(parsed["surfaces"][0]["id"], "main_menu");
        assert_eq!(parsed["activeSurface"], "main_menu");

        // scenes/surfaces and assets/textures/surfaces
        assert!(root.join("scenes/surfaces").is_dir());
        assert!(root.join("assets/textures/surfaces").is_dir());

        // v1 shared structure still present
        assert!(root.join("scripts/main.lua").exists());
        assert!(root.join("scripts/bootstrap.lua").exists());
        for layer in &["ui", "systems", "gameplay", "data", "lib"] {
            assert!(root.join(format!("scripts/{layer}/init.lua")).exists());
        }
    }

    #[test]
    fn test_bootstrap_patched_with_default_surface() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        generate_modular_scaffold(root, "test", "1.0.0", "taptap").unwrap();

        let bootstrap = fs::read_to_string(root.join("scripts/bootstrap.lua")).unwrap();
        assert!(bootstrap.contains("Surfaces"));
        assert!(bootstrap.contains("main_menu"));
    }

    #[test]
    fn test_agents_md_contains_surface_and_input_rules() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        generate_modular_scaffold(root, "test", "1.0.0", "taptap").unwrap();

        let agents = fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(agents.contains("modular"));
        assert!(agents.contains("Surface 开发规则"));
        assert!(agents.contains("surfaces/<id>"));
        assert!(agents.contains("输入与按键处理规则"));
        assert!(agents.contains("键码双兼容"));
    }

    #[test]
    fn test_surface_pascal_converts_snake_case() {
        assert_eq!(surface_pascal("main_menu"), "MainMenu");
        assert_eq!(surface_pascal("gameplay_hud"), "GameplayHud");
        assert_eq!(surface_pascal("result"), "Result");
    }

    #[test]
    fn test_modules_json_manifest_has_surface_entry() {
        let manifest = modular_modules_manifest("main_menu", "taptap");
        assert_eq!(manifest["structure"], "modular");
        assert_eq!(manifest["engine"], "taptap");
        let modules = manifest["modules"].as_array().unwrap();
        let surface_entry = modules
            .iter()
            .find(|m| m.get("kind").and_then(|k| k.as_str()) == Some("surface"));
        assert!(surface_entry.is_some());
        assert_eq!(surface_entry.unwrap()["surfaceId"], "main_menu");
    }
    #[test]
    fn test_generate_scaffold_skips_existing_files() {
        let temp = tempdir().unwrap();
        let root = temp.path();

        // Pre-create main.lua with custom content
        fs::create_dir_all(root.join("scripts")).unwrap();
        fs::write(root.join("scripts/main.lua"), "-- custom").unwrap();

        let result = generate_modular_scaffold(root, "test", "1.0.0", "taptap").unwrap();
        let skipped: Vec<&str> = result["created_files"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v.as_str())
            .collect();
        // Custom content preserved
        assert_eq!(
            fs::read_to_string(root.join("scripts/main.lua")).unwrap(),
            "-- custom"
        );
        assert!(!skipped.contains(&"scripts/main.lua"));
    }

    #[test]
    fn test_main_lua_template_is_lifecycle_only() {
        let content = main_lua_template();
        assert!(content.contains("function Start()"));
        assert!(content.contains("SubscribeToEvent(\"Update\""));
        assert!(content.contains("Bootstrap.update"));
        assert!(content.contains("function Stop()"));
        assert!(!content.contains("function init()"));
        assert!(!content.contains("if "));
        assert!(!content.contains("for "));
    }
}
