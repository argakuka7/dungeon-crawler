"""
Shraps: a crab-armed clay creature with a block of ice for a head, from the
whiteboard sketch.

A small light blue body stands on two bent, frog-like legs (thighs out to the
sides, knees high) whose wavy shins end in flat feet pointing outwards. Two
crab arms curve out of the shoulders and end in big pincers: a chunky palm
with a fixed upper finger and a movable lower one. The head is a chipped,
glassy block of ice with crystal spikes on top and two glowing eyes. Faces -Y
in Blender, +Z up; one unit = one game cell, about 1.55 cells tall.

The same model also carries the Fire shraps' head: a glowing core with
flickering flame tongues (flame{i}_a / _b bones) in place of the ice block.
Both heads, and both charge balls in the throwing claw, ship in the one mesh
with their own materials; the game hides one set per kind (`hide` in
src/core/enemies.js). The ice ball the game throws is a separate, unskinned
mesh in the same file (ShrapsIceBall); the Fire shraps throws the Fire-face's
fireball.

Rig: root, body, head (eye.L/R: scale = glow fade, flame tongues), per side
arm_upper / arm_lower / claw / pincer (the movable finger) and thigh / shin /
foot, plus `charge` (the ball growing in the right claw).

Clips, 30 fps, in place (the game supplies root motion):
    ShrapsWalk   32-frame loop: a bow-legged waddle at 0.5 cells/s, the claws
                 swinging and clicking.
    ShrapsPinch  1.0 s: raise both claws and open them wide, lunge and snap
                 them shut in front of it at frame 13 (extras.hit_frame).
    ShrapsThrow  1.3 s: an ice ball grows in the right claw as it cocks it back
                 over its head, then whips it forward and lets go at frame 21
                 from extras.muzzle (game x, up, forward).
    ShrapsDeath  2.0 s: staggers, topples onto its back, legs and claws curl
                 up, the head lolls and the eyes fade. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, shraps; importlib.reload(creature); importlib.reload(shraps)
    shraps.main(export_path="<repo>/assets/shraps.glb", blend_path="<repo>/blender/shraps.blend")

Headless:
    Blender -b --python blender/shraps.py -- assets/shraps.glb blender/shraps.blend \
        blender/previews/shraps-preview.png      # also writes shraps-fire-preview.png
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

NAME, RIG_NAME, BALL = "Shraps", "ShrapsRig", "ShrapsIceBall"
SCENE, COLLECTION, STAGE = "Shraps", "ShrapsAsset", "ShrapsStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("ShrapsWalk", "ShrapsPinch", "ShrapsThrow", "ShrapsDeath")

SHELL_HEX, CLAW_HEX = "#8ccbee", "#4a98d2"
ICE_HEX, SPIKE_HEX = "#9fd6f2", "#eaf8ff"
EYE_HEX, PUPIL_HEX = "#7fe6ff", "#0b1d38"
CORE_HEX, FLAME_HEX, TIP_HEX = "#ff7a1a", "#ff4a17", "#d61d10"
ICEBALL_HEX, FIREBALL_HEX = "#bfe9ff", "#ff9a2a"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("ShrapsShell", SHELL_HEX, 0), ("ShrapsClaw", CLAW_HEX, 0),
             ("ShrapsIce", ICE_HEX, 0), ("ShrapsIceSpikes", SPIKE_HEX, 0),
             ("ShrapsEyes_glow", EYE_HEX, 2.2), ("ShrapsPupils", PUPIL_HEX, 0),
             ("ShrapsFireCore_glow", CORE_HEX, 1.3), ("ShrapsFlame_glow", FLAME_HEX, 2.2),
             ("ShrapsFlameTips_glow", TIP_HEX, 1.8),
             ("ShrapsIceBall_glow", ICEBALL_HEX, 0.6), ("ShrapsFireBall_glow", FIREBALL_HEX, 1.6))
SHELL, CLAW, ICE, SPIKE_M, EYES_M, PUPILS, CORE, FLAME, TIPS, ICEBALL, FIREBALL = range(len(MATERIALS))
# which materials each variant shows (the game hides the other set)
ICE_ONLY = ("ShrapsIce", "ShrapsIceSpikes", "ShrapsIceBall_glow")
FIRE_ONLY = ("ShrapsFireCore_glow", "ShrapsFlame_glow", "ShrapsFlameTips_glow", "ShrapsFireBall_glow")

VOXEL, DETAIL = 0.0135, 0.0065
WALK_FRAMES, WALK_SPEED = 32, 0.5
PINCH_FRAMES, PINCH_HIT = 30, 13
THROW_FRAMES, THROW_HIT = 39, 21
DEATH_FRAMES = 60
LOOP_T = WALK_FRAMES / FPS

# --- body plan -----------------------------------------------------------------
PELVIS = V((0, 0.01, 0.62))
TORSO_C, TORSO_R = V((0, 0.01, 0.79)), (0.20, 0.16, 0.22)
NECK = (V((0, 0.01, 0.92)), V((0, 0.0, 1.07)), 0.085, 0.07)
HEAD_PIVOT = V((0, 0, 1.03))
ARM_R, THIGH_R, SHIN_R = 0.054, 0.08, 0.052


def arm_points(s):
    """root (inside the torso), shoulder, elbow, wrist."""
    return (V((s * 0.08, 0.01, 0.88)), V((s * 0.17, 0.01, 0.89)), V((s * 0.42, 0.03, 0.97)),
            V((s * 0.52, -0.12, 0.78)))


def claw_frame(direction):
    """(side, forward, up) of a claw pointing along `direction`."""
    f = direction.normalized()
    side = f.cross(V((0, 0, 1))).normalized()
    return side, f, side.cross(f).normalized()


def claw_dir(s):
    return V((-s * 0.3, -1, 0.1)).normalized()


def claw_geometry(s):
    """Palm centre, fixed finger centre line + radii, pincer hinge, pincer line + radii, charge."""
    w = arm_points(s)[3]
    side, f, u = claw_frame(claw_dir(s))
    palm = w + f * 0.12
    finger = [w + f * (0.2 + 0.27 * v) + u * (0.05 + 0.05 * math.sin(math.pi * v) - 0.085 * v * v) - side * (0.03 * v * v)
              for v in np.linspace(0, 1, 9)]
    finger_r = [0.072 - 0.054 * v ** 0.8 for v in np.linspace(0, 1, 9)]
    hinge = w + f * 0.19 - u * 0.065
    pincer = [hinge + f * (0.24 * v) + u * (0.06 * v * v - 0.02 * math.sin(math.pi * v)) - side * (0.025 * v * v)
              for v in np.linspace(0, 1, 8)]
    pincer_r = [0.056 - 0.04 * v ** 0.8 for v in np.linspace(0, 1, 8)]
    charge = w + f * 0.33 - u * 0.0
    return palm, finger, finger_r, hinge, pincer, pincer_r, charge


def leg_points(s):
    """hip, knee, ankle, toe (rest)."""
    return (V((s * 0.11, 0.02, 0.60)), V((s * 0.40, -0.02, 0.60)), V((s * 0.18, 0.01, 0.13)),
            V((s * 0.41, -0.07, 0.036)))


def thigh_path(s):
    h, k, _, _ = leg_points(s)
    return [h.lerp(k, v) + V((0, 0, 0.07 * math.sin(math.pi * v))) for v in np.linspace(0, 1, 7)]


def shin_path(s):
    """The sketch's wavy shin: an S from the knee down to the ankle."""
    _, k, a, _ = leg_points(s)
    return [k.lerp(a, v) + V((s * 0.055 * math.sin(TAU * v) * C.smoothstep(0, 0.12, v) * (1 - C.smoothstep(0.88, 1, v)), 0, 0))
            for v in np.linspace(0, 1, 13)]


