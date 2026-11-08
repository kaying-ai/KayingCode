//! TapTap package/module operations.
//!
//! Packages are Lua modules under `scripts/lib/` (or `scripts/` more broadly).
//! The module manifest `.project/modules.json` tracks declared modules and
//! their dependency edges.

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use crate::taptap::operations::helpers::{
    fail_result, get_project_root, make_plan, ok_result, read_json_file_opt, required_str_arg,
    write_json_file,
};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicU64;
use std::time::Instant;
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

const DEFAULT_MODULE_STUB: &str = "-- {name}.lua\n-- Auto-generated module stub. Implement as needed.\n\nlocal M = {}\n\nfunction M.init()\n    -- TODO: module init\nend\n\nreturn M\n";

fn lib_dir(root: &Path) -> PathBuf {
    root.join("scripts").join("lib")
}

fn modules_json_path(root: &Path) -> PathBuf {
    root.join(".project").join("modules.json")
}

fn module_path(root: &Path, name: &str) -> PathBuf {
    lib_dir(root).join(format!("{name}.lua"))
}

// ============================================================
// package.list
// ============================================================

/// Handle `package.list` — list all Lua modules under `scripts/lib/`.
pub fn package_list(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let dir = lib_dir(&root);

    let mut modules: Vec<serde_json::Value> = Vec::new();
    if dir.exists() {
        collect_lua_modules(&dir, &dir, &mut modules).map_err(ExecuteError::Io)?;
    }

    // Also surface the manifest if it exists.
    let manifest = read_json_file_opt(&modules_json_path(&root)).map_err(ExecuteError::Io)?;

    info!(count = modules.len(), "Packages listed");

    Ok(ok_result(
        request,
        json!({
            "modules": modules,
            "count": modules.len(),
            "lib_dir": dir.to_string_lossy(),
            "manifest": manifest,
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

fn collect_lua_modules(
    base: &Path,
    dir: &Path,
    out: &mut Vec<serde_json::Value>,
) -> Result<(), std::io::Error> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_lua_modules(base, &path, out)?;
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "lua" {
                    let rel = path
                        .strip_prefix(base)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    let requires = count_requires(&path).unwrap_or(0);
                    out.push(json!({
                        "name": path.file_stem().and_then(|n| n.to_str()).unwrap_or(""),
                        "path": rel,
                        "size": size,
                        "requires_count": requires,
                    }));
                }
            }
        }
    }
    Ok(())
}

/// Count `require "..."` calls in a Lua file.
fn count_requires(path: &Path) -> Result<usize, std::io::Error> {
    let content = std::fs::read_to_string(path)?;
    Ok(content.matches("require").count())
}

// ============================================================
// package.add
// ============================================================

/// Handle `package.add` — create a new Lua module stub under `scripts/lib/`.
pub fn package_add(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let body = crate::taptap::operations::helpers::opt_str_arg(request, "content")
        .unwrap_or_else(|| DEFAULT_MODULE_STUB.replace("{name}", &name));

    let path = module_path(&root, &name);
    if path.exists() {
        return Ok(fail_result(
            request,
            json!({
                "error": format!("Module '{name}' already exists"),
                "path": path.to_string_lossy(),
            }),
            started.elapsed().as_millis() as u64,
        ));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    std::fs::write(&path, &body).map_err(ExecuteError::Io)?;

    // Update manifest
    let _ = append_module_to_manifest(&root, &name, "scripts/lib");

    info!(name = %name, path = %path.to_string_lossy(), "Package added");

    Ok(ok_result(
        request,
        json!({
            "added": true,
            "name": name,
            "path": path.to_string_lossy(),
            "size": body.len(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// package.remove
// ============================================================

/// Handle `package.remove` — remove a Lua module and update manifest.
pub fn package_remove(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;

    let path = module_path(&root, &name);
    if !path.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Module '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    }

    std::fs::remove_file(&path).map_err(ExecuteError::Io)?;
    let _ = remove_module_from_manifest(&root, &name);

    info!(name = %name, "Package removed");

    Ok(ok_result(
        request,
        json!({
            "removed": true,
            "name": name,
            "path": path.to_string_lossy(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// package.resolve
// ============================================================

/// Handle `package.resolve` — statically verify `require` chains resolve.
pub fn package_resolve(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let scripts_dir = root.join("scripts");

    let mut resolved: Vec<serde_json::Value> = Vec::new();
    let mut missing: Vec<serde_json::Value> = Vec::new();

    if scripts_dir.exists() {
        scan_requires(
            &scripts_dir,
            &scripts_dir,
            &root,
            &mut resolved,
            &mut missing,
        )
        .map_err(ExecuteError::Io)?;
    }

    let all_ok = missing.is_empty();
    info!(
        resolved = resolved.len(),
        missing = missing.len(),
        all_ok,
        "Package resolution checked"
    );

    Ok(ok_result(
        request,
        json!({
            "all_resolved": all_ok,
            "resolved": resolved,
            "missing": missing,
            "resolved_count": resolved.len(),
            "missing_count": missing.len(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

fn scan_requires(
    base: &Path,
    dir: &Path,
    project_root: &Path,
    resolved: &mut Vec<serde_json::Value>,
    missing: &mut Vec<serde_json::Value>,
) -> Result<(), std::io::Error> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            scan_requires(base, &path, project_root, resolved, missing)?;
        } else if path.is_file() && path.extension().map(|e| e == "lua").unwrap_or(false) {
            let content = std::fs::read_to_string(&path)?;
            let source_rel = path
                .strip_prefix(project_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            for req in extract_require_paths(&content) {
                let target = resolve_require_path(project_root, &req);
                if target.exists() {
                    resolved.push(json!({
                        "from": source_rel,
                        "requires": req,
                        "target": target.strip_prefix(project_root).unwrap_or(&target).to_string_lossy(),
                    }));
                } else {
                    missing.push(json!({
                        "from": source_rel,
                        "requires": req,
                        "expected_target": target.strip_prefix(project_root).unwrap_or(&target).to_string_lossy(),
                    }));
                }
            }
        }
    }
    Ok(())
}

/// Extract argument strings from `require "..."` / `require '...'` calls.
fn extract_require_paths(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut idx = 0;
    while let Some(rel) = content[idx..].find("require") {
        let abs = idx + rel;
        let after = &content[abs + "require".len()..];
        // Skip whitespace then look for a quoted string.
        let trimmed = after.trim_start();
        let bytes = trimmed.as_bytes();
        if !bytes.is_empty() && (bytes[0] == b'"' || bytes[0] == b'\'') {
            let quote = bytes[0];
            let s = 1;
            if let Some(end) = trimmed[s..].find(quote as char) {
                let path = &trimmed[s..s + end];
                if !path.is_empty() {
                    out.push(path.to_string());
                }
                idx = abs + "require".len() + s + end + 1;
                continue;
            }
        }
        idx = abs + "require".len();
    }
    out
}

/// Resolve a Lua `require` path (e.g. "scripts.lib.event") to a filesystem path.
fn resolve_require_path(root: &Path, req: &str) -> PathBuf {
    let rel = req.replace('.', std::path::MAIN_SEPARATOR_STR);
    // Try both .lua and /init.lua.
    let direct = root.join(format!("{rel}.lua"));
    if direct.exists() {
        return direct;
    }
    root.join(&rel).join("init.lua")
}

// ============================================================
// package.status
// ============================================================

/// Handle `package.status` — return module dependency graph.
pub fn package_status(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let scripts_dir = root.join("scripts");

    let mut nodes: Vec<serde_json::Value> = Vec::new();
    let mut edges: Vec<serde_json::Value> = Vec::new();

    if scripts_dir.exists() {
        build_dep_graph(&scripts_dir, &scripts_dir, &root, &mut nodes, &mut edges)
            .map_err(ExecuteError::Io)?;
    }

    info!(
        nodes = nodes.len(),
        edges = edges.len(),
        "Package graph built"
    );

    Ok(ok_result(
        request,
        json!({
            "nodes": nodes,
            "edges": edges,
            "node_count": nodes.len(),
            "edge_count": edges.len(),
            "project_root": root.to_string_lossy(),
        }),
        started.elapsed().as_millis() as u64,
    ))
}

fn build_dep_graph(
    base: &Path,
    dir: &Path,
    project_root: &Path,
    nodes: &mut Vec<serde_json::Value>,
    edges: &mut Vec<serde_json::Value>,
) -> Result<(), std::io::Error> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            build_dep_graph(base, &path, project_root, nodes, edges)?;
        } else if path.is_file() && path.extension().map(|e| e == "lua").unwrap_or(false) {
            let rel = path
                .strip_prefix(project_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            let content = std::fs::read_to_string(&path)?;
            nodes.push(
                json!({"id": rel, "name": path.file_stem().and_then(|n| n.to_str()).unwrap_or("")}),
            );
            for req in extract_require_paths(&content) {
                edges.push(json!({"from": rel, "to": req}));
            }
        }
    }
    Ok(())
}

// ============================================================
// Manifest helpers
// ============================================================

fn append_module_to_manifest(root: &Path, name: &str, dir: &str) -> Result<(), std::io::Error> {
    let manifest_path = modules_json_path(root);
    let mut manifest = read_json_file_opt(&manifest_path)?.unwrap_or(json!({"modules": []}));
    let modules = manifest.get_mut("modules").and_then(|v| v.as_array_mut());
    if let Some(modules) = modules {
        modules.push(json!({"name": name, "directory": dir}));
    }
    write_json_file(&manifest_path, &manifest)?;
    Ok(())
}

fn remove_module_from_manifest(root: &Path, name: &str) -> Result<(), std::io::Error> {
    let manifest_path = modules_json_path(root);
    let Some(mut manifest) = read_json_file_opt(&manifest_path)? else {
        return Ok(());
    };
    if let Some(modules) = manifest.get_mut("modules").and_then(|v| v.as_array_mut()) {
        modules.retain(|m| m.get("name").and_then(|v| v.as_str()) != Some(name));
    }
    write_json_file(&manifest_path, &manifest)?;
    Ok(())
}

// ============================================================
// Prepare
// ============================================================

/// Prepare a package operation — validate args and return a plan.
pub fn prepare_package(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let effects = match request.operation_id.as_str() {
        "package.add" | "package.remove" => vec![Effect::ReadProject, Effect::WriteProject],
        _ => vec![Effect::ReadProject],
    };
    make_plan(request, &PLAN_COUNTER, effects, "package-effects")
}
