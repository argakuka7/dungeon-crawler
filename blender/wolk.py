"""
Wolk: a sad little cloud on long stick legs, from the kids' sketch.

A puffy, light blue cloud, longer than it is tall, with a flat belly, walks on
two long, thin legs and lets two thin arms hang from its underside, each
ending in a three-fingered hand. Its face sits on the front of the cloud: two
dark dot eyes under brows raised in the middle, a wobbly frown and a tear on
its cheek. Faces -Y in Blender, +Z up; one unit = one game cell, about 1.35
cells tall.

The game darkens the cloud from light blue to storm grey while it gathers its
lightning, and lightens it again afterwards and as it dies (`gloom` on the
profile, render/enemies.js); the clips leave the colours alone.

Rig: root, body (the cloud and its face), eye.L/R (children of the body; the
eyes close by squashing them flat), per side thigh / shin and arm_upper /
arm_lower / hand. The limbs hang from the root, not from the body, so the death
clip can let them come off and the cloud can squash without bending them.

Clips, 30 fps, in place (the game supplies root motion):
    WolkWalk   32-frame loop: a slow, sad trudge at 0.5 cells/s, the cloud
               bobbing and rocking from side to side, the arms dangling, and a
               slow blink.
    WolkZap    1.7 s: it closes its eyes and lifts its arms up beside the cloud,
               which swells a little and trembles while the lightning gathers
               (from extras.beam_frame on, the game shows where it will strike);
               at frame 33 (extras.hit_frame) it throws its hands forward and
               the bolt jumps from the front of its belly (extras.muzzle: game
               x, up, forward). It opens its eyes again as its arms come down.
    WolkDeath  2.0 s: shudders, its legs fall away to either side, the cloud
               drops to the floor and squashes flat, its arms pop off and land
               beside it, and it closes its eyes. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, wolk; importlib.reload(creature); importlib.reload(wolk)
    wolk.main(export_path="<repo>/assets/wolk.glb", blend_path="<repo>/blender/wolk.blend")

Headless:
    Blender -b --python blender/wolk.py -- assets/wolk.glb blender/wolk.blend \
        blender/previews/wolk-preview.png
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

NAME, RIG_NAME = "Wolk", "WolkRig"
SCENE, COLLECTION, STAGE = "Wolk", "WolkAsset", "WolkStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("WolkWalk", "WolkZap", "WolkDeath")

CLOUD_HEX, BELLY_HEX = "#b4dcf8", "#94c6ec"
LIMB_HEX, FACE_HEX, TEAR_HEX = "#2f6cb4", "#1b2740", "#e6f7ff"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("WolkCloud", CLOUD_HEX, 0), ("WolkCloudBelly", BELLY_HEX, 0),
             ("WolkLimbs", LIMB_HEX, 0), ("WolkFace", FACE_HEX, 0), ("WolkTear", TEAR_HEX, 0.2))
CLOUD_M, BELLY_M, LIMB_M, FACE_M, TEAR_M = range(len(MATERIALS))

VOXEL, DETAIL, FINE = 0.012, 0.0055, 0.004
WALK_FRAMES, WALK_SPEED = 32, 0.5
ZAP_FRAMES, ZAP_HIT, ZAP_CHARGE = 51, 33, 9     # the strike, and where it starts to show (s * 30)
DEATH_FRAMES = 60
LOOP_T = WALK_FRAMES / FPS

# --- body plan -----------------------------------------------------------------
CLOUD_C = V((0, 0, 1.02))
BOTTOM_Z = 0.87                       # its flat belly
PIVOT = V((0, 0, 0.88))               # the body turns about the middle of its belly
# the cloud's puffs: (centre offset, radii)
PUFFS = (((0, 0, 0), (0.38, 0.25, 0.17)),
         ((-0.22, 0.0, 0.08), (0.17, 0.19, 0.15)),
         ((0.02, 0.02, 0.13), (0.20, 0.21, 0.18)),
         ((0.25, 0.0, 0.07), (0.16, 0.18, 0.14)),
         ((-0.40, 0.0, -0.01), (0.12, 0.16, 0.12)),
         ((0.42, 0.0, -0.02), (0.10, 0.14, 0.10)),
         ((0.0, 0.12, 0.05), (0.26, 0.14, 0.15)))

LEG_R, NUB_R = 0.03, 0.04
ARM_R, FINGER_R = 0.024, 0.016
HIP = {s: V((sign * 0.075, 0, 0.88)) for s, sign in SIDES}
LEG_TOP = {s: V((sign * 0.075, 0, 0.95)) for s, sign in SIDES}     # hidden in the cloud
KNEE = {s: V((sign * 0.078, 0, 0.46)) for s, sign in SIDES}
FOOT = {s: V((sign * 0.08, 0, NUB_R)) for s, sign in SIDES}        # the round nub it stands on
SHOULDER = {s: V((sign * 0.28, -0.03, 0.94)) for s, sign in SIDES}
ARM_TOP = {s: V((sign * 0.27, -0.03, 0.99)) for s, sign in SIDES}
ELBOW = {s: V((sign * 0.38, -0.05, 0.70)) for s, sign in SIDES}
WRIST = {s: V((sign * 0.45, -0.07, 0.49)) for s, sign in SIDES}
FINGERS = ((-0.75, 0.065), (0.0, 0.085), (0.75, 0.065))            # (fan angle, length)


def cloud_sdf(P):
    d = None
    for off, radii in PUFFS:
        e = K.ellipsoid(P, CLOUD_C + V(off), radii)
        d = e if d is None else K.smin(d, e, 0.05)
    return K.smax(d, -(P[..., 2] - BOTTOM_Z), 0.04)


def front_y(x, z):
    """y of the cloud's front surface (-Y side) at (x, z)."""
    out, inside = -0.7, 0.0
    for _ in range(32):
        mid = (out + inside) / 2
        if float(cloud_sdf(np.array([[x, mid, z]], np.float32))[0]) > 0:
            out = mid
        else:
            inside = mid
    return (out + inside) / 2