def foot_path(s):
    _, _, a, t = leg_points(s)
    mid = V((s * 0.27, -0.02, 0.05))
    return [a, mid, t]


# --- heads -------------------------------------------------------------------
HEAD_C, HEAD_HALF, HEAD_ROUND = V((0, -0.005, 1.20)), (0.19, 0.165, 0.155), 0.03
HEAD_ROT = C.rot_z(D(5)) @ C.rot_y(D(-4))
# chipped corners: (outward normal in the block's frame, distance from its centre)
CHIPS = (((1, -1, 1), 0.245), ((-1, 1, 1), 0.26), ((-1, -1, -1), 0.27), ((1, 1, -1), 0.265), ((-1, -1, 1), 0.285))
# crystal spikes on top: (base, tip, base radius, tip radius)
SPIKES = ((V((0.0, 0.01, 1.30)), V((0.012, 0.03, 1.565)), 0.078, 0.012),
          (V((0.10, 0.0, 1.30)), V((0.205, -0.01, 1.46)), 0.056, 0.01),
          (V((-0.10, 0.02, 1.30)), V((-0.195, 0.04, 1.445)), 0.052, 0.01),
          (V((0.03, 0.10, 1.30)), V((0.05, 0.17, 1.42)), 0.045, 0.01))
EYES = {s: V((sign * 0.085, -0.163, 1.19)) for s, sign in SIDES}
EYE_R = 0.047
FIRE_C, FIRE_R = V((0, -0.005, 1.18)), (0.185, 0.16, 0.152)
# flame tongues of the fire head: (base, up, length, base radius, curl, side)
TONGUES = [
    (V((0, 0.02, 1.27)), V((0, 0.08, 1)), 0.36, 0.10, 0.07, V((1, 0, 0))),
    (V((0.10, 0, 1.24)), V((0.45, 0, 1)), 0.28, 0.08, -0.06, V((1, 0, -0.45))),
    (V((-0.10, 0, 1.24)), V((-0.45, 0, 1)), 0.28, 0.08, 0.06, V((1, 0, 0.45))),
    (V((0.15, 0, 1.17)), V((0.55, 0, 1)), 0.21, 0.065, 0.05, V((1, 0, -0.55))),
    (V((-0.15, 0, 1.17)), V((-0.55, 0, 1)), 0.21, 0.065, -0.05, V((1, 0, 0.55))),
    (V((0, 0.11, 1.23)), V((0, 0.5, 1)), 0.28, 0.08, 0.05, V((1, 0, 0))),
]


def tongue(i):
    base, up, length, r0, curl, side = TONGUES[i]
    return K.flame_tongue(base, up.normalized(), side.normalized(), length, r0, curl)


