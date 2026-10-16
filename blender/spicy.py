"""
Spicy: a toxic green clay creature on wheels, from the whiteboard sketch.

A curved bar of a body, bent up at both ends like a smile, carries four
stalks standing up from it with glowing tips. Two red eyes float above the
stalks, not joined to anything. Two thin legs splay down from the middle of
the bar to round wheels (a tyre, a hub and three spokes), and an arm branches
off each leg, arcs out and down and ends in a three-fingered hand. Faces -Y
in Blender, +Z up; one unit = one game cell, about 1.3 cells tall.

Rig: root, body (the bar, its stalks and the top of the legs), stalk0..3,
eye.L/R (parented to the root: they float on their own; scale = glow),
axle.L/R (the foot of each leg: planted on the ground, the legs bend between
the body and them), wheel.L/R (children of the axles; the game spins them
about the axle by the distance rolled, so the clips leave them still), and
per side arm_upper / arm_lower / hand.

Clips, 30 fps, in place (the game supplies root motion and wheel spin):
    SpicyRoll   32-frame loop: rolling along at 0.6 cells/s, the bar swaying
                and bobbing, the stalks wobbling behind, the arms swinging,
                the eyes bobbing out of step.
    SpicyLaser  1.9 s: rolls backwards swaying from side to side (the game
                moves it back between extras.retreat_from and retreat_to),
                brakes and braces with its arms spread, the eyes swell and
                shoot a green laser from frame 27 (extras.beam_frame, from
                extras.muzzle: game x, up, forward, between the eyes) that
                bursts at frame 45 (extras.hit_frame); the burst knocks it
                back and it settles.
    SpicyDeath  2.0 s: shudders, tips over backwards onto its bar with the
                wheels in the air, the stalks and arms go limp and the eyes
                drop to the ground, bounce and dim. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, spicy; importlib.reload(creature); importlib.reload(spicy)
    spicy.main(export_path="<repo>/assets/spicy.glb", blend_path="<repo>/blender/spicy.blend")

Headless:
    Blender -b --python blender/spicy.py -- assets/spicy.glb blender/spicy.blend \
        blender/previews/spicy-preview.png
"""
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import creature as K
import figure as F

NAME, RIG_NAME = "Spicy", "SpicyRig"
SCENE, COLLECTION, STAGE = "Spicy", "SpicyAsset", "SpicyStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("SpicyRoll", "SpicyLaser", "SpicyDeath")

BODY_HEX, CLAW_HEX, TIP_HEX = "#86e02c", "#4f9a1c", "#d8ff3a"
TIRE_HEX, HUB_HEX = "#26351b", "#5f9e2a"
EYE_HEX, PUPIL_HEX = "#ff2414", "#1a0303"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("SpicyBody", BODY_HEX, 0), ("SpicyClaw", CLAW_HEX, 0), ("SpicyTips_glow", TIP_HEX, 1.6),
             ("SpicyTire", TIRE_HEX, 0), ("SpicyHub", HUB_HEX, 0),
             ("SpicyEyes_glow", EYE_HEX, 2.4), ("SpicyPupils", PUPIL_HEX, 0))
BODY, CLAW, TIPS, TIRE, HUB, EYES_M, PUPILS = range(len(MATERIALS))

VOXEL, DETAIL = 0.011, 0.006
WALK_FRAMES, WALK_SPEED = 32, 0.6
LASER_FRAMES, BEAM_FRAME, LASER_HIT = 57, 27, 45
RETREAT = (0.05, 0.75, 0.7)          # from, to (s), distance (cells): game/enemyai.js backs it off
DEATH_FRAMES = 60
LOOP_T = WALK_FRAMES / FPS

# --- body plan -----------------------------------------------------------------
WHEEL_R, TIRE_R = 0.15, 0.034        # wheel (to the tyre's outside) and tyre tube radius
AXLES = {s: V((sign * 0.25, 0, WHEEL_R)) for s, sign in SIDES}
PELVIS = V((0, 0, 0.66))
BAR_HALF = 0.46


