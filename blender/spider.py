"""
"Piep", the first enemy: a clay spider made of tubes with a floating face.

Same construction as the player (blender/figure.py + blender/character.py):
the shape is a signed distance field meshed with OpenVDB, skinned to a small
skeleton, and the animations are procedural + spring physics, baked to keys.

Look:
  * body: an arc of clay beads on a hub with an abdomen behind, very dark gray
  * 8 legs: equal-width tubes, knees arched high, 4 per side
  * floating face (no head): angry brows, glowing green eyes, an upper gum
    with spiky teeth and a separate lower jaw with round teeth

Skeleton: root, body, face (a rod from the body centre to the face, so the
face can float and lag behind on a spring), jaw (child of face), eye.L/eye.R
(non-deforming sockets for point lights), leg{1..4}_upper/_lower.{L,R}
(1 = front).

Animations (in place, 30 fps):
    Walk    -- loop, alternating tetrapod gait at WALK_SPEED (extras: speed)
    Attack  -- rear up with the front legs raised and the jaw open, lunge,
               slam the front legs down and snap the jaw shut, recover
    Death   -- topple onto its back, fold / twitch the legs, drop the face,
               settle into a held corpse pose (2 seconds, extras: hold_last_frame)

Headless regeneration (saves a clean, editable project with all three clips):
    Blender -b --python blender/spider.py -- assets/spider.glb blender/spider.blend

Usage inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, figure, character, spider
    importlib.reload(figure); importlib.reload(character); importlib.reload(spider)
    spider.main(export_path="<repo>/assets/spider.glb")
"""
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import numpy as np
from mathutils import Matrix, Vector

import character as C
import figure as F

FPS = C.FPS
D = math.radians
NAME = "Spider"
RIG_NAME = "SpiderRig"

# --- shape (metres, faces -Y, +X is the spider's left) -----------------------
BODY_C = Vector((0.0, 0.0, 0.45))           # body bone pivot
BEAD_R = 0.11
BEADS = [Vector((0.24 * math.sin(D(a)), -0.24 * math.cos(D(a)) + 0.10, 0.47)) for a in (-70, -35, 0, 35, 70)]
HUB = (Vector((0.0, 0.08, 0.45)), 0.17)
ABDOMEN = (Vector((0.0, 0.38, 0.52)), 0.22)
BODY_FILLET = 0.05

LEG_R = 0.05
LEG_FILLET = 0.03
LEG_YAW = (32, 72, 112, 148)                # degrees from straight ahead
ROOT_RAD, KNEE_RAD, KNEE_Z, FOOT_RAD = 0.18, 0.48, 0.98, 1.0
FOOT_Z = LEG_R                              # foot tip touches the floor

FACE_C = Vector((0.0, -0.22, 1.18))
FS = 1.35                                   # face scale
EYE_R = 0.065 * FS
EYES = [FACE_C + Vector((s * 0.12, -0.02, 0.11)) * FS for s in (1, -1)]
BROW_R = 0.026 * FS
BROWS = [(FACE_C + Vector((s * 0.035, -0.02, 0.21)) * FS, FACE_C + Vector((s * 0.22, -0.02, 0.31)) * FS)
         for s in (1, -1)]
GUM_R = 0.032 * FS
TEETH_COLOR = (0.80, 0.77, 0.68, 1.0)
BODY_COLOR = (0.035, 0.035, 0.038, 1.0)
EYE_COLOR = (0.18, 1.0, 0.12, 1.0)
EYE_STRENGTH = 2.5
JAW_HINGE = FACE_C + Vector((0.0, 0.03, -0.08)) * FS
JAW_DROP = 0.15                             # how far the lower jaw drops when fully open (55 deg)

WALK_FRAMES, WALK_SPEED = 24, 1.0


def leg_points(side_sign, i):
    """root, knee, foot of leg i (0 = front) on one side, rest pose."""
    a = D(LEG_YAW[i])
    out = Vector((side_sign * math.sin(a), -math.cos(a), 0.0))
    root = BODY_C + out * ROOT_RAD
    knee = Vector((out.x * KNEE_RAD, out.y * KNEE_RAD, KNEE_Z))
    foot = Vector((out.x * FOOT_RAD, out.y * FOOT_RAD, FOOT_Z))
    return root, knee, foot


