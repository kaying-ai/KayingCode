//! Backup metadata helpers for `project.backup` / `project.refactor_rollback`.
//!
//! Provides the `BackupMetadata` struct, serialization, and on-disk listing /
//! pruning utilities. Kept separate from `refactor_backup.rs` to honour the
//! 500-line file-size constraint.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use tracing::debug;

/// Default maximum number of backups to retain per project.
pub const DEFAULT_MAX_BACKUPS: usize = 10;

/// On-disk metadata for a single backup snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    /// Backup id (timestamp string `YYYYMMDD-HHMMSS-NNN`).
    pub id: String,
    /// ISO-8601 timestamp of backup creation.
    pub timestamp: String,
    /// Free-form reason supplied by the caller (e.g. `"project_refactor"`).
    pub reason: String,
    /// Number of files captured in the backup.
    pub file_count: u64,
    /// Total bytes captured in the backup.
    pub total_bytes: u64,
    /// Canonical project `structure` field at backup time (for example
    /// `"modular"` or `"legacy"`).
    pub structure_before: String,
    /// Optional caller-supplied note (e.g. `"pre-v2-migration"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl BackupMetadata {
    /// Build a new metadata block with the given id / reason / structure.
    #[must_use]
    pub fn new(id: String, reason: String, structure_before: String) -> Self {
        let timestamp = Utc::now().to_rfc3339();
        Self {
            id,
            timestamp,
            reason,
            file_count: 0,
            total_bytes: 0,
            structure_before,
            note: None,
        }
    }

    /// Serialise to a `serde_json::Value` for inclusion in operation output.
    #[must_use]
    pub fn to_value(&self) -> Value {
        json!({
            "id": self.id,
            "timestamp": self.timestamp,
            "reason": self.reason,
            "file_count": self.file_count,
            "total_bytes": self.total_bytes,
            "structure_before": self.structure_before,
            "note": self.note,
        })
    }
}

// ============================================================
// Path helpers
// ============================================================

/// Backups root for a project: `<root>/.project/backups/`.
#[must_use]
pub fn backups_root(root: &Path) -> PathBuf {
    root.join(".project").join("backups")
}

/// Backup directory for a given id: `<root>/.project/backups/<id>/`.
#[must_use]
pub fn backup_dir(root: &Path, id: &str) -> PathBuf {
    backups_root(root).join(id)
}

/// Path to the backup's metadata file: `<backup_dir>/backup.json`.
#[must_use]
pub fn backup_meta_path(backup_dir: &Path) -> PathBuf {
    backup_dir.join("backup.json")
}

// ============================================================
// On-disk operations
// ============================================================

/// Write `backup.json` into the given backup directory.
pub fn write_backup_meta(backup_dir: &Path, meta: &BackupMetadata) -> std::io::Result<()> {
    if let Some(parent) = backup_dir.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let body = serde_json::to_string_pretty(meta)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(backup_meta_path(backup_dir), body)
}

/// Load a backup's metadata. Returns `None` if `backup.json` is missing or
/// unparseable (callers should treat as an orphaned backup directory).
pub fn load_backup_meta(backup_dir: &Path) -> Option<BackupMetadata> {
    let path = backup_meta_path(backup_dir);
    let body = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&body).ok()
}

/// List all backups under `<root>/.project/backups/`, sorted newest-first by
/// metadata timestamp (falling back to directory name for orphaned entries).
pub fn list_backups_sorted(root: &Path) -> Vec<(PathBuf, BackupMetadata)> {
    let backups_root = backups_root(root);
    let mut entries: Vec<(PathBuf, BackupMetadata)> = Vec::new();

    let Ok(rd) = std::fs::read_dir(&backups_root) else {
        return Vec::new();
    };

    for entry in rd.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(meta) = load_backup_meta(&path) else {
            // Orphaned backup directory (no metadata). Synthesise a minimal
            // entry from the directory name so callers can still inspect it.
            let Some(file_name) = path.file_name() else {
                continue;
            };
            let id = file_name.to_string_lossy().to_string();
            entries.push((
                path,
                BackupMetadata {
                    id,
                    timestamp: String::new(),
                    reason: "orphaned".to_string(),
                    file_count: 0,
                    total_bytes: 0,
                    structure_before: "unknown".to_string(),
                    note: Some("metadata_missing".to_string()),
                },
            ));
            continue;
        };
        entries.push((path, meta));
    }

    // Sort newest-first by timestamp; orphaned entries sink to the bottom.
    entries.sort_by(|a, b| b.1.timestamp.cmp(&a.1.timestamp));
    entries
}

/// Prune oldest backups beyond `max_backups`. Returns the pruned backup ids
/// (in pruned order, oldest-first). Best-effort: prune failures are logged
/// but do not abort the caller's flow.
pub fn prune_old_backups(root: &Path, max_backups: usize) -> Vec<String> {
    let mut entries = list_backups_sorted(root);
    if entries.len() <= max_backups {
        return Vec::new();
    }

    let prune_count = entries.len() - max_backups;
    let mut pruned = Vec::with_capacity(prune_count);
    // `entries` is newest-first, so the tail holds the oldest.
    for (_, meta) in entries.split_off(max_backups) {
        debug!(backup_id = %meta.id, "Pruning old backup");
        if meta.id == "orphaned" {
            continue;
        }
        let dir = backup_dir(root, &meta.id);
        let _ = std::fs::remove_dir_all(&dir);
        pruned.push(meta.id);
    }
    pruned
}

// ============================================================
// Unit tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_metadata_round_trip() {
        let meta = BackupMetadata::new(
            "20260806-120000".to_string(),
            "project_refactor".to_string(),
            "modular".to_string(),
        );
        let body = serde_json::to_string(&meta).unwrap();
        let back: BackupMetadata = serde_json::from_str(&body).unwrap();
        assert_eq!(back.id, "20260806-120000");
        assert_eq!(back.reason, "project_refactor");
        assert_eq!(back.structure_before, "modular");
        assert!(back.note.is_none());
    }

    #[test]
    fn list_backups_returns_empty_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(list_backups_sorted(tmp.path()).is_empty());
    }

    #[test]
    fn prune_old_backups_keeps_max() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        // Create 5 backups with synthetic metadata.
        for i in 0..5 {
            let id = format!("2026080{i}-120000");
            let dir = backup_dir(root, &id);
            std::fs::create_dir_all(&dir).unwrap();
            let meta = BackupMetadata::new(id.clone(), "test".to_string(), "modular".to_string());
            write_backup_meta(&dir, &meta).unwrap();
        }
        // Keep newest 3.
        let pruned = prune_old_backups(root, 3);
        assert_eq!(pruned.len(), 2);
        assert_eq!(list_backups_sorted(root).len(), 3);
    }
}