def bar_z(x):
    return 0.66 + 0.95 * x * x


def bar_points(n=15):
    """The smile: a bar curving up at both ends and a little forward."""
    return [V((x, -0.07 * (x / BAR_HALF) ** 2, bar_z(x))) for x in np.linspace(-BAR_HALF, BAR_HALF, n)]


def bar_radii(n=15):
    return [0.05 + 0.045 * (1 - abs(x) / BAR_HALF) ** 1.2 for x in np.linspace(-BAR_HALF, BAR_HALF, n)]


BELLY_C, BELLY_R = V((0, 0.0, 0.655)), (0.15, 0.1, 0.09)
# stalks: (x, height, lean out)
STALKS = ((-0.25, 0.34, -0.035), (-0.085, 0.28, -0.01), (0.085, 0.27, 0.01), (0.25, 0.31, 0.035))
STALK_R0, STALK_R1, NUB_R = 0.042, 0.03, 0.042


def stalk_line(i):
    x, h, lean = STALKS[i]
    base = V((x, -0.07 * (x / BAR_HALF) ** 2, bar_z(x) - 0.02))
    return base, base + V((lean, 0.0, h))


EYES = {s: V((sign * 0.155, -0.03, 1.22)) for s, sign in SIDES}
EYE_R = 0.085
HIP = {s: V((sign * 0.055, 0, 0.64)) for s, sign in SIDES}
LEG_R0, LEG_R1 = 0.048, 0.04


def leg_end(s):
    """Where the leg meets the axle stub: just inside the wheel."""
    a = AXLES[s]
    return a - V((math.copysign(0.07, a.x), 0, 0))


def leg_line(s):
    h, e = HIP[s], leg_end(s)
    return [h.lerp(e, v) for v in np.linspace(0, 1, 6)]


def arm_points(s):
    """root (on the leg), shoulder, elbow, wrist."""
    sign = 1 if s == "L" else -1
    root = HIP[s].lerp(leg_end(s), 0.22)
    return (root, V((sign * 0.24, -0.01, 0.62)), V((sign * 0.42, -0.02, 0.60)), V((sign * 0.53, -0.04, 0.42)))


ARM_R = 0.034
# fingers (in the hand's frame: out, forward, up) splaying from the wrist like the sketch's
# little tridents: one up and out, one down, one down and in
FINGERS = ((0.8, -0.1, 0.55), (0.15, -0.15, -1), (-0.6, -0.2, -0.7))
FINGER_LEN = (0.11, 0.13, 0.11)


def finger_lines(s, wrist=None, frame=None):
    sign = 1 if s == "L" else -1
    w = wrist if wrist is not None else arm_points(s)[3]
    out, fwd, up = frame or (V((sign, 0, 0)), V((0, -1, 0)), V((0, 0, 1)))
    lines = []
    for (a, b, c), length in zip(FINGERS, FINGER_LEN):
        d = (out * a + fwd * b + up * c).normalized()
        pts = [w + d * (length * v) + up * (0.015 * math.sin(math.pi * v)) for v in np.linspace(0, 1, 5)]
        lines.append(pts)
    return lines


FINGER_RADII = [0.03, 0.027, 0.023, 0.018, 0.013]


# --- sculpture ---------------------------------------------------------------
def torso_sdf(P):
    d = K.tapered_tube(P, bar_points(), bar_radii())
    return K.smin(d, K.ellipsoid(P, BELLY_C, BELLY_R), 0.05)


def stalk_sdf(P, i):
    a, b = stalk_line(i)
    return K.round_cone(P, a, b, STALK_R0, STALK_R1)


def leg_sdf(P, s):
    pts = leg_line(s)
    d = K.tapered_tube(P, pts, [LEG_R0 + (LEG_R1 - LEG_R0) * v for v in np.linspace(0, 1, len(pts))])
    e, a = leg_end(s), AXLES[s]
    d = K.smin(d, K.ellipsoid(P, e, (0.05, 0.05, 0.05)), 0.02)                  # a knuckle at the foot
    return K.smin(d, K.round_cone(P, e, a - V((math.copysign(0.02, a.x), 0, 0)), 0.026, 0.024), 0.015)   # the axle stub


