//! `t3m audit` — deterministic source audit before writing engine code.
//!
//! `analyze` maps the source to the *engine gap list*. `audit` answers the
//! transcription-specific questions that a generic gap list misses:
//!
//! - which URL params / feature flags select a code path or model set
//! - which custom shaders are injected at runtime (`onBeforeCompile`, …)
//! - which material features the GLB uses (clearcoat, emissive strength, …)
//! - which models / atlases / animation nodes exist
//! - which procedural animations and UI controls must be re-created
//!
//! Output is evidence-only: every row carries `file:line` + a short snippet.
//! It is deliberately a *clue list*, not a spec; the agent must read the source
//! and record confirmed facts in `SOURCE_NOTES.md` before editing.
//!
//! `audit` never edits the game and never calls the network. It only writes
//! Markdown/JSON under the requested audit directory.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde_json::json;

use crate::util::{collect_files, ensure_dir, err, read_text, write_text, CliResult};

struct Topic {
    id: &'static str,
    title: &'static str,
    patterns: &'static [&'static str],
}

const TOPICS: &[Topic] = &[
    Topic {
        id: "control-flow",
        title: "源码控制流 / feature flag / 模型选择",
        patterns: &[
            "urlsearchparams",
            "location.search",
            "localstorage.",
            "sessionstorage.",
            "?char=",
            "char=old",
            "char ===",
            "char ==",
            "nb =",
            "function rb(",
            "function ab(",
            "return null",
            "if (t) return",
            "variant",
            "feature flag",
            "debug flag",
        ],
    },
    Topic {
        id: "shaders",
        title: "自定义 shader / 材质注入",
        patterns: &[
            "onbeforecompile",
            "shadermaterial",
            "customprogramcachekey",
            "onbeforerender",
            "udecal",
            "uneck",
            "uface",
            "surface shader",
        ],
    },
    Topic {
        id: "materials",
        title: "材质特性 / GLB material 字段",
        patterns: &[
            "khr_materials_clearcoat",
            "clearcoatfactor",
            "clearcoatroughnessfactor",
            "emissivestrength",
            "emissivefactor",
            "doublesided",
            "basecolorfactor",
            "metallicfactor",
            "roughnessfactor",
            "color_0",
            "normaltexture",
            "basecolortexture",
            "alphamode",
        ],
    },
    Topic {
        id: "models",
        title: "模型 / 图集 / 节点 / 资源选择",
        patterns: &[
            "\"kart_",
            "_r13",
            "driver_",
            "r13a",
            "window.assets",
            "gltfloader",
            ".glb",
            "wheel_fl",
            "wheel_fr",
            "wheel_rl",
            "wheel_rr",
            "wob_",
        ],
    },
    Topic {
        id: "animations",
        title: "动画 / 程序化动画 / 相机与 UI 动效",
        patterns: &[
            "wheelspin",
            "wob_",
            "blink",
            "looky",
            "head.rotation",
            "requestanimationframe",
            "crowdexcite",
            "filmoffset",
            "bokeh",
        ],
    },
    Topic {
        id: "lighting",
        title: "光照 / 阴影 / 色调映射 / 后期",
        patterns: &[
            "tonemapping",
            "tonemappingexposure",
            "shadowmap",
            "shadow.bias",
            "shadow.normalbias",
            "shadow.camera",
            "shadowcamera",
            "\"tsun\"",
            "directionallight",
            "hemispherelight",
            "ambientlight",
            "effectcomposer",
            "unrealbloom",
            "bokehpass",
        ],
    },
    Topic {
        id: "ui",
        title: "DOM/CSS UI / 输入 / 布局骨架",
        patterns: &[
            "data-",
            "queryselector",
            "getelementbyid",
            "innerhtml",
            "classlist",
            "addeventlistener(\"pointer",
            "addeventlistener(\"touch",
            "@media",
            "border-radius",
            "display: flex",
            "display:flex",
            "flex-direction",
            "font-size",
        ],
    },
];

struct Hit {
    file: String,
    line: usize,
    snippet: String,
    matches: BTreeSet<&'static str>,
    library: bool,
}

/// Heuristic: lines that look like three.js/WebGL engine internals rather than
/// game code. They are still useful context, but should not outrank game hits.
fn is_library_line(line: &str) -> bool {
    let low = line.to_lowercase();
    const MARKERS: &[&str] = &[
        "#include",
        "#define",
        "#ifdef",
        "#if ",
        "gl_",
        "webgl",
        "shaderchunk",
        "three.",
        "getsunlight",
        "getshadow",
        "khr_materials_",
        "parseobject",
        "material.clearcoat",
        "material.clearcoatroughness",
        "outputcolorspace",
        "programvariants",
        "uniformslist",
        "webglprogram",
    ];
    MARKERS.iter().any(|marker| low.contains(marker))
}

