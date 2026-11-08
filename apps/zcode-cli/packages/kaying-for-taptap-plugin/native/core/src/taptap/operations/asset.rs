//! TapTap asset operations — list, import, create_folder, delete, rename, create.
//! All operations operate on the `assets/` directory of a TapTap project.

use crate::model::{ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Handle `asset.list` — list all assets under assets/.
pub fn asset_list(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let assets_dir = root.join("assets");

    if !assets_dir.is_dir() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": "assets/ directory does not exist",
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    let mut entries: Vec<serde_json::Value> = Vec::new();
    collect_entries(&assets_dir, &assets_dir, &mut entries)
        .map_err(|e| ExecuteError::ExternalToolFailed(format!("Failed to list assets: {e}")))?;
    info!(
        project_root = %root.to_string_lossy(),
        count = entries.len(),
        "Asset list retrieved"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "assets": entries,
            "count": entries.len(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Recursively collect entries from the assets directory.
fn collect_entries(
    base_dir: &Path,
    dir: &Path,
    entries: &mut Vec<serde_json::Value>,
) -> Result<(), std::io::Error> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;
        let relative = path
            .strip_prefix(base_dir)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        let file_type = if metadata.is_dir() {
            "directory"
        } else if metadata.is_symlink() {
            "symlink"
        } else {
            "file"
        };

        let last_modified = metadata.modified().ok().and_then(|t| {
            let duration = t.duration_since(std::time::UNIX_EPOCH).ok()?;
            Some(duration.as_secs())
        });

        entries.push(json!({
            "name": relative,
            "type": file_type,
            "size": metadata.len(),
            "last_modified": last_modified
        }));

        if metadata.is_dir() {
            collect_entries(base_dir, &path, entries)?;
        }
    }

    Ok(())
}

/// Handle `asset.import` — import/copy a file into the assets/ directory.
pub fn asset_import(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let assets_dir = root.join("assets");

    let source_path = request
        .arguments
        .get("source_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing source_path argument".to_string()))?;

    let target_path = request
        .arguments
        .get("target_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing target_path argument".to_string()))?;

    let source = Path::new(source_path);
    if !source.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Source file does not exist: {source_path}"),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    let target = assets_dir.join(target_path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| ExecuteError::Io(e))?;
    }

    std::fs::copy(source, &target).map_err(|e| ExecuteError::Io(e))?;

    info!(
        project_root = %root.to_string_lossy(),
        source = %source_path,
        target = %target_path,
        "Asset imported"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "imported": true,
            "source": source_path,
            "target": target_path,
            "absolute_path": target.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `asset.create_folder` — create a subfolder under assets/.
pub fn asset_create_folder(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let assets_dir = root.join("assets");

    let folder_path = request
        .arguments
        .get("folder_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing folder_path argument".to_string()))?;

    let target = assets_dir.join(folder_path);
    if target.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Folder already exists: {folder_path}"),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    std::fs::create_dir_all(&target).map_err(|e| ExecuteError::Io(e))?;

    info!(
        project_root = %root.to_string_lossy(),
        folder = %folder_path,
        "Asset folder created"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "created": true,
            "folder": folder_path,
            "absolute_path": target.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `asset.delete` — delete an asset file or folder.
pub fn asset_delete(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let assets_dir = root.join("assets");

    let asset_path = request
        .arguments
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing path argument".to_string()))?;

    let target = assets_dir.join(asset_path);

    if !target.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Asset does not exist: {asset_path}"),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    if target.is_dir() {
        std::fs::remove_dir_all(&target).map_err(|e| ExecuteError::Io(e))?;
    } else {
        std::fs::remove_file(&target).map_err(|e| ExecuteError::Io(e))?;
    }

    info!(
        project_root = %root.to_string_lossy(),
        path = %asset_path,
        "Asset deleted"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "deleted": true,
            "path": asset_path,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `asset.rename` — rename/move an asset.
pub fn asset_rename(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let assets_dir = root.join("assets");

    let source = request
        .arguments
        .get("source")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing source argument".to_string()))?;

    let target = request
        .arguments
        .get("target")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing target argument".to_string()))?;

    let source_path = assets_dir.join(source);
    if !source_path.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Source asset does not exist: {source}"),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    let target_path = assets_dir.join(target);
    if target_path.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Target already exists: {target}"),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| ExecuteError::Io(e))?;
    }

    std::fs::rename(&source_path, &target_path).map_err(|e| ExecuteError::Io(e))?;

    info!(
        project_root = %root.to_string_lossy(),
        source = %source,
        target = %target,
        "Asset renamed"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "renamed": true,
            "source": source,
            "target": target,
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Handle `asset.create` — create a new asset file with optional content.
pub fn asset_create(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let assets_dir = root.join("assets");

    let asset_path = request
        .arguments
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecuteError::NotPrepared("Missing path argument".to_string()))?;

    let content = request
        .arguments
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let target = assets_dir.join(asset_path);

    if target.exists() {
        return Ok(OperationResult {
            request_id: request.request_id.clone(),
            success: false,
            output: json!({
                "error": format!("Asset already exists: {asset_path}"),
                "project_root": root.to_string_lossy()
            }),
            exit_code: Some(1),
            duration_ms: 0,
            log_path: None,
        });
    }

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| ExecuteError::Io(e))?;
    }

    std::fs::write(&target, content).map_err(|e| ExecuteError::Io(e))?;

    info!(
        project_root = %root.to_string_lossy(),
        path = %asset_path,
        size = content.len(),
        "Asset created"
    );

    Ok(OperationResult {
        request_id: request.request_id.clone(),
        success: true,
        output: json!({
            "created": true,
            "path": asset_path,
            "size": content.len(),
            "absolute_path": target.to_string_lossy(),
            "project_root": root.to_string_lossy()
        }),
        exit_code: Some(0),
        duration_ms: 0,
        log_path: None,
    })
}

/// Prepare an asset operation — validate arguments and return a plan.
pub fn prepare_asset(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let _root =
        get_project_root(request).map_err(|e| PrepareError::InvalidArguments(e.to_string()))?;

    let plan_id = format!("plan-{}", PLAN_COUNTER.fetch_add(1, Ordering::SeqCst));
    let now = chrono::Utc::now();

    let effects = match request.operation_id.as_str() {
        "asset.list" => vec![crate::model::Effect::ReadProject],
        "asset.import" | "asset.create" | "asset.rename" => {
            vec![crate::model::Effect::WriteProject]
        }
        "asset.create_folder" => vec![crate::model::Effect::WriteProject],
        "asset.delete" => vec![crate::model::Effect::WriteProject],
        _ => vec![],
    };

    Ok(OperationPlan {
        plan_id,
        normalized_operation: request.operation_id.clone(),
        normalized_arguments: request.arguments.clone(),
        targets: vec![],
        effects,
        project_fingerprint: None,
        expires_at: (now + chrono::Duration::minutes(5)).to_rfc3339(),
        effect_digest: "asset-effects".to_string(),
    })
}

fn get_project_root(request: &OperationRequest) -> Result<Arc<Path>, ExecuteError> {
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

    Ok(Arc::from(path))
}
