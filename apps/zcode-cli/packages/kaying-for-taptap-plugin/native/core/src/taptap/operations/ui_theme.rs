//! TapTap built-in UI theme catalog and project selection operations.

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use crate::taptap::operations::helpers::{get_project_root, make_plan, ok_result};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use std::sync::atomic::AtomicU64;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

const DEFAULT_THEME: &str = "brawlforge";

pub fn prepare_ui_theme(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let effects = match request.operation_id.as_str() {
        "ui.theme.apply" => vec![Effect::ReadProject, Effect::WriteProject],
        _ => vec![Effect::ReadProject],
    };
    make_plan(request, &PLAN_COUNTER, effects, "ui-theme-effects")
}

pub fn ui_theme_list(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let started = std::time::Instant::now();
    Ok(ok_result(
        request,
        json!({
            "themes": theme_catalog(),
            "default_theme": DEFAULT_THEME,
            "selection_mode": "ask_when_ambiguous",
        }),
        started.elapsed().as_millis() as u64,
    ))
}

pub fn ui_theme_resolve(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let started = std::time::Instant::now();
    let intent = request
        .arguments
        .get("intent")
        .and_then(Value::as_str)
        .unwrap_or("");
    let requested = request
        .arguments
        .get("theme")
        .and_then(Value::as_str)
        .map(str::to_lowercase);
    let (theme, reason, confidence) = requested
        .as_deref()
        .and_then(theme_by_id)
        .map(|theme| (Some(theme), "explicit_theme", 1.0))
        .unwrap_or_else(|| resolve_theme(intent));
    let ambiguous = theme.is_none();
    Ok(ok_result(
        request,
        json!({
            "resolved_theme": theme,
            "reason": reason,
            "confidence": confidence,
            "ambiguous": ambiguous,
            "requires_user_choice": ambiguous,
            "default_theme": DEFAULT_THEME,
            "candidates": theme_catalog(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

pub fn ui_theme_apply(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = std::time::Instant::now();
    let theme_id = request
        .arguments
        .get("theme")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_THEME)
        .to_lowercase();
    let Some(theme) = theme_by_id(&theme_id) else {
        return Ok(ok_result(
            request,
            json!({
                "applied": false,
                "error": format!("Unknown built-in UI theme '{theme_id}'"),
                "valid_themes": theme_ids(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    };
    let target = theme_contract_path(&root);
    write_theme_contract(&root, &theme_id, "explicit").map_err(ExecuteError::Io)?;
    Ok(ok_result(
        request,
        json!({
            "applied": true,
            "theme": theme,
            "path": target.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

pub fn write_default_theme_contract(root: &Path) -> Result<String, std::io::Error> {
    let target = theme_contract_path(root);
    if target.exists() {
        return Ok(target.to_string_lossy().to_string());
    }
    write_theme_contract(root, DEFAULT_THEME, "default")
}

pub fn write_theme_contract(
    root: &Path,
    theme_id: &str,
    selection_mode: &str,
) -> Result<String, std::io::Error> {
    let target = theme_contract_path(root);
    let theme = theme_by_id(theme_id).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("Unknown built-in UI theme '{theme_id}'"),
        )
    })?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let payload = json!({
        "version": 1,
        "selectedTheme": theme_id,
        "source": "taptap-engine-builtin",
        "selectionMode": selection_mode,
        "theme": theme,
    });
    fs::write(&target, serde_json::to_string_pretty(&payload).unwrap())?;
    Ok(target.to_string_lossy().to_string())
}

fn theme_contract_path(root: &Path) -> std::path::PathBuf {
    root.join(".project").join("ui-theme.json")
}

fn resolve_theme(intent: &str) -> (Option<Value>, &'static str, f64) {
    let normalized = intent.to_lowercase();
    let candidates = [
        (
            "pixelforge",
            ["像素", "8-bit", "8bit", "pixel", "复古街机", "地牢"],
        ),
        ("astroon", ["宇宙", "太空", "星际", "科幻", "魔法", "暗色"]),
        (
            "brawlforge",
            ["竞技", "对战", "乱斗", "动作", "战斗", "boss"],
        ),
    ];
    for (id, keywords) in candidates {
        if keywords.iter().any(|keyword| normalized.contains(keyword)) {
            return (theme_by_id(id), "intent_match", 0.9);
        }
    }
    (None, "ambiguous_intent", 0.0)
}

fn theme_ids() -> Vec<&'static str> {
    vec!["brawlforge", "astroon", "pixelforge"]
}

fn theme_catalog() -> Vec<Value> {
    theme_ids().into_iter().filter_map(theme_by_id).collect()
}

fn theme_by_id(id: &str) -> Option<Value> {
    match id {
        "brawlforge" => Some(json!({
            "id": "brawlforge",
            "name": "BrawlForge",
            "label": "竞技卡通",
            "builtIn": true,
            "recommendedFor": ["竞技对战", "派对乱斗", "横版动作", "Roguelike", "机甲科幻", "卡牌战斗", "Boss Rush"],
            "components": ["主菜单", "战斗 HUD", "角色面板", "背包", "任务列表", "排行榜", "结算弹窗"],
            "tokens": { "primary": "bright-cyan", "accent": "purple", "border": "thick-black", "panel": "hard-edge", "font": "bold-cjk" },
            "reference": "https://www.taptap.cn/moment/819628338132811820",
        })),
        "astroon" => Some(json!({
            "id": "astroon",
            "name": "Astroon",
            "label": "宇宙卡通",
            "builtIn": true,
            "recommendedFor": ["太空探索", "科幻冒险", "魔法奇幻", "暗色氛围", "装备与抽卡"],
            "components": ["按钮", "弹窗", "背包", "角色面板", "HUD", "列表", "表格"],
            "tokens": { "background": "deep-space-purple", "primary": "gold", "focus": "blue", "progress": "cyan", "shape": "capsule-rounded", "rarity": ["green", "blue", "purple", "gold"] },
            "reference": "https://www.taptap.cn/moment/814584227298281704",
        })),
        "pixelforge" => Some(json!({
            "id": "pixelforge",
            "name": "PixelForge",
            "label": "像素风",
            "builtIn": true,
            "recommendedFor": ["像素 RPG", "复古街机", "Roguelike", "像素模拟经营", "地牢探索", "放置挂机"],
            "components": ["按钮", "弹窗", "背包", "角色面板", "HUD", "列表"],
            "tokens": { "edge": "pixel-hard", "shadow": "hard", "font": "cjk-pixel", "states": "pixel-component-states" },
            "reference": "https://www.taptap.cn/moment/811714641859183029",
        })),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::OperationRequest;
    use tempfile::tempdir;

    fn request(operation_id: &str, root: &Path, arguments: Value) -> OperationRequest {
        OperationRequest {
            request_id: "ui-theme-test".to_string(),
            provider_id: "taptap".to_string(),
            operation_id: operation_id.to_string(),
            project_root: Some(root.to_path_buf()),
            arguments,
            timeout_ms: None,
            dry_run: false,
            plan_id: None,
            effect_digest: None,
        }
    }

    #[test]
    fn resolves_official_themes_from_intent() {
        assert_eq!(
            resolve_theme("像素 RPG 背包").0.unwrap()["id"],
            "pixelforge"
        );
        assert_eq!(resolve_theme("宇宙科幻主菜单").0.unwrap()["id"], "astroon");
        assert_eq!(resolve_theme("竞技战斗 HUD").0.unwrap()["id"], "brawlforge");
        assert!(resolve_theme("做一个设置页面").0.is_none());
    }

    #[test]
    fn writes_default_contract_without_overwriting_selection() {
        let temp = tempdir().unwrap();
        write_default_theme_contract(temp.path()).unwrap();
        let path = temp.path().join(".project/ui-theme.json");
        let first: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(first["selectedTheme"], DEFAULT_THEME);
        fs::write(&path, "{\"selectedTheme\":\"astroon\"}").unwrap();
        write_default_theme_contract(temp.path()).unwrap();
        assert!(fs::read_to_string(&path).unwrap().contains("astroon"));
    }

    #[test]
    fn applies_selected_theme_to_project() {
        let temp = tempdir().unwrap();
        let req = request(
            "ui.theme.apply",
            temp.path(),
            json!({ "theme": "pixelforge" }),
        );
        let plan = prepare_ui_theme(&req).unwrap();
        let result = ui_theme_apply(&req, &plan).unwrap();
        assert_eq!(result.output["applied"], true);
        assert_eq!(result.output["theme"]["id"], "pixelforge");
    }
}
