"""
Fire-cat: a dark red, striped cat that is slightly on fire, from the whiteboard sketch.

A lean big cat with long legs, pointy ears, dark zig-zag stripes over its
back, glowing amber eyes with slit pupils and a long S-curved tail. It is
slightly on fire: a flame burns on the tip of its tail, a few small flames
run along its spine and a mane of flame spikes stands around its head.
Faces -Y in Blender, +Z up; one unit = one game cell.

The body, head, legs and tail are one OpenVDB SDF skinned to a spine (hips,
chest, neck, head), two-bone legs with paws and a five-bone tail. Jaw,
eyes, nose and every flame are rigid parts on their own bones; each flame
bone flickers (the game adds its own flicker on top, so the flames keep
burning while the cat stands still).

Clips, 30 fps, in place (the game supplies root motion):
    CatWalk     30-frame prowl loop at 0.6 cells/s (lateral-sequence walk).
    CatRun      12-frame rotary gallop loop at 3.4 cells/s, with a flexing spine.
    CatPounce   1.2 s: crouch, leap (the game carries it forward between
                extras.lunge_from and lunge_to), land and bite at
                extras.hit_frame (20), tug, recover.
    CatDeath    2.0 s: flinch, collapse onto its side, the flames die down,
                the eyes fade. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, firecat; importlib.reload(creature); importlib.reload(firecat)
    firecat.main(export_path="<repo>/assets/firecat.glb", blend_path="<repo>/blender/firecat.blend")

Headless:
    Blender -b --python blender/firecat.py -- assets/firecat.glb blender/firecat.blend
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

NAME, RIG_NAME = "FireCat", "FireCatRig"
SCENE, COLLECTION, STAGE = "FireCat", "FireCatAsset", "FireCatStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
BODY_HEX, STRIPE_HEX = "#7e1a14", "#2e0806"
EYE_HEX, PUPIL_HEX, NOSE_HEX = "#ffc436", "#1a0503", "#2a0806"
FLAME_HEX, FLAME_CORE_HEX = "#ff5a14", "#ffa22a"
CLIPS = ("CatWalk", "CatRun", "CatPounce", "CatDeath")
SIDES = (("L", 1), ("R", -1))
V = Vector

# spine
HIP_C, MID, CHEST_C = V((0, 0.30, 0.45)), V((0, 0.05, 0.455)), V((0, -0.21, 0.47))
NECK_A, NECK_B = V((0, -0.23, 0.50)), V((0, -0.36, 0.62))
HEAD_C, HEAD_R = V((0, -0.43, 0.665)), (0.112, 0.105, 0.098)
NOSE_TIP = V((0, -0.585, 0.65))
JAW_HINGE = V((0, -0.44, 0.612))
# legs: (joint, middle joint, paw), per side sign
FORE = lambda s: (V((s * 0.085, -0.17, 0.40)), V((s * 0.092, -0.13, 0.215)), V((s * 0.092, -0.19, 0.036)))
HIND = lambda s: (V((s * 0.092, 0.28, 0.39)), V((s * 0.094, 0.41, 0.18)), V((s * 0.094, 0.34, 0.036)))
LEGS = {f"{k}.{s}": (FORE if k == "fore" else HIND)(sign) for k in ("fore", "hind") for s, sign in SIDES}
UPPER = {"fore": "upperarm", "hind": "thigh"}
LOWER = {"fore": "forearm", "hind": "shin"}
PAW = {"fore": "fpaw", "hind": "hpaw"}
TAIL = [V((0, 0.40, 0.475)), V((0, 0.53, 0.50)), V((0, 0.63, 0.56)), V((0, 0.69, 0.66)), V((0, 0.705, 0.78)),
        V((0, 0.675, 0.88))]
TAIL_R = (0.042, 0.036, 0.032, 0.03, 0.029, 0.03)
FLAMES = {   # name: (parent, base, up direction, length, base radius, curl)
    "flame_tail": ("tail_5", V((0, 0.67, 0.885)), V((0, -0.15, 1)), 0.27, 0.07, 0.06),
    "flame_back1": ("hips", V((0, 0.24, 0.555)), V((0, 0.45, 1)), 0.15, 0.046, 0.035),
    "flame_back2": ("hips", V((0, 0.07, 0.565)), V((0, 0.45, 1)), 0.17, 0.05, -0.035),
    "flame_back3": ("chest", V((0, -0.10, 0.575)), V((0, 0.45, 1)), 0.16, 0.046, 0.035),
}
for _i, (_x, _z) in enumerate(((0, 1), (0.62, 0.78), (-0.62, 0.78), (0.95, 0.25), (-0.95, 0.25))):
    _d = V((_x, 0, _z)).normalized()
    FLAMES[f"flame_mane{_i + 1}"] = ("head", HEAD_C + V((0, 0.07, 0)) + _d * 0.085, (_d + V((0, 0.55, 0))).normalized(),
                                     0.13 if _i else 0.15, 0.034, 0.025 * (-1) ** _i)
WALK_FRAMES, WALK_SPEED = 30, 0.6
RUN_FRAMES, RUN_SPEED = 12, 3.4
POUNCE_FRAMES, HIT_FRAME = 36, 20
LUNGE_FROM, LUNGE_TO = 0.30, 0.60
DEATH_FRAMES = 60
VOXEL, DETAIL = 0.009, 0.005


def eyes():
    return {s: V((sign * 0.052, -0.515, 0.69)) for s, sign in SIDES}


# --- sculpture ---------------------------------------------------------------
def torso_sdf(P):
    d = K.round_cone(P, HIP_C + V((0, 0.06, 0)), CHEST_C, 0.112, 0.128)
    d = K.smin(d, K.ellipsoid(P, V((0, 0.02, 0.43)), (0.115, 0.30, 0.115)), 0.06)      # belly
    d = K.smin(d, K.ellipsoid(P, CHEST_C + V((0, -0.02, -0.03)), (0.11, 0.1, 0.13)), 0.05)  # deep chest
    return d


def head_sdf(P):
    d = K.ellipsoid(P, HEAD_C, HEAD_R)
    d = K.smin(d, K.ellipsoid(P, V((0, -0.53, 0.645)), (0.062, 0.06, 0.048)), 0.04)          # muzzle
    for sign in (1, -1):
        d = K.smin(d, K.ellipsoid(P, V((sign * 0.075, -0.47, 0.64)), (0.05, 0.05, 0.045)), 0.03)  # cheeks
        a, b = V((sign * 0.062, -0.415, 0.735)), V((sign * 0.098, -0.40, 0.875))
        ear = K.round_cone(P, a, b, 0.045, 0.006)
        d = K.smin(d, ear, 0.025)
    return K.smax(d, -K.ellipsoid(P, V((0, -0.47, 0.585)), (0.05, 0.08, 0.022)), 0.01)     # mouth line


def neck_sdf(P):
    return K.round_cone(P, NECK_A, NECK_B, 0.085, 0.075)


def leg_sdf(P, name):
    kind = name.split(".")[0]
    a, m, p = LEGS[name]
    r0, r1, r2 = (0.062, 0.042, 0.034) if kind == "hind" else (0.052, 0.038, 0.033)
    d = K.smin(K.round_cone(P, a, m, r0, r1), K.round_cone(P, m, p, r1, r2), 0.02)
    paw = K.ellipsoid(P, p + V((0, -0.025, -0.002)), (0.044, 0.062, 0.034))
    return K.smin(d, paw, 0.025)


def tail_sdf(P):
    return K.tapered_tube(P, TAIL, TAIL_R)


def body_sdf(P):
    d = K.smin(torso_sdf(P), neck_sdf(P), 0.06)
    d = K.smin(d, head_sdf(P), 0.05)
    legs = None
    for name in LEGS:
        t = leg_sdf(P, name)
        legs = t if legs is None else np.minimum(legs, t)
    d = K.smin(d, legs, 0.05)
    d = K.smin(d, tail_sdf(P), 0.04)
    return K.smax(d, -P[..., 2], 0.006)


def stripes(centers):
    """Dark chevrons over the back and the flanks, as in the sketch's zig-zag."""
    x, y, z = centers[:, 0], centers[:, 1], centers[:, 2]
    chevron = np.sin(TAU * (y + 0.9 * np.abs(x)) / 0.105)
    on_body = (y > -0.20) & (y < 0.38) & (z > 0.37)
    tail = (y > 0.45) & (z > 0.5)
    ring = np.sin(TAU * (z - 0.4 * y) / 0.09)
    return np.where((on_body & (chevron > 0.45)) | (tail & (ring > 0.6)), 1, 0)


