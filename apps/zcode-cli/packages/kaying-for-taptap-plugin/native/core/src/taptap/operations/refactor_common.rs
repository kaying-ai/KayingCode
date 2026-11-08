//! Shared helpers used by the mutating refactor handlers.
//!
//! Extracted into a separate module so each `refactor_*` file stays under the
//! 500-line repo limit.

use crate::model::{OperationRequest, OperationResult};
use serde_json::json;
use std::path::Path;

use super::helpers::ok_result;

/// Build a uniform "file not found" result for refactor operations.
pub fn missing_file_result(
    request: &OperationRequest,
    path: &Path,
    root: &Path,
) -> OperationResult {
    ok_result(
        request,
        json!({
            "renamed": false,
            "moved": false,
            "extracted": false,
            "split": false,
            "inlined": false,
            "error": "File not found",
            "path": path.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        0,
    )
}

/// Convert a relative path like `lib/event.lua` into `scripts.lib.event`.
pub fn require_path_from_rel(rel: &str) -> String {
    let trimmed = rel.trim_end_matches(".lua");
    let with_dots = trimmed.replace('/', ".");
    format!("scripts.{with_dots}")
}

/// Walk all `.lua` files under `dir` (recursively) and call `visit` for each.
pub fn walk_lua_files<F: FnMut(&Path)>(dir: &Path, visit: &mut F) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            walk_lua_files(&path, visit);
        } else if meta.is_file() && path.extension().and_then(|s| s.to_str()) == Some("lua") {
            visit(&path);
        }
    }
}

/// Find the byte offset where the first non-comment, non-blank line begins.
pub fn find_first_code_line(src: &str) -> usize {
    for (i, line) in src.lines().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() || trimmed.starts_with("--") {
            continue;
        }
        let mut offset = 0;
        for (j, l) in src.lines().enumerate() {
            if j == i {
                return offset;
            }
            offset += l.len() + 1; // +1 for `\n`
        }
    }
    0
}

/// Strip a leading `scripts/` (or `scripts\`) prefix from a path string.
pub fn strip_scripts_prefix(s: &str) -> String {
    s.strip_prefix("scripts/")
        .or_else(|| s.strip_prefix("scripts\\"))
        .unwrap_or(s)
        .to_string()
}