def ice_sdf(P):
    axes = [HEAD_ROT @ V(a) for a in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
    Q = K.local(P, HEAD_C, axes)
    d = F._sd_round_box(Q, (0, 0, 0), HEAD_HALF, HEAD_ROUND)
    for n, k in CHIPS:
        n = np.asarray(n, np.float32) / np.linalg.norm(n)
        d = K.smax(d, Q @ n - k, 0.008)
    return d


def spikes_sdf(P):
    d = None
    for a, b, r1, r2 in SPIKES:
        t = K.round_cone(P, a, b, r1, r2)
        d = t if d is None else np.minimum(d, t)
    return d


def ice_mats(centers):
    """Clear blue faces with frosted white edges and chips."""
    axes = np.asarray([HEAD_ROT @ V(a) for a in ((1, 0, 0), (0, 1, 0), (0, 0, 1))], np.float32)
    q = np.abs((centers - np.asarray(HEAD_C, np.float32)) @ axes.T) / np.asarray(HEAD_HALF, np.float32)
    edge = (q > 0.8).sum(axis=1) >= 2
    return np.where(edge, SPIKE_M, ICE)


def fire_core_sdf(P):
    return K.ellipsoid(P, FIRE_C, FIRE_R)


def fire_sdf(P):
    d = fire_core_sdf(P)
    for i in range(len(TONGUES)):
        pts, radii = tongue(i)
        d = K.smin(d, K.tapered_tube(P, pts, radii), 0.05)
    return d


def fire_bands(centers):
    """Orange core, orange-red flames, red tips (wavy borders)."""
    x, z = centers[:, 0], centers[:, 2]
    core = z < 1.28 + 0.03 * np.sin(19 * x + 0.5)
    tips = z > 1.43 + 0.04 * np.sin(15 * x + 1.0) - 0.3 * np.abs(x)
    return np.where(core, CORE, np.where(tips, TIPS, FLAME))


def ice_ball_sdf(P, c, r):
    """A lumpy ball of ice with a few crystal points."""
    d = F._sd_sphere(P, c, r)
    for k, (x, y, z) in enumerate(((1, 0.2, 0.3), (-0.7, 0.5, 0.6), (0.1, -0.4, 1), (-0.3, -1, -0.2), (0.4, 0.8, -0.7),
                                   (-0.8, -0.3, -0.6))):
        n = V((x, y, z)).normalized()
        d = K.smin(d, K.round_cone(P, c + n * r * 0.5, c + n * r * (1.45 + 0.1 * (k % 3)), r * 0.42, r * 0.06), r * 0.15)
    return d


def fire_ball_sdf(P, c, r):
    d = F._sd_sphere(P, c, r)
    for k, sx in enumerate((-0.5, 0, 0.5)):
        pts, radii = K.flame_tongue(c + V((sx * r * 0.5, 0, r * 0.3)), V((sx * 0.5, 0, 1)).normalized(), V((1, 0, 0)),
                                    r * 1.8, r * 0.6, (-1) ** k * r * 0.2, tip=0.008, n=8)
        d = K.smin(d, K.tapered_tube(P, pts, radii), r * 0.35)
    return d


# --- sculpture ---------------------------------------------------------------
def torso_sdf(P):
    d = K.ellipsoid(P, TORSO_C, TORSO_R)
    a, b, r1, r2 = NECK
    return K.smin(d, K.round_cone(P, a, b, r1, r2), 0.04)


def palm_sdf(P, s):
    palm = claw_geometry(s)[0]
    return K.ellipsoid(K.local(P, palm, claw_frame(claw_dir(s))), (0, 0, 0), (0.105, 0.165, 0.118))


def arm_sdf(P, s):
    root, sh, el, w = arm_points(s)
    pts = [root, sh] + [sh.lerp(el, v) + V((0, 0, 0.03 * math.sin(math.pi * v))) for v in (0.33, 0.66)] + [el, w]
    d = K.tapered_tube(P, pts, [ARM_R * 1.15, ARM_R * 1.1, ARM_R * 1.05, ARM_R, ARM_R * 0.95, ARM_R * 0.9])
    _, finger, finger_r, *_ = claw_geometry(s)
    d = K.smin(d, palm_sdf(P, s), 0.03)
    return K.smin(d, K.tapered_tube(P, finger, finger_r), 0.025)


def leg_sdf(P, s):
    thigh = thigh_path(s)
    d = K.tapered_tube(P, [PELVIS + V((s * 0.04, 0, 0))] + thigh, [THIGH_R * 1.05] + [THIGH_R - 0.01 * v for v in np.linspace(0, 1, 7)])
    shin = shin_path(s)
    d = K.smin(d, K.tapered_tube(P, shin, [SHIN_R + 0.006 - 0.008 * v for v in np.linspace(0, 1, len(shin))]), 0.03)
    foot = foot_path(s)
    d = K.smin(d, K.tapered_tube(P, foot, [0.05, 0.045, 0.042]), 0.025)
    toe = foot[-1]
    pad = K.ellipsoid(K.local(P, toe + V((0, 0, 0.0)), claw_frame(V((s, -0.25, 0)))), (0, 0, 0), (0.065, 0.085, 0.036))
    return K.smin(d, pad, 0.02)


def body_sdf(P):
    d = torso_sdf(P)
    for _, s in SIDES:
        d = K.smin(d, arm_sdf(P, s), 0.035)
        d = K.smin(d, leg_sdf(P, s), 0.05)
    return K.smax(d, -P[..., 2], 0.006)


def body_mats(centers):
    """Shell, with darker claw tips."""
    out = np.full(len(centers), SHELL, np.int32)
    for _, s in SIDES:
        palm = np.asarray(claw_geometry(s)[0], np.float32)
        f = np.asarray(claw_frame(claw_dir(s))[1], np.float32)
        q = centers - palm
        out[(q @ f > 0.12 + 0.015 * np.sin(50 * q[:, 2])) & (np.linalg.norm(q, axis=1) < 0.55)] = CLAW
    return out


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.85, -0.7, -0.02), (0.85, 0.35, 1.15), VOXEL, mat=body_mats)
    for s, sign in SIDES:
        *_, hinge, pincer, pincer_r, _ = claw_geometry(sign)
        lo, hi = K.bounds(pincer, 0.06)
        parts.add(f"pincer.{s}", lambda P, p=pincer, r=pincer_r: K.tapered_tube(P, p, r), lo, hi, DETAIL, mat=CLAW)
    parts.add("head", ice_sdf, HEAD_C - V((0.3, 0.3, 0.3)), HEAD_C + V((0.3, 0.3, 0.3)), DETAIL * 1.5, mat=ice_mats)
    lo, hi = K.bounds([p for sp in SPIKES for p in sp[:2]], 0.1)
    parts.add("head", spikes_sdf, lo, hi, DETAIL * 1.3, mat=SPIKE_M)
    parts.add("fire", fire_sdf, (-0.4, -0.3, 0.98), (0.4, 0.4, 1.7), VOXEL * 1.1, mat=fire_bands)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: F._sd_sphere(P, c, EYE_R), e - V((0.08,) * 3), e + V((0.08,) * 3),
                  DETAIL * 0.8, mat=EYES_M)
        pupil = e + V((sign * -0.006, -0.038, 0.003))
        parts.add(f"eye.{s}", lambda P, c=pupil: K.ellipsoid(P, c, (0.019, 0.013, 0.023)),
                  pupil - V((0.05,) * 3), pupil + V((0.05,) * 3), 0.004, mat=PUPILS)
    c = claw_geometry(-1)[6]
    parts.add("charge", lambda P: ice_ball_sdf(P, c, 0.1), c - V((0.2,) * 3), c + V((0.2,) * 3), DETAIL, mat=ICEBALL)
    parts.add("charge", lambda P: fire_ball_sdf(P, c, 0.1), c - V((0.2,) * 3), c + V((0.2, 0.2, 0.3)), DETAIL, mat=FIREBALL)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "shraps"
    obj["body_color"] = SHELL_HEX
    obj["eye_color"] = EYE_HEX
    obj["ice_only"] = ",".join(ICE_ONLY)
    obj["fire_only"] = ",".join(FIRE_ONLY)
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_ball(coll):
    """The thrown ice ball, centred on its origin."""
    parts = K.Parts()
    parts.add("ball", lambda P: ice_ball_sdf(P, V(), 0.11), (-0.22,) * 3, (0.22,) * 3, DETAIL, mat=ICEBALL)
    obj = parts.mesh(BALL, coll, MATERIALS)
    obj["projectile"] = "iceball"
    obj["radius"] = 0.11
    return obj


