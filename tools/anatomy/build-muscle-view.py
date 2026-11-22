"""
Builds the shipped MUSCLE VIEW GLB: real BodyParts3D muscles over the skeleton, no skin.

One material per muscle REGION (`RegionMuscle-<region>`) so the app can tint and select each region independently;
one shared ivory material (`AnatomyBone`) for every bone. Rib and vertebra detail is decimated harder to keep the
asset lean. Object names follow `region__part__FJ`, which is what the viewer groups on.

Input: an extracted OBJ directory (see README.md for the extraction steps).
Output: src/vendor/anatomy-muscles.glb (11 MB) by default.

Run:
  blender -b -P tools/anatomy/build-muscle-view.py -- --parts <obj-dir> --out <glb>
"""
import glob
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))


def argument(name: str, fallback: str) -> str:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if name in argv:
        index = argv.index(name)
        if index + 1 < len(argv):
            return argv[index + 1]
    return fallback


PARTS_DIR = argument("--parts", os.path.join(HERE, "input", "muscleview"))
OUT = argument("--out", os.path.join(REPO, "src", "vendor", "anatomy-muscles.glb"))
TARGET_HEIGHT = 4.7
# Measured from the full-body skin mesh (FJ2810): the muscle view keeps the same body scale without shipping it.
BODY_MIN_Z_MM = -78.1112
BODY_HEIGHT_MM = 1719.4712
LICENSE_NOTE = "BodyParts3D, (c) The Database Center for Life Science, CC Attribution 4.0 International"

BONE_REGIONS = {
    "femur", "tibia", "fibula", "humerus", "clavicle", "scapula", "sternum", "patella",
    "talus", "calcaneus", "radius", "ulna", "ribs", "vertebrae", "sacrum", "mandible",
}
HEAVY_BONES = {"ribs": 0.30, "vertebrae": 0.30, "sacrum": 0.40, "mandible": 0.40}
# Browser-scale: the whole build is decimated so GLTFLoader parses it in seconds, not minutes. BP3D meshes are
# already 99%-reduced; this pass trims what remains to what the viewer actually shows at its default distance.
DECIMATE_MUSCLES = 0.45


def region_of(stem: str) -> str:
    return stem.split("__")[0]


def kind_for(stem: str) -> str:
    return "bone" if region_of(stem) in BONE_REGIONS else "muscle"


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
        stem = os.path.splitext(os.path.basename(path))[0]
        obj.name = stem
        obj.data.name = stem
        imported.append(obj)

    scale = TARGET_HEIGHT / BODY_HEIGHT_MM

    root = bpy.data.objects.new("AnatomyMuscleView", None)
    root.empty_display_size = 0.1
    bpy.context.scene.collection.objects.link(root)
    for obj in imported:
        obj.parent = root

    root.rotation_euler = (-math.pi / 2, 0, 0)
    root.scale = (scale, scale, scale)
    root.location = (0, 0, -BODY_MIN_Z_MM * scale)
    bpy.context.view_layer.update()

    # One material per muscle region; one shared ivory for every bone.
    muscle_regions = sorted({region_of(obj.name) for obj in imported if kind_for(obj.name) == "muscle"})
    mats = {}
    for region in muscle_regions:
        mat = bpy.data.materials.new(f"RegionMuscle-{region}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = (0.66, 0.24, 0.20, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.42
        mats[region] = mat
    bone_mat = bpy.data.materials.new("AnatomyBone")
    bone_mat.use_nodes = True
    bone_bsdf = bone_mat.node_tree.nodes.get("Principled BSDF")
    if bone_bsdf is not None:
        bone_bsdf.inputs["Base Color"].default_value = (0.93, 0.89, 0.80, 1.0)
        bone_bsdf.inputs["Roughness"].default_value = 0.40
    mats["__bone__"] = bone_mat

    for obj in imported:
        kind = kind_for(obj.name)
        mat = mats[region_of(obj.name)] if kind == "muscle" else mats["__bone__"]
        if obj.data.materials:
            obj.data.materials.clear()
        obj.data.materials.append(mat)
        heavy = HEAVY_BONES.get(region_of(obj.name))
        ratio = heavy if heavy is not None else (DECIMATE_MUSCLES if kind == "muscle" else 0.45)
        if ratio is not None:
            modifier = obj.modifiers.new(name="decimate", type="DECIMATE")
            modifier.ratio = ratio
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier="decimate")

    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=False)

    regions = sorted({region_of(obj.name) for obj in imported})
    meta = {
        "out": OUT,
        "objects": len(imported),
        "regions": regions,
        "muscleRegions": len(muscle_regions),
        "targetHeight": TARGET_HEIGHT,
        "scaleFromMillimetres": round(scale, 6),
        "license": LICENSE_NOTE,
    }
    print("MUSCLE_VIEW_BUILT " + json.dumps(meta))


main()