def flame_shape(name):
    """A main tongue with two smaller ones curling off its sides: [(points, radii)]."""
    _, base, up, length, r0, curl = FLAMES[name]
    up = up.normalized()
    side = (V((1, 0, 0)) if abs(up.x) < 0.7 else V((0, 1, 0)))
    side = (side - up * side.dot(up)).normalized()
    tongues = [K.flame_tongue(base, up, side, length, r0, curl, waves=1.5, tip=0.005, n=10)]
    for k in (1, -1):
        tilt = (up + side * (0.55 * k)).normalized()
        tongues.append(K.flame_tongue(base + side * (0.45 * r0 * k) + up * (0.15 * r0), tilt, side, 0.55 * length,
                                      0.62 * r0, -0.6 * curl * k, waves=1.4, tip=0.004, n=8))
    return tongues


def flame_sdf(P, name):
    d = None
    for pts, radii in flame_shape(name):
        t = K.tapered_tube(P, pts, radii)
        d = t if d is None else K.smin(d, t, 0.018)
    return d


def flame_bands(name):
    _, base, up, length, _, _ = FLAMES[name]

    def mats(centers):
        u = (centers - np.asarray(base, np.float32)) @ np.asarray(up.normalized(), np.float32) / length
        return np.where(u < 0.28 + 0.08 * np.sin(60 * centers[:, 0] + 40 * centers[:, 1]), 6, 5)
    return mats


