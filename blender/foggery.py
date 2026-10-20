"""
Foggery: the boss of the fifth descent (depth 4), from the kids' whiteboard sketches.

A frog, orange red, a little taller than the player (about 1.75 cells): two big round yellow eyes
sit on top of his head at the sides, a dark line runs across his face between them with a little
round mouth under it, his body flares out like a bell below the head (pale belly in front), two
long thin arms hang from the sides of his head down past his body, ending in three-fingered
hands, and two long straight legs with webbed feet carry him. Faces -Y in Blender, +Z up; one
unit = one game cell. His eyes are on fire: little flames lick up off each of them.

His second form is a ball (the game shows one form or the other: render/enemies.js scales the
`frog` or the `ball` bone away): an orange red ball floating off the floor with his two eyes close
together in the middle of its face, burning like a Fire-face: a crown of flame tongues rises off
it, and little flames off its eyes. The shield round it is the game's (render/enemies.js).

Rig: root; frog (all of the frog rides it: scaled away in ball form), body (torso and head, from
the hips), eye.L / eye.R (each eye on its own: he plucks them out and throws them; the game scales
a thrown one away and grows it back), per side thigh / shin (IK) and arm_upper / arm_lower / hand
(IK); ball (the ball form, its eyes on it); flame_* (each flame on its own bone, from the eye or
the ball it burns on: they flicker in the clips, and the game flickers them more).

Clips, 30 fps, in place (the game supplies root motion):
    FoggeryWalk    32-frame loop: a waddle, swaying, arms swinging (extras.speed).
    FoggeryEyeL    1.4 s: reaches up with his left hand, plucks out his left eye, draws it back
                   over his shoulder and throws it at frame 24 (extras.hit_frame, extras.muzzle).
    FoggeryEyeR    the same with the right.
    FoggerySummon  1.5 s: crouches, puffs up and croaks at frame 27, arms flung out: Fire-faces.
    FoggeryFloat   48-frame loop: the ball floating, bobbing and wobbling.
    FoggerySpit    1.1 s: the ball draws back and lunges forward at frame 18: a fireball.
    FoggeryGeyser  2.1 s: the ball rises, shudders and slams down at frame 48: geysers burst.
    FoggeryCats    1.6 s: the ball spins right round, rising, and flares at frame 30: Fire-cats.
    FoggeryDeath   2.4 s: the ball shudders, sinks and squashes flat, rolling over. Held.
    FoggeryEye     (a prop, not a clip): the eye he throws, its flames trailing behind it.

Headless:
    Blender -b --python blender/foggery.py -- assets/foggery.glb blender/foggery.blend \
        blender/previews/foggery-preview.png
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

NAME, RIG_NAME, PROP = "Foggery", "FoggeryRig", "FoggeryEye"
SCENE, COLLECTION, STAGE = "Foggery", "FoggeryAsset", "FoggeryStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("FoggeryWalk", "FoggeryEyeL", "FoggeryEyeR", "FoggerySummon", "FoggeryFloat", "FoggerySpit",
         "FoggeryGeyser", "FoggeryCats", "FoggeryDeath")

BODY_HEX, BELLY_HEX, EYE_HEX, PUPIL_HEX, MOUTH_HEX = "#e2552b", "#ffb27e", "#ffd23a", "#1d120c", "#5a1c12"
# (name, colour, emission); indices are the parts' `mat`
FLAME_HEX, FLAME_CORE_HEX = "#ff5a14", "#ffb22a"
MATERIALS = (("FoggeryBody", BODY_HEX, 0), ("FoggeryBelly", BELLY_HEX, 0), ("FoggeryEyes_glow", EYE_HEX, 0.9),
             ("FoggeryPupil", PUPIL_HEX, 0), ("FoggeryMouth", MOUTH_HEX, 0),
             ("FoggeryFlame_glow", FLAME_HEX, 1.8), ("FoggeryFlameCore_glow", FLAME_CORE_HEX, 1.6))
BODY_M, BELLY_M, EYE_M, PUPIL_M, MOUTH_M, FLAME_M, CORE_M = range(len(MATERIALS))
PROP_MATERIALS = (("FoggeryEyeBall_glow", EYE_HEX, 1.4), ("FoggeryEyePupil", PUPIL_HEX, 0),
                  ("FoggeryEyeFlame_glow", FLAME_HEX, 1.8), ("FoggeryEyeFlameCore_glow", FLAME_CORE_HEX, 1.6))

VOXEL, DETAIL, FINE = 0.009, 0.0065, 0.004
WALK_FRAMES, WALK_SPEED = 32, 1.0
EYE_FRAMES, EYE_HIT = 42, 24
SUMMON_FRAMES, SUMMON_HIT = 45, 27
FLOAT_FRAMES = 48
SPIT_FRAMES, SPIT_HIT = 33, 18
GEYSER_FRAMES, GEYSER_HIT = 63, 48
CATS_FRAMES, CATS_HIT = 48, 30
DEATH_FRAMES = 72

# --- body plan (frog) ----------------------------------------------------------
FROG = V((0, 0, 0.9))              # the frog bone: what the game shrinks him about
PIVOT = V((0, 0, 0.74))            # the body turns about the hips
BODY_LO, BODY_HI = 0.66, 1.22      # the bell of the body, from its hem to its shoulders
HEAD_C, HEAD_R = V((0, -0.02, 1.33)), (0.37, 0.27, 0.17)
EYE_R = 0.125
EYES = {s: V((sign * 0.265, -0.05, 1.56)) for s, sign in SIDES}
LIDS = {s: V((sign * 0.265, -0.02, 1.47)) for s, sign in SIDES}
LEG_R = 0.052
HIP = {s: V((sign * 0.15, 0, 0.74)) for s, sign in SIDES}
KNEE = {s: V((sign * 0.16, -0.025, 0.38)) for s, sign in SIDES}
FOOT = {s: V((sign * 0.17, -0.01, 0.04)) for s, sign in SIDES}
TOE = V((0, -0.07, -0.01))
ARM_R = 0.042
ARM_TOP = {s: V((sign * 0.26, 0, 1.28)) for s, sign in SIDES}      # hidden in the head
SHOULDER = {s: V((sign * 0.36, -0.01, 1.25)) for s, sign in SIDES}
ELBOW = {s: V((sign * 0.47, -0.03, 0.93)) for s, sign in SIDES}
WRIST = {s: V((sign * 0.52, -0.07, 0.63)) for s, sign in SIDES}

# --- the ball ----------------------------------------------------------------
BALL_C, BALL_R = V((0, 0, 0.86)), 0.55
BALL_EYES = {s: V((sign * 0.125, -0.49, 0.93)) for s, sign in SIDES}
BALL_EYE_R = 0.12
HIDDEN = 0.001                     # the scale of the form not shown

# --- his flames: name -> (the bone it burns on, base, up, length, base radius, curl) ------------
FLAMES = {}
for _s, _sign in SIDES:   # off each of the frog's eyes
    FLAMES[f"flame_eye{_s}"] = (f"eye.{_s}", EYES[_s] + V((_sign * 0.02, 0.03, EYE_R * 0.7)), V((_sign * 0.3, 0.25, 1)), 0.26, 0.065, 0.035 * _sign)
for _i, (_az, _el, _len) in enumerate(((50, 38, 0.5), (115, 34, 0.55), (180, 40, 0.6), (245, 34, 0.55), (310, 38, 0.5),
                                       (0, 88, 0.62), (28, 62, 0.45), (-28, 62, 0.45))):   # a crown round the ball
    _a, _e = math.radians(_az), math.radians(_el)
    _d = V((math.sin(_a) * math.cos(_e), -math.cos(_a) * math.cos(_e), math.sin(_e)))
    FLAMES[f"flame_ball{_i}"] = ("ball", BALL_C + _d * (BALL_R * 0.9), (_d + V((0, 0, 1.4))).normalized(), _len, 0.13, 0.07 * (-1) ** _i)
for _s, _sign in SIDES:   # off the ball's eyes
    FLAMES[f"flame_beye{_s}"] = ("ball", BALL_EYES[_s] + V((_sign * 0.02, 0.03, BALL_EYE_R * 0.7)), V((_sign * 0.3, 0.2, 1)), 0.22, 0.055, 0.03 * _sign)


def flame_shape(name, flames=None):
    """A main tongue with two smaller ones curling off its sides: [(points, radii)]."""
    _, base, up, length, r0, curl = (flames or FLAMES)[name]
    up = up.normalized()
    side = (V((1, 0, 0)) if abs(up.x) < 0.7 else V((0, 1, 0)))
    side = (side - up * side.dot(up)).normalized()
    tongues = [K.flame_tongue(base, up, side, length, r0, curl, waves=1.5, tip=0.005, n=10)]
    for k in (1, -1):
        tilt = (up + side * (0.55 * k)).normalized()
        tongues.append(K.flame_tongue(base + side * (0.45 * r0 * k) + up * (0.15 * r0), tilt, side, 0.55 * length,
                                      0.62 * r0, -0.6 * curl * k, waves=1.4, tip=0.004, n=8))
    return tongues


def flame_sdf(P, name, flames=None):
    d = None
    for pts, radii in flame_shape(name, flames):
        t = K.tapered_tube(P, pts, radii)
        d = t if d is None else K.smin(d, t, 0.018)
    return d


def flame_bands(name, flame=FLAME_M, core=CORE_M, flames=None):
    """Its hot core low down, the flame above (a wavy border)."""
    _, base, up, length, _, _ = (flames or FLAMES)[name]

    def mats(centers):
        u = (centers - np.asarray(base, np.float32)) @ np.asarray(up.normalized(), np.float32) / length
        return np.where(u < 0.3 + 0.08 * np.sin(60 * centers[:, 0] + 40 * centers[:, 1]), core, flame)
    return mats


def head_front(x, z):
    """y of the head's front surface at (x, z) (the ellipsoid HEAD_C, HEAD_R)."""
    u = 1 - (x / HEAD_R[0]) ** 2 - ((z - HEAD_C.z) / HEAD_R[2]) ** 2
    return HEAD_C.y - HEAD_R[1] * math.sqrt(max(0.0, u))


