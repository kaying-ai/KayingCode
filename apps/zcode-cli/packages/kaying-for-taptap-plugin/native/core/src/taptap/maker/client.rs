//! Minimal JSON-RPC 2.0 over NDJSON stdio client for the Maker MCP server.
//!
//! Mirrors the official plugin Maker MCP client:
//! 1. Spawn `node maker.js` with stdin/stdout pipes
//! 2. Send `initialize` request, wait for response
//! 3. Send `notifications/initialized` notification
//! 4. Send `tools/call` request with tool `name` + `arguments`
//! 5. Collect `notifications/progress` events
//! 6. Receive final `tools/call` response

use super::paths::{
    MakerPathsError, build_maker_environment, resolve_maker_bundle, resolve_node_command,
};
use crate::common::{ProgressEvent, emit_progress};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tracing::debug;

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

/// Progress event from Maker MCP `notifications/progress`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MakerProgress {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<f64>,
}

/// The result of a successful Maker MCP tool call.
#[derive(Debug, Clone)]
pub struct MakerCallResult {
    /// The command line that was used to spawn the Maker process.
    pub command: Vec<String>,
    /// The `result` field of the JSON-RPC response (the MCP `tools/call` result).
    pub value: Value,
    /// All progress notifications received during the call.
    pub progress: Vec<MakerProgress>,
    /// Aggregated stderr from the Maker process.
    pub stderr: String,
}

/// Input for [`call_maker_tool`].
pub struct MakerCallInput<'a> {
    /// Working directory for the Maker process. Usually the project root.
    pub cwd: String,
    /// Tool name (e.g. `maker_build_current_directory`, `maker_status_lite`).
    pub name: &'a str,
    /// Tool arguments as a JSON object.
    pub arguments: Value,
    /// Timeout in milliseconds. The child is killed if this elapses.
    pub timeout_ms: u64,
    /// Optional operation label for progress events emitted on stderr.
    pub operation_label: Option<&'a str>,
    /// Optional Maker remote environment, passed through `TAPTAP_MCP_ENV`.
    pub maker_environment: Option<&'a str>,
}