def all_legs():
    for side, s in (("L", 1), ("R", -1)):
        for i in range(4):
            yield side, s, i, leg_points(s, i)


def _gum(z0, curve, y_back, half):
    xs = np.linspace(-half, half, 9)
    return [FACE_C + Vector((x, y_back * (x / half) ** 2, z0 + curve * (x / half) ** 2)) * FS for x in xs]


UPPER_GUM = _gum(-0.04, -0.03, 0.04, 0.27)
LOWER_GUM = _gum(-0.25, 0.03, 0.04, 0.23)


def _gum_at(gum, x):
    x = FACE_C.x + x * FS
    xs = [p.x for p in gum]
    return Vector((x, float(np.interp(x, xs, [p.y for p in gum])), float(np.interp(x, xs, [p.z for p in gum]))))


# --- SDF ---------------------------------------------------------------------
def sd_round_cone(P, a, b, r1, r2):
    """Capsule whose radius goes from r1 at a to r2 at b (tooth)."""
    a, b = np.asarray(a, np.float32), np.asarray(b, np.float32)
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    xv = pa * l2 - y[..., None] * ba
    x2 = np.einsum("...i,...i", xv, xv)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - r1
    d = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, d)
    d = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2, d)
    return d


def body_sdf(P):
    d = F._sd_sphere(P, HUB[0], HUB[1])
    d = F._smin(d, F._sd_sphere(P, ABDOMEN[0], ABDOMEN[1]), BODY_FILLET)
    for b in BEADS:
        d = F._smin(d, F._sd_sphere(P, b, BEAD_R), BODY_FILLET)
    legs = None
    for _, _, _, pts in all_legs():
        t = F._sd_polyline(P, pts, LEG_R)
        legs = t if legs is None else np.minimum(legs, t)
    d = F._smin(d, legs, LEG_FILLET)
    return F._smax(d, -P[..., 2], 0.01)     # nothing below the floor


def eyes_sdf(P):
    return np.minimum(*(F._sd_sphere(P, e, EYE_R) for e in EYES))


def brows_sdf(P):
    return np.minimum(*(F._sd_polyline(P, b, BROW_R) for b in BROWS))


def upper_gum_sdf(P):
    return F._sd_polyline(P, UPPER_GUM, GUM_R)


def lower_gum_sdf(P):
    return F._sd_polyline(P, LOWER_GUM, GUM_R)


def upper_teeth_sdf(P):
    d = None
    for j, x in enumerate(np.linspace(-0.22, 0.22, 6)):
        base = _gum_at(UPPER_GUM, x)
        length = (0.15 if j in (1, 4) else 0.12) * FS           # two fangs a bit longer
        t = sd_round_cone(P, base, base + Vector((0, -0.01, -length)), 0.042 * FS, 0.006)
        d = t if d is None else np.minimum(d, t)
    return d


def lower_teeth_sdf(P):
    d = None
    for x in np.linspace(-0.17, 0.17, 5):
        base = _gum_at(LOWER_GUM, x)
        t = F._sd_polyline(P, [base, base + Vector((0, -0.005, 0.05 * FS))], 0.034 * FS)
        d = t if d is None else np.minimum(d, t)
    return d


