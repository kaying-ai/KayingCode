//! TapTap Maker operations — auth, status, build.

use crate::common::{ProgressEvent, emit_progress};
use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};
use crate::taptap::maker::{MakerCallError, MakerCallInput, call_maker_tool};
use serde_json::json;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tracing::{info, warn};

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Handle `maker.auth` — check Maker authentication status.
pub fn maker_auth(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let maker_config = find_maker_config(request);

    match maker_config {
        Some(config_path) => {
            // Try to read config for auth info
            let config_content = std::fs::read_to_string(&config_path).ok();
            let config_json: Option<serde_json::Value> = config_content
                .as_ref()
                .and_then(|c| serde_json::from_str(c).ok());
            let has_token = config_json
                .as_ref()
                .and_then(|v| {
                    v.get("token")
                        .or_else(|| v.get("apiKey"))
                        .and_then(|t| t.as_str())
                })
                .map(|t| !t.is_empty())
                .unwrap_or(false);

            info!(authenticated = %has_token, "Maker auth check completed");

            let user = if has_token { Some("maker-user") } else { None };

            Ok(OperationResult {
                request_id: request.request_id.clone(),
                success: true,
                output: json!({
                    "authenticated": has_token,
                    "user": user,
                    "expires_at": null,
                    "config_path": config_path.to_string_lossy()
                }),
                exit_code: Some(if has_token { 0 } else { 1 }),
                duration_ms: 0,
                log_path: None,
            })
        }
        None => Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: true,
            output: json!({
                "authenticated": false,
                "user": null,
                "expires_at": null,
                "error": "No Maker MCP configuration found"
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        }),
    }
}

