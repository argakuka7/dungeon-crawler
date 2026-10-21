"""
Squarlo: the third real boss (the descent guardian of depth 2), from the kids' whiteboard sketch.

A tiny teal fellow, smaller than the player: a tall, boxy body that splits into two short, stubby
legs at the bottom, a floppy cap on top that bends over to its right and ends in a round bulb,
three dots for a face (two glowing eyes and a nose between them) and two short arms that bend
up at the elbows into cupped hands. Faces -Y in Blender, +Z up; one unit = one game cell, about
0.68 cells tall. In his second phase the game draws the same model about nine times as big
(core/enemies.js SQUARLO_GIANT `size`): a giant six cells tall.

Rig: root, body (the box, its face), cap0 / cap1 (the floppy cap, from the body), per side
thigh / shin (IK, from the root) and arm_upper / arm_lower / hand (IK, from the root).

Clips, 30 fps, in place (the game supplies root motion):
    SquarloRun     12-frame loop: a frantic scamper, crouched, arms pumping, the cap flapping
                   (extras.speed; the game plays it fast: he runs four cells a second).
    SquarloSwim    24-frame loop: paddling with both hands in front, kicking (the game floats
                   him half under in deep water and plays it on time).
    SquarloStride  40-frame loop: a giant's slow, heavy walk, knees high, the body sinking onto
                   each foot as it lands (phase 2; the feet come down at phases 0 and 0.5).
    SquarloBlow    1.6 s: cups his hands at his chest, leans back as the water gathers in them,
                   and at frame 24 (extras.hit_frame) thrusts them forward: the jet blows out of
                   them (extras.muzzle) until frame 39.
    SquarloCast    2.4 s: throws his arms up and wiggles, swaying, then slams them down at frame
                   60 (extras.hit_frame): the tide rises.
    SquarloSummon  1.4 s: crouches, lifts his hands and slaps the floor in front of him at frame
                   24 (extras.hit_frame, extras.muzzle).
    SquarloRest    2.2 s: plops down on his bottom, panting, arms and cap drooping, and gets up.
    SquarloStomp   3 s (a giant's): shifts onto his left foot and hauls the right one up high,
                   leaning back, arms flung up (the tell), wobbling at the top; then slams it
                   down, faster and faster, in front of him at frame 54 (extras.hit_frame; where
                   it lands: extras.foot), the whole body crashing after it; the foot sticks
                   there and he tugs at it until frame 78 (extras.planted_until).
    SquarloJump    2.6 s (a giant's): crouches deep, arms back, and springs off at frame 18
                   (extras.takeoff); in the air (the game lifts him: he plays in place) he tucks
                   his legs, spreads his arms, then reaches his feet down and lands at frame 51
                   (extras.hit_frame) in a huge squash, arms slamming down; squats, winded, and
                   gets up.
    SquarloKick    1.3 s (a giant's): draws his right foot back, leaning in, and kicks it out
                   forward and up at frame 21 (extras.hit_frame), following through.
    SquarloCannon  2.6 s (a giant's): cups his hands at his belly and leans far back while the
                   water gathers, then thrusts them forward and down at frame 30
                   (extras.hit_frame): the water cannon blasts out of them (extras.muzzle) until
                   frame 66 (extras.gust_end), shaking him with its recoil.
    SquarloDeath   2.4 s: shudders, spins round and topples onto his back, legs in the air. Held.

Headless:
    Blender -b --python blender/squarlo.py -- assets/squarlo.glb blender/squarlo.blend \
        blender/previews/squarlo-preview.png
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

NAME, RIG_NAME = "Squarlo", "SquarloRig"
SCENE, COLLECTION, STAGE = "Squarlo", "SquarloAsset", "SquarloStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("SquarloRun", "SquarloSwim", "SquarloStride", "SquarloBlow", "SquarloCast", "SquarloSummon",
         "SquarloRest", "SquarloStomp", "SquarloJump", "SquarloKick", "SquarloCannon", "SquarloDeath")

BODY_HEX, CAP_HEX, EYE_HEX, NOSE_HEX = "#2fb5a3", "#23948a", "#e4fdff", "#174f4a"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("SquarloBody", BODY_HEX, 0), ("SquarloCap", CAP_HEX, 0), ("SquarloEyes_glow", EYE_HEX, 1.8),
             ("SquarloNose", NOSE_HEX, 0))
BODY_M, CAP_M, EYE_M, NOSE_M = range(len(MATERIALS))

VOXEL, DETAIL, FINE = 0.0055, 0.0035, 0.0022
RUN_FRAMES, RUN_SPEED = 12, 1.3
SWIM_FRAMES, SWIM_SPEED = 24, 1.0
STRIDE_FRAMES, STRIDE_SPEED = 40, 0.25
BLOW_FRAMES, BLOW_HIT, GUST_END = 48, 24, 39
CAST_FRAMES, CAST_HIT = 72, 60
SUMMON_FRAMES, SUMMON_HIT = 42, 24
REST_FRAMES = 66
STOMP_FRAMES, STOMP_HIT, STOMP_UP = 90, 54, 78
JUMP_FRAMES, JUMP_OFF, JUMP_HIT = 78, 18, 51
KICK_FRAMES, KICK_HIT = 39, 21
CANNON_FRAMES, CANNON_HIT, CANNON_END = 78, 30, 66
DEATH_FRAMES = 72

# --- body plan -----------------------------------------------------------------
BODY_C = V((0, 0, 0.35))
BODY_H = (0.075, 0.045, 0.15)      # the box's half size before its rounding
BODY_R = 0.05                      # its rounding
FRONT = -(BODY_H[1] + BODY_R)      # y of its flat front
PIVOT = V((0, 0, 0.19))            # the body turns about its bottom

CAP = [V((0, 0.012, 0.52)), V((-0.008, 0.01, 0.585)), V((-0.04, 0.0, 0.628)), V((-0.085, -0.006, 0.648)), V((-0.118, -0.01, 0.636))]
CAP_RADII = (0.064, 0.058, 0.05, 0.046, 0.044)
BULB_R = 0.056

EYES = {s: V((sign * 0.042, FRONT - 0.002, 0.47)) for s, sign in SIDES}
EYE_RADII = (0.017, 0.009, 0.024)
NOSE = V((0, FRONT - 0.003, 0.462))
NOSE_RADII = (0.011, 0.008, 0.011)

ARM_R = 0.026
ARM_TOP = {s: V((sign * 0.09, 0, 0.42)) for s, sign in SIDES}      # hidden in the body
SHOULDER = {s: V((sign * 0.118, 0, 0.42)) for s, sign in SIDES}
ELBOW = {s: V((sign * 0.19, -0.005, 0.36)) for s, sign in SIDES}
WRIST = {s: V((sign * 0.212, -0.02, 0.435)) for s, sign in SIDES}

LEG_R = 0.034
LEG_TOP = {s: V((sign * 0.05, 0, 0.24)) for s, sign in SIDES}      # hidden in the body
HIP = {s: V((sign * 0.05, 0, 0.19)) for s, sign in SIDES}
KNEE = {s: V((sign * 0.055, -0.006, 0.106)) for s, sign in SIDES}
FOOT = {s: V((sign * 0.06, -0.012, 0.028)) for s, sign in SIDES}
FOOT_RADII = (0.034, 0.048, 0.026)
TOE = V((0, -0.016, -0.002))        # the foot's middle, from the ankle

STOMP_AT = V((-0.07, -0.125, FOOT["R"].z))   # where the right foot comes down


def box_sdf(P):
    """The body: a rounded box, a little wider at the bottom."""
    Q = P - np.asarray(BODY_C, np.float32)
    widen = 1 + 0.12 * np.clip((0.15 - Q[..., 2]) / 0.3, -0.5, 1)
    q = np.abs(Q) - np.stack([BODY_H[0] * widen, np.full_like(widen, BODY_H[1]), np.full_like(widen, BODY_H[2])], axis=-1)
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(np.max(q, axis=-1), 0) - BODY_R


def leg_sdf(P, s):
    tube = K.tapered_tube(P, [HIP[s], KNEE[s], FOOT[s]], [LEG_R, LEG_R * 0.95, LEG_R * 0.85])
    return K.smin(tube, K.ellipsoid(P, FOOT[s] + TOE, FOOT_RADII), 0.015)


def body_sdf(P):
    """The box and the stubs the legs come out of (the legs' tops are hidden in them)."""
    d = box_sdf(P)
    for s, _ in SIDES:
        d = K.smin(d, K.round_cone(P, LEG_TOP[s], HIP[s], LEG_R * 1.05, LEG_R * 1.05), 0.03)
    return d


def cap_sdf(P):
    d = K.tapered_tube(P, CAP, CAP_RADII)
    return K.smin(d, F._sd_sphere(P, CAP[-1] + V((-0.012, -0.004, 0.0)), BULB_R), 0.02)


def hand_frame(s):
    """The hand's direction (out of the forearm) and the way its thumb points (inward, up)."""
    sign = 1 if s == "L" else -1
    a = (WRIST[s] - ELBOW[s]).normalized()
    thumb = V((-sign, -0.4, 0.3)).normalized()
    return a, (thumb - a * thumb.dot(a)).normalized()


def arm_sdf(P, s):
    return K.tapered_tube(P, [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], [ARM_R, ARM_R, ARM_R * 0.95, ARM_R * 0.9])


def hand_sdf(P, s):
    a, thumb = hand_frame(s)
    c = WRIST[s] + a * 0.026
    d = K.ellipsoid(P, c, (0.037, 0.032, 0.042))
    tip = c + thumb * 0.04 + a * 0.012
    return K.smin(d, K.round_cone(P, c + thumb * 0.012, tip, 0.016, 0.012), 0.01)


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.2, -0.13, 0.08), (0.2, 0.13, 0.62), VOXEL, mat=BODY_M)
    lo, hi = K.bounds(CAP, 0.08)
    parts.add("cap", cap_sdf, lo, hi, VOXEL, mat=CAP_M)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add("body", lambda P, c=e: K.ellipsoid(P, c, EYE_RADII), e - V((0.04,) * 3), e + V((0.04,) * 3), FINE, mat=EYE_M)
    parts.add("body", lambda P: K.ellipsoid(P, NOSE, NOSE_RADII), NOSE - V((0.03,) * 3), NOSE + V((0.03,) * 3), FINE, mat=NOSE_M)
    for s, sign in SIDES:
        lo, hi = K.bounds([HIP[s], KNEE[s], FOOT[s], FOOT[s] + TOE], 0.07)
        parts.add(f"leg.{s}", lambda P, s=s: leg_sdf(P, s), lo, hi, DETAIL, mat=BODY_M)
        lo, hi = K.bounds([ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], 0.04)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=BODY_M)
        lo, hi = K.bounds([WRIST[s], WRIST[s] + hand_frame(s)[0] * 0.06], 0.06)
        parts.add(f"hand.{s}", lambda P, s=s: hand_sdf(P, s), lo, hi, FINE, mat=BODY_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "squarlo"
    obj["body_color"] = BODY_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.1, 0), None, False, up),
             ("body", PIVOT, PIVOT + V((0, 0, 0.2)), "root", True, fwd),
             ("cap0", CAP[0], CAP[2], "body", True, fwd),
             ("cap1", CAP[2], CAP[4], "cap0", True, fwd)]
    for s, _ in SIDES:
        a, _ = hand_frame(s)
        bones += [(f"thigh.{s}", HIP[s], KNEE[s], "root", True, fwd),
                  (f"shin.{s}", KNEE[s], FOOT[s], f"thigh.{s}", True, fwd),
                  (f"arm_upper.{s}", SHOULDER[s], ELBOW[s], "root", True, fwd),
                  (f"arm_lower.{s}", ELBOW[s], WRIST[s], f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], WRIST[s] + a * 0.05, f"arm_lower.{s}", True, fwd)]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "squarlo", "forward": "-Y", "attack_style": "boss", "normal_speed": RUN_SPEED, "root_motion": False})