def on_face(x, z, sink=0.0):
    return V((x, front_y(x, z) + sink, z))


EYES = {s: on_face(sign * 0.1, 1.05, 0.014) for s, sign in SIDES}
EYE_RADII = (0.03, 0.022, 0.044)
# brows raised in the middle, a wobbly frown and a tear under its left eye
BROWS = {s: [on_face(sign * (0.055 + 0.095 * u), 1.138 - 0.034 * u - 0.008 * u * u, 0.005) for u in np.linspace(0, 1, 6)]
         for s, sign in SIDES}
MOUTH = [on_face(x, 0.955 + 0.024 * (1 - (x / 0.085) ** 2) + 0.005 * math.sin(x * 70), 0.005)
         for x in np.linspace(-0.085, 0.085, 11)]
TEAR = (on_face(0.122, 0.985, 0.01), on_face(0.118, 1.018, 0.004))
MUZZLE_REST = V((0, front_y(0, 0.92) + 0.03, 0.89))                 # where the bolt leaves its belly


def hand_frame(s):
    """The hand's direction and the outward direction its fingers fan in (rest)."""
    sign = 1 if s == "L" else -1
    a = (WRIST[s] - ELBOW[s]).normalized()
    side = V((sign, 0, 0))
    return a, (side - a * side.dot(a)).normalized()


def finger_tips(s):
    a, perp = hand_frame(s)
    w = WRIST[s]
    return [w + (a * math.cos(ang) + perp * math.sin(ang)) * length for ang, length in FINGERS]


def cloud_mats(centers):
    return np.where(centers[:, 2] < BOTTOM_Z + 0.045, BELLY_M, CLOUD_M)


def leg_sdf(P, s):
    tube = F._sd_polyline(P, [LEG_TOP[s], KNEE[s], FOOT[s]], LEG_R)
    return K.smin(tube, F._sd_sphere(P, FOOT[s], NUB_R), 0.02)


def arm_sdf(P, s):
    return F._sd_polyline(P, [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], ARM_R)


