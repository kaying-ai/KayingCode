//! `t3m ui` — extract the original game's UI ground truth into a transcription
//! inventory: containers, the CSS box model, every control (with its action
//! anchor, CSS class and label keys), the screen/navigation list, the keyboard
//! and pointer map, and the timing nodes that set the game's rhythm.
//!
//! Why this command exists: a web game's UI *is* a specification — a fixed set of
//! controls with fixed sizes, positions, labels, functions and visibility
//! conditions. "Rewrite it in the same spirit" is not transcription: a
//! transcription that invents a persistent toolbar where the original opened a
//! contextual menu at the tapped tile, or turns an icon button into a text
//! label, changes both the look and the interaction mechanism, and it does so
//! without any error anywhere. The reference transcription drifted exactly that
//! way, so this inventory is a required artifact of step 0 and
//! `t3m mark project-info.json ui` refuses to complete without it.
//!
//! Everything here is heuristic, dependency-free extraction (no DOM/CSS parser):
//! it is a *skeleton* that makes the original's control set and its numbers
//! visible. Anything a template string cannot show (controls created
//! dynamically, canvas-drawn UI, per-state styling) still has to be read out of
//! the source by hand.

use crate::util::{collect_files, read_text, CliResult};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// CSS declarations worth transcribing: the box model, type scale and the
/// paint/stacking bits that decide what sits on top of what.
const BOX_PROPS: &[&str] = &[
    "position",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "padding",
    "margin",
    "gap",
    "display",
    "flex",
    "flex-grow",
    "flex-direction",
    "align-items",
    "justify-content",
    "grid-template-columns",
    "border-radius",
    "font-size",
    "font-weight",
    "font-variant-numeric",
    "line-height",
    "color",
    "background",
    "opacity",
    "overflow",
    "z-index",
    "transform",
    "box-shadow",
    "text-align",
    "white-space",
    "pointer-events",
];

const ANCHOR_ATTRS: &[&str] = &[
    "data-a",
    "data-act",
    "data-action",
    "data-r",
    "data-read",
    "data-k",
    "data-i",
    "data-up",
    "data-sell",
    "data-m",
];

/// Interactive anchors, under either convention seen in the reference games:
/// `data-a="speed"` (Tower Guard) and `data-act="play"` (Frog Crossing).
fn is_interactive_anchor(name: &str) -> bool {
    matches!(name, "data-a" | "data-act" | "data-action")
}

/// A template expression (`data-a="${endless ? "…"}"`) is not a control name —
/// the real ones come from the branches; reporting the placeholder would be
/// permanent noise in the parity check.
fn is_concrete_anchor(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('$')
        && !value.contains('{')
        && !value.contains(char::is_whitespace)
}

#[derive(Clone)]
struct Anchor {
    attr: String,
    name: String,
    file: String,
    line: usize,
    class: String,
    keys: Vec<String>,
}

#[derive(Clone)]
struct Rule {
    selector: String,
    props: String,
}

struct Hit {
    file: String,
    line: usize,
    text: String,
}

/// Parse `selector { decls }` blocks, flattened through `@media`/`@supports`
/// wrappers (the prefix is kept in the selector so the reader sees why a rule is
/// conditional). Returns the rules in source order.
fn parse_css(text: &str) -> Vec<Rule> {
    let mut rules: Vec<Rule> = Vec::new();
    let mut prefixes: Vec<String> = Vec::new();
    let mut buf = String::new();
    let chars: Vec<char> = strip_css_comment_blocks(text).chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        match chars[i] {
            '{' => {
                let selector = buf.trim().to_string();
                buf.clear();
                if selector.starts_with('@') {
                    prefixes.push(selector);
                    i += 1;
                    continue;
                }
                // find the matching close brace
                let mut depth = 1usize;
                let mut j = i + 1;
                let mut decls = String::new();
                while j < chars.len() {
                    match chars[j] {
                        '{' => depth += 1,
                        '}' => {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        _ => {}
                    }
                    decls.push(chars[j]);
                    j += 1;
                }
                let props = keep_box_props(&decls);
                if !props.is_empty() {
                    let prefix = if prefixes.is_empty() {
                        String::new()
                    } else {
                        format!("{} ", prefixes.join(" > "))
                    };
                    rules.push(Rule {
                        selector: format!("{prefix}{selector}"),
                        props,
                    });
                }
                i = j + 1;
            }
            '}' => {
                prefixes.pop();
                buf.clear();
                i += 1;
            }
            ';' => {
                buf.clear();
                i += 1;
            }
            c => {
                buf.push(c);
                i += 1;
            }
        }
    }
    rules
}

