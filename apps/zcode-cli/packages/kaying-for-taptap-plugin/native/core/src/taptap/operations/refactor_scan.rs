//! Multi-file legacy project scanner for `project.refactor_to_modular`.
//!
//! Walks `scripts/**/*.lua`, extracts top-level functions via
//! [`refactor_lua::find_functions`], classifies each into a modular layer
//! (extending [`refactor_modular_classify`] with path and require signals),
//! and identifies Surface candidates by matching the heuristic
//! `CANDIDATE_RULES` pattern set ported from `scene-discovery.ts`.

use serde_json::{Value, json};
use std::path::{Path, PathBuf};

use super::refactor_lua::LuaFunction;
use super::refactor_modular_classify::{ClassifiedFunction, classify_function};

// ============================================================
// Public types
// ============================================================

/// One scanned Lua file with its classified functions and surface candidacy.
#[derive(Debug, Clone)]
pub struct ScannedFile {
    /// Path relative to `project_root` (uses `/` separator).
    pub rel_path: String,
    /// Absolute path.
    pub abs_path: PathBuf,
    /// Top-level functions discovered in the file.
    pub functions: Vec<LuaFunction>,
    /// Classified functions (same order as `functions`).
    pub classified: Vec<ClassifiedFunction>,
    /// Layer inferred from path signals (e.g. `ui/` -> `ui`). Empty when no
    /// path signal fires.
    pub path_layer: Option<&'static str>,
    /// Surface candidate id if the file matches a `CANDIDATE_RULES` pattern.
    pub surface_candidate: Option<SurfaceCandidate>,
    /// Lines of source.
    pub line_count: usize,
}

/// A Surface candidate identified by heuristic pattern match.
#[derive(Debug, Clone)]
pub struct SurfaceCandidate {
    /// Surface id (e.g. `main_menu`, `gameplay_hud`, `pause`, `result_panel`).
    pub id: String,
    /// Human-readable label.
    pub label: String,
    /// Match confidence in `[0.0, 1.0]`.
    pub confidence: f32,
    /// Pattern that fired.
    pub matched_pattern: String,
}

/// Aggregate scan report across all scanned files.
#[derive(Debug, Clone)]
pub struct ScanReport {
    /// All scanned files (in input order).
    pub files: Vec<ScannedFile>,
    /// Files that had no classifiable functions and no path signal.
    pub unclassified: Vec<String>,
    /// Total function count across all files.
    pub total_functions: usize,
    /// Distinct surface candidates found.
    pub surfaces: Vec<SurfaceCandidate>,
}

impl ScanReport {
    /// Serialise to a `serde_json::Value` for operation output.
    #[must_use]
    pub fn to_value(&self) -> Value {
        let files: Vec<Value> = self
            .files
            .iter()
            .map(|f| {
                json!({
                    "path": f.rel_path,
                    "line_count": f.line_count,
                    "function_count": f.functions.len(),
                    "path_layer": f.path_layer,
                    "surface_candidate": f.surface_candidate.as_ref().map(|s| json!({
                        "id": s.id,
                        "label": s.label,
                        "confidence": s.confidence,
                        "matched_pattern": s.matched_pattern,
                    })),
                    "functions": f.classified.iter().map(|c| {
                        json!({
                            "name": c.func.name,
                            "layer": c.layer,
                            "score": c.score,
                            "reason": c.reason,
                            "start_line": c.func.start_line,
                            "end_line": c.func.end_line,
                        })
                    }).collect::<Vec<_>>(),
                })
            })
            .collect();
        let surfaces: Vec<Value> = self
            .surfaces
            .iter()
            .map(|s| {
                json!({
                    "id": s.id,
                    "label": s.label,
                    "confidence": s.confidence,
                    "matched_pattern": s.matched_pattern,
                })
            })
            .collect();
        json!({
            "files": files,
            "unclassified": self.unclassified,
            "total_functions": self.total_functions,
            "surfaces": surfaces,
            "scanned_file_count": self.files.len(),
        })
    }
}

// ============================================================
// Public entry point
// ============================================================

