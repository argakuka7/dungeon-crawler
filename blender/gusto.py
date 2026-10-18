"""
Gusto: the first real boss, from the kids' whiteboard sketch.

A big round, white-grey head with an angry face floats above the floor: a V of dark brows
over two glowing red eyes, and a wide grin full of jagged teeth (the upper row points down,
the lower row up, and they interlock). Two long, thin arms come out of its sides and end in
four dark claws. Eight thin tentacles hang from its underside: they are not legs, it floats,
and they never touch the floor. Faces -Y in Blender, +Z up; one unit = one game cell, about
2.2 cells tall.

The tentacles move like crazy: the clips only sway them, and the game shakes every tentacle
bone on top of whatever clip plays (`flail` on the profile, render/enemies.js).

Rig: root, body (the head and its face), per side arm_upper / arm_lower / hand, and three
bones per tentacle (tentacle<i>_0..2, top to tip). The arms and tentacles hang from the root,
not from the body: the clips aim them in armature space (IK for the arms).

Clips, 30 fps, in place (the game supplies root motion):
    GustoFloat   48-frame loop: hovering, bobbing and rocking, the arms swaying and the
                 tentacles waving. Played on time (the profile `hover`s).
    GustoGrab    2.2 s: spreads its arms wide and leans back, lunges and catches at frame 22
                 (extras.hit_frame), lifts what it caught high in front of its face, then
                 throws it down in front of itself at frame 46 (extras.throw_frame).
                 extras.grip: where the caught body is held, every second frame from the catch
                 to the throw (game x, up, forward).
    GustoSummon  1.6 s: rears back with its arms up, then lurches forward and spits at frame
                 27 (extras.hit_frame) from its mouth (extras.muzzle).
    GustoBlow    2.1 s: brings both hands up in front of its mouth, breathes in (swelling,
                 from extras.inhale_frame), and at frame 30 (extras.hit_frame) blows a vortex
                 through its hands (extras.muzzle) until extras.gust_end.
    GustoDeath   2.2 s: shudders, the tentacles go limp, it sinks to the floor and flattens,
                 the tentacles splayed round it and the arms flopped beside it. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, gusto; importlib.reload(creature); importlib.reload(gusto)
    gusto.main(export_path="<repo>/assets/gusto.glb", blend_path="<repo>/blender/gusto.blend")

Headless:
    Blender -b --python blender/gusto.py -- assets/gusto.glb blender/gusto.blend \
        blender/previews/gusto-preview.png
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

NAME, RIG_NAME = "Gusto", "GustoRig"
SCENE, COLLECTION, STAGE = "Gusto", "GustoAsset", "GustoStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("GustoFloat", "GustoGrab", "GustoSummon", "GustoBlow", "GustoDeath")

BODY_HEX, LIMB_HEX, TENTACLE_HEX = "#c9cdd5", "#aeb3bd", "#bcc1ca"
CLAW_HEX, EYE_HEX, PUPIL_HEX = "#474b54", "#ff2418", "#1a0606"
BROW_HEX, MOUTH_HEX, TEETH_HEX = "#2b2e35", "#3a0a10", "#fbf7ee"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("GustoBody", BODY_HEX, 0), ("GustoLimbs", LIMB_HEX, 0), ("GustoTentacles", TENTACLE_HEX, 0),
             ("GustoClaws", CLAW_HEX, 0), ("GustoEyes_glow", EYE_HEX, 2.4), ("GustoPupils", PUPIL_HEX, 0),
             ("GustoBrows", BROW_HEX, 0), ("GustoMouth", MOUTH_HEX, 0), ("GustoTeeth", TEETH_HEX, 0))
BODY_M, LIMB_M, TENT_M, CLAW_M, EYE_M, PUPIL_M, BROW_M, MOUTH_M, TEETH_M = range(len(MATERIALS))

VOXEL, DETAIL, FINE = 0.016, 0.0075, 0.0045
FLOAT_FRAMES, FLOAT_SPEED = 48, 0.6
GRAB_FRAMES, GRAB_HIT, GRAB_THROW = 66, 22, 46
SUMMON_FRAMES, SUMMON_HIT = 48, 27
BLOW_FRAMES, BLOW_HIT, GUST_END, INHALE = 63, 30, 48, 9
DEATH_FRAMES = 66
LOOP_T = FLOAT_FRAMES / FPS

# --- body plan -----------------------------------------------------------------
BODY_C = V((0, 0, 1.55))
BODY_R = (0.62, 0.56, 0.6)
PIVOT = V((0, 0, 1.3))                  # the head turns about a point a little below its middle

ARM_R0, ARM_R1 = 0.05, 0.038
ARM_TOP = {s: V((sign * 0.42, -0.02, 1.62)) for s, sign in SIDES}      # hidden in the head
SHOULDER = {s: V((sign * 0.58, -0.02, 1.6)) for s, sign in SIDES}
ELBOW = {s: V((sign * 1.08, -0.08, 1.46)) for s, sign in SIDES}
WRIST = {s: V((sign * 1.42, -0.16, 1.07)) for s, sign in SIDES}
CLAWS = (-0.8, -0.27, 0.27, 0.8)          # the fan of its four claws

TENTACLES = 8
TENT_SEGS = 3
TENT_RING = 0.33
TENT_ANGLE = [math.pi / 2 + TAU * (i + 0.5) / TENTACLES for i in range(TENTACLES)]   # 0: in front
TENT_TOP = [V((TENT_RING * math.cos(a), -TENT_RING * math.sin(a), 1.12)) for a in TENT_ANGLE]
TENT_TIP = [V((0.5 * math.cos(a), -0.5 * math.sin(a), 0.16)) for a in TENT_ANGLE]
TENT_RADII = (0.062, 0.048, 0.033, 0.015)


def body_sdf(P):
    return K.ellipsoid(P, BODY_C, BODY_R)


def front_y(x, z):
    """y of the head's front surface (-Y side) at (x, z)."""
    u = 1 - (x / BODY_R[0]) ** 2 - ((z - BODY_C.z) / BODY_R[2]) ** 2
    return -BODY_R[1] * math.sqrt(max(0.0, u))