def hand_sdf(P, s):
    d = None
    for tip in finger_tips(s):
        f = K.round_cone(P, WRIST[s], tip, FINGER_R * 1.1, FINGER_R * 0.85)
        d = f if d is None else np.minimum(d, f)
    return d


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", cloud_sdf, (-0.6, -0.34, BOTTOM_Z - 0.05), (0.6, 0.34, 1.4), VOXEL, mat=cloud_mats)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: K.ellipsoid(P, c, EYE_RADII), e - V((0.06,) * 3), e + V((0.06,) * 3),
                  FINE, mat=FACE_M)
        lo, hi = K.bounds(BROWS[s], 0.03)
        parts.add("body", lambda P, pts=BROWS[s]: F._sd_polyline(P, pts, 0.011), lo, hi, FINE, mat=FACE_M)
    lo, hi = K.bounds(MOUTH, 0.03)
    parts.add("body", lambda P: F._sd_polyline(P, MOUTH, 0.011), lo, hi, FINE, mat=FACE_M)
    lo, hi = K.bounds(TEAR, 0.04)
    parts.add("body", lambda P: K.round_cone(P, TEAR[0], TEAR[1], 0.021, 0.005), lo, hi, FINE, mat=TEAR_M)
    for s, sign in SIDES:
        lo, hi = K.bounds([LEG_TOP[s], FOOT[s]], 0.06)
        parts.add(f"leg.{s}", lambda P, s=s: leg_sdf(P, s), lo, hi, DETAIL, mat=LIMB_M)
        lo, hi = K.bounds([ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], 0.04)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=LIMB_M)
        lo, hi = K.bounds([WRIST[s], *finger_tips(s)], 0.03)
        parts.add(f"hand.{s}", lambda P, s=s: hand_sdf(P, s), lo, hi, FINE, mat=LIMB_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "wolk"
    obj["cloud_color"] = CLOUD_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", PIVOT, PIVOT + V((0, 0, 0.3)), "root", True, fwd)]
    for s, _ in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + V((0, -0.06, 0)), "body", True, up))
    for s, _ in SIDES:
        a, _ = hand_frame(s)
        bones += [(f"thigh.{s}", HIP[s], KNEE[s], "root", True, fwd),
                  (f"shin.{s}", KNEE[s], FOOT[s], f"thigh.{s}", True, fwd),
                  (f"arm_upper.{s}", SHOULDER[s], ELBOW[s], "root", True, fwd),
                  (f"arm_lower.{s}", ELBOW[s], WRIST[s], f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], WRIST[s] + a * 0.085, f"arm_lower.{s}", True, fwd)]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "wolk", "forward": "-Y", "attack_style": "lightning", "normal_speed": WALK_SPEED,
        "root_motion": False})


def limb(Q, pts, joint, names, width):
    """Bone shares along a two-bone limb: names[0] up to the joint (arc length), names[1] past it."""
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
        if part in ("body", "eye"):
            W[lo:hi, names.index(kind)] = 1
            continue
        if part == "hand":
            W[lo:hi, names.index(f"hand.{s}")] = 1
            continue
        if part == "leg":
            pts, bones = [LEG_TOP[s], HIP[s], KNEE[s], FOOT[s]], (f"thigh.{s}", f"shin.{s}")
        else:
            pts, bones = [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], (f"arm_upper.{s}", f"arm_lower.{s}")
        shares = limb(P[lo:hi], pts, arc(pts)[2], bones, 0.05)
        WB = np.zeros((hi - lo, len(names)), np.float32)
        for name, share in shares.items():
            WB[:, names.index(name)] += share
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
    for name, roughness in (("WolkCloud", 0.85), ("WolkCloudBelly", 0.85), ("WolkLimbs", 0.55),
                            ("WolkFace", 0.4), ("WolkTear", 0.08)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
REST_HAND = {s: WRIST[s].copy() for s, _ in SIDES}                   # body space
REST_DIR = {s: hand_frame(s)[0] for s, _ in SIDES}
REST_ELBOW = {s: V((sign * 1.0, 0.25, 0.1)) for s, sign in SIDES}     # which way the elbows point


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0),
         "eyes": 1.0,                                                  # 1 open, near 0 shut
         "feet": {s: FOOT[s].copy() for s, _ in SIDES},                # world (attached legs)
         "hands": {s: REST_HAND[s].copy() for s, _ in SIDES},          # body space
         "dirs": {s: REST_DIR[s].copy() for s, _ in SIDES},            # where the hands point, body space
         "elbows": {s: REST_ELBOW[s].copy() for s, _ in SIDES},
         "legs": {s: None for s, _ in SIDES},                          # a fallen-off leg: its rigid 4x4
         "arms": {s: None for s, _ in SIDES}}                          # likewise an arm
    p.update(kw)
    return p


def body_motion(p):
    """The body's rigid move (armature space) and its squash about the belly."""
    R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
    rigid = Matrix.Translation(p["pos"]) @ K.about(PIVOT, R)
    sx, sz = p["squash"]
    return rigid, rigid @ K.about(V((0, 0, BOTTOM_Z)), Matrix.Diagonal((sx, sx, sz)))


