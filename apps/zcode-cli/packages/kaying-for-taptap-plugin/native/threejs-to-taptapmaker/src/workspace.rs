//! t3m init — create one isolated working directory per game transcription.
//!
//! Layout (created under the current directory unless --dir is given):
//!
//! ```text
//! convert_game_YYYYMMDDHHMMSS/
//! ├─ project-info.json   project metadata: name, source url, tool versions,
//! │                       created time, per-stage status and artifact paths
//! ├─ source/             original web game files (t3m fetch --out …/source)
//! └─ dest/               the TapTap Maker game project (taptap-maker init here)
//! ```
//!
//! `init` never touches the network and never invokes `taptap-maker`; it only
//! lays out the directory and writes `project-info.json` (JSON is assembled by
//! hand so the crate stays dependency-free). Later stages update the status
//! fields of `project-info.json` — see [`mark`] and [`note_artifact`].

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::util::{ensure_dir, write_text, CliError, CliResult};

/// Directory prefix, followed by the local timestamp `YYYYMMDDHHMMSS`.
pub const DIR_PREFIX: &str = "convert_game_";

/// Stages tracked in `project-info.json`, in pipeline order.
pub const STAGES: &[&str] = &[
    "fetch",
    "analyze",
    "levels",
    "rules",
    "board",
    "character",
    "decoration",
    "ui",
    "audio",
    "accept",
];

/// Persistent source-fact ledger created by `init`; `accept` warns when it is
/// missing, empty, still a template, or has no `file:line` evidence.
pub const SOURCE_NOTES_REL: &str = "source/SOURCE_NOTES.md";
/// Directory for the pre-coding source audits.
pub const SOURCE_AUDIT_REL: &str = "source/audit";

const SOURCE_NOTES_TEMPLATE: &str = r#"# SOURCE_NOTES

> 转写铁律：截图/对比图只回答“哪里不一样”，不回答“应该改成什么”。
> 每条已确认事实必须带 `file:line` + 值/分支/资源 + 期望行为；上下文压缩前更新，压缩后先读它。

## 已确认事实

| 主题 | 证据 | 结论 | 验证方式 |
|---|---|---|---|
| （待填） | `source/game/...:行号` | … | … |

## 未确认/待验证

- （待填）
"#;

const SOURCE_AUDIT_README: &str = r#"# source/audit

转写前/检查点补齐以下审计；每条结论带 `file:line`，已确认事实同步到 `../SOURCE_NOTES.md`。

- `control-flow.md`：URL 参数/feature flag/主路径 vs fallback/模型选择/每角色覆盖
- `shaders.md`：`onBeforeCompile`/`ShaderMaterial`/`customProgramCacheKey`/`onBeforeRender`
- `materials.md`：baseColor/metallic/roughness/clearcoat/emissiveStrength/doubleSided/COLOR_0/texture/UV/tangent
- `models.md`：id/显示名/模型/图集/颜色映射
- `animations.md`：车轮/Wob_/眨眼/头部/UI tween 与目标实现状态
- `lighting.md`：标题/比赛太阳、阴影相机/bias、色调映射、Bloom/DOF/环境贴图
- `ui.md`：控件与骨架件对照

截图/对比图只用于发现差异；修复前先在这里找到源码 owner，再把 `source_evidence` 写进
`project-info.json` 的 `visual_fixes`（`t3m note project-info.json visual_fixes source/audit/visual-fixes.md`）。
"#;

/// Create the working directory and write the initial `project-info.json`.
///
/// Returns the created directory path. Fails if it already exists — a new
/// timestamp means a new transcription, never silently reuse one.
pub fn run(url: &str, name: Option<&str>, parent: &Path, t3m_version: &str) -> CliResult<PathBuf> {
    let stamp = local_stamp();
    let dir = parent.join(format!("{DIR_PREFIX}{stamp}"));
    if dir.exists() {
        return Err(CliError(format!(
            "working directory {} already exists; wait a second and retry",
            dir.display()
        )));
    }
    ensure_dir(&dir.join("source"))?;
    ensure_dir(&dir.join(SOURCE_AUDIT_REL))?;
    ensure_dir(&dir.join("dest"))?;
    write_text(&dir.join(SOURCE_NOTES_REL), SOURCE_NOTES_TEMPLATE)?;
    write_text(
        &dir.join(SOURCE_AUDIT_REL).join("README.md"),
        SOURCE_AUDIT_README,
    )?;

    let project_name = name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| guess_name(url));

    let info = initial_info(&project_name, url, t3m_version, &stamp);
    write_text(&dir.join("project-info.json"), &info)?;

    crate::outln!("created {}", dir.display());
    crate::outln!("  project-info.json  项目信息（名称/地址/版本/阶段状态）");
    crate::outln!(
        "  source/            原版文件（下一步: t3m fetch <url> --out {}/source）",
        dir.display()
    );
    crate::outln!("  {SOURCE_NOTES_REL}  源码事实台账（每条带 file:line；压缩前更新）");
    crate::outln!(
        "  {SOURCE_AUDIT_REL}/  control-flow/shaders/materials/models/animations/lighting/ui 审计"
    );
    crate::outln!("  dest/              Maker 工程（在其中执行 taptap-maker init）");
    Ok(dir)
}

