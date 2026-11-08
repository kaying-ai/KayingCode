//! Transaction support for project refactors.
//!
//! Refactors are built in a sibling staging directory, validated there, and
//! only then copied into the project. A complete mutable-project snapshot is
//! kept before commit so a failed copy can restore the exact pre-commit state.

use crate::model::{ExecuteError, OperationRequest};
use chrono::Utc;
use serde_json::json;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use super::project::project_validate;
use super::refactor_backup_meta::{BackupMetadata, backup_dir, backups_root, write_backup_meta};
use super::refactor_redistribute::PlannedFile;

/// Temporary project tree used while building and validating a refactor.
#[derive(Debug)]
pub struct StagedProject {
    pub root: PathBuf,
    pub source_root: PathBuf,
}

/// Create a sibling staging tree containing the mutable project state.
pub fn create_stage(root: &Path) -> Result<StagedProject, ExecuteError> {
    let name = root
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("project");
    let stage = root
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(format!(".{name}.kaying-stage-{}", std::process::id()));
    if stage.exists() {
        std::fs::remove_dir_all(&stage).map_err(ExecuteError::Io)?;
    }
    std::fs::create_dir_all(&stage).map_err(ExecuteError::Io)?;

    for sub in ["scripts", "scenes", "assets", ".project"] {
        let source = root.join(sub);
        if source.exists() {
            copy_tree_excluding(&source, &stage.join(sub), &backups_root(root))?;
        }
    }
    let agents = root.join("AGENTS.md");
    if agents.exists() {
        std::fs::copy(&agents, stage.join("AGENTS.md")).map_err(ExecuteError::Io)?;
    }

    Ok(StagedProject {
        root: stage,
        source_root: root.to_path_buf(),
    })
}

/// Remove a staging tree. Cleanup is best effort after a successful or failed
/// operation and must not hide the original error.
pub fn cleanup_stage(stage: &StagedProject) {
    let _ = std::fs::remove_dir_all(&stage.root);
}

/// Write one generated file into staging using the same create/rewrite policy
/// as the plan. No real project file is touched here.
pub fn write_planned_file(root: &Path, file: &PlannedFile) -> Result<(), ExecuteError> {
    let full = root.join(&file.rel_path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    if file.action == "create" && full.exists() {
        return Ok(());
    }
    write_atomic(&full, file.content.as_bytes())
}

/// Snapshot the mutable project state, including root-level AGENTS.md.
pub fn snapshot_project(root: &Path, reason: &str) -> Result<(String, PathBuf), ExecuteError> {
    let id = format!(
        "{}-{:03}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        Utc::now().timestamp_millis() % 1000
    );
    let target = backup_dir(root, &id);
    std::fs::create_dir_all(&target).map_err(ExecuteError::Io)?;
    let mut file_count = 0;
    let mut total_bytes = 0;
    for sub in ["scripts", "scenes", "assets", ".project"] {
        let source = root.join(sub);
        if source.exists() {
            copy_tree_excluding(&source, &target.join(sub), &backups_root(root))?;
            count_tree(&target.join(sub), &mut file_count, &mut total_bytes)?;
        }
    }
    let agents = root.join("AGENTS.md");
    if agents.exists() {
        std::fs::copy(&agents, target.join("AGENTS.md")).map_err(ExecuteError::Io)?;
        file_count += 1;
        total_bytes += std::fs::metadata(agents).map_err(ExecuteError::Io)?.len();
    }
    let mut meta = BackupMetadata::new(id.clone(), reason.to_string(), detect_structure(root));
    meta.file_count = file_count;
    meta.total_bytes = total_bytes;
    write_backup_meta(&target, &meta).map_err(ExecuteError::Io)?;
    Ok((id, target))
}

/// Validate the staged tree with the same validator exposed to the Agent.
pub fn validate_stage(
    request: &OperationRequest,
    stage_root: &Path,
) -> Result<serde_json::Value, ExecuteError> {
    let mut args = request.arguments.clone();
    args["project_root"] = json!(stage_root.to_string_lossy());
    let stage_request = OperationRequest {
        request_id: format!("{}-stage", request.request_id),
        provider_id: request.provider_id.clone(),
        operation_id: "project.validate".to_string(),
        project_root: Some(stage_root.to_path_buf()),
        arguments: args,
        timeout_ms: request.timeout_ms,
        dry_run: false,
        plan_id: None,
        effect_digest: None,
    };
    let result = project_validate(&stage_request)?;
    let modular_checks = result.output["modular"]["checks"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let has_bloat = modular_checks
        .iter()
        .any(|check| check["name"] == "single_file_bloat" && check["valid"] == false);
    Ok(json!({
        "valid": result.success && result.output["valid"] == true && !has_bloat,
        "result": result.output,
        "blocked_by_file_bloat": has_bloat,
    }))
}

/// Commit staged files and restore the snapshot automatically if any copy
/// fails. Existing project files not touched by the plan are preserved.
pub fn commit_stage(stage: &StagedProject, snapshot: &Path) -> Result<(), ExecuteError> {
    let root = &stage.source_root;
    let mut files = Vec::new();
    collect_files(&stage.root, &stage.root, &mut files)?;
    for rel in files {
        let source = stage.root.join(&rel);
        let target = root.join(&rel);
        if let Err(error) = copy_atomic(&source, &target) {
            restore_snapshot(root, snapshot).map_err(|restore_error| {
                ExecuteError::ExternalToolFailed(format!(
                    "refactor commit failed: {error}; automatic restore failed: {restore_error}"
                ))
            })?;
            return Err(ExecuteError::ExternalToolFailed(format!(
                "refactor commit failed; project restored: {error}"
            )));
        }
    }
    Ok(())
}

/// Return a deterministic fingerprint for the mutable project state.
pub fn project_fingerprint(root: &Path) -> Result<String, ExecuteError> {
    let mut files = Vec::new();
    for sub in ["scripts", "scenes", "assets", ".project"] {
        let path = root.join(sub);
        if path.exists() {
            collect_files(root, &path, &mut files)?;
        }
    }
    if root.join("AGENTS.md").exists() {
        files.push(PathBuf::from("AGENTS.md"));
    }
    files.sort();
    let mut hasher = DefaultHasher::new();
    for rel in files {
        if rel.starts_with("backups") || rel.starts_with(".project/backups") {
            continue;
        }
        rel.hash(&mut hasher);
        std::fs::read(root.join(&rel))
            .map_err(ExecuteError::Io)?
            .hash(&mut hasher);
    }
    Ok(format!("{:016x}", hasher.finish()))
}

fn restore_snapshot(root: &Path, snapshot: &Path) -> Result<(), std::io::Error> {
    for sub in ["scripts", "scenes", "assets"] {
        let target = root.join(sub);
        if target.exists() {
            std::fs::remove_dir_all(&target)?;
        }
        let source = snapshot.join(sub);
        if source.exists() {
            copy_tree(&source, &target)?;
        }
    }
    let project = root.join(".project");
    if project.exists() {
        for entry in std::fs::read_dir(&project)? {
            let path = entry?.path();
            if path.file_name().and_then(|n| n.to_str()) == Some("backups") {
                continue;
            }
            if path.is_dir() {
                std::fs::remove_dir_all(path)?;
            } else {
                std::fs::remove_file(path)?;
            }
        }
    }
    if snapshot.join(".project").exists() {
        copy_tree_excluding(&snapshot.join(".project"), &project, &backups_root(root))?;
    }
    let agents = root.join("AGENTS.md");
    if agents.exists() {
        std::fs::remove_file(&agents)?;
    }
    if snapshot.join("AGENTS.md").exists() {
        std::fs::copy(snapshot.join("AGENTS.md"), agents)?;
    }
    Ok(())
}

fn copy_atomic(source: &Path, target: &Path) -> Result<(), ExecuteError> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    let temp = target.with_extension("kaying-tmp");
    std::fs::copy(source, &temp).map_err(ExecuteError::Io)?;
    std::fs::rename(&temp, target).map_err(ExecuteError::Io)
}

pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), ExecuteError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    let temp = path.with_extension("kaying-tmp");
    std::fs::write(&temp, bytes).map_err(ExecuteError::Io)?;
    std::fs::rename(&temp, path).map_err(ExecuteError::Io)
}