MATERIALS = (("FireCatBody", BODY_HEX, 0), ("FireCatStripes", STRIPE_HEX, 0),
             ("FireCatEyes_glow", EYE_HEX, 2.2), ("FireCatPupils", PUPIL_HEX, 0),
             ("FireCatNose", NOSE_HEX, 0), ("FireCatFlame_glow", FLAME_HEX, 1.8),
             ("FireCatFlameCore_glow", FLAME_CORE_HEX, 1.6))


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.3, -0.7, -0.02), (0.3, 0.82, 0.95), VOXEL, mat=stripes)
    jaw = lambda P: K.ellipsoid(P, V((0, -0.50, 0.592)), (0.05, 0.068, 0.024))
    parts.add("jaw", jaw, V((-0.08, -0.6, 0.55)), V((0.08, -0.42, 0.63)), DETAIL, mat=0)
    parts.add("head", lambda P: K.ellipsoid(P, NOSE_TIP + V((0, 0.008, 0.002)), (0.022, 0.014, 0.014)),
              NOSE_TIP - V((0.04,) * 3), NOSE_TIP + V((0.04,) * 3), 0.004, mat=4)
    for s, sign in SIDES:
        e = eyes()[s]
        parts.add(f"eye.{s}", lambda P, c=e: K.ellipsoid(P, c, (0.03, 0.022, 0.026)), e - V((0.05,) * 3),
                  e + V((0.05,) * 3), 0.004, mat=2)
        pupil = e + V((0, -0.02, 0))
        parts.add(f"eye.{s}", lambda P, c=pupil: K.ellipsoid(P, c, (0.007, 0.006, 0.021)),
                  pupil - V((0.03,) * 3), pupil + V((0.03,) * 3), 0.003, mat=3)
    for name in FLAMES:
        lo, hi = K.bounds([p for pts, _ in flame_shape(name) for p in pts], 0.08)
        parts.add(name, lambda P, n=name: flame_sdf(P, n), lo, hi, DETAIL, mat=flame_bands(name))
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "firecat"
    obj["body_color"] = BODY_HEX
    obj["eye_color"] = EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("hips", HIP_C, MID, "root", True, up),
             ("chest", MID, CHEST_C, "hips", True, up),
             ("neck", NECK_A, NECK_B, "chest", True, fwd),
             ("head", NECK_B, NOSE_TIP, "neck", True, up),
             ("jaw", JAW_HINGE, V((0, -0.55, 0.595)), "head", True, up)]
    for s, _ in SIDES:
        e = eyes()[s]
        bones.append((f"eye.{s}", e, e + V((0, -0.05, 0)), "head", True, up))
    for name, (a, m, p) in LEGS.items():
        kind, s = name.split(".")
        parent = "chest" if kind == "fore" else "hips"
        bones += [(f"{UPPER[kind]}.{s}", a, m, parent, True, fwd),
                  (f"{LOWER[kind]}.{s}", m, p, f"{UPPER[kind]}.{s}", True, fwd),
                  (f"{PAW[kind]}.{s}", p, p + V((0, -0.08, 0)), f"{LOWER[kind]}.{s}", True, up)]
    for i in range(len(TAIL) - 1):
        bones.append((f"tail_{i + 1}", TAIL[i], TAIL[i + 1], "hips" if i == 0 else f"tail_{i}", True, fwd))
    for name, (parent, base, up_dir, length, _, _) in FLAMES.items():
        bones.append((name, base, base + up_dir.normalized() * length, parent, True, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "firecat", "forward": "-Y", "attack_style": "pounce_bite", "normal_speed": WALK_SPEED,
        "eye_light": EYE_HEX, "root_motion": False})