def solver(rig, fn):
    skel = C.Skeleton(rig)
    length = lambda a, b: (skel.rest[a].inverted() @ skel.rest[b]).translation.length
    leg_len = {s: ((KNEE[s] - HIP[s]).length, (FOOT[s] - KNEE[s]).length) for s, _ in SIDES}
    arm_len = {s: ((ELBOW[s] - SHOULDER[s]).length, (WRIST[s] - ELBOW[s]).length) for s, _ in SIDES}
    assert all(abs(length(f"thigh.{s}", f"shin.{s}") - leg_len[s][0]) < 1e-4 for s, _ in SIDES)

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        rigid, squashed = body_motion(p)
        rigid, squashed = L @ rigid, L @ squashed
        bases["body"] = skel.set("body", poses, squashed @ skel.rest["body"])
        e = max(0.06, p["eyes"])
        for s, _ in SIDES:
            bases[f"eye.{s}"] = K.pose_local(skel, f"eye.{s}", poses, Matrix.Diagonal((1, 1, e, 1)))
        r3 = rigid.to_3x3()
        for s, sign in SIDES:
            th, sh = f"thigh.{s}", f"shin.{s}"
            if p["legs"][s] is not None:
                for name in (th, sh):
                    bases[name] = skel.set(name, poses, L @ p["legs"][s] @ skel.rest[name])
            else:
                hip = rigid @ HIP[s]
                knee, foot = C.two_bone_ik(hip, L @ p["feet"][s], *leg_len[s], r3 @ V((0, -1, 0.05)))
                bases[th] = K.aim_at(skel, th, poses, hip, knee - hip)
                bases[sh] = K.aim_at(skel, sh, poses, knee, foot - knee)
            up, lo, hand = f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"
            if p["arms"][s] is not None:
                for name in (up, lo, hand):
                    bases[name] = skel.set(name, poses, L @ p["arms"][s] @ skel.rest[name])
            else:
                shoulder = rigid @ SHOULDER[s]
                elbow, wrist = C.two_bone_ik(shoulder, rigid @ p["hands"][s], *arm_len[s], r3 @ p["elbows"][s])
                bases[up] = K.aim_at(skel, up, poses, shoulder, elbow - shoulder)
                bases[lo] = K.aim_at(skel, lo, poses, elbow, wrist - elbow)
                bases[hand] = K.aim_at(skel, hand, poses, wrist, r3 @ p["dirs"][s])
        return bases
    return solve


def blink(t, at, length=0.2):
    """1 open, closing and opening again over `length` s from `at`."""
    u = (t - at) / length
    return 1 - 0.94 * math.sin(math.pi * u) ** 2 if 0 <= u <= 1 else 1.0


def walk(f):
    n, T = WALK_FRAMES, LOOP_T
    ph = (f / n) % 1
    w = TAU * ph
    duty = 0.62
    stride = WALK_SPEED * duty * T
    feet = {}
    for s, _ in SIDES:
        y, z = C.foot_track((ph + (0.5 if s == "R" else 0)) % 1, duty, stride, 0.07, WALK_SPEED, T, skew=0.9)
        feet[s] = FOOT[s] + V((0, y, z))
    hands, dirs = {}, {}
    for s, sign in SIDES:
        swing = math.sin(w + (math.pi if s == "R" else 0) - 0.9)      # limp, lagging behind the steps
        hands[s] = REST_HAND[s] + V((sign * 0.012 * math.sin(2 * w), 0.07 * swing, 0.012 * abs(swing)))
        dirs[s] = (REST_DIR[s] + V((0, 0.35 * swing, 0))).normalized()
    return params(t=f / FPS, pos=V((0.008 * math.sin(w), 0, -0.035 + 0.018 * math.cos(2 * w))),
                  pitch=D(5) + D(1.5) * math.cos(2 * w), roll=D(3.5) * math.sin(w), yaw=D(2) * math.sin(w + 0.4),
                  feet=feet, hands=hands, dirs=dirs, eyes=blink(f, 19, 6))


