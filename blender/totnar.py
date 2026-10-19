"""
Totnar: the second real boss (the descent guardian of depth 1), from the kids' whiteboard sketch,
and the snapping skull he throws.

Totnar is a tumbleweed: a ball of tangled sticks and a few clumps of dry leaves, with a glowing
red heart (a hexagon of embers in a pentagon of thick sticks) in the middle. Three skulls float
above the ball, not attached to it, side by side and a little out of step; two long stick arms
with twig fingers come out of its sides. Faces -Y in Blender, +Z up; one unit = one game cell,
about 2.4 cells tall with its skulls.

The sticks lie in three layers round the heart: the inner cage (bone `brush`, always there), a
middle shell (`shell1`) and an outer one with the leaves (`shell0`). As he loses his skulls the
shells go with them (the game scales those bones away, render/enemies.js `shed`), so the heart
shows more and more. The game also rolls the ball (`tumble`: the bone `brush`, with the shells and
the heart in it) by the distance it covers, whatever clip plays.

Rig: root, brush (the inner sticks), shell0, shell1, heart (in the brush), per side arm_upper /
arm_lower / hand (from the root, IK), held (a skull in the right hand, scaled away except while it
throws one), and per skull skull<i> with its jaw skull<i>_jaw.

Clips, 30 fps, in place (the game supplies root motion):
    TotnarDrift   48-frame loop: the ball bobs and settles, the skulls bob out of step and clack
                  their jaws, the arms sway. Played on time (the profile `hover`s).
    TotnarThrow   1.4 s: reaches into its sticks with the right hand, pulls out a skull, draws it
                  back over its head and hurls it at frame 24 (extras.hit_frame, extras.muzzle).
    TotnarGloom   1.7 s: spreads its arms high, the ball swells, the skulls rise and gape; at frame
                  27 (extras.hit_frame) it sweeps its arms down: the light changes.
    TotnarSummon  1.6 s: grips its own ball and tears it open, shaking; things pour out of it at
                  frame 27 (extras.hit_frame, extras.muzzle).
    TotnarRoll    3.5 s: crouches, tucks its arms in and pulls its skulls down (the tell, while the
                  game spins the ball faster and faster), rolls from frame 24 (extras.hit_frame,
                  extras.roll_from) to 78 (extras.roll_to), then sits dizzy, wobbling.
    TotnarStorm   1.9 s: raises its arms, the skulls tip their faces up and gape; the lightning
                  strikes at frame 42 (extras.hit_frame); extras.muzzle: above its skulls.
    TotnarDeath   2.2 s: shudders, the skulls drop to the floor, the arms flop and the ball sags
                  into a heap. Held.
    TotnarSkull   (a prop, not a clip): the skull he throws, flying.

The snapping skull (assets/snapskull.glb) is one of the thrown skulls come to life: a skull with
a jaw, no body. Rig: root, skull, jaw. Clips:
    SnapHop       16-frame loop: hops along, jaw chattering.
    SnapBite      0.8 s: crouches, springs forward with its jaw wide and snaps at frame 12.
    SnapDeath     1.0 s: cracks, its jaw drops off and it tips over and sinks. Held.

Headless:
    Blender -b --python blender/totnar.py -- assets/totnar.glb blender/totnar.blend \
        blender/previews/totnar-preview.png assets/snapskull.glb
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

NAME, RIG_NAME = "Totnar", "TotnarRig"
SCENE, COLLECTION, STAGE = "Totnar", "TotnarAsset", "TotnarStage"
SNAP, SNAP_RIG, SNAP_SCENE, SNAP_COLLECTION, SNAP_STAGE = "SnapSkull", "SnapSkullRig", "SnapSkull", "SnapSkullAsset", "SnapSkullStage"
PROP = "TotnarSkull"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("TotnarDrift", "TotnarThrow", "TotnarGloom", "TotnarSummon", "TotnarRoll", "TotnarStorm", "TotnarDeath")
SNAP_CLIPS = ("SnapHop", "SnapBite", "SnapDeath")

STICK_HEX, BARK_HEX, LEAF_HEX = "#8a6440", "#5a3e26", "#7d8a3c"
BONE_HEX, SOCKET_HEX, EYE_HEX = "#efe6cf", "#1c120c", "#ff5a1e"
HEART_HEX, COAL_HEX = "#ff3412", "#3a0c06"
MATERIALS = (("TotnarSticks", STICK_HEX, 0), ("TotnarBark", BARK_HEX, 0), ("TotnarLeaves", LEAF_HEX, 0),
             ("TotnarBone", BONE_HEX, 0.35), ("TotnarSockets", SOCKET_HEX, 0), ("TotnarEyes_glow", EYE_HEX, 2.6),
             ("TotnarHeart_glow", HEART_HEX, 3.2), ("TotnarCoals", COAL_HEX, 0))
STICK_M, BARK_M, LEAF_M, BONE_M, SOCKET_M, EYE_M, HEART_M, COAL_M = range(len(MATERIALS))
SNAP_MATERIALS = (("SnapBone", BONE_HEX, 0.35), ("SnapSockets", SOCKET_HEX, 0), ("SnapEyes_glow", EYE_HEX, 2.6))

SKULL_VOXEL, FINE = 0.011, 0.0055
DRIFT_FRAMES, DRIFT_SPEED = 48, 1.3
THROW_FRAMES, THROW_HIT = 42, 24
GLOOM_FRAMES, GLOOM_HIT = 51, 27
SUMMON_FRAMES, SUMMON_HIT = 48, 27
ROLL_FRAMES, ROLL_FROM, ROLL_TO = 105, 24, 78
STORM_FRAMES, STORM_HIT = 57, 42
DEATH_FRAMES = 66
LOOP_T = DRIFT_FRAMES / FPS
HOP_FRAMES, HOP_SPEED = 16, 2.2
BITE_FRAMES, BITE_HIT = 24, 12
SNAP_DEATH_FRAMES = 30

# --- body plan -----------------------------------------------------------------
BRUSH_C = V((0, 0, 0.86))
LAYERS = {"brush": (0.3, 0.52), "shell1": (0.54, 0.7), "shell0": (0.7, 0.86)}
HEART_C = V((0, -0.04, 0.88))
HEART_R, HEART_DEPTH = 0.2, 0.085

SKULLS = [V((-0.5, 0.06, 1.98)), V((0.0, -0.02, 2.2)), V((0.52, 0.06, 2.09))]
SKULL_SCALE = 1.0
HINGE = V((0, 0.03, -0.09))       # where the jaw turns, from the skull's middle

SHOULDER = {s: V((sign * 0.62, 0.02, 1.16)) for s, sign in SIDES}
ELBOW = {s: V((sign * 1.06, -0.04, 1.02)) for s, sign in SIDES}
WRIST = {s: V((sign * 1.34, -0.14, 0.72)) for s, sign in SIDES}
ARM_START = {s: V((sign * 0.32, 0.02, 1.06)) for s, sign in SIDES}   # hidden in the ball


def rng():
    return np.random.default_rng(20261019)


# --- the skull (Totnar's three, the held and thrown one, the snapping skull) --------------------
def skull_parts(c, k=1.0):
    """(kind, sdf, lo, hi, voxel, material, jaw) of a skull centred at c (its cranium), scale k.
    jaw: the part belongs to the jaw. Materials are indices into (bone, sockets, eyes)."""
    out = []
    cr, face = c + V((0, 0.01, 0.06)) * k, c + V((0, -0.06, -0.035)) * k

    def head(P):
        d = K.ellipsoid(P, cr, (0.19 * k, 0.2 * k, 0.18 * k))
        d = K.smin(d, K.ellipsoid(P, face, (0.15 * k, 0.14 * k, 0.12 * k)), 0.05 * k)
        # cheekbones, a little out at the sides of the face
        for sx in (-1, 1):
            d = K.smin(d, K.ellipsoid(P, c + V((sx * 0.11, -0.08, -0.02)) * k, (0.06 * k, 0.07 * k, 0.05 * k)), 0.03 * k)
        return d
    out.append(("skull", head, c - V((0.24, 0.24, 0.2)) * k, c + V((0.24, 0.24, 0.27)) * k, SKULL_VOXEL * k, 0, False))
    jc = c + V((0, -0.055, -0.175)) * k

    def jaw(P):
        Q = P - np.asarray(jc, np.float32)
        h = np.asarray((0.105 * k, 0.085 * k, 0.06 * k), np.float32)
        q = np.abs(Q) - h
        box = np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(np.max(q, axis=-1), 0) - 0.025 * k
        return box
    out.append(("jaw", jaw, jc - V((0.16, 0.14, 0.12)) * k, jc + V((0.16, 0.14, 0.12)) * k, SKULL_VOXEL * k, 0, True))
    # the mouth: a dark band across the front of the jaw, a row of blunt teeth over it
    gap = c + V((0, -0.163, -0.125)) * k
    out.append(("mouth", lambda P: K.ellipsoid(P, gap, (0.088 * k, 0.014 * k, 0.03 * k)),
                gap - V((0.12, 0.04, 0.06)) * k, gap + V((0.12, 0.04, 0.06)) * k, FINE * k, 1, True))
    for i, x in enumerate(np.linspace(-0.066, 0.066, 5)):
        a, b = c + V((x, -0.17, -0.148)) * k, c + V((x, -0.17, -0.1)) * k
        lo, hi = K.bounds([a, b], 0.035 * k)
        out.append(("tooth", lambda P, a=a, b=b: K.round_cone(P, a, b, 0.014 * k, 0.013 * k), lo, hi, FINE * k, 0, True))
    for sx in (-1, 1):
        s = c + V((sx * 0.075, -0.168, 0.07)) * k
        out.append(("socket", lambda P, s=s: K.ellipsoid(P, s, (0.056 * k, 0.034 * k, 0.062 * k)),
                    s - V((0.08, 0.06, 0.09)) * k, s + V((0.08, 0.06, 0.09)) * k, FINE * k, 1, False))
        e = c + V((sx * 0.072, -0.198, 0.064)) * k
        out.append(("eye", lambda P, e=e: K.ellipsoid(P, e, (0.024 * k, 0.012 * k, 0.026 * k)),
                    e - V((0.04, 0.03, 0.04)) * k, e + V((0.04, 0.03, 0.04)) * k, FINE * k, 2, False))
    n = c + V((0, -0.205, -0.03)) * k
    out.append(("nose", lambda P: K.ellipsoid(P, n, (0.026 * k, 0.018 * k, 0.034 * k)),
                n - V((0.05, 0.04, 0.06)) * k, n + V((0.05, 0.04, 0.06)) * k, FINE * k, 1, False))
    return out


# --- sticks and leaves, made directly (thin tubes are cheaper this way than as fields) ---------
def tube(pts, radii, sides=6):
    """Vertices and quads of a closed tube along pts (a parallel-transported ring per point)."""
    pts = [np.asarray(p, np.float64) for p in pts]
    T = []
    for i in range(len(pts)):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        t = b - a
        T.append(t / np.linalg.norm(t))
    n = np.cross(T[0], (0, 0, 1) if abs(T[0][2]) < 0.9 else (1, 0, 0))
    co = []
    for p, t, r in zip(pts, T, radii):
        n = n - t * np.dot(n, t)
        n /= np.linalg.norm(n)
        b = np.cross(t, n)
        for k in range(sides):
            a = TAU * k / sides
            co.append(p + r * (n * math.cos(a) + b * math.sin(a)))
    quads = []
    for i in range(len(pts) - 1):
        for k in range(sides):
            j = (k + 1) % sides
            quads.append((i * sides + k, i * sides + j, (i + 1) * sides + j, (i + 1) * sides + k))
    last = (len(pts) - 1) * sides
    if sides == 6:
        quads += [(3, 2, 1, 0), (0, 5, 4, 3), (last, last + 1, last + 2, last + 3), (last + 3, last + 4, last + 5, last)]
    elif sides == 4:
        quads += [(3, 2, 1, 0), (last, last + 1, last + 2, last + 3)]
    return np.asarray(co, np.float32), np.asarray(quads, np.int32)


def leaf(base, d, nrm, length, width):
    """A curled leaf: a midrib from `base` along `d`, lying across `nrm` (its outer side)."""
    d, nrm = np.asarray(d, np.float64), np.asarray(nrm, np.float64)
    side = np.cross(nrm, d)
    side /= np.linalg.norm(side)
    co = []
    for u in (0, 0.25, 0.5, 0.75, 1.0):
        w = width * math.sin(math.pi * min(1.0, u * 1.08)) ** 0.8
        mid = np.asarray(base) + d * length * u + nrm * (0.05 * length * u * u)     # curling out at the tip
        co += [mid - side * w, mid + nrm * w * 0.18, mid + side * w]
    quads = []
    for i in range(4):
        a = i * 3
        quads += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
    return np.asarray(co, np.float32), np.asarray(quads, np.int32)


def add_raw(parts, kind, co, quads, mat, **meta):
    parts.co.append(co)
    parts.quads.append(quads + parts.n)
    parts.mats.append(np.full(len(quads), mat, np.int32))
    parts.owners.append(dict(kind=kind, lo=parts.n, hi=parts.n + len(co), **meta))
    parts.n += len(co)


def unit(v):
    v = np.asarray(v, np.float64)
    return v / np.linalg.norm(v)


def frame_of(n):
    n = unit(n)
    u = unit(np.cross(n, (0.3, 0.5, 0.8)))
    return u, np.cross(n, u)


FRONT = np.array((0, -1, 0.15))
FRONT = FRONT / np.linalg.norm(FRONT)


def arc_stick(R, lo, hi, avoid_front=0.0):
    """A stick curving round the heart between radii lo and hi: an arc of a tilted circle,
    wobbling in and out a little. avoid_front: keep the arc's middle out of a window this wide
    (a cosine) in front of the heart, so it shows."""
    for _ in range(40):
        axis = unit(R.normal(size=3))
        u, v = frame_of(axis)
        a0, span = R.uniform(0, TAU), R.uniform(D(55), D(120))
        mid = u * math.cos(a0 + span / 2) + v * math.sin(a0 + span / 2)
        if avoid_front and np.dot(mid, FRONT) > 1 - avoid_front:
            continue
        r, wob, ph = R.uniform(lo, hi), R.uniform(0.02, 0.05), R.uniform(0, TAU)
        n = 9
        pts = []
        for i in range(n):
            a = a0 + span * i / (n - 1)
            dirn = u * math.cos(a) + v * math.sin(a)
            rr = r * (1 + wob * math.sin(3 * a + ph))
            pts.append(np.asarray(BRUSH_C) + dirn * rr + axis * 0.03 * math.sin(2 * a + ph))
        if min(p[2] for p in pts) < 0.08:
            continue
        thick = R.uniform(0.022, 0.032)
        radii = [thick * (1 - 0.45 * abs(2 * i / (n - 1) - 1) ** 1.5) for i in range(n)]
        return pts, radii
    return None


def twig_from(R, pts, out=True):
    """A short twig forking off a stick (the crosses in the sketch)."""
    i = int(R.integers(2, len(pts) - 2))
    p = np.asarray(pts[i])
    along = unit(np.asarray(pts[i + 1]) - np.asarray(pts[i - 1]))
    radial = unit(p - np.asarray(BRUSH_C))
    d = unit(radial * (0.9 if out else 0.3) + unit(np.cross(along, radial)) * R.uniform(-0.9, 0.9) + along * R.uniform(-0.3, 0.3))
    length = R.uniform(0.12, 0.22)
    end = p + d * length
    if end[2] < 0.06:
        return None
    return [p, p + d * length * 0.5, end], [0.014, 0.011, 0.006]


def build_mesh(coll):
    parts = K.Parts()
    R = rng()
    # the skulls (SDF), each with its jaw
    for i, c in enumerate(SKULLS):
        for kind, sdf, lo, hi, voxel, mat, jaw in skull_parts(c, SKULL_SCALE):
            parts.add(f"jaw.{i}" if jaw else f"skull.{i}", sdf, lo, hi, voxel, mat=(BONE_M, SOCKET_M, EYE_M)[mat])
    # the skull in the right hand (scaled away but while it throws)
    held = held_rest()
    for kind, sdf, lo, hi, voxel, mat, jaw in skull_parts(held, 0.8):
        if kind in ("skull", "jaw", "socket", "eye"):
            parts.add("held", sdf, lo, hi, voxel * 1.3, mat=(BONE_M, SOCKET_M, EYE_M)[mat])
    # the heart: a glowing hexagon of embers, coals dotted on its face
    hc = np.asarray(HEART_C, np.float32)

    def heart(P):
        Q = P - hc
        x, y, z = np.abs(Q[..., 0]), Q[..., 1], np.abs(Q[..., 2])
        hexd = np.maximum(x * 0.8660254 + z * 0.5, z) - HEART_R * 0.866     # a hexagon in the x/z plane
        q = np.stack([hexd, np.abs(y) - HEART_DEPTH], axis=-1)
        return np.minimum(np.max(q, axis=-1), 0) + np.linalg.norm(np.maximum(q, 0), axis=-1) - 0.03
    lo, hi = HEART_C - V((0.28, 0.16, 0.28)), HEART_C + V((0.28, 0.16, 0.28))
    parts.add("heart", heart, lo, hi, 0.009, mat=HEART_M)
    for x, z, r in ((-0.07, 0.06, 0.03), (0.06, 0.08, 0.026), (0.02, -0.06, 0.034), (-0.08, -0.07, 0.022), (0.1, -0.02, 0.02)):
        c = HEART_C + V((x, -HEART_DEPTH - 0.012, z))
        parts.add("heart", lambda P, c=c, r=r: K.ellipsoid(P, c, (r, r * 0.6, r)), c - V((0.05,) * 3), c + V((0.05,) * 3), FINE, mat=COAL_M)
    # the pentagon of thick sticks round it, crossing at the corners
    corners = [np.asarray(HEART_C) + np.array((0.36 * math.sin(TAU * i / 5), -0.06, 0.36 * math.cos(TAU * i / 5))) for i in range(5)]
    for i in range(5):
        a, b = corners[i], corners[(i + 1) % 5]
        d = b - a
        pts = [a - d * 0.16] + [a + d * u for u in (0.25, 0.5, 0.75)] + [b + d * 0.16]
        co, q = tube(pts, [0.03, 0.036, 0.038, 0.036, 0.028])
        add_raw(parts, "brush", co, q, BARK_M)
    # the layers of sticks: an inner cage, a middle and an outer shell
    for kind, count, mat_mix, avoid in (("brush", 10, 0.5, 0.25), ("shell1", 20, 0.35, 0.05), ("shell0", 28, 0.25, 0)):
        lo_r, hi_r = LAYERS[kind]
        for n in range(count):
            s = arc_stick(R, lo_r, hi_r, avoid)
            if not s:
                continue
            pts, radii = s
            co, q = tube(pts, radii)
            add_raw(parts, kind, co, q, BARK_M if R.random() < mat_mix else STICK_M)
            for _ in range(int(R.integers(0, 3))):
                t = twig_from(R, pts)
                if t:
                    co, q = tube(*t, sides=4)
                    add_raw(parts, kind, co, q, STICK_M)
    # spikes: straight sticks poking out through the shells, like a tumbleweed's
    for n in range(16):
        d = unit(R.normal(size=3))
        if d[2] < -0.45 or np.dot(d, FRONT) > 0.82:
            continue
        side = unit(np.cross(d, R.normal(size=3)))
        a = np.asarray(BRUSH_C) + d * R.uniform(0.4, 0.55)
        b = np.asarray(BRUSH_C) + d * R.uniform(0.92, 1.05) + side * R.uniform(-0.12, 0.12)
        kind = "shell0" if n % 2 else "shell1"
        co, q = tube([a, (a + b) / 2, b], [0.022, 0.018, 0.01])
        add_raw(parts, kind, co, q, STICK_M if n % 3 else BARK_M)
    # clumps of dry leaves on the shells, none in front of the heart
    for n in range(34):
        d = unit(R.normal(size=3))
        if d[2] < -0.35 or np.dot(d, FRONT) > 0.9:
            continue
        kind = "shell0" if n % 3 else "shell1"
        r = LAYERS[kind][1] + 0.02
        centre = np.asarray(BRUSH_C) + d * r
        u, v = frame_of(d)
        for k in range(int(R.integers(4, 7))):
            a = R.uniform(0, TAU)
            dir_ = unit(u * math.cos(a) + v * math.sin(a) + d * 0.35)
            co, q = leaf(centre + dir_ * 0.02, dir_, d, R.uniform(0.18, 0.27), R.uniform(0.055, 0.08))
            add_raw(parts, kind, co, q, LEAF_M)
    # the arms: knobbly sticks from inside the ball, twig fingers at the ends
    for s, sign in SIDES:
        pts = [ARM_START[s], SHOULDER[s], SHOULDER[s].lerp(ELBOW[s], 0.5) + V((0, 0, 0.04)), ELBOW[s],
               ELBOW[s].lerp(WRIST[s], 0.5) + V((0, -0.02, 0.02)), WRIST[s]]
        co, q = tube(pts, [0.05, 0.048, 0.044, 0.044, 0.036, 0.03])
        add_raw(parts, f"arm.{s}", co, q, BARK_M)
        # a twig knot sticking out at the elbow
        e = np.asarray(ELBOW[s])
        co, q = tube([e, e + np.array((sign * 0.05, 0, 0.12)), e + np.array((sign * 0.07, -0.02, 0.2))], [0.018, 0.013, 0.007], sides=4)
        add_raw(parts, f"arm.{s}", co, q, STICK_M)
        for tip in fingers(s):
            co, q = tube(tip, [0.022, 0.017, 0.009], sides=4)
            add_raw(parts, f"hand.{s}", co, q, STICK_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "totnar"
    obj["body_color"] = STICK_HEX
    obj["eye_color"] = EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def hand_dir(s):
    return (WRIST[s] - ELBOW[s]).normalized()


def fingers(s):
    a = np.asarray(hand_dir(s))
    w = np.asarray(WRIST[s])
    side = unit(np.cross(a, (0, 0, 1)))
    up = unit(np.cross(side, a))
    out = []
    for ang in (-0.6, 0, 0.6):
        d = unit(a + side * ang * 0.8 + up * 0.15)
        m = w + d * 0.1
        out.append([w, m, m + unit(d - up * 0.4) * 0.09])
    return out


def held_rest():
    """Where the held skull sits in the right hand (rest)."""
    return WRIST["R"] + hand_dir("R") * 0.2 + V((0, -0.02, 0.0))


# --- rig / skin --------------------------------------------------------------
def skull_name(i):
    return f"skull{i}"


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("brush", BRUSH_C, BRUSH_C + V((0, 0, 0.4)), "root", True, fwd),
             ("shell1", BRUSH_C, BRUSH_C + V((0, 0, 0.3)), "brush", True, fwd),
             ("shell0", BRUSH_C, BRUSH_C + V((0, 0, 0.3)), "brush", True, fwd),
             ("heart", HEART_C, HEART_C + V((0, 0, 0.2)), "brush", True, fwd)]
    for s, _ in SIDES:
        bones += [(f"arm_upper.{s}", SHOULDER[s], ELBOW[s], "root", True, fwd),
                  (f"arm_lower.{s}", ELBOW[s], WRIST[s], f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], WRIST[s] + hand_dir(s) * 0.12, f"arm_lower.{s}", True, fwd)]
    h = held_rest()
    bones.append(("held", h, h + V((0, 0, 0.2)), "hand.R", True, fwd))
    for i, c in enumerate(SKULLS):
        bones += [(skull_name(i), c, c + V((0, 0, 0.25)), "root", True, fwd),
                  (f"{skull_name(i)}_jaw", c + HINGE, c + HINGE + V((0, -0.15, 0)), skull_name(i), True, up)]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "totnar", "forward": "-Y", "attack_style": "boss", "normal_speed": DRIFT_SPEED,
        "skulls": len(SKULLS), "root_motion": False})


def shares(along, bounds, names, width):
    past = [C.np_smoothstep(b - width, b + width, along) for b in bounds]
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
        if part in ("brush", "shell0", "shell1", "heart", "held"):
            W[lo:hi, names.index(part)] = 1
        elif part == "skull":
            W[lo:hi, names.index(skull_name(int(s)))] = 1
        elif part == "jaw":
            W[lo:hi, names.index(f"{skull_name(int(s))}_jaw")] = 1
        elif part == "hand":
            W[lo:hi, names.index(f"hand.{s}")] = 1
        elif part == "arm":
            ends = arc([ARM_START[s], SHOULDER[s], ELBOW[s], WRIST[s]])
            _, along = C._polyline_closest(P[lo:hi], [ARM_START[s], SHOULDER[s], ELBOW[s], WRIST[s]])
            WB = np.zeros((hi - lo, len(names)), np.float32)
            for name, share in shares(along, [ends[2]], (f"arm_upper.{s}", f"arm_lower.{s}"), 0.06).items():
                WB[:, names.index(name)] += share
            W[lo:hi] = WB
        else:
            raise ValueError(kind)
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
    for name, roughness in (("TotnarSticks", 0.85), ("TotnarBark", 0.9), ("TotnarLeaves", 0.75), ("TotnarBone", 0.55),
                            ("TotnarSockets", 0.9), ("TotnarEyes_glow", 0.3), ("TotnarHeart_glow", 0.35), ("TotnarCoals", 0.8)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


def build_prop(coll):
    """The thrown skull: a plain mesh (no rig), its face along -Y (the flight)."""
    parts = K.Parts()
    for kind, sdf, lo, hi, voxel, mat, jaw in skull_parts(V((0, 0, 0)), 0.8):
        if kind in ("skull", "jaw", "socket", "eye", "nose"):
            parts.add(kind, sdf, lo, hi, voxel * 1.2, mat=mat)
    obj = parts.mesh(PROP, coll, tuple(MATERIALS[i] for i in (BONE_M, SOCKET_M, EYE_M)))
    K.decimate(obj, 1500)
    return obj


# --- motion ------------------------------------------------------------------
def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0),
         "hands": {s: WRIST[s].copy() for s, _ in SIDES},
         "dirs": {s: hand_dir(s).copy() for s, _ in SIDES},
         "elbows": {s: V((sign * 1.0, 0.3, 0.2)) for s, sign in SIDES},
         # per skull: offset (armature space), pitch (nods the face down), yaw, roll
         "skulls": [(V(), 0.0, 0.0, 0.0) for _ in SKULLS],
         "jaws": [0.0 for _ in SKULLS],
         "held": 0.001, "heart": 1.0}
    p.update(kw)
    return p


def brush_motion(p):
    R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
    rigid = Matrix.Translation(p["pos"]) @ K.about(BRUSH_C - V((0, 0, 0.75)), R)    # tips about its foot
    sx, sz = p["squash"]
    return rigid, rigid @ K.about(BRUSH_C - V((0, 0, 0.8)), Matrix.Diagonal((sx, sx, sz)))


def solver(rig, fn):
    skel = C.Skeleton(rig)
    arm_len = {s: ((ELBOW[s] - SHOULDER[s]).length, (WRIST[s] - ELBOW[s]).length) for s, _ in SIDES}

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        rigid, squashed = brush_motion(p)
        rigid, squashed = L @ rigid, L @ squashed
        bases["brush"] = skel.set("brush", poses, squashed @ skel.rest["brush"])
        for name in ("shell1", "shell0"):
            bases[name] = skel.set(name, poses, squashed @ skel.rest[name])
        bases["heart"] = skel.set("heart", poses, squashed @ K.about(HEART_C, Matrix.Diagonal((p["heart"],) * 3)) @ skel.rest["heart"])
        r3 = rigid.to_3x3()
        for s, _ in SIDES:
            up, lo, hand = f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"
            shoulder = squashed @ SHOULDER[s]
            elbow, wrist = C.two_bone_ik(shoulder, L @ p["hands"][s], *arm_len[s], r3 @ p["elbows"][s])
            bases[up] = K.aim_at(skel, up, poses, shoulder, elbow - shoulder)
            bases[lo] = K.aim_at(skel, lo, poses, elbow, wrist - elbow)
            bases[hand] = K.aim_at(skel, hand, poses, wrist, p["dirs"][s])
        base = skel.base("held", poses)
        bases["held"] = skel.set("held", poses, base @ Matrix.Diagonal((p["held"],) * 3 + (1,)))
        for i, c in enumerate(SKULLS):
            off, pitch, yaw, roll = p["skulls"][i]
            R = (C.rot_z(yaw) @ C.rot_x(pitch) @ C.rot_y(roll))
            M = L @ Matrix.Translation(off) @ K.about(c, R)
            name = skull_name(i)
            bases[name] = skel.set(name, poses, M @ skel.rest[name])
            jaw = f"{name}_jaw"
            bases[jaw] = skel.set(jaw, poses, M @ K.about(c + HINGE, C.rot_x(p["jaws"][i])) @ skel.rest[jaw])
        return bases
    return solve


def at_brush(p, v):
    return brush_motion(p)[0] @ v


IDLE_HAND = {s: V((sign * 1.28, -0.24, 0.84)) for s, sign in SIDES}
IDLE_DIR = {s: V((sign * 0.4, -0.3, -1)).normalized() for s, sign in SIDES}


def clack(t, i, rate=1.0):
    """A skull's jaw now and then clacking (opens and snaps shut), out of step with the others."""
    w = TAU * t / LOOP_T * rate
    x = math.sin(w * 2 + i * 2.1) * math.sin(w + i * 1.3)
    return D(16) * max(0.0, x) ** 2


