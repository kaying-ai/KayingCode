//! TapTap world operations — tilemaps, terrain, navigation, bounds.
//!
//! Tilemap/terrain data live under `assets/tilemaps/` and `assets/terrain/`.
//! Tilesets are copied to `assets/textures/tilesets/`. Navigation areas are
//! recorded as scene components via `.project/navigation-areas.json`.

use crate::model::{
    Effect, ExecuteError, OperationPlan, OperationRequest, OperationResult, PrepareError,
};
use crate::taptap::operations::helpers::{
    fail_result, get_project_root, make_plan, ok_result, read_json_file_opt, required_str_arg,
    str_arg, write_json_file,
};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicU64;
use std::time::Instant;
use tracing::info;

static PLAN_COUNTER: AtomicU64 = AtomicU64::new(0);

fn tilemaps_dir(root: &Path) -> PathBuf {
    root.join("assets").join("tilemaps")
}

fn terrain_dir(root: &Path) -> PathBuf {
    root.join("assets").join("terrain")
}

fn tilesets_dir(root: &Path) -> PathBuf {
    root.join("assets").join("textures").join("tilesets")
}

fn nav_areas_path(root: &Path) -> PathBuf {
    root.join(".project").join("navigation-areas.json")
}

fn ensure_parent(path: &Path) -> Result<(), ExecuteError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    Ok(())
}

// ============================================================
// Tilemaps
// ============================================================