/// Spawn the Maker MCP server, call a tool, and return its result.
///
/// # Errors
///
/// Returns an error if:
/// - The Maker bundle or `node` binary cannot be resolved
/// - The child fails to spawn
/// - The child exits before responding
/// - The timeout elapses
/// - The JSON-RPC layer returns an `error` response
pub fn call_maker_tool(input: MakerCallInput) -> Result<MakerCallResult, MakerCallError> {
    let bundle = resolve_maker_bundle()?;
    let node = resolve_node_command()?;

    let command_str = format!("{} {}", node.display(), bundle.display());
    let command_vec = vec![
        node.to_string_lossy().to_string(),
        bundle.to_string_lossy().to_string(),
    ];
    debug!(command = %command_str, cwd = %input.cwd, tool = input.name, "Spawning Maker MCP");

    if let Some(label) = input.operation_label {
        emit_progress(&ProgressEvent::started(format!(
            "{label}: starting Maker MCP"
        )));
    }

    let mut env = build_maker_environment(None);
    if let Some(maker_environment) = input.maker_environment {
        if let Some((_, value)) = env.iter_mut().find(|(key, _)| key == "TAPTAP_MCP_ENV") {
            *value = maker_environment.to_string();
        } else {
            env.push(("TAPTAP_MCP_ENV".to_string(), maker_environment.to_string()));
        }
    }
    let mut cmd = Command::new(&node);
    cmd.arg(&bundle)
        .current_dir(&input.cwd)
        .envs(env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let started = Instant::now();
    let deadline = started + Duration::from_millis(input.timeout_ms);

    let mut child = cmd.spawn().map_err(MakerCallError::Spawn)?;

    let mut stdin = child.stdin.take().ok_or(MakerCallError::NoStdin)?;
    let stdout = child.stdout.take().ok_or(MakerCallError::NoStdout)?;
    let stderr = child.stderr.take().ok_or(MakerCallError::NoStderr)?;

    // stderr reader thread: collect into a shared buffer (capped at 64 KiB)
    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_buf_clone = stderr_buf.clone();
    let stderr_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            if let Ok(mut buf) = stderr_buf_clone.lock() {
                if buf.len() < 65536 {
                    buf.push_str(&line);
                    buf.push('\n');
                }
            }
        }
    });

    // stdout reader thread: line-by-line, dispatch JSON-RPC messages.
    // Sends `Ok((id, result))` for results, `Err((id, error))` for errors.
    // Keeps running across multiple requests (init + call) so we don't lose
    // the call response after reading the init response.
    let progress: Arc<Mutex<Vec<MakerProgress>>> = Arc::new(Mutex::new(Vec::new()));
    let (tx, rx) = std::sync::mpsc::channel::<StdoutMessage>();
    let init_id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
    let call_id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
    let progress_clone = progress.clone();

    let stdout_thread = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(message) = serde_json::from_str::<Value>(trimmed) else {
                debug!(line = trimmed, "Maker MCP: unparseable line");
                continue;
            };

            // Progress notification
            if message.get("method").and_then(|v| v.as_str()) == Some("notifications/progress") {
                if let Some(params) = message.get("params") {
                    if let Some(p) = parse_progress(params) {
                        if let Ok(mut buf) = progress_clone.lock() {
                            buf.push(p);
                        }
                    }
                }
                continue;
            }

            // Response (result or error) — forward with its id
            let id = message.get("id").and_then(|v| v.as_u64());
            if let Some(id) = id {
                if let Some(err) = message.get("error").cloned() {
                    let _ = tx.send(StdoutMessage::Error { id, error: err });
                    // Continue reading — there may still be more messages
                    continue;
                }
                if let Some(result) = message.get("result").cloned() {
                    let _ = tx.send(StdoutMessage::Result { id, result });
                    // Continue reading — there may still be more messages (progress, etc.)
                    continue;
                }
            }
        }
    });

    // 1. Send initialize
    let init_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": init_id,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "kaying-for-taptap-core", "version": env!("CARGO_PKG_VERSION") }
        }
    });
    write_json_line(&mut stdin, &init_request)?;

    // Wait for initialize response (with timeout)
    let _init_result = recv_matching(&rx, init_id, deadline)?;
    debug!(tool = input.name, "Maker MCP: initialized");

    // 2. Send initialized notification
    let initialized_notification = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    });
    write_json_line(&mut stdin, &initialized_notification)?;

    if let Some(label) = input.operation_label {
        emit_progress(&ProgressEvent::running(
            format!("{label}: calling Maker tool `{}`", input.name),
            Some(10.0),
        ));
    }

    // 3. Send tools/call
    let progress_token = format!("{}-{}", input.name, started.elapsed().as_millis());
    let call_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": call_id,
        "method": "tools/call",
        "params": {
            "name": input.name,
            "arguments": input.arguments,
            "_meta": { "progressToken": progress_token }
        }
    });
    write_json_line(&mut stdin, &call_request)?;

    // 4. Wait for tools/call response (with timeout)
    let value = recv_matching(&rx, call_id, deadline)?;

    // Close stdin so the child exits cleanly
    drop(stdin);

    // Wait for the child to exit (with a short grace period)
    let exit_status = child.wait_timeout(Duration::from_secs(5)).unwrap_or(None);
    if exit_status.is_none() {
        // Child didn't exit gracefully — kill it
        let _ = child.kill();
        let _ = child.wait();
    }

    // Join reader threads (they should exit on EOF)
    let _ = stdout_thread.join();
    let _ = stderr_thread.join();

    let progress_vec = progress.lock().map(|p| p.clone()).unwrap_or_default();
    let stderr_str = stderr_buf.lock().map(|s| s.clone()).unwrap_or_default();

    if let Some(label) = input.operation_label {
        emit_progress(&ProgressEvent::completed(format!(
            "{label}: Maker call completed"
        )));
    }

    Ok(MakerCallResult {
        command: command_vec,
        value,
        progress: progress_vec,
        stderr: stderr_str,
    })
}

/// A message forwarded by the stdout reader thread.
#[derive(Debug)]
enum StdoutMessage {
    /// A successful JSON-RPC result with its request id.
    Result { id: u64, result: Value },
    /// A JSON-RPC error response with its request id.
    Error { id: u64, error: Value },
}

/// Write a single JSON-RPC message followed by a newline to the child's stdin.
fn write_json_line(
    stdin: &mut std::process::ChildStdin,
    message: &Value,
) -> Result<(), MakerCallError> {
    let json =
        serde_json::to_string(message).map_err(|e| MakerCallError::Serialize(e.to_string()))?;
    writeln!(stdin, "{json}").map_err(|e| MakerCallError::Io(e))?;
    stdin.flush().map_err(|e| MakerCallError::Io(e))?;
    Ok(())
}