def float_skulls(t, amp=1.0, rate=1.0):
    w = TAU * t / LOOP_T * rate
    return [(V((0.02 * math.sin(w + i * 2), 0.015 * math.cos(w + i), amp * 0.06 * math.sin(w * 2 + i * 2.2))),
             D(4) * math.sin(w + i * 1.7), D(9) * math.sin(w + i * 2.4), D(5) * math.sin(w * 2 + i)) for i in range(len(SKULLS))]


def drift_pose(f):
    t = f / FPS
    w = TAU * f / DRIFT_FRAMES
    hop = abs(math.sin(w)) * 0.035
    land = max(0.0, math.cos(2 * w)) ** 4
    p = params(t=t, pos=V((0, 0.01 * math.sin(w), hop)), pitch=D(3) * math.sin(w + 0.5), roll=D(2.5) * math.sin(w),
               squash=(1 + 0.03 * land, 1 - 0.04 * land), skulls=float_skulls(t), jaws=[clack(t, i) for i in range(len(SKULLS))],
               heart=1 + 0.05 * math.sin(2 * w))
    for s, sign in SIDES:
        k = 0 if s == "L" else math.pi
        p["hands"][s] = at_brush(p, IDLE_HAND[s] + V((sign * 0.04 * math.sin(w + k), 0.06 * math.sin(w + k), 0.05 * math.sin(2 * w + k))))
        p["dirs"][s] = (IDLE_DIR[s] + V((0, 0.25 * math.sin(w + k), 0))).normalized()
        p["elbows"][s] = V((sign * 1.0, 0.3, 0.3))
    return p


