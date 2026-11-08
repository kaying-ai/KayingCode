//! Cross-Surface require validation for the modular contract.
//!
//! Extracted from `project_validate_v2` so each source file stays under the
//! 500-line limit. Checks that Surfaces never require sibling Surfaces
//! directly (they should communicate via the event bus instead).

use serde_json::{Value, json};
use std::fs;
use std::path::Path;

/// Ensure no Surface requires a sibling Surface directly.
///
/// Forbidden pattern: `require "scripts.ui.surfaces.<other>"` inside a Surface
/// whose id differs from `<other>`. Returns a Warning with the violations.
pub(crate) fn check_surface_cross_require(root: &Path) -> Value {
    let surfaces_dir = root.join("scripts/ui/surfaces");
    if !surfaces_dir.is_dir() {
        return json!({
            "name": "surface_cross_require",
            "valid": true,
            "severity": "Warning",
            "message": "scripts/ui/surfaces/ missing, skipping cross-require check"
        });
    }

    // Forbidden: Surface A requires "scripts.ui.surfaces.B" directly (should use event bus).
    let mut violations: Vec<String> = Vec::new();
    for entry in fs::read_dir(&surfaces_dir).into_iter().flatten().flatten() {
        let surface_path = entry.path();
        if !surface_path.is_dir() {
            continue;
        }
        let surface_id = match surface_path.file_name().and_then(|n| n.to_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        // Scan all .lua files in this surface dir.
        let mut lua_files = Vec::new();
        collect_lua_files(&surface_path, &mut lua_files);
        for file_path in &lua_files {
            let requires = extract_requires(file_path);
            for req in &requires {
                let normalized = req.replace('/', ".");
                // Match "scripts.ui.surfaces.<other>" where <other> != surface_id
                let prefix = "scripts.ui.surfaces.";
                if let Some(rest) = normalized.strip_prefix(prefix) {
                    let target = rest.split('.').next().unwrap_or(rest);
                    if target != surface_id {
                        let rel = file_path.strip_prefix(root).unwrap_or(file_path);
                        violations.push(format!(
							"{} requires scripts.ui.surfaces.{target} ({req}) - should use event bus",
							rel.to_string_lossy()
						));
                    }
                }
            }
        }
    }

    let (valid, message) = if violations.is_empty() {
        (
            true,
            "No cross-Surface require violations detected".to_string(),
        )
    } else {
        (false, violations.join("; "))
    };

    json!({
        "name": "surface_cross_require",
        "valid": valid,
        "severity": "Warning",
        "message": message
    })
}

// ============================================================
// Helpers
// ============================================================

fn collect_lua_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    if !dir.is_dir() {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_lua_files(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("lua") {
            out.push(path);
        }
    }
}

fn extract_requires(path: &Path) -> Vec<String> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let mut requires: Vec<String> = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.find("require") {
            let after_require = &trimmed[rest + "require".len()..];
            if let Some(m) = extract_quoted_string(after_require.trim()) {
                requires.push(m);
            }
        }
    }
    requires
}

fn extract_quoted_string(s: &str) -> Option<String> {
    let s = s.trim_start();
    if s.is_empty() {
        return None;
    }
    let quote = s.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let inner = &s[1..];
    let end = inner.find(quote)?;
    Some(inner[..end].to_string())
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_check_surface_cross_require_detects_violation() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        let dir_a = root.join("scripts/ui/surfaces/menu_a");
        fs::create_dir_all(&dir_a).unwrap();
        fs::write(
            dir_a.join("view.lua"),
            "local Other = require \"scripts.ui.surfaces.menu_b.init\"\n",
        )
        .unwrap();

        let result = check_surface_cross_require(root);
        assert_eq!(result["valid"], false);
        assert!(result["message"].as_str().unwrap().contains("event bus"));
    }
}