def on_face(x, z, sink=0.0):
    return V((x, front_y(x, z) + sink, z))


EYES = {s: on_face(sign * 0.19, 1.73, 0.03) for s, sign in SIDES}
EYE_RADII = (0.08, 0.05, 0.11)
PUPILS = {s: on_face(sign * 0.17, 1.69, -0.022) for s, sign in SIDES}
PUPIL_RADII = (0.032, 0.022, 0.046)
# the angry V: from high above the outer corner of each eye down to the middle
BROWS = {s: [on_face(sign * (0.35 - 0.31 * u), 1.94 - 0.13 * u, -0.012) for u in np.linspace(0, 1, 7)] for s, sign in SIDES}
MOUTH_Z, MOUTH_W, MOUTH_H, MOUTH_CURVE = 1.36, 0.42, 0.09, 0.07


def mouth_centre(x):
    return MOUTH_Z + MOUTH_CURVE * (x / MOUTH_W) ** 2


def mouth_half(x):
    return MOUTH_H * math.sqrt(max(0.0, 1 - (x / (MOUTH_W + 0.02)) ** 2)) + 0.012


def mouth_sdf(P):
    """A thin dark patch lying on the face: the open grin."""
    x, z = P[..., 0], P[..., 2]
    zc = MOUTH_Z + MOUTH_CURVE * (x / MOUTH_W) ** 2
    hh = MOUTH_H * np.sqrt(np.clip(1 - (x / (MOUTH_W + 0.02)) ** 2, 0, 1)) + 0.012
    band = np.maximum(np.abs(z - zc) - hh, np.abs(x) - MOUTH_W)
    shell = np.abs(body_sdf(P) - 0.004) - 0.009
    return np.maximum(np.maximum(shell, band), P[..., 1] + 0.15)