RAISED = {s: V((sign * 0.64, -0.1, 1.12)) for s, sign in SIDES}
RAISED_ELBOW = {s: V((sign * 1.0, 0.3, -0.5)) for s, sign in SIDES}
THRUST = {s: V((sign * 0.24, -0.46, 0.83)) for s, sign in SIDES}
THRUST_ELBOW = {s: V((sign * 0.7, 0.1, -0.6)) for s, sign in SIDES}


def zap(f):
    k, t = C.keyframes, f / FPS
    hit = ZAP_HIT / FPS
    raise_ = k((0, 0), (0.3, 1), (hit - 0.12, 1.06), (hit, 0))(t)
    thrust = k((0, 0), (hit - 0.1, 0), (hit, 1), (hit + 0.22, 1), (1.62, 0))(t)
    tremble = math.sin(TAU * 13 * t) * C.smoothstep(0.25, 0.4, t) * (1 - C.smoothstep(hit - 0.05, hit, t))
    puff = 1 + 0.06 * k((0, 0), (0.3, 0.5), (hit - 0.05, 1), (hit + 0.25, 0))(t)
    eyes = k((0, 1), (0.06, 1), (0.22, 0.06), (1.32, 0.06), (1.52, 1))(t)
    hands, dirs, elbows = {}, {}, {}
    for s, sign in SIDES:
        rest = REST_HAND[s]
        up = RAISED[s] + V((sign * 0.012 * tremble, 0, 0.015 * tremble))
        h = rest.lerp(up, min(1.0, raise_))
        hands[s] = h.lerp(THRUST[s], thrust)
        d = REST_DIR[s].lerp(V((sign * 0.35, 0, 1)).normalized(), min(1.0, raise_))
        dirs[s] = d.lerp(V((sign * 0.15, -1, -0.15)).normalized(), thrust).normalized()
        elbows[s] = REST_ELBOW[s].lerp(RAISED_ELBOW[s], min(1.0, raise_)).lerp(THRUST_ELBOW[s], thrust)
    return params(t=t, pos=V((0.006 * tremble, -0.07 * thrust, 0.03 * min(1.0, raise_) - 0.02 * thrust)),
                  pitch=D(-6) * min(1.0, raise_) + D(11) * thrust, roll=D(1.5) * tremble,
                  squash=(puff, puff), eyes=eyes, hands=hands, dirs=dirs, elbows=elbows)


# where each limb comes to lie, clear of the cloud as seen from above: the legs topple about
# their feet and land like dropped sticks in front of it (foot, direction), the arms beside it
# (middle, direction)
LEG_LIE = {"L": (V((0.06, -0.46, NUB_R)), V((1, -0.18, 0)).normalized()),
           "R": (V((-0.1, -0.62, NUB_R)), V((-1, 0.14, 0)).normalized())}
ARM_LIE = {s: (V((sign * 0.84, -0.05, ARM_R)), V((sign * 0.22, -0.97, 0)).normalized()) for s, sign in SIDES}


def arm_rest_frame(s):
    """The arm's axis, the outward way its fingers fan and their normal; and its middle."""
    a = (WRIST[s] - SHOULDER[s]).normalized()
    _, perp = hand_frame(s)
    perp = (perp - a * perp.dot(a)).normalized()
    return Matrix((a, perp, a.cross(perp))).transposed(), (ARM_TOP[s] + WRIST[s]) / 2


def lying_arm(s):
    """The rotation that lays an arm flat on the floor, fingers flat too."""
    F0, _ = arm_rest_frame(s)
    _, d = ARM_LIE[s]
    n = V((0, 0, 1))
    F1 = Matrix((d, n.cross(d), n)).transposed()
    return F1 @ F0.inverted()


def rigid(rot3, centre, rest_centre):
    return Matrix.Translation(centre) @ rot3.to_4x4() @ Matrix.Translation(-rest_centre)


def bump(t, at, length):
    """0 -> 1 -> 0 over `length` s from `at` (a little hop after landing)."""
    return math.sin(math.pi * min(1.0, max(0.0, (t - at) / length)))


def fallen_body(t):
    """The cloud in the death clip: shudders, drops once its legs are gone (accelerating),
    lands at 0.72 s and squashes flat, wobbling."""
    shudder = math.sin(TAU * 9 * t) * (1 - C.smoothstep(0.2, 0.4, t))
    fall = min(1.0, max(0.0, (t - 0.36) / 0.36)) ** 2
    since = max(0.0, t - 0.72)
    wobble = math.exp(-since * 7) * math.cos(TAU * 2.4 * since) if t > 0.72 else 0.0
    landed = C.smoothstep(0.7, 0.76, t)
    return params(pos=V((0, 0.08 * fall, -0.85 * fall)), roll=D(4) * shudder + D(3) * landed,
                  pitch=D(-4) * landed, squash=(1 + landed * (0.05 + 0.08 * wobble), 1 - landed * (0.1 + 0.14 * wobble)))


