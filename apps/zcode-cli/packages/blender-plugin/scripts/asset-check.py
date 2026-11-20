"""Inspect a named object or collection in the current Blender scene."""

import json
import math
from pathlib import Path

import bpy


def _row(subject, name, actual, expected=None, matches=None):
    status = "unverified" if matches is None else "pass" if matches else "needs-fix"
    return {"subject": subject, "check": name, "actual": actual, "expected": expected, "status": status}


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
    if kind not in {"object", "collection"}:
        raise ValueError("kind must be object or collection")
    if not isinstance(tolerance, (float, int)) or not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError("tolerance must be finite and non-negative")
    requirements = requirements if requirements is not None else {}
    allowed = {"dimensions", "origin", "max_triangles", "materials", "action", "frame_range"}
    for name, expected in requirements.items():
        if unexpected := set(expected) - allowed:
            raise ValueError(f"Unknown checks for {name}: {', '.join(sorted(unexpected))}")
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