fn collect_source_files(dir: &Path) -> CliResult<Vec<PathBuf>> {
    let mut files = Vec::new();
    for ext in ["js", "mjs", "html", "css"] {
        collect_files(dir, ext, &mut files)?;
    }
    let pretty_stems: BTreeSet<String> = files
        .iter()
        .filter_map(|file| {
            let name = file.file_name()?.to_str()?;
            name.strip_suffix(".pretty.js").map(str::to_string)
        })
        .collect();
    files.retain(|file| {
        let name = file
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if name.contains("three.module") || name.ends_with(".min.js") {
            return false;
        }
        // A readable `game.pretty.js` supersedes its minified `game.bundle.js`
        // twin; scanning both duplicates every hit.
        if let Some(stem) = name.strip_suffix(".bundle.js") {
            if pretty_stems.contains(stem) {
                return false;
            }
        }
        true
    });
    files.sort();
    Ok(files)
}

fn truncate_snippet(line: &str) -> String {
    line.trim().chars().take(180).collect()
}

fn scan(dir: &Path, files: &[PathBuf]) -> CliResult<BTreeMap<&'static str, Vec<Hit>>> {
    let mut by_topic: BTreeMap<&'static str, BTreeMap<(String, usize), Hit>> = BTreeMap::new();
    for file in files {
        let text = read_text(file)?;
        let rel = file
            .strip_prefix(dir)
            .unwrap_or(file)
            .to_string_lossy()
            .replace('\\', "/");
        for (index, line) in text.lines().enumerate() {
            let lower = line.to_lowercase();
            let library = is_library_line(line);
            for topic in TOPICS {
                for pattern in topic.patterns {
                    if !lower.contains(pattern) {
                        continue;
                    }
                    let entry = by_topic
                        .entry(topic.id)
                        .or_default()
                        .entry((rel.clone(), index + 1))
                        .or_insert_with(|| Hit {
                            file: rel.clone(),
                            line: index + 1,
                            snippet: truncate_snippet(line),
                            matches: BTreeSet::new(),
                            library,
                        });
                    entry.matches.insert(pattern);
                }
            }
        }
    }
    Ok(by_topic
        .into_iter()
        .map(|(id, hits)| (id, hits.into_values().collect()))
        .collect())
}

struct GlbMaterialRow {
    name: String,
    base_color: String,
    metallic: String,
    roughness: String,
    clearcoat: String,
    emissive_strength: String,
    double_sided: String,
    alpha_mode: String,
}

struct GlbFile {
    file: String,
    materials: Vec<GlbMaterialRow>,
    vertex_color_meshes: Vec<String>,
}

fn glb_json(path: &Path) -> Option<serde_json::Value> {
    let data = std::fs::read(path).ok()?;
    if data.len() < 20 || &data[0..4] != b"glTF" {
        return None;
    }
    let len = u32::from_le_bytes(data[12..16].try_into().ok()?) as usize;
    let kind = u32::from_le_bytes(data[16..20].try_into().ok()?);
    if kind != 0x4E4F534A || data.len() < 20 + len {
        return None;
    }
    serde_json::from_slice(&data[20..20 + len]).ok()
}

fn fmt_number(value: Option<&serde_json::Value>) -> String {
    value
        .and_then(serde_json::Value::as_f64)
        .map(|number| format!("{number:.3}"))
        .unwrap_or_else(|| "—".to_string())
}

fn fmt_vec3(value: Option<&serde_json::Value>) -> String {
    value
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| item.as_f64().unwrap_or(0.0))
                .map(|number| format!("{number:.3}"))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_else(|| "—".to_string())
}

