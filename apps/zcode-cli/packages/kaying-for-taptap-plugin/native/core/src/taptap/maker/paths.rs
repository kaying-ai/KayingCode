//! Maker bundle and Node binary discovery.
//!
//! Resolves the path to the bundled `maker.js` and the `node` executable
//! used to spawn the Maker MCP server. Mirrors the official plugin's TS path contract.

use std::path::PathBuf;

/// Errors that can occur while resolving Maker paths.
#[derive(Debug, thiserror::Error)]
pub enum MakerPathsError {
    /// The Maker bundle file could not be found at any candidate path.
    #[error(
        "Maker bundle not found. Set KAYING_FOR_TAPTAP_MAKER_BUNDLE or run from the kaying-for-taptap package root. Candidates tried: {candidates:?}"
    )]
    BundleNotFound { candidates: Vec<PathBuf> },
    /// The `node` executable could not be found on PATH.
    #[error(
        "node executable not found. Set KAYING_FOR_TAPTAP_NODE or NODE, or ensure node is on PATH."
    )]
    NodeNotFound,
}

/// Resolve the path to the bundled `maker.js` file.
///
/// Resolution order:
/// 1. `KAYING_FOR_TAPTAP_MAKER_BUNDLE` env var (absolute path)
/// 2. `KAYINGCODE_PLUGIN_ROOT` or `KAYING_FOR_TAPTAP_PACKAGE_ROOT` + bundled vendor path
/// 3. cwd-based development candidates
/// 4. `resourcesPath`-based candidate (Electron packaged app)
pub fn resolve_maker_bundle() -> Result<PathBuf, MakerPathsError> {
    // 1. Direct override
    if let Ok(val) = std::env::var("KAYING_FOR_TAPTAP_MAKER_BUNDLE") {
        let p = PathBuf::from(val);
        if p.exists() {
            return Ok(p);
        }
    }

    let bundle_relative = std::path::Path::new("vendor")
        .join("instant-games-open-mcp")
        .join("dist")
        .join("maker.js");

    let mut candidates: Vec<PathBuf> = Vec::new();

    // 2. Package root override
    if let Ok(val) = std::env::var("KAYINGCODE_PLUGIN_ROOT")
        .or_else(|_| std::env::var("KAYING_FOR_TAPTAP_PACKAGE_ROOT"))
    {
        candidates.push(PathBuf::from(&val).join(&bundle_relative));
    }

    // 3. cwd-based candidates (walk up to find kaying-for-taptap package)
    if let Ok(cwd) = std::env::current_dir() {
        // Development-only fallback: cwd itself or a nearby package checkout.
        candidates.push(cwd.join(&bundle_relative));
        candidates.push(
            cwd.join("packages")
                .join("kaying-for-taptap")
                .join(&bundle_relative),
        );
        let mut ancestor = cwd.parent();
        for _ in 0..6 {
            if let Some(parent) = ancestor {
                candidates.push(
                    parent
                        .join("packages")
                        .join("kaying-for-taptap")
                        .join(&bundle_relative),
                );
                ancestor = parent.parent();
            } else {
                break;
            }
        }
    }

    // 4. Electron resourcesPath
    if let Ok(val) = std::env::var("KAYING_ELECTRON_RESOURCES_PATH") {
        candidates.push(
            PathBuf::from(&val)
                .join("packages")
                .join("kaying-for-taptap")
                .join(&bundle_relative),
        );
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    Err(MakerPathsError::BundleNotFound { candidates })
}

/// Resolve the `node` executable to use for spawning the Maker bundle.
///
/// Resolution order:
/// 1. `KAYING_FOR_TAPTAP_NODE` env var
/// 2. `NODE` env var
/// 3. `process.execPath` equivalent — for non-Bun runtimes we can't introspect
///    this from Rust; fall through to PATH lookup
/// 4. PATH lookup for `node` (or `node.exe` on Windows)
pub fn resolve_node_command() -> Result<PathBuf, MakerPathsError> {
    if let Ok(val) = std::env::var("KAYING_FOR_TAPTAP_NODE") {
        let p = PathBuf::from(&val);
        if p.exists() {
            return Ok(p);
        }
    }
    if let Ok(val) = std::env::var("NODE") {
        let p = PathBuf::from(&val);
        if p.exists() {
            return Ok(p);
        }
    }

    // PATH lookup
    if let Some(path_str) = std::env::var_os("PATH") {
        let exe_name = if cfg!(windows) { "node.exe" } else { "node" };
        for dir in std::env::split_paths(&path_str) {
            let candidate = dir.join(exe_name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Err(MakerPathsError::NodeNotFound)
}

/// Build the Maker environment variables for the spawned child process.
///
/// Ensures `TAPTAP_MAKER_HOME` is set so the Maker bundle writes its
/// auth/cache files into the KayingCode-owned plugin data directory.
#[must_use]
pub fn build_maker_environment(extra: Option<&[(String, String)]>) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = std::env::vars().collect();

    // Set TAPTAP_MAKER_HOME if not already set
    let has_maker_home = env.iter().any(|(k, _)| k == "TAPTAP_MAKER_HOME");
    if !has_maker_home {
        if let Some(plugin_data) = std::env::var_os("KAYINGCODE_PLUGIN_DATA") {
            // 修复依据：旧 core 默认写入 ~/.KayingCodex，导致两个产品共享授权状态；
            // official plugin Host 已提供隔离 data root，native 子进程必须沿用同一所有者。
            let maker_home = PathBuf::from(plugin_data).join("taptap-maker");
            let _ = std::fs::create_dir_all(&maker_home);
            env.push((
                "TAPTAP_MAKER_HOME".to_string(),
                maker_home.to_string_lossy().into_owned(),
            ));
        }
    }

    // When running inside Electron, force Node mode
    if std::env::var("ELECTRON_RUN_AS_NODE").is_err()
        && std::env::var("ELECTRON_NO_ATTACH_CONSOLE").is_ok()
    {
        // Heuristic: if we appear to be inside Electron, set ELECTRON_RUN_AS_NODE=1
        // so bundled JS files execute as CLI scripts.
        env.push(("ELECTRON_RUN_AS_NODE".to_string(), "1".to_string()));
    }

    if let Some(extra) = extra {
        for (k, v) in extra {
            // Replace existing or push
            if let Some(entry) = env.iter_mut().find(|(ek, _)| ek == k) {
                entry.1 = v.clone();
            } else {
                env.push((k.clone(), v.clone()));
            }
        }
    }

    // 修复依据：宿主可能残留 TAPTAP_MCP_ENV=rnd（内网 R&D，Git 远端为
    // fuping.agnt.xd.com，公网 TLS 不可用）。默认必须落到 production；
    // 仅当 extra 显式指定 rnd/production 时才尊重该值。
    let explicit = extra.and_then(|extra| {
        extra
            .iter()
            .find(|(k, _)| k == "TAPTAP_MCP_ENV")
            .map(|(_, v)| v.as_str())
    });
    if explicit != Some("rnd") && explicit != Some("production") {
        if let Some(entry) = env.iter_mut().find(|(k, _)| k == "TAPTAP_MCP_ENV") {
            entry.1 = "production".to_string();
        } else {
            env.push(("TAPTAP_MCP_ENV".to_string(), "production".to_string()));
        }
    }

    env
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn build_maker_environment_sets_maker_home() {
        let _guard = ENV_LOCK.lock().unwrap();
        // Remove TAPTAP_MAKER_HOME for the test
        unsafe { std::env::remove_var("TAPTAP_MAKER_HOME") };
        let env = build_maker_environment(None);
        let has_maker_home = env.iter().any(|(k, _)| k == "TAPTAP_MAKER_HOME");
        // The official plugin host supplies KAYINGCODE_PLUGIN_DATA; a standalone binary does not
        // silently fall back to another product's home directory.
        if std::env::var_os("KAYINGCODE_PLUGIN_DATA").is_some() {
            assert!(
                has_maker_home,
                "TAPTAP_MAKER_HOME should be set when HOME/USERPROFILE is available"
            );
        }
    }

    #[test]
    fn build_maker_environment_respects_existing_maker_home() {
        let _guard = ENV_LOCK.lock().unwrap();
        unsafe { std::env::set_var("TAPTAP_MAKER_HOME", "/custom/maker/home") };
        let env = build_maker_environment(None);
        let maker_home = env
            .iter()
            .find(|(k, _)| k == "TAPTAP_MAKER_HOME")
            .map(|(_, v)| v.clone());
        assert_eq!(maker_home.as_deref(), Some("/custom/maker/home"));
        unsafe { std::env::remove_var("TAPTAP_MAKER_HOME") };
    }

    #[test]
    fn build_maker_environment_merges_extra() {
        let _guard = ENV_LOCK.lock().unwrap();
        let extra = vec![("CUSTOM_VAR".to_string(), "value".to_string())];
        let env = build_maker_environment(Some(&extra));
        let custom = env
            .iter()
            .find(|(k, _)| k == "CUSTOM_VAR")
            .map(|(_, v)| v.clone());
        assert_eq!(custom.as_deref(), Some("value"));
    }

    #[test]
    fn build_maker_environment_pins_production_by_default() {
        let _guard = ENV_LOCK.lock().unwrap();
        unsafe { std::env::set_var("TAPTAP_MCP_ENV", "rnd") };
        let env = build_maker_environment(None);
        let maker_env = env
            .iter()
            .find(|(k, _)| k == "TAPTAP_MCP_ENV")
            .map(|(_, v)| v.clone());
        assert_eq!(maker_env.as_deref(), Some("production"));
        unsafe { std::env::remove_var("TAPTAP_MCP_ENV") };
    }

    #[test]
    fn build_maker_environment_honors_explicit_rnd() {
        let _guard = ENV_LOCK.lock().unwrap();
        let extra = vec![("TAPTAP_MCP_ENV".to_string(), "rnd".to_string())];
        let env = build_maker_environment(Some(&extra));
        let maker_env = env
            .iter()
            .find(|(k, _)| k == "TAPTAP_MCP_ENV")
            .map(|(_, v)| v.clone());
        assert_eq!(maker_env.as_deref(), Some("rnd"));
    }
}