def arm_sdf(P, s):
    root, sh, el, w = arm_points(s)
    pts = [root, sh, sh.lerp(el, 0.5) + V((0, 0, 0.025)), el, el.lerp(w, 0.5) + V((math.copysign(0.02, w.x), 0, 0.01)), w]
    d = K.tapered_tube(P, pts, [ARM_R * 1.2, ARM_R * 1.05, ARM_R, ARM_R * 0.95, ARM_R * 0.9, ARM_R * 0.9])
    return K.smin(d, K.ellipsoid(P, w, (0.04, 0.04, 0.04)), 0.015)


def fingers_sdf(P, s):
    d = None
    for pts in finger_lines(s):
        t = K.tapered_tube(P, pts, FINGER_RADII)
        d = t if d is None else K.smin(d, t, 0.012)
    return d


def body_sdf(P):
    d = torso_sdf(P)
    for i in range(len(STALKS)):
        d = K.smin(d, stalk_sdf(P, i), 0.03)
    for s, _ in SIDES:
        d = K.smin(d, leg_sdf(P, s), 0.045)
        d = K.smin(d, arm_sdf(P, s), 0.03)
        d = K.smin(d, fingers_sdf(P, s), 0.02)
    return d


def body_mats(centers):
    """Green body with darker fingers and forearm tips."""
    out = np.full(len(centers), BODY, np.int32)
    for s, _ in SIDES:
        w = np.asarray(arm_points(s)[3], np.float32)
        out[np.linalg.norm(centers - w, axis=1) < 0.06 + 0.01 * np.sin(40 * centers[:, 2])] = CLAW
        for pts in finger_lines(s):
            d, _ = C._polyline_closest(centers, pts)
            out[d < 0.04] = CLAW
    return out


def nub_sdf(P, i):
    _, b = stalk_line(i)
    return F._sd_sphere(P, b + V((0, 0, 0.012)), NUB_R)


def wheel_sdf(P, c):
    """A tyre (a torus about the X axle), a hub and three spokes."""
    q = P - np.asarray(c, np.float32)
    ring = np.sqrt(q[..., 1] ** 2 + q[..., 2] ** 2) - (WHEEL_R - TIRE_R)
    return np.sqrt(ring ** 2 + (q[..., 0] / 1.15) ** 2) - TIRE_R


def hub_sdf(P, c):
    d = K.ellipsoid(P, c, (0.032, 0.046, 0.046))
    for k in range(3):
        a = TAU * k / 3 + 0.3
        tip = c + V((0, math.sin(a), math.cos(a))) * (WHEEL_R - TIRE_R)
        d = K.smin(d, K.round_cone(P, c, tip, 0.019, 0.014), 0.015)
    return d


