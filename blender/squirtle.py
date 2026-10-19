"""
Squirtle: a little water serpent with a beak, from the kids' whiteboard sketch.

A blue body pokes out of the floor and rises in a curve, leaning back, into a round head that
looks forward with a beak; a little curl sticks out of its front, and its belly is pale. It has
no legs: it runs about under the floor and pokes out of it to throw water (the game sinks it
into the floor and raises it out again, render/enemies.js; its flat bottom sits on the floor).
Faces -Y in Blender, +Z up; one unit = one game cell, about 0.75 cells tall. Squarlo summons
them, and they live in the lagoons, the sunken grotto and the cenote.

Rig: root, base (the bottom of the body), neck0, neck1 (the curve up), head (the head and the
upper beak), jaw (the lower beak, from the head).

Clips, 30 fps, in place:
    SquirtleSway   24-frame loop: swaying from side to side in an S, the head bobbing.
    SquirtleSpit   1.1 s: rears back and puffs up, then lunges forward with its beak wide and
                   spits at frame 15 (extras.hit_frame, extras.muzzle: the beak's tip).
    SquirtleDeath  1.4 s: shudders, wilts and flops over onto the floor, beak open. Held.
    SquirtleDrop   (a prop, not a clip): the ball of water it spits, its tail behind it.

Headless:
    Blender -b --python blender/squirtle.py -- assets/squirtle.glb blender/squirtle.blend \
        blender/previews/squirtle-preview.png
"""
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import creature as K
import figure as F

NAME, RIG_NAME, PROP = "Squirtle", "SquirtleRig", "SquirtleDrop"
SCENE, COLLECTION, STAGE = "Squirtle", "SquirtleAsset", "SquirtleStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
CLIPS = ("SquirtleSway", "SquirtleSpit", "SquirtleDeath")

BODY_HEX, BELLY_HEX, BEAK_HEX, EYE_HEX, WATER_HEX = "#3a7fd0", "#a8dcf4", "#24508c", "#0e1626", "#9fe0ff"
MATERIALS = (("SquirtleBody", BODY_HEX, 0), ("SquirtleBelly", BELLY_HEX, 0), ("SquirtleBeak", BEAK_HEX, 0),
             ("SquirtleEyes", EYE_HEX, 0))
BODY_M, BELLY_M, BEAK_M, EYE_M = range(len(MATERIALS))
WATER_MATERIALS = (("SquirtleWater", WATER_HEX, 0.5),)

VOXEL, FINE = 0.006, 0.003
SWAY_FRAMES, SWAY_SPEED = 24, 0.8
SPIT_FRAMES, SPIT_HIT = 33, 15
DEATH_FRAMES = 42

# --- body plan -----------------------------------------------------------------
SPINE = [V((0, 0.08, 0.0)), V((0, 0.1, 0.18)), V((0, 0.075, 0.36)), V((0, 0.0, 0.5)), V((0, -0.055, 0.6))]
SPINE_R = (0.13, 0.105, 0.088, 0.078, 0.08)
HEAD_C, HEAD_R = V((0, -0.09, 0.645)), (0.1, 0.128, 0.096)
BEAK = (V((0, -0.19, 0.652)), V((0, -0.3, 0.628)))       # the upper beak: root, tip
JAW = (V((0, -0.18, 0.612)), V((0, -0.27, 0.602)))         # the lower beak
EYES = [V((sx * 0.066, -0.158, 0.69)) for sx in (-1, 1)]
CURL = [V((0, 0.03, 0.2)), V((0, -0.06, 0.2)), V((0, -0.13, 0.22)), V((0, -0.18, 0.28)), V((0, -0.175, 0.34)), V((0, -0.14, 0.36)),
        V((0, -0.115, 0.33)), V((0, -0.125, 0.305))]
CURL_R = (0.036, 0.034, 0.031, 0.027, 0.024, 0.021, 0.018, 0.016)


def body_sdf(P):
    d = K.tapered_tube(P, SPINE, SPINE_R)
    return K.smax(d, -P[..., 2], 0.01)        # a flat bottom on the floor


def spine_y(z):
    """y of the spine's middle at height z (for the belly's colour)."""
    zs, ys = [p.z for p in SPINE], [p.y for p in SPINE]
    return np.interp(z, zs, ys)


def body_mats(centers):
    front = centers[:, 1] - spine_y(centers[:, 2])
    return np.where(front < -0.06, BELLY_M, BODY_M)