def blend(a, b, u):
    out = dict(a)
    out["pos"] = a["pos"].lerp(b["pos"], u)
    for key in ("pitch", "roll", "yaw", "held", "heart"):
        out[key] = a[key] + (b[key] - a[key]) * u
    out["squash"] = tuple(x + (y - x) * u for x, y in zip(a["squash"], b["squash"]))
    for key in ("hands", "elbows"):
        out[key] = {s: a[key][s].lerp(b[key][s], u) for s, _ in SIDES}
    out["dirs"] = {s: a["dirs"][s].lerp(b["dirs"][s], u).normalized() for s, _ in SIDES}
    out["skulls"] = [(x[0].lerp(y[0], u), x[1] + (y[1] - x[1]) * u, x[2] + (y[2] - x[2]) * u, x[3] + (y[3] - x[3]) * u)
                     for x, y in zip(a["skulls"], b["skulls"])]
    out["jaws"] = [x + (y - x) * u for x, y in zip(a["jaws"], b["jaws"])]
    return out


def keyed(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            return blend(a, b, C.smoothstep(t0, t1, t))
    return keys[-1][1]


def pose(base, **kw):
    p = dict(base)
    for key in ("hands", "dirs", "elbows"):
        if key in kw:
            p[key] = {**base[key], **{s: V(v) for s, v in kw.pop(key).items()}}
    p.update(kw)
    return p


def per_side(fn):
    return {s: fn(s, sign) for s, sign in SIDES}


def all_skulls(off=(0, 0, 0), pitch=0.0, yaw=0.0, roll=0.0, spread=0.0):
    """Every skull moved alike (spread: pushed apart sideways)."""
    return [(V(off) + V((spread * (c.x / 0.5), 0, 0)), pitch, yaw, roll) for c in SKULLS]


REST = drift_pose(0)


def with_float(p, t, amp=1.0, jaws=None):
    """A key's skulls with the floating bob on top (so they never freeze)."""
    bob = float_skulls(t, amp)
    out = dict(p)
    out["skulls"] = [(s[0] + b[0], s[1] + b[1] * 0.5, s[2] + b[2] * 0.5, s[3] + b[3] * 0.5) for s, b in zip(p["skulls"], bob)]
    if jaws is not None:
        out["jaws"] = jaws
    return out


def throw_keys():
    hit = THROW_HIT / FPS
    reach = pose(REST, pos=V((0, 0.04, 0)), roll=D(-6), squash=(1.02, 0.98), held=0.001,
                 hands={"R": (-0.38, -0.45, 0.95)}, dirs={"R": (0.6, 0.4, -0.2)}, elbows={"R": (-1, 0.2, 0.4)})
    grabbed = pose(reach, held=1.0)
    drawn = pose(REST, pos=V((0, 0.12, 0.04)), pitch=D(-12), roll=D(8), squash=(0.98, 1.04), held=1.0,
                 hands={"R": (-0.78, 0.55, 2.0), "L": (1.25, -0.6, 1.25)}, dirs={"R": (0.1, -0.3, 1), "L": (0.5, -0.8, 0.1)},
                 elbows={"R": (-1, 0.2, -0.6), "L": (1, 0.3, 0.2)}, skulls=all_skulls((0, 0.05, 0.04), pitch=D(-8)),
                 jaws=[D(22)] * 3)
    hurl = pose(REST, pos=V((0, -0.16, -0.02)), pitch=D(12), roll=D(-4), squash=(1.03, 0.97), held=1.0,
                hands={"R": (-0.5, -1.25, 1.1), "L": (1.2, 0.2, 0.9)}, dirs={"R": (0.1, -1, -0.3), "L": (0.4, 0.4, -1)},
                elbows={"R": (-1, -0.2, 0.2)}, skulls=all_skulls((0, -0.08, -0.02), pitch=D(10)), jaws=[D(30)] * 3)
    after = pose(hurl, held=0.001, pos=V((0, -0.12, -0.03)), hands={"R": (-0.6, -1.1, 0.55)}, dirs={"R": (0.2, -0.6, -1)})
    return [(0, REST), (0.3, reach), (0.36, grabbed), (0.66, drawn), (hit - 0.04, pose(drawn, pos=V((0, 0.1, 0.05)))),
            (hit, hurl), (hit + 0.034, after), (hit + 0.25, after), (THROW_FRAMES / FPS - 0.05, REST), (THROW_FRAMES / FPS, REST)]


THROW_KEYS = None


def throw(f):
    t = f / FPS
    p = keyed(t, THROW_KEYS)
    held = 0.001 if t < 0.33 or t >= THROW_HIT / FPS + 0.01 else max(p["held"], 0.001)
    return {**with_float(p, t), "t": t, "held": held}


def gloom_keys():
    hit = GLOOM_HIT / FPS
    high = pose(REST, pos=V((0, 0.06, 0.08)), pitch=D(-8), squash=(1.08, 1.1), heart=1.25,
                hands=per_side(lambda s, sign: (sign * 1.15, 0.0, 2.15)), dirs=per_side(lambda s, sign: (sign * 0.5, 0, 1)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.3, -0.4)),
                skulls=all_skulls((0, 0.03, 0.22), pitch=D(-22), spread=0.12), jaws=[D(34)] * 3)
    sweep = pose(REST, pos=V((0, -0.06, -0.04)), pitch=D(8), squash=(0.95, 0.93), heart=0.9,
                 hands=per_side(lambda s, sign: (sign * 1.35, -0.55, 0.3)), dirs=per_side(lambda s, sign: (sign * 0.6, -0.5, -1)),
                 elbows=per_side(lambda s, sign: (sign * 1, 0.2, 0.5)),
                 skulls=all_skulls((0, -0.04, -0.06), pitch=D(12), spread=-0.04), jaws=[0.0] * 3)
    return [(0, REST), (0.7, high), (hit - 0.08, pose(high, squash=(1.1, 1.12), heart=1.3)), (hit + 0.06, sweep),
            (hit + 0.35, sweep), (GLOOM_FRAMES / FPS - 0.05, REST), (GLOOM_FRAMES / FPS, REST)]