/// Guess a filesystem-safe project name from the game URL:
/// last non-empty path segment, lowercased, non-alnum → `-`.
fn guess_name(url: &str) -> String {
    let no_query = url.split(['?', '#']).next().unwrap_or(url);
    let no_scheme = no_query
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(no_query);
    let segment = no_scheme
        .split('/')
        .filter(|s| !s.is_empty())
        .next_back()
        .unwrap_or("game");
    let segment = segment.split('.').next().unwrap_or(segment);
    let mut out = String::new();
    for ch in segment.chars().flat_map(|c| c.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "game".to_string()
    } else {
        out
    }
}

/// Current local time as `YYYYMMDDHHMMSS` (UTC+8, Asia/Shanghai).
/// Uses a fixed +8h offset instead of libc localtime so the result is stable
/// across platforms without extra dependencies.
fn local_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        + 8 * 3600;
    let days = secs / 86400;
    let time = secs % 86400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}{:02}{:02}{:02}{:02}{:02}",
        year,
        month,
        day,
        time / 3600,
        (time % 3600) / 60,
        time % 60
    )
}

/// Days since 1970-01-01 → (year, month, day). Howard Hinnant's civil_from_days.
fn civil_from_days(z: u64) -> (i64, u64, u64) {
    let z = z as i64 + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146097) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m as u64, d as u64)
}

/// Minimal JSON string escaping (quotes, backslashes, control chars).
pub fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn initial_info(name: &str, url: &str, t3m_version: &str, stamp: &str) -> String {
    let stages: Vec<String> = STAGES
        .iter()
        .map(|s| format!("      \"{s}\": \"pending\""))
        .collect();
    format!(
        concat!(
            "{{\n",
            "  \"name\": \"{name}\",\n",
            "  \"source_url\": \"{url}\",\n",
            "  \"work_dir\": \"convert_game_{stamp}\",\n",
            "  \"created_at\": \"{stamp}\",\n",
            "  \"t3m_version\": \"{t3m}\",\n",
            "  \"paths\": {{\n",
            "    \"info\": \"project-info.json\",\n",
            "    \"source\": \"source\",\n",
            "    \"dest\": \"dest\"\n",
            "  }},\n",
            "  \"stages\": {{\n",
            "{stages}\n",
            "  }},\n",
            "  \"artifacts\": {{\n",
            "      \"source_preview_url\": \"{url}\"\n",
            "  }},\n",
            "  \"notes\": \"\"\n",
            "}}\n"
        ),
        name = json_escape(name),
        url = json_escape(url),
        stamp = stamp,
        t3m = json_escape(t3m_version),
        stages = stages.join(",\n"),
    )
}

/// The `"key": "value"` pairs of the `artifacts` object (string values only,
/// which is all `note_artifact` ever writes).
///
/// Values may contain commas (`pixel_stats` records "mean=…, L p50=…"), so the
/// block is scanned as quoted tokens instead of split on separators.
pub(crate) fn read_artifacts(text: &str) -> Vec<(String, String)> {
    let Some(pos) = text.find("\"artifacts\"") else {
        return Vec::new();
    };
    let Some(open) = text[pos..].find('{').map(|i| pos + i) else {
        return Vec::new();
    };
    let rest = &text[open + 1..];
    let end = rest.find('}').unwrap_or(rest.len());
    let mut tokens: Vec<String> = Vec::new();
    let mut chars = rest[..end].chars();
    while let Some(c) = chars.next() {
        if c != '"' {
            continue;
        }
        let mut cur = String::new();
        while let Some(c2) = chars.next() {
            match c2 {
                '\\' => {
                    if let Some(esc) = chars.next() {
                        cur.push(esc);
                    }
                }
                '"' => break,
                other => cur.push(other),
            }
        }
        tokens.push(cur);
    }
    tokens
        .chunks(2)
        .filter(|c| c.len() == 2)
        .map(|c| (c[0].clone(), c[1].clone()))
        .collect()
}

fn artifact<'a>(arts: &'a [(String, String)], key: &str) -> Option<&'a str> {
    arts.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

fn resolve_artifact_path(base: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    }
}

fn find_ancestor_file(base: &Path, relative_path: &Path) -> Option<PathBuf> {
    base.ancestors()
        .map(|ancestor| ancestor.join(relative_path))
        .find(|candidate| candidate.is_file())
}

fn target_project_dir(arts: &[(String, String)], base: &Path) -> Option<PathBuf> {
    if let Some(value) = artifact(arts, "dest_project") {
        let path = resolve_artifact_path(base, value);
        if path.is_dir() {
            return Some(path);
        }
    }
    let fallback = base.join("dest");
    fallback.is_dir().then_some(fallback)
}

fn newest_target_script(arts: &[(String, String)], base: &Path) -> Option<std::time::SystemTime> {
    let project = target_project_dir(arts, base)?;
    let mut files = Vec::new();
    crate::util::collect_files(&project.join("scripts"), "lua", &mut files).ok()?;
    files
        .iter()
        .filter_map(|file| std::fs::metadata(file).ok()?.modified().ok())
        .max()
}