def teeth():
    """(base, tip, radius) of every tooth: the upper row points down, the lower row up, in
    between each other."""
    out = []
    for x in np.linspace(-0.35, 0.35, 8):
        hh = mouth_half(x)
        top = mouth_centre(x) + hh * 0.9
        out.append((on_face(x, top, -0.008), on_face(x, top - hh * 1.45, -0.012), 0.033))
    for x in np.linspace(-0.3, 0.3, 7):
        hh = mouth_half(x)
        bottom = mouth_centre(x) - hh * 0.9
        out.append((on_face(x, bottom, -0.008), on_face(x, bottom + hh * 1.3, -0.012), 0.03))
    return out


MUZZLE_REST = on_face(0, MOUTH_Z, -0.06)      # where it spits from


def hand_frame(s):
    """The hand's direction and the outward way its claws fan (rest)."""
    sign = 1 if s == "L" else -1
    a = (WRIST[s] - ELBOW[s]).normalized()
    side = V((0, -1, 0))
    return a, (side - a * side.dot(a)).normalized()


def claw_points(s):
    a, perp = hand_frame(s)
    curl = a.cross(perp).normalized() * (1 if s == "L" else -1)
    base = WRIST[s] + a * 0.06
    out = []
    for ang in CLAWS:
        d = a * math.cos(ang) + perp * math.sin(ang)
        mid = base + d * 0.1 + curl * 0.012
        tip = mid + d * 0.08 + curl * 0.05
        out.append((base, mid, tip))
    return out


def arm_sdf(P, s):
    return K.tapered_tube(P, [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], [ARM_R0, ARM_R0, (ARM_R0 + ARM_R1) / 2, ARM_R1])


def hand_sdf(P, s):
    a, _ = hand_frame(s)
    d = K.ellipsoid(P, WRIST[s] + a * 0.045, (0.06, 0.06, 0.06))
    for base, mid, tip in claw_points(s):
        c = np.minimum(K.round_cone(P, base, mid, 0.026, 0.017), K.round_cone(P, mid, tip, 0.017, 0.004))
        d = K.smin(d, c, 0.012)
    return d


def tentacle_points(i):
    return [TENT_TOP[i].lerp(TENT_TIP[i], k / TENT_SEGS) for k in range(TENT_SEGS + 1)]


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = BODY_C - V(BODY_R) - V((0.03,) * 3), BODY_C + V(BODY_R) + V((0.03,) * 3)
    parts.add("body", body_sdf, lo, hi, VOXEL, mat=BODY_M)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add("body", lambda P, c=e: K.ellipsoid(P, c, EYE_RADII), e - V((0.13,) * 3), e + V((0.13,) * 3), FINE, mat=EYE_M)
        p = PUPILS[s]
        parts.add("body", lambda P, c=p: K.ellipsoid(P, c, PUPIL_RADII), p - V((0.07,) * 3), p + V((0.07,) * 3), FINE, mat=PUPIL_M)
        lo, hi = K.bounds(BROWS[s], 0.045)
        parts.add("body", lambda P, pts=BROWS[s]: K.tapered_tube(P, pts, np.linspace(0.03, 0.022, len(pts))), lo, hi, FINE, mat=BROW_M)
    w = MOUTH_W + 0.04
    parts.add("body", mouth_sdf, (-w, -0.62, MOUTH_Z - 0.16), (w, -0.2, MOUTH_Z + 0.24), FINE, mat=MOUTH_M)
    for base, tip, r in teeth():
        lo, hi = K.bounds([base, tip], r + 0.02)
        parts.add("body", lambda P, a=base, b=tip, r=r: K.round_cone(P, a, b, r, 0.004), lo, hi, FINE * 0.8, mat=TEETH_M)
    for s, _ in SIDES:
        lo, hi = K.bounds([ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], 0.07)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=LIMB_M)
        lo, hi = K.bounds([WRIST[s]] + [p for c in claw_points(s) for p in c], 0.08)
        parts.add(f"hand.{s}", lambda P, s=s: hand_sdf(P, s), lo, hi, FINE, mat=CLAW_M)
    for i in range(TENTACLES):
        pts = tentacle_points(i)
        lo, hi = K.bounds(pts, 0.08)
        parts.add(f"tentacle.{i}", lambda P, pts=pts: K.tapered_tube(P, pts, TENT_RADII), lo, hi, DETAIL, mat=TENT_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "gusto"
    obj["body_color"] = BODY_HEX
    obj["eye_color"] = EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def tent_name(i, j):
    return f"tentacle{i}_{j}"


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", PIVOT, PIVOT + V((0, 0, 0.4)), "root", True, fwd)]
    for s, _ in SIDES:
        a, _ = hand_frame(s)
        bones += [(f"arm_upper.{s}", SHOULDER[s], ELBOW[s], "root", True, fwd),
                  (f"arm_lower.{s}", ELBOW[s], WRIST[s], f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], WRIST[s] + a * 0.12, f"arm_lower.{s}", True, fwd)]
    for i in range(TENTACLES):
        pts = tentacle_points(i)
        for j in range(TENT_SEGS):
            bones.append((tent_name(i, j), pts[j], pts[j + 1], tent_name(i, j - 1) if j else "root", True, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "gusto", "forward": "-Y", "attack_style": "boss", "normal_speed": FLOAT_SPEED,
        "tentacles": TENTACLES, "root_motion": False})