# --- rig / skin --------------------------------------------------------------
def tongue_bones(i):
    pts, _ = tongue(i)
    return pts[0], pts[len(pts) // 2], pts[-1]


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", PELVIS, (0, 0.01, 0.98), "root", True, fwd),
             ("head", HEAD_PIVOT, (0, 0, 1.36), "body", True, fwd)]
    for s, sign in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + V((0, -0.07, 0)), "head", True, up))
        root, sh, el, w = arm_points(sign)
        side, f, u = claw_frame(claw_dir(sign))
        *_, hinge, pincer, _, charge = claw_geometry(sign)
        bones += [(f"arm_upper.{s}", sh, el, "body", True, up),
                  (f"arm_lower.{s}", el, w, f"arm_upper.{s}", True, up),
                  (f"claw.{s}", w, w + f * 0.3, f"arm_lower.{s}", True, u),
                  (f"pincer.{s}", hinge, hinge + f * 0.24, f"claw.{s}", True, u)]
        if s == "R":
            bones.append(("charge", charge, charge + f * 0.1, "claw.R", True, u))
        h, k, a, t = leg_points(sign)
        out = V((sign, 0, 0))
        bones += [(f"thigh.{s}", h, k, "body", True, up),
                  (f"shin.{s}", k, a, f"thigh.{s}", True, out),
                  (f"foot.{s}", a, t, f"shin.{s}", True, up)]
    for i in range(len(TONGUES)):
        a, m, b = tongue_bones(i)
        bones += [(f"flame{i}_a", a, m, "head", True, fwd), (f"flame{i}_b", m, b, f"flame{i}_a", True, fwd)]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "shraps", "forward": "-Y", "attack_style": "pinch+throw", "normal_speed": WALK_SPEED,
        "eye_light": EYE_HEX, "eye_intensity": 2.2, "root_motion": False})