fn scan_glb_files(dir: &Path) -> CliResult<Vec<GlbFile>> {
    let mut paths = Vec::new();
    collect_files(dir, "glb", &mut paths)?;
    paths.sort();
    let mut out = Vec::new();
    for path in paths {
        let Some(json) = glb_json(&path) else {
            continue;
        };
        let file = path
            .strip_prefix(dir)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let mut materials = Vec::new();
        for material in json
            .get("materials")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
        {
            let pbr = material.get("pbrMetallicRoughness");
            let name = material
                .get("name")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("(unnamed)")
                .to_string();
            let base_color = pbr
                .and_then(|pbr| pbr.get("baseColorFactor"))
                .map(|value| fmt_vec3(Some(value)))
                .or_else(|| {
                    pbr.and_then(|pbr| pbr.get("baseColorTexture"))
                        .map(|_| "texture".to_string())
                })
                .unwrap_or_else(|| "—".to_string());
            let clearcoat = material
                .pointer("/extensions/KHR_materials_clearcoat/clearcoatFactor")
                .map(|value| fmt_number(Some(value)))
                .unwrap_or_else(|| "—".to_string());
            let emissive_strength = material
                .pointer("/extensions/KHR_materials_emissive_strength/emissiveStrength")
                .map(|value| fmt_number(Some(value)))
                .unwrap_or_else(|| "—".to_string());
            materials.push(GlbMaterialRow {
                name,
                base_color,
                metallic: fmt_number(pbr.and_then(|pbr| pbr.get("metallicFactor"))),
                roughness: fmt_number(pbr.and_then(|pbr| pbr.get("roughnessFactor"))),
                clearcoat,
                emissive_strength,
                double_sided: material
                    .get("doubleSided")
                    .and_then(serde_json::Value::as_bool)
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "false".to_string()),
                alpha_mode: material
                    .get("alphaMode")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("OPAQUE")
                    .to_string(),
            });
        }
        let mut vertex_color_meshes = Vec::new();
        for (index, mesh) in json
            .get("meshes")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .enumerate()
        {
            let has_color = mesh
                .get("primitives")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
                .any(|primitive| primitive.pointer("/attributes/COLOR_0").is_some());
            if has_color {
                vertex_color_meshes.push(
                    mesh.get("name")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string)
                        .unwrap_or_else(|| format!("mesh#{index}")),
                );
            }
        }
        if !materials.is_empty() || !vertex_color_meshes.is_empty() {
            out.push(GlbFile {
                file,
                materials,
                vertex_color_meshes,
            });
        }
    }
    Ok(out)
}

struct TargetCheck {
    topic: &'static str,
    token: &'static str,
    note: &'static str,
}

const TARGET_CHECKS: &[TargetCheck] = &[
    TargetCheck {
        topic: "control-flow",
        token: "r13a",
        note: "源默认 r13a 合并模型；目标是否出现？",
    },
    TargetCheck {
        topic: "control-flow",
        token: "showroot",
        note: "标题/比赛 root 切换",
    },
    TargetCheck {
        topic: "control-flow",
        token: "raceroot",
        note: "race 分支",
    },
    TargetCheck {
        topic: "control-flow",
        token: "driver_",
        note: "generic fallback 车手",
    },
    TargetCheck {
        topic: "shaders",
        token: "uface",
        note: "face decal",
    },
    TargetCheck {
        topic: "shaders",
        token: "udecal",
        note: "眼睛 decal",
    },
    TargetCheck {
        topic: "shaders",
        token: "uneck",
        note: "neck shader",
    },
    TargetCheck {
        topic: "materials",
        token: "clearcoat",
        note: "清漆层",
    },
    TargetCheck {
        topic: "materials",
        token: "cull=\"none\"",
        note: "doubleSided 材质",
    },
    TargetCheck {
        topic: "materials",
        token: "diffvcol",
        note: "顶点色 technique",
    },
    TargetCheck {
        topic: "animations",
        token: "wheelspin",
        note: "车轮旋转",
    },
    TargetCheck {
        topic: "animations",
        token: "wob_",
        note: "尾巴/耳朵弹簧",
    },
    TargetCheck {
        topic: "animations",
        token: "blink",
        note: "眨眼",
    },
    TargetCheck {
        topic: "animations",
        token: "looky",
        note: "头部 look",
    },
    TargetCheck {
        topic: "lighting",
        token: "tsun",
        note: "标题太阳参数",
    },
    TargetCheck {
        topic: "lighting",
        token: "shadowbias",
        note: "阴影 bias",
    },
    TargetCheck {
        topic: "lighting",
        token: "shadowcascade",
        note: "级联阴影",
    },
    TargetCheck {
        topic: "lighting",
        token: "tonemapping",
        note: "色调映射",
    },
    TargetCheck {
        topic: "lighting",
        token: "bloom",
        note: "Bloom",
    },
    TargetCheck {
        topic: "lighting",
        token: "bokeh",
        note: "DOF",
    },
];