def limb(Q, pts, joint, names, width):
    _, along = C._polyline_closest(Q, pts)
    past = C.np_smoothstep(joint - width, joint + width, along)
    return {names[0]: 1 - past, names[1]: past}


def arc(pts):
    return np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        part, s = (kind.split(".") + [""])[:2]
        WB = np.zeros((hi - lo, len(names)), np.float32)
        if part == "body":
            W[lo:hi, names.index("body")] = 1
            continue
        if part == "cap":
            shares = limb(P[lo:hi], CAP, arc(CAP)[2], ("cap0", "cap1"), 0.03)
            near = np.clip((P[lo:hi, 2] - 0.53) / 0.03, 0, 1)
            for name, share in shares.items():
                WB[:, names.index(name)] += share * near
            WB[:, names.index("body")] += 1 - near
        elif part == "hand":
            WB[:, names.index(f"hand.{s}")] = 1
        elif part == "leg":
            pts = [HIP[s], KNEE[s], FOOT[s]]
            for name, share in limb(P[lo:hi], pts, arc(pts)[1], (f"thigh.{s}", f"shin.{s}"), 0.025).items():
                WB[:, names.index(name)] += share
        else:
            pts = [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]]
            for name, share in limb(P[lo:hi], pts, arc(pts)[2], (f"arm_upper.{s}", f"arm_lower.{s}"), 0.025).items():
                WB[:, names.index(name)] += share
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, 4)
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
    for name, roughness in (("SquarloBody", 0.55), ("SquarloCap", 0.6), ("SquarloEyes_glow", 0.2), ("SquarloNose", 0.4)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
REST_DIR = {s: hand_frame(s)[0] for s, _ in SIDES}
REST_ELBOW = {s: V((sign * 1.0, 0.3, -0.4)) for s, sign in SIDES}     # which way the elbows point
CAP_DIRS = ((CAP[2] - CAP[0]).normalized(), (CAP[4] - CAP[2]).normalized())
CAP_LEN = ((CAP[2] - CAP[0]).length, (CAP[4] - CAP[2]).length)


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0),
         "feet": {s: FOOT[s].copy() for s, _ in SIDES},                # armature space
         "hands": {s: WRIST[s].copy() for s, _ in SIDES},              # body space
         "dirs": {s: REST_DIR[s].copy() for s, _ in SIDES},            # where the hands point, body space
         "elbows": {s: REST_ELBOW[s].copy() for s, _ in SIDES},
         "knees": V((0, -1, 0.1)),                                     # which way the knees point
         "cap": (0.0, 0.0)}                                            # the cap's swing: about x (nod), y (side)
    p.update(kw)
    return p