/// Handle `maker.status` — check Maker build/service status.
pub fn maker_status(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let maker_config = find_maker_config(request);

    match maker_config {
        Some(config_path) => {
            // Read config for version info
            let config_content = std::fs::read_to_string(&config_path).ok();
            let config_json: Option<serde_json::Value> = config_content
                .as_ref()
                .and_then(|c| serde_json::from_str(c).ok());
            let service_version = config_json
                .as_ref()
                .and_then(|v| v.get("version"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            info!(version = %service_version, "Maker status check completed");

            Ok(OperationResult {
                request_id: request.request_id.clone(),
                success: true,
                output: json!({
                    "connected": true,
                    "service_version": service_version,
                    "builds": [],
                    "config_path": config_path.to_string_lossy()
                }),
                exit_code: Some(0),
                duration_ms: 0,
                log_path: None,
            })
        }
        None => Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: true,
            output: json!({
                "connected": false,
                "service_version": null,
                "builds": [],
                "error": "No Maker MCP configuration found"
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        }),
    }
}

/// Handle `maker.build` — prepare and submit a remote build.
pub fn maker_build(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let dry_run = request
        .arguments
        .get("dry_run")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let build_target = request
        .arguments
        .get("build_target")
        .and_then(|v| v.as_str())
        .unwrap_or("android");

    // Resolve entry point (optional — Maker bundle can resolve from project.json)
    let entry = request
        .arguments
        .get("entry")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            let project_json_path = root.join(".project").join("project.json");
            if project_json_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&project_json_path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        return json
                            .get("entry")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                    }
                }
            }
            None
        });

    // Resolve optional scripts path
    let scripts_path = request
        .arguments
        .get("scripts_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "scripts".to_string());

    let maker_config = find_maker_config(request);

    if maker_config.is_none() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "submitted": false,
                "error": "No Maker MCP configuration found. Configure Maker first.",
                "effects": ["network", "remote_build"]
            }),
            exit_code: Some(1),
            duration_ms: started.elapsed().as_millis() as u64,
            log_path: None,
        });
    }

    if dry_run {
        info!(
            project_root = %root.to_string_lossy(),
            target = %build_target,
            "Maker build prepared (dry-run)"
        );

        Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: true,
            output: json!({
                "submitted": false,
                "build_id": null,
                "status": "prepared",
                "effects": ["network", "remote_build"],
                "message": "Dry-run complete. Use --no-dry-run to submit the build.",
                "build_target": build_target
            }),
            exit_code: Some(0),
            duration_ms: started.elapsed().as_millis() as u64,
            log_path: None,
        })
    } else {
        // Real build submission — call Maker MCP `maker_build_current_directory`
        info!(
            project_root = %root.to_string_lossy(),
            target = %build_target,
            "Submitting real Maker build via MCP"
        );

        emit_progress(&ProgressEvent::started(format!(
            "maker.build: submitting to Maker Cloud (target={build_target})"
        )));

        let mut arguments = serde_json::json!({
            "target_dir": root.to_string_lossy(),
            "entry": entry,
            "scriptsPath": scripts_path,
        });
        if let Some(message) = request.arguments.get("message").and_then(|v| v.as_str()) {
            arguments["message"] = serde_json::Value::String(message.to_string());
        }
        let maker_environment = request.arguments.get("env").and_then(|v| v.as_str());

        let timeout_ms = request
            .arguments
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(15 * 60_000); // 15 minutes default

        let input = MakerCallInput {
            cwd: root.to_string_lossy().to_string(),
            name: "maker_build_current_directory",
            arguments,
            timeout_ms,
            operation_label: Some("maker.build"),
            maker_environment,
        };

        emit_progress(&ProgressEvent::running(
            format!("maker.build: calling Maker MCP (timeout {timeout_ms} ms)"),
            Some(10.0),
        ));

        match call_maker_tool(input) {
            Ok(result) => {
                let tool_text = extract_tool_text(&result.value);
                let preview_url = extract_taptap_preview_url(&tool_text);
                let failure = detect_maker_failure(&result.value, &tool_text);
                let submitted = failure.is_none();
                let build_id = format!("build-{}", uuid::Uuid::new_v4());

                // Persist build metadata so `build.status` can poll remote state
                let _ = persist_last_build(
                    &root,
                    &build_id,
                    build_target,
                    &tool_text,
                    preview_url.as_deref(),
                );

                info!(
                    project_root = %root.to_string_lossy(),
                    submitted,
                    has_preview_url = preview_url.is_some(),
                    failure = ?failure,
                    "Maker build call completed"
                );

                if submitted {
                    emit_progress(&ProgressEvent::completed(format!(
                        "maker.build: submitted (build_id={build_id}, {}ms)",
                        started.elapsed().as_millis()
                    )));
                } else {
                    emit_progress(&ProgressEvent::failed(format!(
                        "maker.build: submission failed — {}",
                        failure.as_deref().unwrap_or("unknown")
                    )));
                }

                Ok(OperationResult {
                    request_id: request.request_id.clone(),
                    success: submitted,
                    output: json!({
                        "submitted": submitted,
                        "build_id": build_id,
                        "status": if submitted { "queued" } else { "failed" },
                        "preview_url": preview_url,
                        "tool": "maker_build_current_directory",
                        "command": result.command,
                        "text": tool_text,
                        "progress": result.progress,
                        "stderr": result.stderr,
                        "effects": ["network", "remote_build"],
                        "message": if submitted {
                            "Build submitted to Maker Cloud. Check status with maker.status."
                        } else {
                            failure.as_deref().unwrap_or("Maker submit failed")
                        },
                        "build_target": build_target,
                        "project_root": root.to_string_lossy(),
                    }),
                    exit_code: Some(if submitted { 0 } else { 1 }),
                    duration_ms: started.elapsed().as_millis() as u64,
                    log_path: None,
                })
            }
            Err(e) => {
                warn!(error = %e, "Maker build MCP call failed");
                emit_progress(&ProgressEvent::failed(format!(
                    "maker.build: MCP call failed — {e}"
                )));
                Ok(OperationResult {
                    request_id: request.request_id.clone(),
                    success: false,
                    output: json!({
                        "submitted": false,
                        "error": format!("Maker MCP call failed: {e}"),
                        "error_kind": error_kind(&e),
                        "effects": ["network", "remote_build"],
                        "build_target": build_target,
                        "project_root": root.to_string_lossy(),
                    }),
                    exit_code: Some(1),
                    duration_ms: started.elapsed().as_millis() as u64,
                    log_path: None,
                })
            }
        }
    }
}

// ============================================================
// Maker MCP response parsing helpers
// ============================================================

