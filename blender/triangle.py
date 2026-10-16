"""
Triangle: a floating, pulsing purple triangle from the whiteboard sketch.

An upright equilateral triangular frame hovers above the floor. Inside it,
stepped towards the front, float a smaller triangular ring and a small solid
glowing core: the "inner triangles" of the sketch. Two glowing eyes with
angry brows float beside its apex. Everything is purple and emissive; the
rings pulse outwards from the core. Faces -Y in Blender, +Z up; one unit =
one game cell.

The frame, ring and core are separate rigid SDF parts on their own bones
(body / ring / core); eyes and brows ride eye.L / eye.R (scale = glow fade).
The punch the game throws is a separate, unskinned copy of the ring and core
in the same file (TrianglePunch).

Clips, 30 fps, in place (the game supplies root motion):
    TriFloat    40-frame hover loop: bob, and a pulse that runs out from the
                core through the ring to the frame. Time-driven (also idle).
    TriPunch    1.3 s: lean back while the ring and core pull back and swell,
                then thrust: the inner triangles shoot out towards the target
                and leave at extras.hit_frame (20) from extras.muzzle (game x,
                up, forward); new ones grow back in the frame.
    TriDeath    2.0 s: shudder, the inner triangles sink, the frame tips over
                backwards onto the floor, the eyes drop and fade. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, triangle; importlib.reload(creature); importlib.reload(triangle)
    triangle.main(export_path="<repo>/assets/triangle.glb", blend_path="<repo>/blender/triangle.blend")

Headless:
    Blender -b --python blender/triangle.py -- assets/triangle.glb blender/triangle.blend
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

NAME, RIG_NAME, PUNCH = "Triangle", "TriangleRig", "TrianglePunch"
SCENE, COLLECTION, STAGE = "Triangle", "TriangleAsset", "TriangleStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
FRAME_HEX, RING_HEX, CORE_HEX = "#6a2cd6", "#9a55ff", "#c070ff"
EYE_HEX, PUPIL_HEX, BROW_HEX = "#ffe2ff", "#1d0a29", "#2a0c4a"
CLIPS = ("TriFloat", "TriPunch", "TriDeath")
SIDES = (("L", 1), ("R", -1))

HALF = 0.62                                   # half the outer side
BASE_Z = 0.46                                 # hover gap under the frame
CENTER = Vector((0, 0, BASE_Z + HALF / math.sqrt(3)))
APEX_Z = CENTER.z + 2 * HALF / math.sqrt(3)
FRAME = (HALF, 0.072, 0.0, 0.068)             # (half side, half width, depth offset, half depth)
RING = (0.33, 0.052, -0.05, 0.05)
CORE = (0.12, 0.0, -0.09, 0.05)
EYES = {s: Vector((sign * 0.29, -0.03, APEX_Z - 0.2)) for s, sign in SIDES}
EYE_R = 0.06
LOOP_FRAMES, WANDER = 40, 0.5
PUNCH_FRAMES, HIT_FRAME = 39, 20
DEATH_FRAMES = 60
VOXEL, DETAIL = 0.012, 0.008


# --- sculpture ---------------------------------------------------------------
def tri2d(x, y, r):
    """IQ's exact equilateral triangle (centroid at 0, apex up, half side r)."""
    k = math.sqrt(3)
    x = np.abs(x) - r
    y = y + r / k
    flip = x + k * y > 0
    x, y = np.where(flip, (x - k * y) / 2, x), np.where(flip, (-k * x - y) / 2, y)
    x = x - np.clip(x, -2 * r, 0)
    return -np.sqrt(x * x + y * y) * np.sign(y)


