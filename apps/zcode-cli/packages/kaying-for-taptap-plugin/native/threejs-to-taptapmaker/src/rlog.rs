//! `t3m rlog` — the runtime gate.
//!
//! Static checks (LSP, lint, remote build) cannot see a running game: the
//! reference transcription passed all of them and still crashed on boot with
//! six distinct bugs. The only trustworthy evidence is the engine's own
//! `runtime.log`, so this command finds that log for a project, classifies
//! every line and fails (exit 1) when the game printed a Lua error, asked for a
//! resource the project does not ship, or when the log is older than the code.
//!
//! Where the log lives:
//!   * local preview (`maker.js preview start`):
//!     `~/.taptap-maker/preview/<hash>/sessions/<session>/<reload>/runtime.log`
//!     The `<hash>` dir is identified through its `session.json`, which records
//!     `project_realpath` — no guessing from the hash itself.
//!   * remote build: `<project>/.maker/logs/runtime/runtime.log`

use crate::util::{collect_files, home_dir, read_text, CliResult};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub struct Report {
    pub log: PathBuf,
    pub total: usize,
    pub lua_errors: Vec<String>,
    pub missing_project: Vec<String>,
    pub engine_noise: Vec<String>,
    pub stale: bool,
    pub newest_code: Option<SystemTime>,
}

impl Report {
    pub fn failed(&self) -> bool {
        !self.lua_errors.is_empty() || !self.missing_project.is_empty() || self.stale
    }
}

fn norm(p: &str) -> String {
    // Windows canonicalize() returns \\?\D:\... — strip the extended prefix so
    // it can be compared with the plain path stored in session.json.
    let p = p.strip_prefix("\\\\?\\").unwrap_or(p);
    let p = p.strip_prefix("//?/").unwrap_or(p);
    p.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

/// Canonicalize when possible, then normalize (see `norm`).
fn norm_path(p: &Path) -> String {
    let s = p
        .canonicalize()
        .unwrap_or_else(|_| p.to_path_buf())
        .to_string_lossy()
        .to_string();
    norm(&s)
}

/// Pull `"project_realpath": "..."` out of a preview `session.json`
/// (JSON escaping applies: Windows paths arrive as `D:\\Games\\…`).
fn project_realpath(text: &str) -> Option<String> {
    let key = "\"project_realpath\"";
    let pos = text.find(key)?;
    let rest = &text[pos + key.len()..];
    let start = rest.find('"')? + 1;
    let tail = &rest[start..];
    let mut out = String::new();
    let mut chars = tail.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => break,
            '\\' => match chars.next() {
                Some('\\') => out.push('\\'),
                Some('"') => out.push('"'),
                Some('n') => out.push('\n'),
                Some('r') | Some('t') | Some('/') => {}
                Some(other) => out.push(other),
                None => break,
            },
            other => out.push(other),
        }
    }
    Some(out)
}

fn newest_file(dir: &Path, name: &str) -> Option<(PathBuf, SystemTime)> {
    let mut files = Vec::new();
    let ext = name.rsplit_once('.').map(|(_, e)| e).unwrap_or("log");
    collect_files(dir, ext, &mut files).ok()?;
    files
        .into_iter()
        .filter(|p| p.file_name().map(|n| n == name).unwrap_or(false))
        .filter_map(|p| {
            let t = fs::metadata(&p).ok()?.modified().ok()?;
            Some((p, t))
        })
        .max_by_key(|(_, t)| *t)
}

/// Find the newest runtime log that belongs to `project`.
pub fn locate(project: &Path, explicit: Option<&Path>) -> Option<PathBuf> {
    if let Some(p) = explicit {
        if p.is_file() {
            return Some(p.to_path_buf());
        }
        return newest_file(p, "runtime.log").map(|(p, _)| p);
    }
    let proj_norm = norm_path(project);
    if let Some(home) = home_dir() {
        let preview = home.join(".taptap-maker").join("preview");
        if let Ok(entries) = fs::read_dir(&preview) {
            let mut best: Option<(PathBuf, SystemTime)> = None;
            for e in entries.flatten() {
                let dir = e.path();
                let session = dir.join("session.json");
                let Ok(text) = read_text(&session) else {
                    continue;
                };
                let Some(rp) = project_realpath(&text) else {
                    continue;
                };
                if norm(&rp) != proj_norm {
                    continue;
                }
                if let Some((log, t)) = newest_file(&dir.join("sessions"), "runtime.log") {
                    if best.as_ref().map(|(_, bt)| t > *bt).unwrap_or(true) {
                        best = Some((log, t));
                    }
                }
            }
            if let Some((log, _)) = best {
                return Some(log);
            }
        }
    }
    let local = project.join(".maker/logs/runtime/runtime.log");
    if local.is_file() {
        return Some(local);
    }
    None
}

/// Engine-package resources that are missing in every local preview; they are
/// not the game's fault and would otherwise drown the real findings.
fn is_engine_noise(text: &str) -> bool {
    text.contains("themis_x64.dll")
        || text.contains("Cube/Day/")
        || text.contains("<official-res>")
        || text.contains("<engine-res>")
}

fn is_lua_error(text: &str) -> bool {
    if text.contains("attempt to ") || text.contains("stack traceback") {
        return true;
    }
    if text.contains("PANIC") || text.contains("Lua error") || text.contains("unprotected error") {
        return true;
    }
    // `FcFlow.lua:86: ...` — a file:line prefix from the Lua VM.
    match (text.find(".lua:"), text.find(':')) {
        (Some(p), _) => text[p + 5..]
            .chars()
            .next()
            .map(|c| c.is_ascii_digit())
            .unwrap_or(false),
        _ => false,
    }
}