def shares(along, bounds, names, width):
    """Bone shares along a chain: names[k] between bounds[k - 1] and bounds[k] (arc length)."""
    past = [C.np_smoothstep(b - width, b + width, along) for b in bounds]    # past bound k
    out = {}
    for k, name in enumerate(names):
        before = past[k - 1] if k else np.ones_like(along)
        after = past[k] if k < len(past) else np.zeros_like(along)
        out[name] = before - after
    return out


def arc(pts):
    return np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        part, s = (kind.split(".") + [""])[:2]
        if part == "body":
            W[lo:hi, names.index("body")] = 1
            continue
        if part == "hand":
            W[lo:hi, names.index(f"hand.{s}")] = 1
            continue
        if part == "arm":
            pts = [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]]
            bones, bounds, width = (f"arm_upper.{s}", f"arm_lower.{s}"), [arc(pts)[2]], 0.06
        else:
            i = int(s)
            pts = tentacle_points(i)
            bones = tuple(tent_name(i, j) for j in range(TENT_SEGS))
            bounds, width = list(arc(pts)[1:TENT_SEGS]), 0.07
        _, along = C._polyline_closest(P[lo:hi], pts)
        WB = np.zeros((hi - lo, len(names)), np.float32)
        for name, share in shares(along, bounds, bones, width).items():
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
    for name, roughness in (("GustoBody", 0.7), ("GustoLimbs", 0.6), ("GustoTentacles", 0.55), ("GustoClaws", 0.4),
                            ("GustoEyes_glow", 0.3), ("GustoPupils", 0.3), ("GustoBrows", 0.6),
                            ("GustoMouth", 0.8), ("GustoTeeth", 0.25)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
REST_DIR = {s: hand_frame(s)[0] for s, _ in SIDES}
REST_ELBOW = {s: V((sign * 1.0, 0.3, 0.2)) for s, sign in SIDES}      # which way the elbows point
TENT_DIR = [(TENT_TIP[i] - TENT_TOP[i]).normalized() for i in range(TENTACLES)]
TENT_LEN = [(TENT_TIP[i] - TENT_TOP[i]).length / TENT_SEGS for i in range(TENTACLES)]


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0),
         "hands": {s: WRIST[s].copy() for s, _ in SIDES},           # armature space
         "dirs": {s: REST_DIR[s].copy() for s, _ in SIDES},         # where the hands point
         "elbows": {s: REST_ELBOW[s].copy() for s, _ in SIDES},
         "wave": (0.0, 1.0),                                         # tentacle wave: time, strength
         "limp": 0.0,                                                # 1: the tentacles splay out flat
         "flat": 0.0}                                                # how far they lie down (death)
    p.update(kw)
    return p


def body_motion(p):
    """The head's rigid move (armature space) and its squash about its middle."""
    R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
    rigid = Matrix.Translation(p["pos"]) @ K.about(PIVOT, R)
    sx, sz = p["squash"]
    return rigid, rigid @ K.about(BODY_C, Matrix.Diagonal((sx, sx, sz)))