def bell_sdf(P):
    """The body: a rounded bell, wide at its hem, narrower at the shoulders."""
    z = P[..., 2]
    k = np.clip((z - BODY_LO) / (BODY_HI - BODY_LO), 0, 1)
    w, d = 0.39 - 0.12 * k, 0.25 - 0.05 * k
    q = np.stack([np.abs(P[..., 0]) - w, np.abs(P[..., 1] + 0.01) - d, np.abs(z - (BODY_LO + BODY_HI) / 2) - (BODY_HI - BODY_LO) / 2], axis=-1)
    return np.linalg.norm(np.maximum(q + 0.09, 0), axis=-1) + np.minimum(np.max(q + 0.09, axis=-1), 0) - 0.09


def body_sdf(P):
    d = K.smin(bell_sdf(P), K.ellipsoid(P, HEAD_C, HEAD_R), 0.09)
    for s, _ in SIDES:
        d = K.smin(d, K.ellipsoid(P, LIDS[s], (0.15, 0.14, 0.11)), 0.05)        # the mounds the eyes sit in
        d = K.smin(d, K.round_cone(P, HIP[s] + V((0, 0, 0.06)), HIP[s], LEG_R * 1.1, LEG_R * 1.1), 0.04)
    return d


def belly(centres):
    """Pale in an oval where the bell faces forward."""
    x, y, z = centres[:, 0], centres[:, 1], centres[:, 2]
    return np.where((y < -0.1) & ((x / 0.27) ** 2 + ((z - 0.93) / 0.23) ** 2 < 1), BELLY_M, BODY_M)