/// Parse the `visual_fixes` table and require a non-empty `source_evidence`
/// cell on every data row. A substring check is not enough: a template/header
/// plus one empty row used to pass as evidence.
fn visual_fixes_evidence_issue(text: &str) -> Option<String> {
    let mut evidence_column: Option<usize> = None;
    let mut data_rows = 0usize;
    for (index, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if !trimmed.starts_with('|') {
            continue;
        }
        let cells: Vec<&str> = trimmed
            .trim_matches('|')
            .split('|')
            .map(str::trim)
            .collect();
        if let Some(column) = cells
            .iter()
            .position(|cell| cell.eq_ignore_ascii_case("source_evidence"))
        {
            evidence_column = Some(column);
            continue;
        }
        let separator = cells.iter().all(|cell| {
            !cell.is_empty() && cell.chars().all(|ch| ch == '-' || ch == ':' || ch == ' ')
        });
        if separator {
            continue;
        }
        let Some(column) = evidence_column else {
            continue;
        };
        data_rows += 1;
        let value = cells.get(column).copied().unwrap_or("");
        let has_evidence = !value.is_empty()
            && value != "—"
            && value != "-"
            && (value.contains("file:")
                || value.contains(".js:")
                || value.contains(".html:")
                || value.contains(".lua:")
                || value.contains(".xml")
                || value.contains(".glb")
                || value.contains(".json"));
        if !has_evidence {
            return Some(format!(
                "visual_fixes 第 {} 行缺有效 source_evidence: {trimmed}",
                index + 1
            ));
        }
    }
    if evidence_column.is_none() {
        return Some("visual_fixes 没有 source_evidence 列".into());
    }
    if data_rows == 0 {
        return Some("visual_fixes 没有数据行".into());
    }
    None
}

/// Warnings for the source-first evidence ledger. These are deliberately soft
/// (warnings, not a hard gate) in the first rollout: existing projects should
/// keep accepting, while missing evidence becomes visible and actionable.
fn source_evidence_warnings(
    arts: &[(String, String)],
    base: &Path,
    newest_target_code: Option<std::time::SystemTime>,
) -> Vec<String> {
    let mut warnings = Vec::new();

    match crate::util::read_text(&base.join(SOURCE_NOTES_REL)) {
        Err(_) => warnings.push(format!(
            "accept 缺 {SOURCE_NOTES_REL} —— 没有源码事实台账；t3m init 会生成模板，补完后重试"
        )),
        Ok(text) => {
            if text.trim().is_empty() {
                warnings.push(format!(
                    "{SOURCE_NOTES_REL} 是空文件；至少记录关键事实与 file:line"
                ));
            } else if text.contains("（待填）") {
                warnings.push(format!(
                    "{SOURCE_NOTES_REL} 仍是模板（含“（待填）”）；填入已确认事实后再 accept"
                ));
            } else if !text.contains("file:")
                && !text.contains("行号")
                && !text.contains(".js:")
                && !text.contains(".html:")
                && !text.contains(".lua:")
            {
                warnings.push(format!(
                    "{SOURCE_NOTES_REL} 没有 file:line 证据；关键事实必须能回源码核对"
                ));
            }
        }
    }

    match artifact(arts, "visual_fixes") {
        None => warnings.push(
            "accept 缺 artifacts.visual_fixes —— 视觉修复没有源码证据台账；\
             t3m note project-info.json visual_fixes source/audit/visual-fixes.md"
                .into(),
        ),
        Some(value) => {
            let path = resolve_artifact_path(base, value);
            match crate::util::read_text(&path) {
                Err(_) => {
                    warnings.push(format!("artifacts.visual_fixes 指向的文件不存在: {value}"))
                }
                Ok(text) => {
                    if let Some(issue) = visual_fixes_evidence_issue(&text) {
                        warnings.push(issue);
                    }
                }
            }
        }
    }

    match artifact(arts, "gameplay_screenshot") {
        None => warnings.push(
            "accept 缺 artifacts.gameplay_screenshot —— 只有标题截图不能证明核心玩法；\
             t3m note project-info.json gameplay_screenshot <最终比赛截图>"
                .into(),
        ),
        Some(value) => {
            let path = resolve_artifact_path(base, value);
            if !path.is_file() {
                warnings.push(format!(
                    "artifacts.gameplay_screenshot 指向的文件不存在: {value}"
                ));
            } else if let (Ok(captured), Some(code)) = (
                std::fs::metadata(&path).and_then(|meta| meta.modified()),
                newest_target_code,
            ) {
                if captured < code {
                    warnings.push(format!(
                        "artifacts.gameplay_screenshot 比 scripts/ 最新代码旧: {value}；重新截图并 note"
                    ));
                }
            }
        }
    }

    warnings
}

fn comparison_evidence_warnings(
    arts: &[(String, String)],
    base: &Path,
    newest_target_code: Option<std::time::SystemTime>,
) -> Vec<String> {
    let mut warnings = Vec::new();
    let file_keys = [
        "compare_source",
        "compare_target",
        "compare_diff",
        "compare_metrics",
    ];
    let missing: Vec<&str> = file_keys
        .iter()
        .copied()
        .chain(["compare_operation"])
        .filter(|key| artifact(arts, key).is_none())
        .collect();
    if !missing.is_empty() {
        warnings.push(format!(
            "双预览证据不完整，缺 artifacts.{}",
            missing.join(" / artifacts.")
        ));
    }
    for key in file_keys {
        if let Some(value) = artifact(arts, key) {
            let path = resolve_artifact_path(base, value);
            if !path.is_file() {
                warnings.push(format!("artifacts.{key} 指向的文件不存在: {value}"));
            }
        }
    }

    let Some(metrics_value) = artifact(arts, "compare_metrics") else {
        return warnings;
    };
    let metrics_path = resolve_artifact_path(base, metrics_value);
    let Ok(metrics_modified) = std::fs::metadata(&metrics_path).and_then(|meta| meta.modified())
    else {
        return warnings;
    };
    if newest_target_code.is_some_and(|modified| metrics_modified < modified) {
        warnings.push(
            "compare_metrics 比目标工程最新代码旧；修复后必须重新发布、双截图并 compare".into(),
        );
    }
    let target_receipt = find_ancestor_file(
        base,
        Path::new(".maker/kaying-for-taptap/preview-publication.v1.json"),
    );
    if target_receipt
        .and_then(|path| std::fs::metadata(path).ok()?.modified().ok())
        .is_some_and(|modified| metrics_modified < modified)
    {
        warnings.push(
            "compare_metrics 比最新 TapTap publication 旧；不能用旧截图验收新 revision".into(),
        );
    }
    let metrics_failed = crate::util::read_text(&metrics_path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.pointer("/verdict/passed")?.as_bool())
        == Some(false);
    if metrics_failed {
        warnings.push("compare_metrics verdict 未通过；不得宣称像素对齐通过".into());
    }
    warnings
}