/// Extract concatenated text content from a Maker MCP `tools/call` result.
///
/// The result is shaped like `{ "isError": bool, "content": [{ "type": "text", "text": "..." }] }`.
fn extract_tool_text(value: &serde_json::Value) -> String {
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

/// Detect push/build failures in the Maker response text.
///
/// `maker_build_current_directory` returns `isError=false` even when push fails —
/// the failure is described in the text content. This mirrors the TS logic in
/// the official plugin's `detectMakerFailureText` contract.
fn detect_maker_failure(value: &serde_json::Value, text: &str) -> Option<String> {
    let is_error = value
        .get("isError")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if is_error {
        return Some(text.to_string());
    }
    let lower = text.to_lowercase();
    for keyword in MAKER_FAILURE_KEYWORDS {
        if lower.contains(keyword) {
            return Some(text.to_string());
        }
    }
    None
}

/// Extract a playable TapTap URL from the Maker response text.
fn extract_taptap_preview_url(text: &str) -> Option<String> {
    // Match `<field>: https://...` style fields line by line (case-insensitive)
    let fields = [
        "preview_url",
        "previewUrl",
        "play_url",
        "game_url",
        "maker_url",
    ];
    for line in text.lines() {
        let trimmed = line.trim().trim_start_matches(['-', '*']).trim();
        // Find "field: value" pattern
        let lower = trimmed.to_lowercase();
        for field in fields {
            let prefix = format!("{field}:");
            if let Some(rest) = lower.strip_prefix(&prefix) {
                let candidate = rest.trim();
                if let Some(url) = extract_url(candidate) {
                    return Some(url);
                }
            }
            // Also handle "- field: value" anywhere in the line
            if let Some(idx) = lower.find(&prefix) {
                let after = trimmed[idx + prefix.len()..].trim();
                if let Some(url) = extract_url(after) {
                    return Some(url);
                }
            }
        }
    }
    // Fallback: scan for any taptap/tapsvc/xindong URL anywhere in text
    extract_first_url(text, |u| {
        let l = u.to_lowercase();
        l.contains("taptap") || l.contains("tapsvc") || l.contains("xindong")
    })
}

/// Extract the first `https?://...` URL from the start of `s`, stopping at
/// common terminators (whitespace, `)`, `,`, `.`, `;`, `]`, `}`).
fn extract_url(s: &str) -> Option<String> {
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
    let host_path = &stripped[..end];
    Some(format!("{scheme}://{host_path}"))
}

/// Find the first http(s) URL anywhere in `text` matching `predicate`.
fn extract_first_url<F>(text: &str, predicate: F) -> Option<String>
where
    F: Fn(&str) -> bool,
{
    let mut idx = 0;
    while idx < text.len() {
        // Find "http" starting from idx
        let rest = &text[idx..];
        let Some(rel) = rest.find("http") else {
            return None;
        };
        let abs = idx + rel;
        let candidate = &text[abs..];
        if let Some(url) = extract_url(candidate) {
            if predicate(&url) {
                return Some(url);
            }
        }
        idx = abs + 4; // skip past "http"
    }
    None
}

/// Return a stable error-kind string for diagnostics.
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

/// Persist the latest build metadata so `build.status` can query remote state.
fn persist_last_build(
    root: &std::path::Path,
    build_id: &str,
    build_target: &str,
    text: &str,
    preview_url: Option<&str>,
) -> std::io::Result<()> {
    let project_dir = root.join(".project");
    std::fs::create_dir_all(&project_dir)?;
    let payload = json!({
        "build_id": build_id,
        "build_target": build_target,
        "submitted_at": chrono::Utc::now().to_rfc3339(),
        "preview_url": preview_url,
        "status": "queued",
        "text_preview": text.chars().take(2048).collect::<String>(),
    });
    std::fs::write(
        project_dir.join("last-build.json"),
        serde_json::to_string_pretty(&payload)?,
    )
}

const MAKER_FAILURE_KEYWORDS: &[&str] = &[
    "blocked before commit/push",
    "remote build was not started",
    "remote maker build failed",
    "tool 'build' failed",
    "branch_not_allowed",
    "forbidden_path",
    "recovery details",
    "push failed",
    "push was rejected",
    "merge conflict",
    "could not push",
    "failed to push",
    "remote sync check failed",
    "behind/diverged",
    "not on main",
];

/// Prepare a maker operation.
pub fn prepare_maker(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    let effects = match request.operation_id.as_str() {
        "maker.auth" => vec![crate::model::Effect::Network],
        "maker.status" => vec![crate::model::Effect::Network],
        "maker.build" => vec![
            crate::model::Effect::Network,
            crate::model::Effect::RemoteBuild,
        ],
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
        effect_digest: "maker-effects".to_string(),
    })
}

/// Find the Maker MCP configuration file.
fn find_maker_config(request: &OperationRequest) -> Option<std::path::PathBuf> {
    // Check project-local config
    if let Some(root) = request
        .arguments
        .get("project_root")
        .and_then(|v| v.as_str())
    {
        let local_config = std::path::PathBuf::from(root)
            .join(".maker-mcp")
            .join("config.json");
        if local_config.exists() {
            return Some(local_config);
        }
    }

    // Check project_root from context
    if let Some(ref root) = request.project_root {
        let local_config = root.join(".maker-mcp").join("config.json");
        if local_config.exists() {
            return Some(local_config);
        }
    }

    // Check global config
    let home = std::env::var("HOME").ok()?;
    let global_config = std::path::PathBuf::from(&home)
        .join(".maker-mcp")
        .join("config.json");
    if global_config.exists() {
        return Some(global_config);
    }

    None
}

fn get_project_root(
    request: &OperationRequest,
) -> Result<std::sync::Arc<std::path::Path>, ExecuteError> {
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

    Ok(std::sync::Arc::from(path))
}