def body_motion(p):
    R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
    rigid = Matrix.Translation(p["pos"]) @ K.about(PIVOT, R)
    sx, sz = p["squash"]
    return rigid, rigid @ K.about(PIVOT, Matrix.Diagonal((sx, sx, sz)))


def solver(rig, fn):
    skel = C.Skeleton(rig)
    leg_len = {s: ((KNEE[s] - HIP[s]).length, (FOOT[s] - KNEE[s]).length) for s, _ in SIDES}
    arm_len = {s: ((ELBOW[s] - SHOULDER[s]).length, (WRIST[s] - ELBOW[s]).length) for s, _ in SIDES}

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        rigid, squashed = body_motion(p)
        rigid, squashed = L @ rigid, L @ squashed
        bases["body"] = skel.set("body", poses, squashed @ skel.rest["body"])
        r3 = rigid.to_3x3()
        a, b = p["cap"]
        R0 = C.rot_x(a) @ C.rot_y(b)
        R1 = C.rot_x(a * 1.8) @ C.rot_y(b * 1.8) @ R0
        head = squashed @ CAP[0]
        d0 = r3 @ (R0 @ CAP_DIRS[0])
        bases["cap0"] = K.aim_at(skel, "cap0", poses, head, d0)
        bases["cap1"] = K.aim_at(skel, "cap1", poses, head + d0 * CAP_LEN[0] * p["squash"][1], r3 @ (R1 @ CAP_DIRS[1]))
        for s, sign in SIDES:
            th, sh = f"thigh.{s}", f"shin.{s}"
            hip = rigid @ HIP[s]
            knee, foot = C.two_bone_ik(hip, L @ p["feet"][s], *leg_len[s], r3 @ p["knees"] + V((sign * 0.15, 0, 0)))
            bases[th] = K.aim_at(skel, th, poses, hip, knee - hip)
            bases[sh] = K.aim_at(skel, sh, poses, knee, foot - knee)
            up, lo, hand = f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"
            shoulder = squashed @ SHOULDER[s]
            elbow, wrist = C.two_bone_ik(shoulder, rigid @ p["hands"][s], *arm_len[s], r3 @ p["elbows"][s])
            bases[up] = K.aim_at(skel, up, poses, shoulder, elbow - shoulder)
            bases[lo] = K.aim_at(skel, lo, poses, elbow, wrist - elbow)
            bases[hand] = K.aim_at(skel, hand, poses, wrist, r3 @ p["dirs"][s])
        return bases
    return solve


def per_side(fn):
    return {s: V(fn(s, sign)) for s, sign in SIDES}


def blend(a, b, u):
    out = dict(a)
    out["pos"] = a["pos"].lerp(b["pos"], u)
    for key in ("pitch", "roll", "yaw"):
        out[key] = a[key] + (b[key] - a[key]) * u
    out["squash"] = tuple(x + (y - x) * u for x, y in zip(a["squash"], b["squash"]))
    out["cap"] = tuple(x + (y - x) * u for x, y in zip(a["cap"], b["cap"]))
    out["knees"] = a["knees"].lerp(b["knees"], u)
    for key in ("hands", "elbows", "feet"):
        out[key] = {s: a[key][s].lerp(b[key][s], u) for s, _ in SIDES}
    out["dirs"] = {s: a["dirs"][s].lerp(b["dirs"][s], u).normalized() for s, _ in SIDES}
    return out


# how a key is reached from the one before it (a key's optional third item): eased in and out,
# or speeding up into it (an impact: nothing slows down before it lands), or slowing down into it
EASES = {"smooth": lambda u: u * u * (3 - 2 * u), "in": lambda u: u * u * u, "out": lambda u: 1 - (1 - u) ** 3,
         "lin": lambda u: u}