def limb(Q, pts, joints, names, width=0.04):
    """Distance to a limb's centre line and its bone shares: names[i] owns the
    stretch between joints[i - 1] and joints[i] (arc lengths)."""
    d, along = C._polyline_closest(Q, pts)
    shares = {}
    ends = [C.np_smoothstep(j - width, j + width, along) for j in joints]   # 1 past joint j
    for i, name in enumerate(names):
        past_prev = ends[i - 1] if i > 0 else np.ones(len(Q))
        past_next = ends[i] if i < len(ends) else np.zeros(len(Q))
        shares[name] = np.clip(past_prev - past_next, 0, 1)
    return d, shares


def arc(pts):
    return np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind == "fire":
            Q = P[lo:hi]
            dists, parts = [fire_core_sdf(Q)], [{"head": np.ones(len(Q))}]
            for i in range(len(TONGUES)):
                pts, radii = tongue(i)
                d, along = C._polyline_closest(Q, pts)
                u = along / arc(pts)[-1]
                body = 1 - C.np_smoothstep(0.0, 0.28, u)
                tip = C.np_smoothstep(0.42, 0.62, u)
                dists.append(d - np.interp(u, np.linspace(0, 1, len(radii)), radii))
                parts.append({"head": body, f"flame{i}_a": np.clip(1 - body - tip, 0, 1), f"flame{i}_b": tip})
            membership = np.exp(-(np.stack(dists, 1) - np.min(dists, 0)[:, None]) / 0.012)
            membership /= membership.sum(axis=1, keepdims=True)
            WB = np.zeros((len(Q), len(names)), np.float32)
            for k, values in enumerate(parts):
                for name, value in values.items():
                    WB[:, names.index(name)] += membership[:, k] * value
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 8)
            continue
        if kind != "body":
            W[lo:hi, names.index(kind)] = 1
            continue
        Q = P[lo:hi]
        dists, parts = [torso_sdf(Q)], [{"body": np.ones(len(Q))}]
        for s, sign in SIDES:
            root, sh, el, w = arm_points(sign)
            f = claw_dir(sign)
            line = [root, sh, el, w, w + f * 0.5]
            L = arc(line)
            d, shares = limb(Q, line, (L[1] + 0.02, L[2], L[3] + 0.01),
                             ("body", f"arm_upper.{s}", f"arm_lower.{s}", f"claw.{s}"), 0.04)
            dists.append(np.minimum(d - ARM_R, palm_sdf(Q, sign)))
            parts.append(shares)
            h, k, a, t = leg_points(sign)
            line = [PELVIS + V((sign * 0.04, 0, 0))] + thigh_path(sign) + shin_path(sign)[1:] + foot_path(sign)[1:]
            L = arc(line)
            d, shares = limb(Q, line, (L[1] + 0.03, L[7], L[7 + 12]),
                             ("body", f"thigh.{s}", f"shin.{s}", f"foot.{s}"), 0.035)
            dists.append(d - SHIN_R)
            parts.append(shares)
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
    ball = build_ball(coll)
    ball.location = (0.95, 0, 0.6)          # beside the creature in the .blend; the game places it
    for name, roughness in (("ShrapsIce", 0.1), ("ShrapsIceSpikes", 0.3), ("ShrapsIceBall_glow", 0.2)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj, ball


# --- motion ------------------------------------------------------------------
REST = {s: leg_points(sign) for s, sign in SIDES}
REST_FEET = {s: (REST[s][2].copy(), REST[s][3].copy()) for s, _ in SIDES}      # ankle, toe
REST_HANDS = {s: arm_points(sign)[3].copy() for s, sign in SIDES}
REST_CLAWS = {s: claw_dir(sign) for s, sign in SIDES}
REST_ELBOWS = {s: V((sign * 0.9, 0.3, 0.5)) for s, sign in SIDES}


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0,
         "feet": {s: (a.copy(), t.copy()) for s, (a, t) in REST_FEET.items()},      # world
         "local": {s: 0.0 for s, _ in SIDES},                                        # 1 = feet ride with the body
         "local_feet": {s: (a.copy(), t.copy()) for s, (a, t) in REST_FEET.items()}, # body space
         "hands": {s: h.copy() for s, h in REST_HANDS.items()},                     # body space
         "claws": {s: c.copy() for s, c in REST_CLAWS.items()},                     # body space
         "elbows": {s: e.copy() for s, e in REST_ELBOWS.items()},
         "pincers": {s: D(6) for s, _ in SIDES},                                     # opening angle
         "head": (0.0, 0.0, 0.0), "head_drop": 0.0, "eyes": 1.0,
         "charge": 0.0, "amp": 1.0, "flare": 1.0}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)
    length = lambda a, b: (skel.rest[a].inverted() @ skel.rest[b]).translation.length
    arm_len = {s: (length(f"arm_upper.{s}", f"arm_lower.{s}"), length(f"arm_lower.{s}", f"claw.{s}")) for s, _ in SIDES}
    leg_len = {s: (length(f"thigh.{s}", f"shin.{s}"), length(f"shin.{s}", f"foot.{s}")) for s, _ in SIDES}

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        body = L @ Matrix.Translation(PELVIS + p["pos"]) @ (R @ skel.rest_rot["body"]).to_4x4()
        bases["body"] = skel.set("body", poses, body)
        delta = body @ skel.rest["body"].inverted()      # rest body space -> posed armature space
        d3 = delta.to_3x3()
        hp, hr, hy = p["head"]
        bases["head"] = K.pose_local(skel, "head", poses, Matrix.Translation((0, -p["head_drop"], 0))
                                     @ (C.rot_y(hy) @ C.rot_x(hp) @ C.rot_z(hr)).to_4x4())
        e = max(0.05, p["eyes"])
        for s, sign in SIDES:
            bases[f"eye.{s}"] = K.pose_local(skel, f"eye.{s}", poses, Matrix.Diagonal((e, e, e, 1)))
            up, lo = f"arm_upper.{s}", f"arm_lower.{s}"
            shoulder = skel.base(up, poses).translation
            elbow, wrist = C.two_bone_ik(shoulder, delta @ p["hands"][s], *arm_len[s], d3 @ p["elbows"][s])
            bases[up] = skel.aim(up, poses, elbow - shoulder)
            bases[lo] = skel.aim(lo, poses, wrist - elbow)
            bases[f"claw.{s}"] = skel.aim(f"claw.{s}", poses, d3 @ p["claws"][s])
            bases[f"pincer.{s}"] = K.pose_local(skel, f"pincer.{s}", poses, Matrix.Rotation(-p["pincers"][s], 4, "X"))
            th, sh, ft = f"thigh.{s}", f"shin.{s}", f"foot.{s}"
            hip = skel.base(th, poses).translation
            wa, wt = p["feet"][s]
            la, lt = p["local_feet"][s]
            k = p["local"][s]
            ankle_t = (L @ wa).lerp(delta @ la, k)
            toe_t = (L @ wt).lerp(delta @ lt, k)
            knee, ankle = C.two_bone_ik(hip, ankle_t, *leg_len[s], d3 @ V((sign, -0.15, 0.35)))
            bases[th] = skel.aim(th, poses, knee - hip)
            bases[sh] = skel.aim(sh, poses, ankle - knee)
            bases[ft] = skel.aim(ft, poses, toe_t - ankle)
        c = max(0.01, p["charge"])
        bases["charge"] = K.pose_local(skel, "charge", poses, Matrix.Diagonal((c, c, c, 1)))
        for i in range(len(TONGUES)):
            a, b, st = K.flicker(i, p["t"], LOOP_T, p["amp"])
            g = p["flare"] * (0.92 + 0.08 * st)
            rot = Matrix.Rotation(0.5 * a, 4, "X") @ Matrix.Rotation(0.5 * b, 4, "Z")
            bases[f"flame{i}_a"] = K.pose_local(skel, f"flame{i}_a", poses, rot @ Matrix.Diagonal((g, g, g, 1)))
            rot = Matrix.Rotation(a, 4, "X") @ Matrix.Rotation(b, 4, "Z")
            bases[f"flame{i}_b"] = K.pose_local(skel, f"flame{i}_b", poses, rot @ Matrix.Diagonal((1, st, 1, 1)))
        return bases
    return solve