/// Handle `world.create_tilemap` — write `assets/tilemaps/<name>.tilemap.json`.
pub fn world_create_tilemap(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let width = request
        .arguments
        .get("width")
        .and_then(|v| v.as_u64())
        .unwrap_or(32) as usize;
    let height = request
        .arguments
        .get("height")
        .and_then(|v| v.as_u64())
        .unwrap_or(32) as usize;
    let tile_size = request
        .arguments
        .get("tile_size")
        .and_then(|v| v.as_u64())
        .unwrap_or(16);
    let path = tilemaps_dir(&root).join(format!("{name}.tilemap.json"));
    if path.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Tilemap '{name}' already exists")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    let cells = vec![0u64; width * height];
    let tilemap = json!({
        "name": name,
        "width": width,
        "height": height,
        "tile_size": tile_size,
        "cells": cells,
        "tileset": null,
    });
    ensure_parent(&path)?;
    write_json_file(&path, &tilemap).map_err(ExecuteError::Io)?;
    info!(name = %name, w = width, h = height, "Tilemap created");
    Ok(ok_result(
        request,
        json!({"created": true, "name": name, "width": width, "height": height, "tile_size": tile_size, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Resolve a tilemap file path (defaults to assets/tilemaps/<name>.tilemap.json).
fn resolve_tilemap(root: &Path, request: &OperationRequest) -> Result<PathBuf, ExecuteError> {
    let name = required_str_arg(request, "name")?;
    Ok(tilemaps_dir(root).join(format!("{name}.tilemap.json")))
}

/// Handle `world.set_tile` — set a single tile cell.
pub fn world_set_tile(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let path = resolve_tilemap(&root, request)?;
    let x = request
        .arguments
        .get("x")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let y = request
        .arguments
        .get("y")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let value = request
        .arguments
        .get("value")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let Some(mut tilemap) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": "Tilemap not found", "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let width = tilemap.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let height = tilemap.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    if x >= width || y >= height {
        return Ok(fail_result(
            request,
            json!({"error": format!("Tile ({x},{y}) out of bounds ({width}x{height})")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    if let Some(cells) = tilemap.get_mut("cells").and_then(|v| v.as_array_mut()) {
        let idx = y * width + x;
        if idx < cells.len() {
            cells[idx] = json!(value);
        }
    }
    write_json_file(&path, &tilemap).map_err(ExecuteError::Io)?;
    info!(x, y, value, "Tile set");
    Ok(ok_result(
        request,
        json!({"set": true, "x": x, "y": y, "value": value, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `world.paint_tiles` — batch-set tiles in a rectangular region.
pub fn world_paint_tiles(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let path = resolve_tilemap(&root, request)?;
    let x0 = request
        .arguments
        .get("x0")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let y0 = request
        .arguments
        .get("y0")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let x1 = request
        .arguments
        .get("x1")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let y1 = request
        .arguments
        .get("y1")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let value = request
        .arguments
        .get("value")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let Some(mut tilemap) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": "Tilemap not found"}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let width = tilemap.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let mut painted = 0u64;
    if let Some(cells) = tilemap.get_mut("cells").and_then(|v| v.as_array_mut()) {
        for y in y0..=y1.min(width.max(1) - 1) {
            for x in x0..=x1.min(width.max(1) - 1) {
                let idx = y * width + x;
                if idx < cells.len() {
                    cells[idx] = json!(value);
                    painted += 1;
                }
            }
        }
    }
    write_json_file(&path, &tilemap).map_err(ExecuteError::Io)?;
    info!(painted, "Tiles painted");
    Ok(ok_result(
        request,
        json!({"painted": painted, "region": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}, "value": value, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `world.erase_tiles` — clear a rectangular region (set to 0).
pub fn world_erase_tiles(
    request: &OperationRequest,
    plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let mut result = world_paint_tiles(request, plan)?;
    if let Some(obj) = result.output.as_object_mut() {
        obj.insert("erased".to_string(), json!(true));
        obj.remove("painted");
    }
    Ok(result)
}

/// Handle `world.import_tileset` — copy image + write tileset config.
pub fn world_import_tileset(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let source = required_str_arg(request, "source")?;
    let name = required_str_arg(request, "name")?;
    let tile_size = request
        .arguments
        .get("tile_size")
        .and_then(|v| v.as_u64())
        .unwrap_or(16);

    let src = PathBuf::from(&source);
    if !src.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Source image not found: {source}")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    let target_dir = tilesets_dir(&root);
    std::fs::create_dir_all(&target_dir).map_err(ExecuteError::Io)?;
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let target_img = target_dir.join(format!("{name}.{ext}"));
    std::fs::copy(&src, &target_img).map_err(ExecuteError::Io)?;
    let config = json!({
        "name": name,
        "image": target_img.to_string_lossy(),
        "tile_size": tile_size,
        "columns": null,
        "rows": null,
    });
    let config_path = tilesets_dir(&root).join(format!("{name}.tileset.json"));
    write_json_file(&config_path, &config).map_err(ExecuteError::Io)?;
    info!(name = %name, "Tileset imported");
    Ok(ok_result(
        request,
        json!({"imported": true, "name": name, "image": target_img.to_string_lossy(), "config": config_path.to_string_lossy(), "tile_size": tile_size, "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Terrain
// ============================================================

/// Handle `world.create_terrain` — write `assets/terrain/<name>.terrain.json`.
pub fn world_create_terrain(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let width = request
        .arguments
        .get("width")
        .and_then(|v| v.as_u64())
        .unwrap_or(256);
    let height = request
        .arguments
        .get("height")
        .and_then(|v| v.as_u64())
        .unwrap_or(256);
    let heightmap_ref = str_arg(request, "heightmap", "heightmaps/default.png");
    let path = terrain_dir(&root).join(format!("{name}.terrain.json"));
    if path.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Terrain '{name}' already exists")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    let terrain = json!({
        "name": name,
        "width": width,
        "height": height,
        "heightmap": heightmap_ref,
        "splatmap": null,
        "layers": [],
    });
    ensure_parent(&path)?;
    write_json_file(&path, &terrain).map_err(ExecuteError::Io)?;
    info!(name = %name, "Terrain created");
    Ok(ok_result(
        request,
        json!({"created": true, "name": name, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `world.set_terrain_height` — append a height-edit entry to terrain.
pub fn world_set_terrain_height(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let path = terrain_dir(&root).join(format!("{name}.terrain.json"));
    let Some(mut terrain) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Terrain '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let x = request
        .arguments
        .get("x")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let y = request
        .arguments
        .get("y")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let height = request
        .arguments
        .get("height")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let edits = terrain.as_object_mut().and_then(|o| {
        o.entry("height_edits")
            .or_insert_with(|| json!([]))
            .as_array_mut()
    });
    if let Some(edits) = edits {
        edits.push(json!({"x": x, "y": y, "height": height}));
    }
    write_json_file(&path, &terrain).map_err(ExecuteError::Io)?;
    info!(name = %name, x, y, height, "Terrain height set");
    Ok(ok_result(
        request,
        json!({"set": true, "name": name, "x": x, "y": y, "height": height, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `world.paint_terrain_layer` — append a layer entry to terrain.
pub fn world_paint_terrain_layer(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let layer = required_str_arg(request, "layer")?;
    let path = terrain_dir(&root).join(format!("{name}.terrain.json"));
    let Some(mut terrain) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Terrain '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let texture = str_arg(request, "texture", "");
    let layer_entry = json!({"name": layer, "texture": texture});
    let layers = terrain.as_object_mut().and_then(|o| {
        o.entry("layers")
            .or_insert_with(|| json!([]))
            .as_array_mut()
    });
    if let Some(layers) = layers {
        layers.push(layer_entry.clone());
    }
    write_json_file(&path, &terrain).map_err(ExecuteError::Io)?;
    info!(name = %name, layer = %layer, "Terrain layer painted");
    Ok(ok_result(
        request,
        json!({"painted": true, "name": name, "layer": layer_entry, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Navigation
// ============================================================

/// Handle `world.create_nav_area` — append to `.project/navigation-areas.json`.
pub fn world_create_nav_area(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let bounds = request
        .arguments
        .get("bounds")
        .cloned()
        .unwrap_or(json!({}));
    let path = nav_areas_path(&root);
    let mut nav = read_json_file_opt(&path)
        .map_err(ExecuteError::Io)?
        .unwrap_or(json!({"areas": []}));
    let areas = nav
        .as_object_mut()
        .and_then(|o| o.entry("areas").or_insert_with(|| json!([])).as_array_mut());
    let mut added = false;
    if let Some(areas) = areas {
        let exists = areas
            .iter()
            .any(|a| a.get("name").and_then(|v| v.as_str()) == Some(&name));
        if !exists {
            areas.push(json!({"name": name, "bounds": bounds}));
            added = true;
        }
    }
    write_json_file(&path, &nav).map_err(ExecuteError::Io)?;
    info!(name = %name, added, "Nav area created");
    Ok(ok_result(
        request,
        json!({"added": added, "name": name, "bounds": bounds, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `world.inspect_bounds` — read scene node bounds.
pub fn world_inspect_bounds(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let scene_path = required_str_arg(request, "scene_path")?;
    let node_id = required_str_arg(request, "node_id")?;
    let full = root.join(&scene_path);
    if !full.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Scene not found: {scene_path}")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    let content = std::fs::read_to_string(&full).map_err(ExecuteError::Io)?;
    // Best-effort heuristic: look for a node with this id and report its position.
    let bounds = extract_node_bounds(&content, &node_id);
    info!(node_id = %node_id, "Bounds inspected");
    Ok(ok_result(
        request,
        json!({"node_id": node_id, "bounds": bounds, "scene_path": scene_path, "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Extract a node's position/bounds from scene XML by id (best-effort).
fn extract_node_bounds(content: &str, node_id: &str) -> serde_json::Value {
    // Look for `id="node_id"` then capture position attributes.
    if let Some(idx) = content.find(&format!("id=\"{node_id}\"")) {
        // Take a window starting from the id match to the end of the tag.
        let window = &content[idx..];
        let end = window.find('>').unwrap_or(window.len());
        let tag = &window[..end];
        let pos = extract_attr(tag, "position");
        let scale = extract_attr(tag, "scale");
        let rotation = extract_attr(tag, "rotation");
        return json!({"position": pos, "scale": scale, "rotation": rotation});
    }
    json!({"found": false})
}

fn extract_attr(tag: &str, name: &str) -> Option<String> {
    let key = format!("{name}=\"");
    let start = tag.find(&key)? + key.len();
    let rest = &tag[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

// ============================================================
// Prepare
// ============================================================

/// Prepare a world operation.
pub fn prepare_world(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let effects = match request.operation_id.as_str() {
        "world.inspect_bounds" => vec![Effect::ReadProject],
        _ => vec![Effect::ReadProject, Effect::WriteProject],
    };
    make_plan(request, &PLAN_COUNTER, effects, "world-effects")
}