def wheel_mats(centers, c):
    r = np.sqrt((centers[:, 1] - c[1]) ** 2 + (centers[:, 2] - c[2]) ** 2)
    return np.where(r > WHEEL_R - TIRE_R * 1.6, TIRE, HUB)


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.72, -0.3, 0.05), (0.72, 0.2, 1.12), VOXEL, mat=body_mats)
    for i in range(len(STALKS)):
        _, b = stalk_line(i)
        parts.add(f"stalk{i}", lambda P, i=i: nub_sdf(P, i), b - V((0.07,) * 3), b + V((0.07,) * 3), DETAIL, mat=TIPS)
    for s, sign in SIDES:
        c = AXLES[s]
        lo, hi = c - V((0.06, WHEEL_R + 0.03, WHEEL_R + 0.03)), c + V((0.06, WHEEL_R + 0.03, WHEEL_R + 0.03))
        both = lambda P, c=c: np.minimum(wheel_sdf(P, c), hub_sdf(P, c))
        parts.add(f"wheel.{s}", both, lo, hi, DETAIL, mat=lambda q, c=c: wheel_mats(q, c))
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: F._sd_sphere(P, c, EYE_R), e - V((0.1,) * 3), e + V((0.1,) * 3),
                  DETAIL * 0.8, mat=EYES_M)
        pupil = e + V((sign * -0.01, -0.071, 0.006))
        parts.add(f"eye.{s}", lambda P, c=pupil: K.ellipsoid(P, c, (0.034, 0.02, 0.04)),
                  pupil - V((0.05,) * 3), pupil + V((0.05,) * 3), 0.004, mat=PUPILS)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "spicy"
    obj["body_color"] = BODY_HEX
    obj["eye_color"] = EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", PELVIS, (0, 0, 0.95), "root", True, fwd)]
    for i in range(len(STALKS)):
        a, b = stalk_line(i)
        bones.append((f"stalk{i}", a, b, "body", True, fwd))
    for s, sign in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + V((0, -0.08, 0)), "root", True, up))
        a = AXLES[s]
        bones += [(f"axle.{s}", a, a + V((sign * 0.1, 0, 0)), "root", True, up),
                  (f"wheel.{s}", a, a + V((sign * 0.1, 0, 0)), f"axle.{s}", True, up)]
        root, sh, el, w = arm_points(s)
        bones += [(f"arm_upper.{s}", sh, el, "body", True, up),
                  (f"arm_lower.{s}", el, w, f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", w, w + V((0, 0, -0.12)), f"arm_lower.{s}", True, fwd)]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "spicy", "forward": "-Y", "attack_style": "laser", "normal_speed": WALK_SPEED,
        "wheel_radius": WHEEL_R, "eye_light": EYE_HEX, "eye_intensity": 2.4, "root_motion": False})


