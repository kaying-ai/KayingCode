//! `project.backup` / `project.list_backups` / `project.refactor_rollback`
//! — full-project snapshot, listing, and restore for safe refactor flows.
//!
//! Backups live under `<root>/.project/backups/<id>/` and capture `scripts/`,
//! `scenes/`, `assets/`, and `.project/` (excluding `backups/` itself). Each
//! backup carries a `backup.json` metadata file written via
//! [`refactor_backup_meta`].

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use chrono::Utc;
use serde_json::{Value, json};
use std::path::Path;
use tracing::info;

use super::helpers::{get_project_root, ok_result};
use super::refactor_backup_meta::{
    BackupMetadata, DEFAULT_MAX_BACKUPS, backup_dir, backups_root, list_backups_sorted,
    prune_old_backups, write_backup_meta,
};

// ============================================================
// project.backup
// ============================================================

/// Handle `project.backup` — snapshot the project's mutable directories to
/// `.project/backups/<id>/`.
///
/// Arguments:
/// - `project_root` (required)
/// - `reason` (optional, default `"manual"`): free-form label.
/// - `note` (optional): extra context stored in `backup.json`.
/// - `backup_assets` (optional, default `true`): include `assets/` in the
///   snapshot. Set to `false` for large projects where assets are managed
///   externally.
/// - `max_backups` (optional, default `10`): retain newest N backups, prune
///   older entries automatically.
pub fn project_backup(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let reason = request
        .arguments
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("manual")
        .to_string();
    let note = request
        .arguments
        .get("note")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let backup_assets = request
        .arguments
        .get("backup_assets")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let max_backups = request
        .arguments
        .get("max_backups")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_MAX_BACKUPS);

    let structure_before = detect_structure(&root);
    let backup_id = generate_backup_id();
    let target = backup_dir(&root, &backup_id);
    std::fs::create_dir_all(&target).map_err(ExecuteError::Io)?;

    let mut file_count: u64 = 0;
    let mut total_bytes: u64 = 0;

    // Copy each tracked subtree, skipping the backups directory itself.
    for sub in ["scripts", "scenes", ".project"] {
        let src = root.join(sub);
        if !src.exists() {
            continue;
        }
        let dst = target.join(sub);
        copy_tree_excluding(
            &src,
            &dst,
            &backups_root(&root),
            &mut file_count,
            &mut total_bytes,
        )?;
    }

    if backup_assets {
        let assets = root.join("assets");
        if assets.exists() {
            copy_tree(
                &assets,
                &target.join("assets"),
                &mut file_count,
                &mut total_bytes,
            )?;
        }
    }

    let mut meta = BackupMetadata::new(backup_id.clone(), reason.clone(), structure_before);
    meta.file_count = file_count;
    meta.total_bytes = total_bytes;
    meta.note = note;
    write_backup_meta(&target, &meta).map_err(ExecuteError::Io)?;

    // Prune older backups beyond the retention window.
    let pruned = prune_old_backups(&root, max_backups);
    if !pruned.is_empty() {
        info!(pruned = ?pruned, "Pruned old backups");
    }

    info!(
        project = %root.to_string_lossy(),
        backup_id = %backup_id,
        file_count,
        total_bytes,
        "Project backup created"
    );

    Ok(ok_result(
        request,
        json!({
            "backed_up": true,
            "backup_id": backup_id,
            "backup_path": target.to_string_lossy(),
            "file_count": file_count,
            "total_bytes": total_bytes,
            "structure_before": meta.structure_before,
            "reason": reason,
            "pruned_older": pruned,
        }),
        0,
    ))
}

/// Prepare stub for `project.backup`.
pub fn prepare_project_backup(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;
    let plan_id = format!("project-backup-plan-{}", std::process::id());
    let now = Utc::now();
    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects: vec![Effect::ReadProject, Effect::WriteProject],
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: "project-backup-effects".to_string(),
    })
}

// ============================================================
// project.list_backups
// ============================================================

/// Handle `project.list_backups` — enumerate backups newest-first.
pub fn project_list_backups(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let entries = list_backups_sorted(&root);
    let payload: Vec<Value> = entries.iter().map(|(_, meta)| meta.to_value()).collect();

    Ok(ok_result(
        request,
        json!({
            "backups": payload,
            "count": payload.len(),
            "backups_root": backups_root(&root).to_string_lossy(),
        }),
        0,
    ))
}

