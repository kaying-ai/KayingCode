//! `t3m analyze` — turn the fetched sources into a transcription work list:
//! which engine gaps this specific game hits, in what file, and in which order
//! to transcribe.

use crate::knowledge;
use crate::util::{collect_files, err, line_count, read_text, write_text, CliResult};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

struct Hit {
    file: String,
    line: usize,
    snippet: String,
}

pub fn run(dir: &Path, out: Option<&Path>, verbose: bool) -> CliResult<String> {
    if !dir.is_dir() {
        return err(format!("{} is not a directory", dir.display()));
    }
    let mut files: Vec<PathBuf> = Vec::new();
    for ext in ["js", "mjs", "html", "css"] {
        collect_files(dir, ext, &mut files)?;
    }
    files.retain(|f| {
        let name = f
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        !name.contains("three.module") && !name.ends_with(".min.js")
    });
    files.sort();
    if files.is_empty() {
        return err(format!(
            "no .js/.html/.css under {} — run `t3m fetch <url> --out <dir>` first",
            dir.display()
        ));
    }

    let feats = knowledge::features();
    let mut hits: BTreeMap<&str, Vec<Hit>> = BTreeMap::new();
    let mut file_rows: Vec<(String, usize, usize)> = Vec::new();
    let mut imports: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut total_lines = 0usize;

    for f in &files {
        let text = read_text(f)?;
        let rel = f
            .strip_prefix(dir)
            .unwrap_or(f)
            .to_string_lossy()
            .replace('\\', "/");
        let lines = line_count(&text);
        total_lines += lines;
        file_rows.push((rel.clone(), lines, text.len()));
        if rel.ends_with(".js") || rel.ends_with(".mjs") {
            let mut deps = Vec::new();
            for line in text.lines() {
                if let Some(rest) = line.trim().strip_prefix("import ") {
                    if let Some(q) = rest.find('"').or_else(|| rest.find('\'')) {
                        let tail = &rest[q + 1..];
                        if let Some(end) = tail.find(['"', '\'']) {
                            deps.push(tail[..end].to_string());
                        }
                    }
                }
            }
            deps.sort();
            deps.dedup();
            if !deps.is_empty() {
                imports.insert(rel.clone(), deps);
            }
        }
        for feat in &feats {
            for (i, line) in text.lines().enumerate() {
                if line.contains(feat.pattern) {
                    hits.entry(feat.id).or_default().push(Hit {
                        file: rel.clone(),
                        line: i + 1,
                        snippet: line.trim().chars().take(120).collect(),
                    });
                }
            }
        }
    }

    let detected: Vec<_> = feats.iter().filter(|f| hits.contains_key(f.id)).collect();
    let high = detected.iter().filter(|f| f.risk == "high").count();
    let med = detected.iter().filter(|f| f.risk == "medium").count();

    let mut r = String::new();
    r.push_str("# three.js → TapTap Maker 转写报告\n\n");
    r.push_str(&format!("- 源码目录：`{}`\n", dir.display()));
    r.push_str(&format!(
        "- 文件数：{}（有效行 {}）\n",
        files.len(),
        total_lines
    ));
    r.push_str(&format!(
        "- 命中引擎差异：{} 项（高风险 {} / 中风险 {}）\n\n",
        detected.len(),
        high,
        med
    ));

    r.push_str("## 一、模块图\n\n");
    if imports.is_empty() {
        r.push_str("_未检测到 ES 模块 import_\n\n");
    } else {
        for (file, deps) in &imports {
            r.push_str(&format!("- `{file}`\n"));
            for d in deps {
                r.push_str(&format!("  - {d}\n"));
            }
        }
        r.push('\n');
    }

    r.push_str("## 二、文件规模\n\n| 文件 | 有效行 | 字节 |\n|---|---:|---:|\n");
    for (f, lines, bytes) in &file_rows {
        r.push_str(&format!("| `{f}` | {lines} | {bytes} |\n"));
    }
    r.push('\n');

    r.push_str("## 三、按风险排列的工作清单\n\n");
    for risk in ["high", "medium", "low"] {
        let group: Vec<_> = detected.iter().filter(|f| f.risk == risk).collect();
        if group.is_empty() {
            continue;
        }
        let label = match risk {
            "high" => "🔴 高风险（漏了会白屏/死锁/明显错位）",
            "medium" => "🟡 中风险（观感或手感差异）",
            _ => "🟢 低风险（打磨项）",
        };
        r.push_str(&format!("### {label}\n\n"));
        for feat in group {
            let hs = &hits[feat.id];
            r.push_str(&format!("#### `{}` {}\n\n", feat.id, feat.title));
            r.push_str(&format!("- **Maker 对应**：{}\n", feat.maker));
            r.push_str(&format!("- **坑与修法**：{}\n", feat.pitfall));
            r.push_str(&format!("- **命中 {} 处**：\n", hs.len()));
            for h in hs.iter().take(6) {
                r.push_str(&format!("  - `{}:{}` {}\n", h.file, h.line, h.snippet));
            }
            if hs.len() > 6 {
                r.push_str(&format!("  - … 另有 {} 处\n", hs.len() - 6));
            }
            r.push('\n');
        }
    }

    let undetected: Vec<_> = feats.iter().filter(|f| !hits.contains_key(f.id)).collect();
    if !undetected.is_empty() {
        r.push_str("## 四、未命中的检查项（按需人工确认）\n\n");
        for f in undetected {
            r.push_str(&format!("- `{}` {} — {}\n", f.id, f.title, f.maker));
        }
        r.push('\n');
    }

    r.push_str("## 五、转写顺序\n\n");
    for (step, detail) in knowledge::pipeline() {
        r.push_str(&format!("- **{step}**：{detail}\n"));
    }
    r.push('\n');

    r.push_str("## 六、验收清单（逐条打勾）\n\n");
    for item in knowledge::acceptance() {
        r.push_str(&format!("- [ ] {item}\n"));
    }
    r.push('\n');

    r.push_str("## 七、下一步命令\n\n");
    r.push_str("```bash\n");
    r.push_str("# 关卡数据 → Lua\n");
    r.push_str("t3m levels <源码目录>/src/levels/data.js --out <项目>/scripts/Levels.lua --name CKData.LEVELS\n");
    r.push_str("# 界面规格（控件清单/位置尺寸/屏幕流程/键盘映射/节奏节点）——动 UI 之前先跑\n");
    r.push_str("t3m ui <源码目录> --out source/UI_INVENTORY.md\n");
    r.push_str("# 转写完成后体检\n");
    r.push_str("t3m lint <Maker 项目目录>\n");
    r.push_str("```\n");

    if let Some(path) = out {
        write_text(path, &r)?;
        if verbose {
            crate::outln!("report written to {}", path.display());
        }
    }
    Ok(r)
}