def eye_sdf(P, c, r):
    return F._sd_sphere(P, c, r)


def pupil_sdf(P, c, r, out):
    """A frog's pupil: a dark lozenge on the front of the eye, a little outward."""
    d = V((out * 0.25, -1, 0.08)).normalized()
    p = c + d * (r - 0.012)
    return K.ellipsoid(P, p, (r * 0.48, 0.02, r * 0.3))


def leg_sdf(P, s):
    tube = K.tapered_tube(P, [HIP[s], KNEE[s], FOOT[s]], [LEG_R, LEG_R * 0.9, LEG_R * 0.8])
    foot = K.ellipsoid(P, FOOT[s] + TOE, (0.085, 0.12, 0.032))
    for i in (-1, 0, 1):   # three webbed toes
        tip = FOOT[s] + TOE + V((i * 0.07, -0.1, -0.005))
        foot = K.smin(foot, K.round_cone(P, FOOT[s] + TOE, tip, 0.03, 0.022), 0.02)
    return K.smin(tube, foot, 0.025)


def arm_sdf(P, s):
    return K.tapered_tube(P, [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], [ARM_R, ARM_R, ARM_R * 0.9, ARM_R * 0.8])


def hand_frame(s):
    return (WRIST[s] - ELBOW[s]).normalized()


def hand_sdf(P, s):
    a, sign = hand_frame(s), (1 if s == "L" else -1)
    c = WRIST[s] + a * 0.04
    d = K.ellipsoid(P, c, (0.05, 0.04, 0.055))
    side = V((sign, 0, 0))
    for i in (-1, 0, 1):   # three long fingers with round tips
        tip = c + a * 0.11 + side * (0.035 * i) + V((0, -0.03 * abs(i), 0))
        d = K.smin(d, K.round_cone(P, c, tip, 0.018, 0.016), 0.012)
        d = K.smin(d, F._sd_sphere(P, tip, 0.024), 0.008)
    return d