def keyed(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for k0, k1 in zip(keys, keys[1:]):
        (t0, a), (t1, b) = k0[:2], k1[:2]
        if t <= t1:
            u = min(max((t - t0) / (t1 - t0), 0.0), 1.0)
            return blend(a, b, EASES[k1[2] if len(k1) > 2 else "smooth"](u))
    return keys[-1][1]


def pose(base, **kw):
    """A key: `base` with some things changed (hands in body space, feet in armature space)."""
    p = dict(base)
    for key in ("hands", "dirs", "elbows", "feet"):
        if key in kw:
            p[key] = {**base[key], **{s: V(v) for s, v in kw.pop(key).items()}}
    p.update(kw)
    return p


REST = params()


def idle_wobble(t, k=1.0):
    """A little life on top of a held pose: breathing and the cap swaying."""
    return dict(squash=(1 - 0.012 * k * math.sin(TAU * 1.5 * t), 1 + 0.015 * k * math.sin(TAU * 1.5 * t)),
                cap=(D(6) * k * math.sin(TAU * 1.5 * t + 0.6), D(4) * k * math.sin(TAU * 0.75 * t)))


def run(f):
    n, T = RUN_FRAMES, RUN_FRAMES / FPS
    ph = (f / n) % 1
    w = TAU * ph
    duty, stride = 0.4, RUN_SPEED * 0.4 * T
    feet, hands, dirs = {}, {}, {}
    for s, sign in SIDES:
        y, z = C.foot_track((ph + (0.5 if s == "R" else 0)) % 1, duty, stride, 0.05, RUN_SPEED, T, skew=0.8)
        feet[s] = FOOT[s] + V((0, y, z))
        swing = math.sin(w + (0 if s == "R" else math.pi))
        hands[s] = V((sign * 0.18, -0.03 - 0.07 * swing, 0.38 + 0.02 * abs(swing)))
        dirs[s] = V((sign * 0.2, -0.6 - 0.3 * swing, 0.8)).normalized()
    return params(t=f / FPS, pos=V((0.004 * math.sin(w), 0, -0.042 + 0.014 * abs(math.sin(w)))),
                  pitch=D(14) + D(3) * math.cos(2 * w), roll=D(4) * math.sin(w), yaw=D(5) * math.sin(w),
                  feet=feet, hands=hands, dirs=dirs, cap=(D(-22) + D(12) * math.sin(2 * w + 1), D(10) * math.sin(w + 0.5)))


def swim(f):
    w = TAU * f / SWIM_FRAMES
    feet, hands, dirs = {}, {}, {}
    for s, sign in SIDES:
        k = 0 if s == "L" else math.pi
        feet[s] = FOOT[s] + V((0, 0.07 + 0.03 * math.sin(w + k), 0.06 + 0.035 * math.sin(w + k + 1.2)))
        hands[s] = V((sign * 0.17, -0.1 + 0.06 * math.cos(w + k), 0.37 + 0.05 * math.sin(w + k)))
        dirs[s] = V((sign * 0.3, -0.7 + 0.3 * math.cos(w + k), -0.4)).normalized()
    return params(t=f / FPS, pos=V((0, 0, 0.02 * math.sin(2 * w))), pitch=D(18) + D(4) * math.sin(2 * w),
                  roll=D(5) * math.sin(w), feet=feet, hands=hands, dirs=dirs, knees=V((0, -0.5, 1)),
                  cap=(D(-15) + D(8) * math.sin(2 * w), D(8) * math.sin(w)))


def stride(f):
    """A giant's walk: each foot lands at the front of its step (the left at phase 0, the right
    at 0.5) and the whole body sinks onto it, squashing a little, then rises over it; the body
    sways onto the foot it stands on, the arms swing heavily against the legs."""
    n, T = STRIDE_FRAMES, STRIDE_FRAMES / FPS
    ph = (f / n) % 1
    w = TAU * ph
    duty, length = 0.62, STRIDE_SPEED * 0.62 * T
    feet, hands, dirs = {}, {}, {}
    for s, sign in SIDES:
        y, z = C.foot_track((ph + (0.5 if s == "R" else 0)) % 1, duty, length, 0.09, STRIDE_SPEED, T, skew=1.3)
        feet[s] = FOOT[s] + V((0, y, z))
        swing = math.sin(w + (0 if s == "R" else math.pi))
        hands[s] = V((sign * 0.21, -0.02 - 0.07 * swing, 0.33 + 0.015 * abs(swing)))
        dirs[s] = V((sign * 0.4, -0.5 - 0.3 * swing, 0.5)).normalized()
    land = max(0.0, math.cos(2 * w - 0.45)) ** 3        # just after a foot comes down: the weight lands on it
    return params(t=f / FPS, pos=V((0.016 * math.sin(w), 0, -0.032 - 0.016 * land + 0.008 * math.cos(2 * w + 2.2))),
                  pitch=D(7) + D(2.5) * land, roll=D(7) * math.sin(w), yaw=D(5) * math.sin(w),
                  squash=(1 + 0.03 * land, 1 - 0.035 * land),
                  feet=feet, hands=hands, dirs=dirs, cap=(D(14) * land - D(4) + D(5) * math.sin(2 * w - 1.2), D(12) * math.sin(w - 0.6)))


def blow_keys():
    hit, end = BLOW_HIT / FPS, GUST_END / FPS
    cup = dict(hands=per_side(lambda s, sign: (sign * 0.03, -0.13, 0.37)),
               dirs=per_side(lambda s, sign: (-sign * 0.6, -0.4, 0.5)),
               elbows=per_side(lambda s, sign: (sign * 1, 0.2, -0.6)))
    gather = pose(REST, pos=V((0, 0.02, 0)), pitch=D(-10), squash=(1.03, 1.02), cap=(D(-12), 0), **cup)
    wound = pose(gather, pitch=D(-14), squash=(1.05, 0.98))
    thrust = pose(REST, pos=V((0, -0.025, -0.005)), pitch=D(12), squash=(0.97, 1.03), cap=(D(18), D(4)),
                  hands=per_side(lambda s, sign: (sign * 0.028, -0.21, 0.41)),
                  dirs=per_side(lambda s, sign: (-sign * 0.2, -1, 0.1)),
                  elbows=per_side(lambda s, sign: (sign * 1, 0, -0.2)))
    return [(0, REST), (0.35, gather), (hit - 0.08, wound), (hit, thrust), (end, pose(thrust, pitch=D(10))),
            (BLOW_FRAMES / FPS - 0.05, REST), (BLOW_FRAMES / FPS, REST)]


def blow(f):
    t = f / FPS
    p = keyed(t, BLOW_KEYS)
    shake = math.sin(TAU * 12 * t) if BLOW_HIT / FPS <= t < GUST_END / FPS else 0.0
    return {**p, "t": t, "roll": p["roll"] + D(2) * shake}


def cast_keys():
    hit = CAST_HIT / FPS
    up = pose(REST, pos=V((0, 0, 0.01)), squash=(0.95, 1.07), cap=(D(-10), 0),
              hands=per_side(lambda s, sign: (sign * 0.15, -0.01, 0.66)),
              dirs=per_side(lambda s, sign: (sign * 0.3, -0.2, 1)),
              elbows=per_side(lambda s, sign: (sign * 1, 0.2, -0.2)))
    slam = pose(REST, pos=V((0, -0.02, -0.05)), pitch=D(22), squash=(1.06, 0.92), cap=(D(30), 0),
                hands=per_side(lambda s, sign: (sign * 0.12, -0.17, 0.12)),
                dirs=per_side(lambda s, sign: (sign * 0.2, -0.5, -1)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.4, 0.2)),
                feet=per_side(lambda s, sign: (sign * 0.08, -0.01, FOOT["L"].z)))
    return [(0, REST), (0.35, up), (hit - 0.18, up), (hit - 0.06, pose(up, squash=(0.93, 1.1), pos=V((0, 0, 0.02)))),
            (hit, slam), (hit + 0.22, slam), (CAST_FRAMES / FPS - 0.04, REST), (CAST_FRAMES / FPS, REST)]