/// Prepare stub for `project.list_backups`.
pub fn prepare_project_list_backups(
    request: &OperationRequest,
) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;
    let plan_id = format!("project-list-backups-plan-{}", std::process::id());
    let now = Utc::now();
    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects: vec![Effect::ReadProject],
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: "project-list-backups-effects".to_string(),
    })
}

// ============================================================
// project.refactor_rollback
// ============================================================

/// Handle `project.refactor_rollback` — restore a previous backup.
///
/// Arguments:
/// - `project_root` (required)
/// - `backup_id` (optional, default newest): id of the backup to restore.
/// - `snapshot_before` (optional, default `true`): capture the current state
///   into a new backup before restoring, so the rollback itself is reversible.
pub fn project_refactor_rollback(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let snapshot_before = request
        .arguments
        .get("snapshot_before")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let requested_id = request
        .arguments
        .get("backup_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let entries = list_backups_sorted(&root);
    if entries.is_empty() {
        return Ok(ok_result(
            request,
            json!({
                "restored": false,
                "reason": "no_backups_available",
                "project_root": root.to_string_lossy(),
            }),
            0,
        ));
    }

    // Resolve target backup. If `backup_id` is supplied, look it up; otherwise
    // pick the newest entry.
    let (target_dir, target_meta) = match &requested_id {
        Some(id) => entries
            .iter()
            .find(|(_, m)| m.id == *id)
            .map(|(p, m)| (p.clone(), m.clone()))
            .ok_or_else(|| {
                ExecuteError::ExternalToolFailed(format!("Backup id not found: {id}"))
            })?,
        None => {
            let (p, m) = &entries[0];
            (p.clone(), m.clone())
        }
    };

    // Optional pre-rollback snapshot so the rollback itself is reversible.
    let mut snapshot_id: Option<String> = None;
    if snapshot_before {
        let snapshot_backup_id = generate_backup_id();
        let snapshot_target = backup_dir(&root, &snapshot_backup_id);
        std::fs::create_dir_all(&snapshot_target).map_err(ExecuteError::Io)?;
        let mut file_count: u64 = 0;
        let mut total_bytes: u64 = 0;
        for sub in ["scripts", "scenes", ".project"] {
            let src = root.join(sub);
            if !src.exists() {
                continue;
            }
            copy_tree_excluding(
                &src,
                &snapshot_target.join(sub),
                &backups_root(&root),
                &mut file_count,
                &mut total_bytes,
            )?;
        }
        let assets = root.join("assets");
        if assets.exists() {
            copy_tree(
                &assets,
                &snapshot_target.join("assets"),
                &mut file_count,
                &mut total_bytes,
            )?;
        }
        let mut meta = BackupMetadata::new(
            snapshot_backup_id.clone(),
            "pre-rollback-snapshot".to_string(),
            detect_structure(&root),
        );
        meta.file_count = file_count;
        meta.total_bytes = total_bytes;
        write_backup_meta(&snapshot_target, &meta).map_err(ExecuteError::Io)?;
        snapshot_id = Some(snapshot_backup_id);
    }

    // Restore: wipe current scripts/scenes/assets/.project (excluding backups),
    // then copy from the target backup.
    let backups_root_path = backups_root(&root);
    for sub in ["scripts", "scenes", "assets"] {
        let dst = root.join(sub);
        if dst.exists() {
            std::fs::remove_dir_all(&dst).map_err(ExecuteError::Io)?;
        }
        let src = target_dir.join(sub);
        if src.exists() {
            copy_tree(&src, &dst, &mut 0, &mut 0)?;
        }
    }
    // Restore .project/ contents except the backups/ directory itself.
    let project_dir = root.join(".project");
    if project_dir.exists() {
        for entry in std::fs::read_dir(&project_dir).map_err(ExecuteError::Io)? {
            let entry = entry.map_err(ExecuteError::Io)?;
            let path = entry.path();
            if path == backups_root_path {
                continue;
            }
            if path.is_dir() {
                std::fs::remove_dir_all(&path).map_err(ExecuteError::Io)?;
            } else {
                std::fs::remove_file(&path).map_err(ExecuteError::Io)?;
            }
        }
    }
    let src_project = target_dir.join(".project");
    if src_project.exists() {
        copy_tree_excluding(
            &src_project,
            &project_dir,
            &backups_root_path,
            &mut 0,
            &mut 0,
        )?;
    }

    info!(
        project = %root.to_string_lossy(),
        backup_id = %target_meta.id,
        snapshot_id = ?snapshot_id,
        "Project rolled back from backup"
    );

    Ok(ok_result(
        request,
        json!({
            "restored": true,
            "backup_id": target_meta.id,
            "restored_from": target_dir.to_string_lossy(),
            "structure_before": target_meta.structure_before,
            "snapshot_before": snapshot_id,
            "reason": target_meta.reason,
        }),
        0,
    ))
}

/// Prepare stub for `project.refactor_rollback`.
pub fn prepare_project_refactor_rollback(
    request: &OperationRequest,
) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;
    let plan_id = format!("project-refactor-rollback-plan-{}", std::process::id());
    let now = Utc::now();
    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects: vec![Effect::ReadProject, Effect::WriteProject],
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(10)).to_rfc3339(),
        effect_digest: "project-refactor-rollback-effects".to_string(),
    })
}

