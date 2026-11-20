"""Inspect a named object or collection in the current Blender scene."""

import json
import math
from pathlib import Path

import bpy


def _row(subject, name, actual, expected=None, matches=None):
    status = "unverified" if matches is None else "pass" if matches else "needs-fix"
    return {"subject": subject, "check": name, "actual": actual, "expected": expected, "status": status}


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_vector(name, field, value, length):
    if not isinstance(value, (list, tuple)) or len(value) != length:
        raise ValueError(f"{name}.{field} must be a list of {length} finite numbers")
    if not all(_is_number(item) for item in value):
        raise ValueError(f"{name}.{field} must be a list of {length} finite numbers")
    return list(value)


def _validate_requirements(requirements):
    """Validate agent-supplied JSON before touching the scene."""
    if requirements is None:
        return {}
    if not isinstance(requirements, dict):
        raise ValueError("requirements must be a mapping keyed by object name")
    allowed = {"dimensions", "origin", "max_triangles", "materials", "action", "frame_range"}
    validated = {}
    for name, expected in requirements.items():
        if not isinstance(name, str) or not name:
            raise ValueError("requirement keys must be non-empty object names")
        if not isinstance(expected, dict):
            raise ValueError(f"requirements[{name}] must be a mapping")
        if unexpected := set(expected) - allowed:
            raise ValueError(f"Unknown checks for {name}: {', '.join(sorted(unexpected))}")
        item = {}
        for field, length in (("dimensions", 3), ("origin", 3), ("frame_range", 2)):
            if expected.get(field) is not None:
                item[field] = _validate_vector(name, field, expected[field], length)
        budget = expected.get("max_triangles")
        if budget is not None:
            if not isinstance(budget, int) or isinstance(budget, bool) or budget < 0:
                raise ValueError(f"{name}.max_triangles must be a non-negative integer")
            item["max_triangles"] = budget
        materials = expected.get("materials")
        if materials is not None:
            if not isinstance(materials, (list, tuple)) or not all(
                isinstance(material, str) and material for material in materials
            ):
                raise ValueError(f"{name}.materials must be a list of non-empty material names")
            item["materials"] = list(materials)
        action = expected.get("action")
        if action is not None:
            if not isinstance(action, str) or not action:
                raise ValueError(f"{name}.action must be a non-empty string")
            item["action"] = action
        validated[name] = item
    return validated


def _near(actual, expected, tolerance):
    if expected is None:
        return None
    return len(actual) == len(expected) and all(
        math.isclose(left, right, rel_tol=0, abs_tol=tolerance)
        for left, right in zip(actual, expected)
    )


def _triangles(obj, depsgraph):
    if obj.type != "MESH":
        return None
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    if mesh is None:
        return None
    try:
        # 三角化统计只发生在依赖图的临时网格，避免改写用户对象或选择。
        mesh.calc_loop_triangles()
        return len(mesh.loop_triangles)
    finally:
        evaluated.to_mesh_clear()


def _textures(materials):
    seen_trees = set()
    seen_images = set()
    trees = [material.node_tree for material in materials if material.node_tree]
    while trees:
        tree = trees.pop()
        if tree in seen_trees:
            continue
        seen_trees.add(tree)
        for node in tree.nodes:
            if node.type == "GROUP" and node.node_tree:
                trees.append(node.node_tree)
            if node.type not in {"TEX_IMAGE", "TEX_ENVIRONMENT"} or not node.image:
                continue
            image = node.image
            if image in seen_images:
                continue
            seen_images.add(image)
            if image.source == "FILE":
                if image.packed_file:
                    yield _row(image.name, "texture", "packed", "available", True)
                else:
                    path = bpy.path.abspath(image.filepath, library=image.library)
                    try:
                        available = bool(path and Path(path).is_file())
                    except OSError:
                        available = None
                    yield _row(image.name, "texture", path, "available", available)
            else:
                yield _row(image.name, "texture", image.source)


def _inspect_object(obj, depsgraph, expected, tolerance):
    evaluated = obj.evaluated_get(depsgraph)
    for name, actual in (
        ("dimensions", list(evaluated.dimensions)),
        ("origin", list(evaluated.matrix_world.translation)),
    ):
        target = expected.get(name)
        yield _row(obj.name, name, actual, target, _near(actual, target, tolerance))
    triangles = _triangles(obj, depsgraph)
    budget = expected.get("max_triangles")
    yield _row(obj.name, "max_triangles", triangles, budget,
               triangles <= budget if triangles is not None and budget is not None else None)
    materials = [slot.material for slot in evaluated.material_slots if slot.material]
    names = sorted({material.name for material in materials})
    required_materials = expected.get("materials")
    yield _row(obj.name, "materials", names, required_materials,
               set(required_materials).issubset(names) if required_materials is not None else None)
    yield from _textures(materials)
    action = obj.animation_data.action if obj.animation_data else None
    expected_action = expected.get("action")
    frames = list(action.frame_range) if action else None
    expected_frames = expected.get("frame_range")
    yield _row(obj.name, "action", action.name if action else None, expected_action,
               bool(action and action.name == expected_action) if expected_action is not None else None)
    yield _row(obj.name, "frame_range", frames, expected_frames,
               _near(frames, expected_frames, tolerance) if frames is not None else
               (False if expected_frames is not None else None))


def inspect_asset(target, kind="object", requirements=None, unit_scale=None, tolerance=0.00001, require_camera=False):
    """Print compact JSON. Requirements are keyed by exact scene object name."""
    if not isinstance(target, str) or not target:
        raise ValueError("target must be a non-empty object or collection name")
    if kind not in {"object", "collection"}:
        raise ValueError("kind must be object or collection")
    if (
        not isinstance(tolerance, (float, int))
        or isinstance(tolerance, bool)
        or not math.isfinite(tolerance)
        or tolerance < 0
    ):
        raise ValueError("tolerance must be finite and non-negative")
    if unit_scale is not None and (not _is_number(unit_scale) or unit_scale <= 0):
        raise ValueError("unit_scale must be a positive finite number")
    requirements = _validate_requirements(requirements)
    scene = bpy.context.scene
    if kind == "object":
        obj = scene.objects.get(target)
        objects = [obj] if obj else []
    else:
        collection = scene.collection if scene.collection.name == target else next(
            (child for child in scene.collection.children_recursive if child.name == target), None
        )
        objects = list(collection.all_objects) if collection else []
    rows = [_row(target, "target", [obj.name for obj in objects], kind, bool(objects))]
    if require_camera:
        # 预览临时切换相机后能出图，保存的场景仍可能缺少活动相机。
        camera = scene.camera
        camera_valid = camera is not None and camera.type == "CAMERA" and scene.objects.get(camera.name) == camera
        rows.append(_row(scene.name, "active_camera", camera.name if camera else None,
                         "active scene camera", camera_valid))
    if not objects:
        print(json.dumps(rows, ensure_ascii=False))
        return
    scale = scene.unit_settings.scale_length
    rows.append(_row(scene.name, "unit_scale", scale, unit_scale,
                     math.isclose(scale, unit_scale, rel_tol=0, abs_tol=tolerance) if unit_scale is not None else None))
    for name in sorted(set(requirements) - {obj.name for obj in objects}):
        rows.append(_row(name, "member", None, target, False))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in sorted(objects, key=lambda item: item.name):
        rows.extend(_inspect_object(obj, depsgraph, requirements.get(obj.name, {}), tolerance))
    print(json.dumps(rows, ensure_ascii=False))