/// Hard errors for compare evidence. Unlike [`comparison_evidence_warnings`],
/// these block `accept` unless `--force` is used:
///
/// - KayingCode side-pane mode but no `compare_metrics` at all;
/// - metrics file missing / not JSON / no `verdict.passed`;
/// - `verdict.passed == false`;
/// - metrics older than the target scripts or the latest publication.
///
/// Missing compare evidence outside side-pane mode stays a warning, so remote
/// or explicitly recorded local-runtime fallbacks are not broken by this gate.
fn comparison_evidence_errors(
    arts: &[(String, String)],
    base: &Path,
    newest_target_code: Option<std::time::SystemTime>,
) -> Vec<String> {
    let mut errors = Vec::new();
    let mode = artifact(arts, "visual_review_mode");
    let has_compare = [
        "compare_source",
        "compare_target",
        "compare_diff",
        "compare_metrics",
        "compare_operation",
    ]
    .iter()
    .any(|key| artifact(arts, key).is_some());
    if has_compare && mode.is_none() {
        errors.push(
            "记录了 compare_* 但缺 artifacts.visual_review_mode；\
             必须写明 kayingcode-side-pane 或 local-runtime-fallback，不能绕过硬门禁"
                .into(),
        );
    }
    let side_pane = mode == Some("kayingcode-side-pane");
    let Some(value) = artifact(arts, "compare_metrics") else {
        if side_pane {
            errors.push(
                "visual_review_mode=kayingcode-side-pane 但没有 artifacts.compare_metrics；\
                 KayingCode 必须发布 → prepare → 双 guest 截图 → t3m compare"
                    .into(),
            );
        }
        return errors;
    };
    let path = resolve_artifact_path(base, value);
    if !path.is_file() {
        errors.push(format!(
            "artifacts.compare_metrics 指向的文件不存在: {value}"
        ));
        return errors;
    }
    let Ok(text) = crate::util::read_text(&path) else {
        errors.push(format!("无法读取 compare_metrics: {value}"));
        return errors;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        errors.push(format!("compare_metrics 不是合法 JSON: {value}"));
        return errors;
    };
    match json
        .pointer("/verdict/passed")
        .and_then(serde_json::Value::as_bool)
    {
        Some(true) => {}
        Some(false) => errors.push(
            "compare_metrics verdict 未通过；不得把 accept 标成 done（先修根因再重新对比）".into(),
        ),
        None => errors.push("compare_metrics 缺少 verdict.passed；无法判定像素对齐是否通过".into()),
    }
    let Ok(modified) = std::fs::metadata(&path).and_then(|meta| meta.modified()) else {
        return errors;
    };
    if newest_target_code.is_some_and(|target| modified < target) {
        errors
            .push("compare_metrics 比目标工程最新代码旧；先重新发布、双截图并 t3m compare".into());
    }
    if find_ancestor_file(
        base,
        Path::new(".maker/kaying-for-taptap/preview-publication.v1.json"),
    )
    .and_then(|receipt| std::fs::metadata(receipt).ok()?.modified().ok())
    .is_some_and(|receipt| modified < receipt)
    {
        errors.push(
            "compare_metrics 比最新 TapTap publication 旧；不能用旧截图验收新 revision".into(),
        );
    }
    errors
}

/// How many rows of the inventory's alignment table (section 七) still have an
/// empty「Maker 实现」/「显隐条件」cell. `None` = the section is missing.
pub(crate) fn unfilled_alignment_rows(text: &str) -> Option<(usize, usize)> {
    let start = text.lines().position(|l| l.contains("逐条对齐表"))?;
    let mut rows = 0usize;
    let mut unfilled = 0usize;
    for line in text.lines().skip(start + 1) {
        if line.starts_with("## ") {
            break;
        }
        if !line.trim_start().starts_with('|') {
            continue;
        }
        let cells: Vec<&str> = line.split('|').map(|c| c.trim()).collect();
        if cells.len() < 5 || cells.iter().any(|c| c.contains("---")) {
            continue;
        }
        if cells
            .iter()
            .any(|c| c.contains("Maker 实现") || c.contains("原版控件") || c.contains("显隐条件"))
        {
            continue; // header row
        }
        rows += 1;
        let fill = &cells[cells.len() - 2..];
        if fill.iter().any(|c| c.is_empty() || *c == "—") {
            unfilled += 1;
        }
    }
    Some((rows, unfilled))
}