fn scan_target(target: &Path) -> CliResult<BTreeMap<&'static str, (String, usize, String)>> {
    let mut files = Vec::new();
    // Only the shipped project code/assets: never engine docs, type stubs,
    // examples or other scaffolding that happens to mention the same tokens.
    // Scan `scripts` first so token locations point at implementation, not an
    // asset filename that merely contains the token.
    for dir in ["scripts", "assets", "Shaders"] {
        let root = target.join(dir);
        if !root.is_dir() {
            continue;
        }
        let mut dir_files = Vec::new();
        for ext in ["lua", "xml", "shader"] {
            collect_files(&root, ext, &mut dir_files)?;
        }
        dir_files.sort();
        files.extend(dir_files);
    }
    let mut hits = BTreeMap::new();
    for file in files {
        let rel = file
            .strip_prefix(target)
            .unwrap_or(&file)
            .to_string_lossy()
            .replace('\\', "/");
        let Ok(text) = read_text(&file) else {
            continue;
        };
        for (index, line) in text.lines().enumerate() {
            let lower = line.to_lowercase();
            for check in TARGET_CHECKS {
                if hits.contains_key(check.token) || !lower.contains(check.token) {
                    continue;
                }
                hits.insert(
                    check.token,
                    (rel.clone(), index + 1, truncate_snippet(line)),
                );
            }
        }
    }
    Ok(hits)
}

fn target_consistency_report(target: &Path) -> CliResult<(String, usize)> {
    let hits = scan_target(target)?;
    let mut r = String::new();
    r.push_str("# 目标侧一致性 audit\n\n");
    r.push_str(&format!("- 目标工程：`{}`\n", target.display()));
    r.push_str(
        "> token 存在性只是线索，不代表实现正确；命中位置可能是注释/声明，\n\
         > 缺失项要回目标代码确认，确认后写进 `visual_fixes` 或 `SOURCE_NOTES.md`。\n\n",
    );
    r.push_str("| 主题 | 目标 token | 状态 | 片段 | 说明 |\n|---|---|---|---|---|\n");
    let mut missing = 0usize;
    for check in TARGET_CHECKS {
        let hit = hits.get(check.token);
        if hit.is_none() {
            missing += 1;
        }
        let (status, snippet) = match hit {
            Some((file, line, snippet)) => (
                format!("发现 @ `{file}:{line}`"),
                snippet.replace('|', "\\|"),
            ),
            None => ("未发现".to_string(), "—".to_string()),
        };
        r.push_str(&format!(
            "| {} | `{}` | {} | {} | {} |\n",
            check.topic, check.token, status, snippet, check.note
        ));
    }
    r.push_str(&format!(
        "\n**未发现 token：{} / {}**。未发现不等于一定缺失（可能命名不同/被烘焙），要回代码确认。\n",
        missing,
        TARGET_CHECKS.len()
    ));
    Ok((r, missing))
}

fn materials_extra(glb_files: &[GlbFile]) -> String {
    let mut r = String::new();
    r.push_str("## GLB 材质（源文件）\n\n");
    if glb_files.is_empty() {
        r.push_str(
            "_未找到 `.glb`。如果资源内联在 HTML/base64 的 `window.ASSETS` 里，\
             先解出 GLB（或用源 GLB 目录）再跑 audit；否则材质字段只能靠人工核对。_\n\n",
        );
        return r;
    }
    r.push_str(
        "| 文件 | 材质 | baseColor | metallic | roughness | clearcoat | emissiveStrength | doubleSided | alphaMode |\n\
         |---|---|---:|---:|---:|---:|---:|---|---|\n",
    );
    for file in glb_files {
        for material in &file.materials {
            r.push_str(&format!(
                "| `{}` | {} | {} | {} | {} | {} | {} | {} | {} |\n",
                file.file,
                material.name,
                material.base_color,
                material.metallic,
                material.roughness,
                material.clearcoat,
                material.emissive_strength,
                material.double_sided,
                material.alpha_mode
            ));
        }
    }
    r.push('\n');
    r.push_str("### 顶点色（COLOR_0）\n\n");
    if glb_files
        .iter()
        .all(|file| file.vertex_color_meshes.is_empty())
    {
        r.push_str("_未检测到 `COLOR_0`。_\n\n");
    } else {
        r.push_str("| 文件 | 网格 |\n|---|---|\n");
        for file in glb_files {
            for mesh in &file.vertex_color_meshes {
                r.push_str(&format!("| `{}` | {} |\n", file.file, mesh));
            }
        }
        r.push('\n');
    }
    r
}

fn topic_hits<'a>(hits: &'a BTreeMap<&'static str, Vec<Hit>>, id: &str) -> &'a [Hit] {
    hits.get(id).map(Vec::as_slice).unwrap_or(&[])
}