def cast(f):
    t = f / FPS
    p = keyed(t, CAST_KEYS)
    on = C.smoothstep(0.3, 0.45, t) * (1 - C.smoothstep(CAST_HIT / FPS - 0.25, CAST_HIT / FPS - 0.1, t))
    hands = {s: p["hands"][s] + V((sign * 0.02 * math.sin(TAU * 4 * t + (0 if s == "L" else 1.5)), 0, 0.02 * math.sin(TAU * 5 * t))) * on
             for s, sign in SIDES}
    return {**p, "t": t, "hands": hands, "yaw": p["yaw"] + D(16) * on * math.sin(TAU * 1.2 * t),
            "roll": p["roll"] + D(5) * on * math.sin(TAU * 2.4 * t), "cap": (p["cap"][0], p["cap"][1] + D(14) * on * math.sin(TAU * 2.4 * t))}


def summon_keys():
    hit = SUMMON_HIT / FPS
    raise_ = pose(REST, pos=V((0, 0.01, -0.02)), pitch=D(-6), cap=(D(-10), 0),
                  hands=per_side(lambda s, sign: (sign * 0.14, -0.06, 0.56)),
                  dirs=per_side(lambda s, sign: (sign * 0.2, -0.4, 1)),
                  elbows=per_side(lambda s, sign: (sign * 1, 0.3, -0.3)))
    slap = pose(REST, pos=V((0, -0.035, -0.06)), pitch=D(34), squash=(1.04, 0.94), cap=(D(35), D(-6)),
                hands=per_side(lambda s, sign: (sign * 0.075, -0.2, 0.17)),
                dirs=per_side(lambda s, sign: (sign * 0.1, -0.6, -1)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.4, 0.3)))
    return [(0, REST), (0.45, raise_), (hit - 0.06, pose(raise_, squash=(0.97, 1.04))), (hit, slap), (hit + 0.22, slap),
            (SUMMON_FRAMES / FPS - 0.04, REST), (SUMMON_FRAMES / FPS, REST)]


def summon(f):
    return {**keyed(f / FPS, SUMMON_KEYS), "t": f / FPS}


def rest_keys():
    sit = pose(REST, pos=V((0, 0.03, -0.1)), pitch=D(-8), squash=(1.04, 0.97), cap=(D(45), D(-10)),
               feet=per_side(lambda s, sign: (sign * 0.075, -0.11, FOOT["L"].z)),
               hands=per_side(lambda s, sign: (sign * 0.2, 0.0, 0.2)),
               dirs=per_side(lambda s, sign: (sign * 0.3, 0.1, -1)),
               elbows=per_side(lambda s, sign: (sign * 1, 0.3, 0.2)), knees=V((0, -0.3, 1)))
    end = REST_FRAMES / FPS
    return [(0, REST), (0.3, sit), (end - 0.5, sit), (end - 0.2, pose(REST, pos=V((0, 0, 0.015)), squash=(0.97, 1.04))),
            (end, REST)]


def rest(f):
    t = f / FPS
    p = keyed(t, REST_KEYS)
    pant = C.smoothstep(0.3, 0.45, t) * (1 - C.smoothstep(REST_FRAMES / FPS - 0.6, REST_FRAMES / FPS - 0.45, t))
    s = math.sin(TAU * 3 * t)
    return {**p, "t": t, "squash": (p["squash"][0] * (1 + 0.035 * pant * s), p["squash"][1] * (1 - 0.045 * pant * s)),
            "pitch": p["pitch"] + D(3) * pant * s}


ARMS_UP = dict(hands=per_side(lambda s, sign: (sign * 0.23, -0.01, 0.6)),
               dirs=per_side(lambda s, sign: (sign * 0.8, -0.1, 0.8)),
               elbows=per_side(lambda s, sign: (sign * 0.7, 0.4, -0.6)))


def stomp_keys():
    hit, planted, end = STOMP_HIT / FPS, STOMP_UP / FPS, STOMP_FRAMES / FPS
    # like a sumo wrestler's stamp: the weight over the left foot, the right leg hauled up high
    # out to the side, where it shows from anywhere
    shift = pose(REST, pos=V((0.035, 0.005, -0.015)), roll=D(6), squash=(1.02, 0.98), cap=(D(6), D(14)),
                 feet={"L": FOOT["L"] + V((-0.01, 0, 0))},
                 hands=per_side(lambda s, sign: (sign * 0.23, -0.04, 0.42)),
                 dirs=per_side(lambda s, sign: (sign * 1, -0.3, 0.2)))
    lifted = pose(shift, pos=V((0.04, 0.01, -0.005)), pitch=D(-8), roll=D(15), squash=(0.97, 1.04), cap=(D(-18), D(22)),
                  feet={"R": V((-0.15, -0.04, 0.19))}, knees=V((-0.9, -0.5, 0.3)), **ARMS_UP)
    top = pose(lifted, pitch=D(-11), roll=D(19), squash=(0.96, 1.05), cap=(D(-24), D(26)), feet={"R": V((-0.17, -0.05, 0.23))})
    slam = pose(REST, pos=V((0.0, -0.035, -0.055)), pitch=D(18), roll=D(-3), squash=(1.12, 0.86), cap=(D(45), D(-6)),
                feet={"R": STOMP_AT, "L": FOOT["L"] + V((0, 0.02, 0))},
                hands=per_side(lambda s, sign: (sign * 0.21, -0.1, 0.2)),
                dirs=per_side(lambda s, sign: (sign * 0.5, -0.5, -0.8)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.3, 0.3)))
    rebound = pose(slam, pos=V((0.0, -0.025, -0.03)), pitch=D(11), squash=(0.97, 1.03), cap=(D(10), D(4)))
    tug = pose(slam, pos=V((0.01, 0.0, -0.025)), pitch=D(-6), roll=D(4), squash=(1.0, 1.0), cap=(D(-8), D(8)),
               hands=per_side(lambda s, sign: (sign * 0.22, 0.02, 0.4)),
               dirs=per_side(lambda s, sign: (sign * 1, 0.1, 0.3)))
    return [(0, REST), (0.45, shift), (1.15, lifted), (hit - 0.22, top, "out"), (hit, slam, "in"), (hit + 0.12, rebound, "out"),
            (hit + 0.4, tug), (planted, pose(tug, pitch=D(-9), pos=V((0.01, 0.01, -0.02)))), (end, REST)]