def chain(Q, pts, bones, blend=0.035, lead=None, lead_len=0.05):
    """Distance to a joint polyline and smooth per-bone weights along it.
    bones[k] owns segment k; `lead` (the parent bone) owns its start."""
    d, along = C._polyline_closest(Q, pts)
    cum = np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])
    w = {}
    for k, name in enumerate(bones):
        start = C.np_smoothstep(cum[k] - blend, cum[k] + blend, along) if k else np.ones(len(Q))
        end = C.np_smoothstep(cum[k + 1] - blend, cum[k + 1] + blend, along) if k + 1 < len(bones) else 0
        w[name] = w.get(name, 0) + np.clip(start - end, 0, 1)
    if lead:
        own = C.np_smoothstep(0, lead_len, along)
        for name in w:
            w[name] = w[name] * own
        w[lead] = w.get(lead, 0) + 1 - own
    return d, w


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind != "body":
            W[lo:hi, names.index(kind)] = 1
            continue
        Q = P[lo:hi]
        dists, groups = [], []
        _, w = chain(Q, [HIP_C + V((0, 0.12, 0)), HIP_C, MID, CHEST_C], ["hips", "hips", "chest"], blend=0.09)
        dists.append(torso_sdf(Q)); groups.append(w)
        _, w = chain(Q, [CHEST_C, NECK_A, NECK_B], ["chest", "neck"], blend=0.05)
        dists.append(neck_sdf(Q)); groups.append(w)
        dists.append(head_sdf(Q)); groups.append({"head": np.ones(len(Q))})
        for name, (a, m, p) in LEGS.items():
            kind, s = name.split(".")
            d, w = chain(Q, [a, m, p, p + V((0, -0.09, 0))], [f"{UPPER[kind]}.{s}", f"{LOWER[kind]}.{s}", f"{PAW[kind]}.{s}"],
                         blend=0.03, lead="chest" if kind == "fore" else "hips", lead_len=0.06)
            dists.append(leg_sdf(Q, name)); groups.append(w)
        d, w = chain(Q, TAIL, [f"tail_{i + 1}" for i in range(len(TAIL) - 1)], blend=0.04, lead="hips", lead_len=0.05)
        dists.append(tail_sdf(Q)); groups.append(w)
        dm = np.stack(dists, axis=1)
        membership = np.exp(-(dm - dm.min(axis=1, keepdims=True)) / 0.01)
        membership /= membership.sum(axis=1, keepdims=True)
        WB = np.zeros((len(Q), len(names)), np.float32)
        for k, values in enumerate(groups):
            for name, value in values.items():
                WB[:, names.index(name)] += membership[:, k] * value
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, 6)
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
REST_FEET = {name: legs[2].copy() for name, legs in LEGS.items()}