fn push_hit_row(r: &mut String, hit: &Hit) {
    let snippet = hit.snippet.replace('|', "\\|");
    let matches = hit.matches.iter().copied().collect::<Vec<_>>().join(", ");
    let library = if hit.library { "L" } else { "" };
    r.push_str(&format!(
        "| `{}:{}` | `{}` | {} | {library} |\n",
        hit.file, hit.line, snippet, matches
    ));
}

fn write_topic(
    out: &Path,
    topic: &Topic,
    hits: &[Hit],
    checklist: &[&str],
    extra: &str,
) -> CliResult<String> {
    let mut r = String::new();
    r.push_str(&format!("# {} audit\n\n", topic.title));
    r.push_str(
        "> 证据清单，不是修改规格。每条命中都要回源码确认；确认后写入 `SOURCE_NOTES.md`，\n",
    );
    r.push_str("> 视觉修复还要在 `visual_fixes` 里记录 `source_evidence`。\n\n");
    r.push_str(&format!("- 命中：{} 处\n\n", hits.len()));
    if hits.is_empty() {
        r.push_str("_未命中。可能是模式不适用，也可能是资源已烘焙/压缩；请人工确认，不要直接判定“没有”。_\n\n");
    } else {
        let mut per_file: BTreeMap<&str, (usize, usize, usize, usize)> = BTreeMap::new();
        for hit in hits {
            let entry = per_file
                .entry(hit.file.as_str())
                .or_insert((0, hit.line, hit.line, 0));
            entry.0 += 1;
            entry.1 = entry.1.min(hit.line);
            entry.2 = entry.2.max(hit.line);
            if hit.library {
                entry.3 += 1;
            }
        }
        r.push_str("| 文件 | 命中 | 其中库/引擎 | 行范围 |\n|---|---:|---:|---|\n");
        for (file, (count, first, last, library)) in &per_file {
            r.push_str(&format!(
                "| `{file}` | {count} | {library} | {first}–{last} |\n"
            ));
        }
        r.push('\n');

        let mut by_file_rows: BTreeMap<&str, Vec<&Hit>> = BTreeMap::new();
        for hit in hits {
            by_file_rows.entry(hit.file.as_str()).or_default().push(hit);
        }
        let per_file_limit = 400usize;
        let truncated = by_file_rows
            .values()
            .any(|rows| rows.len() > per_file_limit);
        if truncated {
            r.push_str(
                "> 按文件采样：每个文件最多 400 条（首 200 + 尾 200）；完整列表用 `--json`。\n\n",
            );
        }
        r.push_str("| 文件:行 | 片段 | 命中词 | 库 |\n|---|---|---|---|\n");
        for rows in by_file_rows.values() {
            if rows.len() <= per_file_limit {
                for hit in rows {
                    push_hit_row(&mut r, hit);
                }
            } else {
                for hit in rows.iter().take(200) {
                    push_hit_row(&mut r, hit);
                }
                r.push_str(&format!(
                    "| … | 同一文件中间省略 {} 处（用 `--json` 查看完整列表） | … |\n",
                    rows.len() - per_file_limit
                ));
                for hit in rows.iter().skip(rows.len() - 200) {
                    push_hit_row(&mut r, hit);
                }
            }
        }
        r.push('\n');
    }
    if !extra.is_empty() {
        r.push_str(extra);
    }
    if !checklist.is_empty() {
        r.push_str("## 需要回答\n\n");
        for item in checklist {
            r.push_str(&format!("- [ ] {item}\n"));
        }
        r.push('\n');
    }
    let path = out.join(format!("{}.md", topic.id));
    write_text(&path, &r)?;
    Ok(path.to_string_lossy().to_string())
}