def slab(P, center, spec, rnd=0.03):
    """A triangle ring (half width > 0) or solid plate (0), extruded along Y."""
    r, w, y0, h = spec
    Q = P - np.asarray(center, np.float32)
    d2 = tri2d(Q[..., 0], Q[..., 2], r)
    d2 = (np.abs(d2) - w if w else d2) + rnd
    dy = np.abs(Q[..., 1] - y0) - h + rnd
    outside = np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(dy, 0) ** 2)
    return np.minimum(np.maximum(d2, dy), 0) + outside - rnd


def core_sdf(P, center):
    """The solid inner triangle with a round bead set into its face."""
    d = slab(P, center, CORE, 0.035)
    bead = center + Vector((0, CORE[2] - CORE[3] + 0.01, -0.005))
    return K.smin(d, K.F._sd_sphere(P, bead, 0.045), 0.02)


def brow_points(sign):
    e = EYES["L" if sign > 0 else "R"]
    return [e + Vector((sign * -0.07, 0, 0.09)), e + Vector((sign * 0.0, 0, 0.125)), e + Vector((sign * 0.075, 0, 0.17))]


MATERIALS = (("TriangleFrame_glow", FRAME_HEX, 0.45), ("TriangleRing_glow", RING_HEX, 1.0),
             ("TriangleCore_glow", CORE_HEX, 1.5), ("TriangleEyes_glow", EYE_HEX, 2.0),
             ("TrianglePupils", PUPIL_HEX, 0), ("TriangleBrows", BROW_HEX, 0))


def box(center, r, pad=0.12):
    c = Vector(center)
    return c - Vector((r + pad, 0.2, r + pad)), c + Vector((r + pad, 0.2, r * 1.2 + pad))


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = box(CENTER, 2 * HALF / math.sqrt(3) + 0.05)
    parts.add("body", lambda P: slab(P, CENTER, FRAME), lo, hi, VOXEL, mat=0)
    lo, hi = box(CENTER, RING[0] * 1.2)
    parts.add("ring", lambda P: slab(P, CENTER, RING), lo, hi, DETAIL, mat=1)
    lo, hi = box(CENTER, CORE[0] * 1.3)
    parts.add("core", lambda P: core_sdf(P, CENTER), lo, hi, DETAIL * 0.8, mat=2)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: K.F._sd_sphere(P, c, EYE_R), e - Vector((0.1,) * 3),
                  e + Vector((0.1,) * 3), DETAIL * 0.7, mat=3)
        pupil = e + Vector((sign * -0.012, -0.05, -0.006))
        parts.add(f"eye.{s}", lambda P, c=pupil: K.ellipsoid(P, c, (0.022, 0.016, 0.026)),
                  pupil - Vector((0.05,) * 3), pupil + Vector((0.05,) * 3), 0.004, mat=4)
        brow = brow_points(sign)
        lo, hi = K.bounds(brow, 0.05)
        parts.add(f"eye.{s}", lambda P, b=brow: K.polyline(P, b, 0.019), lo, hi, DETAIL, mat=5)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "triangle"
    obj["body_color"] = FRAME_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_punch(coll):
    """The thrown inner triangles (ring + core), centred on the origin, facing -Y."""
    parts = K.Parts()
    o = Vector((0, -CORE[2] * 0.5, 0))
    lo, hi = box(o, RING[0] * 1.2)
    parts.add("ring", lambda P: slab(P, o, RING), lo, hi, DETAIL, mat=1)
    lo, hi = box(o, CORE[0] * 1.3)
    parts.add("core", lambda P: core_sdf(P, o), lo, hi, DETAIL * 0.8, mat=2)
    obj = parts.mesh(PUNCH, coll, MATERIALS)
    obj["projectile"] = "triangle_punch"
    obj["radius"] = RING[0]
    return obj


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", CENTER, CENTER + Vector((0, 0, 0.3)), "root", True, fwd),
             ("ring", CENTER, CENTER + Vector((0, -0.2, 0)), "body", True, up),
             ("core", CENTER, CENTER + Vector((0, -0.15, 0)), "ring", True, up)]
    for s, _ in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + Vector((0, -0.08, 0)), "body", True, up))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "triangle", "forward": "-Y", "attack_style": "punch", "normal_speed": WANDER,
        "hover": True, "root_motion": False})


