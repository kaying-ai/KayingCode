//! `t3m lint` — check a transcribed Maker/UrhoX Lua project against every trap
//! that was verified while transcribing the reference games. Each rule carries
//! the symptom it prevents, so the fix is obvious from the output.
//!
//! Rules are grouped by the layer they break:
//!   * runtime crashes / nil calls  (engine globals shadowed, missing methods)
//!   * silent rendering failures    (invisible meshes, frustum-culled models)
//!   * wrong pixels                 (specular F0, ambient, shader stages)
//!   * missing resources            (requesting files that were never shipped)

use crate::util::{collect_files, numbers_after, read_text, CliResult};
use std::path::{Path, PathBuf};

pub struct Finding {
    pub file: String,
    pub line: usize,
    pub rule: &'static str,
    pub severity: &'static str,
    pub message: String,
    /// Interpolated (the fix may name the method/property it is about).
    pub fix: String,
}

/// Engine globals injected into the Lua environment (engine-docs/api/globals.md).
/// Declaring a local with one of these names silently breaks every later use of
/// the global in that file — `local cache = {}` turned every `cache:GetResource`
/// into a nil call in the reference transcription.
const ENGINE_GLOBALS: &[&str] = &[
    "audio",
    "cache",
    "console",
    "context",
    "engine",
    "fileSystem",
    "graphics",
    "input",
    "localization",
    "log",
    "network",
    "renderer",
    "time",
    "ui",
];

/// Literals with these extensions are treated as resource paths when they show
/// up in a `cache:GetResource(...)` call.
const ASSET_EXTS: &[&str] = &[
    "mp3", "ogg", "wav", "m4a", "png", "jpg", "jpeg", "webp", "bmp", "tga", "dds", "ktx", "ktx2",
    "mdl", "xml", "json", "txt", "fnt", "ttf", "otf", "shader", "anim", "scml", "tmx", "mp4",
    "webm",
];

fn push(
    out: &mut Vec<Finding>,
    file: &str,
    line: usize,
    rule: &'static str,
    severity: &'static str,
    message: impl Into<String>,
    fix: impl Into<String>,
) {
    out.push(Finding {
        file: file.to_string(),
        line,
        rule,
        severity,
        message: message.into(),
        fix: fix.into(),
    });
}

/// UI widgets really do have SetVisible; scene nodes do not. Skip obvious widgets.
fn widget_receiver(line: &str, call_pos: usize) -> bool {
    let before = &line[..call_pos];
    let recv: String = before
        .rsplit(|c: char| !(c.is_alphanumeric() || c == '_' || c == '.'))
        .next()
        .unwrap_or("")
        .to_lowercase();
    [
        "refs.", "btn", "button", "label", "panel", "modal", "pill", "widget", "toggle", "slider",
        "input", "avatar", "chip", "badge", "toast", "menu", "drawer", "popover", "list", "grid",
        "scroll", "pad",
    ]
    .iter()
    .any(|k| recv.contains(k))
}

/// Local-function names that read as "call the widget setter" but, being locals,
/// resolve to themselves: `local function setText(w, t) … setText(w, t) … end`
/// recurses into the same wrapper instead of reaching `widget:SetText`, so the
/// widget is never written. The reference transcription shipped a HUD whose gold,
/// lives, wave counter and score stayed frozen at their initial strings this way,
/// with lint/rlog/remote build all green.
const SHADOWED_SETTERS: &[(&str, &str)] = &[
    ("settext", "SetText"),
    ("setvisible", "SetVisible"),
    ("setstyle", "SetStyle"),
    ("setcolor", "SetColor"),
    ("setsize", "SetSize"),
    ("setwidth", "SetWidth"),
    ("setheight", "SetHeight"),
    ("setvalue", "SetValue"),
];

/// `width = 96` — a hardcoded widget width. `"100%"` / `"auto"` return None:
/// those are layout-driven and cannot be outgrown by the string.
fn hardcoded_width(line: &str) -> Option<f64> {
    let pos = line.find("width")?;
    let rest = line[pos + "width".len()..].trim_start();
    let rest = rest.strip_prefix('=')?.trim_start();
    let num: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    if num.is_empty() {
        return None;
    }
    num.parse().ok()
}

/// Is the line inside a `UI.Button { … }` props block (or a `button(…)` helper
/// call)? Walk up to the constructor; a closing brace means the block already
/// ended. Only Button matters: the library draws a Button's label with a
/// single-line `nvgText` and hard-clips it at the border box, so an embedded
/// `"\n"` is drawn as a raw codepoint on that one line and the ends of the label
/// get cut off mid-glyph. Label splits lines properly, so it is skipped.
fn inside_button_block(lines: &[&str], idx: usize) -> bool {
    let lo = idx.saturating_sub(20);
    for j in (lo..=idx).rev() {
        let l = lines[j];
        if l.contains('}') {
            return false;
        }
        if !(l.contains('{') || l.contains('(')) {
            continue;
        }
        let lower = l.to_lowercase();
        if lower.contains("ui.button")
            || lower.contains("button {")
            || lower.contains("button{")
            || lower.contains("button(")
        {
            return true;
        }
        if lower.contains("ui.label")
            || lower.contains("label {")
            || lower.contains("label{")
            || lower.contains("label(")
            || lower.contains(":settext(")
        {
            return false;
        }
    }
    false
}

