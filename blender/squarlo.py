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
    SquarloStride  40-frame loop: a giant's slow, heavy walk, knees high (phase 2).
    SquarloBlow    1.6 s: cups his hands at his chest, leans back as the water gathers in them,
                   and at frame 24 (extras.hit_frame) thrusts them forward: the jet blows out of
                   them (extras.muzzle) until frame 39.
    SquarloCast    2.4 s: throws his arms up and wiggles, swaying, then slams them down at frame
                   60 (extras.hit_frame): the tide rises.
    SquarloSummon  1.4 s: crouches, lifts his hands and slaps the floor in front of him at frame
                   24 (extras.hit_frame, extras.muzzle).
    SquarloRest    2.2 s: plops down on his bottom, panting, arms and cap drooping, and gets up.
    SquarloStomp   3.2 s: leans onto his left foot and lifts the right one high (the tell),
                   wobbling, stamps it down in front of him at frame 57 (extras.hit_frame; where
                   it lands: extras.foot) and leaves it planted until frame 87.
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
         "SquarloRest", "SquarloStomp", "SquarloDeath")

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
STOMP_FRAMES, STOMP_HIT, STOMP_UP = 96, 57, 87
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

STOMP_AT = V((-0.064, -0.112, FOOT["R"].z))   # where the right foot comes down


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


def keyed(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            return blend(a, b, C.smoothstep(t0, t1, t))
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
    n, T = STRIDE_FRAMES, STRIDE_FRAMES / FPS
    ph = (f / n) % 1
    w = TAU * ph
    duty, length = 0.62, STRIDE_SPEED * 0.62 * T
    feet, hands, dirs = {}, {}, {}
    for s, sign in SIDES:
        y, z = C.foot_track((ph + (0.5 if s == "R" else 0)) % 1, duty, length, 0.075, STRIDE_SPEED, T, skew=1.2)
        feet[s] = FOOT[s] + V((0, y, z))
        swing = math.sin(w + (0 if s == "R" else math.pi))
        hands[s] = V((sign * 0.2, -0.02 - 0.04 * swing, 0.34))
        dirs[s] = V((sign * 0.4, -0.5, 0.6)).normalized()
    return params(t=f / FPS, pos=V((0.012 * math.sin(w), 0, -0.03 + 0.012 * math.cos(2 * w))),
                  pitch=D(6), roll=D(6) * math.sin(w), yaw=D(4) * math.sin(w),
                  feet=feet, hands=hands, dirs=dirs, cap=(D(8) * math.sin(2 * w - 0.8), D(12) * math.sin(w - 0.6)))


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


def stomp_keys():
    hit, planted = STOMP_HIT / FPS, STOMP_UP / FPS
    lean = pose(REST, pos=V((0.02, 0, 0)), roll=D(-7), cap=(0, D(12)),
                feet={"L": FOOT["L"] + V((-0.01, 0, 0))})
    lifted = pose(lean, pitch=D(-9), squash=(0.98, 1.03), cap=(D(-14), D(10)),
                  feet={"R": V((-0.06, -0.035, 0.16))}, knees=V((0, -1, 0.3)),
                  hands=per_side(lambda s, sign: (sign * 0.22, -0.02, 0.52)),
                  dirs=per_side(lambda s, sign: (sign * 1, -0.2, 0.4)),
                  elbows=per_side(lambda s, sign: (sign * 0.6, 0.4, -0.8)))
    down = pose(REST, pos=V((0, -0.04, -0.025)), pitch=D(14), roll=D(-3), squash=(1.05, 0.95), cap=(D(32), D(-4)),
                feet={"R": STOMP_AT, "L": FOOT["L"] + V((0, 0.015, 0))},
                hands=per_side(lambda s, sign: (sign * 0.2, -0.08, 0.3)),
                dirs=per_side(lambda s, sign: (sign * 0.6, -0.4, -0.6)))
    return [(0, REST), (0.45, lean), (1.25, lifted), (hit - 0.12, pose(lifted, pitch=D(-12), feet={"R": V((-0.06, -0.04, 0.17))})),
            (hit, down), (planted, pose(down, squash=(1.03, 0.97))), (STOMP_FRAMES / FPS - 0.04, REST), (STOMP_FRAMES / FPS, REST)]


def stomp(f):
    t = f / FPS
    p = keyed(t, STOMP_KEYS)
    wobble = C.smoothstep(1.0, 1.25, t) * (1 - C.smoothstep(STOMP_HIT / FPS - 0.2, STOMP_HIT / FPS - 0.12, t))
    return {**p, "t": t, "roll": p["roll"] + D(4) * wobble * math.sin(TAU * 2.2 * t), "pos": p["pos"] + V((0.01 * wobble * math.sin(TAU * 2.2 * t), 0, 0))}


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


BLOW_KEYS = CAST_KEYS = SUMMON_KEYS = REST_KEYS = STOMP_KEYS = None


def animate(rig, obj):
    global BLOW_KEYS, CAST_KEYS, SUMMON_KEYS, REST_KEYS, STOMP_KEYS
    BLOW_KEYS, CAST_KEYS, SUMMON_KEYS, REST_KEYS, STOMP_KEYS = blow_keys(), cast_keys(), summon_keys(), rest_keys(), stomp_keys()
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
    K.ground_clip(rig, obj, "SquarloDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 2.0}, settle_from=round(1.7 * FPS))
    for act, mark, frame in ((b, "Blow", BLOW_HIT), (c, "Tide", CAST_HIT), (s, "Slap", SUMMON_HIT), (st, "Stomp", STOMP_HIT)):
        act.pose_markers.new(mark).frame = frame
    K.register(rig, CLIPS)
    b["muzzle"] = game(between_hands(rig, "SquarloBlow", BLOW_HIT + 2, 0.03))
    s["muzzle"] = game(between_hands(rig, "SquarloSummon", SUMMON_HIT))
    st["foot"] = game(foot_point(rig, "SquarloStomp", STOMP_HIT + 3))
    return {"blow": list(b["muzzle"]), "summon": list(s["muzzle"]), "foot": list(st["foot"])}


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    shots = [("SquarloRun", 0, (0.8, -1.9, 0.9)), ("SquarloRun", 6, (-1.7, -1.1, 0.8)),
             ("SquarloSwim", 6, (1.4, -1.5, 0.8)), ("SquarloBlow", BLOW_HIT + 3, (1.5, -1.5, 0.7)),
             ("SquarloCast", 35, (0.9, -1.9, 0.8)), ("SquarloCast", CAST_HIT + 2, (1.6, -1.4, 0.8)),
             ("SquarloSummon", SUMMON_HIT, (1.6, -1.4, 0.8)), ("SquarloRest", 30, (1.2, -1.7, 0.8)),
             ("SquarloStomp", 45, (1.7, -1.3, 0.7)), ("SquarloStomp", STOMP_HIT + 4, (1.7, -1.3, 0.7)),
             ("SquarloStride", 10, (1.4, -1.6, 0.8)), ("SquarloDeath", DEATH_FRAMES, (1.2, -1.2, 1.3))]
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