def tentacle_dirs(i, p, r3):
    """The directions of tentacle i's three segments (armature space): hanging down and
    flaring out a little, waving (each segment further than the one above), or, dying, splayed
    out round the body."""
    a = TENT_ANGLE[i]
    radial = V((math.cos(a), -math.sin(a), 0))
    tangent = V((math.sin(a), math.cos(a), 0))
    t, amp = p["wave"]
    w = TAU * t / LOOP_T
    dirs, swing_r, swing_t = [], 0.0, 0.0
    for j in range(TENT_SEGS):
        swing_r += amp * (D(7) + D(3) * j) * math.sin(w * 2 + 1.7 * i + 0.9 * j)
        swing_t += amp * (D(4) + D(2) * j) * math.sin(w * 3 + 2.3 * i + 1.1 * j + 0.4)
        base = r3 @ TENT_DIR[i]
        R = Matrix.Rotation(swing_r, 3, r3 @ tangent) @ Matrix.Rotation(swing_t, 3, r3 @ radial)
        d = (R @ base).normalized()
        if p["limp"] > 0:      # splayed out round it, drooping at the tips
            lying = (radial + V((0, 0, -0.18 - 0.22 * j * p["flat"]))).normalized()
            d = d.lerp(lying, p["limp"]).normalized()
        dirs.append(d)
    return dirs


def solver(rig, fn):
    skel = C.Skeleton(rig)
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
        for s, _ in SIDES:
            up, lo, hand = f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"
            shoulder = squashed @ SHOULDER[s]
            elbow, wrist = C.two_bone_ik(shoulder, L @ p["hands"][s], *arm_len[s], r3 @ p["elbows"][s])
            bases[up] = K.aim_at(skel, up, poses, shoulder, elbow - shoulder)
            bases[lo] = K.aim_at(skel, lo, poses, elbow, wrist - elbow)
            bases[hand] = K.aim_at(skel, hand, poses, wrist, p["dirs"][s])
        for i in range(TENTACLES):
            head = squashed @ TENT_TOP[i]
            for j, d in enumerate(tentacle_dirs(i, p, r3)):
                name = tent_name(i, j)
                bases[name] = K.aim_at(skel, name, poses, head, d)
                head = head + d * TENT_LEN[i]
        return bases
    return solve


def at_body(p, v):
    """A point given in the head's own frame, where the head is now (armature space)."""
    return body_motion(p)[0] @ v


# where the hands rest while it floats (in the head's frame)
IDLE_HAND = {s: V((sign * 1.22, -0.26, 1.02)) for s, sign in SIDES}
IDLE_DIR = {s: V((sign * 0.35, -0.25, -1)).normalized() for s, sign in SIDES}


def float_pose(f, t=None):
    w = TAU * f / FLOAT_FRAMES
    p = params(t=f / FPS, pos=V((0.015 * math.sin(w), 0, 0.055 * math.sin(w))),
               pitch=D(4) + D(2) * math.cos(2 * w), roll=D(3) * math.sin(w + 0.5), yaw=D(2) * math.sin(w + 1.2),
               wave=(f / FPS, 1.0))
    for s, sign in SIDES:
        k = 0 if s == "L" else math.pi
        p["hands"][s] = at_body(p, IDLE_HAND[s] + V((sign * 0.03 * math.sin(2 * w + k), 0.07 * math.sin(w + k), 0.05 * math.sin(2 * w + k + 1))))
        p["dirs"][s] = (IDLE_DIR[s] + V((0, 0.25 * math.sin(w + k), 0))).normalized()
    return p


def hover(f):
    return float_pose(f)


def blend(a, b, u):
    """Mix two parameter sets (u: 0 -> a, 1 -> b)."""
    out = dict(a)
    for key in ("pos",):
        out[key] = a[key].lerp(b[key], u)
    for key in ("pitch", "roll", "yaw", "limp", "flat"):
        out[key] = a[key] + (b[key] - a[key]) * u
    out["squash"] = tuple(x + (y - x) * u for x, y in zip(a["squash"], b["squash"]))
    for key in ("hands", "elbows"):
        out[key] = {s: a[key][s].lerp(b[key][s], u) for s, _ in SIDES}
    out["dirs"] = {s: a["dirs"][s].lerp(b["dirs"][s], u).normalized() for s, _ in SIDES}
    return out