def stomp(f):
    t = f / FPS
    p = keyed(t, STOMP_KEYS)
    hit, planted = STOMP_HIT / FPS, STOMP_UP / FPS
    # wobbling on one foot at the top, and tugging at the stuck foot afterwards
    wobble = C.smoothstep(0.9, 1.2, t) * (1 - C.smoothstep(hit - 0.3, hit - 0.2, t))
    tug = C.smoothstep(hit + 0.3, hit + 0.45, t) * (1 - C.smoothstep(planted - 0.1, planted, t))
    w = math.sin(TAU * 2.4 * t)
    return {**p, "t": t, "roll": p["roll"] + D(5) * wobble * w + D(4) * tug * math.sin(TAU * 3.5 * t),
            "pitch": p["pitch"] + D(3) * tug * math.sin(TAU * 3.5 * t + 1),
            "pos": p["pos"] + V((0.012 * wobble * w, 0, 0))}


def jump_keys():
    off, hit, end = JUMP_OFF / FPS, JUMP_HIT / FPS, JUMP_FRAMES / FPS
    crouch = pose(REST, pos=V((0, 0.025, -0.075)), pitch=D(20), squash=(1.12, 0.86), cap=(D(28), 0),
                  hands=per_side(lambda s, sign: (sign * 0.2, 0.12, 0.26)),
                  dirs=per_side(lambda s, sign: (sign * 0.3, 0.7, -0.5)),
                  elbows=per_side(lambda s, sign: (sign * 1, -0.2, 0.4)), knees=V((0, -1, 0.15)))
    deep = pose(crouch, pos=V((0, 0.03, -0.085)), pitch=D(24), squash=(1.15, 0.83))
    launch = pose(REST, pos=V((0, -0.01, 0.012)), pitch=D(-4), squash=(0.88, 1.16), cap=(D(-32), 0), **ARMS_UP)
    tuck = pose(launch, pos=V((0, 0, 0.02)), pitch=D(-6), squash=(1.0, 1.0), cap=(D(-24), D(6)),
                feet=per_side(lambda s, sign: FOOT[s] + V((sign * 0.012, -0.035, 0.1))), knees=V((0, -1, 0.6)),
                hands=per_side(lambda s, sign: (sign * 0.27, 0.0, 0.52)),
                dirs=per_side(lambda s, sign: (sign * 1, 0, 0.3)))
    apex = pose(tuck, pitch=D(10), cap=(D(-10), D(-6)), feet=per_side(lambda s, sign: FOOT[s] + V((sign * 0.016, -0.025, 0.085))))
    reach = pose(apex, pos=V((0, 0, 0.0)), pitch=D(4), squash=(0.96, 1.06), cap=(D(-42), D(4)),
                 feet=per_side(lambda s, sign: FOOT[s] + V((sign * 0.012, -0.005, 0.004))), knees=V((0, -1, 0.1)), **ARMS_UP)
    land = pose(REST, pos=V((0, -0.01, -0.085)), pitch=D(16), squash=(1.22, 0.78), cap=(D(50), 0),
                feet=per_side(lambda s, sign: FOOT[s] + V((sign * 0.014, 0, 0))), knees=V((0, -1, 0.1)),
                hands=per_side(lambda s, sign: (sign * 0.24, -0.08, 0.16)),
                dirs=per_side(lambda s, sign: (sign * 0.6, -0.4, -0.8)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.3, 0.3)))
    rebound = pose(land, pos=V((0, -0.005, -0.04)), squash=(0.96, 1.05), pitch=D(8), cap=(D(5), D(5)))
    squat = pose(land, pos=V((0, 0.0, -0.055)), pitch=D(12), squash=(1.06, 0.94), cap=(D(38), D(-12)),
                 hands=per_side(lambda s, sign: (sign * 0.2, -0.03, 0.2)),
                 dirs=per_side(lambda s, sign: (sign * 0.3, -0.2, -1)))
    return [(0, REST), (0.3, crouch), (off - 0.1, deep, "out"), (off, launch, "in"), (off + 0.28, tuck, "out"),
            (off + 0.55, apex), (hit - 0.16, reach), (hit, land, "in"), (hit + 0.12, rebound, "out"), (hit + 0.32, squat),
            (end - 0.35, pose(squat, pitch=D(9))), (end, REST)]


def jump(f):
    t = f / FPS
    p = keyed(t, JUMP_KEYS)
    hit, end = JUMP_HIT / FPS, JUMP_FRAMES / FPS
    # winded after the landing: the body heaves
    pant = C.smoothstep(hit + 0.3, hit + 0.45, t) * (1 - C.smoothstep(end - 0.45, end - 0.3, t))
    s = math.sin(TAU * 3 * t)
    return {**p, "t": t, "squash": (p["squash"][0] * (1 + 0.03 * pant * s), p["squash"][1] * (1 - 0.035 * pant * s))}


