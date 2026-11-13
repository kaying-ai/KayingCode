//! t3m — three.js → TapTap Maker transcription toolkit.
//!
//! Subcommands:
//!   init     create an isolated working directory for one game transcription
//!   fetch    pull a web game's own sources (page, module graph, css)
//!   analyze  turn those sources into a risk-ordered transcription work list
//!   levels   convert JS level/config arrays into a Lua table
//!   lint     check a transcribed Maker project against the known engine traps
//!   rlog     runtime gate: classify the engine's runtime.log for a project
//!   compare  calculate pixel metrics and a diff for two same-sized PNGs
//!   doctor   report the local tooling and the knowledge base size
//!
//! See `../skills/threejs-to-taptapmaker/SKILL.md` for the full workflow.

mod analyze;
mod compare;
mod fetch;
mod knowledge;
mod levels;
mod lint;
mod rlog;
mod ui;
mod util;
mod workspace;

use std::path::{Path, PathBuf};
use util::{err, CliResult};

fn usage() -> String {
    r#"t3m — three.js → TapTap Maker (UrhoX Lua) 转写工具

USAGE:
  t3m init <url> [--name NAME] [--dir PARENT]
      新建转写工作目录 convert_game_YYYYMMDDHHMMSS/
      （project-info.json + source/ + source/SOURCE_NOTES.md + source/audit/ + dest/）

  t3m mark <project-info.json> <stage> [status] [--force]
      更新 project-info.json 里某阶段的状态（默认 done；阶段见 init 建出的 stages）
      `accept` 是硬门禁：必须先记录 runtime_log 与 maker_url 才允许标记 done；
      缺失 SOURCE_NOTES.md / visual_fixes / gameplay_screenshot 时给出源码证据警告；
      确实要跳过时用 --force

  t3m note <project-info.json> <key> <value>
      往 project-info.json 的 artifacts 里记录产物路径（如 report → source/report.md）
      accept 前建议记录：
        visual_fixes source/audit/visual-fixes.md
        gameplay_screenshot <最终比赛截图>

  t3m fetch <url> [--out <dir>] [--insecure] [--max-files N] [-v]
      抓取网页游戏的 index.html、ES 模块图与 CSS（库文件只记录不下载）

  t3m analyze <dir> [--out <report.md>] [-v]
      把抓到的源码映射成「引擎差异工作清单」，按风险排序

  t3m levels <file.js> [--out <file.lua>] [--name NAME] [--raw]
      把 JS 的关卡/配置数组转成 Lua 表（默认包成 local NAME = {...} + return）

  t3m ui <source-dir> [--out <UI_INVENTORY.md>] [--json] [--check <maker-project-dir>]
      从原版源码提取「UI 转写清单」：页面容器、CSS 盒子模型、控件清单（data-* 锚点 + class
      + 文案 key）、屏幕与导航、键盘/指针映射、节奏计时节点，外加一张逐条对齐表
      --check 对 Maker 工程做对齐下限检查：原版每个可操作控件在转写 UI 代码里都要有对应实现
      （缺失 → 退出码 1）；动 UI 之前先跑它：控件 1:1、位置尺寸按 CSS 直译、功能与显隐条件逐条对照

  t3m lint <maker-project-dir> [--json] [--all]
      默认只查用户代码 scripts/ 与 assets 下的 .shader；--all 连引擎库一起扫
      体检转写后的项目：把已知的引擎坑逐条查出来（高风险存在时退出码 1）

  t3m rlog <maker-project-dir> [--dir <session|log>] [--json] [--lines N]
      运行时门禁：找到本工程最新一次本地预览的 runtime.log，分类统计
      Lua 报错 / 项目资源缺失 / 引擎包噪声；Lua 报错或资源缺失或日志比代码旧 → 退出码 1

  t3m compare <source.png> <target.png> --profile <compare-profile.v1.json> --out <dir> [--json]
      同尺寸逐像素比较；输出 source.png / target.png / diff.png / metrics.json
      profile 显式声明 mask、ROI 与各区阈值；必检区未通过时退出码 1

  t3m knowledge [--markdown] [--landmines]
      打印内置的引擎差异知识库（--markdown 输出可直接落盘的文档）
      --landmines 打印引擎 API 坑位表（症状 → 修法）

  t3m doctor
      环境与知识库信息（含本机 runtime / preview 命令族 / LSP / ImageMagick）
"#
    .to_string()
}