/// Mark a stage as `done` (or any status) inside `project-info.json`.
///
/// The file is updated with a plain string replacement on the exact
/// `"stage": "old"` line, so unknown extra fields the user added are kept.
///
/// `accept` is a gate rather than a label: it refuses to become `done` until the
/// working directory can prove the game was actually run — a `runtime_log`
/// artifact pointing at a real log plus the delivered `maker_url`. Static
/// checks pass on games that crash on the first frame; only the runtime log
/// tells the two apart. `force` overrides (only when the game cannot be run).
pub fn mark(info_path: &Path, stage: &str, status: &str, force: bool) -> CliResult<()> {
    if !STAGES.contains(&stage) {
        return Err(CliError(format!(
            "unknown stage '{stage}' (expected one of: {})",
            STAGES.join(", ")
        )));
    }
    let text = crate::util::read_text(info_path)?;
    let arts = read_artifacts(&text);
    let base = info_path.parent().unwrap_or(Path::new("."));
    // The UI stage is a gate for the same reason `accept` is: a HUD that is
    // rewritten "in the spirit of" the original is indistinguishable from a
    // transcribed one in every static check — it renders, it logs nothing, it
    // passes the build — and it silently changes the control set, their
    // positions, their functions and the game's rhythm. The inventory
    // (t3m ui) is the artifact that makes the original's controls comparable
    // line by line, so it has to exist before the stage can be called done.
    if stage == "ui" && status == "done" && !force {
        let mut missing: Vec<String> = Vec::new();
        let mut inv_path: Option<PathBuf> = None;
        match artifact(&arts, "ui_inventory") {
            None => missing.push("artifacts.ui_inventory（t3m ui 生成的控件清单路径）".into()),
            Some(p) => {
                let cand = {
                    let pb = Path::new(p);
                    if pb.is_absolute() {
                        pb.to_path_buf()
                    } else {
                        base.join(pb)
                    }
                };
                if !cand.is_file() {
                    missing.push(format!("artifacts.ui_inventory 指向的清单不存在: {p}"));
                } else {
                    inv_path = Some(cand);
                }
            }
        }
        if !missing.is_empty() {
            return Err(CliError(format!(
                "拒绝把 ui 标成 done：没有控件清单，就没法证明控件是「转写」的而不是重新设计的\n  - {}\n\
                 先跑清单，再按它逐条对齐（控件 1:1 / 位置尺寸按 CSS 直译 / 功能与显隐条件一致）：\n  \
                 t3m ui source/game/ --out source/UI_INVENTORY.md\n  \
                 t3m note project-info.json ui_inventory source/UI_INVENTORY.md\n  \
                 t3m mark project-info.json ui\n\
                 （确实无法提取 UI 时才用 --force，并在 notes 里写明原因）",
                missing.join("\n  - ")
            )));
        }
        // Existence is not use: the reference fix round generated the inventory
        // and then shipped with all 49 alignment rows empty, coding from an
        // ad-hoc subset (button sizes) instead of the spec. The table IS the
        // control-by-control contract — require it filled.
        let inv = crate::util::read_text(inv_path.as_deref().unwrap())?;
        match unfilled_alignment_rows(&inv) {
            None => {
                return Err(CliError(
                    "拒绝把 ui 标成 done：清单里没有「逐条对齐表」。用 t3m ui 重新生成清单（--out），\n\
                     或在清单里补一张逐条对齐表（原版控件 → Maker 实现 → 显隐条件）"
                        .to_string(),
                ))
            }
            Some((rows, unfilled)) if unfilled > 0 => {
                let stale = if inv.contains("布局骨架") {
                    ""
                } else {
                    "\n这份清单是旧版本 t3m 生成的（没有「布局骨架」一节）：先重新生成一次，无 data-* 锚点的静态件/容器（钱包 chip、右上角按钮、菜单列、页脚）才会进表。"
                };
                return Err(CliError(format!(
                    "拒绝把 ui 标成 done：对齐表还有 {unfilled}/{rows} 行没填（「Maker 实现」/「显隐条件」空着）。\n\
                     这张表就是控件 1:1 的契约——先填满再标完成；填的过程会暴露没做的控件（药丸读数、\n\
                     英雄卡、锚定弹窗、目标模式、键盘层……），也顺便写出每个控件的显隐条件。{stale}\n\
                     控件缺失的下限检查：t3m ui source/game/ --check dest"
                )));
            }
            _ => {}
        }
        // Parity lower bound: every original interactive control must have some
        // counterpart in the port's UI code. Catches "whole controls never
        // attempted" (the reference round's gift/settings/workshop/paints/
        // targeting/close controls), which no other check sees.
        let dest_rel = artifact(&arts, "dest_project").unwrap_or("dest");
        let dest_dir = {
            let p = Path::new(dest_rel);
            if p.is_absolute() {
                p.to_path_buf()
            } else {
                base.join(p)
            }
        };
        let source_dir = base.join("source");
        let game_dir = if source_dir.join("game").is_dir() {
            source_dir.join("game")
        } else {
            source_dir
        };
        if game_dir.is_dir() {
            let (misses, total, report) = crate::ui::check(&game_dir, &dest_dir)?;
            if misses > 0 {
                return Err(CliError(format!(
                    "拒绝把 ui 标成 done：{} / {} 个原版可操作控件在转写 UI 代码里没有对应实现\n\n{}\n\
                     按清单把缺的控件补上（或确实不做时用 --force 并在 notes 里写明原因）；\n\
                     这是下限检查——命中也不代表形态/位置/显隐正确，对齐表与截图仍要逐条核对。",
                    misses,
                    total,
                    report.trim_end()
                )));
            }
        }
    }
    if stage == "accept" && status == "done" && !force {
        let mut missing: Vec<String> = Vec::new();
        match artifact(&arts, "runtime_log") {
            None => missing.push("artifacts.runtime_log（本机实跑日志路径）".into()),
            Some(p) => {
                let pb = Path::new(p);
                let cand = if pb.is_absolute() {
                    pb.to_path_buf()
                } else {
                    base.join(pb)
                };
                if !cand.is_file() {
                    missing.push(format!("artifacts.runtime_log 指向的日志不存在: {p}"));
                }
            }
        }
        if artifact(&arts, "maker_url").is_none() {
            missing.push("artifacts.maker_url（交付给用户的 Maker 地址）".into());
        }
        if !missing.is_empty() {
            return Err(CliError(format!(
                "拒绝把 accept 标成 done：缺少运行时证据\n  - {}\n\
                 先真跑一次再记录（静态检查全绿 ≠ 能跑）：\n  \
                 t3m rlog <dest>                                       # 必须 PASS\n  \
                 t3m note project-info.json runtime_log <runtime.log 路径>\n  \
                 t3m note project-info.json maker_url \"<url>\"\n  \
                 t3m mark project-info.json accept\n\
                 （确实无法实跑时才用 --force，并在 notes 里写明原因）",
                missing.join("\n  - ")
            )));
        }
        let soft: Vec<&str> = ["screenshot", "pixel_stats"]
            .into_iter()
            .filter(|k| artifact(&arts, k).is_none())
            .collect();
        if !soft.is_empty() {
            crate::errln!(
                "warn: accept 缺 {} —— 画面与亮度对齐没有留下可复核的证据（见 references/acceptance.md）",
                soft.join(" / ")
            );
        }
        // Evidence that exists but says "did not meet the criterion": the gate
        // only checks presence, so the record has to say so out loud. Silently
        // accepting a recorded failure is how a 16%-too-bright port ships as
        // "verified".
        if let Some(stats) = artifact(&arts, "pixel_stats") {
            let low = stats.to_lowercase();
            let unfavourable = [
                "not met",
                "未达标",
                "未通过",
                "不达标",
                "gap",
                "超出",
                "fail",
            ]
            .iter()
            .find(|k| low.contains(*k));
            if let Some(k) = unfavourable {
                crate::errln!(
                    "warn: pixel_stats 记着未达标（命中 \"{k}\"）：accept 仍会写成 done，但交付说明里必须把它列为\
                     \n      已知差异并说明为什么停在这里（数字 + 原因），不要写成\"已对齐\"（见 references/acceptance.md 第四节）"
                );
            }
        }
        // Development harnesses and dev switches left in the delivered project:
        // the reference fix round shipped `DEV_SMOKE = true`, whose boot path
        // auto-plays a level and parks the preview on a finished-run HUD — the
        // user opens the game and sees a UI that no longer exists in the code.
        let mut newest_target_code: Option<std::time::SystemTime> = None;
        if let Some(dest) = artifact(&arts, "dest_project") {
            let project = {
                let p = Path::new(dest);
                if p.is_absolute() {
                    p.to_path_buf()
                } else {
                    base.join(p)
                }
            };
            let mut probes: Vec<String> = Vec::new();
            let mut switches: Vec<String> = Vec::new();
            let mut lua_files: Vec<PathBuf> = Vec::new();
            if crate::util::collect_files(&project.join("scripts"), "lua", &mut lua_files).is_ok() {
                for f in &lua_files {
                    let Ok(ftext) = crate::util::read_text(f) else {
                        continue;
                    };
                    if let Ok(meta) = std::fs::metadata(f) {
                        if let Ok(m) = meta.modified() {
                            newest_target_code = Some(match newest_target_code {
                                Some(prev) if prev > m => prev,
                                _ => m,
                            });
                        }
                    }
                    let rel = f
                        .strip_prefix(&project)
                        .unwrap_or(f)
                        .to_string_lossy()
                        .replace('\\', "/");
                    // harness markers live in the header comment
                    let head: String = ftext.lines().take(6).collect::<Vec<_>>().join("\n");
                    let low = head.to_lowercase();
                    if low.contains("temp")
                        || low.contains("dev harness")
                        || low.contains("temporary")
                    {
                        probes.push(rel.clone());
                    }
                    for line in ftext.lines() {
                        if let Some(name) = crate::lint::dev_switch(line) {
                            switches.push(format!("{rel}: {name} = true"));
                        }
                    }
                }
            }
            if !probes.is_empty() {
                crate::errln!(
                    "warn: 交付工程里还留着验证用临时 harness（`grep -rn \"TEMP\" scripts/` 应为空）：\
                     \n      {}\n      它们是转写期的自检产物，会随包发布；要留证据就挪到 verify/，\
                     不要留在 scripts/（见 references/acceptance.md 第四节）",
                    probes.join("\n      ")
                );
            }
            if !switches.is_empty() {
                crate::errln!(
                    "warn: 交付工程里还有打开的开发自测开关（t3m lint 的 dev-switch-on 是高风险，这里只警告）：\
                     \n      {}\n      它们会接管启动/玩法流程——用户打开预览看到的是自驱跑出来的画面，不是正常游戏",
                    switches.join("\n      ")
                );
            }
            // Evidence staleness: a screenshot older than the newest script means
            // the last round of changes was never actually looked at.
            if let Some(shot) = artifact(&arts, "screenshot") {
                let sp = {
                    let p = Path::new(shot);
                    if p.is_absolute() {
                        p.to_path_buf()
                    } else {
                        base.join(p)
                    }
                };
                if sp.is_file() {
                    if let (Ok(s), Some(n)) = (
                        std::fs::metadata(&sp).and_then(|m| m.modified()),
                        newest_target_code,
                    ) {
                        if s < n {
                            crate::errln!(
                                "warn: 记录的截图比 scripts/ 里最新的代码还旧——最后一轮改动没有留下画面证据；\n      先重跑预览并截图，再更新 t3m note project-info.json screenshot <路径>"
                            );
                        }
                    }
                } else {
                    crate::errln!(
                        "warn: artifacts.screenshot 指向的文件不存在: {shot}（预览会话目录会轮转，重截一张再 note）"
                    );
                }
            }
        }
        if !force {
            let newest_target_code =
                newest_target_code.or_else(|| newest_target_script(&arts, base));
            let errors = comparison_evidence_errors(&arts, base, newest_target_code);
            if !errors.is_empty() {
                return Err(CliError(format!(
                    "拒绝把 accept 标成 done：compare 证据未通过\n  - {}\n\
                     先修根因，再重新发布 → prepare_visual_comparison → 双 guest 截图 → t3m compare；\n\
                     确实无法执行双预览时才用 --force，并在 notes 里写明原因（见 references/visual-compare.md）",
                    errors.join("\n  - ")
                )));
            }
        }
        let newest_target_code = newest_target_code.or_else(|| newest_target_script(&arts, base));
        for warning in source_evidence_warnings(&arts, base, newest_target_code) {
            crate::errln!("warn: {warning}");
        }
        for warning in comparison_evidence_warnings(&arts, base, newest_target_code) {
            crate::errln!("warn: {warning}");
        }
    }
    let mut updated = false;
    let out: Vec<String> = text
        .lines()
        .map(|line| {
            // exact key match: `"stage" :` (not a prefix of another key)
            let key = format!("\"{stage}\"");
            let trimmed = line.trim();
            let is_target = trimmed
                .strip_prefix(&key)
                .map(|r| r.trim_start().starts_with(':'))
                .unwrap_or(false);
            if is_target {
                updated = true;
                let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
                let comma = if trimmed.ends_with(',') { "," } else { "" };
                format!("{indent}\"{stage}\": \"{}\"{comma}", json_escape(status))
            } else {
                line.to_string()
            }
        })
        .collect();
    if !updated {
        return Err(CliError(format!(
            "stage '{stage}' not found in {}",
            info_path.display()
        )));
    }
    write_text(info_path, &normalize_trailing_nl(&out.join("\n")))?;
    Ok(())
}