fn collect_files(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> Result<(), ExecuteError> {
    for entry in std::fs::read_dir(current).map_err(ExecuteError::Io)? {
        let path = entry.map_err(ExecuteError::Io)?.path();
        if path.is_dir() {
            if path.file_name().and_then(|n| n.to_str()) == Some("backups") {
                continue;
            }
            collect_files(root, &path, out)?;
        } else {
            out.push(path.strip_prefix(root).unwrap_or(&path).to_path_buf());
        }
    }
    Ok(())
}

fn copy_tree(source: &Path, target: &Path) -> Result<(), std::io::Error> {
    copy_tree_excluding(source, target, Path::new("__no_exclude__"))
}

fn copy_tree_excluding(source: &Path, target: &Path, exclude: &Path) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let path = entry?.path();
        let target_path = target.join(path.file_name().unwrap_or_default());
        if path == exclude {
            continue;
        }
        if path.is_dir() {
            copy_tree_excluding(&path, &target_path, exclude)?;
        } else {
            std::fs::copy(&path, &target_path)?;
        }
    }
    Ok(())
}

fn count_tree(root: &Path, files: &mut u64, bytes: &mut u64) -> Result<(), ExecuteError> {
    if !root.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(root).map_err(ExecuteError::Io)? {
        let path = entry.map_err(ExecuteError::Io)?.path();
        if path.is_dir() {
            count_tree(&path, files, bytes)?;
        } else {
            *files += 1;
            *bytes += std::fs::metadata(path).map_err(ExecuteError::Io)?.len();
        }
    }
    Ok(())
}

fn detect_structure(root: &Path) -> String {
    let path = root.join(".project/project.json");
    let Ok(body) = std::fs::read_to_string(path) else {
        return "legacy".to_string();
    };
    let raw = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| {
            v.get("structure")
                .and_then(|s| s.as_str())
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| "legacy".to_string());
    if raw == "modular" || raw.starts_with("modular-") {
        "modular".to_string()
    } else {
        raw
    }
}