/// Receive a JSON-RPC response matching `expected_id` from the channel, with
/// a deadline. Messages with non-matching ids are skipped (drained).
fn recv_matching(
    rx: &std::sync::mpsc::Receiver<StdoutMessage>,
    expected_id: u64,
    deadline: Instant,
) -> Result<Value, MakerCallError> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return Err(MakerCallError::Timeout);
        }
        let remaining = deadline - now;
        match rx.recv_timeout(remaining) {
            Ok(StdoutMessage::Result { id, result }) if id == expected_id => return Ok(result),
            Ok(StdoutMessage::Error { id, error }) if id == expected_id => {
                let msg = error
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown error");
                let code = error.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
                return Err(MakerCallError::JsonRpcError {
                    code,
                    message: msg.to_string(),
                });
            }
            // Non-matching id — drain and continue (shouldn't normally happen with sequential ids)
            Ok(_) => continue,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => return Err(MakerCallError::Timeout),
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                return Err(MakerCallError::Disconnected);
            }
        }
    }
}

/// Parse a `notifications/progress` params object.
fn parse_progress(params: &Value) -> Option<MakerProgress> {
    if params.is_null() {
        return None;
    }
    Some(MakerProgress {
        message: params
            .get("message")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        progress: params.get("progress").and_then(|v| v.as_f64()),
        total: params.get("total").and_then(|v| v.as_f64()),
    })
}

/// Errors returned by [`call_maker_tool`].
#[derive(Debug, thiserror::Error)]
pub enum MakerCallError {
    /// Failed to resolve Maker bundle or node binary.
    #[error(transparent)]
    Paths(#[from] MakerPathsError),
    /// Failed to spawn the Maker process.
    #[error("failed to spawn Maker process: {0}")]
    Spawn(std::io::Error),
    /// Child stdin pipe was not captured.
    #[error("child stdin pipe was not captured")]
    NoStdin,
    /// Child stdout pipe was not captured.
    #[error("child stdout pipe was not captured")]
    NoStdout,
    /// Child stderr pipe was not captured.
    #[error("child stderr pipe was not captured")]
    NoStderr,
    /// IO error while writing to stdin or reading stdout.
    #[error("io error: {0}")]
    Io(std::io::Error),
    /// Failed to serialize a JSON-RPC message.
    #[error("serialize error: {0}")]
    Serialize(String),
    /// JSON-RPC response contained an `error` field.
    #[error("json-rpc error (code={code}): {message}")]
    JsonRpcError { code: i64, message: String },
    /// The call did not complete within the timeout.
    #[error("maker call timed out")]
    Timeout,
    /// The stdout reader thread disconnected before sending a response.
    #[error("maker process disconnected without responding")]
    Disconnected,
}

// --- Helper: wait with timeout on Child ---
trait ChildWaitExt {
    fn wait_timeout(
        &mut self,
        timeout: Duration,
    ) -> std::io::Result<Option<std::process::ExitStatus>>;
}

impl ChildWaitExt for Child {
    fn wait_timeout(
        &mut self,
        timeout: Duration,
    ) -> std::io::Result<Option<std::process::ExitStatus>> {
        let deadline = Instant::now() + timeout;
        loop {
            match self.try_wait()? {
                Some(status) => return Ok(Some(status)),
                None => {
                    if Instant::now() >= deadline {
                        return Ok(None);
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_progress_handles_full_object() {
        let params = serde_json::json!({
            "message": "building",
            "progress": 50,
            "total": 100
        });
        let p = parse_progress(&params).expect("should parse");
        assert_eq!(p.message.as_deref(), Some("building"));
        assert_eq!(p.progress, Some(50.0));
        assert_eq!(p.total, Some(100.0));
    }

    #[test]
    fn parse_progress_handles_null() {
        assert!(parse_progress(&Value::Null).is_none());
    }

    #[test]
    fn parse_progress_handles_empty_object() {
        let params = serde_json::json!({});
        let p = parse_progress(&params).expect("should parse");
        assert!(p.message.is_none());
        assert!(p.progress.is_none());
        assert!(p.total.is_none());
    }
}
