"""
Mecked: a biting beast on two stubby legs, from the kids' sketch.

A round-bellied creature that stands upright: a pear of a body on two short,
stout legs with flat feet, a long neck rising from its back to a small head
with two long, pointed rabbit ears, and a long crocodile snout full of
zig-zag teeth (the lower jaw a little chunkier than the upper one, with a
round nose and two nostrils at the tip). Two short arms with three-fingered
hands and stripes over the upper arm hang in front of its belly, which has
pale plates. Behind it a long, ringed tail runs back along the floor and
curls up into a big spiral. Faces -Y in Blender, +Z up; one unit = one game
cell, about 1.4 cells to the top of its head and 1.8 to the tips of its ears.

The body, neck, head, snout, ears, legs and tail are one OpenVDB SDF skinned
to a spine (hips, chest, neck, head), the ears (two bones each), the legs
(thigh, shin, foot) and an eight-bone tail. The lower jaw, the teeth, the
eyes and the nostrils are rigid parts; the arms are their own tubes, skinned
to two bones, with the hands on a third.

Clips, 30 fps, in place (the game supplies root motion):
    MeckedWalk   24-frame waddle loop at 0.55 cells/s: the body rolls from foot
                 to foot, the neck bobs against it, the ears and the tail sway
                 a beat behind.
    MeckedBite   1.0 s: it rears back with its jaws wide, lunges forward and
                 down and snaps them shut at frame 13 (extras.hit_frame), shakes
                 its head and recovers.
    MeckedGrab   2.4 s: it reaches out with both arms and catches at frame 15
                 (extras.hit_frame), pulls what it caught up against its belly
                 (extras.grip: where the caught body is held, every second frame
                 from the catch to the release), bites down on it at frames 30
                 and 45 (extras.bite_frames), and shoves it away at frame 57
                 (extras.release_frame).
    MeckedDeath  2.0 s: reels back, topples over onto its side, the jaw falls
                 slack, the ears flop and the eyes close. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, mecked; importlib.reload(creature); importlib.reload(mecked)
    mecked.main(export_path="<repo>/assets/mecked.glb", blend_path="<repo>/blender/mecked.blend")

Headless:
    Blender -b --python blender/mecked.py -- assets/mecked.glb blender/mecked.blend \
        blender/previews/mecked-preview.png
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

NAME, RIG_NAME = "Mecked", "MeckedRig"
SCENE, COLLECTION, STAGE = "Mecked", "MeckedAsset", "MeckedStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("MeckedWalk", "MeckedBite", "MeckedGrab", "MeckedDeath")

SKIN_HEX, BELLY_HEX, STRIPE_HEX, EAR_HEX = "#7f8c4e", "#dcd39c", "#4b5530", "#c8a07c"
EYE_HEX, PUPIL_HEX, TEETH_HEX, MOUTH_HEX = "#ffd23a", "#16120a", "#f4efe0", "#6a2420"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("MeckedSkin", SKIN_HEX, 0), ("MeckedBelly", BELLY_HEX, 0), ("MeckedStripes", STRIPE_HEX, 0),
             ("MeckedEarInner", EAR_HEX, 0), ("MeckedEyes_glow", EYE_HEX, 0.5), ("MeckedPupils", PUPIL_HEX, 0),
             ("MeckedTeeth", TEETH_HEX, 0), ("MeckedMouth", MOUTH_HEX, 0))
SKIN_M, BELLY_M, STRIPE_M, EAR_M, EYE_M, PUPIL_M, TEETH_M, MOUTH_M = range(len(MATERIALS))

VOXEL, DETAIL, FINE = 0.011, 0.006, 0.003
WALK_FRAMES, WALK_SPEED = 24, 0.55
BITE_FRAMES, BITE_HIT = 30, 13
GRAB_FRAMES, GRAB_HIT, GRAB_BITES, GRAB_RELEASE = 72, 15, (30, 45), 57
DEATH_FRAMES = 60

# --- body plan -------------------------------------------------------------------
PELVIS = V((0, 0.04, 0.45))
BELLY_C, BELLY_R = V((0, -0.01, 0.56)), (0.25, 0.25, 0.27)
CHEST_C, CHEST_R = V((0, 0.03, 0.84)), (0.17, 0.17, 0.2)
CHEST_TOP = V((0, 0.05, 0.95))
NECK = [V((0, 0.06, 0.88)), V((0, 0.05, 1.06)), V((0, 0.01, 1.24))]
NECK_R = (0.13, 0.1, 0.092)
HEAD_C, HEAD_R = V((0, -0.01, 1.32)), (0.12, 0.14, 0.115)
HEAD_BASE = V((0, 0.01, 1.24))
SNOUT_Z = 1.345
SNOUT_A, SNOUT_B, SNOUT_R, SNOUT_K = V((0, -0.08, SNOUT_Z)), V((0, -0.47, SNOUT_Z)), (0.085, 0.05), 0.72
NOSE_C, NOSE_R = V((0, -0.47, 1.36)), (0.058, 0.05, 0.045)
NOSTRILS = {s: V((sign * 0.024, -0.488, 1.395)) for s, sign in SIDES}
JAW_HINGE, JAW_Z = V((0, 0.0, 1.25)), 1.2
JAW_A, JAW_B, JAW_R, JAW_K = V((0, -0.06, JAW_Z)), V((0, -0.43, 1.21)), (0.075, 0.05), 0.65
CHIN_C, CHIN_R = V((0, -0.2, 1.19)), (0.068, 0.14, 0.05)
EYES = {s: V((sign * 0.088, -0.075, 1.385)) for s, sign in SIDES}
EYE_R, PUPIL_R = 0.044, 0.017
PUPIL_DIR = {s: V((sign * 0.55, -0.8, 0.25)).normalized() for s, sign in SIDES}
EARS = {s: [V((sign * 0.06, 0.04, 1.39)), V((sign * 0.1, 0.075, 1.6)), V((sign * 0.125, 0.1, 1.82))] for s, sign in SIDES}
EAR_RADII, EAR_FLAT = (0.04, 0.058, 0.012), 0.38


def _ear_normal(s, sign):
    a = (EARS[s][2] - EARS[s][0]).normalized()
    n = V((-sign * 0.15, -1, 0.1))
    return (n - a * n.dot(a)).normalized()


EAR_N = {s: _ear_normal(s, sign) for s, sign in SIDES}

FOOT_R = 0.05
HIP = {s: V((sign * 0.12, 0.04, 0.42)) for s, sign in SIDES}
KNEE = {s: V((sign * 0.13, -0.09, 0.25)) for s, sign in SIDES}
ANKLE = {s: V((sign * 0.13, 0.0, 0.07)) for s, sign in SIDES}
TOE = {s: V((sign * 0.13, -0.15, 0.04)) for s, sign in SIDES}
FOOT_C = {s: V((sign * 0.13, -0.05, 0.05)) for s, sign in SIDES}
FOOT_SIZE = (0.075, 0.115, 0.05)

ARM_TOP = {s: V((sign * 0.12, -0.04, 0.84)) for s, sign in SIDES}
SHOULDER = {s: V((sign * 0.17, -0.08, 0.82)) for s, sign in SIDES}
ELBOW = {s: V((sign * 0.23, -0.18, 0.64)) for s, sign in SIDES}
WRIST = {s: V((sign * 0.22, -0.33, 0.55)) for s, sign in SIDES}
ARM_RADII = (0.05, 0.048, 0.04, 0.034)
FINGERS = ((-0.7, 0.055), (0.0, 0.065), (0.7, 0.055))            # (fan angle, length)
FINGER_R = 0.017

TAIL_C = V((0, 0.8, 0.52))


def tail_points():
    pts = [V((0, 0.16, 0.48)), V((0, 0.34, 0.33)), V((0, 0.55, 0.245))]
    for k in range(13):
        th = math.radians(-100 + 30 * k)
        r = 0.3 - 0.22 * k / 12
        pts.append(TAIL_C + V((0, r * math.cos(th), r * math.sin(th))))
    return pts


TAIL = tail_points()
TAIL_LEN = sum((b - a).length for a, b in zip(TAIL, TAIL[1:]))
_cum = np.cumsum([0] + [(b - a).length for a, b in zip(TAIL, TAIL[1:])])
TAIL_R = [0.1 - 0.072 * float(c) / TAIL_LEN for c in _cum]
TAIL_JOINTS = (0, 2, 4, 6, 8, 10, 12, 14, 15)      # where the tail's eight bones start and end
TAIL_BONES = [f"tail_{i + 1}" for i in range(len(TAIL_JOINTS) - 1)]


# --- sculpture -----------------------------------------------------------------------
def flat_cone(P, a, b, r1, r2, k):
    """A round cone along a level axis at height a.z, squashed in z by k."""
    Q = P.copy()
    Q[..., 2] = a.z + (P[..., 2] - a.z) / k
    return K.round_cone(Q, a, b, r1, r2) * k


def torso_sdf(P):
    return K.smin(K.ellipsoid(P, BELLY_C, BELLY_R), K.ellipsoid(P, CHEST_C, CHEST_R), 0.12)


def neck_sdf(P):
    return K.tapered_tube(P, NECK, NECK_R)


def head_sdf(P):
    return K.ellipsoid(P, HEAD_C, HEAD_R)


def snout_sdf(P):
    d = flat_cone(P, SNOUT_A, SNOUT_B, *SNOUT_R, SNOUT_K)
    return K.smin(d, K.ellipsoid(P, NOSE_C, NOSE_R), 0.03)


def ear_sdf(P, s):
    a, n, k = np.asarray(EARS[s][0], np.float32), np.asarray(EAR_N[s], np.float32), EAR_FLAT
    off = (P - a) @ n
    Q = P + off[..., None] * n * (1 / k - 1)
    return K.tapered_tube(Q, EARS[s], EAR_RADII) * k


def leg_sdf(P, s):
    d = K.smin(K.round_cone(P, HIP[s], KNEE[s], 0.1, 0.08), K.round_cone(P, KNEE[s], ANKLE[s], 0.08, 0.066), 0.03)
    return K.smin(d, K.ellipsoid(P, FOOT_C[s], FOOT_SIZE), 0.04)


def tail_sdf(P):
    return K.tapered_tube(P, TAIL, TAIL_R)


def body_sdf(P):
    d = K.smin(torso_sdf(P), neck_sdf(P), 0.08)
    d = K.smin(d, head_sdf(P), 0.06)
    d = K.smin(d, snout_sdf(P), 0.05)
    for s, _ in SIDES:
        d = K.smin(d, ear_sdf(P, s), 0.03)
        d = K.smin(d, leg_sdf(P, s), 0.06)
    d = K.smin(d, tail_sdf(P), 0.05)
    return K.smax(d, -P[..., 2], 0.006)


def snout_radius(y):
    u = np.clip((y - SNOUT_A.y) / (SNOUT_B.y - SNOUT_A.y), 0, 1)
    return SNOUT_R[0] + (SNOUT_R[1] - SNOUT_R[0]) * u


def body_mats(centers):
    """Pale belly plates, rings round the tail, pink inner ears, and the mouth inside the snout."""
    x, y, z = centers[:, 0], centers[:, 1], centers[:, 2]
    regions = {"torso": torso_sdf(centers), "neck": neck_sdf(centers), "head": head_sdf(centers),
               "snout": snout_sdf(centers), "tail": tail_sdf(centers)}
    for s, _ in SIDES:
        regions[f"ear.{s}"] = ear_sdf(centers, s)
        regions[f"leg.{s}"] = leg_sdf(centers, s)
    names = list(regions)
    nearest = np.argmin(np.stack([regions[n] for n in names], axis=1), axis=1)
    near = {n: nearest == i for i, n in enumerate(names)}
    out = np.full(len(centers), SKIN_M, np.int32)
    # the belly: pale plates down the front, with dark seams between them
    front = (near["torso"] | near["neck"]) & (y < BELLY_C.y - 0.1 - 0.4 * np.maximum(0, z - 0.8)) & (np.abs(x) < 0.17) \
        & (z > 0.32) & (z < 1.0)
    seam = np.modf((z - 0.31) / 0.13)[0] < 0.11
    out[front] = BELLY_M
    out[front & seam] = STRIPE_M
    # the tail's rings
    _, along = C._polyline_closest(centers, TAIL)
    ring = (np.modf(along / 0.17)[0] < 0.17) & (along > 0.2)
    out[near["tail"] & ring] = STRIPE_M
    # the ears' insides
    for s, _ in SIDES:
        pts = EARS[s]
        _, u = C._polyline_closest(centers, pts)
        length = sum((b - a).length for a, b in zip(pts, pts[1:]))
        side = (centers - np.asarray(pts[0], np.float32)) @ np.asarray(EAR_N[s], np.float32)
        inner = near[f"ear.{s}"] & (side > 0.004) & (u > 0.06 * length) & (u < 0.9 * length)
        out[inner] = EAR_M
    # inside the mouth: under the upper snout
    out[near["snout"] & (y < -0.12) & (z < SNOUT_Z - 0.036) & (y > -0.5)] = MOUTH_M
    return out


def jaw_sdf(P):
    d = flat_cone(P, JAW_A, JAW_B, *JAW_R, JAW_K)
    return K.smin(d, K.ellipsoid(P, CHIN_C, CHIN_R), 0.04)


def jaw_mats(centers):
    return np.where((centers[:, 2] > JAW_Z + 0.022) & (centers[:, 1] < -0.08), MOUTH_M, SKIN_M)


def teeth():
    """Zig-zag teeth: (base, tip) pairs, the upper row pointing down, the lower row up, in between."""
    upper, lower = [], []
    for y in np.linspace(-0.15, -0.43, 6):
        r = float(snout_radius(y))
        for sign in (1, -1):
            x = sign * (r - 0.01)
            upper.append((V((x, y, SNOUT_Z - 0.03)), V((x, y, SNOUT_Z - 0.088))))
    for y in np.linspace(-0.12, -0.40, 6) - 0.028:
        u = (y - JAW_A.y) / (JAW_B.y - JAW_A.y)
        r = JAW_R[0] + (JAW_R[1] - JAW_R[0]) * u
        for sign in (1, -1):
            x = sign * (r - 0.012)
            lower.append((V((x, y, JAW_Z + 0.025)), V((x, y, JAW_Z + 0.078))))
    return upper, lower


def teeth_sdf(P, rows):
    d = None
    for a, b in rows:
        t = K.round_cone(P, a, b, 0.014, 0.004)
        d = t if d is None else np.minimum(d, t)
    return d


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


def arm_pts(s):
    return [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]]


def arm_sdf(P, s):
    return K.tapered_tube(P, arm_pts(s), ARM_RADII)


def arm_mats(s):
    a, b = np.asarray(SHOULDER[s], np.float32), np.asarray(ELBOW[s], np.float32)
    axis = (b - a) / np.linalg.norm(b - a)

    def mats(centers):
        u = (centers - a) @ axis
        band = (u > 0.04) & (u < 0.2) & (np.modf(u / 0.06)[0] < 0.3)
        return np.where(band, STRIPE_M, SKIN_M)
    return mats


def hand_sdf(P, s):
    d = None
    for tip in finger_tips(s):
        f = K.round_cone(P, WRIST[s], tip, FINGER_R * 1.15, FINGER_R * 0.75)
        d = f if d is None else np.minimum(d, f)
    return K.smin(d, F._sd_sphere(P, WRIST[s], 0.034), 0.02)


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.44, -0.6, -0.02), (0.44, 1.18, 1.9), VOXEL, mat=body_mats)
    parts.add("jaw", jaw_sdf, (-0.12, -0.52, 1.1), (0.12, 0.08, 1.3), DETAIL, mat=jaw_mats)
    upper, lower = teeth()
    lo, hi = K.bounds([p for pair in upper for p in pair], 0.03)
    parts.add("head", lambda P: teeth_sdf(P, upper), lo, hi, FINE, mat=TEETH_M)
    lo, hi = K.bounds([p for pair in lower for p in pair], 0.03)
    parts.add("jaw", lambda P: teeth_sdf(P, lower), lo, hi, FINE, mat=TEETH_M)
    for s, _ in SIDES:
        n = NOSTRILS[s]
        parts.add("head", lambda P, c=n: K.ellipsoid(P, c, (0.012, 0.011, 0.008)), n - V((0.03,) * 3), n + V((0.03,) * 3),
                  0.003, mat=PUPIL_M)
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: F._sd_sphere(P, c, EYE_R), e - V((0.06,) * 3), e + V((0.06,) * 3), FINE, mat=EYE_M)
        pupil = e + PUPIL_DIR[s] * 0.034
        parts.add(f"eye.{s}", lambda P, c=pupil: F._sd_sphere(P, c, PUPIL_R), pupil - V((0.03,) * 3), pupil + V((0.03,) * 3),
                  0.003, mat=PUPIL_M)
        lo, hi = K.bounds(arm_pts(s), 0.07)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=arm_mats(s))
        lo, hi = K.bounds([WRIST[s], *finger_tips(s)], 0.05)
        parts.add(f"hand.{s}", lambda P, s=s: hand_sdf(P, s), lo, hi, FINE)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "mecked"
    obj["skin_color"] = SKIN_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin ----------------------------------------------------------------------
def build_rig(coll):
    up, fwd, side = (0, 0, 1), (0, -1, 0), (1, 0, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("hips", PELVIS, V((0, 0.03, 0.72)), "root", True, fwd),
             ("chest", V((0, 0.03, 0.72)), CHEST_TOP, "hips", True, fwd),
             ("neck", CHEST_TOP, HEAD_BASE, "chest", True, fwd),
             ("head", HEAD_BASE, V((0, -0.5, 1.33)), "neck", True, up),
             ("jaw", JAW_HINGE, V((0, -0.43, 1.21)), "head", True, up)]
    for s, _ in SIDES:
        e = EYES[s]
        a, m, t = EARS[s]
        bones += [(f"eye.{s}", e, e + V((0, -0.06, 0)), "head", True, up),
                  (f"ear.{s}", a, m, "head", True, fwd),
                  (f"ear_tip.{s}", m, t, f"ear.{s}", True, fwd)]
    for s, _ in SIDES:
        a, _ = hand_frame(s)
        bones += [(f"thigh.{s}", HIP[s], KNEE[s], "hips", True, fwd),
                  (f"shin.{s}", KNEE[s], ANKLE[s], f"thigh.{s}", True, fwd),
                  (f"foot.{s}", ANKLE[s], TOE[s], f"shin.{s}", True, up),
                  (f"arm_upper.{s}", SHOULDER[s], ELBOW[s], "chest", True, fwd),
                  (f"arm_lower.{s}", ELBOW[s], WRIST[s], f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], WRIST[s] + a * 0.065, f"arm_lower.{s}", True, fwd)]
    for i, name in enumerate(TAIL_BONES):
        a, b = TAIL[TAIL_JOINTS[i]], TAIL[TAIL_JOINTS[i + 1]]
        bones.append((name, a, b, "hips" if i == 0 else TAIL_BONES[i - 1], True, side))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "mecked", "forward": "-Y", "attack_style": "bite_grab", "normal_speed": WALK_SPEED,
        "root_motion": False})


def chain(Q, pts, bones, blend=0.035, lead=None, lead_len=0.05):
    """Smooth per-bone weights along a joint polyline: bones[k] owns segment k; `lead`
    (the parent bone) owns its start."""
    _, along = C._polyline_closest(Q, pts)
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
    return w


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    tail = [TAIL[j] for j in TAIL_JOINTS]
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        part, s = (kind.split(".") + [""])[:2]
        if part == "arm":
            pts = arm_pts(s)
            Q = P[lo:hi]
            _, along = C._polyline_closest(Q, pts)
            joint = sum((b - a).length for a, b in zip(pts[:3], pts[1:3]))
            past = C.np_smoothstep(joint - 0.04, joint + 0.04, along)
            top = 1 - C.np_smoothstep(0.0, 0.05, along)
            WB = np.zeros((hi - lo, len(names)), np.float32)
            WB[:, names.index(f"arm_upper.{s}")] = (1 - past) * (1 - top)
            WB[:, names.index("chest")] = top
            WB[:, names.index(f"arm_lower.{s}")] = past
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 5)
            continue
        if kind != "body":
            W[lo:hi, names.index(kind)] = 1
            continue
        Q = P[lo:hi]
        dists, groups = [], []
        dists.append(torso_sdf(Q))
        groups.append(chain(Q, [PELVIS - V((0, 0, 0.2)), PELVIS, V((0, 0.03, 0.72)), CHEST_TOP], ["hips", "hips", "chest"],
                            blend=0.1))
        dists.append(neck_sdf(Q))
        groups.append(chain(Q, [V((0, 0.05, 0.8)), CHEST_TOP, HEAD_BASE, HEAD_C], ["chest", "neck", "head"], blend=0.06))
        dists.append(np.minimum(head_sdf(Q), snout_sdf(Q)))
        groups.append({"head": np.ones(len(Q))})
        for s, _ in SIDES:
            a, m, t = EARS[s]
            dists.append(ear_sdf(Q, s))
            groups.append(chain(Q, [a - V((0, 0, 0.06)), a, m, t], ["head", f"ear.{s}", f"ear_tip.{s}"], blend=0.04))
            dists.append(leg_sdf(Q, s))
            groups.append(chain(Q, [HIP[s] + V((0, 0, 0.08)), HIP[s], KNEE[s], ANKLE[s], TOE[s]],
                                ["hips", f"thigh.{s}", f"shin.{s}", f"foot.{s}"], blend=0.04))
        dists.append(tail_sdf(Q))
        groups.append(chain(Q, tail, TAIL_BONES, blend=0.05, lead="hips", lead_len=0.08))
        dm = np.stack(dists, axis=1)
        membership = np.exp(-(dm - dm.min(axis=1, keepdims=True)) / 0.012)
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
    for name, roughness in (("MeckedSkin", 0.7), ("MeckedBelly", 0.75), ("MeckedStripes", 0.7), ("MeckedEarInner", 0.6),
                            ("MeckedEyes_glow", 0.25), ("MeckedPupils", 0.2), ("MeckedTeeth", 0.35), ("MeckedMouth", 0.6)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion --------------------------------------------------------------------------
REST_HAND = {s: WRIST[s].copy() for s, _ in SIDES}                   # body (chest) space
REST_DIR = {s: hand_frame(s)[0] for s, _ in SIDES}
REST_ELBOW = {s: V((sign * 1.0, 0.35, -0.1)) for s, sign in SIDES}    # which way the elbows point


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "pivot": PELVIS,
         "chest": (0.0, 0.0, 0.0), "neck": (0.0, 0.0), "head": (0.0, 0.0, 0.0), "jaw": 0.0, "eyes": 1.0,
         "ears": {s: (0.0, 0.0, 0.0) for s, _ in SIDES},              # (back, out, tip flop)
         "feet": {s: ANKLE[s].copy() for s, _ in SIDES},              # world
         "local": 0.0,                                                # 1: the feet ride with the body
         "toes": {s: 0.0 for s, _ in SIDES},                          # toe down (radians)
         "hands": {s: REST_HAND[s].copy() for s, _ in SIDES},         # rest body space
         "dirs": {s: REST_DIR[s].copy() for s, _ in SIDES},
         "elbows": {s: REST_ELBOW[s].copy() for s, _ in SIDES},
         "tail": (0.0, 0.0, 0.0, 0.0)}                                # (curl, sway amp, phase, lift)
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
        R = (C.rot_z(p["yaw"]) @ C.rot_y(p["roll"]) @ C.rot_x(p["pitch"])).to_4x4()
        piv = p["pivot"]
        B = L @ Matrix.Translation(p["pos"]) @ Matrix.Translation(piv) @ R @ Matrix.Translation(-piv)
        bases["hips"] = skel.set("hips", poses, B @ skel.rest["hips"])
        cp, cy, cr = p["chest"]
        bases["chest"] = K.pose_local(skel, "chest", poses, Matrix.Rotation(cp, 4, "X") @ Matrix.Rotation(cy, 4, "Y")
                                      @ Matrix.Rotation(cr, 4, "Z"))
        npitch, nyaw = p["neck"]
        bases["neck"] = K.pose_local(skel, "neck", poses, Matrix.Rotation(npitch, 4, "X") @ Matrix.Rotation(nyaw, 4, "Y"))
        hp, hy, hr = p["head"]
        bases["head"] = K.pose_local(skel, "head", poses, Matrix.Rotation(hp, 4, "X") @ Matrix.Rotation(hy, 4, "Z")
                                     @ Matrix.Rotation(hr, 4, "Y"))
        bases["jaw"] = K.pose_local(skel, "jaw", poses, Matrix.Rotation(p["jaw"], 4, "X"))
        e = max(0.06, p["eyes"])
        for s, sign in SIDES:
            bases[f"eye.{s}"] = K.pose_local(skel, f"eye.{s}", poses, Matrix.Diagonal((1, 1, e, 1)))
            back, out, flop = p["ears"][s]
            bases[f"ear.{s}"] = K.pose_local(skel, f"ear.{s}", poses, Matrix.Rotation(back, 4, "X")
                                             @ Matrix.Rotation(-sign * out, 4, "Z"))
            bases[f"ear_tip.{s}"] = K.pose_local(skel, f"ear_tip.{s}", poses, Matrix.Rotation(flop, 4, "X"))
        d3 = B.to_3x3()
        for s, sign in SIDES:
            th, sh, ft = f"thigh.{s}", f"shin.{s}", f"foot.{s}"
            hip = skel.base(th, poses).translation
            target = (L @ p["feet"][s]).lerp(B @ ANKLE[s], p["local"])
            knee, ankle = C.two_bone_ik(hip, target, length[th], length[sh], d3 @ V((sign * 0.15, -1, 0.1)))
            bases[th] = skel.aim(th, poses, knee - hip)
            bases[sh] = skel.aim(sh, poses, ankle - knee)
            fwd = d3 @ V((0, -1, 0))
            if p["local"] < 0.5:
                fwd = V((fwd.x, fwd.y, 0)).normalized()
            toe = p["toes"][s] + D(11)
            bases[ft] = skel.aim(ft, poses, fwd * math.cos(toe) - (d3 @ V((0, 0, 1)) if p["local"] >= 0.5 else V((0, 0, 1)))
                                 * math.sin(toe))
        Cm = poses["chest"] @ skel.rest["chest"].inverted()
        c3 = Cm.to_3x3()
        for s, sign in SIDES:
            up, lo, hand = f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"
            shoulder = skel.base(up, poses).translation
            elbow, wrist = C.two_bone_ik(shoulder, Cm @ p["hands"][s], length[up], length[lo], c3 @ p["elbows"][s])
            bases[up] = skel.aim(up, poses, elbow - shoulder)
            bases[lo] = skel.aim(lo, poses, wrist - elbow)
            bases[hand] = skel.aim(hand, poses, c3 @ p["dirs"][s])
        curl, amp, phase, tail_lift = p["tail"]
        for i, name in enumerate(TAIL_BONES):
            sway = amp * math.sin(phase - 0.8 * i) * (0.4 + 0.12 * i)
            rot = Matrix.Rotation((tail_lift if i == 0 else 0) + curl * (i / len(TAIL_BONES)), 4, "Z") \
                @ Matrix.Rotation(sway, 4, "X")
            bases[name] = K.pose_local(skel, name, poses, rot)
        return bases
    return solve


def blink(t, at, length=0.2):
    u = (t - at) / length
    return 1 - 0.94 * math.sin(math.pi * u) ** 2 if 0 <= u <= 1 else 1.0


def walk(f):
    n = WALK_FRAMES
    T = n / FPS
    ph = (f / n) % 1
    w = TAU * ph
    duty = 0.6
    stride = WALK_SPEED * duty * T
    feet, toes = {}, {}
    for s, _ in SIDES:
        q = (ph + (0.5 if s == "R" else 0)) % 1
        y, z = C.foot_track(q, duty, stride, 0.075, WALK_SPEED, T, skew=0.9)
        feet[s] = ANKLE[s] + V((0, y, z))
        toes[s] = D(20) * math.sin(math.pi * (q - duty) / (1 - duty)) if q > duty else 0.0
    hands, dirs = {}, {}
    for s, sign in SIDES:
        swing = math.sin(w + (0 if s == "L" else math.pi) - 0.6)
        hands[s] = REST_HAND[s] + V((0, 0.035 * swing, 0.012 * abs(swing)))
        dirs[s] = (REST_DIR[s] + V((0, 0.3 * swing, 0))).normalized()
    ears = {s: (D(4) * math.sin(2 * w - 1.2), D(3) * math.sin(w + (0 if s == "L" else math.pi)), D(6) * math.sin(2 * w - 2.0))
            for s, _ in SIDES}
    return params(t=f / FPS, pos=V((0.012 * math.sin(w), 0, -0.012 + 0.014 * math.cos(2 * w))),
                  pitch=D(3) + D(1.5) * math.cos(2 * w), roll=D(4.5) * math.sin(w), yaw=D(3) * math.sin(w + 0.4),
                  chest=(0, D(-3) * math.sin(w), D(-1.5) * math.sin(w)), neck=(D(-2) - D(2.5) * math.cos(2 * w - 0.6), D(2) * math.sin(w)),
                  head=(D(2) * math.cos(2 * w - 1.1), D(-3) * math.sin(w - 0.5), D(-2.5) * math.sin(w)),
                  jaw=D(3) + D(3) * (0.5 + 0.5 * math.sin(2 * w)), eyes=blink(f, 14, 5), ears=ears,
                  feet=feet, toes=toes, hands=hands, dirs=dirs, tail=(0, D(5), w, 0))


def bite(f):
    k, t = C.keyframes, f / FPS
    hit = BITE_HIT / FPS
    shake = math.sin(TAU * 6 * (t - hit)) * math.exp(-6 * (t - hit)) if t > hit else 0.0
    rear = k((0, 0), (0.28, 1), (0.36, 0.4), (hit, 0))(t)
    lunge = k((0, 0), (0.28, 0), (hit, 1), (0.62, 0.75), (1.0, 0))(t)
    ears = {s: (D(-28) * rear + D(10) * lunge, D(8) * rear, D(-12) * rear + D(14) * lunge) for s, _ in SIDES}
    hands = {s: REST_HAND[s] + V((0, -0.08 * lunge - 0.03 * rear, 0.05 * rear + 0.04 * lunge)) for s, _ in SIDES}
    return params(t=t, pos=V((0, 0.04 * rear - 0.1 * lunge, -0.02 * rear)),
                  pitch=D(-3) * rear + D(10) * lunge, chest=(D(-5) * rear + D(6) * lunge, 0, 0),
                  neck=(D(-10) * rear + D(14) * lunge, D(4) * shake), head=(D(8) * rear + D(4) * lunge, D(10) * shake, D(6) * shake),
                  jaw=D(k((0, 3), (0.08, 6), (0.28, 52), (hit - 1 / FPS, 56), (hit, 0), (0.7, 6), (1.0, 3))(t)),
                  ears=ears, hands=hands, tail=(D(-10) * rear, D(4), TAU * 2 * t, D(-6) * rear + D(5) * lunge),
                  eyes=k((0, 1), (0.3, 1), (hit - 0.05, 0.4), (hit + 0.1, 0.4), (0.6, 1))(t))


def grab_keys():
    """Timed poses for the grab: (time, {name: value}); missing names take the rest pose."""
    hit, rel = GRAB_HIT / FPS, GRAB_RELEASE / FPS
    (b1, b2) = (b / FPS for b in GRAB_BITES)
    reach = {"hands": {s: V((sign * 0.34, -0.56, 0.86)) for s, sign in SIDES},
             "dirs": {s: V((-sign * 0.3, -1, 0.1)).normalized() for s, sign in SIDES},
             "elbows": {s: V((sign * 1, 0.2, -0.3)) for s, sign in SIDES},
             "pos": V((0, -0.08, -0.03)), "pitch": D(12), "chest": (D(6), 0, 0), "jaw": D(18),
             "neck": (D(-6), 0), "head": (D(6), 0, 0)}
    catch = {**reach, "hands": {s: V((sign * 0.2, -0.54, 0.82)) for s, sign in SIDES},
             "dirs": {s: V((-sign * 0.9, -0.5, 0)).normalized() for s, sign in SIDES}}
    hold = {**catch, "hands": {s: V((sign * 0.2, -0.47, 0.9)) for s, sign in SIDES},
            "pos": V((0, -0.04, 0.0)), "pitch": D(5), "chest": (D(-4), 0, 0), "jaw": D(6),
            "neck": (D(-10), 0), "head": (D(10), 0, 0)}
    rear = {**hold, "jaw": D(50), "neck": (D(-16), 0), "head": (D(14), 0, 0), "chest": (D(-6), 0, 0)}
    chomp = {**hold, "jaw": D(0), "neck": (D(18), 0), "head": (D(-6), 0, 0), "chest": (D(6), 0, 0), "pitch": D(9)}
    shove = {**catch, "hands": {s: V((sign * 0.22, -0.66, 0.84)) for s, sign in SIDES},
             "dirs": {s: V((0, -1, 0)) for s, _ in SIDES}, "pos": V((0, -0.1, -0.02)), "pitch": D(14), "jaw": D(10)}
    return [(0, {}), (0.38, reach), (hit - 0.04, reach), (hit, catch), (0.72, hold),
            (b1 - 0.16, rear), (b1, chomp), (b1 + 0.16, hold),
            (b2 - 0.16, rear), (b2, chomp), (b2 + 0.16, hold),
            (rel - 0.12, hold), (rel, shove), (rel + 0.1, shove), (GRAB_FRAMES / FPS, {})]


REST = None


def blend_pose(a, b, u):
    out = {}
    for key in set(a) | set(b):
        x, y = a.get(key, REST[key]), b.get(key, REST[key])
        if isinstance(x, dict):
            out[key] = {s: x[s].lerp(y[s], u) for s in x}
        elif isinstance(x, tuple):
            out[key] = tuple(p + (q - p) * u for p, q in zip(x, y))
        elif isinstance(x, Vector):
            out[key] = x.lerp(y, u)
        else:
            out[key] = x + (y - x) * u
    return out


def grab(f):
    t = f / FPS
    keys = grab_keys()
    pose = keys[-1][1]
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            pose = blend_pose(a, b, C.smoothstep(t0, t1, t))
            break
    pose = {k: v for k, v in pose.items()}
    held = C.smoothstep(GRAB_HIT / FPS, 0.7, t) * (1 - C.smoothstep(GRAB_RELEASE / FPS - 0.05, GRAB_RELEASE / FPS, t))
    wiggle = math.sin(TAU * 5 * t) * held
    pose["hands"] = {s: h + V((0, 0, 0.012 * wiggle)) for s, h in pose["hands"].items()}
    ears = {s: (D(-14) * held, D(10) * held, D(10) * held * math.sin(TAU * 3 * t)) for s, _ in SIDES}
    return params(t=t, ears=ears, tail=(D(-8) * held, D(6), TAU * 2 * t, D(-6) * held), **pose)


def death(f):
    k, t = C.keyframes, f / FPS
    fall = min(1.0, max(0.0, (t - 0.3) / 0.55)) ** 2
    landed = C.smoothstep(0.82, 0.9, t)
    since = max(0.0, t - 0.85)
    bounce = 0.04 * math.exp(-since * 9) * abs(math.sin(TAU * 1.6 * since)) if t > 0.85 else 0.0
    reel = k((0, 0), (0.22, 1), (0.4, 0.6), (0.9, 0))(t)
    limp = C.smoothstep(0.5, 1.1, t)
    ears = {s: (D(-20) * reel + D(30) * limp, D(14) * reel + D(20 if s == "L" else -6) * limp, D(30) * limp)
            for s, _ in SIDES}
    hands = {s: REST_HAND[s].lerp(V((sign * 0.36, -0.28, 0.66)), reel).lerp(V((sign * 0.3, -0.36, 0.52)), limp)
             for s, sign in SIDES}
    return params(t=t, pivot=V((0.28, 0.0, 0.0)), pos=V((0, 0.04 * reel, bounce)),
                  pitch=D(-8) * reel, roll=D(86) * fall + D(-3) * reel, local=C.smoothstep(0.25, 0.6, t),
                  chest=(D(-6) * reel, 0, D(-8) * limp), neck=(D(-20) * reel + D(14) * limp, D(-10) * limp),
                  head=(D(16) * reel - D(10) * limp, D(-6) * limp, D(-14) * limp),
                  jaw=D(k((0, 3), (0.2, 40), (0.6, 30), (1.2, 22))(t)), ears=ears, hands=hands,
                  toes={s: D(25) * limp for s, _ in SIDES},
                  tail=(D(-30) * limp, D(10) * (1 - landed), TAU * 3 * t, D(-10) * reel),
                  eyes=k((0, 1), (0.15, 1.15), (0.9, 1), (1.2, 1), (1.5, 0.06))(t))


def bone_point(rig, action, frame, bone, at="head"):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ (pb.head if at == "head" else pb.tail)


def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def grip_point(rig, frame):
    """Where the caught body is held: between the wrists, a little ahead of them."""
    a, b = (bone_point(rig, "MeckedGrab", frame, f"hand.{s}") for s, _ in SIDES)
    return (a + b) / 2 + V((0, -0.03, 0))


def animate(rig, obj):
    global REST
    REST = params()
    rig.animation_data_create()
    K.ground_clip(rig, obj, "MeckedWalk", solver(rig, walk), WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    b = K.ground_clip(rig, obj, "MeckedBite", solver(rig, bite), BITE_FRAMES,
                      extras={"attack_style": "bite", "hit_frame": BITE_HIT, "hit_time": BITE_HIT / FPS})
    b.pose_markers.new("Bite").frame = BITE_HIT
    g = K.ground_clip(rig, obj, "MeckedGrab", solver(rig, grab), GRAB_FRAMES,
                      extras={"attack_style": "grab", "hit_frame": GRAB_HIT, "hit_time": GRAB_HIT / FPS,
                              "bite_frames": list(GRAB_BITES), "release_frame": GRAB_RELEASE})
    g.pose_markers.new("Catch").frame = GRAB_HIT
    for i, f in enumerate(GRAB_BITES):
        g.pose_markers.new(f"Bite{i + 1}").frame = f
    g.pose_markers.new("Release").frame = GRAB_RELEASE
    K.ground_clip(rig, obj, "MeckedDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.6}, settle_from=round(1.2 * FPS))
    K.register(rig, CLIPS)
    g["grip"] = [game(grip_point(rig, f)) for f in range(GRAB_HIT, GRAB_RELEASE + 1, 2)]
    snout = bone_point(rig, "MeckedBite", BITE_HIT, "head", at="tail")
    return {"grip": [list(v) for v in g["grip"]], "bite": game(snout)}


# --- previews ------------------------------------------------------------------------
def preview(scene, rig, path):
    shots = [("MeckedWalk", 0, (3.4, -5.6, 2.6)), ("MeckedWalk", 6, (-5.6, -1.2, 2.2)),
             ("MeckedBite", 9, (4.8, -3.0, 2.0)), ("MeckedGrab", 36, (3.0, -5.2, 2.4)),
             ("MeckedGrab", GRAB_BITES[1], (5.4, -1.6, 2.0)), ("MeckedDeath", DEATH_FRAMES, (3.0, -4.6, 3.8))]
    K.contact_sheet(scene, rig, shots, path, (0, 0.2, 0.85), size=360, cols=3)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    obj.data.validate()
    K.decimate(obj)
    obj.data.validate()
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("MeckedDeath",))
    report.update(points)
    K.setup_stage(scene, "Mecked", STAGE, (0, 0.2, 0.85), 2.9)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Mecked", NAME, (0, 0.2, 0.85), 3.4)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Mecked:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "mecked.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "mecked.blend"),
         preview_path=args[2] if len(args) > 2 else None)