GLOOM_KEYS = None


def gloom(f):
    t = f / FPS
    p = keyed(t, GLOOM_KEYS)
    return {**with_float(p, t, 0.6), "t": t}


def summon_keys():
    hit = SUMMON_HIT / FPS
    grip = pose(REST, pos=V((0, 0.04, -0.04)), squash=(1.0, 0.96),
                hands=per_side(lambda s, sign: (sign * 0.62, -0.62, 1.1)), dirs=per_side(lambda s, sign: (-sign * 0.6, 0.3, -0.4)),
                elbows=per_side(lambda s, sign: (sign * 1, 0, -0.2)), skulls=all_skulls((0, 0.05, -0.04), pitch=D(14)))
    tear = pose(REST, pos=V((0, -0.08, 0.02)), pitch=D(6), squash=(1.14, 0.9), heart=1.2,
                hands=per_side(lambda s, sign: (sign * 1.15, -0.5, 1.05)), dirs=per_side(lambda s, sign: (sign * 0.8, -0.3, -0.2)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.2, 0.1)),
                skulls=all_skulls((0, -0.04, 0.12), pitch=D(-18), spread=0.1), jaws=[D(36)] * 3)
    return [(0, REST), (0.5, grip), (hit - 0.1, pose(grip, squash=(0.96, 0.92))), (hit, tear), (hit + 0.3, tear),
            (SUMMON_FRAMES / FPS - 0.05, REST), (SUMMON_FRAMES / FPS, REST)]