struct Args {
    positional: Vec<String>,
    flags: Vec<(String, Option<String>)>,
}

impl Args {
    fn parse(argv: &[String]) -> CliResult<Args> {
        let mut positional = Vec::new();
        let mut flags = Vec::new();
        let mut i = 0;
        while i < argv.len() {
            let a = &argv[i];
            if let Some(name) = a.strip_prefix("--") {
                let (key, inline) = match name.split_once('=') {
                    Some((k, v)) => (k.to_string(), Some(v.to_string())),
                    None => (name.to_string(), None),
                };
                if inline.is_none() {
                    // value flags consume the next token when it is not a flag
                    let takes_value = matches!(
                        key.as_str(),
                        "out" | "name" | "dir" | "max-files" | "lines" | "check" | "profile"
                    );
                    if takes_value {
                        if let Some(next) = argv.get(i + 1) {
                            if !next.starts_with('-') {
                                flags.push((key, Some(next.clone())));
                                i += 2;
                                continue;
                            }
                        }
                    }
                }
                flags.push((key, inline));
            } else if a == "-v" {
                flags.push(("verbose".into(), None));
            } else {
                positional.push(a.clone());
            }
            i += 1;
        }
        if positional.is_empty() {
            return err("missing subcommand\n\n".to_string() + &usage());
        }
        Ok(Args { positional, flags })
    }
    fn flag(&self, name: &str) -> bool {
        self.flags.iter().any(|(k, _)| k == name)
    }
    fn value(&self, name: &str) -> Option<String> {
        self.flags
            .iter()
            .find(|(k, _)| k == name)
            .and_then(|(_, v)| v.clone())
    }
    fn number(&self, name: &str, default: usize) -> usize {
        self.value(name)
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(default)
    }
}

fn find_project_info_for_output(out: &Path) -> Option<PathBuf> {
    let absolute = if out.is_absolute() {
        out.to_path_buf()
    } else {
        std::env::current_dir().ok()?.join(out)
    };
    absolute
        .ancestors()
        .map(|ancestor| ancestor.join("project-info.json"))
        .find(|candidate| candidate.is_file())
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let code = match run(&argv) {
        Ok(code) => code,
        Err(e) => {
            crate::errln!("t3m: {e}");
            2
        }
    };
    std::process::exit(code);
}