def shifted(feet, s, dy, dz):
    a, t = feet[s]
    return a + V((0, dy, dz)), t + V((0, dy, dz * 0.6))


def walk(f):
    n, T = WALK_FRAMES, LOOP_T
    ph = (f / n) % 1
    w = TAU * ph
    duty = 0.6
    stride = WALK_SPEED * duty * T
    feet = {}
    for s, sign in SIDES:
        y, z = C.foot_track((ph + (0.5 if s == "R" else 0)) % 1, duty, stride, 0.09, WALK_SPEED, T, skew=0.9)
        feet[s] = shifted(REST_FEET, s, y, z)
    hands = {s: REST_HANDS[s] + V((sign * 0.02 * math.sin(w), 0.05 * sign * math.sin(w), 0.035 * math.sin(w + sign * 0.8)))
             for s, sign in SIDES}
    claws = {s: (REST_CLAWS[s] + V((0, 0, 0.18 * math.sin(w + sign)))).normalized() for s, sign in SIDES}
    pincers = {s: D(6) + D(16) * max(0.0, math.sin(2 * w + (0.4 if sign > 0 else 2.2))) ** 2 for s, sign in SIDES}
    return params(t=f / FPS, pos=V((0.02 * math.sin(w), 0, -0.012 + 0.018 * math.cos(2 * w))),
                  pitch=D(3), roll=D(5) * math.sin(w), yaw=D(4) * math.sin(w + 0.3), feet=feet,
                  hands=hands, claws=claws, pincers=pincers,
                  head=(D(3) * math.sin(2 * w - 1.0), D(-4) * math.sin(w - 0.6), D(-3) * math.sin(w)))