/// Strip the `[date][frame] LEVEL: ` prefix and the JSON cursor wrapper.
fn payload(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let text = if trimmed.starts_with('{') {
        let key = "\"text\":\"";
        let start = trimmed.find(key)? + key.len();
        let rest = &trimmed[start..];
        let mut out = String::new();
        let mut chars = rest.chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                match chars.next() {
                    Some('n') => out.push('\n'),
                    Some('r') => {}
                    Some('t') => out.push('\t'),
                    Some('"') => out.push('"'),
                    Some('\\') => out.push('\\'),
                    Some(other) => out.push(other),
                    None => break,
                }
                continue;
            }
            if c == '"' {
                break;
            }
            out.push(c);
        }
        out
    } else {
        trimmed.to_string()
    };
    Some(text)
}

fn newest_code_mtime(project: &Path) -> Option<SystemTime> {
    let mut files = Vec::new();
    for sub in ["scripts", "assets"] {
        for ext in ["lua", "shader"] {
            let _ = collect_files(&project.join(sub), ext, &mut files);
        }
    }
    files
        .into_iter()
        .filter_map(|p| fs::metadata(&p).ok()?.modified().ok())
        .max()
}

pub fn analyze(project: &Path, explicit: Option<&Path>) -> CliResult<Report> {
    let log = locate(project, explicit).ok_or_else(|| {
        crate::util::CliError(format!(
            "no runtime log found for {}\n\
             run the local preview first (see references/runtime-loop.md):\n\
               node \"$HOME/.taptap-maker/mcp-runtime/<ver>/dist/maker.js\" preview start --target-dir <project>\n\
             or point at a session/log explicitly with --dir",
            project.display()
        ))
    })?;
    let text = read_text(&log)?;
    let mut report = Report {
        log: log.clone(),
        total: 0,
        lua_errors: Vec::new(),
        missing_project: Vec::new(),
        engine_noise: Vec::new(),
        stale: false,
        newest_code: None,
    };
    // resource kinds the project ships, so engine-package paths are not blamed
    let shipped: Vec<String> = fs::read_dir(project.join("assets"))
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();

    for line in text.lines() {
        let Some(msg) = payload(line) else { continue };
        if msg.trim().is_empty() {
            continue;
        }
        report.total += 1;
        let keep = |v: &mut Vec<String>| {
            if v.len() < 40 && !v.iter().any(|s| s == &msg) {
                v.push(msg.clone());
            }
        };
        if is_lua_error(&msg) {
            keep(&mut report.lua_errors);
        } else if let Some(rest) = msg.split("Could not find resource ").nth(1) {
            let path = rest.trim();
            let first = path
                .trim_start_matches("assets/")
                .split('/')
                .next()
                .unwrap_or("");
            if shipped.iter().any(|k| k == first) {
                keep(&mut report.missing_project);
            } else {
                keep(&mut report.engine_noise);
            }
        } else if msg.contains("ERROR") && is_engine_noise(&msg) {
            keep(&mut report.engine_noise);
        }
    }

    if explicit.is_none() {
        let code = newest_code_mtime(project);
        let log_time = fs::metadata(&log).ok().and_then(|m| m.modified().ok());
        report.stale = match (code, log_time) {
            (Some(code), Some(log_time)) => log_time < code,
            _ => false,
        };
        report.newest_code = code;
    }
    Ok(report)
}

pub fn print(report: &Report, json: bool, show: usize) {
    if json {
        let esc = |s: &str| s.replace('\\', "\\\\").replace('"', "'").replace('\n', " ");
        let arr = |v: &Vec<String>| {
            v.iter()
                .map(|s| format!("    \"{}\"", esc(s)))
                .collect::<Vec<_>>()
                .join(",\n")
        };
        crate::outln!("{{");
        crate::outln!("  \"log\": \"{}\",", esc(&report.log.display().to_string()));
        crate::outln!("  \"lines\": {},", report.total);
        crate::outln!("  \"lua_errors\": [\n{}\n  ],", arr(&report.lua_errors));
        crate::outln!(
            "  \"missing_project_resources\": [\n{}\n  ],",
            arr(&report.missing_project)
        );
        crate::outln!(
            "  \"engine_package_noise\": [\n{}\n  ],",
            arr(&report.engine_noise)
        );
        crate::outln!("  \"stale\": {},", report.stale);
        crate::outln!(
            "  \"verdict\": \"{}\"",
            if report.failed() { "FAIL" } else { "PASS" }
        );
        crate::outln!("}}");
        return;
    }
    crate::outln!("log: {}", report.log.display());
    crate::outln!("lines: {}", report.total);
    if report.stale {
        crate::outln!(
            "STALE: the log is older than the newest .lua/.shader in the project — restart the preview and let it run before trusting this verdict"
        );
    }
    let section = |title: &str, v: &Vec<String>| {
        crate::outln!("\n{title}: {}", v.len());
        for s in v.iter().take(show) {
            crate::outln!("  {}", s.trim());
        }
        if v.len() > show {
            crate::outln!("  … {} more", v.len() - show);
        }
    };
    section("Lua errors (must be 0)", &report.lua_errors);
    section(
        "missing project resources (must be 0)",
        &report.missing_project,
    );
    section(
        "engine-package noise (expected, not yours)",
        &report.engine_noise,
    );
    crate::outln!(
        "\nverdict: {}",
        if report.failed() {
            "FAIL — fix the Lua errors / resource paths, restart the preview, rerun t3m rlog"
        } else {
            "PASS — the game ran with no Lua error and no missing project resource"
        }
    );
}