SUMMON_KEYS = None


def summon(f):
    t = f / FPS
    p = keyed(t, SUMMON_KEYS)
    shake = math.sin(TAU * 11 * t) * C.smoothstep(0.3, 0.6, t) * (1 - C.smoothstep(1.2, 1.5, t))
    return {**with_float(p, t), "t": t, "roll": p["roll"] + D(4) * shake, "pos": p["pos"] + V((0.03 * shake, 0, 0))}


def roll_keys():
    start, stop = ROLL_FROM / FPS, ROLL_TO / FPS
    tuck = dict(hands=per_side(lambda s, sign: (sign * 0.72, -0.1, 0.62)), dirs=per_side(lambda s, sign: (-sign * 0.3, -0.4, -1)),
                elbows=per_side(lambda s, sign: (sign * 1, 0.4, 0.4)))
    crouch = pose(REST, pos=V((0, 0.12, -0.03)), pitch=D(-10), squash=(1.07, 0.9), heart=1.2,
                  skulls=all_skulls((0, 0.12, -0.32), pitch=D(20), spread=-0.06), jaws=[0.0] * 3, **tuck)
    rolling = pose(REST, pos=V((0, -0.04, 0.0)), pitch=D(6), squash=(1.0, 1.0), heart=1.15,
                   skulls=all_skulls((0, -0.02, -0.26), pitch=D(8), spread=-0.04), jaws=[D(26)] * 3, **tuck)
    dizzy = pose(REST, pos=V((0, 0, -0.02)), squash=(1.05, 0.95), heart=0.9,
                 hands=per_side(lambda s, sign: (sign * 1.32, -0.2, 0.42)), dirs=per_side(lambda s, sign: (sign * 0.6, -0.2, -1)),
                 skulls=all_skulls((0, 0, -0.04)), jaws=[D(14)] * 3)
    return [(0, REST), (start - 0.12, crouch), (start, rolling), (stop, rolling), (stop + 0.2, dizzy),
            (ROLL_FRAMES / FPS - 0.12, dizzy), (ROLL_FRAMES / FPS, REST)]