def compute_weights(obj, owners):
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(obj.data.vertices), len(names)), np.float32)
    for o in owners:
        W[o["lo"]:o["hi"], names.index(o["kind"])] = 1
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
    punch = build_punch(coll)
    punch.location = (1.2, 0, CENTER.z)
    return scene, rig, obj, punch


# --- motion ------------------------------------------------------------------
LOOP_T = LOOP_FRAMES / FPS


def params(**kw):
    p = {"pos": Vector(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "pulse": 1.0,
         "ring_at": Vector(), "ring": 1.0, "ring_spin": 0.0,
         "core_at": Vector(), "core": 1.0, "core_spin": 0.0,
         "eye_at": Vector(), "eyes": 1.0}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)
    to_ring = skel.rest_rot["ring"].inverted()

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        s = p["pulse"]
        body = L @ Matrix.Translation(CENTER + p["pos"]) @ (R @ Matrix.Diagonal((s, s, s)) @ skel.rest_rot["body"]).to_4x4()
        bases["body"] = skel.set("body", poses, body)
        # ring / core: offsets in body space, spin about their own (forward) axis
        for name, at, scale, spin in (("ring", p["ring_at"], p["ring"], p["ring_spin"]),
                                      ("core", p["core_at"] - p["ring_at"], p["core"] / max(p["ring"], 0.01), p["core_spin"])):
            g = max(0.01, scale)
            basis = (Matrix.Translation(to_ring @ at) @ Matrix.Rotation(spin, 4, "Y")
                     @ Matrix.Diagonal((g, g, g, 1)))
            bases[name] = K.pose_local(skel, name, poses, basis)
        for side, _ in SIDES:
            e = max(0.05, p["eyes"])
            bases[f"eye.{side}"] = K.pose_local(skel, f"eye.{side}", poses, Matrix.Translation(
                skel.rest_rot[f"eye.{side}"].inverted() @ p["eye_at"]) @ Matrix.Diagonal((e, e, e, 1)))
        return bases
    return solve


def hover(t):
    w = TAU * t / LOOP_T
    beat = lambda lag: (0.5 + 0.5 * math.cos(TAU * (2 * t / LOOP_T - lag))) ** 6     # a beat, twice a loop
    return dict(pos=Vector((0, 0, 0.04 * math.sin(w))), pitch=D(2.5) * math.sin(w + 1.0), roll=D(2) * math.sin(w + 0.3),
                yaw=D(3) * math.sin(w + 2.2), pulse=1 + 0.025 * beat(0.16),
                ring=1 + 0.07 * beat(0.08), core=1 + 0.16 * beat(0.0),
                eye_at=Vector((0, 0, 0.018 * math.sin(w - 0.9))))


def float_loop(f):
    return params(**hover(f / FPS))


def punch(f):
    k, t = C.keyframes, f / FPS
    hit = HIT_FRAME / FPS
    out = hit - 1 / FPS                        # last frame the triangles are in flight
    p = hover(t)
    tremble = 0.012 * math.sin(TAU * 13 * t) * C.smoothstep(0.1, 0.3, t) * (1 - C.smoothstep(0.42, 0.5, t))
    p.update(pos=p["pos"] + Vector((tremble, k((0, 0), (0.45, 0.08), (0.62, -0.08), (1.0, -0.02), (1.3, 0))(t), 0)),
             pitch=D(k((0, 0), (0.45, -12), (0.62, 9), (1.0, -2), (1.3, 0))(t)),
             eye_at=p["eye_at"] + Vector((0, k((0, 0), (0.45, 0.04), (0.62, -0.05), (1.3, 0))(t), 0)))
    if t < hit:                                # pull back and swell, then shoot out
        p.update(ring_at=Vector((0, k((0, 0), (0.45, 0.10), (0.5, 0.10), (out, -0.80))(t), 0)),
                 core_at=Vector((0, k((0, 0), (0.45, 0.08), (0.5, 0.08), (out, -0.86))(t), 0)),
                 ring=k((0, p["ring"]), (0.45, 1.12), (out, 1.0))(t), core=k((0, p["core"]), (0.45, 1.4), (out, 1.0))(t),
                 ring_spin=k((0, 0), (0.5, 0), (out, D(-60)))(t), core_spin=k((0, 0), (0.5, 0), (out, D(60)))(t))
    else:                                      # gone; new ones grow back in the frame
        p.update(ring=k((hit, 0.01), (1.05, 1.12), (1.3, 1))(t), core=k((hit, 0.01), (1.1, 1.2), (1.3, 1))(t))
    return params(**p)