fn run(argv: &[String]) -> CliResult<i32> {
    let args = Args::parse(argv)?;
    let cmd = args.positional[0].as_str();
    let verbose = args.flag("verbose");

    match cmd {
        "init" => {
            let url = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("init needs a game URL".into()))?;
            let parent = PathBuf::from(args.value("dir").unwrap_or_else(|| ".".into()));
            workspace::run(
                url,
                args.value("name").as_deref(),
                &parent,
                env!("CARGO_PKG_VERSION"),
            )?;
            Ok(0)
        }
        "mark" => {
            let info = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("mark needs project-info.json".into()))?;
            let stage = args
                .positional
                .get(2)
                .ok_or_else(|| util::CliError("mark needs a stage name".into()))?;
            let status = args.positional.get(3).map(String::as_str).unwrap_or("done");
            workspace::mark(&PathBuf::from(info), stage, status, args.flag("force"))?;
            crate::outln!("{info}: {stage} → {status}");
            Ok(0)
        }
        "note" => {
            let info = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("note needs project-info.json".into()))?;
            let key = args
                .positional
                .get(2)
                .ok_or_else(|| util::CliError("note needs a key".into()))?;
            let value = args
                .positional
                .get(3)
                .ok_or_else(|| util::CliError("note needs a value".into()))?;
            workspace::note_artifact(&PathBuf::from(info), key, value)?;
            crate::outln!("{info}: artifacts.{key} = {value}");
            Ok(0)
        }
        "fetch" => {
            let url = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("fetch needs a URL".into()))?;
            let out = PathBuf::from(args.value("out").unwrap_or_else(|| "sources".into()));
            let report = fetch::run(
                url,
                &out,
                args.flag("insecure"),
                args.number("max-files", 200),
                verbose || true,
            )?;
            let downloaded = report.entries.iter().filter(|e| !e.skipped).count();
            crate::outln!(
                "\n{} files downloaded into {} ({} vendor refs skipped, {} external refs)",
                downloaded,
                out.display(),
                report.entries.len() - downloaded,
                report.externals.len()
            );
            if !report.importmap.is_empty() {
                crate::outln!("importmap:");
                for (k, v) in &report.importmap {
                    crate::outln!("  {k} -> {v}");
                }
            }
            // A portal URL is a shell: the game itself is one or two iframes
            // deep, so point at the real entry instead of letting the analysis
            // run over Next.js wrapper chunks.
            if !report.iframe_hops.is_empty() {
                crate::outln!("\niframe / wrapper hop(s) found（这一层是外壳，不是游戏本体）:");
                for u in &report.iframe_hops {
                    crate::outln!("  {u}");
                }
            }
            if !report.game_entries.is_empty() {
                crate::outln!("\ngame entry candidate(s)（真正的游戏入口通常在这里）:");
                for u in &report.game_entries {
                    crate::outln!("  {u}");
                }
                crate::outln!(
                    "  next: t3m fetch \"{}\" --out source/game/",
                    report.game_entries[0]
                );
                crate::outln!(
                    "  then: t3m analyze source/game/ --out source/report.md   （转写以 source/game/ 的原版源码为准）"
                );
            }
            if let Some(info_path) = find_project_info_for_output(&out) {
                let source_preview_url = report
                    .game_entries
                    .first()
                    .map_or(url.as_str(), String::as_str);
                workspace::note_artifact(&info_path, "source_preview_url", source_preview_url)?;
                crate::outln!(
                    "  recorded: {} artifacts.source_preview_url = {}",
                    info_path.display(),
                    source_preview_url
                );
            }
            Ok(0)
        }
        "analyze" => {
            let dir = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("analyze needs a source directory".into()))?;
            let dir = PathBuf::from(dir);
            let out = args.value("out").map(PathBuf::from);
            let report = analyze::run(&dir, out.as_deref(), verbose)?;
            if out.is_none() {
                crate::out!("{report}");
            } else {
                crate::outln!("\n{}", out.unwrap().display());
            }
            Ok(0)
        }
        "levels" => {
            let input = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("levels needs a JS file".into()))?;
            let out = args.value("out").map(PathBuf::from);
            let name = args.value("name");
            let lua = levels::run(
                &PathBuf::from(input),
                out.as_deref(),
                name.as_deref(),
                args.flag("raw"),
            )?;
            if out.is_none() {
                crate::out!("{lua}");
            }
            Ok(0)
        }
        "ui" => {
            let dir = args.positional.get(1).ok_or_else(|| {
                util::CliError("ui needs a source directory (the fetched original)".into())
            })?;
            let dir = PathBuf::from(dir);
            if let Some(dest) = args.value("check") {
                let (missing, total, report) = ui::check(&dir, &PathBuf::from(dest))?;
                crate::out!("{report}");
                if missing > 0 {
                    crate::outln!(
                        "\nverdict: FAIL — {missing}/{total} 个原版控件在转写 UI 代码里没有对应实现（退出码 1）"
                    );
                    return Ok(1);
                }
                crate::outln!(
                    "\nverdict: PASS — 下限检查通过（形态/位置/显隐仍需按对齐表与截图核对）"
                );
                return Ok(0);
            }
            let out = args.value("out").map(PathBuf::from);
            let report = ui::run(&dir, out.as_deref(), args.flag("json"), verbose)?;
            if out.is_none() {
                crate::out!("{report}");
            } else {
                crate::outln!(
                    "\nUI 转写清单已写入 {}（把最后一列「Maker 实现」填满再动手，收尾时 t3m note project-info.json ui_inventory <路径>）",
                    out.unwrap().display()
                );
            }
            Ok(0)
        }
        "lint" => {
            let project = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("lint needs a project directory".into()))?;
            let (findings, files) =
                lint::run(&PathBuf::from(project), args.flag("json"), args.flag("all"))?;
            let _ = files;
            let high = findings.iter().filter(|f| f.severity == "high").count();
            Ok(if high > 0 { 1 } else { 0 })
        }
        "knowledge" => {
            let md = args.flag("markdown");
            if args.flag("landmines") {
                for l in knowledge::landmines() {
                    crate::outln!("[{}] {}", l.id, l.symptom);
                    crate::outln!("      fix: {}", l.fix);
                }
            } else if md {
                crate::outln!(
                    "# 引擎差异映射表（three.js → TapTap Maker）
"
                );
                for risk in ["high", "medium", "low"] {
                    let label = match risk {
                        "high" => "## 🔴 高风险",
                        "medium" => "## 🟡 中风险",
                        _ => "## 🟢 低风险",
                    };
                    let group: Vec<_> = knowledge::features()
                        .into_iter()
                        .filter(|f| f.risk == risk)
                        .collect();
                    if group.is_empty() {
                        continue;
                    }
                    crate::outln!(
                        "{label}
"
                    );
                    crate::outln!("| 检测指纹 | 原版用法 | Maker 对应 | 坑与修法 |");
                    crate::outln!("|---|---|---|---|");
                    for f in group {
                        crate::outln!(
                            "| `{}` | {} | {} | {} |",
                            f.pattern,
                            f.title,
                            f.maker,
                            f.pitfall
                        );
                    }
                    crate::outln!();
                }
            } else {
                for f in knowledge::features() {
                    crate::outln!("[{:6}] {:<22} {}", f.risk, f.id, f.title);
                    crate::outln!("         fingerprint: {}", f.pattern);
                    crate::outln!("         maker:       {}", f.maker);
                    crate::outln!("         pitfall:     {}", f.pitfall);
                }
            }
            Ok(0)
        }
        "rlog" => {
            let project = args
                .positional
                .get(1)
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."));
            let explicit = args.value("dir").map(PathBuf::from);
            let report = rlog::analyze(&project, explicit.as_deref())?;
            rlog::print(&report, args.flag("json"), args.number("lines", 12));
            Ok(if report.failed() { 1 } else { 0 })
        }
        "compare" => {
            let source = args
                .positional
                .get(1)
                .ok_or_else(|| util::CliError("compare needs source.png".into()))?;
            let target = args
                .positional
                .get(2)
                .ok_or_else(|| util::CliError("compare needs target.png".into()))?;
            let profile = args.value("profile").ok_or_else(|| {
                util::CliError("compare needs --profile <compare-profile.v1.json>".into())
            })?;
            let out = args
                .value("out")
                .ok_or_else(|| util::CliError("compare needs --out <directory>".into()))?;
            let out_path = PathBuf::from(&out);
            let result = compare::run(
                &PathBuf::from(source),
                &PathBuf::from(target),
                &PathBuf::from(profile),
                &out_path,
            )?;
            if args.flag("json") {
                crate::out!("{}", result.json);
            } else {
                crate::outln!(
                    "visual compare: {} (changed {:.3}%, RGB MAE {:.3}, RMSE {:.3}, SSIM {:.5})",
                    if result.passed { "PASS" } else { "FAIL" },
                    result.changed_pixel_ratio * 100.0,
                    result.rgb_mae,
                    result.rgb_rmse,
                    result.ssim,
                );
                crate::outln!("evidence: {}", out);
            }
            Ok(if result.passed { 0 } else { 1 })
        }
        "doctor" => {
            crate::outln!("t3m {}", env!("CARGO_PKG_VERSION"));
            crate::outln!(
                "features in knowledge base: {}",
                knowledge::features().len()
            );
            crate::outln!("engine landmines: {}", knowledge::landmines().len());
            crate::outln!("pipeline steps: {}", knowledge::pipeline().len());
            crate::outln!("acceptance checks: {}", knowledge::acceptance().len());
            crate::outln!("curl: {}", which("curl"));
            crate::outln!("node: {}", which("node"));
            crate::outln!("cargo: {}", which("cargo"));
            crate::outln!("ImageMagick: {}", which("magick"));
            match maker_runtime() {
                Some((ver, path)) => {
                    crate::outln!("local maker runtime: {ver} ({})", path.display());
                    crate::outln!("  preview family: {}", preview_support(&path));
                    crate::outln!(
                        "  preview start:  node \"{}\" preview start --target-dir <project>",
                        path.display()
                    );
                    crate::outln!("  then gate with: t3m rlog <project>");
                }
                None => crate::outln!(
                    "local maker runtime: not found (looked in ~/.taptap-maker/mcp-runtime/*/dist/maker.js)"
                ),
            }
            crate::outln!("maker-lua-lsp: {}", lua_lsp());
            Ok(0)
        }
        "help" | "-h" | "--help" => {
            crate::out!("{}", usage());
            Ok(0)
        }
        other => err(format!("unknown subcommand '{other}'\n\n{}", usage())),
    }
}

