//! `.project/surfaces.json` manifest I/O — Surface 单一事实来源。
//!
//! Provides read/write/query helpers for the Surface manifest, plus a
//! directory-scan fallback.

use serde_json::{Value, json};
use std::fs;
use std::path::Path;

/// Default engine when the manifest does not declare one.
pub const DEFAULT_ENGINE: &str = "taptap";

/// Path to the Surface manifest, relative to the project root.
pub const MANIFEST_PATH: &str = ".project/surfaces.json";

/// Directory containing Surface module folders, relative to project root.
pub const SURFACES_DIR: &str = "scripts/ui/surfaces";

/// Read the manifest, returning an empty default manifest if missing/unreadable.
///
/// Never fails; callers that need strict behavior can check `exists` themselves.
pub fn read_manifest(root: &Path) -> Value {
    let path = root.join(MANIFEST_PATH);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| empty_manifest()),
        Err(_) => empty_manifest(),
    }
}

/// Read the manifest, returning `None` if the file does not exist.
pub fn read_manifest_opt(root: &Path) -> Option<Value> {
    let path = root.join(MANIFEST_PATH);
    if !path.exists() {
        return None;
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
}

/// An empty manifest with no surfaces.
pub fn empty_manifest() -> Value {
    json!({
        "version": 1,
        "engine": DEFAULT_ENGINE,
        "surfaces": [],
        "activeSurface": null
    })
}

/// Persist the manifest to `.project/surfaces.json`, creating parents as needed.
pub fn write_manifest(root: &Path, manifest: &Value) -> Result<(), std::io::Error> {
    let path = root.join(MANIFEST_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(manifest)?)
}

/// Return the surfaces array from a manifest (empty vec if absent).
pub fn surfaces_array(manifest: &Value) -> Vec<Value> {
    manifest
        .get("surfaces")
        .and_then(|s| s.as_array())
        .map(|arr| arr.clone())
        .unwrap_or_default()
}

/// Return all Surface ids declared in the manifest, in order.
pub fn list_manifest_ids(manifest: &Value) -> Vec<String> {
    surfaces_array(manifest)
        .iter()
        .filter_map(|s| s.get("id").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .collect()
}

/// Get a single Surface entry by id, if present.
pub fn get_surface(manifest: &Value, id: &str) -> Option<Value> {
    surfaces_array(manifest)
        .into_iter()
        .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(id))
}

/// The current active Surface id (manifest value, or first surface).
pub fn active_surface(manifest: &Value) -> Option<String> {
    if let Some(v) = manifest.get("activeSurface").and_then(|v| v.as_str()) {
        return Some(v.to_string());
    }
    list_manifest_ids(manifest).into_iter().next()
}

/// Replace the surfaces array with `surfaces`, preserving version/engine.
pub fn with_surfaces(manifest: &Value, surfaces: Vec<Value>) -> Value {
    let mut out = manifest.clone();
    out["surfaces"] = json!(surfaces);
    out
}

/// Upsert a Surface entry by id: replace if present, append if new.
pub fn upsert_surface(manifest: &Value, surface: Value) -> Value {
    let id = surface
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let mut surfaces = surfaces_array(manifest);
    if let Some(idx) = surfaces
        .iter()
        .position(|s| s.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
    {
        surfaces[idx] = surface;
    } else {
        surfaces.push(surface);
    }
    with_surfaces(manifest, surfaces)
}

/// Remove a Surface by id from the manifest.
pub fn remove_surface(manifest: &Value, id: &str) -> Value {
    let surfaces: Vec<Value> = surfaces_array(manifest)
        .into_iter()
        .filter(|s| s.get("id").and_then(|v| v.as_str()) != Some(id))
        .collect();
    let mut out = with_surfaces(manifest, surfaces);
    // Reset activeSurface if it pointed at the removed surface.
    if active_surface(&out).as_deref() == Some(id) {
        out["activeSurface"] = list_manifest_ids(&out)
            .first()
            .cloned()
            .map_or(Value::Null, Value::String);
    }
    out
}

/// Set the active Surface id in the manifest.
pub fn set_active(manifest: &Value, id: &str) -> Value {
    let mut out = manifest.clone();
    out["activeSurface"] = json!(id);
    out
}

/// Add a transition to a Surface (from -> to on `event`), validating `to` exists.
pub fn add_transition(
    manifest: &Value,
    from: &str,
    to: &str,
    event: &str,
) -> Result<Value, String> {
    if get_surface(manifest, from).is_none() {
        return Err(format!("Source surface '{from}' not found"));
    }
    if get_surface(manifest, to).is_none() {
        return Err(format!("Target surface '{to}' not found"));
    }
    let mut out = manifest.clone();
    if let Some(arr) = out.get_mut("surfaces").and_then(|s| s.as_array_mut()) {
        if let Some(from_entry) = arr
            .iter_mut()
            .find(|s| s.get("id").and_then(|v| v.as_str()) == Some(from))
        {
            let transitions = from_entry
                .get_mut("transitions")
                .and_then(|t| t.as_array_mut());
            match transitions {
                Some(trans) => {
                    trans.push(json!({ "to": to, "event": event }));
                }
                None => {
                    from_entry["transitions"] = json!([{ "to": to, "event": event }]);
                }
            }
        }
    }
    Ok(out)
}

/// Scan `scripts/ui/surfaces/` for existing Surface folders (fallback when the
/// manifest is missing). Returns sorted directory ids.
pub fn scan_surface_dirs(root: &Path) -> Vec<String> {
    let dir = root.join(SURFACES_DIR);
    let mut ids: Vec<String> = Vec::new();
    if dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        ids.push(name.to_string());
                    }
                }
            }
        }
    }
    ids.sort();
    ids
}