def death(f):
    k, t = C.keyframes, f / FPS
    shudder = math.sin(TAU * 11 * t) * C.smoothstep(0, 0.1, t) * (1 - C.smoothstep(0.4, 0.6, t))
    fall = k((0, 0), (0.45, 0), (1.1, 1), (1.25, 0.95), (1.4, 1))(t)
    return params(pos=Vector((0.02 * shudder, 0.35 * fall, -0.3 * fall)), pitch=D(-92) * fall, roll=D(5) * shudder + D(6) * fall,
                  yaw=D(4) * shudder, pulse=k((0, 1), (0.3, 1.06), (0.6, 0.98), (1.0, 1))(t),
                  ring_at=Vector((0, k((0, 0), (0.6, 0.05), (1.2, 0.02))(t), k((0, 0), (0.6, -0.06), (1.2, -0.05))(t))),
                  core_at=Vector((0, k((0, 0), (0.6, 0.05), (1.2, 0.02))(t), k((0, 0), (0.6, -0.1), (1.2, -0.08))(t))),
                  ring=k((0, 1), (0.3, 1.15), (1.0, 0.9))(t), core=k((0, 1), (0.3, 1.3), (1.0, 0.75))(t),
                  ring_spin=D(k((0, 0), (1.1, 14))(t)), core_spin=D(k((0, 0), (1.1, -25))(t)),
                  eye_at=Vector((0, k((0, 0), (1.2, -0.04))(t), k((0, 0), (0.4, 0.05), (1.2, -0.12))(t))),
                  eyes=k((0, 1), (0.6, 1), (1.5, 0.08))(t))


def ring_point(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    return rig.matrix_world @ rig.pose.bones["ring"].head


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "TriFloat", solver(rig, float_loop), LOOP_FRAMES, cyclic=True,
                  extras={"speed": WANDER, "hover": True})
    act = K.ground_clip(rig, obj, "TriPunch", solver(rig, punch), PUNCH_FRAMES,
                        extras={"attack_style": "punch", "hit_frame": HIT_FRAME, "hit_time": HIT_FRAME / FPS})
    act.pose_markers.new("Punch").frame = HIT_FRAME
    m = ring_point(rig, "TriPunch", HIT_FRAME - 1)
    act["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    K.ground_clip(rig, obj, "TriDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.5}, settle_from=round(1.4 * FPS))
    K.register(rig, CLIPS)
    return list(act["muzzle"])


def main(export_path=None, blend_path=None):
    scene, rig, obj, punch_obj = build()
    K.decimate(obj)
    K.decimate(punch_obj)
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("TriDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "Triangle", STAGE, (0, 0, 0.9), 2.4)
    scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, LOOP_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        punch_obj.location = (0, 0, 0)
        K.export_gltf(rig, obj, export_path, extra=(punch_obj,))
        punch_obj.location = (1.2, 0, CENTER.z)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Triangle", NAME, (0, 0, 0.9), 3.2)
    print("Triangle:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "triangle.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "triangle.blend"))