// ============================================================
// Internal helpers
// ============================================================

/// Generate a backup id from the current UTC timestamp (`YYYYMMDD-HHMMSS-NNN`).
///
/// The millisecond suffix avoids collisions when multiple backups are created
/// within the same second (common in automated workflows).
fn generate_backup_id() -> String {
    let now = Utc::now();
    format!(
        "{}-{:03}",
        now.format("%Y%m%d-%H%M%S"),
        now.timestamp_millis() % 1000
    )
}

/// Detect the project's `structure` field from `.project/project.json`.
/// Returns `"legacy"` if the field is missing or the file is absent.
fn detect_structure(root: &Path) -> String {
    let path = root.join(".project").join("project.json");
    let Ok(body) = std::fs::read_to_string(&path) else {
        return "legacy".to_string();
    };
    let Ok(value): Result<Value, _> = serde_json::from_str(&body) else {
        return "legacy".to_string();
    };
    value
        .get("structure")
        .and_then(|v| v.as_str())
        .unwrap_or("legacy")
        .to_string()
}

/// Recursively copy a directory tree, counting files and bytes.
fn copy_tree(
    src: &Path,
    dst: &Path,
    file_count: &mut u64,
    total_bytes: &mut u64,
) -> Result<(), ExecuteError> {
    std::fs::create_dir_all(dst).map_err(ExecuteError::Io)?;
    for entry in std::fs::read_dir(src).map_err(ExecuteError::Io)? {
        let entry = entry.map_err(ExecuteError::Io)?;
        let path = entry.path();
        let name = entry.file_name();
        let dst_entry = dst.join(&name);
        if path.is_dir() {
            copy_tree(&path, &dst_entry, file_count, total_bytes)?;
        } else {
            let metadata = std::fs::metadata(&path).map_err(ExecuteError::Io)?;
            *total_bytes += metadata.len();
            *file_count += 1;
            std::fs::copy(&path, &dst_entry).map_err(ExecuteError::Io)?;
        }
    }
    Ok(())
}

/// Copy a directory tree while skipping any subdirectory matching `exclude`.
fn copy_tree_excluding(
    src: &Path,
    dst: &Path,
    exclude: &Path,
    file_count: &mut u64,
    total_bytes: &mut u64,
) -> Result<(), ExecuteError> {
    std::fs::create_dir_all(dst).map_err(ExecuteError::Io)?;
    for entry in std::fs::read_dir(src).map_err(ExecuteError::Io)? {
        let entry = entry.map_err(ExecuteError::Io)?;
        let path = entry.path();
        let name = entry.file_name();
        let dst_entry = dst.join(&name);
        if path.is_dir() {
            if path == *exclude {
                continue;
            }
            copy_tree_excluding(&path, &dst_entry, exclude, file_count, total_bytes)?;
        } else {
            let metadata = std::fs::metadata(&path).map_err(ExecuteError::Io)?;
            *total_bytes += metadata.len();
            *file_count += 1;
            std::fs::copy(&path, &dst_entry).map_err(ExecuteError::Io)?;
        }
    }
    Ok(())
}