fn which(bin: &str) -> String {
    let out = std::process::Command::new(bin).arg("--version").output();
    match out {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            text.lines().next().unwrap_or("present").trim().to_string()
        }
        _ => "not found".to_string(),
    }
}

fn home_dir() -> Option<PathBuf> {
    util::home_dir()
}

fn version_key(v: &str) -> (u32, u32, u32) {
    let mut it = v.split('.').map(|p| {
        p.chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse::<u32>()
            .unwrap_or(0)
    });
    (
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
    )
}

/// Newest `~/.taptap-maker/mcp-runtime/<version>/dist/maker.js` on this machine.
/// The local preview command family (`preview install|prepare|start|refresh|stop|logs|check`)
/// landed in 0.0.34; older copies can build but not run the game.
fn maker_runtime() -> Option<(String, PathBuf)> {
    let dir = home_dir()?.join(".taptap-maker").join("mcp-runtime");
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    for e in std::fs::read_dir(&dir).ok()?.flatten() {
        let ver = e.file_name().to_string_lossy().to_string();
        let js = e.path().join("dist").join("maker.js");
        if js.is_file() {
            found.push((ver, js));
        }
    }
    found.sort_by_key(|(v, _)| version_key(v));
    found.pop()
}

fn preview_support(maker_js: &PathBuf) -> String {
    let out = std::process::Command::new("node")
        .arg(maker_js)
        .arg("preview")
        .arg("--help")
        .output();
    match out {
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout).to_string()
                + &String::from_utf8_lossy(&o.stderr);
            if text.contains("--target-dir") || text.contains("preview install") {
                "yes".to_string()
            } else {
                "no (needs maker 0.0.34+)".to_string()
            }
        }
        Err(_) => "unknown (node not runnable)".to_string(),
    }
}

fn lua_lsp() -> String {
    let Some(home) = home_dir() else {
        return "not found".to_string();
    };
    let venv = home.join(".taptap-maker").join("lua-lsp-venv");
    for c in [
        venv.join("Scripts").join("maker-lua-lsp.exe"),
        venv.join("Scripts").join("maker-lua-lsp"),
        venv.join("bin").join("maker-lua-lsp"),
        venv.join("bin").join("maker-lua-lsp.exe"),
    ] {
        if c.is_file() {
            return c.display().to_string();
        }
    }
    which("maker-lua-lsp")
}