def head_sdf(P):
    d = K.ellipsoid(P, HEAD_C, HEAD_R)
    # a brow over each eye
    for e in EYES:
        d = K.smin(d, K.ellipsoid(P, e + V((0, 0.012, 0.025)), (0.03, 0.025, 0.02)), 0.02)
    return d


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = K.bounds(SPINE, 0.13)
    parts.add("body", body_sdf, lo, hi, VOXEL, mat=body_mats)
    lo, hi = HEAD_C - V((0.14, 0.17, 0.14)), HEAD_C + V((0.14, 0.17, 0.14))
    parts.add("head", head_sdf, lo, hi, VOXEL * 0.8, mat=BODY_M)
    lo, hi = K.bounds(BEAK, 0.05)
    parts.add("head", lambda P: K.round_cone(P, BEAK[0], BEAK[1], 0.042, 0.012), lo, hi, FINE, mat=BEAK_M)
    lo, hi = K.bounds(JAW, 0.04)
    parts.add("jaw", lambda P: K.round_cone(P, JAW[0], JAW[1], 0.03, 0.01), lo, hi, FINE, mat=BEAK_M)
    for e in EYES:
        parts.add("head", lambda P, c=e: K.ellipsoid(P, c, (0.022, 0.016, 0.026)), e - V((0.04,) * 3), e + V((0.04,) * 3), FINE, mat=EYE_M)
    lo, hi = K.bounds(CURL, 0.04)
    parts.add("curl", lambda P: K.tapered_tube(P, CURL, CURL_R), lo, hi, FINE * 1.3, mat=BODY_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "squirtle"
    obj["body_color"] = BODY_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_prop(coll):
    """The ball of water it spits: a plain mesh (no rig), round in front, a tail behind (+Y)."""
    parts = K.Parts()

    def drop(P):
        return K.smin(K.ellipsoid(P, (0, 0, 0), (0.11, 0.12, 0.11)), K.round_cone(P, V((0, 0.04, 0)), V((0, 0.2, 0)), 0.08, 0.015), 0.05)
    parts.add("drop", drop, (-0.13, -0.14, -0.13), (0.13, 0.23, 0.13), 0.008, mat=0)
    obj = parts.mesh(PROP, coll, WATER_MATERIALS)
    bpy.data.materials["SquirtleWater"].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.08
    K.decimate(obj, 800)
    return obj


# --- rig / skin --------------------------------------------------------------
CHAIN = ("base", "neck0", "neck1", "head")
HEAD_TIP = V((0, -0.19, 0.67))


def build_rig(coll):
    fwd = (0, -1, 0)
    pts = [SPINE[0], SPINE[1], SPINE[2], SPINE[3], HEAD_TIP]
    bones = [("root", (0, 0, 0), (0, 0.1, 0), None, False, (0, 0, 1))]
    for i, name in enumerate(CHAIN):
        bones.append((name, pts[i], pts[i + 1], CHAIN[i - 1] if i else "root", True, fwd))
    bones.append(("jaw", JAW[0], JAW[1], "head", True, (0, 0, 1)))
    return K.armature(RIG_NAME, coll, bones, {"enemy": "squirtle", "forward": "-Y", "attack_style": "spit",
                                              "normal_speed": SWAY_SPEED, "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    pts = [SPINE[0], SPINE[1], SPINE[2], SPINE[3], HEAD_TIP]
    along_of = np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind in ("head", "jaw"):
            W[lo:hi, names.index(kind)] = 1
            continue
        if kind == "curl":
            W[lo:hi, names.index("neck0")] = 1
            continue
        _, along = C._polyline_closest(P[lo:hi], pts)
        WB = np.zeros((hi - lo, len(names)), np.float32)
        past = [C.np_smoothstep(b - 0.04, b + 0.04, along) for b in along_of[1:4]]
        for k, name in enumerate(CHAIN):
            before = past[k - 1] if k else np.ones_like(along)
            after = past[k] if k < 3 else np.zeros_like(along)
            WB[:, names.index(name)] += before - after
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, 5)
    K.write_weights(obj, names, W)


def build():
    scene = K.creature_scene(SCENE)
    K.clear_collection(COLLECTION)
    coll = K.collection(COLLECTION, scene)
    rig = build_rig(coll)
    obj, owners = build_mesh(coll)
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    compute_weights(obj, owners)
    for name, roughness in (("SquirtleBody", 0.45), ("SquirtleBelly", 0.5), ("SquirtleBeak", 0.4), ("SquirtleEyes", 0.15)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
# each chain bone bends about its own axes: forward (x, `bend`), sideways (z, `side`), twist (y);
# the head may swell (`puff`), the jaw opens (`jaw`, radians)
def params(**kw):
    p = {"t": 0.0, "bend": [0.0] * 4, "side": [0.0] * 4, "twist": [0.0] * 4, "puff": 1.0, "jaw": 0.0}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, Matrix.Translation((0, 0, lift)) @ skel.rest["root"])
        for i, name in enumerate(CHAIN):
            R = (Matrix.Rotation(p["bend"][i], 4, "X") @ Matrix.Rotation(p["side"][i], 4, "Z") @ Matrix.Rotation(p["twist"][i], 4, "Y"))
            if name == "head":
                R = R @ Matrix.Diagonal((p["puff"], p["puff"], p["puff"], 1))
            bases[name] = K.pose_local(skel, name, poses, R)
        bases["jaw"] = K.pose_local(skel, "jaw", poses, Matrix.Rotation(p["jaw"], 4, "X"))
        return bases
    return solve


def sway(f):
    w = TAU * f / SWAY_FRAMES
    return params(t=f / FPS, side=[D(6) * math.sin(w), D(-9) * math.sin(w - 0.5), D(10) * math.sin(w - 1.1), D(-8) * math.sin(w - 1.7)],
                  bend=[D(2) * math.sin(2 * w), D(3) * math.sin(2 * w + 0.6), D(-3) * math.sin(2 * w + 1.2), D(5) * math.sin(2 * w + 1.8)],
                  jaw=D(4) + D(3) * math.sin(2 * w))


def spit(f):
    k, t = C.keyframes, f / FPS
    hit = SPIT_HIT / FPS
    rear = k((0, 0), (0.3, 1), (hit - 0.06, 1.1), (hit, 0), (0.75, 0))(t)
    lunge = k((0, 0), (hit - 0.06, 0), (hit, 1), (hit + 0.18, 1), (1.05, 0))(t)
    open_ = k((0, 0.05), (0.2, 0.05), (hit - 0.04, 0.2), (hit, 0.75), (hit + 0.15, 0.7), (0.9, 0.08), (1.1, 0.05))(t)
    shake = math.sin(TAU * 14 * t) * C.smoothstep(0.2, 0.3, t) * (1 - C.smoothstep(hit - 0.06, hit, t))
    return params(t=t, bend=[D(-4) * rear + D(6) * lunge, D(-14) * rear + D(16) * lunge, D(-12) * rear + D(14) * lunge, D(16) * rear - D(8) * lunge],
                  side=[0, D(2) * shake, D(-3) * shake, D(3) * shake], puff=1 + 0.1 * rear * (1 + 0.2 * shake), jaw=open_)


def death(f):
    k, t = C.keyframes, f / FPS
    shudder = math.sin(TAU * 12 * t) * (1 - C.smoothstep(0.15, 0.4, t))
    flop = C.smoothstep(0.3, 0.95, t) ** 1.5
    since = max(0.0, t - 0.95)
    bounce = math.exp(-since * 8) * math.sin(TAU * 3 * since) * (1 - C.smoothstep(1.15, 1.3, t)) if t > 0.95 else 0.0
    return params(t=t, side=[D(3) * shudder + D(28) * flop, D(32) * flop + D(4) * bounce, D(28) * flop, D(10) * flop],
                  bend=[D(8) * flop, D(12) * flop, D(10) * flop, D(-20) * flop], twist=[0, D(10) * flop, 0, D(20) * flop],
                  jaw=D(30) * C.smoothstep(0.2, 0.5, t))


def beak_tip(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    head = rig.pose.bones["head"]
    delta = head.matrix @ rig.data.bones["head"].matrix_local.inverted()
    return rig.matrix_world @ delta @ BEAK[1]


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SquirtleSway", solver(rig, sway), SWAY_FRAMES, cyclic=True, extras={"speed": SWAY_SPEED})
    a = K.ground_clip(rig, obj, "SquirtleSpit", solver(rig, spit), SPIT_FRAMES,
                      extras={"attack_style": "spit", "hit_frame": SPIT_HIT, "hit_time": SPIT_HIT / FPS})
    a.pose_markers.new("Spit").frame = SPIT_HIT
    K.ground_clip(rig, obj, "SquirtleDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.2}, settle_from=round(1.0 * FPS))
    K.register(rig, CLIPS)
    m = beak_tip(rig, "SquirtleSpit", SPIT_HIT)
    a["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    return list(a["muzzle"])


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    shots = [("SquirtleSway", 0, (1.1, -1.9, 0.9)), ("SquirtleSway", 8, (-1.9, -0.6, 0.8)),
             ("SquirtleSpit", 8, (1.6, -1.2, 0.8)), ("SquirtleSpit", SPIT_HIT + 1, (1.9, -0.3, 0.7)),
             ("SquirtleDeath", 20, (1.4, -1.6, 1.0)), ("SquirtleDeath", DEATH_FRAMES, (1.3, -1.3, 1.3))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 0.36), size=360, cols=3)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    K.decimate(obj)
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("SquirtleDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "Squirtle", STAGE, (0, 0, 0.36), 1.2, camera=(1.1, -1.9, 0.9))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, SWAY_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Squirtle", NAME, (0, 0, 0.36), 1.4)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Squirtle:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "squirtle.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "squirtle.blend"),
         preview_path=args[2] if len(args) > 2 else None)