/// Build a manifest purely from scanning Surface dirs (used by `surface.sync`
/// and as a fallback when the manifest is absent).
pub fn build_manifest_from_dirs(root: &Path, engine: &str) -> Value {
    let ids = scan_surface_dirs(root);
    let active = ids.first().cloned().unwrap_or_default();
    json!({
        "version": 1,
        "engine": engine,
        "surfaces": ids.iter().map(|id| json!({
            "id": id,
            "label": id,
            "module": format!("scripts/ui/surfaces/{id}"),
            "entry": "init.lua",
            "backend": "static-ui",
            "default": *id == active,
            "initialState": {},
            "symbols": [],
            "assets": [],
            "transitions": []
        })).collect::<Vec<_>>(),
        "activeSurface": active
    })
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_read_missing_manifest_returns_empty() {
        let temp = tempdir().unwrap();
        let manifest = read_manifest(temp.path());
        assert!(surfaces_array(&manifest).is_empty());
    }

    #[test]
    fn test_write_and_read_roundtrip() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        let mut manifest = empty_manifest();
        manifest = upsert_surface(
            &manifest,
            json!({
                "id": "main_menu",
                "label": "主菜单",
                "module": "scripts/ui/surfaces/main_menu",
                "entry": "init.lua",
                "backend": "static-ui",
                "transitions": []
            }),
        );
        write_manifest(root, &manifest).unwrap();
        let read = read_manifest(root);
        assert_eq!(list_manifest_ids(&read), vec!["main_menu"]);
    }

    #[test]
    fn test_upsert_updates_existing_and_appends_new() {
        let mut manifest = empty_manifest();
        manifest = upsert_surface(&manifest, json!({"id": "a"}));
        manifest = upsert_surface(&manifest, json!({"id": "b"}));
        manifest = upsert_surface(&manifest, json!({"id": "a", "label": "A2"}));
        assert_eq!(list_manifest_ids(&manifest), vec!["a", "b"]);
        let a = get_surface(&manifest, "a").unwrap();
        assert_eq!(a["label"], "A2");
    }

    #[test]
    fn test_remove_resets_active() {
        let mut manifest = empty_manifest();
        manifest = upsert_surface(&manifest, json!({"id": "a"}));
        manifest = upsert_surface(&manifest, json!({"id": "b"}));
        manifest = set_active(&manifest, "a");
        manifest = remove_surface(&manifest, "a");
        assert_eq!(active_surface(&manifest), Some("b".to_string()));
    }

    #[test]
    fn test_add_transition_validates_and_appends() {
        let mut manifest = empty_manifest();
        manifest = upsert_surface(&manifest, json!({"id": "a", "transitions": []}));
        manifest = upsert_surface(&manifest, json!({"id": "b", "transitions": []}));
        let err = add_transition(&manifest, "a", "nope", "start_game");
        assert!(err.is_err());
        let ok = add_transition(&manifest, "a", "b", "start_game").unwrap();
        let a = get_surface(&ok, "a").unwrap();
        let trans = a["transitions"].as_array().unwrap().clone();
        assert_eq!(trans.len(), 1);
        assert_eq!(trans[0]["to"], "b");
    }

    #[test]
    fn test_scan_surface_dirs_sorted() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        fs::create_dir_all(root.join("scripts/ui/surfaces/pause")).unwrap();
        fs::create_dir_all(root.join("scripts/ui/surfaces/main_menu")).unwrap();
        fs::create_dir_all(root.join("scripts/ui/surfaces/not_a_surface")).unwrap();
        let ids = scan_surface_dirs(root);
        assert_eq!(ids, vec!["main_menu", "not_a_surface", "pause"]);
    }
}