def ball_sdf(P):
    return F._sd_sphere(P, BALL_C, BALL_R)


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.5, -0.36, 0.6), (0.5, 0.34, 1.62), VOXEL, mat=belly)
    # the line across his face and the little round mouth under it
    line = [V((x, head_front(x, 1.385) + 0.006, 1.385 - 0.02 * (x / 0.17) ** 2)) for x in np.linspace(-0.17, 0.17, 9)]
    lo, hi = K.bounds(line, 0.04)
    parts.add("body", lambda P: K.tapered_tube(P, line, [0.014] * len(line)), lo, hi, FINE, mat=MOUTH_M)
    mouth = V((0, head_front(0, 1.27) + 0.008, 1.27))
    parts.add("body", lambda P: K.ellipsoid(P, mouth, (0.032, 0.02, 0.026)), mouth - V((0.05,) * 3), mouth + V((0.05,) * 3), FINE, mat=MOUTH_M)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: eye_sdf(P, c, EYE_R), e - V((0.15,) * 3), e + V((0.15,) * 3), DETAIL, mat=EYE_M)
        parts.add(f"eye.{s}", lambda P, c=e, o=sign: pupil_sdf(P, c, EYE_R, o), e - V((0.15,) * 3), e + V((0.15,) * 3), FINE, mat=PUPIL_M)
        lo, hi = K.bounds([HIP[s], KNEE[s], FOOT[s], FOOT[s] + TOE + V((0, -0.12, 0))], 0.12)
        parts.add(f"leg.{s}", lambda P, s=s: leg_sdf(P, s), lo, hi, DETAIL, mat=BODY_M)
        lo, hi = K.bounds([ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]], 0.06)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=BODY_M)
        lo, hi = K.bounds([WRIST[s], WRIST[s] + hand_frame(s) * 0.18], 0.1)
        parts.add(f"hand.{s}", lambda P, s=s: hand_sdf(P, s), lo, hi, FINE, mat=BODY_M)
    # the ball form: its eyes close together in the middle of its face
    parts.add("ball", ball_sdf, BALL_C - V((0.6,) * 3), BALL_C + V((0.6,) * 3), VOXEL, mat=BODY_M)
    for s, sign in SIDES:
        e = BALL_EYES[s]
        parts.add("ball", lambda P, c=e: eye_sdf(P, c, BALL_EYE_R), e - V((0.14,) * 3), e + V((0.14,) * 3), DETAIL, mat=EYE_M)
        parts.add("ball", lambda P, c=e, o=sign: pupil_sdf(P, c, BALL_EYE_R, o), e - V((0.14,) * 3), e + V((0.14,) * 3), FINE, mat=PUPIL_M)
    for name in FLAMES:
        lo, hi = K.bounds([p for pts, _ in flame_shape(name) for p in pts], 0.08)
        parts.add(name, lambda P, n=name: flame_sdf(P, n), lo, hi, DETAIL, mat=flame_bands(name))
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "foggery"
    obj["body_color"] = BODY_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_prop(coll):
    """The eye he throws: a yellow ball with its pupil (a plain mesh, pupil towards -Y, the way it
    flies), burning, its flames trailing behind it (+Y)."""
    parts = K.Parts()
    c = V((0, 0, 0))
    parts.add("eye", lambda P: eye_sdf(P, c, EYE_R), (-0.15,) * 3, (0.15,) * 3, 0.008, mat=0)
    parts.add("eye", lambda P: pupil_sdf(P, c, EYE_R, 0), (-0.15,) * 3, (0.15,) * 3, 0.006, mat=1)
    trail = {f"t{i}": (None, V((x, EYE_R * 0.4, z)), V((x * 2, 1, z * 2 + 0.25)), 0.26, 0.07, 0.03 * (-1) ** i)
             for i, (x, z) in enumerate(((0, 0.05), (0.06, -0.03), (-0.06, -0.03)))}
    for name in trail:
        lo, hi = K.bounds([p for pts, _ in flame_shape(name, trail) for p in pts], 0.08)
        parts.add("eye", lambda P, n=name: flame_sdf(P, n, trail), lo, hi, 0.006, mat=flame_bands(name, 2, 3, trail))
    obj = parts.mesh(PROP, coll, PROP_MATERIALS)
    F.decimate(obj, 1500)
    return obj


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.1, 0), None, False, up),
             ("frog", FROG, FROG + V((0, 0, 0.2)), "root", False, fwd),
             ("body", PIVOT, PIVOT + V((0, 0, 0.3)), "frog", True, fwd),
             ("ball", BALL_C, BALL_C + V((0, 0, 0.3)), "root", True, fwd)]
    for s, _ in SIDES:
        bones += [(f"eye.{s}", EYES[s], EYES[s] + V((0, -0.15, 0)), "frog", True, up),
                  (f"thigh.{s}", HIP[s], KNEE[s], "frog", True, fwd),
                  (f"shin.{s}", KNEE[s], FOOT[s], f"thigh.{s}", True, fwd),
                  (f"arm_upper.{s}", SHOULDER[s], ELBOW[s], "frog", True, fwd),
                  (f"arm_lower.{s}", ELBOW[s], WRIST[s], f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], WRIST[s] + hand_frame(s) * 0.08, f"arm_lower.{s}", True, fwd)]
    for name, (parent, base, up_dir, length, _, _) in FLAMES.items():
        bones.append((name, base, base + up_dir.normalized() * length, parent, True, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "foggery", "forward": "-Y", "attack_style": "boss", "normal_speed": WALK_SPEED, "root_motion": False})


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
        if part in ("body", "ball"):
            W[lo:hi, names.index(part)] = 1
            continue
        if part == "eye" or kind in FLAMES:
            W[lo:hi, names.index(kind)] = 1
            continue
        WB = np.zeros((hi - lo, len(names)), np.float32)
        if part == "hand":
            WB[:, names.index(f"hand.{s}")] = 1
        elif part == "leg":
            pts = [HIP[s], KNEE[s], FOOT[s]]
            for name, share in limb(P[lo:hi], pts, arc(pts)[1], (f"thigh.{s}", f"shin.{s}"), 0.04).items():
                WB[:, names.index(name)] += share
        else:
            pts = [ARM_TOP[s], SHOULDER[s], ELBOW[s], WRIST[s]]
            for name, share in limb(P[lo:hi], pts, arc(pts)[2], (f"arm_upper.{s}", f"arm_lower.{s}"), 0.04).items():
                WB[:, names.index(name)] += share
            near = np.clip((P[lo:hi, 2] - 1.2) / 0.06, 0, 1) * (np.abs(P[lo:hi, 0]) < 0.34)   # (its top is in the head)
            WB = WB * (1 - near[:, None])
            WB[:, names.index("body")] += near
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
    for name, roughness in (("FoggeryBody", 0.45), ("FoggeryBelly", 0.55), ("FoggeryEyes_glow", 0.2), ("FoggeryPupil", 0.3), ("FoggeryMouth", 0.5)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
REST_DIR = {s: hand_frame(s) for s, _ in SIDES}
REST_ELBOW = {s: V((sign * 1.0, 0.4, 0.0)) for s, sign in SIDES}


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0),
         "feet": {s: FOOT[s].copy() for s, _ in SIDES},                # armature space
         "hands": {s: WRIST[s].copy() for s, _ in SIDES},              # body space
         "dirs": {s: REST_DIR[s].copy() for s, _ in SIDES},            # where the hands point, body space
         "elbows": {s: REST_ELBOW[s].copy() for s, _ in SIDES},
         "knees": V((0, -1, 0.05)),
         "eyes": {s: None for s, _ in SIDES},                          # None: in its socket; else armature space
         "ball": {"pos": V(), "pitch": 0.0, "yaw": 0.0, "roll": 0.0, "squash": (1.0, 1.0)},
         "form": "frog",
         "period": FLOAT_FRAMES / FPS, "flare": 1.0}                   # the flames' flicker: its loop, how big they burn                                               # the form shown: the other is scaled away
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
        bases["frog"] = skel.set("frog", poses, L @ skel.rest["frog"])
        rigid, squashed = body_motion(p)
        rigid, squashed = L @ rigid, L @ squashed
        bases["body"] = skel.set("body", poses, squashed @ skel.rest["body"])
        r3 = rigid.to_3x3()
        b = p["ball"]
        Rb = C.rot_z(b["yaw"]) @ C.rot_x(b["pitch"]) @ C.rot_y(b["roll"])
        sx, sz = b["squash"]
        ball = L @ Matrix.Translation(b["pos"]) @ K.about(BALL_C, Rb) @ K.about(BALL_C, Matrix.Diagonal((sx, sx, sz)))
        bases["ball"] = skel.set("ball", poses, ball @ skel.rest["ball"])
        for s, sign in SIDES:
            th, sh = f"thigh.{s}", f"shin.{s}"
            hip = rigid @ HIP[s]
            knee, foot = C.two_bone_ik(hip, L @ p["feet"][s], *leg_len[s], r3 @ p["knees"] + V((sign * 0.2, 0, 0)))
            bases[th] = K.aim_at(skel, th, poses, hip, knee - hip)
            bases[sh] = K.aim_at(skel, sh, poses, knee, foot - knee)
            up, lo, hand = f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"
            shoulder = squashed @ SHOULDER[s]
            elbow, wrist = C.two_bone_ik(shoulder, rigid @ p["hands"][s], *arm_len[s], r3 @ p["elbows"][s])
            bases[up] = K.aim_at(skel, up, poses, shoulder, elbow - shoulder)
            bases[lo] = K.aim_at(skel, lo, poses, elbow, wrist - elbow)
            hd = r3 @ p["dirs"][s]
            bases[hand] = K.aim_at(skel, hand, poses, wrist, hd)
            eye = p["eyes"][s]
            at = squashed @ EYES[s] if eye is None else wrist + hd.normalized() * 0.1
            bases[f"eye.{s}"] = K.aim_at(skel, f"eye.{s}", poses, at, r3 @ V((0, -1, 0)))
        # the flames flicker on their bones
        for i, name in enumerate(FLAMES):
            a, b, sc = K.flicker(i, p["t"], p["period"], 1.0)
            g = max(0.02, p["flare"])
            rot = Matrix.Rotation(a, 4, "X") @ Matrix.Rotation(b, 4, "Z")
            bases[name] = K.pose_local(skel, name, poses, rot @ Matrix.Diagonal((g, g * sc, g, 1)))
        # the form not shown, scaled away about its bone (its children solved unscaled, they follow)
        gone = Matrix.Diagonal((HIDDEN,) * 3).to_4x4()
        if p["form"] == "ball":
            bases["frog"] = skel.set("frog", dict(poses), L @ K.about(FROG, gone) @ skel.rest["frog"])
        else:
            bases["ball"] = bases["ball"] @ gone
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
    out["knees"] = a["knees"].lerp(b["knees"], u)
    for key in ("hands", "elbows", "feet"):
        out[key] = {s: a[key][s].lerp(b[key][s], u) for s, _ in SIDES}
    out["dirs"] = {s: a["dirs"][s].lerp(b["dirs"][s], u).normalized() for s, _ in SIDES}
    out["eyes"] = {s: (a["eyes"][s] if u < 0.5 else b["eyes"][s]) for s, _ in SIDES}
    ba, bb = a["ball"], b["ball"]
    out["ball"] = {"pos": ba["pos"].lerp(bb["pos"], u), **{k: ba[k] + (bb[k] - ba[k]) * u for k in ("pitch", "yaw", "roll")},
                   "squash": tuple(x + (y - x) * u for x, y in zip(ba["squash"], bb["squash"]))}
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
    if "ball" in kw:
        p["ball"] = {**base["ball"], **kw.pop("ball")}
    p.update(kw)
    return p