def pinch(f):
    k, t = C.keyframes, f / FPS
    hit = PINCH_HIT / FPS
    hands, claws, pincers, elbows = {}, {}, {}, {}
    for s, sign in SIDES:
        rest = REST_HANDS[s]
        hands[s] = k((0, rest), (0.28, V((sign * 0.52, -0.02, 1.12))), (hit, V((sign * 0.3, -0.5, 0.86))),
                     (0.66, V((sign * 0.32, -0.46, 0.82))), (1.0, rest))(t)
        claws[s] = k((0, REST_CLAWS[s]), (0.28, V((-sign * 0.25, -0.55, 0.8)).normalized()),
                     (hit, V((-sign * 0.5, -1, -0.05)).normalized()), (0.66, V((-sign * 0.45, -1, -0.1)).normalized()),
                     (1.0, REST_CLAWS[s]))(t).normalized()
        elbows[s] = k((0, REST_ELBOWS[s]), (0.28, V((sign * 1, 0.4, 0.2))), (hit, V((sign * 1, 0.2, 0.3))),
                      (1.0, REST_ELBOWS[s]))(t)
        pincers[s] = D(k((0, 6), (0.28, 42), (hit - 2 / FPS, 44), (hit, 0), (0.72, 0), (1.0, 6))(t))
    shake = D(3) * math.sin(TAU * 9 * (t - hit)) * math.exp(-8 * (t - hit)) if t > hit else 0
    return params(t=t, pos=V((0, k((0, 0), (0.28, 0.05), (hit, -0.09), (0.66, -0.07), (1.0, 0))(t),
                                k((0, 0), (0.28, -0.04), (hit, -0.06), (0.66, -0.04), (1.0, 0))(t))),
                  pitch=D(k((0, 3), (0.28, -9), (hit, 14), (0.66, 10), (1.0, 3))(t)) + shake,
                  hands=hands, claws=claws, elbows=elbows, pincers=pincers,
                  head=(D(k((0, 0), (0.28, -10), (hit + 0.06, 12), (0.8, 2), (1.0, 0))(t)), 0, 0))


def throw(f):
    k, t = C.keyframes, f / FPS
    hit = THROW_HIT / FPS
    s, r = "L", "R"
    hands = {r: k((0, REST_HANDS[r]), (0.18, V((-0.5, -0.05, 0.7))), (0.5, V((-0.36, 0.26, 1.2))),
                  (hit, V((-0.2, -0.56, 1.0))), (0.92, V((-0.14, -0.42, 0.72))), (1.3, REST_HANDS[r]))(t),
             s: k((0, REST_HANDS[s]), (0.5, V((0.44, -0.34, 0.98))), (hit, V((0.5, 0.06, 0.78))),
                  (1.0, V((0.5, -0.06, 0.78))), (1.3, REST_HANDS[s]))(t)}
    claws = {r: k((0, REST_CLAWS[r]), (0.18, V((0.2, -0.8, 0.5)).normalized()), (0.5, V((0.1, -0.15, 1)).normalized()),
                  (hit, V((0.2, -1, -0.15)).normalized()), (0.92, V((0.3, -0.8, -0.6)).normalized()),
                  (1.3, REST_CLAWS[r]))(t).normalized(),
             s: k((0, REST_CLAWS[s]), (0.5, V((-0.2, -1, 0.35)).normalized()), (hit, V((0.1, -0.6, -0.5)).normalized()),
                  (1.3, REST_CLAWS[s]))(t).normalized()}
    elbows = {r: k((0, REST_ELBOWS[r]), (0.5, V((-1, 0.5, 0.6))), (hit, V((-1, 0.1, 0.4))), (1.3, REST_ELBOWS[r]))(t),
              s: REST_ELBOWS[s]}
    pincers = {r: D(k((0, 6), (0.15, 30), (0.5, 22), (hit - 1 / FPS, 22), (hit + 1 / FPS, 48), (0.9, 30), (1.3, 6))(t)),
               s: D(k((0, 6), (0.5, 26), (hit, 4), (1.3, 6))(t))}
    charge = k((0, 0), (0.12, 0), (0.5, 0.9), (hit - 1 / FPS, 1.0), (hit, 0.0))(t) if t < hit else 0.0
    return params(t=t, pos=V((0, k((0, 0), (0.5, 0.06), (hit, -0.06), (0.92, -0.04), (1.3, 0))(t),
                                k((0, 0), (0.5, -0.02), (hit, -0.04), (1.3, 0))(t))),
                  pitch=D(k((0, 3), (0.5, -10), (hit, 13), (0.92, 8), (1.3, 3))(t)),
                  yaw=D(k((0, 0), (0.5, -20), (hit, 14), (0.92, 8), (1.3, 0))(t)),
                  roll=D(k((0, 0), (0.5, -5), (hit, 4), (1.3, 0))(t)),
                  hands=hands, claws=claws, elbows=elbows, pincers=pincers, charge=charge,
                  head=(D(k((0, 0), (0.5, -8), (hit, 10), (0.9, 3), (1.3, 0))(t)), 0,
                        D(k((0, 0), (0.5, 12), (hit, -8), (1.3, 0))(t))),
                  flare=k((0, 1), (0.5, 1.2), (hit, 1.3), (1.0, 1))(t), amp=k((0, 1), (0.5, 1.5), (1.0, 1))(t))