# --- mesh ----------------------------------------------------------------------
def _material(name, color, emission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.55
    if emission:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = color      # viewport / workbench colour
    return mat


def _mesh_arrays(sdf, pts, pad, voxel):
    pts = np.array([tuple(p) for p in pts])
    me = F._sdf_to_mesh("tmp", sdf, pts.min(axis=0) - pad, pts.max(axis=0) + pad, voxel)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    loops = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", loops)
    bpy.data.meshes.remove(me)
    return co.reshape(-1, 3), loops.reshape(-1, 4)


def build_mesh(scene):
    old = bpy.data.objects.get(NAME)
    if old is not None:
        data = old.data
        bpy.data.objects.remove(old)
        bpy.data.meshes.remove(data)

    leg_pts = [p for *_, pts in all_legs() for p in pts]
    body_pts = leg_pts + BEADS + [HUB[0], ABDOMEN[0]]
    face_pts = UPPER_GUM + LOWER_GUM + EYES + [p for b in BROWS for p in b]
    parts = [  # (name, sdf, points, pad, voxel, material index, rigid bone or None)
        ("body", body_sdf, body_pts, 0.3, 0.030, 0, None),
        ("brows", brows_sdf, [p for b in BROWS for p in b], 0.08, 0.018, 0, "face"),
        ("upper_gum", upper_gum_sdf, UPPER_GUM, 0.08, 0.018, 0, "face"),
        ("upper_teeth", upper_teeth_sdf, UPPER_GUM, 0.25, 0.015, 1, "face"),
        ("lower_gum", lower_gum_sdf, LOWER_GUM, 0.08, 0.018, 0, "jaw"),
        ("lower_teeth", lower_teeth_sdf, LOWER_GUM, 0.14, 0.015, 1, "jaw"),
        ("eyes", eyes_sdf, EYES, 0.12, 0.020, 2, "face"),
    ]
    cos, quads, mats, owners = [], [], [], []
    offset = 0
    for name, sdf, pts, pad, voxel, mat, bone in parts:
        co, q = _mesh_arrays(sdf, pts, pad, voxel)
        cos.append(co)
        quads.append(q + offset)
        mats.append(np.full(len(q), mat, np.int32))
        owners.append((offset, offset + len(co), bone))
        offset += len(co)
    co = np.concatenate(cos)
    q = np.concatenate(quads)

    me = bpy.data.meshes.new(NAME)
    me.vertices.add(len(co))
    me.vertices.foreach_set("co", co.ravel())
    me.loops.add(len(q) * 4)
    me.loops.foreach_set("vertex_index", q.ravel())
    me.polygons.add(len(q))
    me.polygons.foreach_set("loop_start", np.arange(0, len(q) * 4, 4, dtype=np.int32))
    me.polygons.foreach_set("material_index", np.concatenate(mats))
    me.update()
    me.validate()
    me.shade_smooth()
    for name, color, em in (("SpiderBody", BODY_COLOR, 0.0), ("SpiderTeeth", TEETH_COLOR, 0.0),
                            ("SpiderEyes", EYE_COLOR, EYE_STRENGTH)):
        me.materials.append(_material(name, color, em))
    ob = bpy.data.objects.new(NAME, me)
    scene.collection.objects.link(ob)
    return ob, owners


# --- rig -----------------------------------------------------------------------
def leg_bone(side, i, part):
    return f"leg{i + 1}_{part}.{side}"


def build_rig(scene):
    old = bpy.data.objects.get(RIG_NAME)
    if old is not None:
        data = old.data
        bpy.data.objects.remove(old)
        bpy.data.armatures.remove(data)
    arm = bpy.data.armatures.new(RIG_NAME)
    rig = bpy.data.objects.new(RIG_NAME, arm)
    scene.collection.objects.link(rig)
    rig.show_in_front = True
    arm.display_type = "STICK"
    vl = bpy.context.view_layer
    for o in vl.objects:
        if o is not None:
            o.select_set(False)
    vl.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    up, fwd = Vector((0, 0, 1)), Vector((0, -1, 0))

    def bone(name, head, tail, parent=None, connect=False, roll_to=up, deform=True):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.align_roll(roll_to)
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    bone("root", (0, 0, 0), (0, 0.3, 0))
    bone("body", BODY_C, BODY_C + Vector((0, -0.3, 0)), "root")
    bone("face", BODY_C, FACE_C, "body", roll_to=fwd)
    bone("jaw", JAW_HINGE, JAW_HINGE + Vector((0, -0.15, 0)), "face")
    for side, e in zip(("L", "R"), EYES):
        bone(f"eye.{side}", e, e + Vector((0, -0.08, 0)), "face", deform=False)
    for side, s, i, (root, knee, foot) in all_legs():
        bone(leg_bone(side, i, "upper"), root, knee, "body")
        bone(leg_bone(side, i, "lower"), knee, foot, leg_bone(side, i, "upper"), True)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return rig


def compute_weights(ob, owners):
    """Face parts are rigid on face / jaw.  Body and legs: closest part wins,
    legs blend body -> upper -> lower along the leg, then surface diffusion."""
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    P = co.reshape(-1, 3)
    bones = [b.name for b in ob.parent.data.bones if b.use_deform and b.name != "root"]
    W = np.zeros((len(P), len(bones)), np.float32)

    lo, hi, _ = owners[0]
    B = P[lo:hi]
    d_body = F._sd_sphere(B, HUB[0], HUB[1])
    d_body = np.minimum(d_body, F._sd_sphere(B, ABDOMEN[0], ABDOMEN[1]))
    for b in BEADS:
        d_body = np.minimum(d_body, F._sd_sphere(B, b, BEAD_R))
    parts = [(d_body, {"body": np.ones(len(B))})]
    blend = 0.05
    for side, s, i, (root, knee, foot) in all_legs():
        d, t = C._polyline_closest(B, [root, knee, foot])
        s_out = 0.08                                    # where the leg leaves the body
        s_knee = (knee - root).length
        w_body = 1 - C.np_smoothstep(s_out - blend, s_out + blend, t)
        w_lower = C.np_smoothstep(s_knee - blend, s_knee + blend, t)
        w_upper = np.clip(1 - w_body - w_lower, 0, 1)
        parts.append((d - LEG_R, {"body": w_body, leg_bone(side, i, "upper"): w_upper,
                                  leg_bone(side, i, "lower"): w_lower}))
    Dm = np.stack([p[0] for p in parts], axis=1)
    M = np.exp(-(Dm - Dm.min(axis=1, keepdims=True)) / 0.006)
    M /= M.sum(axis=1, keepdims=True)
    WB = np.zeros((len(B), len(bones)), np.float32)
    for k, (_, wd) in enumerate(parts):
        for bn, w in wd.items():
            WB[:, bones.index(bn)] += M[:, k] * w
    # surface diffusion on the body/leg part only
    E = np.empty(len(me.edges) * 2, np.int32)
    me.edges.foreach_get("vertices", E)
    E = E.reshape(-1, 2)
    E = E[(E[:, 0] < hi) & (E[:, 1] < hi)] - lo
    deg = np.bincount(E.ravel(), minlength=len(B)).astype(np.float32)[:, None]
    for _ in range(10):
        acc = np.zeros_like(WB)
        np.add.at(acc, E[:, 0], WB[E[:, 1]])
        np.add.at(acc, E[:, 1], WB[E[:, 0]])
        WB += 0.5 * (acc / np.maximum(deg, 1) - WB)
    W[lo:hi] = WB
    for lo, hi, bone in owners[1:]:
        W[lo:hi, bones.index(bone)] = 1.0

    order = np.argsort(-W, axis=1)
    W[np.arange(len(P))[:, None], order[:, 4:]] = 0.0
    W /= W.sum(axis=1, keepdims=True)
    ob.vertex_groups.clear()
    for j, bn in enumerate(bones):
        vg = ob.vertex_groups.new(name=bn)
        col = W[:, j]
        for i in np.nonzero(col > 1e-4)[0]:
            vg.add([int(i)], float(col[i]), "REPLACE")


# --- motion ----------------------------------------------------------------------
FACE_SPRING = (0.70, 45.0, 0.28)      # rod length, stiffness, damping: a floaty, laggy face
ATTACK_FACE_SPRING = (0.70, 160.0, 0.5)   # the face follows the strike closely and settles


def solve(skel, params, n_frames, face_spring=FACE_SPRING):
    """params(f) -> {"body_pos", "body_rot": (pitch, roll, yaw), "feet": {(side, i): Vector},
    "face_tilt": (pitch, roll), "jaw": open angle}."""
    P = [params(f) for f in range(n_frames)]
    poses = [dict() for _ in range(n_frames)]
    bases = [dict() for _ in range(n_frames)]
    for f, prm in enumerate(P):
        ps, bs = poses[f], bases[f]
        bs["root"] = skel.set("root", ps, skel.base("root", ps))
        pitch, roll, yaw = prm["body_rot"]
        R = C.rot_z(yaw) @ C.rot_x(pitch) @ C.rot_y(roll)
        bs["body"] = skel.set("body", ps, Matrix.Translation(prm["body_pos"]) @ (R @ skel.rest_rot["body"]).to_4x4())
        body_R = skel.frame_rot("body", ps)
        for side, s, i, (root, knee, foot) in all_legs():
            up_name, lo_name = leg_bone(side, i, "upper"), leg_bone(side, i, "lower")
            hip = skel.base(up_name, ps).translation
            out = body_R @ Vector((s * math.sin(D(LEG_YAW[i])), -math.cos(D(LEG_YAW[i])), 0.0))
            pole = (body_R @ Vector((0, 0, 1))) + out * 0.3
            k, ft = C.two_bone_ik(hip, prm["feet"][(side, i)], (knee - root).length, (foot - knee).length, pole)
            bs[up_name] = skel.aim(up_name, ps, k - hip)
            bs[lo_name] = skel.aim(lo_name, ps, ft - k)

    # the floating face: a spring-loaded rod from the body centre, no gravity (it floats)
    rest_dir = (FACE_C - BODY_C).normalized()
    pivots = [skel.base("face", poses[f]).translation for f in range(n_frames)]
    targets = [skel.frame_rot("body", poses[f]) @ C.rot_x(P[f]["face_tilt"][0]) @ C.rot_y(P[f]["face_tilt"][1])
               @ rest_dir for f in range(n_frames)]
    L, k, z = face_spring
    dirs = C.simulate(pivots, targets, L, k, z, gravity=0.0)
    for f in range(n_frames):
        bases[f]["face"] = skel.aim("face", poses[f], dirs[f])
        # a floating face has no skull to hinge on: opening is mostly a drop of
        # the lower jaw (local -Z) with a slight tilt
        base = skel.base("jaw", poses[f])
        open_ = P[f]["jaw"]
        drop = JAW_DROP * open_ / D(55)
        bases[f]["jaw"] = skel.set("jaw", poses[f], base @ Matrix.Translation((0, 0, -drop))
                                   @ Matrix.Rotation(-0.3 * open_, 4, "X"))
    return bases


def rest_feet():
    return {(side, i): pts[2].copy() for side, s, i, pts in all_legs()}


def walk_params(n):
    """Alternating tetrapod gait: L1 R2 L3 R4 swing together, then the others."""
    T = n / FPS
    duty = 0.56
    stride = WALK_SPEED * duty * T
    rest = rest_feet()

    def params(f):
        ph = (f / n) % 1
        w = 2 * math.pi * ph
        feet = {}
        for side, s, i, pts in all_legs():
            group = (i + (0 if side == "L" else 1)) % 2
            y, z = C.foot_track((ph + 0.5 * group) % 1, duty, stride, 0.13, WALK_SPEED, T, skew=0.9)
            feet[(side, i)] = rest[(side, i)] + Vector((0, y, z))
        return {
            "body_pos": BODY_C + Vector((0.012 * math.sin(w), 0, 0.018 * math.cos(2 * w))),
            "body_rot": (D(2) * math.sin(2 * w), D(2.5) * math.sin(w), D(3) * math.cos(w)),
            "feet": feet,
            "face_tilt": (D(4) * math.sin(2 * w + 0.6), D(5) * math.sin(w + 0.4)),
            "jaw": D(6) + D(5) * math.sin(4 * w),        # chattering
        }
    return params


def attack_params():
    """Rear up (front legs raised, jaw wide open), lunge, slam the front legs
    down and bite, recover."""
    rest = rest_feet()
    kf = C.keyframes
    t_up, t_hit, t_hold, t_end = 0.32, 0.42, 0.56, 1.05
    body_y = kf((0.04, 0.0), (t_up, 0.12), (t_hit, -0.22), (t_hold, -0.20), (t_end, 0.0))
    body_z = kf((0.04, 0.0), (t_up, 0.14), (t_hit, -0.08), (t_hold, -0.07), (t_end, 0.0))
    pitch = kf((0.04, 0.0), (t_up, D(-18)), (t_hit, D(12)), (t_hold, D(10)), (t_end, 0.0))
    jaw = kf((0.04, D(6)), (t_up - 0.04, D(55)), (t_hit - 0.03, D(55)), (t_hit, D(0)), (t_hold, D(2)), (t_end, D(6)))
    # relative to the body: counter the rear-up so the face stays over the front, then
    # lunge forward and down into the bite
    face = kf((0.04, 0.0), (t_up, D(10)), (t_hit, D(5)), (t_hold, D(4)), (t_end, 0.0))
    front = {}
    for side, s in (("L", 1), ("R", -1)):
        r = rest[(side, 0)]
        front[side] = kf((0.04, r), (t_up, Vector((s * 0.40, -0.72, 0.62))), (t_hit, Vector((s * 0.40, -1.10, FOOT_Z))),
                         (t_hold, Vector((s * 0.40, -1.08, FOOT_Z))), (t_end - 0.1, r))

    def params(f):
        t = max(0.0, (f - PRE) / FPS)
        shake = D(2.5) * math.sin(60 * t) * math.exp(-12 * (t - t_hit)) if t > t_hit else 0.0
        feet = rest_feet()
        for side in ("L", "R"):
            feet[(side, 0)] = front[side](t).copy()
        return {
            "body_pos": BODY_C + Vector((0, body_y(t), body_z(t))),
            "body_rot": (pitch(t) + shake, 0.0, 0.0),
            "feet": feet,
            "face_tilt": (face(t), 0.0),
            "jaw": jaw(t),
        }
    n = int(round(t_end * FPS)) + 1
    return params, n


PRE = int(0.6 * FPS)


def death_frames(skel):
    """A floor-bound back-flop with curled legs; all motion ends by 1.35s."""
    kf = C.keyframes
    pitch = kf((0.03, 0.0), (0.15, D(-8)), (0.68, D(177)), (0.95, D(183)), (1.25, D(180)))
    height = kf((0.0, BODY_C.z), (0.22, 0.54), (0.70, 0.23), (0.84, 0.28), (1.25, 0.24))
    jaw = kf((0.0, D(6)), (0.2, D(45)), (1.2, D(20)))
    rest_dir = (FACE_C - BODY_C).normalized()
    frames = []
    for f in range(2 * FPS + 1):
        t = f / FPS
        ps, bs = {}, {}
        bs["root"] = skel.set("root", ps, skel.base("root", ps))
        rotation = C.rot_x(pitch(t))
        pos = Vector((0, 0.08 * C.smoothstep(0.1, 0.8, t), height(t)))
        bs["body"] = skel.set("body", ps, Matrix.Translation(pos) @ (rotation @ skel.rest_rot["body"]).to_4x4())
        collapse = C.smoothstep(0.08, 0.85, t)
        twitch = (1 - C.smoothstep(0.55, 1.25, t)) * C.smoothstep(0.08, 0.4, t)
        for side, sign, i, (root, knee, foot) in all_legs():
            upper, lower = leg_bone(side, i, "upper"), leg_bone(side, i, "lower")
            hip = skel.base(upper, ps).translation
            folded = pos + rotation @ Vector((foot.x * 0.7, foot.y * 0.7, -0.65))
            target = foot.lerp(folded, collapse)
            target += Vector((sign * 0.035, 0, 0.065)) * (math.sin(t * 32 + i * 1.7) * twitch)
            out = rotation @ Vector((sign * math.sin(D(LEG_YAW[i])), -math.cos(D(LEG_YAW[i])), 0))
            pole = Vector((0, 0, 1)) + out * 0.2
            k, end = C.two_bone_ik(hip, target, (knee - root).length, (foot - knee).length, pole)
            bs[upper] = skel.aim(upper, ps, k - hip)
            bs[lower] = skel.aim(lower, ps, end - k)
        direction = (rotation @ rest_dir).lerp(Vector((0, -1, 0.24)).normalized(), C.smoothstep(0.1, 0.7, t))
        bs["face"] = skel.aim("face", ps, direction.normalized())
        base = skel.base("jaw", ps)
        opening = jaw(t)
        bs["jaw"] = skel.set("jaw", ps, base @ Matrix.Translation((0, 0, -JAW_DROP * opening / D(55)))
                            @ Matrix.Rotation(-0.3 * opening, 4, "X"))
        frames.append(bs)
    return frames


def make_animations(rig, ob):
    skel = C.Skeleton(rig)
    cycles = 6
    n = WALK_FRAMES
    frames = solve(skel, walk_params(n), n * cycles + 1)
    C.bake_action(rig, "SpiderWalk", frames[n * (cycles - 1):], True, {"speed": WALK_SPEED},
                  loc_bones=("body", "jaw"))
    params, n = attack_params()
    frames = solve(skel, params, n + PRE, face_spring=ATTACK_FACE_SPRING)
    C.bake_action(rig, "SpiderAttack", frames[PRE:], False,
                  {"hit_time": 0.42, "contact_frame": 13}, loc_bones=("body", "jaw"))
    frames = death_frames(skel)
    props = {"duration": 2.0, "hold_last_frame": True, "hold_from": 1.35}
    act = C.bake_action(rig, "SpiderDeath", frames, False, props, loc_bones=("body", "jaw"))
    minima = C.mesh_min_z(rig, ob, act)
    # Every surface part is under body, so this uniform lift preserves the curl
    # while preventing thin feet, teeth or the abdomen from penetrating ground.
    for f, minimum in enumerate(minima):
        frames[f]["body"].translation.z += max(0.0, -float(minimum))
    C.bake_action(rig, "SpiderDeath", frames, False, props, loc_bones=("body", "jaw"))
    C.register_actions(rig, ("SpiderWalk", "SpiderAttack", "SpiderDeath"))


def add_eye_lights(rig):
    """Point lights on the eye sockets, for previews in Blender (the game adds its own)."""
    for side in ("L", "R"):
        name = f"SpiderEyeLight.{side}"
        old = bpy.data.objects.get(name)
        if old is not None:
            ld = old.data
            bpy.data.objects.remove(old)
            bpy.data.lights.remove(ld)
        light = bpy.data.lights.new(name, "POINT")
        light.color = EYE_COLOR[:3]
        light.energy = 15.0
        light.shadow_soft_size = 0.05
        ob = bpy.data.objects.new(name, light)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = rig
        ob.parent_type = "BONE"
        ob.parent_bone = f"eye.{side}"
        ob.location = (0, -0.12, 0)   # bone tail is the parent space origin; sit just in front of the eye


def main(scene=None, export_path=None, active_action="SpiderWalk"):
    scene = scene or bpy.context.scene
    scene.render.fps = FPS
    obj = getattr(bpy.context, "object", None)
    if obj is not None and obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    rig = build_rig(scene)
    ob, owners = build_mesh(scene)
    ob.parent = rig
    ob.modifiers.new("Armature", "ARMATURE").object = rig
    compute_weights(ob, owners)
    F.decimate(ob)
    make_animations(rig, ob)
    add_eye_lights(rig)
    act = bpy.data.actions[active_action]
    rig.animation_data.action = act
    scene.frame_start = 0
    scene.frame_end = int(act.frame_end) - (1 if act.use_cyclic else 0)
    if export_path:
        C.export_gltf(rig, ob, export_path)
    return rig, ob


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig, mesh = main(export_path=str(Path(args[0]).resolve() if args else Path(__file__).resolve().parent.parent / "assets" / "spider.glb"))
    minima = C.mesh_min_z(rig, mesh, bpy.data.actions["SpiderDeath"])
    assert minima.min() > -0.002, ("SpiderDeath floor contact", float(minima.min()))
    rig.animation_data.action = bpy.data.actions["SpiderWalk"]
    bpy.context.scene.frame_set(0)
    if len(args) > 1:
        F.setup_stage(bpy.context.scene)
        bpy.context.scene.camera.data.ortho_scale = 3.3
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(args[1]).resolve()))