REST = params()


def walk(f):
    n, T = WALK_FRAMES, WALK_FRAMES / FPS
    ph = (f / n) % 1
    w = TAU * ph
    duty, stride = 0.58, WALK_SPEED * 0.58 * T
    feet, hands, dirs = {}, {}, {}
    for s, sign in SIDES:
        y, z = C.foot_track((ph + (0.5 if s == "R" else 0)) % 1, duty, stride, 0.09, WALK_SPEED, T, skew=1.0)
        feet[s] = FOOT[s] + V((0, y, z))
        swing = math.sin(w + (0 if s == "R" else math.pi))
        hands[s] = WRIST[s] + V((0, -0.12 * swing, 0.03 * abs(swing)))
        dirs[s] = (REST_DIR[s] + V((0, -0.4 * swing, 0))).normalized()
    return params(t=f / FPS, period=WALK_FRAMES / FPS, pos=V((0.025 * math.sin(w), 0, -0.02 + 0.025 * abs(math.cos(w)))),
                  pitch=D(4), roll=D(7) * math.sin(w), yaw=D(5) * math.sin(w), squash=(1 + 0.015 * math.cos(2 * w), 1 - 0.02 * math.cos(2 * w)),
                  feet=feet, hands=hands, dirs=dirs)


def eye_keys(s):
    sign = 1 if s == "L" else -1
    hit = EYE_HIT / FPS
    socket = EYES[s]
    reach = pose(REST, roll=D(-8) * sign, pitch=D(-4),
                 hands={s: socket + V((sign * 0.06, -0.16, -0.02))}, dirs={s: (-sign * 0.3, 0.6, 0.6)},
                 elbows={s: (sign * 1, 0.2, -0.3)})
    grip = pose(reach, hands={s: socket + V((sign * 0.05, -0.13, -0.01))}, eyes={**REST["eyes"]})
    pull = pose(reach, roll=D(-12) * sign, pitch=D(-8), squash=(1.02, 0.98),
                hands={s: socket + V((sign * 0.16, -0.3, 0.02))}, dirs={s: (sign * 0.3, -0.8, 0.4)},
                eyes={**REST["eyes"], s: True})
    wound = pose(pull, roll=D(6) * sign, pitch=D(-14), yaw=D(-22) * sign, squash=(0.98, 1.03),
                 hands={s: V((sign * 0.42, 0.28, 1.62))}, dirs={s: (sign * 0.2, 0.6, 0.6)},
                 elbows={s: (sign * 0.8, 0.5, -0.5)})
    throw = pose(REST, roll=D(-4) * sign, pitch=D(14), yaw=D(18) * sign, pos=V((0, -0.05, -0.02)), squash=(1.02, 0.97),
                 hands={s: V((sign * 0.2, -0.62, 1.3))}, dirs={s: (-sign * 0.1, -1, 0.2)},
                 elbows={s: (sign * 1, 0.2, -0.3)}, feet={s: FOOT[s] + V((0, -0.08, 0))}, eyes={**REST["eyes"], s: True})
    follow = pose(throw, pitch=D(18), yaw=D(24) * sign, hands={s: V((-sign * 0.05, -0.55, 0.9))}, dirs={s: (-sign * 0.5, -0.8, -0.3)},
                  eyes={**REST["eyes"]})
    end = EYE_FRAMES / FPS
    return [(0, REST), (0.3, reach), (0.38, grip), (0.48, pull), (hit - 0.1, wound), (hit, throw), (hit + 0.15, follow),
            (end - 0.05, REST), (end, REST)]