/// Record an artifact path (e.g. `"fetch_manifest": "source/FETCH_MANIFEST.txt"`)
/// inside the `artifacts` object of `project-info.json`.
///
/// Re-noting an existing key updates it in place: the runtime log is re-recorded
/// after every fix round, and duplicate JSON keys would make readers disagree
/// about which value is current.
pub fn note_artifact(info_path: &Path, key: &str, value: &str) -> CliResult<()> {
    let text = crate::util::read_text(info_path)?;
    let marker = "\"artifacts\": {";
    let Some(pos) = text.find(marker) else {
        return Err(CliError(format!(
            "artifacts object not found in {}",
            info_path.display()
        )));
    };
    let entry = format!("\"{}\": \"{}\"", json_escape(key), json_escape(value));

    // existing key inside the artifacts block → replace its value
    let body_start = pos + marker.len();
    let body = &text[body_start..];
    let body_end = body.find('}').unwrap_or(body.len());
    let key_marker = format!("\"{}\"", json_escape(key));
    if let Some(krel) = body[..body_end].find(&key_marker) {
        let kabs = body_start + krel + key_marker.len();
        let tail = &text[kabs..];
        if let (Some(colon), _) = (tail.find(':'), ()) {
            let after_colon = &tail[colon + 1..];
            if let Some(q1) = after_colon.find('"') {
                let val_start = kabs + colon + 1 + q1 + 1;
                let rest = &text[val_start..];
                if let Some(q2) = rest.find('"') {
                    let new_text = format!(
                        "{}{}{}",
                        &text[..val_start],
                        json_escape(value),
                        &text[val_start + q2..]
                    );
                    write_text(info_path, &new_text)?;
                    return Ok(());
                }
            }
        }
    }

    let after = body_start;
    let rest = &text[after..];
    let empty = rest.trim_start().starts_with('}');
    let new_text = if empty {
        // `"artifacts": {` + the first entry, closing brace from `rest`
        format!(
            "{}{marker}\n      {entry}\n  {}",
            &text[..pos],
            rest.trim_start_matches('\n')
        )
    } else {
        // insert after the opening brace: `"artifacts": {\n      "k": "v",`
        let insert_at = after;
        let mut s = text[..insert_at].to_string();
        s.push_str(&format!("\n      {entry},"));
        s.push_str(&text[insert_at..]);
        s
    };
    let _ = fs::metadata(info_path); // keep mtime intent explicit
    write_text(info_path, &new_text)?;
    Ok(())
}

