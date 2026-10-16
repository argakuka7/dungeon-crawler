"""
Octonaut: a pale blue clay creature from the whiteboard sketch.

A tall block of a body whose top is cut into a V (two pointed corners),
two thick arms with round mitten hands, SIX wavy tentacle legs underneath,
and a floating face above the body: two shining purple eyes with dark pupils
and a squiggle of hair. Faces -Y in Blender, +Z up; one unit = one game
cell, about 1.65 cells tall including its hair.

The body / arms / legs are one OpenVDB SDF; eyes, pupils and hair are
separate rigid parts on the floating face bone. Rig: root, body, face,
eye.L/R (scale = glow fade), arm_upper / arm_lower / hand per side, and
leg{1..6}_upper / _lower (leg 1 = front left, counting around the body).

Clips, 30 fps, in place (the game supplies root motion):
    OctoWalk    30-frame loop, alternating tripod gait at 0.5 cells/s.
    OctoSlap    1.1 s: raise both arms up and back, swing them forward and
                together, slapping in front of it at frame 13, recover.
    OctoSpin    1.4 s: crouch, stretch one back leg out and spin a full turn
                on the other five; the leg sweeps through the front at the
                hit frame (extras.hit_frame), land, recover.
    OctoDeath   2.2 s: stagger, topple onto its back, curl the legs, the
                face sinks and the eyes fade. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, octonaut; importlib.reload(creature); importlib.reload(octonaut)
    octonaut.main(export_path="<repo>/assets/octonaut.glb", blend_path="<repo>/blender/octonaut.blend")

Headless:
    Blender -b --python blender/octonaut.py -- assets/octonaut.glb blender/octonaut.blend
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

NAME, RIG_NAME = "Octonaut", "OctonautRig"
SCENE, COLLECTION, STAGE = "Octonaut", "OctonautAsset", "OctonautStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
BODY_HEX = "#9fd1f2"
HAIR_HEX = "#3d6487"
CLIPS = ("OctoWalk", "OctoSlap", "OctoSpin", "OctoDeath")
SIDES = (("L", 1), ("R", -1))

BODY_C, BODY_HALF, BODY_ROUND = Vector((0, 0, 0.80)), (0.25, 0.18, 0.37), 0.08
TOP = BODY_C.z + BODY_HALF[2]
NOTCH, NOTCH_HALF = 0.17, 0.215
HIP_Z = 0.47
BODY_PIVOT = Vector((0, 0, HIP_Z))
ARM_R = 0.06
LEG_R, FOOT_R = 0.047, 0.04
LEG_ANGLES = (30, 90, 150, 210, 270, 330)     # around the body, 0 = straight ahead
FACE_ROOT = Vector((0, 0, 1.05))
EYE_R = 0.064
EYES = {s: Vector((sign * 0.112, -0.045, 1.39)) for s, sign in SIDES}
FACE_C = Vector((0, -0.045, 1.39))
VOXEL, DETAIL = 0.013, 0.007
WALK_FRAMES, WALK_SPEED = 30, 0.5
SLAP_FRAMES, SLAP_HIT = 33, 13
SPIN_FRAMES = 42
DEATH_FRAMES = 66
KICK_LEG = 2                                 # back left: sweeps the front mid-spin
SPIN_START, SPIN_END = 0.22, 0.95


def arm_points(sign):
    return (Vector((sign * 0.12, 0, 0.98)), Vector((sign * 0.26, 0, 0.98)),
            Vector((sign * 0.52, -0.04, 0.86)), Vector((sign * 0.72, -0.06, 0.71)))


def hand_dir(sign):
    _, _, e, w = arm_points(sign)
    return (w - e).normalized()


def out(i):
    a = D(LEG_ANGLES[i])
    return Vector((math.sin(a), -math.cos(a), 0))


def leg_points(i):
    o = out(i)
    hip = Vector((0.16 * o.x, 0.10 * o.y, HIP_Z))
    knee = Vector((0.21 * o.x, 0.14 * o.y, 0.27))
    foot = Vector((0.30 * o.x, 0.22 * o.y, FOOT_R))
    return hip, knee, foot


def leg_path(i):
    """Wavy rest centre line (hip..knee..foot) and the arc length at the knee."""
    hip, knee, foot = leg_points(i)
    side = Vector((0, 0, 1)).cross(out(i)).normalized()
    pts = []
    for k in range(13):
        u = k / 12
        p = hip.lerp(knee, u / 0.4) if u <= 0.4 else knee.lerp(foot, (u - 0.4) / 0.6)
        wave = 0.022 * math.sin(TAU * 1.5 * u + i) * C.smoothstep(0, 0.15, u) * (1 - C.smoothstep(0.85, 1, u))
        pts.append(p + side * wave)
    knee_s = sum((b - a).length for a, b in zip(pts[:5], pts[1:5]))
    return pts, knee_s


def leg_name(i, part):
    return f"leg{i + 1}_{part}"


# --- sculpture ---------------------------------------------------------------
def box_sdf(P):
    d = F._sd_round_box(P, BODY_C, BODY_HALF, BODY_ROUND)
    k = NOTCH / NOTCH_HALF
    notch = (P[..., 2] - (TOP - NOTCH) - k * np.abs(P[..., 0])) / math.sqrt(1 + k * k)
    return K.smax(d, notch, 0.025)


def hand_sdf(P, sign):
    _, _, e, w = arm_points(sign)
    f = hand_dir(sign)
    up = Vector((0, 0, 1))
    side = f.cross(up).normalized()
    up = side.cross(f).normalized()
    palm = w + f * 0.05
    d = K.ellipsoid(K.local(P, palm, (side, f, up)), (0, 0, 0), (0.062, 0.068, 0.072))
    for a in (-38, 0, 38):                    # three fat fingers fanning out
        tip = palm + (f * math.cos(D(a)) + up * math.sin(D(a))) * 0.115
        d = K.smin(d, K.round_cone(P, palm, tip, 0.03, 0.024), 0.015)
    thumb = palm + (f * 0.4 + Vector((0, -1, 0)) + up * 0.2).normalized() * 0.09
    return K.smin(d, K.round_cone(P, palm, thumb, 0.028, 0.023), 0.015)


def arm_sdf(P, sign):
    return K.smin(K.polyline(P, arm_points(sign), ARM_R), hand_sdf(P, sign), 0.025)


def leg_sdf(P, i):
    pts, _ = leg_path(i)
    radii = [LEG_R + (FOOT_R - LEG_R) * k / (len(pts) - 1) for k in range(len(pts))]
    d = K.tapered_tube(P, pts, radii)
    return K.smin(d, K.ellipsoid(P, pts[-1] + Vector((0, 0, 0.002)) + out(i) * 0.012, (0.056, 0.056, 0.045)), 0.02)


def body_sdf(P):
    d = box_sdf(P)
    arms = np.minimum(*(arm_sdf(P, sign) for _, sign in SIDES))
    d = K.smin(d, arms, 0.04)
    legs = None
    for i in range(6):
        t = leg_sdf(P, i)
        legs = t if legs is None else np.minimum(legs, t)
    d = K.smin(d, legs, 0.05)
    return K.smax(d, -P[..., 2], 0.008)


def hair_points():
    return [Vector((x, -0.03 + 0.012 * math.cos(9 * x), 1.535 + 0.035 * math.sin(TAU * 2.2 * x / 0.44 + 0.6)
                    + 0.03 * (1 - (x / 0.22) ** 2)))
            for x in np.linspace(-0.22, 0.22, 33)]


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.95, -0.45, -0.02), (0.95, 0.45, 1.24), VOXEL)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: F._sd_sphere(P, c, EYE_R), e - Vector((0.09,) * 3),
                  e + Vector((0.09,) * 3), DETAIL, mat=1)
        pupil = e + Vector((sign * -0.008, -0.052, 0.004))
        parts.add(f"eye.{s}", lambda P, c=pupil: K.ellipsoid(P, c, (0.026, 0.017, 0.03)),
                  pupil - Vector((0.05,) * 3), pupil + Vector((0.05,) * 3), 0.005, mat=2)
    hair = hair_points()
    lo, hi = K.bounds(hair, 0.05)
    parts.add("face", lambda P: K.polyline(P, hair, 0.016), lo, hi, DETAIL, mat=3)
    obj = parts.mesh(NAME, coll, (("OctonautBody", BODY_HEX, 0), ("OctonautEyes_glow", K.EYE_HEX, K.EYE_STRENGTH),
                                  ("OctonautPupils", K.PUPIL_HEX, 0), ("OctonautHair", HAIR_HEX, 0)))
    obj["enemy"] = "octonaut"
    obj["body_color"] = BODY_HEX
    obj["eye_color"] = K.EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", BODY_PIVOT, (0, 0, TOP - NOTCH), "root", True, fwd),
             ("face", FACE_ROOT, FACE_C, "body", True, fwd)]
    for s, sign in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + Vector((0, -0.07, 0)), "face", True, up))
        _, shoulder, elbow, wrist = arm_points(sign)
        bones += [(f"arm_upper.{s}", shoulder, elbow, "body", True, up),
                  (f"arm_lower.{s}", elbow, wrist, f"arm_upper.{s}", True, up),
                  (f"hand.{s}", wrist, wrist + hand_dir(sign) * 0.16, f"arm_lower.{s}", True, up)]
    for i in range(6):
        hip, knee, foot = leg_points(i)
        bones += [(leg_name(i, "upper"), hip, knee, "body", True, out(i)),
                  (leg_name(i, "lower"), knee, foot, leg_name(i, "upper"), True, out(i))]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "octonaut", "forward": "-Y", "attack_style": "slap+spin_kick", "normal_speed": WALK_SPEED,
        "eye_light": K.EYE_HEX, "eye_intensity": K.EYE_STRENGTH, "root_motion": False})


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
        dists, parts = [box_sdf(Q)], [{"body": np.ones(len(Q))}]
        for s, sign in SIDES:
            root, shoulder, elbow, wrist = arm_points(sign)
            line = [root, shoulder, elbow, wrist, wrist + hand_dir(sign) * 0.17]
            d, along = C._polyline_closest(Q, line)
            l0 = (shoulder - root).length
            l1 = l0 + (elbow - shoulder).length
            l2 = l1 + (wrist - elbow).length
            body = 1 - C.np_smoothstep(l0 - 0.03, l0 + 0.06, along)
            lower = C.np_smoothstep(l1 - 0.05, l1 + 0.05, along)
            hand = C.np_smoothstep(l2 - 0.01, l2 + 0.04, along)
            dists.append(np.minimum(d - ARM_R, hand_sdf(Q, sign)))
            parts.append({"body": body, f"arm_upper.{s}": np.clip(1 - body - lower, 0, 1),
                          f"arm_lower.{s}": lower * (1 - hand), f"hand.{s}": hand})
        for i in range(6):
            pts, knee_s = leg_path(i)
            d, along = C._polyline_closest(Q, pts)
            body = 1 - C.np_smoothstep(0.0, 0.07, along)
            lower = C.np_smoothstep(knee_s - 0.05, knee_s + 0.05, along)
            dists.append(d - LEG_R)
            parts.append({"body": body, leg_name(i, "upper"): np.clip(1 - body - lower, 0, 1),
                          leg_name(i, "lower"): lower})
        dm = np.stack(dists, axis=1)
        membership = np.exp(-(dm - dm.min(axis=1, keepdims=True)) / 0.008)
        membership /= membership.sum(axis=1, keepdims=True)
        WB = np.zeros((len(Q), len(names)), np.float32)
        for k, values in enumerate(parts):
            for name, value in values.items():
                WB[:, names.index(name)] += membership[:, k] * value
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, 8)
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
REST_FEET = [leg_points(i)[2] for i in range(6)]
REST_HANDS = {s: arm_points(sign)[3] for s, sign in SIDES}


def params(**kw):
    p = {"pos": Vector(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0,
         "feet": [f.copy() for f in REST_FEET],        # world targets
         "local": [0.0] * 6,                            # 1 = feet ride with the body
         "local_feet": [f.copy() for f in REST_FEET],   # body-space targets for local feet
         "stretch": [1.0] * 6,
         "hands": {s: h.copy() for s, h in REST_HANDS.items()},   # body space
         "elbow": {s: Vector((sign * 0.5, 0.5, -0.7)) for s, sign in SIDES},
         "face_tilt": (0.0, 0.0), "face_yaw": 0.0, "face_drop": 0.0, "eyes": 1.0}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)
    upper_len = {n: (skel.rest[n].inverted() @ skel.rest[c]).translation.length
                 for n, c in [(f"arm_upper.{s}", f"arm_lower.{s}") for s, _ in SIDES]
                 + [(f"arm_lower.{s}", f"hand.{s}") for s, _ in SIDES]
                 + [(leg_name(i, "upper"), leg_name(i, "lower")) for i in range(6)]}
    lower_leg = [(leg_points(i)[2] - leg_points(i)[1]).length for i in range(6)]

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        body = L @ Matrix.Translation(BODY_PIVOT + p["pos"]) @ (R @ skel.rest_rot["body"]).to_4x4()
        bases["body"] = skel.set("body", poses, body)
        delta = body @ skel.rest["body"].inverted()      # rest body space -> posed armature space
        d3 = delta.to_3x3()
        # floating face: lags / tilts relative to the body, sinks when dying
        base = skel.base("face", poses)
        tilt = C.rot_z(p["face_yaw"]) @ C.rot_x(p["face_tilt"][0]) @ C.rot_y(p["face_tilt"][1])
        face = Matrix.Translation(base.translation + d3 @ Vector((0, 0, -p["face_drop"]))) @ (
            d3 @ tilt @ skel.rest_rot["face"]).to_4x4()
        bases["face"] = skel.set("face", poses, face)
        for s, _ in SIDES:
            base = skel.base(f"eye.{s}", poses)
            e = max(0.05, p["eyes"])
            bases[f"eye.{s}"] = skel.set(f"eye.{s}", poses, base @ Matrix.Diagonal((e, e, e, 1)))
            up, lo = f"arm_upper.{s}", f"arm_lower.{s}"
            shoulder = skel.base(up, poses).translation
            target = delta @ p["hands"][s]
            elbow, wrist = C.two_bone_ik(shoulder, target, upper_len[up], upper_len[lo], d3 @ p["elbow"][s])
            bases[up] = skel.aim(up, poses, elbow - shoulder)
            bases[lo] = skel.aim(lo, poses, wrist - elbow)
            bases[f"hand.{s}"] = skel.aim(f"hand.{s}", poses, wrist - elbow)
        for i in range(6):
            up, lo = leg_name(i, "upper"), leg_name(i, "lower")
            hip = skel.base(up, poses).translation
            target = (L @ p["feet"][i]).lerp(delta @ p["local_feet"][i], p["local"][i])
            stretch = p["stretch"][i]
            pole = d3 @ (out(i) * 0.7 + Vector((0, 0, 1)))
            knee, foot = C.two_bone_ik(hip, target, upper_len[up], lower_leg[i] * stretch, pole)
            bases[up] = skel.aim(up, poses, knee - hip)
            base = skel.base(lo, poses)
            y = base.col[1].xyz.normalized()
            rot = y.rotation_difference((foot - knee).normalized()).to_matrix() @ base.to_3x3()
            desired = Matrix.Translation(base.translation) @ rot.to_4x4() @ Matrix.Diagonal((1, stretch, 1, 1))
            poses[lo] = desired
            bases[lo] = base.inverted() @ desired
        return bases
    return solve


def walk(f):
    n, T = WALK_FRAMES, WALK_FRAMES / FPS
    ph = (f / n) % 1
    w = TAU * ph
    duty = 0.56
    stride = WALK_SPEED * duty * T
    feet = []
    for i in range(6):
        y, z = C.foot_track((ph + 0.5 * (i % 2)) % 1, duty, stride, 0.075, WALK_SPEED, T, skew=0.9)
        feet.append(REST_FEET[i] + Vector((0, y, z)))
    hands = {s: REST_HANDS[s] + Vector((0, 0.07 * sign * math.sin(w), 0.03 * math.cos(2 * w - 0.5)))
             for s, sign in SIDES}
    return params(pos=Vector((0.006 * math.sin(w), 0, -0.008 + 0.014 * math.cos(2 * w))),
                  pitch=D(2), roll=D(2.5) * math.sin(w), yaw=D(3) * math.sin(w + 0.3), feet=feet, hands=hands,
                  face_tilt=(D(4) * math.sin(2 * w - 0.9), D(4) * math.sin(w - 0.7)),
                  face_drop=-0.012 * math.cos(2 * w - 1.1))


def slap(f):
    k, t = C.keyframes, f / FPS
    hit = SLAP_HIT / FPS
    hands, elbow = {}, {}
    for s, sign in SIDES:
        rest = REST_HANDS[s]
        hands[s] = k((0, rest), (0.30, Vector((sign * 0.60, 0.22, 1.30))), (hit, Vector((sign * 0.15, -0.74, 0.98))),
                     (0.62, Vector((sign * 0.19, -0.68, 0.86))), (1.1, rest))(t)
        elbow[s] = k((0, Vector((sign * 0.5, 0.5, -0.7))), (0.3, Vector((sign * 0.8, 0.3, -0.5))),
                     (hit, Vector((sign * 1.0, 0.1, -0.2))), (0.62, Vector((sign * 1.0, 0.2, -0.4))),
                     (1.1, Vector((sign * 0.5, 0.5, -0.7))))(t)
    shake = D(3) * math.sin(TAU * 9 * (t - hit)) * math.exp(-9 * (t - hit)) if t > hit else 0
    return params(pos=Vector((0, k((0, 0), (0.3, 0.04), (hit, -0.09), (0.62, -0.08), (1.1, 0))(t),
                                k((0, 0), (0.3, -0.03), (hit, -0.01), (1.1, 0))(t))),
                  pitch=D(k((0, 0), (0.3, -9), (hit, 13), (0.62, 10), (1.1, 0))(t)) + shake, hands=hands, elbow=elbow,
                  face_tilt=(D(k((0, 0), (0.36, -10), (hit + 0.08, 14), (0.8, -3), (1.1, 0))(t)), 0))


def spin_angle(t):
    u = min(1.0, max(0.0, (t - SPIN_START) / (SPIN_END - SPIN_START)))
    return TAU * u * u * u * (u * (6 * u - 15) + 10)


def kick_heading(f):
    """Heading of the kicking leg (0 = straight ahead) at a spin frame."""
    return (D(LEG_ANGLES[KICK_LEG]) + spin_angle(f / FPS)) % TAU


SPIN_HIT = min(range(SPIN_FRAMES), key=lambda f: min(kick_heading(f), TAU - kick_heading(f))
               if f / FPS < SPIN_END else 9)


def spin(f):
    k, t = C.keyframes, f / FPS
    beta = spin_angle(t)
    extend = k((0, 0), (0.18, 0.3), (0.42, 1), (0.82, 1), (1.12, 0))(t)
    o = out(KICK_LEG)
    hip = leg_points(KICK_LEG)[0]
    kick = REST_FEET[KICK_LEG].lerp(hip + o * 0.66 + Vector((0, 0, -0.06)), extend)
    local_feet = [f.copy() for f in REST_FEET]
    local_feet[KICK_LEG] = kick
    stretch = [1.0] * 6
    stretch[KICK_LEG] = 1 + 0.75 * extend
    spinning = C.smoothstep(SPIN_START - 0.1, SPIN_START + 0.05, t) * (1 - C.smoothstep(SPIN_END, SPIN_END + 0.12, t))
    hands = {s: REST_HANDS[s].lerp(Vector((sign * 0.80, -0.02, 1.0)), spinning) for s, sign in SIDES}
    velocity = (spin_angle(t + 0.5 / FPS) - spin_angle(t - 0.5 / FPS)) * FPS
    return params(pos=Vector((0, 0, k((0, 0), (0.2, -0.06), (0.35, 0.03), (0.85, 0.03), (1.02, -0.05), (1.4, 0))(t))),
                  yaw=beta, pitch=D(-5) * extend, roll=D(6) * extend, local=[spinning] * 6,
                  local_feet=local_feet, stretch=stretch, hands=hands,
                  face_yaw=-0.045 * velocity, face_tilt=(D(-6) * spinning, 0))


def death(f):
    k, t = C.keyframes, f / FPS
    fall = k((0, 0), (0.3, 0.08), (0.95, 1), (1.1, 0.96), (1.3, 1))(t)
    pitch = D(-12) * C.smoothstep(0, 0.3, t) * (1 - fall) - D(90) * fall
    curl = C.smoothstep(0.5, 1.4, t)
    twitch = C.smoothstep(0.9, 1.1, t) * (1 - C.smoothstep(1.3, 1.6, t))
    local_feet = []
    for i in range(6):
        hip, knee, foot = leg_points(i)
        target = foot.lerp(hip + (foot - hip) * 0.9 + Vector((0, 0, 0.05)) + out(i) * 0.16, curl)
        local_feet.append(target + Vector((0, 0, 0.04 * math.sin(30 * t + i * 1.9) * twitch)))
    hands = {s: k((0, REST_HANDS[s]), (0.3, Vector((sign * 0.66, -0.25, 1.15))),
                  (1.0, Vector((sign * 0.78, 0.12, 0.90))), (1.5, Vector((sign * 0.80, 0.18, 0.86))))(t)
             for s, sign in SIDES}
    return params(pos=Vector((0, 0.06 * fall, -0.27 * fall)), pitch=pitch, roll=D(6) * fall,
                  local=[C.smoothstep(0.25, 0.7, t)] * 6, local_feet=local_feet, hands=hands,
                  face_tilt=(D(k((0, 0), (0.3, 12), (0.95, -18), (1.3, -22))(t)), D(10) * fall),
                  face_drop=k((0, 0), (0.6, 0.02), (1.2, 0.08))(t),
                  eyes=k((0, 1), (0.5, 1), (1.4, 0.08))(t))


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "OctoWalk", solver(rig, walk), WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    act = K.ground_clip(rig, obj, "OctoSlap", solver(rig, slap), SLAP_FRAMES,
                        extras={"attack_style": "slap", "hit_frame": SLAP_HIT, "hit_time": SLAP_HIT / FPS})
    act.pose_markers.new("Slap").frame = SLAP_HIT
    act = K.ground_clip(rig, obj, "OctoSpin", solver(rig, spin), SPIN_FRAMES,
                        extras={"attack_style": "spin_kick", "hit_frame": SPIN_HIT, "hit_time": SPIN_HIT / FPS})
    act.pose_markers.new("Kick").frame = SPIN_HIT
    K.ground_clip(rig, obj, "OctoDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.6}, settle_from=round(1.3 * FPS))
    K.register(rig, CLIPS)


def main(export_path=None, blend_path=None):
    scene, rig, obj = build()
    K.decimate(obj)
    animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("OctoDeath",))
    report["spin_hit"] = SPIN_HIT
    K.setup_stage(scene, "Octonaut", STAGE, (0, 0, 0.75), 2.6)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Octonaut", NAME, (0, 0, 0.75), 4)
    print("Octonaut:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "octonaut.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "octonaut.blend"))