def kick_keys():
    hit, end = KICK_HIT / FPS, KICK_FRAMES / FPS
    wind = pose(REST, pos=V((0.025, 0.02, -0.02)), pitch=D(12), roll=D(-6), yaw=D(-14), squash=(1.03, 0.97), cap=(D(18), D(10)),
                feet={"R": V((-0.06, 0.11, 0.09)), "L": FOOT["L"] + V((-0.01, 0, 0))}, knees=V((0, -1, -0.2)),
                hands=per_side(lambda s, sign: (sign * 0.17, -0.13, 0.42)),
                dirs=per_side(lambda s, sign: (sign * 0.4, -1, 0.2)))
    cocked = pose(wind, pitch=D(16), yaw=D(-18), feet={"R": V((-0.06, 0.14, 0.12))}, cap=(D(24), D(12)))
    kick = pose(wind, pos=V((0.02, 0.0, 0.0)), pitch=D(-18), yaw=D(14), squash=(0.96, 1.04), cap=(D(-30), D(-12)),
                feet={"R": V((-0.05, -0.2, 0.17))}, knees=V((0, -1, 0.3)),
                hands=per_side(lambda s, sign: (sign * 0.21, 0.07, 0.46)),
                dirs=per_side(lambda s, sign: (sign * 0.8, 0.5, 0.3)))
    follow = pose(kick, pitch=D(-21), yaw=D(18), feet={"R": V((-0.05, -0.2, 0.2))}, cap=(D(-20), D(-16)))
    return [(0, REST), (0.4, wind), (hit - 0.12, cocked, "out"), (hit, kick, "in"), (hit + 0.15, follow, "out"),
            (end - 0.25, pose(REST, pos=V((0, 0, -0.02)), squash=(1.04, 0.96))), (end, REST)]


def kick(f):
    return {**keyed(f / FPS, KICK_KEYS), "t": f / FPS}


def cannon_keys():
    hit, gust_end, end = CANNON_HIT / FPS, CANNON_END / FPS, CANNON_FRAMES / FPS
    cup = dict(hands=per_side(lambda s, sign: (sign * 0.04, -0.11, 0.3)),
               dirs=per_side(lambda s, sign: (-sign * 0.6, -0.4, 0.4)),
               elbows=per_side(lambda s, sign: (sign * 1, 0.3, -0.4)))
    gather = pose(REST, pos=V((0, 0.03, -0.02)), pitch=D(-16), squash=(1.05, 0.97), cap=(D(-16), 0), **cup)
    wound = pose(gather, pos=V((0, 0.035, -0.03)), pitch=D(-22), squash=(1.07, 0.95), cap=(D(-22), 0))
    blast = pose(REST, pos=V((0, -0.02, -0.03)), pitch=D(10), squash=(0.97, 1.03), cap=(D(24), D(4)),
                 hands=per_side(lambda s, sign: (sign * 0.03, -0.21, 0.33)),
                 dirs=per_side(lambda s, sign: (-sign * 0.2, -1, -0.45)),
                 elbows=per_side(lambda s, sign: (sign * 1, 0, -0.1)),
                 feet={"L": FOOT["L"] + V((0.01, -0.03, 0)), "R": FOOT["R"] + V((-0.01, 0.03, 0))})
    brace = pose(blast, pos=V((0, -0.01, -0.035)), pitch=D(4), cap=(D(-6), D(4)))
    return [(0, REST), (0.35, gather), (hit - 0.1, wound, "out"), (hit, blast, "in"), (hit + 0.25, brace, "out"),
            (gust_end, pose(brace, pitch=D(2))), (end - 0.05, REST), (end, REST)]


def cannon(f):
    t = f / FPS
    p = keyed(t, CANNON_KEYS)
    hit, gust_end = CANNON_HIT / FPS, CANNON_END / FPS
    # the water swirling in his hands while it gathers, then the recoil shaking him while it blasts
    gather = C.smoothstep(0.3, 0.45, t) * (1 - C.smoothstep(hit - 0.15, hit - 0.05, t))
    shake = C.smoothstep(hit, hit + 0.05, t) * (1 - C.smoothstep(gust_end - 0.1, gust_end, t))
    hands = {s: p["hands"][s] + V((sign * 0.012 * math.sin(TAU * 5 * t), 0, 0.012 * math.sin(TAU * 6 * t))) * gather
             for s, sign in SIDES}
    return {**p, "t": t, "hands": hands, "roll": p["roll"] + D(2.5) * shake * math.sin(TAU * 13 * t),
            "pitch": p["pitch"] - D(2) * shake * (0.5 + 0.5 * math.sin(TAU * 9 * t)),
            "pos": p["pos"] + V((0, 0.006 * shake * math.sin(TAU * 11 * t), 0))}


def death(f):
    k, t = C.keyframes, f / FPS
    shudder = math.sin(TAU * 11 * t) * (1 - C.smoothstep(0.2, 0.45, t))
    fall = C.smoothstep(0.55, 1.15, t) ** 1.4
    since = max(0.0, t - 1.15)
    bounce = math.exp(-since * 7) * math.sin(TAU * 2.6 * since) if t > 1.15 else 0.0
    spin = D(200) * C.smoothstep(0.3, 1.0, t)
    p = params(t=t, pos=V((0.006 * shudder, 0.06 * fall, -0.06 * fall + 0.02 * bounce)), yaw=spin,
               pitch=D(-88) * fall, roll=D(6) * shudder, squash=(1 + 0.04 * fall, 1 - 0.05 * fall),
               cap=(D(-30) * fall + D(20) * bounce, D(25) * fall))
    up = C.smoothstep(0.7, 1.2, t)
    for s, sign in SIDES:
        R = C.rot_z(spin)
        p["feet"][s] = R @ FOOT[s].lerp(V((sign * 0.07, -0.16, 0.12 + 0.03 * bounce)), up)
        p["hands"][s] = WRIST[s].lerp(V((sign * 0.26, -0.03, 0.42)), C.smoothstep(0.0, 0.3, t))
        p["dirs"][s] = V((sign * 1, -0.2, 0.3)).normalized()
    p["knees"] = V((0, -0.2, 1)).lerp(V((0, -1, 0.1)), 1 - up)
    return p