def death(f):
    k, t = C.keyframes, f / FPS
    fall = k((0, 0), (0.3, 0.06), (0.95, 1), (1.1, 0.95), (1.3, 1))(t)
    curl = C.smoothstep(0.5, 1.4, t)
    twitch = C.smoothstep(0.9, 1.1, t) * (1 - C.smoothstep(1.4, 1.7, t))
    local_feet = {}
    for s, sign in SIDES:
        a, toe = REST_FEET[s]
        up = V((sign * 0.06, -0.02, 0.28 + 0.03 * math.sin(30 * t + sign) * twitch))
        local_feet[s] = (a.lerp(a + up, curl), toe.lerp(a + up + V((sign * 0.16, -0.1, 0.12)), curl))
    hands = {s: k((0, REST_HANDS[s]), (0.3, V((sign * 0.6, -0.1, 1.1))), (1.0, V((sign * 0.34, -0.2, 0.9))),
                  (1.6, V((sign * 0.26, -0.24, 0.86))))(t) for s, sign in SIDES}
    claws = {s: k((0, REST_CLAWS[s]), (0.3, V((0, -0.4, 1)).normalized()), (1.2, V((-sign * 0.8, -0.6, -0.2)).normalized()))(t).normalized()
             for s, sign in SIDES}
    pincers = {s: D(k((0, 6), (0.3, 40), (1.0, 20), (1.5, 30))(t) + 8 * math.sin(26 * t + sign) * twitch) for s, sign in SIDES}
    return params(t=t, pos=V((0, 0.10 * fall, -0.44 * fall)), pitch=D(-12) * C.smoothstep(0, 0.3, t) * (1 - fall) - D(88) * fall,
                  roll=D(7) * fall, local={s: C.smoothstep(0.25, 0.7, t) for s, _ in SIDES}, local_feet=local_feet,
                  hands=hands, claws=claws, pincers=pincers,
                  head=(D(k((0, 0), (0.3, 14), (0.95, -20), (1.3, -26))(t)), D(14) * fall, D(10) * fall),
                  eyes=k((0, 1), (0.5, 1), (1.4, 0.08))(t),
                  amp=k((0, 1), (0.3, 1.8), (0.9, 0.6), (1.5, 0))(t), flare=k((0, 1), (0.3, 1.3), (1.5, 0.15))(t))


def charge_point(rig, action, frame):
    """Armature-space centre of the charge ball (= ice ball launch point)."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    return rig.matrix_world @ rig.pose.bones["charge"].head


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "ShrapsWalk", solver(rig, walk), WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    act = K.ground_clip(rig, obj, "ShrapsPinch", solver(rig, pinch), PINCH_FRAMES,
                        extras={"attack_style": "pinch", "hit_frame": PINCH_HIT, "hit_time": PINCH_HIT / FPS})
    act.pose_markers.new("Pinch").frame = PINCH_HIT
    act = K.ground_clip(rig, obj, "ShrapsThrow", solver(rig, throw), THROW_FRAMES,
                        extras={"attack_style": "throw", "hit_frame": THROW_HIT, "hit_time": THROW_HIT / FPS})
    act.pose_markers.new("Throw").frame = THROW_HIT
    m = charge_point(rig, "ShrapsThrow", THROW_HIT - 1)
    act["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    K.ground_clip(rig, obj, "ShrapsDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.6}, settle_from=round(1.3 * FPS))
    K.register(rig, CLIPS)
    return list(act["muzzle"])


# --- previews ----------------------------------------------------------------
def show_variant(fire):
    """Preview a variant: hide the other one's materials (alpha 0), as the game does."""
    hidden = ICE_ONLY if fire else FIRE_ONLY
    for name, color, emission in MATERIALS:
        mat = bpy.data.materials[name]
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Alpha"].default_value = 0.0 if name in hidden else 1.0
        mat.surface_render_method = "DITHERED"
        mat.use_transparent_shadow = True
        if name in ("ShrapsShell", "ShrapsClaw"):
            hexes = {"ShrapsShell": ("#d8573a", SHELL_HEX), "ShrapsClaw": ("#9a2a1a", CLAW_HEX)}[name]
            bsdf.inputs["Base Color"].default_value = K.rgba(hexes[0] if fire else hexes[1])


def preview(scene, rig, path):
    shots = []
    for fire in (False, True):
        shots += [("ShrapsWalk", 0, (2.2, -5.0, 2.2)), ("ShrapsWalk", 8, (-4.5, -2.5, 2.0)),
                  ("ShrapsPinch", PINCH_HIT, (3.5, -4.0, 1.8)), ("ShrapsThrow", 15, (4.6, -1.6, 2.0))]
    halves = []
    for fire in (False, True):
        show_variant(fire)
        scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
        part = Path(str(path).replace("-preview", "-fire-preview")) if fire else Path(path)
        K.contact_sheet(scene, rig, shots[:4] + [("ShrapsThrow", THROW_HIT - 1, (0.6, -5.5, 1.6)),
                                                  ("ShrapsDeath", DEATH_FRAMES, (3.5, -4.0, 2.6))],
                        part, (0, 0, 0.72), size=360, cols=3)
        halves.append(part)
    show_variant(False)
    return halves


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj, ball = build()
    K.decimate(obj)
    K.decimate(ball)
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("ShrapsDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "Shraps", STAGE, (0, 0, 0.75), 2.4)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        ball.location = (0, 0, 0)
        K.export_gltf(rig, obj, export_path, extra=(ball,))
        ball.location = (0.95, 0, 0.6)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Shraps", NAME, (0, 0, 0.75), 3.2)
    if preview_path:
        ball.hide_render = True
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Shraps:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "shraps.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "shraps.blend"),
         preview_path=args[2] if len(args) > 2 else None)