def keyed(t, keys):
    """Pose at time t from (time, params) keys, eased between them."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            return blend(a, b, C.smoothstep(t0, t1, t))
    return keys[-1][1]


def pose(base, **kw):
    """A key: the float pose `base` with some things changed; hands given in armature space."""
    p = dict(base)
    for key in ("hands", "dirs", "elbows"):
        if key in kw:
            p[key] = {**base[key], **{s: V(v) for s, v in kw.pop(key).items()}}
    p.update(kw)
    return p


def per_side(fn):
    return {s: fn(s, sign) for s, sign in SIDES}


REST = float_pose(0)


def grab_keys():
    hit, throw = GRAB_HIT / FPS, GRAB_THROW / FPS
    wide = pose(REST, pos=V((0, 0.14, 0.04)), pitch=D(-10), squash=(1.03, 1.02),
                hands=per_side(lambda s, sign: (sign * 1.42, 0.3, 1.78)),
                dirs=per_side(lambda s, sign: (sign * 0.4, -0.6, 0.5)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.4, -0.4)))
    catch = pose(REST, pos=V((0, -0.46, -0.22)), pitch=D(20),
                 hands=per_side(lambda s, sign: (sign * 0.15, -1.32, 0.86)),
                 dirs=per_side(lambda s, sign: (-sign * 0.5, -0.6, -0.4)),
                 elbows=per_side(lambda s, sign: (sign * 1, 0.1, 0.2)))
    lifted = pose(REST, pos=V((0, -0.08, 0.06)), pitch=D(-12), squash=(1.02, 1.02),
                  hands=per_side(lambda s, sign: (sign * 0.14, -0.74, 2.14)),
                  dirs=per_side(lambda s, sign: (-sign * 0.6, -0.4, 0.3)),
                  elbows=per_side(lambda s, sign: (sign * 1, 0.2, -0.3)))
    shake = pose(lifted, pos=V((0.04, -0.06, 0.1)), pitch=D(-15), roll=D(4))
    thrown = pose(REST, pos=V((0, -0.42, -0.18)), pitch=D(24), squash=(0.97, 0.98),
                  hands=per_side(lambda s, sign: (sign * 0.18, -1.26, 0.92)),
                  dirs=per_side(lambda s, sign: (sign * 0.3, -0.8, -0.5)),
                  elbows=per_side(lambda s, sign: (sign * 1, 0.1, 0.3)))
    return [(0, REST), (0.5, wide), (hit - 0.06, pose(wide, pos=V((0, 0.1, 0.02)))), (hit, catch),
            (hit + 0.12, catch), (1.18, lifted), (1.3, shake), (throw - 0.1, pose(lifted, pos=V((0, 0.02, 0.1)), pitch=D(-16))),
            (throw, thrown), (throw + 0.15, thrown), (2.15, REST), (GRAB_FRAMES / FPS, REST)]


GRAB_KEYS = None


def grab(f):
    p = keyed(f / FPS, GRAB_KEYS)
    return {**p, "t": f / FPS, "wave": (f / FPS, 1.3)}


def summon_keys():
    hit = SUMMON_HIT / FPS
    rear = pose(REST, pos=V((0, 0.14, 0.08)), pitch=D(-15), squash=(1.06, 1.05),
                hands=per_side(lambda s, sign: (sign * 1.2, 0.08, 2.22)),
                dirs=per_side(lambda s, sign: (sign * 0.5, 0, 1)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.3, -0.5)))
    spit = pose(REST, pos=V((0, -0.24, -0.06)), pitch=D(18), squash=(0.95, 0.96),
                hands=per_side(lambda s, sign: (sign * 1.28, -0.55, 1.05)),
                dirs=per_side(lambda s, sign: (sign * 0.6, -0.6, -0.4)))
    return [(0, REST), (0.6, rear), (hit - 0.1, pose(rear, pitch=D(-17))), (hit, spit), (hit + 0.2, spit),
            (SUMMON_FRAMES / FPS - 0.05, REST), (SUMMON_FRAMES / FPS, REST)]


SUMMON_KEYS = None


def summon(f):
    p = keyed(f / FPS, SUMMON_KEYS)
    return {**p, "t": f / FPS, "wave": (f / FPS, 1.3)}


def blow_keys():
    hit, end = BLOW_HIT / FPS, GUST_END / FPS
    hands = dict(hands=per_side(lambda s, sign: (sign * 0.12, -0.8, 1.38)),
                 dirs=per_side(lambda s, sign: (-sign * 0.45, -1, 0.1)),
                 elbows=per_side(lambda s, sign: (sign * 1, 0.2, -0.3)))
    up = pose(REST, **hands)
    breathe = pose(REST, pos=V((0, 0.1, 0.04)), pitch=D(-8), squash=(1.1, 1.08),
                   **dict(hands=per_side(lambda s, sign: (sign * 0.12, -0.74, 1.42)),
                          dirs=hands["dirs"], elbows=hands["elbows"]))
    blowing = pose(REST, pos=V((0, -0.12, -0.02)), pitch=D(9), squash=(0.94, 0.96),
                   **dict(hands=per_side(lambda s, sign: (sign * 0.12, -0.88, 1.36)),
                          dirs=hands["dirs"], elbows=hands["elbows"]))
    return [(0, REST), (0.3, up), (hit - 0.06, breathe), (hit + 0.06, blowing), (end, pose(blowing, pitch=D(7))),
            (BLOW_FRAMES / FPS - 0.05, REST), (BLOW_FRAMES / FPS, REST)]


BLOW_KEYS = None


def blow(f):
    t = f / FPS
    p = keyed(t, BLOW_KEYS)
    hit, end = BLOW_HIT / FPS, GUST_END / FPS
    flutter = math.sin(TAU * 9 * t) if hit <= t < end else 0.0
    return {**p, "t": t, "roll": p["roll"] + D(1.5) * flutter, "wave": (t, 1.0 + (0.8 if hit <= t < end else 0))}


def death(f):
    k, t = C.keyframes, f / FPS
    shudder = math.sin(TAU * 10 * t) * (1 - C.smoothstep(0.15, 0.5, t))
    fall = C.smoothstep(0.35, 1.0, t) ** 1.5
    since = max(0.0, t - 1.0)
    wobble = math.exp(-since * 6) * math.cos(TAU * 2.2 * since) if t > 1.0 else 0.0
    landed = C.smoothstep(0.95, 1.05, t)
    p = params(t=t, pos=V((0.02 * shudder, 0.1 * fall, -0.82 * fall)), pitch=D(-14) * fall, roll=D(5) * shudder + D(6) * landed,
               squash=(1 + landed * (0.06 + 0.05 * wobble), 1 - landed * (0.12 + 0.08 * wobble)),
               wave=(t, 1.2 * (1 - C.smoothstep(0.1, 0.9, t))), limp=C.smoothstep(0.3, 1.0, t), flat=landed)
    for s, sign in SIDES:
        flail = C.smoothstep(0.0, 0.3, t) * (1 - C.smoothstep(0.4, 0.9, t))
        up = V((sign * 1.3, -0.2, 2.0))
        floor = V((sign * 1.25, -0.35, 0.12))
        p["hands"][s] = REST["hands"][s].lerp(up, flail).lerp(floor, C.smoothstep(0.45, 1.05, t))
        p["dirs"][s] = REST["dirs"][s].lerp(V((sign * 0.8, -0.4, -0.2)), C.smoothstep(0.45, 1.05, t)).normalized()
        p["elbows"][s] = V((sign * 0.4, 0.2, 1))
    return p


def hand_points(rig, action, frame):
    """Armature-space wrists and hand directions at a frame."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    out = []
    for s, _ in SIDES:
        pb = rig.pose.bones[f"hand.{s}"]
        out.append((rig.matrix_world @ pb.head, (rig.matrix_world.to_3x3() @ (pb.tail - pb.head)).normalized()))
    return out