def hand_points(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    out = []
    for s, _ in SIDES:
        pb = rig.pose.bones[f"hand.{s}"]
        out.append((rig.matrix_world @ pb.head, (rig.matrix_world.to_3x3() @ (pb.tail - pb.head)).normalized()))
    return out


def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def between_hands(rig, action, frame, ahead=0.0):
    (a, da), (b, db) = hand_points(rig, action, frame)
    return (a + b) / 2 + (da + db).normalized() * ahead


def foot_point(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    return rig.matrix_world @ rig.pose.bones["shin.R"].tail


BLOW_KEYS = CAST_KEYS = SUMMON_KEYS = REST_KEYS = STOMP_KEYS = JUMP_KEYS = KICK_KEYS = CANNON_KEYS = None


def animate(rig, obj):
    global BLOW_KEYS, CAST_KEYS, SUMMON_KEYS, REST_KEYS, STOMP_KEYS, JUMP_KEYS, KICK_KEYS, CANNON_KEYS
    BLOW_KEYS, CAST_KEYS, SUMMON_KEYS, REST_KEYS, STOMP_KEYS = blow_keys(), cast_keys(), summon_keys(), rest_keys(), stomp_keys()
    JUMP_KEYS, KICK_KEYS, CANNON_KEYS = jump_keys(), kick_keys(), cannon_keys()
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SquarloRun", solver(rig, run), RUN_FRAMES, cyclic=True, extras={"speed": RUN_SPEED})
    K.ground_clip(rig, obj, "SquarloSwim", solver(rig, swim), SWIM_FRAMES, cyclic=True, extras={"speed": SWIM_SPEED})
    K.ground_clip(rig, obj, "SquarloStride", solver(rig, stride), STRIDE_FRAMES, cyclic=True, extras={"speed": STRIDE_SPEED})
    b = K.ground_clip(rig, obj, "SquarloBlow", solver(rig, blow), BLOW_FRAMES,
                      extras={"attack_style": "jet", "hit_frame": BLOW_HIT, "hit_time": BLOW_HIT / FPS, "gust_end": GUST_END})
    c = K.ground_clip(rig, obj, "SquarloCast", solver(rig, cast), CAST_FRAMES,
                      extras={"attack_style": "cast", "hit_frame": CAST_HIT, "hit_time": CAST_HIT / FPS})
    s = K.ground_clip(rig, obj, "SquarloSummon", solver(rig, summon), SUMMON_FRAMES,
                      extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    K.ground_clip(rig, obj, "SquarloRest", solver(rig, rest), REST_FRAMES, extras={"attack_style": "rest"})
    st = K.ground_clip(rig, obj, "SquarloStomp", solver(rig, stomp), STOMP_FRAMES,
                       extras={"attack_style": "stomp", "hit_frame": STOMP_HIT, "hit_time": STOMP_HIT / FPS, "planted_until": STOMP_UP})
    j = K.ground_clip(rig, obj, "SquarloJump", solver(rig, jump), JUMP_FRAMES,
                      extras={"attack_style": "jump", "hit_frame": JUMP_HIT, "hit_time": JUMP_HIT / FPS, "takeoff": JUMP_OFF})
    k = K.ground_clip(rig, obj, "SquarloKick", solver(rig, kick), KICK_FRAMES,
                      extras={"attack_style": "kick", "hit_frame": KICK_HIT, "hit_time": KICK_HIT / FPS})
    cn = K.ground_clip(rig, obj, "SquarloCannon", solver(rig, cannon), CANNON_FRAMES,
                       extras={"attack_style": "cannon", "hit_frame": CANNON_HIT, "hit_time": CANNON_HIT / FPS, "gust_end": CANNON_END})
    K.ground_clip(rig, obj, "SquarloDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 2.0}, settle_from=round(1.7 * FPS))
    for act, mark, frame in ((b, "Blow", BLOW_HIT), (c, "Tide", CAST_HIT), (s, "Slap", SUMMON_HIT), (st, "Stomp", STOMP_HIT),
                             (j, "Takeoff", JUMP_OFF), (j, "Land", JUMP_HIT), (k, "Kick", KICK_HIT), (cn, "Blast", CANNON_HIT)):
        act.pose_markers.new(mark).frame = frame
    K.register(rig, CLIPS)
    b["muzzle"] = game(between_hands(rig, "SquarloBlow", BLOW_HIT + 2, 0.03))
    s["muzzle"] = game(between_hands(rig, "SquarloSummon", SUMMON_HIT))
    st["foot"] = game(foot_point(rig, "SquarloStomp", STOMP_HIT + 3))
    cn["muzzle"] = game(between_hands(rig, "SquarloCannon", CANNON_HIT + 2, 0.03))
    return {"blow": list(b["muzzle"]), "summon": list(s["muzzle"]), "foot": list(st["foot"]), "cannon": list(cn["muzzle"])}


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    shots = [("SquarloRun", 0, (0.8, -1.9, 0.9)), ("SquarloRun", 6, (-1.7, -1.1, 0.8)),
             ("SquarloSwim", 6, (1.4, -1.5, 0.8)), ("SquarloBlow", BLOW_HIT + 3, (1.5, -1.5, 0.7)),
             ("SquarloCast", 35, (0.9, -1.9, 0.8)), ("SquarloCast", CAST_HIT + 2, (1.6, -1.4, 0.8)),
             ("SquarloSummon", SUMMON_HIT, (1.6, -1.4, 0.8)), ("SquarloRest", 30, (1.2, -1.7, 0.8)),
             ("SquarloStomp", 45, (1.7, -1.3, 0.7)), ("SquarloStomp", STOMP_HIT + 1, (1.7, -1.3, 0.7)),
             ("SquarloStride", 10, (1.4, -1.6, 0.8)), ("SquarloDeath", DEATH_FRAMES, (1.2, -1.2, 1.3)),
             ("SquarloJump", JUMP_OFF - 3, (1.6, -1.4, 0.7)), ("SquarloJump", JUMP_OFF + 12, (1.6, -1.4, 0.7)),
             ("SquarloJump", JUMP_HIT - 3, (1.6, -1.4, 0.7)), ("SquarloJump", JUMP_HIT + 1, (1.6, -1.4, 0.7)),
             ("SquarloKick", KICK_HIT - 4, (1.9, -0.6, 0.7)), ("SquarloKick", KICK_HIT + 2, (1.9, -0.6, 0.7)),
             ("SquarloCannon", CANNON_HIT - 3, (1.7, -1.2, 0.7)), ("SquarloCannon", CANNON_HIT + 8, (1.7, -1.2, 0.7))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 0.3), size=360, cols=4)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    K.decimate(obj)
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("SquarloDeath",))
    report.update(points)
    K.setup_stage(scene, "Squarlo", STAGE, (0, 0, 0.32), 1.2, camera=(0.9, -2.1, 0.9))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, RUN_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Squarlo", NAME, (0, 0, 0.32), 1.4)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Squarlo:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "squarlo.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "squarlo.blend"),
         preview_path=args[2] if len(args) > 2 else None)