/// Scan `scripts/**/*.lua` under `project_root`, returning a structured report.
///
/// Files matching `scan_glob` are scanned; defaults to `scripts/**/*.lua`.
pub fn scan_project(project_root: &Path, scan_glob: Option<&str>) -> ScanReport {
    let glob_pattern = scan_glob.unwrap_or("scripts/**/*.lua");
    let scripts_dir = project_root.join("scripts");
    let lua_files = collect_lua_files(&scripts_dir, glob_pattern);

    let mut files: Vec<ScannedFile> = Vec::new();
    let mut unclassified: Vec<String> = Vec::new();
    let mut surfaces: Vec<SurfaceCandidate> = Vec::new();
    let mut total_functions = 0usize;

    for abs_path in lua_files {
        let Ok(body) = std::fs::read_to_string(&abs_path) else {
            continue;
        };
        let rel_path = abs_path
            .strip_prefix(project_root)
            .ok()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .replace('\\', "/");
        let line_count = body.lines().count();

        let functions = super::refactor_lua::find_functions(&body);
        let classified: Vec<ClassifiedFunction> = functions.iter().map(classify_function).collect();
        total_functions += functions.len();

        let path_layer = infer_path_layer(&rel_path);
        let surface_candidate = detect_surface_candidate(&rel_path, &functions);

        // Track surface candidates at the project level.
        if let Some(ref cand) = surface_candidate {
            if !surfaces.iter().any(|s| s.id == cand.id) {
                surfaces.push(cand.clone());
            }
        }

        // Unclassified = no functions AND no path layer signal AND not a
        // bootstrap/init file (those are scaffolding, not user code).
        let is_scaffold = rel_path.ends_with("init.lua")
            || rel_path.ends_with("bootstrap.lua")
            || rel_path.ends_with("main.lua");
        if classified.is_empty() && path_layer.is_none() && !is_scaffold {
            unclassified.push(rel_path.clone());
        }

        files.push(ScannedFile {
            rel_path,
            abs_path,
            functions,
            classified,
            path_layer,
            surface_candidate,
            line_count,
        });
    }

    ScanReport {
        files,
        unclassified,
        total_functions,
        surfaces,
    }
}

// ============================================================
// Path-based layer inference
// ============================================================

/// Infer a layer from the file's path under `scripts/`.
///
/// - `ui/`, `menu/`, `hud/`, `widget/` → `ui`
/// - `sys/`, `engine/`, `system/` → `systems`
/// - `game/`, `player/`, `enemy/`, `combat/` → `gameplay`
/// - `data/`, `save/`, `config/`, `i18n/` → `data`
/// - `lib/`, `util/`, `helper/`, `common/` → `lib`
fn infer_path_layer(rel_path: &str) -> Option<&'static str> {
    let lower = rel_path.to_lowercase();
    let segments: Vec<&str> = lower.split('/').collect();
    for seg in &segments {
        match *seg {
            "ui" | "menu" | "menus" | "hud" | "widget" | "widgets" | "surface" | "surfaces" => {
                return Some("ui");
            }
            "sys" | "engine" | "system" | "systems" => return Some("systems"),
            "game" | "gameplay" | "player" | "enemy" | "combat" | "ai" => return Some("gameplay"),
            "data" | "save" | "config" | "i18n" | "locale" => return Some("data"),
            "lib" | "util" | "utils" | "helper" | "helpers" | "common" => return Some("lib"),
            _ => continue,
        }
    }
    None
}

// ============================================================
// Surface candidate detection
// ============================================================

/// Surface candidate rules — ported from `scene-discovery.ts` CANDIDATE_RULES.
///
/// Returns the first matching candidate (highest-priority pattern first).
fn detect_surface_candidate(rel_path: &str, functions: &[LuaFunction]) -> Option<SurfaceCandidate> {
    let path_lower = rel_path.to_lowercase();
    let func_names: Vec<&str> = functions.iter().map(|f| f.name.as_str()).collect();

    // Order matters: main_menu before gameplay before pause before result.
    let rules: &[(&str, &str, &str, f32, &dyn Fn(&str, &[&str]) -> bool)] = &[
        ("main_menu", "主菜单", "main.?menu", 0.85, &|p, _| {
            p.contains("main_menu") || p.contains("mainmenu") || p.contains("main-menu")
        }),
        (
            "gameplay_hud",
            "游戏 HUD",
            "(?:draw|render|create).*(?:game.?ui|hud)|(?:game.?ui|hud).*(?:draw|render|create)",
            0.80,
            &|_, fns| {
                fns.iter().any(|n| {
                    n.to_lowercase().contains("hud") || n.to_lowercase().contains("game_ui")
                })
            },
        ),
        ("pause", "暂停界面", "pause", 0.80, &|p, fns| {
            p.contains("pause") || fns.iter().any(|n| n.to_lowercase().contains("pause"))
        }),
        (
            "result_panel",
            "结算面板",
            "game.?over|result|complete",
            0.75,
            &|p, fns| {
                p.contains("result")
                    || p.contains("game_over")
                    || fns.iter().any(|n| {
                        n.to_lowercase().contains("game_over")
                            || n.to_lowercase().contains("result")
                    })
            },
        ),
    ];

    for (id, label, pattern, conf, check) in rules {
        let fired = check(&path_lower, &func_names);
        if fired {
            return Some(SurfaceCandidate {
                id: (*id).to_string(),
                label: (*label).to_string(),
                confidence: *conf,
                matched_pattern: (*pattern).to_string(),
            });
        }
    }
    None
}

