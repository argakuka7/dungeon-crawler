"""
Flip: the boss of the fourth descent, from the kids' sketch.

Three rings of smaller rings: each big ring is a wreath of little oval loops lying in its plane,
long side outward like petals. The rings overlap like the sketch: a big one on top, a second to
the left and lower, a smaller third to the right and lowest. All light blue, glowing a little.
Faces -Y in Blender, +Z up; one unit = one game cell, about 2.2 cells tall. It floats.

The rings turn: the game spins each about its own axis now and then (render/enemies.js, the
profile's `rings`), faster while he attacks; the clips leave that spin out and only move, tilt,
draw together and spread the rings.

Rig: root, body (everything rides it), ring0..2 (one big ring each: top, left, right; the bone
points along the ring's axis, forward).

Clips, 30 fps, in place (the game supplies root motion):
    FlipHover   48-frame loop: floating, bobbing, the rings swaying out of step.
    FlipThrow   1.2 s: he leans back and the rings draw together, then at frame 18
                (extras.hit_frame) he thrusts forward and throws a ball of light out of the top
                ring (extras.muzzle: game x, up, forward).
    FlipFlip    2.2 s: the rings rise and spread, and the whole of him cartwheels right round
                about his forward axis; at frame 40 (the hit frame) the world turns.
    FlipHole    1.8 s: the rings crowd together into a knot, shaking, and at frame 32 burst apart:
                a black hole opens.
    FlipSummon  1.4 s: he bows, the rings tilting forward, and at frame 24 flicks them up: the
                Sky wollas come (extras.muzzle: where they come from).
    FlipDeath   2.4 s: shudders, the rings come apart, fall one after the other and lie flat on
                the floor. Held.
    FlipBall    (a prop, not a clip): the ball of light he throws, a little ring round it.

Headless:
    Blender -b --python blender/flip.py -- assets/flip.glb blender/flip.blend \
        blender/previews/flip-preview.png
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

NAME, RIG_NAME, PROP = "Flip", "FlipRig", "FlipBall"
SCENE, COLLECTION, STAGE = "Flip", "FlipAsset", "FlipStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
CLIPS = ("FlipHover", "FlipThrow", "FlipFlip", "FlipHole", "FlipSummon", "FlipDeath")

RING_HEX, PALE_HEX, BALL_HEX = "#6fcbff", "#b8ecff", "#a8e6ff"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("FlipRings_glow", RING_HEX, 0.35), ("FlipRingsPale_glow", PALE_HEX, 0.45))
RINGS_M, PALE_M = range(len(MATERIALS))
BALL_MATERIALS = (("FlipBall_glow", BALL_HEX, 2.2),)

VOXEL = 0.0075
HOVER_FRAMES, HOVER_SPEED = 48, 0.6
THROW_FRAMES, THROW_HIT = 36, 18
FLIP_FRAMES, FLIP_HIT = 66, 40
HOLE_FRAMES, HOLE_HIT = 54, 32
SUMMON_FRAMES, SUMMON_HIT = 42, 24
DEATH_FRAMES = 72
LOOP_T = HOVER_FRAMES / FPS

# --- body plan -----------------------------------------------------------------
# the big rings: centre (x, depth y, up z), radius, little loops round it
RINGS = ((V((0.14, 0.0, 1.6)), 0.5, 15), (V((-0.4, 0.07, 1.0)), 0.46, 14), (V((0.4, -0.07, 0.78)), 0.37, 12))
LOOP_A, LOOP_B, TUBE = 0.092, 0.05, 0.022   # a little loop: half its length (outward), half its width, its tube
PIVOT = V((0, 0, 1.15))


def loop_points(k, i, n=40):
    """The centre line of loop i of ring k: an ellipse in the ring's plane, long side outward."""
    c, r, count = RINGS[k]
    a = TAU * (i + 0.5 * (k % 2)) / count
    out, side = V((math.cos(a), 0, math.sin(a))), V((-math.sin(a), 0, math.cos(a)))
    mid = c + out * r
    return [mid + out * (LOOP_A * math.cos(t)) + side * (LOOP_B * math.sin(t)) for t in np.linspace(0, TAU, n)]