def eye_clip(s):
    keys = eye_keys(s)

    def fn(f):
        t = f / FPS
        p = keyed(t, keys)
        out = {**p, "t": t, "eyes": dict(p["eyes"])}
        # (the eye leaves its socket when he plucks it and goes with the throw)
        if 0.43 <= t < EYE_HIT / FPS:
            out["eyes"][s] = True
        else:
            out["eyes"][s] = None
        return out
    return fn


def summon_keys():
    hit = SUMMON_HIT / FPS
    crouch = pose(REST, pos=V((0, 0.02, -0.08)), pitch=D(8), squash=(1.08, 0.9),
                  hands=per_side(lambda s, sign: (sign * 0.42, -0.25, 0.5)), dirs=per_side(lambda s, sign: (sign * 0.3, -0.6, -0.5)),
                  feet=per_side(lambda s, sign: (sign * 0.22, -0.01, FOOT["L"].z)), knees=V((0, -1, 0.4)))
    puff = pose(crouch, squash=(1.12, 0.88))
    croak = pose(REST, pos=V((0, -0.03, 0.04)), pitch=D(-12), squash=(0.93, 1.1),
                 hands=per_side(lambda s, sign: (sign * 0.78, -0.2, 1.25)), dirs=per_side(lambda s, sign: (sign * 1, -0.2, 0.4)),
                 elbows=per_side(lambda s, sign: (sign * 0.3, 0.6, -0.8)), feet=per_side(lambda s, sign: (sign * 0.22, -0.01, FOOT["L"].z)))
    end = SUMMON_FRAMES / FPS
    return [(0, REST), (0.35, crouch), (hit - 0.2, puff), (hit, croak), (hit + 0.3, croak), (end - 0.05, REST), (end, REST)]