LEGS_OFF, ARMS_OFF = 0.3, 0.42


def death(f):
    k, t = C.keyframes, f / FPS
    body = fallen_body(t)
    legs, arms = {}, {}
    for s, sign in SIDES:
        # a leg topples outward about its foot, accelerating, and lands at 0.7 s
        if t >= LEGS_OFF:
            at, d = LEG_LIE[s]
            u = min(1.0, (t - LEGS_OFF) / 0.4) ** 2
            rot = Matrix.Identity(3).to_quaternion().slerp(V((0, 0, 1)).rotation_difference(d), u).to_matrix()
            foot = FOOT[s].lerp(at, C.smoothstep(LEGS_OFF, 0.7, t)) + V((0, 0, 0.025 * bump(t, 0.7, 0.14)))
            legs[s] = rigid(rot, foot, FOOT[s])
        else:
            legs[s] = None
        # an arm flails out and rides along, then pops off in a hop and lands at 0.9 s
        flail = lambda t: K.about(SHOULDER[s], Matrix.Rotation(-sign * D(28) * C.smoothstep(0.05, 0.3, t), 3, "Y"))
        if t <= ARMS_OFF:
            arms[s] = body_motion(body)[0] @ flail(t)
        else:
            start = body_motion(fallen_body(ARMS_OFF))[0] @ flail(ARMS_OFF)
            _, c_rest = arm_rest_frame(s)
            v = min(1.0, (t - ARMS_OFF) / 0.48)
            u = C.smoothstep(0.0, 1.0, v)
            r0, r1 = start.to_3x3().to_quaternion(), lying_arm(s).to_quaternion()
            centre = (start @ c_rest).lerp(ARM_LIE[s][0], u) + V((0, 0, 0.32 * 4 * v * (1 - v) + 0.03 * bump(t, 0.9, 0.14)))
            arms[s] = rigid(r0.slerp(r1, u).to_matrix(), centre, c_rest)
    eyes = k((0, 1), (0.12, 1.22), (0.4, 1.0), (1.0, 1.0), (1.35, 0.06))(t)
    body.update(t=t, eyes=eyes, legs=legs, arms=arms)
    return body


def muzzle_point(rig, action, frame):
    """Armature-space point on the front of its belly the bolt leaves from."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    body = rig.pose.bones["body"]
    delta = body.matrix @ rig.data.bones["body"].matrix_local.inverted()
    return rig.matrix_world @ delta @ MUZZLE_REST


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "WolkWalk", solver(rig, walk), WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    act = K.ground_clip(rig, obj, "WolkZap", solver(rig, zap), ZAP_FRAMES,
                        extras={"attack_style": "lightning", "hit_frame": ZAP_HIT, "hit_time": ZAP_HIT / FPS,
                                "beam_frame": ZAP_CHARGE})
    act.pose_markers.new("Charge").frame = ZAP_CHARGE
    act.pose_markers.new("Strike").frame = ZAP_HIT
    m = muzzle_point(rig, "WolkZap", ZAP_HIT)
    act["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    K.ground_clip(rig, obj, "WolkDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.7}, settle_from=round(1.5 * FPS))
    K.register(rig, CLIPS)
    return list(act["muzzle"])


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    shots = [("WolkWalk", 0, (2.2, -5.0, 2.4)), ("WolkWalk", 10, (-4.5, -2.5, 2.2)),
             ("WolkZap", 22, (2.6, -4.8, 2.0)), ("WolkZap", ZAP_HIT + 2, (4.6, -2.6, 1.8)),
             ("WolkDeath", 20, (3.0, -4.4, 2.6)), ("WolkDeath", DEATH_FRAMES, (2.4, -4.2, 3.6))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 0.65), size=360, cols=3)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("WolkDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "Wolk", STAGE, (0, 0, 0.7), 2.4)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Wolk", NAME, (0, 0, 0.7), 3.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Wolk:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "wolk.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "wolk.blend"),
         preview_path=args[2] if len(args) > 2 else None)
