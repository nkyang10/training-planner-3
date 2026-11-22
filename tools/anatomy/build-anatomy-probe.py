"""
Builds the anatomy PROBE GLB: every imported BodyParts3D part as one normalized, named-node GLB.

This is the exploratory asset (skin, muscles and bones, no region grouping), kept because it is how the shipped
muscle view's scale and orientation were validated. It is not served by the app.

Run:
  blender -b -P tools/anatomy/build-anatomy-probe.py -- --parts <obj-dir> --out <glb>
"""
import glob
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))


def argument(name: str, fallback: str) -> str:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if name in argv:
        index = argv.index(name)
        if index + 1 < len(argv):
            return argv[index + 1]
    return fallback


PARTS_DIR = argument("--parts", os.path.join(HERE, "input", "parts"))
OUT = argument("--out", os.path.join(HERE, "input", "anatomy-probe.glb"))
TARGET_HEIGHT = 4.7
LICENSE_NOTE = "BodyParts3D, (c) The Database Center for Life Science, CC Attribution 4.0 International"

BONE_PREFIXES = ("mandible", "sacrum", "tibia")
SKIN_PREFIXES = ("skin",)


def kind_for(name: str) -> str:
    if name.startswith(SKIN_PREFIXES):
        return "skin"
    if name.startswith(BONE_PREFIXES):
        return "bone"
    return "muscle"


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)

    files = sorted(glob.glob(os.path.join(PARTS_DIR, "*.obj")))
    if len(files) == 0:
        raise SystemExit("no OBJ parts found")

    imported = []
    for path in files:
        before = set(bpy.data.objects.keys())
        bpy.ops.wm.obj_import(filepath=path)
        new = [name for name in bpy.data.objects.keys() if name not in before]
        if len(new) == 0:
            raise SystemExit(f"import produced no object for {path}")
        obj = bpy.data.objects[new[0]]
        friendly = os.path.basename(path).split("__")[0]
        obj.name = friendly
        obj.data.name = friendly
        imported.append(obj)

    # Measure the full model in original BP3D space (z-up, millimetres).
    min_z = min(min((obj.matrix_world.col[3][2] + corner[2] for corner in obj.bound_box)) for obj in imported)
    max_z = max(max((obj.matrix_world.col[3][2] + corner[2] for corner in obj.bound_box)) for obj in imported)
    height = max_z - min_z
    scale = TARGET_HEIGHT / height

    root = bpy.data.objects.new("AnatomyRoot", None)
    root.empty_display_size = 0.1
    bpy.context.scene.collection.objects.link(root)
    for obj in imported:
        obj.parent = root

    # BP3D is z-up: rotate so height becomes +y, scale to the rig's 4.7 units, feet at y = 0.
    root.rotation_euler = (-math.pi / 2, 0, 0)
    root.scale = (scale, scale, scale)
    root.location = (0, 0, -min_z * scale)
    bpy.context.view_layer.update()

    # Materials by kind.
    specs = {
        "skin": ("AnatomySkin", (0.78, 0.62, 0.50), 0.55),
        "muscle": ("AnatomyMuscle", (0.68, 0.34, 0.27), 0.45),
        "bone": ("AnatomyBone", (0.93, 0.89, 0.80), 0.40),
    }
    mats = {}
    for kind, (mat_name, color, rough) in specs.items():
        mat = bpy.data.materials.new(mat_name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
            bsdf.inputs["Roughness"].default_value = rough
        mats[kind] = mat
    for obj in imported:
        mat = mats[kind_for(obj.name)]
        if obj.data.materials:
            obj.data.materials.clear()
        obj.data.materials.append(mat)

    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=False)

    meta = {
        "out": OUT,
        "parts": [obj.name for obj in imported],
        "targetHeight": TARGET_HEIGHT,
        "scaleFromMillimetres": round(scale, 6),
        "license": LICENSE_NOTE,
    }
    print("ANATOMY_GLB_BUILT " + json.dumps(meta))


main()