def limb(Q, pts, joints, names, width=0.04):
    """Distance to a limb's centre line and its bone shares (see shraps.limb)."""
    d, along = C._polyline_closest(Q, pts)
    shares = {}
    ends = [C.np_smoothstep(j - width, j + width, along) for j in joints]
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
        if kind != "body":
            W[lo:hi, names.index(kind)] = 1
            continue
        Q = P[lo:hi]
        dists, parts = [torso_sdf(Q)], [{"body": np.ones(len(Q))}]
        for i in range(len(STALKS)):
            a, b = stalk_line(i)
            d, along = C._polyline_closest(Q, [a, b])
            u = C.np_smoothstep(0.02, 0.12, along)
            dists.append(d - STALK_R0)
            parts.append({"body": 1 - u, f"stalk{i}": u})
        for s, sign in SIDES:
            pts = leg_line(s) + [AXLES[s]]
            d, along = C._polyline_closest(Q, pts)
            L = arc(leg_line(s))[-1]
            u = C.np_smoothstep(0.3 * L, 0.95 * L, along)       # the top third rides with the body
            dists.append(d - LEG_R1)
            parts.append({"body": 1 - u, f"axle.{s}": u})
            root, sh, el, w = arm_points(s)
            line = [root, sh, el, w, w + V((0, 0, -0.15))]
            Lr = arc(line)
            d, shares = limb(Q, line, (Lr[1], Lr[2], Lr[3]), ("body", f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"), 0.04)
            dists.append(d - ARM_R)
            parts.append(shares)
            dists.append(fingers_sdf(Q, s))
            parts.append({f"hand.{s}": np.ones(len(Q))})
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
    for name, roughness in (("SpicyBody", 0.45), ("SpicyTire", 0.8), ("SpicyEyes_glow", 0.25)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
UPPER = {s: (arm_points(s)[2] - arm_points(s)[1]).normalized() for s, _ in SIDES}
LOWER = {s: (arm_points(s)[3] - arm_points(s)[2]).normalized() for s, _ in SIDES}
HAND = V((0, 0, -1))


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "pivot": PELVIS.copy(),
         "planted": 1.0,                                      # 1: axles on the ground, 0: ride with the body
         "stalks": [(0.0, 0.0)] * len(STALKS),                # (side, forward) sway of each stalk
         "arms": {s: (0.0, 0.0, 0.0, 0.0) for s, _ in SIDES},  # lift, swing forward, elbow bend, hand flex
         "eyes": {s: EYES[s].copy() for s, _ in SIDES},       # world (they float)
         "look": (0.0, 0.0), "glow": 1.0}
    p.update(kw)
    return p


def arm_dirs(s, lift, swing, bend):
    sign = 1 if s == "L" else -1
    R = C.rot_y(-sign * lift) @ C.rot_z(-sign * swing)
    Rl = R @ C.rot_y(-sign * bend)
    return R @ UPPER[s], Rl @ LOWER[s]


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        body = L @ K.about(p["pivot"], R) @ Matrix.Translation(PELVIS + p["pos"]) @ skel.rest_rot["body"].to_4x4()
        bases["body"] = skel.set("body", poses, body)
        delta = body @ skel.rest["body"].inverted()
        d3 = delta.to_3x3()
        q = d3.to_quaternion()
        for i in range(len(STALKS)):
            a, b = stalk_line(i)
            sx, sy = p["stalks"][i]
            bases[f"stalk{i}"] = skel.aim(f"stalk{i}", poses, d3 @ (C.rot_y(sx) @ C.rot_x(sy) @ (b - a)))
        e = max(0.05, p["glow"])
        ly, lp = p["look"]
        for s, sign in SIDES:
            look = (C.rot_z(ly) @ C.rot_x(lp)).to_4x4()
            eye = Matrix.Translation(L @ p["eyes"][s]) @ look @ skel.rest_rot[f"eye.{s}"].to_4x4() @ Matrix.Diagonal((e, e, e, 1))
            bases[f"eye.{s}"] = skel.set(f"eye.{s}", poses, eye)
            k = p["planted"]
            at = (L @ AXLES[s]).lerp(delta @ AXLES[s], 1 - k)
            rot = Quaternion().slerp(q, 1 - k).to_matrix()
            bases[f"axle.{s}"] = skel.set(f"axle.{s}", poses, Matrix.Translation(at) @ (rot @ skel.rest_rot[f"axle.{s}"]).to_4x4())
            bases[f"wheel.{s}"] = K.pose_local(skel, f"wheel.{s}", poses, Matrix.Identity(4))
            lift_a, swing, bend, flex = p["arms"][s]
            u, l = arm_dirs(s, lift_a, swing, bend)
            bases[f"arm_upper.{s}"] = skel.aim(f"arm_upper.{s}", poses, d3 @ u)
            bases[f"arm_lower.{s}"] = skel.aim(f"arm_lower.{s}", poses, d3 @ l)
            h = C.rot_y(-sign * (bend + lift_a) * 0.5) @ C.rot_x(flex) @ HAND
            bases[f"hand.{s}"] = skel.aim(f"hand.{s}", poses, d3 @ h)
        return bases
    return solve


def floating(t, s, amp=1.0):
    """The eyes' own bob (whole multiples of the loop, out of step with each other)."""
    w = TAU * t / LOOP_T
    k = 0 if s == "L" else 1
    return V((0.008 * math.sin(w + 1 + 2 * k), 0.01 * math.sin(w + 0.4 * k), 0.022 * math.sin(2 * w + 0.5 + 1.9 * k))) * amp


def roll(f):
    t = f / FPS
    w = TAU * f / WALK_FRAMES
    stalks = [(D(6) * math.sin(w - 0.8 - 0.35 * i), D(-4) + D(3) * math.sin(2 * w - 1.2 - 0.4 * i)) for i in range(len(STALKS))]
    arms = {s: (D(4) + D(5) * math.sin(w + (0 if s == "L" else math.pi)), D(10) * math.sin(w + (0 if s == "L" else math.pi)),
                D(6) * math.sin(w - 0.6), D(8) * math.sin(w + 1.3)) for s, _ in SIDES}
    lean = V((0, -0.01, 0))
    eyes = {s: EYES[s] + lean + floating(t, s) + V((0.012 * math.sin(w - 0.5), 0, 0)) for s, _ in SIDES}
    return params(t=t, pos=V((0.012 * math.sin(w), 0, -0.004 + 0.01 * math.cos(2 * w))), pitch=D(4),
                  roll=D(4) * math.sin(w), yaw=D(2) * math.sin(w + 0.5), stalks=stalks, arms=arms, eyes=eyes,
                  look=(D(4) * math.sin(w), 0))


def laser(f):
    k, t = C.keyframes, f / FPS
    fire, hit = BEAM_FRAME / FPS, LASER_HIT / FPS
    r0, r1, _ = RETREAT
    u = C.smoothstep(r0, r1, t)
    env = math.sin(math.pi * min(1, max(0, (t - r0) / (r1 - r0)))) ** 0.7     # the sway lives in the retreat
    beam = 1 if fire <= t < hit else 0
    tremble = beam * math.sin(TAU * 13 * t)
    after = t - hit
    jolt = math.exp(-7 * after) * math.sin(TAU * 2.2 * after) if after > 0 else 0
    sway = math.sin(TAU * 2 * u)
    roll_a = D(12) * sway * env + D(1.5) * tremble
    yaw = D(7) * math.sin(TAU * 2 * u + 0.9) * env
    pitch = D(k((0, 4), (0.2, 10), (0.5, 2), (0.75, -6), (0.88, 10), (fire, 8), (hit, 9), (hit + 0.1, -12), (1.9, 4))(t)) + D(3) * jolt
    pos = V((0.02 * sway * env, k((0, 0), (0.75, 0), (0.85, -0.02), (hit, -0.02), (hit + 0.1, 0.05), (1.9, 0))(t),
             k((0, 0), (0.12, -0.03), (0.4, 0.0), (0.8, -0.035), (hit, -0.03), (hit + 0.12, 0.01), (1.9, 0))(t)))
    stalks = [(D(14) * math.sin(TAU * 2 * u - 0.9 - 0.3 * i) * env + D(3) * tremble * (-1) ** i,
               D(k((0, -4), (0.3, -14), (0.75, 8), (0.9, -6), (hit, -4), (hit + 0.1, 16), (1.9, -4))(t))) for i in range(len(STALKS))]
    arms = {}
    for s, sign in SIDES:
        flail = math.sin(TAU * 2 * u + (0 if s == "L" else math.pi)) * env
        lift = D(k((0, 4), (0.3, 24), (0.75, 20), (0.9, 38), (hit, 40), (hit + 0.1, 52), (1.9, 4))(t)) + D(16) * flail + D(3) * tremble
        swing = D(k((0, 0), (0.4, -12), (0.75, -8), (0.9, 14), (hit, 12), (hit + 0.12, -14), (1.9, 0))(t))
        bend = D(k((0, 0), (0.4, 10), (0.9, -8), (hit, -8), (hit + 0.1, 16), (1.9, 0))(t))
        flex = D(k((0, 0), (0.4, 20), (0.9, -25), (hit, -25), (hit + 0.15, 30), (1.9, 0))(t))
        arms[s] = (lift, swing, bend, flex)
    # the eyes trail the body as it rolls back, then rise and stare
    rise = k((0, 0), (0.75, 0), (fire, 0.06), (hit, 0.07), (hit + 0.15, 0.02), (1.9, 0))(t)
    back = -0.09 * math.sin(math.pi * min(1, max(0, (t - r0) / (r1 - r0 + 0.25))))
    eyes = {s: EYES[s] + floating(t, s, 1 - 0.9 * beam) + V((0.02 * sway * env, back + 0.04 * max(0, jolt), rise)) for s, _ in SIDES}
    glow = k((0, 1), (0.75, 1), (fire, 1.25), (hit - 0.05, 1.3), (hit, 1.38), (hit + 0.12, 0.95), (1.9, 1))(t)
    glow += 0.04 * beam * math.sin(TAU * 17 * t)
    return params(t=t, pos=pos, pitch=pitch, roll=roll_a, yaw=yaw, stalks=stalks, arms=arms, eyes=eyes,
                  look=(D(5) * sway * env, D(k((0, 0), (0.75, 0), (fire, -6), (hit, -6), (1.9, 0))(t))), glow=glow)


def death(f):
    k, t = C.keyframes, f / FPS
    shudder = math.sin(TAU * 9 * t) * (1 - C.smoothstep(0.1, 0.5, t))
    fall = k((0, 0), (0.35, 0.05), (0.95, 1), (1.08, 0.94), (1.25, 1))(t)
    limp = C.smoothstep(0.6, 1.4, t)
    stalks = [(D(10) * shudder * (-1) ** i + D(18) * limp * (i - 1.5) / 1.5, D(-25) * limp) for i in range(len(STALKS))]
    arms = {s: (D(k((0, 4), (0.35, 40), (1.0, 10), (1.5, -20))(t)), D(k((0, 0), (0.35, -10), (1.2, 25))(t)),
                D(30) * limp, D(35) * limp) for s, _ in SIDES}
    eyes = {}
    for s, sign in SIDES:
        e = EYES[s]
        drop = k((0, 0), (0.3, -0.03), (0.62, -(e.z - EYE_R * 0.8)), (0.76, -(e.z - EYE_R * 0.8) + 0.09),
                 (0.9, -(e.z - EYE_R * 0.8)), (0.98, -(e.z - EYE_R * 0.8) + 0.025), (1.06, -(e.z - EYE_R * 0.8)))(t)
        out = V((sign * 0.16, -0.12 - 0.05 * sign, 0)) * C.smoothstep(0.3, 1.5, t)
        eyes[s] = e + out + V((0, 0, drop))
    return params(t=t, pos=V((0, 0, 0)), pivot=V((0, 0.05, WHEEL_R)),
                  pitch=D(-6) * C.smoothstep(0, 0.35, t) * (1 - fall) - D(96) * fall, roll=D(6) * fall + D(3) * shudder,
                  planted=1 - C.smoothstep(0.35, 0.7, t), stalks=stalks, arms=arms, eyes=eyes,
                  look=(0, D(50) * C.smoothstep(0.5, 1.2, t)), glow=k((0, 1), (0.6, 1), (1.6, 0.7))(t))


def eye_point(rig, action, frame):
    """Armature-space midpoint between the eyes (= the laser's muzzle)."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    return (rig.matrix_world @ rig.pose.bones["eye.L"].head + rig.matrix_world @ rig.pose.bones["eye.R"].head) / 2


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SpicyRoll", solver(rig, roll), WALK_FRAMES, cyclic=True,
                  extras={"speed": WALK_SPEED, "wheel_radius": WHEEL_R})
    r0, r1, dist = RETREAT
    act = K.ground_clip(rig, obj, "SpicyLaser", solver(rig, laser), LASER_FRAMES,
                        extras={"attack_style": "laser", "hit_frame": LASER_HIT, "hit_time": LASER_HIT / FPS,
                                "beam_frame": BEAM_FRAME, "retreat_from": r0, "retreat_to": r1, "retreat": dist})
    act.pose_markers.new("Beam").frame = BEAM_FRAME
    act.pose_markers.new("Burst").frame = LASER_HIT
    m = eye_point(rig, "SpicyLaser", BEAM_FRAME)
    act["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    K.ground_clip(rig, obj, "SpicyDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.6}, settle_from=round(1.3 * FPS))
    K.register(rig, CLIPS)
    return list(act["muzzle"])


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
    shots = [("SpicyRoll", 0, (2.2, -5.0, 2.2)), ("SpicyRoll", 10, (-4.5, -2.5, 2.0)),
             ("SpicyLaser", 14, (4.6, -1.6, 2.0)), ("SpicyLaser", 36, (0.6, -5.5, 1.6)),
             ("SpicyLaser", LASER_HIT + 3, (3.5, -4.0, 1.8)), ("SpicyDeath", DEATH_FRAMES, (3.5, -4.0, 2.6))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 0.62), size=360, cols=3)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    K.decimate(obj)
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("SpicyDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "Spicy", STAGE, (0, 0, 0.65), 2.2)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Spicy", NAME, (0, 0, 0.65), 3.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Spicy:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "spicy.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "spicy.blend"),
         preview_path=args[2] if len(args) > 2 else None)