def summon(f):
    t = f / FPS
    p = keyed(t, SUMMON_KEYS)
    shake = math.sin(TAU * 9 * t) * C.smoothstep(0.35, 0.5, t) * (1 - C.smoothstep(SUMMON_HIT / FPS - 0.1, SUMMON_HIT / FPS, t))
    return {**p, "t": t, "squash": (p["squash"][0] + 0.03 * shake, p["squash"][1] - 0.02 * shake)}


# the ball form: a bob and wobble of the ball, everything else at rest
def ball(t=0.0, **kw):
    b = {"pos": V(), "pitch": 0.0, "yaw": 0.0, "roll": 0.0, "squash": (1.0, 1.0)}
    b.update(kw)
    return params(t=t, ball=b, form="ball")


def float_(f):
    w = TAU * f / FLOAT_FRAMES
    return ball(f / FPS, pos=V((0, 0, 0.06 * math.sin(w))), pitch=D(4) * math.sin(w + 1), roll=D(5) * math.sin(w),
                squash=(1 + 0.02 * math.sin(2 * w), 1 - 0.025 * math.sin(2 * w)))


def spit(f):
    t, hit = f / FPS, SPIT_HIT / FPS
    k = C.keyframes((0, 0.0), (hit - 0.15, 1.0), (hit, -1.0), (hit + 0.2, -0.6), (SPIT_FRAMES / FPS, 0.0))(t)
    return ball(t, pos=V((0, 0.08 * max(k, 0) - 0.12 * max(-k, 0), 0.02 * k)), pitch=D(-14) * k,
                squash=(1 + 0.06 * max(k, 0) - 0.04 * max(-k, 0), 1 - 0.05 * max(k, 0) + 0.08 * max(-k, 0)))


def geyser(f):
    t, hit = f / FPS, GEYSER_HIT / FPS
    up = C.keyframes((0, 0.0), (0.6, 1.0), (hit - 0.12, 1.15), (hit, -0.35), (hit + 0.25, -0.2), (GEYSER_FRAMES / FPS, 0.0))(t)
    shudder = math.sin(TAU * 13 * t) * C.smoothstep(0.6, 0.8, t) * (1 - C.smoothstep(hit - 0.15, hit - 0.05, t))
    squash = 1 + 0.1 * max(-up, 0) * 2
    return ball(t, pos=V((0.02 * shudder, 0, 0.28 * max(up, 0) + 0.15 * min(up, 0))), roll=D(4) * shudder,
                squash=(squash, 1 / squash ** 1.5))


def cats(f):
    t, hit = f / FPS, CATS_HIT / FPS
    spin = TAU * C.smoothstep(0.1, hit, t)
    lift = C.keyframes((0, 0.0), (hit, 0.25), (CATS_FRAMES / FPS, 0.0))(t)
    flare = C.keyframes((0, 1.0), (hit - 0.1, 0.94), (hit, 1.12), (hit + 0.2, 1.0))(t)
    return ball(t, pos=V((0, 0, lift)), yaw=spin, squash=(flare, flare))


def death(f):
    t = f / FPS
    shudder = math.sin(TAU * 11 * t) * (1 - C.smoothstep(0.2, 0.6, t))
    sink = C.smoothstep(0.4, 1.3, t)
    flat = C.smoothstep(1.0, 1.8, t)
    sz = 1 - 0.55 * flat
    # (squashed, its bottom on the floor)
    z = -(BALL_C.z - BALL_R) * sink - BALL_R * (1 - sz) * 1.0
    p = ball(t, pos=V((0.02 * shudder, 0.05 * sink, z)), roll=D(30) * C.smoothstep(0.9, 1.9, t) + D(5) * shudder,
             squash=(1 + 0.3 * flat, sz))
    p["flare"] = (1 + 0.4 * (1 - C.smoothstep(0.0, 0.4, t))) * (1 - C.smoothstep(0.5, 1.6, t))   # (they flare up, then die down)
    p["t"] = min(t, 1.6)   # (and are still once out: the held end)
    return p