def params(**kw):
    p = {"t": 0.0, "period": 1.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0,
         "flex": 0.0, "chest_yaw": 0.0, "neck": (0.0, 0.0), "head": (0.0, 0.0, 0.0), "jaw": 0.0,
         "feet": {k: v.copy() for k, v in REST_FEET.items()},       # world targets
         "local": {k: 0.0 for k in REST_FEET},                        # 1 = feet ride with the body
         "local_feet": {k: v.copy() for k, v in REST_FEET.items()},  # rest body space targets
         "curl": {k: 0.0 for k in REST_FEET},                         # paw tip down (radians)
         "tail": (0.0, D(10), 0.0, 0.0),                              # (lift, sway amp, phase, curl)
         "amp": 1.0, "flare": 1.0, "lean": 0.0, "eyes": 1.0}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)
    length = {b.name: b.length for b in rig.data.bones}

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = (C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])).to_4x4()
        B = L @ Matrix.Translation(MID + p["pos"]) @ R @ Matrix.Translation(-MID)    # rest -> posed body
        bases["hips"] = skel.set("hips", poses, B @ skel.rest["hips"])
        bases["chest"] = K.pose_local(skel, "chest", poses, Matrix.Rotation(p["flex"], 4, "X")
                                      @ Matrix.Rotation(p["chest_yaw"], 4, "Z"))
        bases["neck"] = K.pose_local(skel, "neck", poses, Matrix.Rotation(p["neck"][0], 4, "X")
                                     @ Matrix.Rotation(p["neck"][1], 4, "Z"))
        hp, hy, hr = p["head"]
        bases["head"] = K.pose_local(skel, "head", poses, Matrix.Rotation(hp, 4, "X") @ Matrix.Rotation(hy, 4, "Z")
                                     @ Matrix.Rotation(hr, 4, "Y"))
        bases["jaw"] = K.pose_local(skel, "jaw", poses, Matrix.Rotation(-p["jaw"], 4, "X"))
        for s, _ in SIDES:
            e = max(0.05, p["eyes"])
            bases[f"eye.{s}"] = K.pose_local(skel, f"eye.{s}", poses, Matrix.Diagonal((e, e, e, 1)))
        d3 = B.to_3x3()
        for name in LEGS:
            kind, s = name.split(".")
            up, lo, paw = f"{UPPER[kind]}.{s}", f"{LOWER[kind]}.{s}", f"{PAW[kind]}.{s}"
            hip = skel.base(up, poses).translation
            target = (L @ p["feet"][name]).lerp(B @ p["local_feet"][name], p["local"][name])
            pole = d3 @ V((0, 1, 0.15))
            knee, foot = C.two_bone_ik(hip, target, length[up], length[lo], pole)
            bases[up] = skel.aim(up, poses, knee - hip)
            bases[lo] = skel.aim(lo, poses, foot - knee)
            forward = d3 @ V((0, -1, 0))
            forward = V((forward.x, forward.y, 0)).normalized() if p["local"][name] < 0.5 else forward
            c = p["curl"][name]
            bases[paw] = skel.aim(paw, poses, forward * math.cos(c) - V((0, 0, 1)) * math.sin(c))
        lift_t, amp, phase, curl = p["tail"]
        for i in range(len(TAIL) - 1):
            name = f"tail_{i + 1}"
            sway = amp * math.sin(phase - 0.9 * i) * (0.5 + 0.15 * i)
            rot = Matrix.Rotation((lift_t if i == 0 else 0) + curl, 4, "X") @ Matrix.Rotation(sway, 4, "Z")
            bases[name] = K.pose_local(skel, name, poses, rot)
        for i, name in enumerate(FLAMES):
            a, b, s = K.flicker(i, p["t"], p["period"], p["amp"])
            g = p["flare"]
            rot = Matrix.Rotation(a + p["lean"], 4, "X") @ Matrix.Rotation(b, 4, "Z")
            bases[name] = K.pose_local(skel, name, poses, rot @ Matrix.Diagonal((g, g * s, g, 1)))
        return bases
    return solve


def gait(t, period, speed, duty, lift, offsets, skew=0.9):
    feet = {}
    stride = speed * duty * period
    for name, off in offsets.items():
        y, z = C.foot_track(((t / period) + off) % 1, duty, stride, lift, speed, period, skew=skew)
        feet[name] = REST_FEET[name] + V((0, y, z))
    return feet


def curls(t, period, duty, offsets, amount):
    out = {}
    for name, off in offsets.items():
        ph = ((t / period) + off) % 1
        out[name] = amount * math.sin(math.pi * (ph - duty) / (1 - duty)) if ph > duty else 0.0
    return out


WALK_OFFSETS = {"hind.L": 0.0, "fore.L": 0.75, "hind.R": 0.5, "fore.R": 0.25}