/// Exactly one trailing newline, LF line endings.
fn normalize_trailing_nl(s: &str) -> String {
    let mut out = s.replace("\r\n", "\n").replace('\r', "\n");
    while out.ends_with('\n') {
        out.pop();
    }
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[test]
    fn comparison_evidence_reports_missing_and_stale_metrics() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "t3m-workspace-evidence-{}-{stamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let metrics = root.join("metrics.json");
        std::fs::write(&metrics, "{\"verdict\":{\"passed\":false}}\n").unwrap();
        let arts = vec![
            ("compare_source".into(), "missing-source.png".into()),
            ("compare_metrics".into(), "metrics.json".into()),
        ];
        let warnings = comparison_evidence_warnings(
            &arts,
            &root,
            Some(SystemTime::now() + Duration::from_secs(1)),
        );
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("证据不完整")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("最新代码旧")));
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("verdict 未通过")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn init_creates_source_notes_and_audit_templates() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let parent =
            std::env::temp_dir().join(format!("t3m-workspace-init-{}-{stamp}", std::process::id()));
        std::fs::create_dir_all(&parent).unwrap();
        let dir = run("https://example.com/game/", None, &parent, "0.2.6").unwrap();
        let notes = std::fs::read_to_string(dir.join(SOURCE_NOTES_REL)).unwrap();
        assert!(notes.contains("SOURCE_NOTES"));
        assert!(notes.contains("file:line"));
        assert!(notes.contains("（待填）"));
        let audit_readme =
            std::fs::read_to_string(dir.join(SOURCE_AUDIT_REL).join("README.md")).unwrap();
        assert!(audit_readme.contains("control-flow.md"));
        assert!(dir.join(SOURCE_AUDIT_REL).is_dir());
        std::fs::remove_dir_all(parent).unwrap();
    }

    #[test]
    fn source_evidence_warnings_report_missing_and_incomplete_ledger() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "t3m-workspace-source-evidence-{}-{stamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(root.join(SOURCE_AUDIT_REL)).unwrap();

        let missing = source_evidence_warnings(&[], &root, None);
        assert!(missing
            .iter()
            .any(|warning| warning.contains("SOURCE_NOTES.md")));
        assert!(missing
            .iter()
            .any(|warning| warning.contains("artifacts.visual_fixes")));
        assert!(missing
            .iter()
            .any(|warning| warning.contains("gameplay_screenshot")));

        std::fs::write(
            root.join(SOURCE_NOTES_REL),
            "# SOURCE_NOTES\n\n| topic | game.js:12 | fact | verify |\n",
        )
        .unwrap();
        std::fs::write(
            root.join(SOURCE_AUDIT_REL).join("visual-fixes.md"),
            "| symptom | source_evidence | fix |\n|---|---|---|\n| x | game.js:12 | y |\n",
        )
        .unwrap();
        std::fs::write(root.join("gameplay.png"), b"png").unwrap();
        let arts = vec![
            ("visual_fixes".into(), "source/audit/visual-fixes.md".into()),
            ("gameplay_screenshot".into(), "gameplay.png".into()),
        ];
        assert!(source_evidence_warnings(&arts, &root, None).is_empty());

        let warnings = source_evidence_warnings(
            &arts,
            &root,
            Some(SystemTime::now() + Duration::from_secs(1)),
        );
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("gameplay_screenshot 比")));

        std::fs::write(
            root.join(SOURCE_AUDIT_REL).join("visual-fixes.md"),
            "| symptom | source_evidence | fix |\n|---|---|---|\n| x |  | y |\n",
        )
        .unwrap();
        let warnings = source_evidence_warnings(&arts, &root, None);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("缺有效 source_evidence")));

        std::fs::write(
            root.join(SOURCE_AUDIT_REL).join("visual-fixes.md"),
            "| symptom | fix |\n|---|---|\n| x | y |\n",
        )
        .unwrap();
        let warnings = source_evidence_warnings(&arts, &root, None);
        assert!(warnings
            .iter()
            .any(|warning| warning.contains("source_evidence")));

        std::fs::write(root.join(SOURCE_NOTES_REL), "# SOURCE_NOTES\n（待填）\n").unwrap();
        let warnings = source_evidence_warnings(&arts, &root, None);
        assert!(warnings.iter().any(|warning| warning.contains("仍是模板")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn comparison_evidence_errors_block_side_pane_without_metrics_and_failed_verdict() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "t3m-workspace-compare-gate-{}-{stamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();

        let side_pane_only = vec![("visual_review_mode".into(), "kayingcode-side-pane".into())];
        let errors = comparison_evidence_errors(&side_pane_only, &root, None);
        assert!(errors
            .iter()
            .any(|error| error.contains("没有 artifacts.compare_metrics")));

        let no_mode = vec![("compare_source".into(), "source.png".into())];
        let errors = comparison_evidence_errors(&no_mode, &root, None);
        assert!(errors
            .iter()
            .any(|error| error.contains("visual_review_mode")));

        let metrics = root.join("metrics.json");
        std::fs::write(&metrics, "{\"verdict\":{\"passed\":false}}\n").unwrap();
        let arts = vec![
            ("visual_review_mode".into(), "kayingcode-side-pane".into()),
            ("compare_metrics".into(), "metrics.json".into()),
        ];
        let errors = comparison_evidence_errors(&arts, &root, None);
        assert!(errors.iter().any(|error| error.contains("verdict 未通过")));

        std::fs::write(&metrics, "{\"verdict\":{\"passed\":true}}\n").unwrap();
        let errors = comparison_evidence_errors(
            &arts,
            &root,
            Some(SystemTime::now() - Duration::from_secs(10)),
        );
        assert!(errors.is_empty(), "{errors:?}");

        let missing = vec![("compare_metrics".into(), "missing.json".into())];
        let errors = comparison_evidence_errors(&missing, &root, None);
        assert!(errors.iter().any(|error| error.contains("不存在")));

        std::fs::remove_dir_all(root).unwrap();
    }
}