/// `local b = UI.Button { … }` / `refs.speedBtn = button(…)` — returns the
/// assigned variable (dotted receivers kept whole, e.g. `refs.callBtn`) so file
/// rules can follow what happens to it.
fn button_var(line: &str) -> Option<String> {
    let eq = line.find('=')?;
    let lhs = line[..eq].trim();
    let rhs = &line[eq + 1..];
    if !(rhs.contains("UI.Button") || rhs.contains("button(")) {
        return None;
    }
    let stripped = lhs.strip_prefix("local ").unwrap_or(lhs).trim();
    if stripped.contains(':') || stripped.contains('(') {
        return None; // a method call or index expression, not a plain variable
    }
    let name: String = stripped
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '.')
        .collect();
    if name.is_empty() || name == "for" || name == "if" || name == "return" {
        return None;
    }
    Some(name)
}

/// `DEV_SMOKE = true` / `M.DEV_SMOKE = true` — a development self-test switch
/// left on at MODULE level in delivered code. The reference round shipped
/// `M.DEV_SMOKE = true`, whose boot path skips the title screen, auto-plays
/// level 0 in ~1.5 s and parks the preview on a finished-run HUD — the user's
/// "the UI looks unchanged" was this switch, not the code. Nested assignments
/// (a harness toggling its own state) and diagnostic flags do not count.
pub fn dev_switch(line: &str) -> Option<String> {
    if line.starts_with(char::is_whitespace) {
        return None; // module scope only: a nested toggle is runtime state
    }
    let eq = line.find("= true")?;
    let lhs = line[..eq].trim_end();
    let name: String = lhs
        .chars()
        .rev()
        .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '.')
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let upper = name.to_uppercase();
    for key in [
        "DEV",
        "SMOKE",
        "SELFTEST",
        "SELF_TEST",
        "TESTMODE",
        "TEST_MODE",
    ] {
        if upper.contains(key) {
            return Some(name);
        }
    }
    None
}

/// CJK / fullwidth codepoints — a literal containing these is player-facing text.
fn has_cjk(s: &str) -> bool {
    s.chars().any(|c| {
        let u = c as u32;
        (0x3000..=0x303F).contains(&u)
            || (0x3040..=0x30FF).contains(&u)
            || (0x3400..=0x4DBF).contains(&u)
            || (0x4E00..=0x9FFF).contains(&u)
            || (0xF900..=0xFAFF).contains(&u)
            || (0xFF00..=0xFFEF).contains(&u)
    })
}

/// Is this the file that defines the string table? (`t3m lint` needs the key
/// set before it can tell a real key from a typo.)
fn is_i18n_file(rel: &str) -> bool {
    let low = rel.to_lowercase();
    ["i18n", "lang", "locale", "strings", "dictionary", "dict"]
        .iter()
        .any(|k| low.contains(k))
}

/// Keys of a string table: `key = "…"` and `["dotted.key"] = "…"` (both idioms
/// were used by the reference ports). Values are irrelevant here.
fn i18n_keys(text: &str, out: &mut Vec<String>) {
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("--") || trimmed.starts_with("//") {
            continue;
        }
        if let Some(bracket) = line.find("] = \"") {
            if let Some(open) = line[..bracket].rfind('[') {
                let key = line[open + 1..bracket]
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');
                if !key.is_empty() && key.len() < 48 && !key.contains(' ') {
                    out.push(key.to_string());
                }
                continue;
            }
        }
        // bare identifier keys, but not `local x = "…"` (not a key in a table)
        if line.starts_with(char::is_whitespace) && !trimmed.starts_with("local ") {
            if let Some(eq) = line.find("= \"") {
                let name = line[..eq].trim();
                if !name.is_empty()
                    && name.len() < 48
                    && name
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
                    && name
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_alphabetic())
                        .unwrap_or(false)
                {
                    out.push(name.to_string());
                }
            }
        }
    }
}