ROLL_KEYS = None


def roll(f):
    t = f / FPS
    p = keyed(t, ROLL_KEYS)
    start, stop = ROLL_FROM / FPS, ROLL_TO / FPS
    out = with_float(p, t, 0.5)
    if start <= t < stop:      # bumping along: the skulls bounce over the ball
        b = abs(math.sin(TAU * 3 * (t - start)))
        out["skulls"] = [(s[0] + V((0, 0, 0.06 * b)), s[1], s[2], s[3]) for s in out["skulls"]]
        out["pos"] = out["pos"] + V((0, 0, 0.03 * b))
    elif t >= stop:            # dizzy: the skulls circle round, the ball wobbles
        k = 1 - C.smoothstep(ROLL_FRAMES / FPS - 0.3, ROLL_FRAMES / FPS, t)
        w = TAU * 1.6 * (t - stop)
        out["skulls"] = [(s[0] + V((0.1 * math.cos(w + i * 2.1), 0.1 * math.sin(w + i * 2.1), 0)) * k, s[1], s[2] + D(25) * math.sin(w + i) * k, s[3] + D(12) * math.cos(w) * k)
                         for i, s in enumerate(out["skulls"])]
        out["roll"] = out["roll"] + D(7) * math.sin(w * 1.3) * k
        out["pitch"] = out["pitch"] + D(5) * math.cos(w * 1.3) * k
    return {**out, "t": t}