/// Drop `/* … */` spans before parsing (a comment may contain braces).
fn strip_css_comment_blocks(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        match rest[start + 2..].find("*/") {
            Some(end) => rest = &rest[start + 2 + end + 2..],
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

fn keep_box_props(decls: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for decl in decls.split(';') {
        let Some((name, value)) = decl.split_once(':') else {
            continue;
        };
        let name = name.trim().to_ascii_lowercase();
        let value = value.trim();
        if BOX_PROPS.contains(&name.as_str()) || name.starts_with("--") {
            out.push(format!("{name}: {value}"));
        }
    }
    out.join("; ")
}

/// `<tag … attr="value" …>` attributes on one line, for the handful of names
/// that identify a control: `data-*`, `class`, `id`.
fn attrs_on_line(line: &str) -> Vec<(String, String)> {
    let bytes = line.as_bytes();
    let mut out: Vec<(String, String)> = Vec::new();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'=' && i > 0 {
            // name: walk back over identifier chars (including data-/aria-)
            let mut s = i;
            while s > 0 {
                let c = bytes[s - 1] as char;
                if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ':' || c == '@' {
                    s -= 1;
                } else {
                    break;
                }
            }
            let name = line[s..i].trim().to_ascii_lowercase();
            let mut v = i + 1;
            while v < bytes.len() && (bytes[v] as char).is_whitespace() {
                v += 1;
            }
            if v < bytes.len() && (bytes[v] == b'"' || bytes[v] == b'\'') {
                let quote = bytes[v];
                let mut value = String::new();
                let mut k = v + 1;
                while k < bytes.len() && bytes[k] != quote {
                    value.push(bytes[k] as char);
                    k += 1;
                }
                let keep = name.starts_with("data-")
                    || name == "class"
                    || name == "id"
                    || name.starts_with("aria-");
                if keep && !name.is_empty() {
                    out.push((name, value));
                }
                i = k + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// `t("speed")` / `t("stat_dmg")` label keys on a line — the control's text.
fn label_keys(line: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut rest = line;
    while let Some(pos) = rest.find("t(\"") {
        let after = &rest[pos + 3..];
        if let Some(end) = after.find('"') {
            let key = &after[..end];
            if !key.is_empty() && key.len() < 48 && !out.iter().any(|k| k == key) {
                out.push(key.to_string());
            }
        }
        rest = &rest[pos + 3..];
    }
    out
}

/// A `k === "x"` / `e.key === "Escape"` style binding: returns the literal.
fn key_literal(line: &str) -> Option<String> {
    for (idx, _) in line.match_indices("==") {
        let left = line[..idx].trim_end();
        let right = line[idx..].trim_start_matches('=');
        let recv: String = left
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '.')
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        let recv_l = recv.to_ascii_lowercase();
        let is_key_var = ["k", "key", "code", "e.key", "e.code", "ev.key", "event.key"]
            .iter()
            .any(|n| recv_l == *n);
        if !is_key_var {
            continue;
        }
        let value = right.trim_start();
        let quote = value.chars().next()?;
        if quote != '"' && quote != '\'' {
            continue;
        }
        let inner = &value[1..];
        if let Some(end) = inner.find(quote) {
            let lit = &inner[..end];
            if !lit.is_empty() && lit.len() < 24 {
                return Some(lit.to_string());
            }
        }
    }
    None
}

fn rel_of(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Collect the interactive-control anchors (`data-a`) from the fetched original.
/// Shared by the inventory renderer and `--check`.
fn data_a_anchors(dir: &Path) -> CliResult<Vec<Anchor>> {
    let mut html: Vec<PathBuf> = Vec::new();
    let mut js: Vec<PathBuf> = Vec::new();
    for ext in ["html", "htm"] {
        collect_files(dir, ext, &mut html)?;
    }
    for ext in ["js", "mjs"] {
        collect_files(dir, ext, &mut js)?;
    }
    let mut anchors: Vec<Anchor> = Vec::new();
    for f in html.iter().chain(js.iter()) {
        let rel = rel_of(dir, f);
        for (i, line) in read_text(f)?.lines().enumerate() {
            let attrs = attrs_on_line(line);
            let class = attrs
                .iter()
                .find(|(n, _)| n == "class")
                .map(|(_, v)| v.clone())
                .unwrap_or_default();
            let keys = label_keys(line);
            for (name, value) in attrs {
                if is_interactive_anchor(&name) && is_concrete_anchor(&value) {
                    anchors.push(Anchor {
                        attr: name,
                        name: value,
                        file: rel.clone(),
                        line: i + 1,
                        class: class.clone(),
                        keys: keys.clone(),
                    });
                }
            }
        }
    }
    Ok(anchors)
}

/// `t3m ui <source> --check <dest>` — the parity *lower bound*: every original
/// interactive control must have some counterpart in the port's UI code. A hit
/// only proves the string appears in UI-construction code — not that the
/// control's shape, position or visibility match (that is what the filled
/// alignment table and the screenshots are for). What it does catch is the
/// reference round's real failure mode: whole controls (pills, hero card,
/// contextual menus, ad-gift button) never attempted at all.
pub fn check(src: &Path, dest: &Path) -> CliResult<(usize, usize, String)> {
    let anchors = data_a_anchors(src)?;
    if anchors.is_empty() {
        return Ok((
            0,
            0,
            "# UI 对齐下限检查\n\n原版没有 data-a 控件锚点（canvas 自绘 UI 或非 DOM 界面）：本检查不适用，\n控件清单靠人工从源码整理。\n"
                .to_string(),
        ));
    }

    // Only lines that build/refresh UI widgets count as "the control exists in
    // the port" — a label key appearing in game logic or the i18n table proves
    // nothing.
    let mut scripts: Vec<PathBuf> = Vec::new();
    let scan_root = if dest.join("scripts").is_dir() {
        dest.join("scripts")
    } else {
        dest.to_path_buf()
    };
    collect_files(&scan_root, "lua", &mut scripts)?;
    scripts.sort();
    let mut ui_lines: Vec<(String, usize, String)> = Vec::new();
    for f in &scripts {
        let rel = rel_of(dest, f);
        for (i, line) in read_text(f)?.lines().enumerate() {
            // Both construction styles count: `button { … }` (table call) and
            // `softButton(…)` / `trowBtn(…)` (helper calls), plus property writes
            // that only exist on widgets. Case-insensitive: helpers are camelCase.
            let low = line.to_lowercase();
            let builds_ui = [
                "ui.button",
                "ui.panel",
                "ui.label",
                "ui.scrollview",
                "button{",
                "button {",
                "button(",
                "btn(",
                "label{",
                "label {",
                "label(",
                "panel{",
                "panel {",
                "panel(",
                "onClick",
                "act =",
                ":AddChild(",
                "SetText(",
                ":SetVisible(",
            ]
            .iter()
            .any(|k| low.contains(k));
            if builds_ui {
                ui_lines.push((rel.clone(), i + 1, line.to_string()));
            }
        }
    }

    let mut misses: Vec<(String, String, usize, Vec<String>)> = Vec::new();
    for a in &anchors {
        let mut tokens: Vec<String> = vec![a.name.clone()];
        tokens.extend(a.keys.iter().cloned());
        let hit = tokens
            .iter()
            .any(|t| t.len() >= 3 && ui_lines.iter().any(|(_, _, l)| l.contains(t.as_str())));
        if !hit {
            misses.push((a.name.clone(), a.file.clone(), a.line, a.keys.clone()));
        }
    }

    let total = anchors.len();
    let mut r = String::new();
    r.push_str("# UI 对齐下限检查（原版控件 → 转写代码）\n\n");
    r.push_str(&format!(
        "- 原版可操作控件（data-a）：{} 个；在转写 UI 代码里有字符串级对应的：{} 个；**缺失：{} 个**\n",
        total,
        total - misses.len(),
        misses.len()
    ));
    r.push_str("- 这是**下限**检查：命中只说明控件名/文案 key 出现在 UI 代码里，不证明形态、位置、\n  显隐条件正确（那靠对齐表与逐屏截图）；但「整个控件没有对应实现」一定会被它抓住。\n\n");
    if !misses.is_empty() {
        r.push_str("## 缺失的控件（需要补实现，或在交付说明里写明为什么不做）\n\n");
        for (name, file, line, keys) in &misses {
            r.push_str(&format!(
                "- `data-a=\"{}\"` — {}:{} {}\n",
                name,
                file,
                line,
                if keys.is_empty() {
                    String::new()
                } else {
                    format!(
                        "（文案 key: {}）",
                        keys.iter()
                            .map(|k| format!("`{k}`"))
                            .collect::<Vec<_>>()
                            .join(" ")
                    )
                }
            ));
        }
        r.push_str("\n");
    }
    if total - misses.len() > 0 {
        r.push_str(&format!(
            "已命中 {} / {}（命中清单略）。\n",
            total - misses.len(),
            total
        ));
    }
    Ok((misses.len(), total, r))
}

pub fn run(dir: &Path, out: Option<&Path>, json: bool, verbose: bool) -> CliResult<String> {
    let mut html: Vec<PathBuf> = Vec::new();
    let mut css: Vec<PathBuf> = Vec::new();
    let mut js: Vec<PathBuf> = Vec::new();
    for ext in ["html", "htm"] {
        collect_files(dir, ext, &mut html)?;
    }
    collect_files(dir, "css", &mut css)?;
    for ext in ["js", "mjs"] {
        collect_files(dir, ext, &mut js)?;
    }
    html.sort();
    css.sort();
    js.sort();
    if html.is_empty() && css.is_empty() && js.is_empty() {
        return Err(crate::util::CliError(format!(
            "no .html/.css/.js under {} — run `t3m fetch <url> --out <dir>` first",
            dir.display()
        )));
    }

    // ---- containers (page roots) ------------------------------------------
    let mut containers: Vec<Hit> = Vec::new();
    for f in &html {
        let rel = rel_of(dir, f);
        for (i, line) in read_text(f)?.lines().enumerate() {
            for (name, value) in attrs_on_line(line) {
                if name == "id" && !value.is_empty() {
                    containers.push(Hit {
                        file: rel.clone(),
                        line: i + 1,
                        text: format!("#{value}"),
                    });
                }
            }
        }
    }

    // ---- CSS box model ----------------------------------------------------
    let mut rules: Vec<(String, Rule)> = Vec::new();
    for f in &css {
        let rel = rel_of(dir, f);
        for rule in parse_css(&read_text(f)?) {
            rules.push((rel.clone(), rule));
        }
    }
    // class token -> box props (first rule wins for a token)
    let mut by_class: BTreeMap<String, String> = BTreeMap::new();
    for (_, rule) in &rules {
        for token in rule
            .selector
            .split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        {
            if token.is_empty() {
                continue;
            }
            by_class
                .entry(token.to_string())
                .or_insert_with(|| rule.props.clone());
        }
    }

    // ---- controls ---------------------------------------------------------
    let mut anchors: Vec<Anchor> = Vec::new();
    for f in html.iter().chain(js.iter()) {
        let rel = rel_of(dir, f);
        for (i, line) in read_text(f)?.lines().enumerate() {
            let attrs = attrs_on_line(line);
            let class = attrs
                .iter()
                .find(|(n, _)| n == "class")
                .map(|(_, v)| v.clone())
                .unwrap_or_default();
            let keys = label_keys(line);
            for (name, value) in attrs {
                if ANCHOR_ATTRS.contains(&name.as_str()) && is_concrete_anchor(&value) {
                    anchors.push(Anchor {
                        attr: name,
                        name: value,
                        file: rel.clone(),
                        line: i + 1,
                        class: class.clone(),
                        keys: keys.clone(),
                    });
                }
            }
        }
    }

    // ---- layout skeleton: class tokens used by the markup ---------------------
    // Interactive anchors are not the whole screen: the wallet chips, the
    // settings corner, the credit line and the menu column are plain containers
    // (`.wallet` / `.corner` / `.credit` / `.tmenu`). Nothing anchors them, so a
    // port can pass the control check while the whole top-left block is missing —
    // the reference title screen shipped without its star/gem chips and gear.
    let mut skeleton: Vec<(String, String, usize)> = Vec::new();
    for f in html.iter().chain(js.iter()) {
        let rel = rel_of(dir, f);
        for (i, line) in read_text(f)?.lines().enumerate() {
            for (name, value) in attrs_on_line(line) {
                if name != "class" {
                    continue;
                }
                for token in value.split_whitespace() {
                    if token.is_empty() || !by_class.contains_key(token) {
                        continue; // only classes that actually carry a box model
                    }
                    if skeleton.iter().any(|(t, _, _)| t == token) {
                        continue;
                    }
                    skeleton.push((token.to_string(), rel.clone(), i + 1));
                }
            }
        }
    }
    skeleton.sort();

    // ---- screens / navigation --------------------------------------------
    let mut screens: Vec<Hit> = Vec::new();
    let mut nav_keys: Vec<String> = Vec::new();
    let mut screen_calls: Vec<Hit> = Vec::new();
    let mut keys: Vec<(String, Hit)> = Vec::new();
    let mut listeners: Vec<Hit> = Vec::new();
    let mut timers: Vec<Hit> = Vec::new();
    let mut in_nav_block = false;
    for f in &js {
        let rel = rel_of(dir, f);
        let text = read_text(f)?;
        for (i, line) in text.lines().enumerate() {
            let trim = line.trim();
            if trim.contains("Object.assign(nav") {
                in_nav_block = true;
                continue;
            }
            if in_nav_block {
                if trim.starts_with("});") || trim == "}" {
                    in_nav_block = false;
                } else {
                    let name: String = trim
                        .chars()
                        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                        .collect();
                    if !name.is_empty()
                        && (trim.contains('(') || trim.contains(":"))
                        && !nav_keys.iter().any(|k| *k == name)
                    {
                        nav_keys.push(name);
                    }
                }
            }
            if line.contains(".screen") {
                for lit in string_after_eq(line) {
                    if !screens.iter().any(|s| s.text == lit) {
                        screens.push(Hit {
                            file: rel.clone(),
                            line: i + 1,
                            text: lit,
                        });
                    }
                }
            }
            if line.contains("openScreen(") || line.contains("closeScreen(") {
                screen_calls.push(Hit {
                    file: rel.clone(),
                    line: i + 1,
                    text: trim.chars().take(110).collect(),
                });
            }
            if let Some(lit) = key_literal(line) {
                keys.push((
                    lit,
                    Hit {
                        file: rel.clone(),
                        line: i + 1,
                        text: trim.chars().take(110).collect(),
                    },
                ));
            }
            for ev in [
                "addEventListener(\"keydown",
                "addEventListener(\"pointer",
                "addEventListener(\"touch",
                "addEventListener(\"click",
                "addEventListener(\"contextmenu",
            ] {
                if line.contains(ev) {
                    listeners.push(Hit {
                        file: rel.clone(),
                        line: i + 1,
                        text: trim.chars().take(110).collect(),
                    });
                }
            }
            let is_timer = line.contains("setTimeout(")
                || (line.contains("const ")
                    && line.contains('=')
                    && line.to_ascii_uppercase().contains("_GAP"))
                || line.contains("warmup")
                || line.contains("autoStart")
                || line.contains("G.speed =")
                || line.contains("pauseReasons");
            if is_timer && timers.len() < 40 {
                timers.push(Hit {
                    file: rel.clone(),
                    line: i + 1,
                    text: trim.chars().take(120).collect(),
                });
            }
        }
    }

    // ---- report -----------------------------------------------------------
    let box_of = |class: &str| -> String {
        let mut parts: Vec<String> = Vec::new();
        for token in class.split_whitespace() {
            if let Some(props) = by_class.get(token) {
                parts.push(format!(".{token} → {props}"));
            }
        }
        parts.join(" ｜ ")
    };
    let mut r = String::new();
    r.push_str("# UI 转写清单（从原版源码提取）\n\n");
    r.push_str(&format!("- 源目录：`{}`\n", dir.display()));
    r.push_str(&format!(
        "- 扫描：HTML {} 个 / CSS {} 个 / JS {} 个；控件锚点 {} 个，CSS 规则（含盒子模型）{} 条\n",
        html.len(),
        css.len(),
        js.len(),
        anchors.len(),
        rules.len()
    ));
    r.push_str(
        "- 这是**骨架**：模板字符串里看不见的东西（动态创建的控件、canvas 自绘、逐状态样式、\n  \
         动画过渡）要回源码人工补齐。**位置与尺寸按 CSS 原值直译，功能与显隐条件逐条对照，\n  \
         不得新增原版没有的常驻控件，也不得把弹窗改成常驻栏。**\n\
         - 第三节的「布局骨架」是**没有 data-* 锚点**的静态件与容器（钱包 chip、右上角按钮、菜单列、页脚…）：\n  \
         它们同样是规格的一部分，漏掉就会「首页差很多」。\n\
         - 文案 key 必须在词表里有定义：查找失败会原样显示 key（实测端上出现过按钮写着 `paints`）。\n\n",
    );
    r.push_str("## 一、页面容器\n\n");
    if containers.is_empty() {
        r.push_str("_未在 HTML 里找到 id 容器（可能整页由 canvas 绘制）_\n");
    } else {
        for c in &containers {
            r.push_str(&format!("- `{}` — {}:{}\n", c.text, c.file, c.line));
        }
    }
    r.push_str("\n## 二、CSS 盒子模型（位置/尺寸/字号/层级）\n\n");
    if rules.is_empty() {
        r.push_str("_未解析到 CSS 规则_\n");
    } else {
        r.push_str("| 选择器 | 关键声明 |\n|---|---|\n");
        for (rel, rule) in &rules {
            r.push_str(&format!(
                "| `{}` ({}) | {} |\n",
                rule.selector.replace('|', "\\|"),
                rel,
                rule.props.replace('|', "\\|")
            ));
        }
    }

    r.push_str("\n## 三、控件清单\n\n");
    let group = |attr: &str, title: &str, r: &mut String| {
        let list: Vec<&Anchor> = anchors.iter().filter(|a| a.attr == attr).collect();
        if list.is_empty() {
            return;
        }
        r.push_str(&format!("### {attr} — {title}\n\n"));
        r.push_str(
            "| 名称 | 定位（file:line） | class | 盒子模型 | 文案 key |\n|---|---|---|---|---|\n",
        );
        for a in list {
            r.push_str(&format!(
                "| `{}` | {}:{} | `{}` | {} | {} |\n",
                a.name,
                a.file,
                a.line,
                a.class,
                box_of(&a.class),
                if a.keys.is_empty() {
                    "—".to_string()
                } else {
                    a.keys
                        .iter()
                        .map(|k| format!("`{k}`"))
                        .collect::<Vec<_>>()
                        .join(" ")
                }
            ));
        }
        r.push('\n');
    };
    group(
        "data-a",
        "可操作控件（按钮/可点区域，data-a/data-act）",
        &mut r,
    );
    group("data-act", "可操作控件（data-act 惯例）", &mut r);
    group("data-r", "读数与状态节点（每帧刷新的文本/填充）", &mut r);
    group("data-k", "数据驱动控件（按列表生成，如建造项）", &mut r);
    for attr in ["data-i", "data-up", "data-sell", "data-m"] {
        group(attr, "数据驱动控件（升级/出售/模式等）", &mut r);
    }
    if anchors.is_empty() {
        r.push_str("_未发现 data-* 控件锚点：原版可能用 id/class 选取控件，请人工列清单_\n\n");
    }

    r.push_str("### 布局骨架（模板里出现、且带 CSS 的 class）\n\n");
    r.push_str(
        "没有 `data-*` 锚点的静态件与容器——读写数值的 chip、绝对定位的顶栏/角落、菜单列、页脚——\n\
         一样是界面的一部分，漏掉它们就是\"首页差很多\"。逐个对照 CSS 盒子模型转：\n\n",
    );
    if skeleton.is_empty() {
        r.push_str("_未在模板里找到带样式的 class（可能整页由 canvas 绘制）_\n\n");
    } else {
        r.push_str("| class | 首次出现 | 盒子模型 |\n|---|---|---|\n");
        for (token, file, line) in &skeleton {
            r.push_str(&format!(
                "| `.{token}` | {file}:{line} | {} |\n",
                by_class
                    .get(token)
                    .map(|p| p.replace('|', "\\|"))
                    .unwrap_or_default()
            ));
        }
        r.push('\n');
    }

    r.push_str("## 四、屏幕与导航\n\n");
    if !nav_keys.is_empty() {
        r.push_str(&format!(
            "- 导航入口（`Object.assign(nav, …)`）：{}\n",
            nav_keys
                .iter()
                .map(|k| format!("`{k}`"))
                .collect::<Vec<_>>()
                .join(" / ")
        ));
    }
    if screens.is_empty() {
        r.push_str("- _未找到 `.screen` 赋值；屏幕名可能由其它变量承载_\n");
    } else {
        r.push_str("- 屏幕名：\n");
        for s in &screens {
            r.push_str(&format!("  - `{}` — {}:{}\n", s.text, s.file, s.line));
        }
    }
    if !screen_calls.is_empty() {
        r.push_str("- 开/关屏调用（换屏必须延迟到 UI 派发之外）：\n");
        for s in screen_calls.iter().take(12) {
            r.push_str(&format!("  - {}:{} `{}`\n", s.file, s.line, s.text));
        }
    }

    r.push_str("\n## 五、输入映射（键盘/指针）\n\n");
    if keys.is_empty() {
        r.push_str("_未识别到按键绑定（比较变量可能不叫 k/key/code）_\n");
    } else {
        let mut seen: Vec<String> = Vec::new();
        for (lit, hit) in &keys {
            if seen.contains(lit) {
                continue;
            }
            seen.push(lit.clone());
            r.push_str(&format!(
                "- `{}` ← {}:{}  `{}`\n",
                if lit == " " { "Space" } else { lit.as_str() },
                hit.file,
                hit.line,
                hit.text
            ));
        }
    }
    if !listeners.is_empty() {
        r.push_str("\n指针/键盘监听：\n");
        for l in &listeners {
            r.push_str(&format!("- {}:{} `{}`\n", l.file, l.line, l.text));
        }
    }

    r.push_str("\n## 六、节奏与计时节点（逐条对齐，否则游戏节奏会变）\n\n");
    if timers.is_empty() {
        r.push_str("_未发现 setTimeout / 常量计时_\n");
    } else {
        for t in &timers {
            r.push_str(&format!("- {}:{} `{}`\n", t.file, t.line, t.text));
        }
    }

    r.push_str("\n## 七、逐条对齐表（把最后一列填满，再开始写控件代码）\n\n");
    r.push_str("| # | 原版控件/节点 | 位置与尺寸（按 CSS 直译） | 功能与触发 | Maker 实现（填写） | 显隐条件（填写） |\n");
    r.push_str("|---|---|---|---|---|---|\n");
    let mut n = 0usize;
    for a in anchors.iter().filter(|a| is_interactive_anchor(&a.attr)) {
        n += 1;
        r.push_str(&format!(
            "| {} | `data-a=\"{}\"`（{}） | {} | {} |  |  |\n",
            n,
            a.name,
            a.class,
            box_of(&a.class).replace('|', "\\|"),
            a.keys
                .iter()
                .map(|k| format!("文案 `{k}`"))
                .collect::<Vec<_>>()
                .join(" ")
        ));
    }
    for s in &screens {
        n += 1;
        r.push_str(&format!(
            "| {} | 屏幕 `{}` | — | 触发：填写 |  |  |\n",
            n, s.text
        ));
    }
    for (token, file, line) in &skeleton {
        // Only containers / positioned / circular pieces land in the alignment
        // table: a font-size modifier on a span is geometry reference material,
        // not something to implement one by one.
        let props = by_class.get(token).map(|s| s.as_str()).unwrap_or("");
        let structural = props.contains("position: absolute")
            || props.contains("display: flex")
            || props.contains("display: grid")
            || props.contains("border-radius: 50%");
        if !structural {
            continue;
        }
        n += 1;
        r.push_str(&format!(
            "| {} | 骨架 `.{token}`（{file}:{line}） | {} | 原版用途：填写 |  |  |
",
            n,
            props.replace('|', "\\|")
        ));
    }
    for t in timers.iter().take(12) {
        n += 1;
        r.push_str(&format!(
            "| {} | 计时 {}:{} | — | `{}` |  |  |\n",
            n,
            t.file,
            t.line,
            t.text.replace('|', "\\|")
        ));
    }

    r.push_str("\n## 八、转写铁律（这七条就是本清单的用法）\n\n");
    r.push_str(
        "1. **控件 1:1**：原版有几个控件就转几个；不合并、不拆分、不新增、不删（列表项按数据生成）。\n\
         2. **位置与尺寸直译**：CSS 的 px 值直接进控件 props（`position/left/top/width/height/padding/gap/font-size/border-radius`）；\n   \
            常驻的用绝对定位钉在同一个角，锚定弹窗要按同一规则算锚点（见 references/ui-parity.md）。\n\
         3. **功能不变**：每个控件的 onClick 必须对应原版同一个动作；原版没有的常驻栏不要加。\n\
         4. **显隐条件一起转**：`hidden/on/pulse/poor/lock/sel/ready/down` 这些状态类决定控件何时出现、\n   \
            何时禁用、文案何时替换——只转静态样式等于丢了一半交互。\n\
         5. **弹窗锚定，不改常驻**：原版在点到的格子/塔上弹菜单的，不要改成常驻工具条。\n\
         6. **流程与触发一致**：屏幕集合、每个换屏的触发方式、键盘层、\n   \
            以及\"谁来开始第一波\"必须与原版一致（见本清单四、五节）。\n\
         7. **节奏节点一致**：速度档位与其持久化、波次间隔/提前召唤奖励、教程提示时序、\n   \
            横幅与提示条、暂停菜单项、结算可达性——按第六节逐条对齐。\n",
    );

    if json {
        let mut j = String::new();
        j.push_str("{\n");
        j.push_str(&format!(
            "  \"source\": \"{}\",\n",
            dir.display().to_string().replace('\\', "/")
        ));
        j.push_str(&format!(
            "  \"counts\": {{\"html\": {}, \"css\": {}, \"js\": {}, \"anchors\": {}, \"css_rules\": {}, \"screens\": {}, \"keys\": {}}},\n",
            html.len(),
            css.len(),
            js.len(),
            anchors.len(),
            rules.len(),
            screens.len(),
            keys.len()
        ));
        j.push_str("  \"anchors\": [\n");
        for (i, a) in anchors.iter().enumerate() {
            j.push_str(&format!(
                "    {{\"attr\": \"{}\", \"name\": \"{}\", \"file\": \"{}\", \"line\": {}, \"class\": \"{}\", \"keys\": [{}]}}{}\n",
                a.attr,
                a.name.replace('"', "'"),
                a.file,
                a.line,
                a.class.replace('"', "'"),
                a.keys.iter().map(|k| format!("\"{k}\"")).collect::<Vec<_>>().join(", "),
                if i + 1 == anchors.len() { "" } else { "," }
            ));
        }
        j.push_str("  ],\n  \"screens\": [");
        j.push_str(
            &screens
                .iter()
                .map(|s| format!("\"{}\"", s.text.replace('"', "'")))
                .collect::<Vec<_>>()
                .join(", "),
        );
        j.push_str("],\n  \"keys\": [");
        j.push_str(
            &keys
                .iter()
                .map(|(k, h)| {
                    format!(
                        "{{\"key\": \"{}\", \"file\": \"{}\", \"line\": {}}}",
                        k.replace('"', "'"),
                        h.file,
                        h.line
                    )
                })
                .collect::<Vec<_>>()
                .join(", "),
        );
        j.push_str("]\n}\n");
        let report = j;
        if let Some(path) = out {
            crate::util::write_text(path, &report)?;
        }
        let _ = verbose;
        return Ok(report);
    }

    if let Some(path) = out {
        crate::util::write_text(path, &r)?;
    }
    let _ = verbose;
    Ok(r)
}

/// String literals assigned to / compared against a `…screen` variable:
/// `G.screen = "play"`, `G.screen !== "play"`. Only these — the surrounding line
/// may mention other things (`tip(t("tut1"))` next to a screen guard).
fn string_after_eq(line: &str) -> Vec<String> {
    let b = line.as_bytes();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i < b.len() {
        if b[i] as char != '=' {
            i += 1;
            continue;
        }
        let op_start = i;
        let mut j = i;
        while j < b.len() && b[j] as char == '=' {
            j += 1;
        }
        // identifier immediately before the operator, ignoring spaces
        let mut k = op_start;
        while k > 0 && (b[k - 1] as char).is_whitespace() {
            k -= 1;
        }
        let mut e = k;
        while e > 0 {
            let c = b[e - 1] as char;
            if c.is_ascii_alphanumeric() || c == '_' || c == '.' {
                e -= 1;
            } else {
                break;
            }
        }
        let ident = line[e..k].to_ascii_lowercase();
        if ident.ends_with("screen") {
            let mut v = j;
            while v < b.len() && (b[v] as char).is_whitespace() {
                v += 1;
            }
            if v < b.len() && (b[v] as char == '"' || b[v] as char == '\'') {
                let quote = b[v];
                let mut s = v + 1;
                let mut value = String::new();
                while s < b.len() && b[s] != quote {
                    value.push(b[s] as char);
                    s += 1;
                }
                if !value.is_empty() && value.len() < 24 {
                    out.push(value);
                }
                i = s + 1;
                continue;
            }
        }
        i = j.max(i + 1);
    }
    out
}