def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def grip_point(rig, frame):
    (a, da), (b, db) = hand_points(rig, "GustoGrab", frame)
    return (a + b) / 2 + (da + db).normalized() * 0.07


def between_hands(rig, action, frame, ahead):
    (a, _), (b, _) = hand_points(rig, action, frame)
    return (a + b) / 2 + V((0, -ahead, 0))


def mouth_point(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    body = rig.pose.bones["body"]
    delta = body.matrix @ rig.data.bones["body"].matrix_local.inverted()
    return rig.matrix_world @ delta @ MUZZLE_REST


def animate(rig, obj):
    global GRAB_KEYS, SUMMON_KEYS, BLOW_KEYS
    GRAB_KEYS, SUMMON_KEYS, BLOW_KEYS = grab_keys(), summon_keys(), blow_keys()
    rig.animation_data_create()
    K.ground_clip(rig, obj, "GustoFloat", solver(rig, hover), FLOAT_FRAMES, cyclic=True, extras={"speed": FLOAT_SPEED})
    g = K.ground_clip(rig, obj, "GustoGrab", solver(rig, grab), GRAB_FRAMES,
                      extras={"attack_style": "grab", "hit_frame": GRAB_HIT, "hit_time": GRAB_HIT / FPS,
                              "throw_frame": GRAB_THROW, "throw_time": GRAB_THROW / FPS})
    g.pose_markers.new("Catch").frame = GRAB_HIT
    g.pose_markers.new("Throw").frame = GRAB_THROW
    s = K.ground_clip(rig, obj, "GustoSummon", solver(rig, summon), SUMMON_FRAMES,
                      extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    s.pose_markers.new("Spit").frame = SUMMON_HIT
    b = K.ground_clip(rig, obj, "GustoBlow", solver(rig, blow), BLOW_FRAMES,
                      extras={"attack_style": "vortex", "hit_frame": BLOW_HIT, "hit_time": BLOW_HIT / FPS,
                              "gust_end": GUST_END, "inhale_frame": INHALE})
    b.pose_markers.new("Inhale").frame = INHALE
    b.pose_markers.new("Blow").frame = BLOW_HIT
    b.pose_markers.new("Calm").frame = GUST_END
    K.ground_clip(rig, obj, "GustoDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.9}, settle_from=round(1.6 * FPS))
    K.register(rig, CLIPS)
    # the attack points, read off the baked clips
    g["grip"] = [game(grip_point(rig, f)) for f in range(GRAB_HIT, GRAB_THROW + 1, 2)]
    s["muzzle"] = game(mouth_point(rig, "GustoSummon", SUMMON_HIT))
    b["muzzle"] = game(between_hands(rig, "GustoBlow", BLOW_HIT + 2, 0.12))
    return {"grip": [list(v) for v in g["grip"]], "summon": list(s["muzzle"]), "blow": list(b["muzzle"])}


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
    shots = [("GustoFloat", 0, (2.6, -6.0, 2.8)), ("GustoFloat", 16, (-5.4, -3.0, 2.4)),
             ("GustoGrab", 14, (4.0, -5.0, 2.4)), ("GustoGrab", GRAB_HIT, (5.5, -1.5, 2.0)),
             ("GustoGrab", 38, (5.0, -3.0, 2.2)), ("GustoSummon", SUMMON_HIT, (3.0, -5.4, 2.2)),
             ("GustoBlow", BLOW_HIT + 3, (3.5, -5.2, 2.0)), ("GustoDeath", DEATH_FRAMES, (3.4, -4.6, 3.6))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 1.15), size=360, cols=4)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    K.decimate(obj)
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("GustoDeath",))
    report.update(points)
    K.setup_stage(scene, "Gusto", STAGE, (0, 0, 1.15), 3.4)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, FLOAT_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Gusto", NAME, (0, 0, 1.15), 4.4)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Gusto:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "gusto.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "gusto.blend"),
         preview_path=args[2] if len(args) > 2 else None)