def build_mesh(coll):
    parts = K.Parts()
    for k, (c, r, count) in enumerate(RINGS):
        for i in range(count):
            pts = loop_points(k, i)
            lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))) - V((TUBE + 0.02,) * 3)
            hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))) + V((TUBE + 0.02,) * 3)
            parts.add(f"ring{k}", lambda P, pts=pts: F._sd_polyline(P, pts, TUBE), lo, hi, VOXEL,
                      mat=PALE_M if (i + k) % 3 == 0 else RINGS_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "flip"
    obj["ring_color"] = RING_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_prop(coll):
    """The ball of light he throws: a glowing ball with a little ring round it (a plain mesh)."""
    parts = K.Parts()
    parts.add("ball", lambda P: F._sd_sphere(P, (0, 0, 0), 0.13), (-0.16,) * 3, (0.16,) * 3, 0.008, mat=0)
    ring = [V((0.21 * math.cos(t), 0.21 * math.sin(t) * 0.35, 0.21 * math.sin(t))) for t in np.linspace(0, TAU, 36)]
    parts.add("ball", lambda P: F._sd_polyline(P, ring, 0.018), (-0.25, -0.1, -0.25), (0.25, 0.1, 0.25), 0.008, mat=0)
    obj = parts.mesh(PROP, coll, BALL_MATERIALS)
    K.decimate(obj, 1200)
    return obj


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", PIVOT, PIVOT + V((0, 0, 0.2)), "root", False, fwd)]
    for k, (c, r, count) in enumerate(RINGS):
        bones.append((f"ring{k}", c, c + V((0, -0.2, 0)), "body", True, up))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "flip", "forward": "-Y", "attack_style": "throw", "normal_speed": HOVER_SPEED, "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:                 # every loop rides its ring
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
    for name in ("FlipRings_glow", "FlipRingsPale_glow"):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.3
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
def ring(**kw):
    r = {"off": V(), "tilt": 0.0, "lean": 0.0, "turn": 0.0, "scale": 1.0}
    r.update(kw)
    return r


def params(**kw):
    p = {"pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "rings": [ring() for _ in RINGS]}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        body = L @ Matrix.Translation(p["pos"]) @ K.about(PIVOT, R)
        bases["body"] = skel.set("body", poses, body @ skel.rest["body"])
        for k, (c, r, count) in enumerate(RINGS):
            q = p["rings"][k]
            # tilted about its horizontal axis (front up), leaned sideways, turned in its plane, scaled
            rot = C.rot_x(q["tilt"]) @ C.rot_z(q["lean"]) @ C.rot_y(q["turn"])
            world = body @ Matrix.Translation(c + q["off"]) @ rot.to_4x4() @ Matrix.Diagonal((q["scale"],) * 3 + (1,))
            bases[f"ring{k}"] = skel.set(f"ring{k}", poses, world @ skel.rest_rot[f"ring{k}"].to_4x4())
        return bases
    return solve


def sway(t, k, amp=1.0):
    """Ring k floating on its own, out of step with the others (whole multiples of the loop)."""
    w = TAU * t / LOOP_T
    lag = 2.1 * k
    return {"off": V((0.02 * math.sin(w + lag), 0.015 * math.sin(w + lag + 1), 0.025 * math.sin(2 * w + lag))) * amp,
            "tilt": D(5) * math.sin(w + lag + 0.5) * amp, "lean": D(4) * math.sin(w + lag + 2) * amp,
            "turn": D(6) * math.sin(w + lag) * amp}


def hover(f):
    t = f / FPS
    w = TAU * f / HOVER_FRAMES
    return params(pos=V((0, 0, 0.05 * math.sin(w))), pitch=D(3) * math.sin(w + 1), roll=D(2) * math.sin(w),
                  rings=[ring(**sway(t, k)) for k in range(len(RINGS))])


def centroid():
    return sum((c for c, r, n in RINGS), V()) / len(RINGS)


def throw(f):
    k, t = C.keyframes, f / FPS
    hit = THROW_HIT / FPS
    back = k((0, 0), (hit - 0.1, 1), (hit, 0))(t)
    push = k((0, 0), (hit - 0.08, 0), (hit + 0.05, 1), (hit + 0.3, 0.4), (THROW_FRAMES / FPS, 0))(t)
    mid = centroid()
    rings = []
    for i, (c, r, n) in enumerate(RINGS):
        s = sway(t, i, 1 - 0.8 * min(1, back + push))
        draw = (mid - c) * 0.25 * back
        lift = V((0, 0, 0.12)) * back if i == 0 else V()
        rings.append(ring(off=s["off"] + draw + lift + V((0, -0.18 * push, 0)), tilt=s["tilt"] + D(12) * back - D(10) * push,
                          lean=s["lean"], turn=s["turn"] + D(40) * back - D(30) * push, scale=1 - 0.08 * back + 0.08 * push))
    return params(pos=V((0, 0.08 * back - 0.14 * push, 0.04 * back)), pitch=D(-12) * back + D(14) * push, rings=rings)


def flip_clip(f):
    k, t = C.keyframes, f / FPS
    hit = FLIP_HIT / FPS
    rise = k((0, 0), (0.5, 1), (hit + 0.2, 1), (FLIP_FRAMES / FPS, 0))(t)
    spin = k((0, 0), (0.55, 0), (hit, 1))(t)                 # right round about his forward axis
    shake = math.sin(TAU * 11 * t) * C.smoothstep(0.2, 0.5, t) * (1 - C.smoothstep(hit - 0.2, hit, t))
    mid = centroid()
    rings = []
    for i, (c, r, n) in enumerate(RINGS):
        s = sway(t, i, 1 - rise)
        rings.append(ring(off=s["off"] + (c - mid) * 0.22 * rise + V((0.01 * shake * (-1) ** i, 0, 0)),
                          tilt=s["tilt"] + D(6) * shake, lean=s["lean"], turn=s["turn"] + TAU * spin * (1 if i % 2 else -1),
                          scale=1 + 0.1 * rise))
    return params(pos=V((0, 0, 0.18 * rise)), roll=TAU * spin, pitch=D(-6) * rise, rings=rings)


def hole(f):
    k, t = C.keyframes, f / FPS
    hit = HOLE_HIT / FPS
    knot = k((0, 0), (hit - 0.12, 1), (hit + 0.02, 0))(t)
    burst = k((0, 0), (hit - 0.04, 0), (hit + 0.1, 1), (hit + 0.5, 0.25), (HOLE_FRAMES / FPS, 0))(t)
    shake = math.sin(TAU * 13 * t) * knot
    mid = centroid()
    rings = []
    for i, (c, r, n) in enumerate(RINGS):
        s = sway(t, i, 1 - min(1, knot + burst))
        rings.append(ring(off=s["off"] + (mid - c) * 0.6 * knot + (c - mid) * 0.5 * burst + V((0.012 * shake, 0, 0.008 * shake * (-1) ** i)),
                          tilt=s["tilt"] + D(25) * knot * (1 if i % 2 else -1), lean=s["lean"] + D(15) * knot,
                          turn=s["turn"] + D(160) * knot * (1 if i % 2 else -1), scale=1 - 0.2 * knot + 0.1 * burst))
    return params(pos=V((0, 0, 0.05 * knot)), pitch=D(4) * burst, rings=rings)


def summon(f):
    k, t = C.keyframes, f / FPS
    hit = SUMMON_HIT / FPS
    bow = k((0, 0), (hit - 0.1, 1), (hit, 0.2), (SUMMON_FRAMES / FPS, 0))(t)
    flick = k((0, 0), (hit - 0.05, 0), (hit + 0.08, 1), (hit + 0.4, 0))(t)
    rings = []
    for i, (c, r, n) in enumerate(RINGS):
        s = sway(t, i, 1 - min(1, bow + flick))
        rings.append(ring(off=s["off"] + V((0, -0.1 * bow, 0.1 * flick)), tilt=s["tilt"] - D(28) * bow + D(18) * flick,
                          lean=s["lean"], turn=s["turn"] + D(60) * flick * (1 if i % 2 else -1)))
    return params(pos=V((0, -0.05 * bow, -0.18 * bow + 0.1 * flick)), pitch=D(16) * bow - D(8) * flick, rings=rings)


def death(f):
    k, t = C.keyframes, f / FPS
    shudder = math.sin(TAU * 10 * t) * (1 - C.smoothstep(0.1, 0.6, t))
    rings = []
    outs = (V((0.25, -0.3, 0)), V((-0.55, 0.15, 0)), V((0.6, 0.25, 0)))
    for i, (c, r, n) in enumerate(RINGS):
        start = 0.35 + 0.22 * i
        fall = C.smoothstep(start, start + 0.55, t)
        bounce = math.exp(-7 * max(0, t - start - 0.55)) * abs(math.sin(TAU * 1.6 * max(0, t - start - 0.55))) * 0.12 if t > start + 0.55 else 0
        floor = V((0, 0, 0.03 - c.z))
        rings.append(ring(off=(floor + outs[i]) * fall + V((0.015 * shudder * (-1) ** i, 0, bounce)),
                          tilt=D(90) * fall + D(5) * shudder, lean=D(10) * math.sin(3 * i + 1) * fall * (1 - fall) * 4,
                          turn=D(40 + 30 * i) * fall))
    return params(roll=D(3) * shudder, pos=V((0, 0, 0)), rings=rings)


def ring_point(rig, action, frame, k, ahead=0.0):
    """Armature-space centre of ring k, `ahead` along its axis (forward)."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[f"ring{k}"]
    m = rig.matrix_world @ pb.matrix
    return m.translation + (m.to_3x3() @ V((0, 1, 0))).normalized() * ahead


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "FlipHover", solver(rig, hover), HOVER_FRAMES, cyclic=True, extras={"speed": HOVER_SPEED})
    a = K.ground_clip(rig, obj, "FlipThrow", solver(rig, throw), THROW_FRAMES,
                      extras={"attack_style": "throw", "hit_frame": THROW_HIT, "hit_time": THROW_HIT / FPS})
    a.pose_markers.new("Throw").frame = THROW_HIT
    m = ring_point(rig, "FlipThrow", THROW_HIT, 0, 0.25)
    a["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    b = K.ground_clip(rig, obj, "FlipFlip", solver(rig, flip_clip), FLIP_FRAMES,
                      extras={"attack_style": "cast", "hit_frame": FLIP_HIT, "hit_time": FLIP_HIT / FPS})
    b.pose_markers.new("Flip").frame = FLIP_HIT
    h = K.ground_clip(rig, obj, "FlipHole", solver(rig, hole), HOLE_FRAMES,
                      extras={"attack_style": "cast", "hit_frame": HOLE_HIT, "hit_time": HOLE_HIT / FPS})
    h.pose_markers.new("Hole").frame = HOLE_HIT
    s = K.ground_clip(rig, obj, "FlipSummon", solver(rig, summon), SUMMON_FRAMES,
                      extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    s.pose_markers.new("Summon").frame = SUMMON_HIT
    n = ring_point(rig, "FlipSummon", SUMMON_HIT, 2, 0.3)
    s["muzzle"] = [round(n.x, 3), round(n.z, 3), round(-n.y, 3)]
    K.ground_clip(rig, obj, "FlipDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 2.2}, settle_from=round(2.0 * FPS))
    K.register(rig, CLIPS)
    return {"throw": list(a["muzzle"]), "summon": list(s["muzzle"])}


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    shots = [("FlipHover", 0, (0.8, -6.0, 1.8)), ("FlipHover", 20, (-4.5, -3.5, 2.6)),
             ("FlipThrow", THROW_HIT, (3.5, -4.8, 2.0)), ("FlipFlip", 28, (0.6, -6.0, 1.8)),
             ("FlipHole", HOLE_HIT - 4, (1.5, -5.6, 2.0)), ("FlipDeath", DEATH_FRAMES, (3.0, -4.0, 3.6))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 1.1), size=360, cols=3)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    K.decimate(obj)
    muzzles = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("FlipDeath",))
    report["muzzles"] = muzzles
    K.setup_stage(scene, "Flip", STAGE, (0, 0, 1.1), 3.2)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, HOVER_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True             # (it stays at the origin: the game clones it as it is)
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Flip", NAME, (0, 0, 1.1), 4.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Flip:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "flip.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "flip.blend"),
         preview_path=args[2] if len(args) > 2 else None)