def storm_keys():
    hit = STORM_HIT / FPS
    raise_ = pose(REST, pos=V((0, 0.05, 0.08)), pitch=D(-10), squash=(1.04, 1.08), heart=1.35,
                  hands=per_side(lambda s, sign: (sign * 0.72, 0.1, 2.35)), dirs=per_side(lambda s, sign: (sign * 0.2, 0, 1)),
                  elbows=per_side(lambda s, sign: (sign * 1, 0.4, -0.2)),
                  skulls=all_skulls((0, 0.06, 0.16), pitch=D(-38), spread=0.08), jaws=[D(40)] * 3)
    strike = pose(raise_, pos=V((0, 0.02, 0.0)), squash=(1.08, 0.96), heart=1.5,
                  hands=per_side(lambda s, sign: (sign * 0.95, -0.2, 2.25)), skulls=all_skulls((0, 0.04, 0.1), pitch=D(-30), spread=0.12))
    return [(0, REST), (0.7, raise_), (STORM_HIT / FPS - 0.05, pose(raise_, heart=1.45)), (hit, strike), (hit + 0.2, strike),
            (STORM_FRAMES / FPS - 0.05, REST), (STORM_FRAMES / FPS, REST)]


STORM_KEYS = None


def storm(f):
    t = f / FPS
    p = keyed(t, STORM_KEYS)
    tremble = math.sin(TAU * 13 * t) * C.smoothstep(0.6, 0.9, t) * (1 - C.smoothstep(STORM_HIT / FPS, STORM_HIT / FPS + 0.2, t))
    out = with_float(p, t, 0.5)
    out["skulls"] = [(s[0] + V((0.012 * tremble, 0, 0)), s[1], s[2], s[3]) for s in out["skulls"]]
    return {**out, "t": t, "roll": p["roll"] + D(2) * tremble}


def death(f):
    t = f / FPS
    shudder = math.sin(TAU * 10 * t) * (1 - C.smoothstep(0.15, 0.5, t))
    sag = C.smoothstep(0.35, 1.2, t)
    p = params(t=t, pos=V((0.02 * shudder, 0, -0.05 * sag)), roll=D(4) * shudder + D(5) * sag, pitch=D(-6) * sag,
               squash=(1 + 0.32 * sag, 1 - 0.5 * sag), heart=1 - 0.3 * sag)
    skulls, jaws = [], []
    for i, c in enumerate(SKULLS):
        # each drops a moment after the other, bounces once and lies tipped over
        t0 = 0.3 + 0.12 * i
        u = max(0.0, t - t0)
        floor = -(c.z - 0.24) + 0.02
        fall = min(1.0, (u / 0.42) ** 2)
        bounce = 0.12 * math.sin(math.pi * min(1.0, max(0.0, (u - 0.42) / 0.3))) if u > 0.42 else 0
        out = V((0.25 * (c.x / 0.5 if c.x else 0.4) * C.smoothstep(0, 0.7, u), -0.22 * C.smoothstep(0, 0.7, u), 0))
        skulls.append((out + V((0, 0, floor * fall + bounce)), D(-30) * C.smoothstep(0.3, 0.9, u), D(30) * (i - 1),
                       D(70) * (1 if i % 2 else -1) * C.smoothstep(0.35, 0.9, u)))
        jaws.append(D(28) * C.smoothstep(0.5, 0.8, u))
    p["skulls"], p["jaws"] = skulls, jaws
    for s, sign in SIDES:
        p["hands"][s] = REST["hands"][s].lerp(V((sign * 1.5, -0.35, 0.06)), C.smoothstep(0.3, 1.1, t))
        p["dirs"][s] = REST["dirs"][s].lerp(V((sign * 0.9, -0.3, -0.1)), C.smoothstep(0.3, 1.1, t)).normalized()
        p["elbows"][s] = V((sign * 0.5, 0.2, 1))
    return p


def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def bone_point(rig, action, frame, bone, at_tail=False):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ (pb.tail if at_tail else pb.head)