def walk(f):
    T = WALK_FRAMES / FPS
    t = f / FPS
    w = TAU * t / T
    duty = 0.64
    return params(t=t, period=T, feet=gait(t, T, WALK_SPEED, duty, 0.07, WALK_OFFSETS),
                  curl=curls(t, T, duty, WALK_OFFSETS, D(50)),
                  pos=V((0.008 * math.sin(w), 0, 0.008 * math.cos(2 * w))),
                  roll=D(2) * math.sin(w), yaw=D(2) * math.sin(w + 0.4), chest_yaw=D(3) * math.sin(w),
                  neck=(D(-4), D(-3) * math.sin(w)), head=(D(6) + D(2) * math.cos(2 * w), D(3) * math.sin(w - 0.6), 0),
                  tail=(D(-8), D(10), w, D(2)))


RUN_OFFSETS = {"hind.L": 0.0, "hind.R": -0.1, "fore.R": -0.48, "fore.L": -0.58}


def run(f):
    T = RUN_FRAMES / FPS
    t = f / FPS
    w = TAU * t / T
    duty = 0.3
    return params(t=t, period=T, feet=gait(t, T, RUN_SPEED, duty, 0.11, RUN_OFFSETS, skew=0.8),
                  curl=curls(t, T, duty, RUN_OFFSETS, D(70)),
                  pos=V((0, 0.03 * math.cos(w), 0.035 * math.sin(w - 0.6) - 0.01)),
                  pitch=D(5) * math.sin(w + 0.4), flex=D(16) * math.cos(w),
                  neck=(D(-10) - D(6) * math.cos(w), 0), head=(D(14) + D(6) * math.cos(w), 0, 0),
                  tail=(D(-28) + D(8) * math.sin(w), D(6), w, D(-3)),
                  amp=0.7, lean=D(28))


def pounce(f):
    k, t = C.keyframes, f / FPS
    hit = HIT_FRAME / FPS
    air = C.smoothstep(0.30, 0.36, t) * (1 - C.smoothstep(0.56, 0.62, t))
    crouch = k((0, 0), (0.26, 1), (0.32, 0.6), (0.4, 0))(t)
    arc = 0.26 * math.sin(math.pi * min(1, max(0, (t - 0.30) / 0.30)))
    local_feet = {name: REST_FEET[name] + (V((0, -0.24, 0.17)) if name.startswith("fore") else V((0, 0.24, 0.12)))
                  for name in REST_FEET}
    feet = {name: REST_FEET[name] + (V((0, -0.06 * C.smoothstep(0.55, 0.62, t), 0)) if name.startswith("fore") else V())
            for name in REST_FEET}
    local = {name: air for name in REST_FEET}
    shake = D(14) * math.sin(TAU * 7 * (t - hit)) * math.exp(-5 * (t - hit)) if t > hit else 0
    return params(t=t, period=1.2, feet=feet, local=local, local_feet=local_feet,
                  curl={n: D(40) * air for n in REST_FEET},
                  pos=V((0, 0.05 * crouch - 0.04 * C.smoothstep(0.58, 0.66, t) * (1 - C.smoothstep(0.8, 1.2, t)),
                         -0.11 * crouch + arc - 0.05 * C.smoothstep(0.58, 0.66, t) * (1 - C.smoothstep(0.8, 1.2, t)))),
                  pitch=D(k((0, 0), (0.26, 4), (0.36, -16), (0.5, -2), (0.62, 12), (0.8, 6), (1.2, 0))(t)),
                  flex=D(k((0, 0), (0.26, 10), (0.4, -22), (0.56, -10), (0.66, 8), (1.2, 0))(t)),
                  neck=(D(k((0, 0), (0.26, 12), (0.45, -6), (hit, 18), (0.9, 6), (1.2, 0))(t)), shake * 0.5),
                  head=(D(k((0, 0), (0.26, -6), (0.45, -10), (hit, 14), (0.9, 4), (1.2, 0))(t)), shake, 0.4 * shake),
                  jaw=D(k((0, 0), (0.40, 0), (0.55, 42), (hit - 1 / FPS, 46), (hit, 0), (1.2, 0))(t)),
                  tail=(D(k((0, -8), (0.26, -2), (0.45, -30), (0.7, -15), (1.2, -8))(t)),
                        D(k((0, 10), (0.26, 22), (0.4, 4), (1.2, 10))(t)), TAU * 3 * t, 0),
                  amp=k((0, 1), (0.3, 1.5), (0.8, 1.2), (1.2, 1))(t), flare=k((0, 1), (0.3, 1.25), (1.2, 1))(t),
                  lean=D(k((0, 0), (0.3, 0), (0.45, 30), (0.7, 0))(t)))