def hand_point(rig, action, frame, s):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[f"hand.{s}"]
    return rig.matrix_world @ (pb.head + (pb.tail - pb.head).normalized() * 0.1)


def bone_point(rig, action, frame, name, point):
    """Where the point (armature space, at rest) riding bone `name` is at that frame."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    local = rig.data.bones[name].matrix_local.inverted() @ point
    return rig.matrix_world @ (rig.pose.bones[name].matrix @ local)


def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


SUMMON_KEYS = None


def animate(rig, obj):
    global SUMMON_KEYS
    SUMMON_KEYS = summon_keys()
    rig.animation_data_create()
    K.ground_clip(rig, obj, "FoggeryWalk", solver(rig, walk), WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    eyes = {}
    for s, _ in SIDES:
        a = K.ground_clip(rig, obj, f"FoggeryEye{s}", solver(rig, eye_clip(s)), EYE_FRAMES,
                          extras={"attack_style": "throw", "hit_frame": EYE_HIT, "hit_time": EYE_HIT / FPS})
        a.pose_markers.new("Throw").frame = EYE_HIT
        eyes[s] = a
    sm = K.ground_clip(rig, obj, "FoggerySummon", solver(rig, summon), SUMMON_FRAMES,
                       extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    K.ground_clip(rig, obj, "FoggeryFloat", solver(rig, float_), FLOAT_FRAMES, cyclic=True, extras={"speed": 1.1, "hover": True})
    sp = K.ground_clip(rig, obj, "FoggerySpit", solver(rig, spit), SPIT_FRAMES,
                       extras={"attack_style": "throw", "hit_frame": SPIT_HIT, "hit_time": SPIT_HIT / FPS})
    gy = K.ground_clip(rig, obj, "FoggeryGeyser", solver(rig, geyser), GEYSER_FRAMES,
                       extras={"attack_style": "cast", "hit_frame": GEYSER_HIT, "hit_time": GEYSER_HIT / FPS})
    ct = K.ground_clip(rig, obj, "FoggeryCats", solver(rig, cats), CATS_FRAMES,
                       extras={"attack_style": "summon", "hit_frame": CATS_HIT, "hit_time": CATS_HIT / FPS})
    K.ground_clip(rig, obj, "FoggeryDeath", solver(rig, death), DEATH_FRAMES, extras={"hold_last_frame": True, "hold_from": 2.0})
    for act, mark, frame in ((sm, "Croak", SUMMON_HIT), (sp, "Spit", SPIT_HIT), (gy, "Geyser", GEYSER_HIT), (ct, "Cats", CATS_HIT)):
        act.pose_markers.new(mark).frame = frame
    K.register(rig, CLIPS)
    for s, _ in SIDES:
        eyes[s]["muzzle"] = game(hand_point(rig, f"FoggeryEye{s}", EYE_HIT, s))
    mouth = V((0, head_front(0, 1.27) - 0.12, 1.27))
    sm["muzzle"] = game(bone_point(rig, "FoggerySummon", SUMMON_HIT, "body", mouth))
    front = BALL_C + V((0, -BALL_R - 0.1, -0.08))
    sp["muzzle"] = game(bone_point(rig, "FoggerySpit", SPIT_HIT, "ball", front))
    ct["muzzle"] = game(bone_point(rig, "FoggeryCats", CATS_HIT, "ball", front))
    return {"eyeL": list(eyes["L"]["muzzle"]), "eyeR": list(eyes["R"]["muzzle"]), "summon": list(sm["muzzle"]),
            "spit": list(sp["muzzle"]), "cats": list(ct["muzzle"])}


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    shots = [("FoggeryWalk", 0, (1.2, -4.2, 1.6)), ("FoggeryWalk", 8, (-3.2, -2.8, 1.4)),
             ("FoggeryEyeL", 14, (2.4, -3.6, 1.6)), ("FoggeryEyeL", EYE_HIT - 3, (3.4, -2.6, 1.5)),
             ("FoggeryEyeR", EYE_HIT, (-2.4, -3.6, 1.6)), ("FoggerySummon", SUMMON_HIT, (1.2, -4.2, 1.6)),
             ("FoggeryFloat", 0, (1.2, -4.2, 1.6)), ("FoggerySpit", SPIT_HIT, (3.4, -2.6, 1.5)),
             ("FoggeryGeyser", GEYSER_HIT - 8, (1.2, -4.2, 1.6)), ("FoggeryDeath", DEATH_FRAMES, (2.4, -3.6, 2.2))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 0.9), size=360, cols=5)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    F.decimate(obj)
    muzzles = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("FoggeryDeath",))
    report["muzzles"] = muzzles
    K.setup_stage(scene, "Foggery", STAGE, (0, 0, 0.9), 2.6, camera=(1.2, -4.2, 1.6))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True             # (it stays at the origin: the game clones it as it is)
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Foggery", NAME, (0, 0, 0.9), 3.2)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Foggery:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "foggery.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "foggery.blend"),
         preview_path=args[2] if len(args) > 2 else None)
