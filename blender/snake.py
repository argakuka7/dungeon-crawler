"""
Snake: a light green clay snake from the whiteboard sketch.

The front of the body rises from the ground in an S-curve (cobra-like), with
a ribbed band where the neck bends, and ends in a long-snouted head with a
hinged lower jaw, two little fangs and shining purple eyes with slit pupils.
The rest of the body and the tapering tail lie on the floor behind it.
Faces -Y in Blender, +Z up; one unit = one game cell (exported at scale 1).

The body is ONE tube along an arc-length parametrised centre line. A chain
of bones follows that line (6 tail bones behind the neck base, 5 neck bones
in front of it), then head, jaw and two eye bones (eye scale = glow fade).
Every pose is generated as a centre line (a "turtle" integrating heading /
pitch along the body, so the body never stretches) and the chain is aimed
along it; skin weights are a smooth function of the arc length.

Clips, 30 fps, in place (the game supplies root motion):
    SnakeWalk    30-frame loop. A lateral wave runs backwards along the body
                 at exactly the walking speed (extras.speed), so the body
                 slides along a path that stays fixed on the floor while the
                 game moves the snake: real serpentine locomotion.
    SnakeAttack  1.0 s: coil back with the mouth open, strike forward and
                 down, snap the jaw shut on the bite (frame 12), recover.
    SnakeDeath   2.0 s: rear up, collapse onto the floor, roll the head onto
                 its side, writhe, curl the tail; the eyes fade. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, snake; importlib.reload(creature); importlib.reload(snake)
    snake.main(export_path="<repo>/assets/snake.glb", blend_path="<repo>/blender/snake.blend")

Headless:
    Blender -b --python blender/snake.py -- assets/snake.glb blender/snake.blend
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

NAME, RIG_NAME = "Snake", "SnakeRig"
SCENE, COLLECTION, STAGE = "Snake", "SnakeAsset", "SnakeStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
BODY_HEX = "#a6dd7e"
RING_HEX = "#78b552"
MOUTH_HEX = "#4b1d2e"
FANG_HEX = "#f2eedb"
CLIPS = ("SnakeWalk", "SnakeAttack", "SnakeDeath")

R = 0.085                     # body radius
TIP_R = 0.016
TAIL_LEN, NECK_LEN, HEAD_LEN = 0.72, 0.62, 0.27
TAIL_BONES, NECK_BONES = 6, 5
DS = 0.01
NT, NN = round(TAIL_LEN / DS), round(NECK_LEN / DS)
S_A, S_H = TAIL_LEN, TAIL_LEN + NECK_LEN      # arc length of neck base / head base
ANCHOR = Vector((0, 0.16, R))                 # where the neck leaves the floor
WALK_FRAMES, WALK_SPEED = 30, 0.6
WAVE = WALK_SPEED * WALK_FRAMES / FPS         # wavelength = distance per loop
AMP = 0.62                                    # peak heading of the wave, radians
ATTACK_FRAMES, HIT_FRAME = 30, 12
DEATH_FRAMES = 60
VOXEL, DETAIL = 0.012, 0.007

TAIL_CHAIN = [(f"tail_{i + 1}", S_A - i * TAIL_LEN / TAIL_BONES, S_A - (i + 1) * TAIL_LEN / TAIL_BONES)
              for i in range(TAIL_BONES)]
NECK_CHAIN = [("body" if i == 0 else f"neck_{i}", S_A + i * NECK_LEN / NECK_BONES,
               S_A + (i + 1) * NECK_LEN / NECK_BONES) for i in range(NECK_BONES)]


def radius(s):
    tail = TIP_R + (R - TIP_R) * C.smoothstep(0, 0.5, s)
    return tail - 0.012 * C.smoothstep(S_A + 0.1, S_H, s)


# --- pose = centre line ------------------------------------------------------
def params(**kw):
    p = {"anchor": Vector(), "phase": 0.0, "amp": AMP, "curl": 0.0, "tremble": 0.0,
         "rise": D(80), "end": D(-10), "neck_yaw": 0.0, "sway": 0.0,
         "head_pitch": 0.0, "head_yaw": 0.0, "head_roll": 0.0, "jaw": 0.0, "eyes": 1.0, "t": 0.0}
    p.update(kw)
    return p


def direction(pitch, yaw):
    return Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))


def neck_angles(p, u):
    pitch = (p["rise"] * C.smoothstep(0, 0.42, u) * (1 - C.smoothstep(0.58, 1, u))
             + p["end"] * C.smoothstep(0.58, 1, u))
    return pitch, p["neck_yaw"] + p["sway"] * math.sin(math.pi * u)


def centerline(p):
    """Points at s = 0, DS, ..., S_H (tail tip to head base) and the head direction."""
    anchor = ANCHOR + p["anchor"]
    tail, pos = [], anchor.copy()
    for i in range(1, NT + 1):
        d = (i - 0.5) * DS
        env = C.smoothstep(0, 0.28, d)
        theta = (p["amp"] * env * math.sin(TAU * (d / WAVE - p["phase"])) + p["curl"] * d
                 + p["tremble"] * C.smoothstep(0.35, TAIL_LEN, d) * math.sin(TAU * 11 * p["t"] - 9 * d))
        pos = pos + Vector((math.sin(theta), math.cos(theta), 0)) * DS
        lifted = max(0.0, anchor.z - R) * (1 - C.smoothstep(0, 0.3, i * DS))
        tail.append(Vector((pos.x, pos.y, radius(S_A - i * DS) + lifted)))
    neck, pos = [], anchor.copy()
    for i in range(1, NN + 1):
        pitch, yaw = neck_angles(p, (i - 0.5) / NN)
        pos = pos + direction(pitch, yaw) * DS
        neck.append(pos.copy())
    pitch, yaw = neck_angles(p, 1)
    head = direction(p["end"] + p["head_pitch"], yaw + p["head_yaw"])
    return tail[::-1] + [anchor] + neck, head


def head_frame(forward, roll=0.0):
    side = Vector((0, 0, 1)).cross(forward).normalized()
    up = forward.cross(side).normalized()
    if roll:
        rot = Matrix.Rotation(roll, 3, forward)
        side, up = rot @ side, rot @ up
    return side, forward.normalized(), up


def walk(f):
    ph = (f / WALK_FRAMES) % 1
    w = TAU * ph
    return params(phase=ph, neck_yaw=0.10 * math.sin(-w + 0.5), sway=0.05 * math.sin(-w + 1.4),
                  head_yaw=-0.10 * math.sin(-w + 0.6), rise=D(80 + 3 * math.sin(2 * w)),
                  end=D(-10 + 4 * math.sin(2 * w + 1)), jaw=D(2) * (0.5 + 0.5 * math.sin(2 * w)))


REST = walk(0)


# --- sculpture ---------------------------------------------------------------
def rest_shape():
    pts, head = centerline(REST)
    return pts, head, head_frame(head)


def head_parts(H, frame):
    """SDFs in the head frame (x: side, y: forward, z: up) at the head base H."""
    def q(P):
        return K.local(P, H, frame)

    def upper(P):
        Q = q(P)
        skull = K.ellipsoid(Q, (0, 0.07, 0.015), (0.095, 0.125, 0.082))
        snout = K.ellipsoid(Q, (0, 0.175, -0.002), (0.07, 0.115, 0.056))
        d = K.smin(skull, snout, 0.05)
        for s in (1, -1):        # brow ridges over the eyes
            d = K.smin(d, K.ellipsoid(Q, (s * 0.058, 0.075, 0.068), (0.04, 0.052, 0.024)), 0.02)
        return K.smax(d, -(Q[..., 2] + 0.024), 0.01)

    def jaw(P):
        Q = q(P)
        d = K.ellipsoid(Q, (0, 0.135, -0.036), (0.064, 0.15, 0.032))
        return K.smax(d, Q[..., 2] + 0.026, 0.008)

    def mouth(P):
        return K.ellipsoid(q(P), (0, 0.13, -0.026), (0.056, 0.13, 0.011))

    def fangs(P):
        Q = q(P)
        return np.minimum(*(K.round_cone(Q, (s * 0.032, 0.225, -0.02), (s * 0.032, 0.232, -0.066), 0.012, 0.003)
                            for s in (1, -1)))
    return upper, jaw, mouth, fangs


def eye_center(sign, H, frame):
    side, fwd, up = frame
    return H + side * (sign * 0.066) + fwd * 0.085 + up * 0.052


def build_mesh(coll):
    pts, head, frame = rest_shape()
    H = pts[-1]
    upper, jaw, mouth, fangs = head_parts(H, frame)
    radii = [radius(i * DS) for i in range(len(pts))]
    tube_pts, tube_r = pts[::3] + [pts[-1]], radii[::3] + [radii[-1]]

    def body(P):
        d = K.smin(K.tapered_tube(P, tube_pts, tube_r), upper(P), 0.035)
        return K.smax(d, -P[..., 2], 0.008)

    parts = K.Parts()
    side, fwd, up = frame
    head_box = [H + side * x + fwd * y + up * z for x in (-0.12, 0.12) for y in (-0.08, 0.32) for z in (-0.1, 0.12)]
    lo, hi = K.bounds(pts + head_box, 0.12)
    parts.add("body", body, lo, hi, VOXEL)
    lo, hi = K.bounds(head_box, 0.02)
    parts.add("jaw", jaw, lo, hi, DETAIL)
    parts.add("head", mouth, lo, hi, DETAIL, mat=2)
    parts.add("head", fangs, lo, hi, 0.005, mat=3)
    for s_name, sign in (("L", 1), ("R", -1)):
        e = eye_center(sign, H, frame)
        normal = (e - (H + fwd * 0.07 + up * 0.015)).normalized()
        parts.add(f"eye.{s_name}", lambda P, c=e: K.F._sd_sphere(P, c, 0.031), e - Vector((0.05,) * 3),
                  e + Vector((0.05,) * 3), 0.005, mat=4)
        pupil = e + normal * 0.026
        parts.add(f"eye.{s_name}", lambda P, c=pupil: K.ellipsoid(K.local(P, c, frame), (0, 0, 0), (0.006, 0.0075, 0.019)),
                  pupil - Vector((0.03,) * 3), pupil + Vector((0.03,) * 3), 0.004, mat=5)
    # Ribs across the neck bend, as drawn: thin rings hugging the tube.
    for k in range(7):
        s = S_A + NECK_LEN * (0.22 + 0.06 * k)
        i = round(s / DS)
        c, t = pts[i], (pts[i + 1] - pts[i - 1]).normalized()
        a = t.orthogonal().normalized()
        b = t.cross(a)
        rr = radius(s) - 0.001
        ring = [c + (a * math.cos(x) + b * math.sin(x)) * rr for x in np.linspace(0, TAU, 25)]
        lo, hi = K.bounds(ring, 0.03)
        parts.add("ring", lambda P, r=ring: K.smax(K.polyline(P, r, 0.0085), -P[..., 2], 0.004),
                  lo, hi, 0.006, mat=1, s=s)
    obj = parts.mesh(NAME, coll, (("SnakeBody", BODY_HEX, 0), ("SnakeRibs", RING_HEX, 0),
                                  ("SnakeMouth", MOUTH_HEX, 0), ("SnakeFangs", FANG_HEX, 0),
                                  ("SnakeEyes_glow", K.EYE_HEX, K.EYE_STRENGTH), ("SnakePupils", K.PUPIL_HEX, 0)))
    obj["enemy"] = "snake"
    obj["body_color"] = BODY_HEX
    obj["eye_color"] = K.EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    pts, head, frame = rest_shape()
    at = lambda s: pts[round(s / DS)]
    side, fwd, up = frame
    H = pts[-1]
    X = (1, 0, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, (0, 0, 1))]
    for i, (name, s0, s1) in enumerate(NECK_CHAIN):
        bones.append((name, at(s0), at(s1), "root" if i == 0 else NECK_CHAIN[i - 1][0], True, X))
    for i, (name, s0, s1) in enumerate(TAIL_CHAIN):
        bones.append((name, at(s0), at(s1), "body" if i == 0 else TAIL_CHAIN[i - 1][0], True, X))
    bones.append(("head", H, H + fwd * HEAD_LEN, NECK_CHAIN[-1][0], True, X))
    hinge = H + fwd * 0.0 + up * -0.03
    bones.append(("jaw", hinge, hinge + fwd * 0.2, "head", True, X))
    for s_name, sign in (("L", 1), ("R", -1)):
        e = eye_center(sign, H, frame)
        bones.append((f"eye.{s_name}", e, e + fwd * 0.06, "head", True, X))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "snake", "forward": "-Y", "attack_style": "bite", "normal_speed": WALK_SPEED,
        "eye_light": K.EYE_HEX, "eye_intensity": K.EYE_STRENGTH, "root_motion": False})


def chain_weights(s, names):
    """Linear blend between neighbouring bone centres along the arc length."""
    centers = [((s0 + s1) / 2, name) for name, s0, s1 in TAIL_CHAIN + NECK_CHAIN]
    centers = sorted(centers) + [(S_H + 0.03, "head")]
    W = np.zeros((len(s), len(names)), np.float32)
    cs = np.array([c for c, _ in centers])
    idx = np.clip(np.searchsorted(cs, s) - 1, 0, len(cs) - 2)
    t = np.clip((s - cs[idx]) / (cs[idx + 1] - cs[idx]), 0, 1)
    t = t * t * (3 - 2 * t)
    for k, (_, name) in enumerate(centers):
        j = names.index(name)
        W[:, j] += np.where(idx == k, 1 - t, 0) + np.where(idx + 1 == k, t, 0)
    return W


def compute_weights(obj, owners):
    pts, head, frame = rest_shape()
    line = pts + [pts[-1] + head * k for k in np.linspace(0.02, HEAD_LEN, 10)]
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind == "body":
            _, s = C._polyline_closest(P[lo:hi], line)
            W[lo:hi] = chain_weights(s, names)
        elif kind == "ring":
            W[lo:hi] = chain_weights(np.full(hi - lo, o["s"], np.float32), names)
        else:
            W[lo:hi, names.index(kind)] = 1
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
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        L = Vector((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, Matrix.Translation(L) @ skel.rest["root"])
        pts, head = centerline(p)
        at = lambda s: pts[round(s / DS)] + L
        for name, s0, s1 in NECK_CHAIN + TAIL_CHAIN:
            bases[name] = K.aim_at(skel, name, poses, at(s0), at(s1) - at(s0))
        spin = Matrix.Rotation(p["head_roll"], 3, head) if p["head_roll"] else None
        bases["head"] = K.aim_at(skel, "head", poses, at(S_H), head, spin)
        base = skel.base("jaw", poses)
        side = base.col[2].xyz.normalized()
        opened = Matrix.Translation(base.translation) @ (Matrix.Rotation(p["jaw"], 3, side) @ base.to_3x3()).to_4x4()
        bases["jaw"] = skel.set("jaw", poses, opened)
        for s_name in ("L", "R"):
            base = skel.base(f"eye.{s_name}", poses)
            e = max(0.05, p["eyes"])
            bases[f"eye.{s_name}"] = skel.set(f"eye.{s_name}", poses, base @ Matrix.Diagonal((e, e, e, 1)))
        return bases
    return solve


def attack(f):
    k, t = C.keyframes, f / FPS
    hit = HIT_FRAME / FPS
    return params(
        t=t, tremble=0.35 * C.smoothstep(0.0, 0.15, t) * (1 - C.smoothstep(0.6, 0.95, t)),
        anchor=Vector((0, k((0, 0), (0.26, 0.07), (hit, -0.2), (0.55, -0.18), (1.0, 0))(t), 0)),
        rise=D(k((0, 80), (0.26, 98), (hit, 52), (0.55, 55), (1.0, 80))(t)),
        end=D(k((0, -10), (0.26, 16), (hit, -22), (0.55, -18), (1.0, -10))(t)),
        head_pitch=D(k((0, 0), (0.26, 10), (hit, -8), (0.55, -4), (1.0, 0))(t)),
        jaw=D(k((0, 0), (0.08, 4), (0.26, 52), (hit - 0.04, 56), (hit, 2), (0.55, 0), (1.0, 0))(t)),
        head_yaw=D(4) * math.sin(TAU * 7 * t) * math.exp(-10 * max(0, t - hit)) * (t > hit))


def death(f):
    k, t = C.keyframes, f / FPS
    return params(
        t=t, phase=k((0, 0), (1.4, 0.8))(t), amp=AMP * k((0, 1), (0.3, 1.5), (1.4, 0.7))(t),
        curl=k((0, 0), (1.4, -2.4))(t),
        rise=D(k((0, 80), (0.22, 100), (0.85, 3), (1.0, 8), (1.25, 2))(t)),
        end=D(k((0, -10), (0.22, 22), (0.85, -2), (1.25, 0))(t)),
        jaw=D(k((0, 0), (0.22, 42), (0.9, 6), (1.3, 8))(t)),
        neck_yaw=k((0, 0), (0.3, 0.1), (1.05, 0.95), (1.3, 0.9))(t),
        sway=k((0, 0), (0.9, -0.9), (1.3, -0.85))(t),
        head_yaw=k((0, 0), (1.05, 0.35))(t),
        head_roll=D(k((0, 0), (0.6, 0), (1.05, 78), (1.3, 72))(t)),
        eyes=k((0, 1), (0.4, 1), (1.25, 0.08))(t))


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SnakeWalk", solver(rig, walk), WALK_FRAMES, cyclic=True,
                  extras={"speed": WALK_SPEED, "wavelength": WAVE})
    act = K.ground_clip(rig, obj, "SnakeAttack", solver(rig, attack), ATTACK_FRAMES,
                        extras={"attack_style": "bite", "hit_frame": HIT_FRAME, "hit_time": HIT_FRAME / FPS})
    act.pose_markers.new("Bite").frame = HIT_FRAME
    K.ground_clip(rig, obj, "SnakeDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.4})
    K.register(rig, CLIPS)


def snout(rig, action, frame):
    """World position of the snout tip in a clip frame (for tuning reach)."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones["head"]
    return tuple(round(v, 3) for v in rig.matrix_world @ pb.tail)


def main(export_path=None, blend_path=None, previews=None):
    scene, rig, obj = build()
    K.decimate(obj)
    animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("SnakeDeath",))
    report["bite"] = snout(rig, "SnakeAttack", HIT_FRAME)
    K.setup_stage(scene, "Snake", STAGE, (0, 0.2, 0.3), 2.4)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Snake", NAME, (0, 0.2, 0.3), 3)
    print("Snake:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "snake.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "snake.blend"))
