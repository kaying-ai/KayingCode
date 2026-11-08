//! Metadata-only handling for projects that already use the modular contract.

use crate::model::{ExecuteError, OperationRequest, OperationResult};
use serde_json::{Value, json};
use std::path::Path;

use super::helpers::{fail_result, ok_result};
use super::project::is_modular_structure;
use super::refactor_transaction::{
    cleanup_stage, commit_stage, create_stage, project_fingerprint, snapshot_project,
    validate_stage, write_atomic,
};

pub(crate) fn detect_raw_structure(root: &Path) -> String {
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

pub(crate) fn canonical_structure(raw_structure: &str) -> String {
    if is_modular_structure(raw_structure) {
        "modular".to_string()
    } else {
        raw_structure.to_string()
    }
}

/// Normalize a suffixed modular marker without rebuilding an already modular
/// project. This path is deliberately metadata-only: it never scans legacy
/// files and never generates a replacement tree.
pub(crate) fn normalize_modular_metadata(
    request: &OperationRequest,
    root: &Path,
    source_fingerprint: &str,
    dry_run: bool,
) -> Result<OperationResult, ExecuteError> {
    let project_json = ".project/project.json";
    if dry_run {
        return Ok(ok_result(
            request,
            json!({
                "refactored": false,
                "dry_run": true,
                "metadata_only": true,
                "reason": "modular_metadata_normalization_required",
                "project_root": root.to_string_lossy(),
                "structure_before": "modular",
                "structure_after": "modular",
                "structure_alias_normalized": true,
                "diff": [{
                    "file": project_json,
                    "action": "update",
                    "before_structure": "modular",
                    "after_structure": "modular"
                }],
                "written_files": [],
                "next_step": "Prepare again without dry_run=true and execute that new plan to normalize project metadata. Never execute this dry-run plan."
            }),
            0,
        ));
    }

    let stage = create_stage(root)?;
    let result = (|| -> Result<OperationResult, ExecuteError> {
        let path = stage.root.join(project_json);
        let body = std::fs::read_to_string(&path).map_err(ExecuteError::Io)?;
        let mut value: Value = serde_json::from_str(&body).map_err(|error| {
            ExecuteError::ExternalToolFailed(format!("Invalid .project/project.json: {error}"))
        })?;
        if let Value::Object(ref mut map) = value {
            map.insert(
                "structure".to_string(),
                Value::String("modular".to_string()),
            );
        } else {
            return Err(ExecuteError::ExternalToolFailed(
                ".project/project.json must contain a JSON object".to_string(),
            ));
        }
        let normalized = serde_json::to_string_pretty(&value).map_err(|error| {
            ExecuteError::ExternalToolFailed(format!(
                "Failed to serialize project metadata: {error}"
            ))
        })?;
        write_atomic(&path, normalized.as_bytes())?;

        let validation = validate_stage(request, &stage.root)?;
        if validation["valid"] != true {
            return Ok(fail_result(
                request,
                json!({
                    "refactored": false,
                    "dry_run": false,
                    "metadata_only": true,
                    "reason": "staged_validation_failed",
                    "project_root": root.to_string_lossy(),
                    "structure_before": "modular",
                    "structure_after": "modular",
                    "structure_alias_normalized": true,
                    "validation": validation["result"].clone(),
                    "written_files": []
                }),
                1,
            ));
        }
        if project_fingerprint(root)? != source_fingerprint {
            return Err(ExecuteError::PlanInvalid(
                "Project changed while metadata normalization was being prepared".to_string(),
            ));
        }
        let (backup_id, backup_path) = snapshot_project(root, "project_structure_normalization")?;
        commit_stage(&stage, &backup_path)?;
        Ok(ok_result(
            request,
            json!({
                "refactored": true,
                "dry_run": false,
                "metadata_only": true,
                "reason": "modular_metadata_normalized",
                "project_root": root.to_string_lossy(),
                "structure_before": "modular",
                "structure_after": "modular",
                "structure_alias_normalized": true,
                "backup": {
                    "backup_id": backup_id,
                    "path": backup_path.to_string_lossy()
                },
                "written_files": [project_json],
                "validation": validation["result"].clone(),
                "next_step": "Run project.validate after continuing the code refactor."
            }),
            0,
        ))
    })();
    cleanup_stage(&stage);
    result
}