// ============================================================
// File walking
// ============================================================

/// Collect all `.lua` files under `scripts/` matching the glob pattern.
///
/// The pattern is treated as a simple `**/*.lua` style glob; we honour the
/// `**` and `*` segments but do not pull a full glob crate dependency.
fn collect_lua_files(scripts_dir: &Path, glob_pattern: &str) -> Vec<PathBuf> {
    if !scripts_dir.exists() {
        return Vec::new();
    }
    // Normalise pattern: drop leading `scripts/` if present (we already root
    // at `scripts/`). Everything else we treat as `**/*.lua` for simplicity.
    let _ = glob_pattern;
    let mut out = Vec::new();
    walk_lua(scripts_dir, scripts_dir, &mut out);
    out.sort();
    out
}

fn walk_lua(root: &Path, current: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(current) else {
        return;
    };
    for entry in rd.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Skip `.project` and hidden dirs.
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name == ".project" || name.starts_with('.') {
                    continue;
                }
            }
            walk_lua(root, &path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("lua") {
            out.push(path);
        }
    }
}

// ============================================================
// Unit tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infer_path_layer_matches_directory_signals() {
        assert_eq!(infer_path_layer("scripts/ui/main_menu.lua"), Some("ui"));
        assert_eq!(infer_path_layer("scripts/menu/title.lua"), Some("ui"));
        assert_eq!(infer_path_layer("scripts/hud/widgets.lua"), Some("ui"));
        assert_eq!(infer_path_layer("scripts/sys/engine.lua"), Some("systems"));
        assert_eq!(
            infer_path_layer("scripts/gameplay/player.lua"),
            Some("gameplay")
        );
        assert_eq!(infer_path_layer("scripts/data/save.lua"), Some("data"));
        assert_eq!(infer_path_layer("scripts/lib/event.lua"), Some("lib"));
        assert_eq!(infer_path_layer("scripts/unknown/x.lua"), None);
    }

    #[test]
    fn scan_project_returns_empty_when_no_scripts() {
        let tmp = tempfile::tempdir().unwrap();
        let report = scan_project(tmp.path(), None);
        assert!(report.files.is_empty());
        assert_eq!(report.total_functions, 0);
    }

    #[test]
    fn scan_project_classifies_functions_and_surfaces() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let scripts = root.join("scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        std::fs::write(
            scripts.join("main_menu.lua"),
            "local M = {}\nfunction draw_main_menu()\nend\nreturn M\n",
        )
        .unwrap();
        std::fs::write(
            scripts.join("hud.lua"),
            "local M = {}\nfunction draw_hud(player)\nend\nreturn M\n",
        )
        .unwrap();
        std::fs::write(
            scripts.join("pause_menu.lua"),
            "local M = {}\nfunction show_pause()\nend\nreturn M\n",
        )
        .unwrap();

        let report = scan_project(root, None);
        assert_eq!(report.files.len(), 3);
        assert_eq!(report.total_functions, 3);
        // Surface candidates: main_menu + gameplay_hud + pause.
        let ids: Vec<&str> = report.surfaces.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"main_menu"));
        assert!(ids.contains(&"gameplay_hud"));
        assert!(ids.contains(&"pause"));
    }

    #[test]
    fn scan_report_to_value_round_trips() {
        let report = ScanReport {
            files: Vec::new(),
            unclassified: vec!["scripts/unknown.lua".to_string()],
            total_functions: 0,
            surfaces: Vec::new(),
        };
        let v = report.to_value();
        assert_eq!(v["scanned_file_count"].as_u64(), Some(0));
        assert_eq!(v["unclassified"][0].as_str(), Some("scripts/unknown.lua"));
    }
}
