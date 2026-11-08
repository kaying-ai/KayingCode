//! TapTap build operations — list targets, switch target, status.
//!
//! Build operations manage the build process for TapTap projects,
//! separate from Maker Cloud operations. `build.status` queries both the
//! local build-target file and (when an active build exists) the remote
//! Maker Cloud status via `maker_status_lite`.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};
use crate::taptap::maker::{MakerCallError, MakerCallInput, call_maker_tool};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tracing::{info, warn};

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// All supported build targets with their metadata.
const ALL_TARGETS: &[(&str, &str, &[&str])] = &[
    ("android", "Android (APK/AAB)", &["Maker Cloud"]),
    ("ios", "iOS", &["Maker Cloud", "macOS"]),
    ("windows", "Windows", &["Maker Cloud"]),
    ("macos", "macOS", &["Maker Cloud", "macOS"]),
    ("linux", "Linux", &["Maker Cloud"]),
    ("web", "Web (WASM/HTML5)", &["Maker Cloud"]),
];

/// Handle `build.list_targets` — list all available build targets for TapTap.
pub fn build_list_targets(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let current_os = std::env::consts::OS;
    let is_macos = current_os == "macos";

    let targets: Vec<serde_json::Value> = ALL_TARGETS
        .iter()
        .map(|(id, display_name, requirements)| {
            let supported_on_current_os = match *id {
                "ios" | "macos" => is_macos,
                _ => true,
            };
            json!({
                "id": id,
                "display_name": display_name,
                "supported_on_current_os": supported_on_current_os,
                "requirements": requirements,
            })
        })
        .collect();

    info!(target_count = %targets.len(), "Build targets listed");

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "targets": targets,
            "current_os": current_os
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `build.switch_target` — switch the build target in project settings.
pub fn build_switch_target(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;

    let target = request
        .arguments
        .get("target")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing target argument".to_string()))?;

    // Validate target is supported
    let target_valid = ALL_TARGETS.iter().any(|(id, _, _)| *id == target);
    if !target_valid {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Unknown build target '{target}'. Supported targets: android, ios, windows, macos, linux, web"),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    // Create .project directory if needed
    let project_dir = root.join(".project");
    std::fs::create_dir_all(&project_dir).map_err(|e| ExecuteError::Io(e))?;

    // Write build-target.json
    let build_target_json = json!({
        "target": target,
        "updated_at": chrono::Utc::now().to_rfc3339()
    });
    std::fs::write(
        project_dir.join("build-target.json"),
        serde_json::to_string_pretty(&build_target_json).unwrap(),
    )
    .map_err(|e| ExecuteError::Io(e))?;

    info!(
        project_root = %root.to_string_lossy(),
        target = %target,
        "Build target switched"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "switched": true,
            "target": target,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `build.status` — check the current build status.
///
/// Combines local build-target info with remote Maker Cloud status (when an
/// active `build_id` is recorded in `.project/last-build.json`). Remote status
/// is queried via the Maker MCP `maker_status_lite` tool; if Maker is not
/// available or no build is in progress, returns `remote_status: "none"`.
pub fn build_status(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();

    // Read local build-target.json
    let build_target_json_path = root.join(".project").join("build-target.json");
    let current_target = if build_target_json_path.exists() {
        std::fs::read_to_string(&build_target_json_path)
            .ok()
            .and_then(|content| {
                serde_json::from_str::<serde_json::Value>(&content)
                    .ok()
                    .and_then(|v| {
                        v.get("target")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string())
                    })
            })
    } else {
        None
    };

    // Read last-build.json for active build_id
    let last_build_path = root.join(".project").join("last-build.json");
    let last_build = if last_build_path.exists() {
        std::fs::read_to_string(&last_build_path)
            .ok()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
    } else {
        None
    };

    let active_build_id = last_build
        .as_ref()
        .and_then(|v| v.get("build_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let recorded_status = last_build
        .as_ref()
        .and_then(|v| v.get("status"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let recorded_preview_url = last_build
        .as_ref()
        .and_then(|v| v.get("preview_url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let maker_available = check_maker_available(request);

    // Query remote status if we have an active build_id and Maker is available.
    // Skip the remote query if the caller passed `skip_remote=true`.
    let skip_remote = request
        .arguments
        .get("skip_remote")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let remote_status: serde_json::Value =
        if maker_available && active_build_id.is_some() && !skip_remote {
            query_remote_build_status(request, &root)
        } else {
            json!({
                "status": "none",
                "reason": if active_build_id.is_none() {
                    "no_active_build"
                } else if !maker_available {
                    "maker_unavailable"
                } else {
                    "skipped"
                }
            })
        };

    // Build supported targets info
    let current_os = std::env::consts::OS;
    let is_macos = current_os == "macos";
    let supported_targets: Vec<serde_json::Value> = ALL_TARGETS
        .iter()
        .filter(|(id, _, _)| match *id {
            "ios" | "macos" => is_macos,
            _ => true,
        })
        .map(|(id, display_name, _)| {
            json!({
                "id": id,
                "display_name": display_name,
            })
        })
        .collect();

    info!(
        project_root = %root.to_string_lossy(),
        current_target = ?current_target,
        active_build_id = ?active_build_id,
        remote_status = %remote_status,
        "Build status checked"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "current_target": current_target,
            "maker_available": maker_available,
            "supported_targets": supported_targets,
            "project_root": root.to_string_lossy(),
            "active_build_id": active_build_id,
            "last_recorded_status": recorded_status,
            "last_recorded_preview_url": recorded_preview_url,
            "remote_status": remote_status,
        }),
        exit_code: Some(0),
        duration_ms: started.elapsed().as_millis() as u64,
        log_path: None,
    })
}

/// Query Maker Cloud for the remote build status via `maker_status_lite`.
///
/// Returns a JSON object with at minimum a `status` field. On failure, returns
/// `status: "unknown"` plus an `error` field describing the failure.
fn query_remote_build_status(request: &OperationRequest, root: &Path) -> serde_json::Value {
    let arguments = json!({
        "target_dir": root.to_string_lossy(),
        "skip_remote_sync": false,
    });
    // 修复依据：状态查询必须与提交同一 Maker 环境；原先写死 None 会继承宿主
    // TAPTAP_MCP_ENV，可能落到 rnd 内网（fuping.agnt.xd.com）。
    let maker_environment = request
        .arguments
        .get("env")
        .and_then(|v| v.as_str())
        .filter(|env| *env == "rnd" || *env == "production");
    let input = MakerCallInput {
        cwd: root.to_string_lossy().to_string(),
        name: "maker_status_lite",
        arguments,
        timeout_ms: 60_000,
        operation_label: Some("build.status"),
        maker_environment,
    };
    match call_maker_tool(input) {
        Ok(result) => {
            let text = extract_status_text(&result.value);
            let parsed_status =
                parse_status_from_text(&text).unwrap_or_else(|| "unknown".to_string());
            let preview_url = extract_preview_url_from_text(&text);
            json!({
                "status": parsed_status,
                "remote_text": text,
                "preview_url": preview_url,
                "command": result.command,
                "stderr": result.stderr,
            })
        }
        Err(e) => {
            warn!(error = %e, "Failed to query Maker status");
            json!({
                "status": "unknown",
                "error": format!("Maker status query failed: {e}"),
                "error_kind": error_kind(&e),
            })
        }
    }
}

/// Extract text content from the `maker_status_lite` tool result.
fn extract_status_text(value: &serde_json::Value) -> String {
    let content = value.get("content").and_then(|v| v.as_array());
    let Some(content) = content else {
        return value.to_string();
    };
    content
        .iter()
        .filter_map(|item| {
            item.get("text")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

/// Parse a status keyword from the Maker status text.
///
/// Recognizes: queued, building, success, failed, unknown.
fn parse_status_from_text(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    if lower.contains("build_success") || lower.contains("\"status\": \"success\"") {
        return Some("success".to_string());
    }
    if lower.contains("build_failed")
        || lower.contains("\"status\": \"failed\"")
        || lower.contains("failed")
    {
        return Some("failed".to_string());
    }
    if lower.contains("building") || lower.contains("\"status\": \"building\"") {
        return Some("building".to_string());
    }
    if lower.contains("queued") || lower.contains("\"status\": \"queued\"") {
        return Some("queued".to_string());
    }
    None
}

/// Best-effort extraction of a preview URL from the status text.
fn extract_preview_url_from_text(text: &str) -> Option<String> {
    // Re-use the maker module's extractor via a small inline scan.
    let mut idx = 0;
    while idx < text.len() {
        let rest = &text[idx..];
        let Some(rel) = rest.find("http") else {
            return None;
        };
        let abs = idx + rel;
        let candidate = &text[abs..];
        if let Some(url) = extract_url_inline(candidate) {
            let l = url.to_lowercase();
            if l.contains("taptap") || l.contains("tapsvc") || l.contains("xindong") {
                return Some(url);
            }
        }
        idx = abs + 4;
    }
    None
}

/// Inline URL extractor (avoids coupling to maker.rs).
fn extract_url_inline(s: &str) -> Option<String> {
    let s = s.trim();
    let (scheme, stripped) = s
        .strip_prefix("https://")
        .map(|rest| ("https", rest))
        .or_else(|| s.strip_prefix("http://").map(|rest| ("http", rest)))?;
    let end = stripped
        .find(|c: char| {
            c.is_whitespace()
                || matches!(
                    c,
                    ')' | ',' | '.' | ';' | ']' | '}' | '<' | '>' | '\'' | '`' | '"'
                )
        })
        .unwrap_or(stripped.len());
    Some(format!("{scheme}://{}", &stripped[..end]))
}

fn error_kind(e: &MakerCallError) -> &'static str {
    match e {
        MakerCallError::Paths(_) => "paths_unresolved",
        MakerCallError::Spawn(_) => "spawn_failed",
        MakerCallError::NoStdin | MakerCallError::NoStdout | MakerCallError::NoStderr => "no_pipe",
        MakerCallError::Io(_) => "io_error",
        MakerCallError::Serialize(_) => "serialize_error",
        MakerCallError::JsonRpcError { .. } => "jsonrpc_error",
        MakerCallError::Timeout => "timeout",
        MakerCallError::Disconnected => "disconnected",
    }
}

/// Prepare a build operation — validate arguments and return a plan.
pub fn prepare_build(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    let effects = match request.operation_id.as_str() {
        "build.list_targets" => vec![],
        "build.switch_target" => {
            vec![crate::model::Effect::WriteProject]
        }
        "build.status" => vec![crate::model::Effect::ReadProject],
        _ => vec![],
    };

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: "build-effects".to_string(),
    })
}

/// Check whether Maker Cloud is available (has config).
fn check_maker_available(request: &OperationRequest) -> bool {
    // Check project-local config
    if let Some(root) = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
    {
        let local_config = Path::new(root).join(".maker-mcp").join("config.json");
        if local_config.exists() {
            return true;
        }
    }

    // Check project_root from context
    if let Some(ref root) = request.project_root {
        let local_config = root.join(".maker-mcp").join("config.json");
        if local_config.exists() {
            return true;
        }
    }

    // Check global config
    if let Ok(home) = std::env::var("HOME") {
        let global_config = Path::new(&home).join(".maker-mcp").join("config.json");
        if global_config.exists() {
            return true;
        }
    }

    false
}

fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, ExecuteError> {
    let root_str = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
        .or_else(|| request.project_root.as_ref().and_then(|p| p.to_str()))
        .ok_or_else(|| ExecuteError::NotPrepared("Missing project_root argument".to_string()))?;

    let path = std::path::PathBuf::from(root_str);
    if !path.exists() {
        return Err(ExecuteError::ExternalToolFailed(format!(
            "Project root does not exist: {}",
            path.display()
        )));
    }

    Ok(Arc::from(path))
}