def animate(rig, obj):
    global THROW_KEYS, GLOOM_KEYS, SUMMON_KEYS, ROLL_KEYS, STORM_KEYS
    THROW_KEYS, GLOOM_KEYS, SUMMON_KEYS, ROLL_KEYS, STORM_KEYS = throw_keys(), gloom_keys(), summon_keys(), roll_keys(), storm_keys()
    rig.animation_data_create()
    K.ground_clip(rig, obj, "TotnarDrift", solver(rig, drift_pose), DRIFT_FRAMES, cyclic=True, extras={"speed": DRIFT_SPEED})
    th = K.ground_clip(rig, obj, "TotnarThrow", solver(rig, throw), THROW_FRAMES,
                       extras={"attack_style": "throw", "hit_frame": THROW_HIT, "hit_time": THROW_HIT / FPS})
    th.pose_markers.new("Hurl").frame = THROW_HIT
    gl = K.ground_clip(rig, obj, "TotnarGloom", solver(rig, gloom), GLOOM_FRAMES,
                       extras={"attack_style": "gloom", "hit_frame": GLOOM_HIT, "hit_time": GLOOM_HIT / FPS})
    gl.pose_markers.new("Sweep").frame = GLOOM_HIT
    su = K.ground_clip(rig, obj, "TotnarSummon", solver(rig, summon), SUMMON_FRAMES,
                       extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    su.pose_markers.new("Pour").frame = SUMMON_HIT
    ro = K.ground_clip(rig, obj, "TotnarRoll", solver(rig, roll), ROLL_FRAMES,
                       extras={"attack_style": "roll", "hit_frame": ROLL_FROM, "hit_time": ROLL_FROM / FPS,
                               "roll_from": ROLL_FROM, "roll_to": ROLL_TO})
    ro.pose_markers.new("Roll").frame = ROLL_FROM
    ro.pose_markers.new("Dizzy").frame = ROLL_TO
    st = K.ground_clip(rig, obj, "TotnarStorm", solver(rig, storm), STORM_FRAMES,
                       extras={"attack_style": "storm", "hit_frame": STORM_HIT, "hit_time": STORM_HIT / FPS})
    st.pose_markers.new("Strike").frame = STORM_HIT
    K.ground_clip(rig, obj, "TotnarDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.9}, settle_from=round(1.6 * FPS))
    K.register(rig, CLIPS)
    # the attack points, read off the baked clips
    th["muzzle"] = game(bone_point(rig, "TotnarThrow", THROW_HIT, "held"))
    su["muzzle"] = game(bone_point(rig, "TotnarSummon", SUMMON_HIT, "heart") + V((0, -0.35, -0.2)))
    st["muzzle"] = game(bone_point(rig, "TotnarStorm", STORM_HIT, skull_name(1), at_tail=True))
    return {"throw": list(th["muzzle"]), "summon": list(su["muzzle"]), "storm": list(st["muzzle"])}


# --- the snapping skull ------------------------------------------------------------------------
SNAP_K = 1.12
SNAP_C = V((0, 0, 0.34))


def build_snap():
    scene = K.creature_scene(SNAP_SCENE)
    K.clear_collection(SNAP_COLLECTION)
    coll = K.collection(SNAP_COLLECTION, scene)
    up, fwd = (0, 0, 1), (0, -1, 0)
    hinge = SNAP_C + HINGE * SNAP_K
    rig = K.armature(SNAP_RIG, coll, [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
                                     ("skull", SNAP_C, SNAP_C + V((0, 0, 0.25)), "root", True, fwd),
                                     ("jaw", hinge, hinge + V((0, -0.15, 0)), "skull", True, up)],
                     {"enemy": "snapskull", "forward": "-Y", "attack_style": "bite", "normal_speed": HOP_SPEED, "root_motion": False})
    parts = K.Parts()
    for kind, sdf, lo, hi, voxel, mat, jaw in skull_parts(SNAP_C, SNAP_K):
        parts.add("jaw" if jaw else "skull", sdf, lo, hi, voxel * 1.05, mat=mat)
    obj = parts.mesh(SNAP, coll, SNAP_MATERIALS)
    obj["enemy"] = "snapskull"
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    P = K.mesh_points(obj)
    names = [b.name for b in rig.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in parts.owners:
        W[o["lo"]:o["hi"], names.index(o["kind"])] = 1
    K.write_weights(obj, names, W)
    for name, roughness in (("SnapBone", 0.55), ("SnapSockets", 0.9), ("SnapEyes_glow", 0.3)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


def snap_solver(rig, fn):
    skel = C.Skeleton(rig)
    hinge = SNAP_C + HINGE * SNAP_K

    def solve(f, lift):
        pos, pitch, roll, yaw, jaw, squash, drop = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        foot = V((0, -0.02, 0.04))
        M = L @ Matrix.Translation(pos) @ K.about(foot, C.rot_z(yaw) @ C.rot_x(pitch) @ C.rot_y(roll)) \
            @ K.about(foot, Matrix.Diagonal((1 / math.sqrt(squash), 1 / math.sqrt(squash), squash)))
        bases["skull"] = skel.set("skull", poses, M @ skel.rest["skull"])
        bases["jaw"] = skel.set("jaw", poses, M @ Matrix.Translation(drop) @ K.about(hinge, C.rot_x(jaw)) @ skel.rest["jaw"])
        return bases
    return solve


def hop(f):
    u = f / HOP_FRAMES
    h = math.sin(math.pi * u)
    land = max(0.0, 1 - u * 6) + max(0.0, (u - 0.85) * 6.6)
    return (V((0, 0, 0.16 * h)), D(-8) * h + D(4) * land, D(4) * math.sin(TAU * u), 0.0,
            D(18) * max(0.0, math.sin(TAU * 2 * u)), 1 - 0.14 * land + 0.06 * h, V())


def bite(f):
    t = f / FPS
    hit = BITE_HIT / FPS
    crouch = C.smoothstep(0, 0.25, t) * (1 - C.smoothstep(0.25, 0.32, t))
    spring = C.smoothstep(0.25, hit, t) * (1 - C.smoothstep(hit + 0.1, 0.7, t))
    gape = C.smoothstep(0.1, hit - 0.06, t) * (1 - C.smoothstep(hit - 0.04, hit, t))
    return (V((0, -0.12 * spring, 0.2 * spring)), D(-14) * crouch + D(12) * spring, 0.0, 0.0,
            D(40) * gape, 1 - 0.18 * crouch + 0.08 * spring, V())


def snap_death(f):
    t = f / FPS
    crack = math.sin(TAU * 14 * t) * (1 - C.smoothstep(0.1, 0.35, t))
    over = C.smoothstep(0.25, 0.75, t)
    jaw_off = C.smoothstep(0.15, 0.5, t)
    return (V((0.02 * crack, 0.04 * over, -0.02 * over)), D(-18) * over, D(4) * crack + D(80) * over, 0.0,
            D(30) * jaw_off, 1 - 0.1 * over, V((0.06 * jaw_off, -0.12 * jaw_off, -0.05 * jaw_off)))


def animate_snap(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SnapHop", snap_solver(rig, hop), HOP_FRAMES, cyclic=True, extras={"speed": HOP_SPEED})
    b = K.ground_clip(rig, obj, "SnapBite", snap_solver(rig, bite), BITE_FRAMES,
                      extras={"attack_style": "bite", "hit_frame": BITE_HIT, "hit_time": BITE_HIT / FPS})
    b.pose_markers.new("Snap").frame = BITE_HIT
    K.ground_clip(rig, obj, "SnapDeath", snap_solver(rig, snap_death), SNAP_DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 0.9}, settle_from=round(0.75 * FPS))
    K.register(rig, SNAP_CLIPS)


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    shots = [("TotnarDrift", 0, (2.6, -6.0, 2.8)), ("TotnarDrift", 16, (-5.4, -3.0, 2.4)),
             ("TotnarThrow", 18, (4.0, -5.0, 2.4)), ("TotnarThrow", THROW_HIT, (5.5, -1.5, 2.0)),
             ("TotnarGloom", GLOOM_HIT - 4, (3.0, -5.4, 2.4)), ("TotnarSummon", SUMMON_HIT + 2, (3.0, -5.4, 2.2)),
             ("TotnarRoll", ROLL_FROM - 3, (4.4, -4.4, 2.2)), ("TotnarRoll", 90, (3.4, -4.6, 2.2)),
             ("TotnarStorm", STORM_HIT, (2.4, -5.6, 2.0)), ("TotnarDeath", 20, (4.6, -3.6, 2.2)),
             ("TotnarDeath", DEATH_FRAMES, (3.4, -4.6, 3.6)), ("TotnarDrift", 30, (0.5, 6.0, 2.6))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 1.2), size=360, cols=4)
    return [path]


def snap_preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    shots = [("SnapHop", 0, (1.2, -2.6, 1.0)), ("SnapHop", 8, (-2.2, -1.6, 0.9)), ("SnapBite", BITE_HIT - 3, (2.0, -1.8, 0.9)),
             ("SnapDeath", SNAP_DEATH_FRAMES, (1.6, -2.2, 1.4))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 0.3), size=300, cols=4)


def main(export_path=None, blend_path=None, preview_path=None, snap_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    prop.location = (0, 0, 0)
    before = len(obj.data.polygons)
    K.decimate(obj)
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("TotnarDeath",))
    report.update(points)
    report["quads_before"] = before
    K.setup_stage(scene, "Totnar", STAGE, (0, 0, 1.2), 3.6)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, DRIFT_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Totnar", NAME, (0, 0, 1.2), 4.6)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Totnar:", report)
    if snap_path:
        sscene, srig, sobj = build_snap()
        K.decimate(sobj, 3000)
        animate_snap(srig, sobj)
        sreport = K.validate(srig, sobj, SNAP_CLIPS, held=("SnapDeath",))
        K.setup_stage(sscene, "SnapSkull", SNAP_STAGE, (0, 0, 0.3), 1.4)
        srig.animation_data.action = bpy.data.actions[SNAP_CLIPS[0]]
        sscene.frame_set(0)
        K.export_gltf(srig, sobj, snap_path)
        if preview_path:
            snap_preview(sscene, srig, str(Path(preview_path).with_name("snapskull-preview.png")))
        print("SnapSkull:", sreport)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "totnar.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "totnar.blend"),
         preview_path=args[2] if len(args) > 2 else None,
         snap_path=args[3] if len(args) > 3 else str(root.parent / "assets" / "snapskull.glb"))