/// Run the audit and write `SUMMARY.md` + one Markdown file per topic.
///
/// Returns the human summary, or JSON when `as_json` is true.
pub fn run(
    dir: &Path,
    out: Option<&Path>,
    target: Option<&Path>,
    as_json: bool,
) -> CliResult<String> {
    if !dir.is_dir() {
        return err(format!("{} is not a directory", dir.display()));
    }
    let files = collect_source_files(dir)?;
    if files.is_empty() {
        return err(format!(
            "no .js/.mjs/.html/.css under {} — run `t3m fetch <url> --out <dir>` first",
            dir.display()
        ));
    }
    let out_dir = out
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("source/audit"));
    ensure_dir(&out_dir)?;
    let hits = scan(dir, &files)?;
    let glb_files = scan_glb_files(dir)?;
    let materials_section = materials_extra(&glb_files);
    let target_missing = if let Some(target) = target {
        if !target.is_dir() {
            return err(format!("{} is not a directory", target.display()));
        }
        let (report, missing) = target_consistency_report(target)?;
        write_text(&out_dir.join("target-consistency.md"), &report)?;
        Some(missing)
    } else {
        None
    };

    let checklists: BTreeMap<&'static str, &[&'static str]> = BTreeMap::from([
        (
            "control-flow",
            &[
                "URL/query 参数、feature flag、localStorage 是否改变模型/关卡/难度？",
                "主路径与 fallback 分别是什么？触发条件是什么？",
                "模型/资源选择是 `?char=old` 这类分支，还是按角色/关卡覆盖？",
                "角色 id、显示名、模型名、图集名是否一致？",
            ][..],
        ),
        (
            "shaders",
            &[
                "每个 onBeforeCompile/ShaderMaterial 的注入点、uniform、依赖的几何/UV/法线是什么？",
                "目标引擎用 surface shader、材质注入还是烘焙近似？",
                "是否有 face decal / neck / 法线修复这类运行时 shader 被漏掉？",
            ][..],
        ),
        (
            "materials",
            &[
                "clearcoat / emissiveStrength / doubleSided / COLOR_0 是否在目标材质里保留？",
                "baseColor/metallic/roughness 是否与 GLB 一致？",
                "纹理 UV 集、法线贴图、切线、颜色空间是否一致？",
            ][..],
        ),
        (
            "models",
            &[
                "每个角色/关卡实际用哪套模型？主路径和 fallback 各是什么？",
                "模型节点（车轮/头/尾巴/耳朵）是否齐全？",
                "图集与材质是否对应？有没有占位 id 与显示名不一致？",
            ][..],
        ),
        (
            "animations",
            &[
                "GLTF animation 与程序化动画各有哪些？",
                "车轮 spin/steer、Wob_ 弹簧、眨眼、头部 look 是否在目标每帧更新？",
                "UI tween/相机 intro 是否按原版时长与缓动？",
            ][..],
        ),
        (
            "lighting",
            &[
                "标题/比赛的太阳方向、仰角、阴影相机范围是否来自源码？",
                "shadow bias / normalBias / mapSize / cascade 是否照搬？",
                "色调映射（Neutral/ACES）、Bloom、DOF、环境贴图、最终调色是否缺失？",
            ][..],
        ),
        (
            "ui",
            &[
                "对照 UI_INVENTORY：控件、位置尺寸、显隐条件是否 1:1？",
                "无 data-* 锚点的骨架件（wallet/corner/menu/footer）是否漏掉？",
                "换屏、键盘/指针映射、节奏节点是否与源码一致？",
            ][..],
        ),
    ]);

    let mut written = Vec::new();
    for topic in TOPICS {
        let topic_hits = topic_hits(&hits, topic.id);
        let checklist = checklists.get(topic.id).copied().unwrap_or(&[]);
        let extra = if topic.id == "materials" {
            materials_section.as_str()
        } else {
            ""
        };
        written.push(write_topic(&out_dir, topic, topic_hits, checklist, extra)?);
    }

    let total: usize = hits.values().map(Vec::len).sum();
    let glb_material_count: usize = glb_files.iter().map(|file| file.materials.len()).sum();
    let glb_vertex_color_count: usize = glb_files
        .iter()
        .map(|file| file.vertex_color_meshes.len())
        .sum();
    let mut summary = String::new();
    summary.push_str("# t3m audit summary\n\n");
    summary.push_str(&format!("- 源码目录：`{}`\n", dir.display()));
    summary.push_str(&format!("- 扫描文件：{} 个\n", files.len()));
    summary.push_str(&format!("- 证据命中：{} 处\n", total));
    let library_total = hits.values().flatten().filter(|hit| hit.library).count();
    summary.push_str(&format!("- 其中库/引擎代码命中：{} 处\n", library_total));
    summary.push_str(&format!(
        "- GLB 材质：{} 个；带 COLOR_0 的网格：{} 个\n\n",
        glb_material_count, glb_vertex_color_count
    ));
    if let Some(missing) = target_missing {
        summary.push_str(&format!(
            "- 目标侧一致性：{} 个 token 未在目标发现（见 `target-consistency.md`）\n\n",
            missing
        ));
    }
    summary.push_str("| 主题 | 命中 | 其中库/引擎 | 文件 |\n|---|---:|---:|---|\n");
    for topic in TOPICS {
        let rows = hits.get(topic.id).map(Vec::as_slice).unwrap_or(&[]);
        let count = rows.len();
        let library = rows.iter().filter(|hit| hit.library).count();
        summary.push_str(&format!(
            "| {} | {} | {} | `{}/{}.md` |\n",
            topic.title,
            count,
            library,
            out_dir.display(),
            topic.id
        ));
    }
    summary.push_str(
        "\n> JS 命中可能包含 bundle 内联的 three.js 库代码；优先看 `index.html`、游戏自有脚本和 GLB 材质表。\n\
         > 把确认过的事实写进 `SOURCE_NOTES.md`（`file:line` + 值/分支/资源）；\n\
         > 视觉修复把 `source_evidence` 写进 `visual_fixes`。不要从截图直接改参数。\n",
    );
    write_text(&out_dir.join("SUMMARY.md"), &summary)?;

    if as_json {
        let topics: Vec<_> = TOPICS
            .iter()
            .map(|topic| {
                json!({
                    "id": topic.id,
                    "title": topic.title,
                    "count": hits.get(topic.id).map(Vec::len).unwrap_or(0),
                    "libraryCount": hits.get(topic.id).map(|rows| rows.iter().filter(|hit| hit.library).count()).unwrap_or(0),
                    "file": out_dir.join(format!("{}.md", topic.id)),
                    "hits": hits.get(topic.id).map(|rows| rows.iter().map(|hit| json!({
                        "file": hit.file,
                        "line": hit.line,
                        "snippet": hit.snippet,
                        "matches": &hit.matches,
                        "library": hit.library,
                    })).collect::<Vec<_>>()).unwrap_or_default(),
                })
            })
            .collect();
        return Ok(serde_json::to_string_pretty(&json!({
            "source": dir,
            "audit_dir": out_dir,
            "files": files.len(),
            "total_hits": total,
            "library_hits": library_total,
            "target_consistency_missing": target_missing,
            "glb_materials": glb_material_count,
            "glb_vertex_color_meshes": glb_vertex_color_count,
            "topics": topics,
        }))
        .unwrap_or_else(|_| "{}".to_string()));
    }
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(prefix: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("{prefix}-{}-{stamp}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn audit_writes_topic_files_with_source_evidence() {
        let root = temp_dir("t3m-audit");
        let source = root.join("source/game");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("index.html"),
            r#"<script>
const params = new URLSearchParams(location.search);
const variant = params.get("char");
if (char === "old") useFallback();
const model = assets["kart_fox_r13a"];
const driver = assets["driver_fox"];
const tsun = params.get("tsun");
material.onBeforeCompile = (shader) => { shader.fragmentShader = "uFace"; };
function ab(s, e) { let t = rb(s, e); if (t) return t; return null; }
</script>"#,
        )
        .unwrap();
        fs::write(
            source.join("game.js"),
            r#"const material = { clearcoat: 1, doubleSided: true };
const body = { color_0: true, emissiveStrength: 3 };
wheelSpin += speed * dt;
head.rotation.y = lookY;
"#,
        )
        .unwrap();

        let out = root.join("source/audit");
        let summary = run(&source, Some(&out), None, false).unwrap();
        assert!(summary.contains("t3m audit summary"));
        for topic in [
            "control-flow",
            "shaders",
            "materials",
            "models",
            "animations",
            "lighting",
            "ui",
        ] {
            let path = out.join(format!("{topic}.md"));
            assert!(path.is_file(), "missing {}", path.display());
        }
        let control = fs::read_to_string(out.join("control-flow.md")).unwrap();
        assert!(control.contains("URLSearchParams"));
        assert!(control.contains("char === \"old\""));
        assert!(control.contains("function ab("));
        let shaders = fs::read_to_string(out.join("shaders.md")).unwrap();
        assert!(shaders.contains("onBeforeCompile"));
        let lighting = fs::read_to_string(out.join("lighting.md")).unwrap();
        assert!(lighting.contains("tsun"));
        let materials = fs::read_to_string(out.join("materials.md")).unwrap();
        assert!(materials.contains("clearcoat"));
        assert!(materials.contains("color_0"));
        let animations = fs::read_to_string(out.join("animations.md")).unwrap();
        assert!(animations.contains("wheelSpin"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn audit_json_returns_topic_counts() {
        let root = temp_dir("t3m-audit-json");
        let source = root.join("source/game");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("game.js"),
            "material.onBeforeCompile = () => {};\nwheelSpin += 1;\n",
        )
        .unwrap();
        let out = root.join("source/audit");
        let json = run(&source, Some(&out), None, true).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["total_hits"], 2);
        assert_eq!(value["topics"][1]["id"], "shaders");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn audit_reads_glb_material_features_and_vertex_colors() {
        let root = temp_dir("t3m-audit-glb");
        let source = root.join("source/game");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("game.js"), "const x = 1;\n").unwrap();
        let json = r#"{
            "materials": [{
                "name": "Paint",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.1, 0.2, 1.0, 1.0],
                    "metallicFactor": 0.3,
                    "roughnessFactor": 0.3
                },
                "extensions": {
                    "KHR_materials_clearcoat": {"clearcoatFactor": 1.0},
                    "KHR_materials_emissive_strength": {"emissiveStrength": 3.0}
                },
                "doubleSided": true
            }],
            "meshes": [{
                "name": "Body",
                "primitives": [{"attributes": {"COLOR_0": 0}}]
            }]
        }"#;
        let mut json_bytes = json.as_bytes().to_vec();
        while json_bytes.len() % 4 != 0 {
            json_bytes.push(b' ');
        }
        let total = 12 + 8 + json_bytes.len();
        let mut glb = Vec::new();
        glb.extend_from_slice(b"glTF");
        glb.extend_from_slice(&2u32.to_le_bytes());
        glb.extend_from_slice(&(total as u32).to_le_bytes());
        glb.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes());
        glb.extend_from_slice(&0x4E4F534Au32.to_le_bytes());
        glb.extend_from_slice(&json_bytes);
        fs::write(source.join("asset_test.glb"), glb).unwrap();

        let out = root.join("source/audit");
        let summary = run(&source, Some(&out), None, false).unwrap();
        assert!(summary.contains("GLB 材质：1"));
        let materials = fs::read_to_string(out.join("materials.md")).unwrap();
        assert!(materials.contains("Paint"));
        assert!(materials.contains("1.000"));
        assert!(materials.contains("true"));
        assert!(materials.contains("Body"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn audit_matches_turbo_tails_golden_patterns() {
        let root = temp_dir("t3m-audit-golden");
        let source = root.join("source/game");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("game.js"),
            include_str!("../testdata/turbo-tails-golden.js"),
        )
        .unwrap();
        let out = root.join("source/audit");
        run(&source, Some(&out), None, false).unwrap();

        let read = |name: &str| fs::read_to_string(out.join(format!("{name}.md"))).unwrap();
        let control = read("control-flow");
        assert!(control.contains("function ab("));
        assert!(control.contains("return null"));
        let models = read("models");
        assert!(models.contains("kart_fox_r13a"));
        assert!(models.contains("driver_"));
        let shaders = read("shaders");
        assert!(shaders.contains("uFace"));
        assert!(shaders.contains("uNeckM"));
        let animations = read("animations");
        assert!(animations.contains("wheelSpin"));
        assert!(animations.contains("Wob_"));
        let lighting = read("lighting");
        assert!(lighting.contains("\"tsun\""));
        assert!(lighting.contains("shadow.bias"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn audit_reports_target_consistency_tokens() {
        let root = temp_dir("t3m-audit-target");
        let source = root.join("source/game");
        let target = root.join("dest");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(target.join("scripts")).unwrap();
        fs::create_dir_all(target.join("assets/models/test")).unwrap();
        fs::write(source.join("game.js"), "const x = 1;\n").unwrap();
        fs::write(
            target.join("scripts/Game.lua"),
            "local wheelSpin = 0\nlocal model = 'r13a'\n",
        )
        .unwrap();
        fs::write(
            target.join("assets/models/test/Material.xml"),
            "<material cull=\"none\" />\n",
        )
        .unwrap();

        let out = root.join("source/audit");
        let summary = run(&source, Some(&out), Some(&target), false).unwrap();
        assert!(summary.contains("目标侧一致性"));
        let report = fs::read_to_string(out.join("target-consistency.md")).unwrap();
        assert!(report.contains("| animations | `wheelspin` | 发现 @"));
        assert!(report.contains("| materials | `cull=\"none\"` | 发现 @"));
        assert!(report.contains("| shaders | `uface` | 未发现 |"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn audit_rejects_an_empty_source_dir() {
        let root = temp_dir("t3m-audit-empty");
        let error = run(&root, Some(&root.join("audit")), None, false).unwrap_err();
        assert!(error.0.contains("no .js/.mjs/.html/.css"));
        fs::remove_dir_all(root).unwrap();
    }
}