/// String literals used as translation keys on a line: `t("k")`, `I18n.t("k")`,
/// `T("k")`. Skips `fmt("…")`-style calls (the char before `t` must not be a
/// letter or digit).
fn tr_key_literals(line: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let bytes = line.as_bytes();
    let mut i = 0usize;
    while i + 2 < bytes.len() {
        if (bytes[i] == b't' || bytes[i] == b'T') && bytes[i + 1] == b'(' && bytes[i + 2] == b'"' {
            let prev = if i == 0 { ' ' } else { bytes[i - 1] as char };
            let prev_ok = !prev.is_ascii_alphanumeric() && prev != '_';
            if prev_ok {
                let mut key = String::new();
                let mut j = i + 3;
                while j < bytes.len() && bytes[j] != b'"' {
                    key.push(bytes[j] as char);
                    j += 1;
                }
                if !key.is_empty() && key.len() < 48 {
                    out.push(key);
                }
                i = j + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// A `"\n"` used as a line break in a button-ish call: `softButton(ICON.map ..
/// "\n" .. t(...))` — the helper builds a Button, and Button is single-line.
fn mentions_button_callee(line: &str) -> bool {
    let lower = line.to_lowercase();
    for (idx, _) in lower.match_indices("button") {
        if lower[idx + 6..].starts_with('(') {
            return true;
        }
    }
    for (idx, _) in lower.match_indices("btn") {
        if lower[idx + 3..].starts_with('(') {
            return true;
        }
    }
    false
}

fn has_break_within(lines: &[&str], start: usize, window: usize) -> bool {
    let end = (start + window).min(lines.len());
    lines[start..end].iter().any(|l| l.contains("break"))
}

fn normalized_nearby(lines: &[&str], idx: usize, window: usize) -> bool {
    let lo = idx.saturating_sub(window);
    let hi = (idx + window).min(lines.len());
    lines[lo..hi]
        .iter()
        .any(|l| l.contains("GetWidth") || l.contains("GetHeight") || l.contains("normalized"))
}

/// `local <name>` / `local function <name>` where `<name>` is an engine global.
/// Returns the name and the declaration's indentation: a module-scope local
/// shadows the global for the whole file, a nested one only for its block.
fn shadowed_global(line: &str, code: &str) -> Option<(&'static str, usize)> {
    let rest = code.strip_prefix("local ")?;
    let rest = rest.trim_start();
    if rest.starts_with('(') {
        return None;
    }
    let rest = rest.strip_prefix("function ").unwrap_or(rest).trim_start();
    let name: String = rest
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_')
        .collect();
    if name.is_empty() {
        return None;
    }
    let indent = line.len() - code.len();
    ENGINE_GLOBALS
        .iter()
        .copied()
        .find(|g| *g == name)
        .map(|g| (g, indent))
}

/// Double- or single-quoted literals on one line (Lua has only these two).
fn string_literals(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '"' && c != '\'' {
            continue;
        }
        let quote = c;
        let mut cur = String::new();
        for c2 in chars.by_ref() {
            if c2 == quote {
                break;
            }
            cur.push(c2);
        }
        if !cur.is_empty() {
            out.push(cur);
        }
    }
    out
}

/// Classify a literal as a project asset path: `(relative path, is_directory)`.
fn literal_is_asset(lit: &str) -> Option<(String, bool)> {
    let lit = lit.trim();
    if lit.is_empty() || lit.starts_with("http://") || lit.starts_with("https://") {
        return None;
    }
    if lit.contains("..") {
        return None; // escaping the project; not checkable
    }
    let rel = lit.strip_prefix("assets/").unwrap_or(lit);
    if let Some(dir) = rel.strip_suffix('/') {
        // dynamic prefix: `"audio/sfx/" .. file .. ".mp3"`
        return Some((dir.to_string(), true));
    }
    let ext = rel.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase())?;
    if !ASSET_EXTS.contains(&ext.as_str()) {
        return None;
    }
    Some((rel.to_string(), false))
}

/// Rules that need the whole file rather than a single line. `keys` is the
/// project-wide string-table key set (empty when no table was found, which
/// disables the key check rather than guessing).
fn file_rules(rel: &str, text: &str, lines: &[&str], findings: &mut Vec<Finding>) {
    let first_line_of = |needle: &str| -> usize {
        lines
            .iter()
            .position(|l| l.contains(needle))
            .map(|i| i + 1)
            .unwrap_or(1)
    };

    // A Model built from a hand-filled CustomGeometry: FillModel() leaves a
    // bounding box that does not cover the mesh and the renderer frustum-culls
    // on that box, so the mesh never draws and the log stays clean.
    if text.contains("FillModel(") && !text.contains("SetBoundingBox") {
        push(
            findings,
            rel,
            first_line_of("FillModel("),
            "model-missing-bbox",
            "high",
            "用过 FillModel 建 Model，但本文件没有 SetBoundingBox：包围盒不覆盖几何 → 整块网格被视锥剔除，画面里直接消失（日志干净）",
            "FillModel 之后显式 model:SetBoundingBox(BoundingBox(min, max))（留 0.1~0.2 余量给顶点位移）",
        );
    }

    // Shader stage built-ins: INSTANCE_COLOR exists in vertex() only.
    if rel.ends_with(".shader") {
        if let Some(start) = lines.iter().position(|l| l.contains("void fragment(")) {
            if lines[start..]
                .iter()
                .any(|l| l.contains("INSTANCE_COLOR") && !l.trim_start().starts_with("//"))
            {
                push(
                    findings,
                    rel,
                    start + 1,
                    "instance-color-in-fragment",
                    "high",
                    "INSTANCE_COLOR 是顶点阶段内建量，在 fragment() 里引用会让 shader 编译失败（报 Unknown identifier in expression）",
                    "在 vertex() 里 `v_inst = INSTANCE_COLOR;`，用 varying 带进片元阶段",
                );
            }
        }
    }

    // A light group that brings its own sun (and an IBL cubemap the engine
    // package does not ship) on top of the game's own light rig.
    if text.contains("LightGroup/Daytime.xml") {
        push(
            findings,
            rel,
            first_line_of("LightGroup/Daytime.xml"),
            "daytime-lightgroup",
            "medium",
            "LightGroup/Daytime.xml 自带一盏平行光（与原版单太阳不符），还会请求引擎包里没有的 IBL 立方图",
            "不要加载它：太阳自己建（Light + LIGHT_DIRECTIONAL），环境光用 zone.ambientSource = AMBIENT_COLOR",
        );
    }

    // Text sizing in this UI library is a *measurement* problem, not a styling
    // one: Button draws its label on one line, clips at the border box, has no
    // ellipsis, and CJK glyphs are a full em wide — a hardcoded width that fits
    // "New Game" (8 latin chars) is ~2x too narrow for "开始游戏" (4 CJK chars),
    // and a cost/HP counter grows without bound. Auto-shrink only engages when
    // UI.defaultAutoFitText is on, i.e. when the engine i18n module is active —
    // a project with its own Lua string table gets none of it. A UI file that
    // hardcodes widths and never calls the measuring API is guessing.
    let is_ui_file = ["UI.Button", "UI.Label", "UI.Panel", "button(", "label("]
        .iter()
        .any(|k| text.contains(k));
    let measures_text = text.contains("MeasureTextWidth") || text.contains("MeasureTextFit");
    if is_ui_file && !measures_text {
        if let Some((ln, w)) = lines
            .iter()
            .enumerate()
            .find_map(|(i, l)| hardcoded_width(l).map(|w| (i + 1, w)))
        {
            push(
                findings,
                rel,
                ln,
                "ui-text-width-hardcoded",
                "medium",
                format!("UI 控件宽度写死（width = {w:.0}）而本文件从不量文字：中文每字约 1em，多语言/计数一变就超出边框被裁到半个字"),
                "宽度用 UI.MeasureTextWidth(text, Theme.FontSize(字号), 字体, 字距) 量出来再加左右 padding（Button 默认 16/边）；两行内容（名称+费用）用 Panel + 两个 Label，不要往 Button 的 text 里塞 \"\\n\"",
            );
        }
    }

    // A Button that receives children: the library documents Button-as-container
    // only with `minWidth` and no text (Widgets/Button.lua), and the reference
    // round's fixed-width + AddChild variant drew every child label on top of
    // the others on a real frame — a whole fix round was spent building that and
    // then reverting it. Composite controls (icon + two lines + a ring) belong
    // on a Panel with onClick (Widget:OnClick dispatches props.onClick on any
    // widget, Core/Widget.lua), which lays children out normally.
    let mut button_vars: Vec<(String, usize)> = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if let Some(name) = button_var(line) {
            button_vars.push((name, i));
        }
    }
    for (name, start) in &button_vars {
        let window_end = (*start + 40).min(lines.len());
        for (i, line) in lines.iter().enumerate().take(window_end).skip(*start) {
            // Only the Button as PARENT counts: `X:AddChild(b)` puts the button
            // into a container, which is fine.
            if !line.contains(&format!("{name}:AddChild(")) {
                continue;
            }
            push(
                findings,
                rel,
                i + 1,
                "button-addchild",
                "high",
                format!("往 Button（{name}）里 AddChild 子控件：这个引擎版本下子控件不参与布局，会在同一点叠画（实拍截图证实过），组合出来的控件是坏的"),
                "组合控件（图标+文字、两行、进度环）用 Panel + onClick（任意控件都支持 props.onClick，子控件正常布局）；Button+children 只有 minWidth 无 text 的用法可能可行，且必须先用 5 行探针在真帧上验证",
            );
            break;
        }
    }

    // A local function that shadows a widget setter name and calls itself: the
    // call never reaches the widget, so the value silently stays at whatever the
    // constructor set. Only reported when the file never calls the real method —
    // then there is no path at all that writes that property.
    for (lower, method) in SHADOWED_SETTERS {
        let decl = format!("local function {lower}(");
        let Some(start) = lines.iter().position(|l| l.to_lowercase().contains(&decl)) else {
            continue;
        };
        let indent = lines[start].len() - lines[start].trim_start().len();
        let body_end = lines[start + 1..]
            .iter()
            .position(|l| l.trim() == "end" && (l.len() - l.trim_start().len()) <= indent)
            .map(|i| start + 1 + i)
            .unwrap_or(lines.len());
        let calls_itself = lines[start + 1..body_end].iter().any(|l| {
            !l.trim_start().starts_with("--") && l.to_lowercase().contains(&format!("{lower}("))
        });
        let reaches_method = text
            .to_lowercase()
            .contains(&format!(":{}(", method.to_lowercase()));
        // A wrapper that writes widget.props directly does update the widget, even
        // though it never calls the method — not this trap.
        let writes_props_directly = text.contains(".props");
        if calls_itself && !reaches_method && !writes_props_directly {
            push(
                findings,
                rel,
                start + 1,
                "self-call-shadows-method",
                "high",
                format!("本文件定义了局部函数 {lower}()，它调用的是它自己（不是控件方法 {method}），而全文没有任何 :{method}( 调用 → 控件收不到新值，界面数字静默冻结"),
                format!("改成 widget:{method}(…)：包一层同名局部函数会把方法调用变成自递归；防重复写可以比较上次的值，但真正写值的那一步必须是 :{method}("),
            );
        }
    }
}

/// Project-relative path for a scanned file (falls back to the scan root when
/// the project root does not contain it).
fn rel_of(proj_root: &Path, scan_root: &Path, f: &Path) -> String {
    f.strip_prefix(proj_root)
        .or_else(|_| f.strip_prefix(scan_root))
        .unwrap_or(f)
        .to_string_lossy()
        .replace('\\', "/")
}

pub fn run(project: &Path, json: bool, all: bool) -> CliResult<(Vec<Finding>, usize)> {
    // Only the user's own code by default: a Maker project ships the engine
    // library (urhox-libs/), templates and examples, whose own code triggers
    // rules meant for transcription output.
    let proj_root: PathBuf = project.to_path_buf();
    let scan_root: PathBuf = if !all && proj_root.join("scripts").is_dir() {
        proj_root.join("scripts")
    } else {
        proj_root.clone()
    };
    let mut files: Vec<PathBuf> = Vec::new();
    collect_files(&scan_root, "lua", &mut files)?;
    files.sort();
    // Surface shaders the transcription wrote live in assets/Shaders, not in
    // scripts/ — shader-stage mistakes are only visible if they are scanned.
    let mut shaders: Vec<PathBuf> = Vec::new();
    if !all {
        collect_files(&proj_root.join("assets"), "shader", &mut shaders)?;
    }
    shaders.sort();
    let scanned = files.len() + shaders.len();
    let mut findings: Vec<Finding> = Vec::new();

    // String-table keys first: a label that asks for a key which is not in the
    // table renders the RAW KEY to the player (the reference port shipped a
    // title screen with a button labelled "paints"). Only files that look like
    // the table are harvested, and a table with fewer than 10 keys is treated as
    // "not found" — a partial table would turn this rule into a false-positive
    // machine.
    let mut keys: Vec<String> = Vec::new();
    for f in &files {
        let rel = rel_of(&proj_root, &scan_root, f);
        if is_i18n_file(&rel) {
            if let Ok(text) = read_text(f) {
                i18n_keys(&text, &mut keys);
            }
        }
    }
    keys.sort();
    keys.dedup();
    if keys.len() < 10 {
        keys.clear();
    }
    let key_set: std::collections::HashSet<&str> = keys.iter().map(|k| k.as_str()).collect();

    // Only report missing resources for asset kinds the project actually ships;
    // otherwise engine-package paths (Models/Box.mdl and friends) get flagged.
    let shipped_kinds: Vec<String> = std::fs::read_dir(proj_root.join("assets"))
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();

    for f in files.iter().chain(shaders.iter()) {
        let rel = rel_of(&proj_root, &scan_root, f);
        let text = read_text(f)?;
        let has_ambient_source = text.contains("ambientSource");
        let lines: Vec<&str> = text.lines().collect();

        for (i, line) in lines.iter().enumerate() {
            let ln = i + 1;
            let code = line.trim_start();
            let is_comment = code.starts_with("--") || code.starts_with("//");
            if is_comment {
                continue;
            }

            if let Some((name, indent)) = shadowed_global(line, code) {
                // The crash case is a module-scope local that the file keeps
                // using as the engine global (`local cache = {}` + `cache:GetResource`).
                let used_as_global =
                    text.contains(&format!("{name}:")) || text.contains(&format!("{name}."));
                let (severity, message, fix) = if indent > 0 {
                    ("low",
                     format!("嵌套作用域里声明了 {name}，遮蔽了引擎全局 {name}（只影响本块）"),
                     "若本块内不需要引擎全局，建议改名（cache → shaderCache）以免后续扩大作用域时踩坑")
                } else if used_as_global {
                    ("high",
                     format!("模块级局部变量 {name} 遮蔽了引擎全局 {name}，而本文件后面还在用 {name}:… 调用 → 那些调用会变成 nil"),
                     "改名（cache → shaderCache、ui → ui_ 之类），或明确改用另一个变量名")
                } else {
                    (
                        "medium",
                        format!(
                            "模块级局部变量 {name} 遮蔽了引擎全局 {name}（本文件暂未使用该全局）"
                        ),
                        "改名更省心；只要本文件确实不需要引擎全局 {name} 就可以保留",
                    )
                };
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "engine-global-shadow",
                    severity,
                    message,
                    fix,
                );
            }
            if line.contains("renderer:Render(") {
                push(&mut findings, &rel, ln, "renderer-render", "high",
                     "引擎没有 Renderer:Render 方法（调用即 nil，脚本中断）",
                     "删掉该调用：设置好 Viewport 后引擎每帧自己渲染（脚手架只调 renderer:SetViewport）");
            }
            if let Some(pos) = line.find(":EulerAngles()") {
                if let Some(eq) = line[..pos].find('=') {
                    if line[..eq].contains(',') {
                        push(&mut findings, &rel, ln, "euler-angles-return", "high",
                             "EulerAngles() 返回一个 Vector3，不是三个数：多值解构会拿到 (向量, nil, nil)",
                             "读返回值的 .x/.y/.z，或用标量记录姿态，不要从四元数反读欧拉角");
                    }
                }
            }
            if let Some(pos) = line.find(":SetVisible(") {
                if !widget_receiver(line, pos) {
                    push(
                        &mut findings,
                        &rel,
                        ln,
                        "node-setvisible",
                        "high",
                        "Node 没有 SetVisible 方法（运行时会抛错）",
                        "改用 node:SetEnabled(true/false)；UI 控件才用 SetVisible",
                    );
                }
            }
            if line.contains("UI.GetRoot(") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "ui-getroot",
                    "high",
                    "该 UI 库没有导出 UI.GetRoot",
                    "在换屏处自己记录上一个根控件引用，或改用命名 id 查找",
                );
            }
            if line.contains("UI.SetRoot(") {
                let next = lines.get(i + 1).copied().unwrap_or("");
                if line.contains(", true")
                    || next.trim_start().starts_with(", true")
                    || next.contains("destroyOld")
                {
                    push(&mut findings, &rel, ln, "ui-setroot-destroy", "high",
                         "SetRoot(..., true) 会在 UI 事件派发中销毁控件树",
                         "把换屏动作延迟到下一帧执行（派发结束后再改控件树），否则点击后界面自旋无响应");
                }
            }
            if line.contains("Node()") || line.contains("Node:new(") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "node-ctor",
                    "high",
                    "引擎没有独立的 Node 构造函数",
                    "所有节点用 parent:CreateChild(name) 创建",
                );
            }
            if line.contains("graphics:SetMode(") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "setmode",
                    "high",
                    "graphics:SetMode 已被引擎禁用",
                    "用 graphics:GetWidth()/GetHeight()/GetDPR() 做适配",
                );
            }
            if let Some(pos) = line.find("MatSpecColor") {
                let nums = numbers_after(&line[pos..], "Color(");
                // only the RGB components matter; the 4th is alpha
                let rgb: Vec<f64> = nums.iter().take(3).cloned().collect();
                if let Some(max) = rgb.iter().cloned().reduce(f64::max) {
                    if max > 0.12 {
                        push(
                            &mut findings,
                            &rel,
                            ln,
                            "specular-f0",
                            "high",
                            format!("MatSpecColor 最大分量 {max:.2}（three.js 非金属 F0 = 0.04）"),
                            "改成 0.04；过大的镜面会让掠射角的地面/台座整片泛白",
                        );
                    }
                }
            }
            if line.contains("ambientColor") && !has_ambient_source && !line.contains("--") {
                push(&mut findings, &rel, ln, "ambient-no-source", "high",
                     "设置了 ambientColor 但同文件没有 ambientSource",
                     "加 zone.ambientSource = AMBIENT_COLOR，否则环境光是 no-op（画面会暗约 2.5 倍）");
            }
            if line.contains("GetProgramDir(") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "program-dir",
                    "high",
                    "沙箱下 GetProgramDir() 返回空串",
                    "存档用相对路径 File(\"save.json\", FILE_WRITE)",
                );
            }
            for banned in [
                "os.execute(",
                "os.remove(",
                "os.rename(",
                "dofile(",
                "loadfile(",
                "io.open(",
            ] {
                if line.contains(banned) {
                    push(
                        &mut findings,
                        &rel,
                        ln,
                        "sandbox-banned",
                        "high",
                        format!("{banned} 已被沙箱移除"),
                        "改用 File / require；存档解析按已知结构做字符串解析",
                    );
                }
            }
            // Resources requested but never shipped: ResourceCache logs an ERROR
            // per missing path and there is no manifest probe API, so asking for
            // a file that is not in the package *is* the bug.
            if let Some(gpos) = line.find("GetResource(") {
                if !rel.ends_with(".shader") {
                    for lit in string_literals(&line[gpos..]) {
                        let Some((rel_path, is_dir)) = literal_is_asset(&lit) else {
                            continue;
                        };
                        let first = rel_path.split('/').next().unwrap_or("").to_string();
                        if first.is_empty() || !shipped_kinds.iter().any(|k| *k == first) {
                            continue;
                        }
                        let found = [
                            proj_root.join("assets").join(&rel_path),
                            proj_root.join(&rel_path),
                        ]
                        .iter()
                        .any(|p| if is_dir { p.is_dir() } else { p.exists() });
                        if !found {
                            push(&mut findings, &rel, ln, "resource-not-shipped", "high",
                                 format!("请求了未随包发布的资源 assets/{rel_path} —— 引擎会逐次记 ERROR（且没有 manifest 探测接口）"),
                                 "要么把文件放进 assets/ 并生成 .meta，要么别请求它（缺资源时静默跳过，不要靠 cache:Exists 探测）");
                        }
                    }
                }
            }
            if line.contains("GetScreenRay(") && !normalized_nearby(&lines, i, 6) {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "screen-ray",
                    "medium",
                    "GetScreenRay 的入参是 0..1 归一化坐标（附近未见归一化）",
                    "用 x/graphics:GetWidth()、y/graphics:GetHeight() 归一化后再调用",
                );
            }
            if line.contains("while true do") && !has_break_within(&lines, i, 40) {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "while-true",
                    "medium",
                    "无限循环在附近 40 行内没有 break：会锁死主线程（窗口无响应）",
                    "补退出条件/上限计数；求解器要给状态数上限",
                );
            }
            if line.contains("PBRNoTextureAlpha") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "alpha-blend",
                    "medium",
                    "alpha 技术的混合行为与 three.js transparent 不一定一致",
                    "先用一个已知 alpha 的平面验证：应当变暗的阴影面若变亮，就是混合不兼容",
                );
            }
            if line.contains("Models/Box.mdl") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "box-uv",
                    "low",
                    "内置 Models/Box.mdl 的 UV 与 three.js 不同（贴图可能旋转 90°）",
                    "需要与原版一致的贴图方向时改用 RoundedBoxGeometry/BoxGeometry:ToModel()",
                );
            }
            if line.contains("hdrRendering") && line.contains("true") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "no-aces",
                    "low",
                    "引擎没有 ACES 色调映射，照搬原版光强会过曝",
                    "用截图像素统计（棋盘区域中位亮度）标定，而不是肉眼",
                );
            }
            if line.contains("LoadLevel(") && line.contains("Turn(") {
                push(
                    &mut findings,
                    &rel,
                    ln,
                    "portrait-turn",
                    "low",
                    "竖屏旋转关卡时，凡是用到格子索引的映射（朝向/拾取/提示）都要跟着转",
                    "确认方向表、拾取公式、提示箭头偏移都走同一套格子↔世界映射",
                );
            }
            // A label asking for a key the string table does not define: the
            // lookup falls through to the key itself and the player reads
            // "paints" on a button (reference Tower Guard title screen).
            if !key_set.is_empty() {
                for key in tr_key_literals(line) {
                    if key_set.contains(key.as_str()) {
                        continue;
                    }
                    // dynamic compositions (`t("tw_" .. k)`), formats and paths
                    if line.contains(&format!("t(\"{key}\" .."))
                        || key.contains('%')
                        || key.contains('/')
                    {
                        continue;
                    }
                    push(&mut findings, &rel, ln, "i18n-missing-key", "high",
                         format!("文案 key \"{key}\" 在词表里没有定义：查找失败会原样返回 key，玩家在界面上看到的就是 \"{key}\""),
                         "在词表（I18n/词典文件）里补上这个 key，或改成已有的 key；拼错的按原版词典逐字核对");
                }
            }
            // Player-facing text written as a literal instead of going through the
            // string table: it can never be localized, and it is how a ported
            // screen ends up half-translated.
            if [
                "UI.Label",
                "UI.Button",
                "label(",
                "button(",
                "text =",
                ":SetText(",
                "setText(",
            ]
            .iter()
            .any(|k| line.contains(k))
            {
                for lit in string_literals(line) {
                    if lit.starts_with('#')
                        || lit.contains('%')
                        || lit.contains('/')
                        || lit.contains('\\')
                    {
                        continue;
                    }
                    let chars = lit.chars().count();
                    let words = lit.split_whitespace().count();
                    let cjk = has_cjk(&lit);
                    let prose =
                        words >= 2 && chars >= 6 && lit.chars().any(|c| c.is_ascii_alphabetic());
                    if (cjk && chars >= 2) || prose {
                        push(&mut findings, &rel, ln, "hardcoded-ui-text", "medium",
                             format!("界面文案写成了字面量 \"{lit}\"：多语言切换不会生效（原版这一处是 t(…) 取词表的）"),
                             "改走词表：t(\"key\")。游戏名/品牌字样等确实不翻译的，忽略本条");
                        break;
                    }
                }
            }
            // A "\n" reaching a Button by another path: the refresh loop writing
            // two-line content into a label that was measured/sized as one line
            // (the reference revert left exactly this behind).
            let writes_text = line.contains("setText(") || line.contains(":SetText(");
            let in_block = inside_button_block(&lines, i);
            // A helper whose name says button (`softButton(...)`, `bigButton(...)`)
            // still builds a Button inside — the "\n" handed to it is the same bug.
            let via_helper = !in_block && mentions_button_callee(line);
            if line.contains("\\n")
                && (in_block
                    || via_helper
                    || (writes_text
                        && text.contains("UI.Button")
                        && text.contains("MeasureTextWidth")))
            {
                let message = if in_block {
                    "Button 的 text 里带 \"\\n\"：该控件用单行文字绘制，换行符不是换行，整串按一行画出来并被边框裁到半个字".to_string()
                } else if via_helper {
                    "把带 \"\\n\" 的文本交给按钮类构造函数（helper 内部还是 Button）：Button 只有单行，「图标在上、文字在下」这种排布不会成立，会画成一行带个怪字符".to_string()
                } else {
                    "把带 \"\\n\" 的文本写进按钮类控件：Button 只有单行，构造时量的是单行宽度，刷新写两行必然溢出（若这行其实喂的是 Label，可忽略）".to_string()
                };
                push(&mut findings, &rel, ln, "ui-button-newline",
                     if in_block { "high" } else { "medium" },
                     message,
                     "控件只画一行：要两行（名称+费用）就用 Panel + 两个 Label；宽度按 UI.MeasureTextWidth 量出来，或用 UI.defaultAutoFitText = true + minFontSize 让它自己缩");
            }
            // Development self-test switches left on: DEV_SMOKE=true hijacks boot
            // (auto-play, parked on a finished run) and ships that way.
            if let Some(name) = dev_switch(line) {
                push(&mut findings, &rel, ln, "dev-switch-on", "high",
                     format!("开发自测开关 {name} = true 还开着：它会接管启动/玩法流程（自驱跑关、直接跳屏），用户打开预览看到的不是正常游戏"),
                     "交付前关掉（false 或删掉）；自测 harness 本体移到 verify/ 或加开关默认关。探针清理见 references/acceptance.md 第四节");
            }
            // The library's per-layout overflow check is the only mechanical
            // layout probe the transcription gets; it reports children that no
            // longer fit their container (a real finding in the reference port:
            // 344px of children in a 320px panel). A raise from its formatter is a
            // bug signal — a NaN/inf box — not noise to silence.
            if line.contains("SetOverflowWarnings(false)") {
                push(&mut findings, &rel, ln, "ui-overflow-check-off", "medium",
                     "关掉了 UI 库的布局溢出检查：它是转写期唯一的机械布局体检（会报出子控件超出容器的尺寸）",
                     "先查根因再决定要不要关：报错来自某个控件的 box 是非有限值（NaN/inf，常来自按未设置尺寸/0 缩放算出的 left/top 或 100% 尺寸的父面板）；修掉它，别把检查关掉");
            }
        }

        file_rules(&rel, &text, &lines, &mut findings);
    }

    let high = findings.iter().filter(|f| f.severity == "high").count();
    let med = findings.iter().filter(|f| f.severity == "medium").count();
    let low = findings.iter().filter(|f| f.severity == "low").count();

    // Delivery-freshness advisories, read from the working directory's
    // project-info.json when this lint ran on the conventional `<workdir>/dest`.
    // These are the two failures the reference fix round shipped with — a final
    // state nobody had screenshotted, and an alignment table left 94/94 empty —
    // and they are only visible here, in the command that actually runs every
    // round (nothing forces a re-`mark`, so the stage gates stay silent).
    if proj_root.file_name().and_then(|n| n.to_str()) == Some("dest") {
        let info = proj_root.parent().map(|p| p.join("project-info.json"));
        if let Some(info) = info {
            if info.is_file() {
                if let Ok(text) = read_text(&info) {
                    let arts = crate::workspace::read_artifacts(&text);
                    let base = info.parent().unwrap_or(Path::new("."));
                    let artifact_path = |k: &str| -> Option<PathBuf> {
                        arts.iter().find(|(key, _)| key == k).map(|(_, v)| {
                            let p = Path::new(v);
                            if p.is_absolute() {
                                p.to_path_buf()
                            } else {
                                base.join(p)
                            }
                        })
                    };
                    let mut newest_code: Option<std::time::SystemTime> = None;
                    for f in &files {
                        if let Ok(m) = std::fs::metadata(f) {
                            if let Ok(m) = m.modified() {
                                newest_code = Some(match newest_code {
                                    Some(prev) if prev > m => prev,
                                    _ => m,
                                });
                            }
                        }
                    }
                    if let (Some(shot), Some(code)) = (
                        artifact_path("screenshot").filter(|p| p.is_file()),
                        newest_code,
                    ) {
                        if let Ok(s) = std::fs::metadata(&shot).and_then(|m| m.modified()) {
                            if s < code {
                                push(
                                    &mut findings,
                                    "project-info.json",
                                    0,
                                    "evidence-stale",
                                    "medium",
                                    "记录的截图比 scripts/ 里最新的代码还旧：最后一轮改动没有留下画面证据（改完长什么样没人看过）",
                                    "重跑本机预览并重新截图，然后 t3m note project-info.json screenshot <新路径>",
                                );
                            }
                        }
                    }
                    if let Some(inv) = artifact_path("ui_inventory").filter(|p| p.is_file()) {
                        if let Ok(inv_text) = read_text(&inv) {
                            if let Some((rows, unfilled)) =
                                crate::workspace::unfilled_alignment_rows(&inv_text)
                            {
                                if unfilled > 0 {
                                    push(
                                        &mut findings,
                                        "project-info.json",
                                        0,
                                        "ui-alignment-unfilled",
                                        "medium",
                                        format!("UI 清单的对齐表还有 {unfilled}/{rows} 行没填：「Maker 实现 / 显隐条件」是空的，等于没有逐条对照过原版"),
                                        "把 source/UI_INVENTORY.md 第七节逐行填满（t3m mark ui 会拒绝未填的清单）；缺什么控件一填就暴露",
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if json {
        let mut out = String::from("{\n  \"summary\": {");
        out.push_str(&format!(
            "\"high\": {high}, \"medium\": {med}, \"low\": {low}, \"files\": {scanned}}} ,\n  \"findings\": [\n"
        ));
        for (i, f) in findings.iter().enumerate() {
            out.push_str(&format!(
                "    {{\"file\": \"{}\", \"line\": {}, \"rule\": \"{}\", \"severity\": \"{}\", \"message\": \"{}\"}}{}\n",
                f.file.replace('\\', "/"),
                f.line,
                f.rule,
                f.severity,
                f.message.replace('"', "'").replace('\n', " "),
                if i + 1 == findings.len() { "" } else { "," }
            ));
        }
        out.push_str("  ]\n}");
        crate::outln!("{out}");
    } else {
        let mut order: Vec<&Finding> = findings.iter().collect();
        order.sort_by_key(|f| match f.severity {
            "high" => 0,
            "medium" => 1,
            _ => 2,
        });
        for f in &order {
            crate::outln!(
                "{}:{}: [{}] {}: {}",
                f.file,
                f.line,
                f.severity,
                f.rule,
                f.message
            );
            crate::outln!("    fix: {}", f.fix);
        }
        crate::outln!(
            "\n{scanned} files scanned ({} lua, {} shader) — high {high}, medium {med}, low {low}",
            files.len(),
            shaders.len()
        );
        if high == 0 {
            crate::outln!("no high-severity transcription traps found");
        }
    }
    Ok((findings, scanned))
}