def death(f):
    k, t = C.keyframes, f / FPS
    fall = k((0, 0), (0.3, 0), (0.85, 1), (1.0, 0.96), (1.15, 1))(t)
    curl = C.smoothstep(0.7, 1.4, t)
    local_feet = {}
    for name in REST_FEET:
        a, m, p = LEGS[name]
        bent = p.lerp(m + V((0, -0.06 if name.startswith("fore") else 0.06, -0.04)), 0.45 * curl)
        local_feet[name] = bent + V((0, 0, 0.01 * math.sin(28 * t + len(name)) * C.smoothstep(0.9, 1.0, t)
                                     * (1 - C.smoothstep(1.2, 1.4, t))))
    return params(t=t, period=1.0, local={n: C.smoothstep(0.25, 0.6, t) for n in REST_FEET}, local_feet=local_feet,
                  curl={n: D(20) * curl for n in REST_FEET},
                  pos=V((0.20 * fall, 0, -0.30 * fall + 0.04 * C.smoothstep(0, 0.2, t) * (1 - fall))),
                  roll=D(-84) * fall, pitch=D(k((0, 0), (0.25, -10), (0.85, 0))(t)),
                  flex=D(k((0, 0), (0.25, -8), (0.9, 6), (1.4, 10))(t)),
                  neck=(D(k((0, 0), (0.25, -20), (0.9, 10), (1.3, 14))(t)), D(k((0, 0), (0.9, 10))(t))),
                  head=(D(k((0, 0), (0.25, -16), (0.9, 6), (1.3, 10))(t)), 0, D(k((0, 0), (0.9, -12))(t))),
                  jaw=D(k((0, 0), (0.25, 36), (0.9, 14), (1.3, 10))(t)),
                  tail=(D(k((0, -8), (0.3, 10), (0.9, -40), (1.2, -45))(t)), D(k((0, 10), (0.6, 25), (1.4, 0))(t)),
                        TAU * 2 * t, D(k((0, 0), (1.3, 12))(t))),
                  amp=k((0, 1), (0.3, 1.8), (0.9, 0.6), (1.5, 0))(t), flare=k((0, 1), (0.3, 1.3), (1.5, 0.15))(t),
                  eyes=k((0, 1), (0.5, 1), (1.4, 0.08))(t))


def mouth_point(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    return tuple(round(v, 3) for v in rig.matrix_world @ rig.pose.bones["jaw"].tail)


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "CatWalk", solver(rig, walk), WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    K.ground_clip(rig, obj, "CatRun", solver(rig, run), RUN_FRAMES, cyclic=True, extras={"speed": RUN_SPEED})
    act = K.ground_clip(rig, obj, "CatPounce", solver(rig, pounce), POUNCE_FRAMES,
                        extras={"attack_style": "pounce_bite", "hit_frame": HIT_FRAME, "hit_time": HIT_FRAME / FPS,
                                "lunge_from": LUNGE_FROM, "lunge_to": LUNGE_TO})
    act.pose_markers.new("Leap").frame = round(LUNGE_FROM * FPS)
    act.pose_markers.new("Bite").frame = HIT_FRAME
    K.ground_clip(rig, obj, "CatDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.5}, settle_from=round(1.3 * FPS))
    K.register(rig, CLIPS)


def main(export_path=None, blend_path=None):
    scene, rig, obj = build()
    K.decimate(obj)
    animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("CatDeath",))
    report["bite"] = mouth_point(rig, "CatPounce", HIT_FRAME)
    K.setup_stage(scene, "FireCat", STAGE, (0, 0.1, 0.45), 2.0)
    scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "FireCat", NAME, (0, 0.1, 0.45), 2.6)
    print("FireCat:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "firecat.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "firecat.blend"))
