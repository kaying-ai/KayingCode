//! TapTap animation operations — clips, animator controllers, and timelines.
//!
//! All operations operate on JSON data files under `assets/animations/`,
//! `assets/animator/`, and `assets/timelines/`.

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

fn animations_dir(root: &Path) -> PathBuf {
    root.join("assets").join("animations")
}

fn animator_dir(root: &Path) -> PathBuf {
    root.join("assets").join("animator")
}

fn timelines_dir(root: &Path) -> PathBuf {
    root.join("assets").join("timelines")
}

fn ensure_parent(path: &Path) -> Result<(), ExecuteError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(ExecuteError::Io)?;
    }
    Ok(())
}

// ============================================================
// Clips
// ============================================================

/// Handle `animation.create_clip` — write `assets/animations/<name>.anim.json`.
pub fn animation_create_clip(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let duration = request
        .arguments
        .get("duration")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);
    let loop_mode = request
        .arguments
        .get("loop")
        .and_then(|v| v.as_str())
        .unwrap_or("none");

    let path = animations_dir(&root).join(format!("{name}.anim.json"));
    if path.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Animation clip '{name}' already exists"), "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    }
    let clip = json!({
        "name": name,
        "duration": duration,
        "loop": loop_mode,
        "curves": [],
    });
    ensure_parent(&path)?;
    write_json_file(&path, &clip).map_err(ExecuteError::Io)?;
    info!(name = %name, path = %path.to_string_lossy(), "Animation clip created");
    Ok(ok_result(
        request,
        json!({"created": true, "name": name, "path": path.to_string_lossy(), "duration": duration, "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.set_curve` — add/replace a curve on a clip.
pub fn animation_set_curve(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let path = animations_dir(&root).join(format!("{name}.anim.json"));
    let Some(mut clip) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Clip '{name}' not found"), "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let curve_name = required_str_arg(request, "curve")?;
    let keyframes = request
        .arguments
        .get("keyframes")
        .cloned()
        .unwrap_or(json!([]));
    let curve = json!({"name": curve_name, "keyframes": keyframes});

    let curves = clip
        .get_mut("curves")
        .and_then(|v| v.as_array_mut())
        .map(|a| {
            a.retain(|c| c.get("name").and_then(|v| v.as_str()) != Some(&curve_name));
            a.push(curve.clone());
        });
    if curves.is_none() {
        clip["curves"] = json!([curve]);
    }
    write_json_file(&path, &clip).map_err(ExecuteError::Io)?;
    info!(name = %name, curve = %curve_name, "Curve set");
    Ok(ok_result(
        request,
        json!({"set": true, "name": name, "curve": curve_name, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.get_clip` — read a clip file.
pub fn animation_get_clip(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let path = animations_dir(&root).join(format!("{name}.anim.json"));
    let Some(clip) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Clip '{name}' not found"), "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    };
    info!(name = %name, "Clip read");
    Ok(ok_result(
        request,
        json!({"clip": clip, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.remove_curve` — remove a curve from a clip.
pub fn animation_remove_curve(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let curve_name = required_str_arg(request, "curve")?;
    let path = animations_dir(&root).join(format!("{name}.anim.json"));
    let Some(mut clip) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Clip '{name}' not found"), "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let removed = if let Some(curves) = clip.get_mut("curves").and_then(|v| v.as_array_mut()) {
        let before = curves.len();
        curves.retain(|c| c.get("name").and_then(|v| v.as_str()) != Some(&curve_name));
        before - curves.len()
    } else {
        0
    };
    write_json_file(&path, &clip).map_err(ExecuteError::Io)?;
    info!(name = %name, curve = %curve_name, removed, "Curve removed");
    Ok(ok_result(
        request,
        json!({"removed": removed, "name": name, "curve": curve_name, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Animator Controllers
// ============================================================

/// Handle `animation.create_controller` — write `assets/animator/<name>.controller.json`.
pub fn animation_create_controller(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let path = animator_dir(&root).join(format!("{name}.controller.json"));
    if path.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Animator controller '{name}' already exists")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    let controller = json!({
        "name": name,
        "parameters": [],
        "layers": [],
        "states": [],
        "transitions": [],
        "entry_state": null,
    });
    ensure_parent(&path)?;
    write_json_file(&path, &controller).map_err(ExecuteError::Io)?;
    info!(name = %name, "Animator controller created");
    Ok(ok_result(
        request,
        json!({"created": true, "name": name, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.add_parameter` — append a parameter to a controller.
pub fn animation_add_parameter(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let param_name = required_str_arg(request, "param_name")?;
    let param_type = request
        .arguments
        .get("param_type")
        .and_then(|v| v.as_str())
        .unwrap_or("float");
    let default = request
        .arguments
        .get("default")
        .cloned()
        .unwrap_or(json!(0));
    let path = animator_dir(&root).join(format!("{name}.controller.json"));
    let Some(mut controller) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Controller '{name}' not found"), "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let param = json!({"name": param_name, "type": param_type, "default": default});
    let params = controller.as_object_mut().and_then(|o| {
        o.entry("parameters")
            .or_insert_with(|| json!([]))
            .as_array_mut()
    });
    if let Some(params) = params {
        params.push(param.clone());
    }
    write_json_file(&path, &controller).map_err(ExecuteError::Io)?;
    info!(controller = %name, param = %param_name, "Parameter added");
    Ok(ok_result(
        request,
        json!({"added": true, "controller": name, "parameter": param, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.add_layer` — append a layer to a controller.
pub fn animation_add_layer(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let layer_name = required_str_arg(request, "layer_name")?;
    let weight = request
        .arguments
        .get("weight")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);
    let path = animator_dir(&root).join(format!("{name}.controller.json"));
    let Some(mut controller) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Controller '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let layer = json!({"name": layer_name, "weight": weight, "state_machine": {}});
    let layers = controller.as_object_mut().and_then(|o| {
        o.entry("layers")
            .or_insert_with(|| json!([]))
            .as_array_mut()
    });
    if let Some(layers) = layers {
        layers.push(layer.clone());
    }
    write_json_file(&path, &controller).map_err(ExecuteError::Io)?;
    info!(controller = %name, layer = %layer_name, "Layer added");
    Ok(ok_result(
        request,
        json!({"added": true, "controller": name, "layer": layer, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.add_state` — append a state to a controller.
pub fn animation_add_state(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let state_name = required_str_arg(request, "state_name")?;
    let motion = request
        .arguments
        .get("motion")
        .cloned()
        .unwrap_or(json!(null));
    let path = animator_dir(&root).join(format!("{name}.controller.json"));
    let Some(mut controller) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Controller '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let state = json!({"name": state_name, "motion": motion});
    let states = controller.as_object_mut().and_then(|o| {
        o.entry("states")
            .or_insert_with(|| json!([]))
            .as_array_mut()
    });
    if let Some(states) = states {
        states.push(state.clone());
    }
    // If entry_state unset, set it.
    if controller
        .get("entry_state")
        .and_then(|v| v.as_str())
        .is_none()
    {
        controller["entry_state"] = json!(state_name);
    }
    write_json_file(&path, &controller).map_err(ExecuteError::Io)?;
    info!(controller = %name, state = %state_name, "State added");
    Ok(ok_result(
        request,
        json!({"added": true, "controller": name, "state": state, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.add_transition` — append a transition to a controller.
pub fn animation_add_transition(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let from = required_str_arg(request, "from")?;
    let to = required_str_arg(request, "to")?;
    let condition = request
        .arguments
        .get("condition")
        .cloned()
        .unwrap_or(json!(null));
    let path = animator_dir(&root).join(format!("{name}.controller.json"));
    let Some(mut controller) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Controller '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let transition = json!({"from": from, "to": to, "condition": condition});
    let transitions = controller.as_object_mut().and_then(|o| {
        o.entry("transitions")
            .or_insert_with(|| json!([]))
            .as_array_mut()
    });
    if let Some(transitions) = transitions {
        transitions.push(transition.clone());
    }
    write_json_file(&path, &controller).map_err(ExecuteError::Io)?;
    info!(controller = %name, from = %from, to = %to, "Transition added");
    Ok(ok_result(
        request,
        json!({"added": true, "controller": name, "transition": transition, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.get_controller` — read a controller file.
pub fn animation_get_controller(
    request: &OperationRequest,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let path = animator_dir(&root).join(format!("{name}.controller.json"));
    let Some(controller) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Controller '{name}' not found"), "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    };
    info!(name = %name, "Controller read");
    Ok(ok_result(
        request,
        json!({"controller": controller, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Timelines
// ============================================================

/// Handle `animation.create_timeline` — write `assets/timelines/<name>.timeline.json`.
pub fn animation_create_timeline(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let duration = request
        .arguments
        .get("duration")
        .and_then(|v| v.as_f64())
        .unwrap_or(5.0);
    let fps = request
        .arguments
        .get("fps")
        .and_then(|v| v.as_i64())
        .unwrap_or(30);
    let path = timelines_dir(&root).join(format!("{name}.timeline.json"));
    if path.exists() {
        return Ok(fail_result(
            request,
            json!({"error": format!("Timeline '{name}' already exists")}),
            started.elapsed().as_millis() as u64,
        ));
    }
    let timeline = json!({
        "name": name,
        "duration": duration,
        "fps": fps,
        "tracks": [],
    });
    ensure_parent(&path)?;
    write_json_file(&path, &timeline).map_err(ExecuteError::Io)?;
    info!(name = %name, "Timeline created");
    Ok(ok_result(
        request,
        json!({"created": true, "name": name, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.add_track` — append a track to a timeline.
pub fn animation_add_track(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let track_type = required_str_arg(request, "track_type")?;
    let target = request
        .arguments
        .get("target")
        .cloned()
        .unwrap_or(json!(null));
    let path = timelines_dir(&root).join(format!("{name}.timeline.json"));
    let Some(mut timeline) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Timeline '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let track = json!({"type": track_type, "target": target, "clips": []});
    let tracks = timeline.as_object_mut().and_then(|o| {
        o.entry("tracks")
            .or_insert_with(|| json!([]))
            .as_array_mut()
    });
    if let Some(tracks) = tracks {
        tracks.push(track.clone());
    }
    write_json_file(&path, &timeline).map_err(ExecuteError::Io)?;
    info!(timeline = %name, track_type = %track_type, "Track added");
    Ok(ok_result(
        request,
        json!({"added": true, "timeline": name, "track": track, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.add_clip` — append a clip entry to a timeline track.
pub fn animation_add_clip(
    request: &OperationRequest,
    _plan: &OperationPlan,
) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let track_index = request
        .arguments
        .get("track_index")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let clip_ref = required_str_arg(request, "clip")?;
    let start = request
        .arguments
        .get("start")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let end = request
        .arguments
        .get("end")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);
    let path = timelines_dir(&root).join(format!("{name}.timeline.json"));
    let Some(mut timeline) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Timeline '{name}' not found")}),
            started.elapsed().as_millis() as u64,
        ));
    };
    let clip_entry = json!({"clip": clip_ref, "start": start, "end": end});
    let tracks = timeline.get_mut("tracks").and_then(|v| v.as_array_mut());
    let added = if let Some(tracks) = tracks {
        if let Some(track) = tracks.get_mut(track_index) {
            let clips = track
                .as_object_mut()
                .and_then(|o| o.entry("clips").or_insert_with(|| json!([])).as_array_mut());
            if let Some(clips) = clips {
                clips.push(clip_entry.clone());
                true
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };
    write_json_file(&path, &timeline).map_err(ExecuteError::Io)?;
    info!(timeline = %name, track_index, clip = %clip_ref, added, "Clip appended");
    Ok(ok_result(
        request,
        json!({"added": added, "timeline": name, "track_index": track_index, "clip": clip_entry, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

/// Handle `animation.get_timeline` — read a timeline file.
pub fn animation_get_timeline(request: &OperationRequest) -> Result<OperationResult, ExecuteError> {
    let root = get_project_root(request)?;
    let started = Instant::now();
    let name = required_str_arg(request, "name")?;
    let path = timelines_dir(&root).join(format!("{name}.timeline.json"));
    let Some(timeline) = read_json_file_opt(&path).map_err(ExecuteError::Io)? else {
        return Ok(fail_result(
            request,
            json!({"error": format!("Timeline '{name}' not found"), "path": path.to_string_lossy()}),
            started.elapsed().as_millis() as u64,
        ));
    };
    info!(name = %name, "Timeline read");
    Ok(ok_result(
        request,
        json!({"timeline": timeline, "path": path.to_string_lossy(), "project_root": root.to_string_lossy()}),
        started.elapsed().as_millis() as u64,
    ))
}

// ============================================================
// Prepare
// ============================================================

/// Prepare an animation operation.
pub fn prepare_animation(request: &OperationRequest) -> Result<OperationPlan, PrepareError> {
    let effects = match request.operation_id.as_str() {
        "animation.get_clip" | "animation.get_controller" | "animation.get_timeline" => {
            vec![Effect::ReadProject]
        }
        _ => vec![Effect::ReadProject, Effect::WriteProject],
    };
    make_plan(request, &PLAN_COUNTER, effects, "animation-effects")
}
