"""
Stunder: a heavy green clay creature from IMG_6877's stance / attack sketches.

A tall continuous body, two short ribbed feet, no arms, enormous paired
spike-edged leaf ears, orange eyes, and a small toothy mouth. Faces -Y in
Blender, +Z up; one unit = one game cell. About 2.75 cells tall including
its ears (the player, at game scale, is about 1.1). Green is a slightly
muted, yellow-shifted version of #408f28 to fit the game's clay palette.

The sculpt is an OpenVDB SDF, like figure.py / spider.py. All visible parts
are joined into ONE smooth-shaded skinned mesh, with plain materials. The
22-bone rig bends the continuous body and flexes both ears. Eye sockets
and horn-tip sockets are provided for later integration, not game logic.

Build the asset first, without animation (inside Blender / MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, stunder; importlib.reload(stunder)
    rig, mesh = stunder.build()
    stunder.setup_stage()

Then animate / export:
    stunder.animate(rig, mesh)
    stunder.export_gltf(rig, mesh, "<repo>/assets/stunder.glb")

Or build everything:
    stunder.main(export_path="<repo>/assets/stunder.glb",
                 blend_path="<repo>/blender/stunder.blend")

Headless (Blender's bundled Python needs OpenVDB, as for the other enemies):
    Blender -b --python blender/stunder.py -- assets/stunder.glb blender/stunder.blend
    Blender -b --python blender/stunder.py -- --static /tmp/stunder-static.blend

Clips, 30 fps; locomotion is IN PLACE, the game supplies root movement:
    StunderWalk      40-frame heavy walk, 0.45 cells/s, looping
    StunderWalkFast  24-frame quick walk, 1.05 cells/s; belly / head / ears wiggle
    StunderAttack    1.6 s; lower the head, crouch, ram / bite DOWN, recover
    StunderDeath     2.4 s; buckle, fall face-first, settle, stay dead

Attack never rears its head up to strike. Contact is at frame 16 (0.533 s);
only recovery lifts the head. Death ends in a held collapsed pose, not a
return to standing. The eye geometry closes during death (no unsupported
animated-material extensions). Walking endpoints match exactly. All
animation, ear follow-through, analytic leg IK and mesh floor corrections
are baked; the GLB needs no runtime constraints or simulation.
"""
import argparse
import math
from pathlib import Path
import subprocess
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

# Allow headless execution from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import figure as F

NAME = "Stunder"
RIG_NAME = "StunderRig"
COLLECTION = "StunderAsset"
STAGE_COLLECTION = "StunderStage"
FPS = 30
D = math.radians
TAU = math.tau
BODY_HEX = "#488b32"
EAR_INNER_HEX = "#78a951"
RIDGE_HEX = "#609742"
DARK_HEX = "#203e1c"
EYE_HEX = "#ff7c14"
TEETH_HEX = "#e4ddbb"
EYE_STRENGTH = 0.9
BODY_VOXEL = 0.032
EAR_VOXEL = 0.023
DETAIL_VOXEL = 0.012
HIP_C = Vector((0, 0, 0.53))
SPINE_LOWER = Vector((0, 0, 0.62))
SPINE_UPPER = Vector((0, 0, 1.12))
HEAD_C = Vector((0, 0, 1.61))
FOOT_Z = 0.13
LEG_X = 0.32
JAW_C = Vector((0, -0.15, 1.46))
WALK_FRAMES, WALK_SPEED = 40, 0.45
FAST_FRAMES, FAST_SPEED = 24, 1.05
ATTACK_FRAMES = 48
HIT_FRAME = 16
DEATH_FRAMES = 72
CLIPS = ("StunderWalk", "StunderWalkFast", "StunderAttack", "StunderDeath")
SIDES = (("L", 1), ("R", -1))


def rgba(hex_color):
    rgb = [int(hex_color[1 + i:3 + i], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb) + (1,)


def material(name, hex_color, emission=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    color = rgba(hex_color)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.64
    bsdf.inputs["Subsurface Weight"].default_value = 0.045 if not emission else 0
    bsdf.inputs["Subsurface Radius"].default_value = (0.05, 0.05, 0.05)
    bsdf.inputs["Emission Color"].default_value = color if emission else (0, 0, 0, 1)
    bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = color
    return mat


def collection(name, scene):
    coll = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    return coll


def remove_asset():
    coll = bpy.data.collections.get(COLLECTION)
    if coll:
        for obj in list(coll.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data and data.use_fake_user:
                data.use_fake_user = False
            if data and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Armature):
                    bpy.data.armatures.remove(data)
    for name in (NAME, RIG_NAME):
        if bpy.data.objects.get(name):
            raise ValueError(f"Unrelated object already named {name}; refusing to replace it")


# --- sculpture ---------------------------------------------------------------
def ellipsoid(P, center, radii):
    """IQ ellipsoid distance approximation; retains a well-behaved zero surface."""
    q = P - np.asarray(center, np.float32)
    r = np.asarray(radii, np.float32)
    k0 = np.linalg.norm(q / r, axis=-1)
    k1 = np.linalg.norm(q / (r * r), axis=-1)
    return np.where(k1 > 1e-8, k0 * (k0 - 1) / np.maximum(k1, 1e-8), -min(r))


def round_cone(P, a, b, r1, r2):
    """Exact capped cone with rounded ends; the spikes look pressed into clay."""
    a, b = np.asarray(a, np.float32), np.asarray(b, np.float32)
    ba, rr = b - a, r1 - r2
    l2 = float(ba @ ba)
    a2, il2 = l2 - rr * rr, 1 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    xv = pa * l2 - y[..., None] * ba
    x2 = np.einsum("...i,...i", xv, xv)
    y2, z2 = y * y * l2, z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, d)
    return np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2, d)


def leg_points(sign):
    return (Vector((sign * 0.27, 0, 0.55)),
            Vector((sign * 0.32, -0.065, 0.32)),
            Vector((sign * LEG_X, -0.025, FOOT_Z)))


def trunk_sdf(P):
    Q = P.copy()
    Q[..., 1] /= 0.85
    trunk = F._sd_polyline(Q, [(0, 0.02, 0.68), (0, 0, 1.80)], 0.32)
    hips = ellipsoid(P, (0, 0.015, 0.57), (0.40, 0.275, 0.245))
    belly = ellipsoid(P, (0, -0.01, 1.04), (0.345, 0.285, 0.53))
    return F._smin(F._smin(trunk, hips, 0.055), belly, 0.035)


def body_sdf(P):
    d = trunk_sdf(P)
    for side, sign in SIDES:
        hip, knee, ankle = leg_points(sign)
        leg = round_cone(P, hip, knee, 0.15, 0.125)
        leg = F._smin(leg, round_cone(P, knee, ankle, 0.125, 0.13), 0.035)
        foot = ellipsoid(P, (sign * LEG_X, -0.085, FOOT_Z), (0.185, 0.225, 0.145))
        leg = F._smin(leg, foot, 0.035)
        d = F._smin(d, leg, 0.045)
    # A recessed mouth, not a floating black sticker.
    cavity = ellipsoid(P, (0, -0.275, 1.50), (0.166, 0.105, 0.135))
    d = F._smax(d, -cavity, 0.009)
    return F._smax(d, -P[..., 2], 0.01)


def ear_points(sign):
    return Vector((sign * 0.235, 0.025, 1.95)), Vector((sign * 0.82, 0.04, 2.68))


def ear_frame(sign):
    a, b = ear_points(sign)
    axis = (b - a).normalized()
    across = Vector((sign * axis.z, 0, -abs(axis.x))).normalized()
    depth = axis.cross(across).normalized()
    return a, b, axis, across, depth


def ear_spikes(sign):
    a, b, axis, across, depth = ear_frame(sign)
    spikes = []
    for edge in (-1, 1):
        for i, t in enumerate((0.20, 0.37, 0.55, 0.73, 0.87)):
            width = 0.172 * math.sin(math.pi * t) ** 0.72
            base = a.lerp(b, t) + across * edge * width * 0.80
            length = (0.14 if edge == 1 else 0.12) * (1 - 0.25 * t)
            tip = base + across * edge * length + axis * (0.045 + i * 0.005)
            spikes.append((base, tip))
    return spikes


def ear_sdf(P, sign):
    a, b, axis, across, depth = ear_frame(sign)
    center = a.lerp(b, 0.49)
    Q = P - np.asarray(center, np.float32)
    local = np.stack((Q @ np.asarray(across), Q @ np.asarray(depth), Q @ np.asarray(axis)), axis=-1)
    d = ellipsoid(local, (0, 0, 0), (0.178, 0.080, (b - a).length * 0.51))
    root = round_cone(P, a - axis * 0.06, a + axis * 0.16, 0.068, 0.105)
    d = F._smin(d, root, 0.025)
    for base, tip in ear_spikes(sign):
        d = F._smin(d, round_cone(P, base, tip, 0.041, 0.006), 0.016)
    return d


def gum_points(lower=False):
    z = 1.405 if lower else 1.595
    return [Vector((x, -0.274 - 0.024 * (1 - (x / 0.14) ** 2),
                    z + (-0.01 if lower else 0.01) * (x / 0.14) ** 2))
            for x in np.linspace(-0.14, 0.14, 9)]


def teeth_sdf(P, lower=False):
    d = None
    for i, x in enumerate((-0.095, 0, 0.095)):
        start = Vector((x, -0.285, 1.43 if lower else 1.58))
        length = 0.064 if lower else (0.084 if i != 1 else 0.071)
        end = start + Vector((0, -0.005, length if lower else -length))
        tooth = round_cone(P, start, end, 0.032, 0.007)
        d = tooth if d is None else np.minimum(d, tooth)
    return d


def eye_position(sign):
    return Vector((sign * 0.13, -0.271, 1.895))


def _part(sdf, lo, hi, voxel):
    mesh = F._sdf_to_mesh("StunderPart", sdf, lo, hi, voxel)
    co = np.empty(len(mesh.vertices) * 3, np.float32)
    q = np.empty(len(mesh.loops), np.int32)
    mesh.vertices.foreach_get("co", co)
    mesh.loops.foreach_get("vertex_index", q)
    bpy.data.meshes.remove(mesh)
    return co.reshape(-1, 3), q.reshape(-1, 4)


def build_mesh(scene, coll):
    """Assemble the clay sculpture; part ranges are retained for skinning."""
    vertices, quads, materials, owners = [], [], [], []
    offset = 0

    def add(kind, sdf, lo, hi, voxel, mat=0, side=None):
        nonlocal offset
        co, faces = _part(sdf, lo, hi, voxel)
        vertices.append(co)
        quads.append(faces + offset)
        materials.append(np.full(len(faces), mat, np.int32))
        owners.append((kind, offset, offset + len(co), side))
        offset += len(co)

    add("body", body_sdf, (-0.57, -0.40, -0.05), (0.57, 0.36, 2.18), BODY_VOXEL)
    for side, sign in SIDES:
        a, b = ear_points(sign)
        pts = [a, b] + [p for pair in ear_spikes(sign) for p in pair]
        lo = np.array(pts).min(axis=0) - (0.13, 0.13, 0.13)
        hi = np.array(pts).max(axis=0) + (0.13, 0.13, 0.13)
        add("ear", lambda P, s=sign: ear_sdf(P, s), lo, hi, EAR_VOXEL, side=side)
        # Smooth inset laid directly on the leaf surface, not a pixelated
        # per-polygon material mask. Square-to-disc mapping yields all quads.
        a, b, axis, across, depth = ear_frame(sign)
        center = a.lerp(b, 0.49)
        patch, patch_faces = [], []
        nx, nz = 8, 16
        for j in range(nz + 1):
            v = 2 * j / nz - 1
            for i in range(nx + 1):
                u = 2 * i / nx - 1
                x = 0.102 * u * math.sqrt(1 - v * v / 2)
                z = 0.31 * v * math.sqrt(1 - u * u / 2)
                y = -0.08 * math.sqrt(max(0, 1 - (x / 0.178) ** 2 - (z / ((b - a).length * 0.51)) ** 2)) - 0.007
                patch.append(tuple(center + across * x + axis * z + Vector((0, y, 0))))
        for j in range(nz):
            for i in range(nx):
                q = j * (nx + 1) + i
                patch_faces.append((q, q + 1, q + nx + 2, q + nx + 1) if sign == 1 else
                                   (q + nx + 1, q + nx + 2, q + 1, q))
        vertices.append(np.array(patch, np.float32))
        quads.append(np.array(patch_faces, np.int32) + offset)
        materials.append(np.full(len(patch_faces), 1, np.int32))
        owners.append(("ear", offset, offset + len(patch), side))
        offset += len(patch)

    add("head", lambda P: ellipsoid(P, (0, -0.211, 1.5), (0.146, 0.023, 0.116)),
        (-0.18, -0.26, 1.34), (0.18, -0.17, 1.65), DETAIL_VOXEL, mat=3)
    for lower in (False, True):
        points = gum_points(lower)
        kind = "jaw" if lower else "head"
        lo, hi = np.array(points).min(axis=0) - 0.05, np.array(points).max(axis=0) + 0.05
        add(kind, lambda P, pts=points: F._sd_polyline(P, pts, 0.025), lo, hi, DETAIL_VOXEL)
        add(kind, lambda P, l=lower: teeth_sdf(P, l), (-0.145, -0.34, 1.40),
            (0.145, -0.24, 1.62), DETAIL_VOXEL, mat=5)

    for side, sign in SIDES:
        e = eye_position(sign)
        eye_lo = e - Vector((0.08, 0.07, 0.105))
        eye_hi = e + Vector((0.08, 0.06, 0.11))
        add("head", lambda P, p=e: ellipsoid(P, p + Vector((0, 0.008, 0)), (0.066, 0.03, 0.089)),
            eye_lo, eye_hi, DETAIL_VOXEL, mat=3)
        add("eye", lambda P, p=e: ellipsoid(P, p + Vector((0, -0.017, 0)), (0.045, 0.023, 0.065)),
            eye_lo, eye_hi, DETAIL_VOXEL, mat=4, side=side)
        add("eye", lambda P, p=e: ellipsoid(P, p + Vector((0, -0.039, 0)), (0.013, 0.007, 0.045)),
            eye_lo, eye_hi, 0.008, mat=3, side=side)
        lid = e + Vector((0, -0.019, 0.083))
        add("lid", lambda P, p=lid: ellipsoid(P, p, (0.065, 0.028, 0.020)),
            lid - Vector((0.085, 0.045, 0.04)), lid + Vector((0.085, 0.045, 0.04)), 0.010, side=side)
        brow = [Vector((sign * x, y, z)) for x, y, z in
                ((0.066, -0.229, 1.995), (0.12, -0.226, 2.015), (0.19, -0.187, 1.990))]
        add("head", lambda P, pts=brow: F._sd_polyline(P, pts, 0.021),
            np.array(brow).min(axis=0) - 0.04, np.array(brow).max(axis=0) + 0.04, DETAIL_VOXEL, mat=3)
        # Four short clay ridges reproduce the striped legs in the sketch.
        for i in range(4):
            z = 0.10 + i * 0.10
            y = (-0.31, -0.284, -0.19, -0.17)[i]
            pts = [Vector((sign * LEG_X + x, y + 0.045 * (x / 0.12) ** 2,
                           z + 0.022 * (x / 0.12) ** 2)) for x in np.linspace(-0.12, 0.12, 7)]
            add("ridge", lambda P, p=pts: F._sd_polyline(P, p, 0.016),
                np.array(pts).min(axis=0) - 0.04, np.array(pts).max(axis=0) + 0.04,
                DETAIL_VOXEL, mat=2, side=(side, i))

    co, faces = np.concatenate(vertices), np.concatenate(quads)
    mesh = bpy.data.meshes.new(NAME)
    mesh.vertices.add(len(co))
    mesh.vertices.foreach_set("co", co.ravel())
    mesh.loops.add(len(faces) * 4)
    mesh.loops.foreach_set("vertex_index", faces.ravel())
    mesh.polygons.add(len(faces))
    mesh.polygons.foreach_set("loop_start", np.arange(0, len(faces) * 4, 4, dtype=np.int32))
    mesh.polygons.foreach_set("material_index", np.concatenate(materials))
    mesh.update()
    mesh.validate()
    mesh.shade_smooth()
    for name, color, emission in (("StunderBody", BODY_HEX, 0), ("StunderEarInset", EAR_INNER_HEX, 0),
                                   ("StunderLegRidges", RIDGE_HEX, 0), ("StunderMouth", DARK_HEX, 0),
                                   ("StunderEyes_glow", EYE_HEX, EYE_STRENGTH), ("StunderTeeth", TEETH_HEX, 0)):
        mesh.materials.append(material(name, color, emission))
    obj = bpy.data.objects.new(NAME, mesh)
    coll.objects.link(obj)
    obj["enemy"] = "stunder"
    obj["body_color"] = BODY_HEX
    obj["eye_color"] = EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, owners


# --- rig / skin --------------------------------------------------------------
def build_rig(scene, coll):
    arm = bpy.data.armatures.new(RIG_NAME)
    rig = bpy.data.objects.new(RIG_NAME, arm)
    coll.objects.link(rig)
    rig.show_in_front = True
    arm.display_type = "STICK"
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    bones = arm.edit_bones

    def bone(name, head, tail, parent=None, deform=True):
        b = bones.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.align_roll(Vector((0, 0, 1)) if abs((b.tail - b.head).normalized().z) < 0.98 else Vector((0, -1, 0)))
        b.use_deform = deform
        if parent:
            b.parent = bones[parent]
        return b

    bone("root", (0, 0, 0), (0, 0.2, 0), deform=False)
    bone("hips", HIP_C, SPINE_LOWER, "root")
    bone("spine_lower", SPINE_LOWER, SPINE_UPPER, "hips")
    bone("spine_upper", SPINE_UPPER, HEAD_C, "spine_lower")
    bone("head", HEAD_C, (0, 0, 2.1), "spine_upper")
    bone("jaw", JAW_C, JAW_C + Vector((0, -0.15, 0)), "head")
    for side, sign in SIDES:
        hip, knee, ankle = leg_points(sign)
        bone(f"thigh.{side}", hip, knee, "hips")
        bone(f"shin.{side}", knee, ankle, f"thigh.{side}")
        bone(f"foot.{side}", ankle, ankle + Vector((0, -0.18, 0)), f"shin.{side}")
        a, b = ear_points(sign)
        mid = a.lerp(b, 0.50)
        bone(f"ear.{side}", a, mid, "head")
        bone(f"ear_tip.{side}", mid, b, f"ear.{side}")
        bone(f"horn_socket.{side}", b, b + Vector((0, -0.08, 0)), f"ear_tip.{side}", deform=False)
        e = eye_position(sign)
        bone(f"eye.{side}", e, e + Vector((0, -0.08, 0)), "head")
        bone(f"lid.{side}", e, e + Vector((0, -0.08, 0)), "head")
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    rig["enemy"] = "stunder"
    rig["forward"] = "-Y"
    rig["attack_style"] = "head_down"
    rig["normal_speed"] = WALK_SPEED
    rig["fast_speed"] = FAST_SPEED
    rig["eye_light"] = EYE_HEX
    rig["eye_intensity"] = EYE_STRENGTH
    rig["root_motion"] = False
    return rig


def compute_weights(obj, owners):
    mesh, rig = obj.data, obj.parent
    co = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get("co", co)
    P = co.reshape(-1, 3)
    names = [b.name for b in rig.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    body_lo, body_hi = next((lo, hi) for kind, lo, hi, side in owners if kind == "body")
    surface = KDTree(body_hi - body_lo)
    for i in range(body_lo, body_hi):
        surface.insert(P[i], i)
    surface.balance()

    def assign(lo, hi, values):
        for name, value in values.items():
            W[lo:hi, names.index(name)] = value

    for kind, lo, hi, side in owners:
        Q = P[lo:hi]
        if kind == "body":
            z = Q[:, 2]
            lower = C.np_smoothstep(0.63, 0.90, z)
            upper = C.np_smoothstep(1.02, 1.28, z)
            head = C.np_smoothstep(1.48, 1.72, z)
            trunk_weights = {"hips": 1 - lower, "spine_lower": lower - upper,
                             "spine_upper": upper - head, "head": head}
            distances = [trunk_sdf(Q)]
            parts = [trunk_weights]
            for s, sign in SIDES:
                hip, knee, ankle = leg_points(sign)
                dist, along = C._polyline_closest(Q, [hip, knee, ankle])
                knee_dist = (knee - hip).length
                thigh = C.np_smoothstep(0.02, 0.12, along)
                shin = C.np_smoothstep(knee_dist - 0.05, knee_dist + 0.05, along)
                foot = C.np_smoothstep(knee_dist + (ankle - knee).length - 0.07,
                                       knee_dist + (ankle - knee).length + 0.015, along)
                foot_dist = ellipsoid(Q, (sign * LEG_X, -0.085, FOOT_Z), (0.185, 0.225, 0.145))
                distances.append(np.minimum(dist - 0.135, foot_dist))
                parts.append({"hips": 1 - thigh, f"thigh.{s}": thigh - shin,
                              f"shin.{s}": shin * (1 - foot), f"foot.{s}": foot})
            dm = np.stack(distances, axis=1)
            membership = np.exp(-(dm - dm.min(axis=1, keepdims=True)) / 0.012)
            membership /= membership.sum(axis=1, keepdims=True)
            WB = np.zeros((len(Q), len(names)), np.float32)
            for i, values in enumerate(parts):
                for name, value in values.items():
                    WB[:, names.index(name)] += membership[:, i] * value
            # Skin diffusion avoids a visible hinge / crease through the belly.
            edges = np.array([e.vertices[:] for e in mesh.edges], np.int32)
            edges = edges[(edges[:, 0] >= lo) & (edges[:, 1] >= lo)
                          & (edges[:, 0] < hi) & (edges[:, 1] < hi)] - lo
            degree = np.bincount(edges.ravel(), minlength=len(Q)).astype(np.float32)[:, None]
            for _ in range(14):
                acc = np.zeros_like(WB)
                np.add.at(acc, edges[:, 0], WB[edges[:, 1]])
                np.add.at(acc, edges[:, 1], WB[edges[:, 0]])
                WB += 0.5 * (acc / np.maximum(degree, 1) - WB)
            W[lo:hi] = WB
        elif kind == "ear":
            sign = dict(SIDES)[side]
            a, b = ear_points(sign)
            t = ((Q - np.array(a)) @ np.array((b - a).normalized())) / (b - a).length
            base = C.np_smoothstep(-0.015, 0.14, t)
            tip = C.np_smoothstep(0.38, 0.65, t)
            assign(lo, hi, {"head": 1 - base, f"ear.{side}": base - tip, f"ear_tip.{side}": tip})
        elif kind == "ridge":
            # The stripes are pressed into flexible clay, not rigid rings.
            # Copy interpolated skin weights from the adjacent leg surface so
            # they do not float away at the ankle / knee during the fast gait.
            for i in range(lo, hi):
                neighbors = surface.find_n(P[i], 4)
                indices = [index for co, index, distance in neighbors]
                weights = np.array([1 / max(distance, 0.001) ** 2 for co, index, distance in neighbors])
                W[i] = np.average(W[indices], axis=0, weights=weights)
        else:
            name = f"eye.{side}" if kind == "eye" else f"lid.{side}" if kind == "lid" else kind
            assign(lo, hi, {name: 1})

    W = np.maximum(W, 0)
    order = np.argsort(-W, axis=1)
    W[np.arange(len(P))[:, None], order[:, 4:]] = 0
    W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-8)
    assert np.allclose(W.sum(axis=1), 1, atol=1e-5), "Unweighted vertices"
    obj.vertex_groups.clear()
    for j, name in enumerate(names):
        group = obj.vertex_groups.new(name=name)
        for i in np.flatnonzero(W[:, j] > 1e-6):
            group.add([int(i)], float(W[i, j]), "REPLACE")


def build(scene=None):
    scene = scene or bpy.context.scene
    if scene != bpy.context.scene:
        bpy.context.window.scene = scene
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    remove_asset()
    coll = collection(COLLECTION, scene)
    rig = build_rig(scene, coll)
    obj, owners = build_mesh(scene, coll)
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    compute_weights(obj, owners)
    scene.render.fps = FPS
    scene.frame_set(0)
    return rig, obj


# --- authored motion ---------------------------------------------------------
def neutral():
    return {"hips_pos": HIP_C.copy(), "hips_rot": (0, 0, 0),
            "lower_rot": (0, 0, 0), "upper_rot": (0, 0, 0), "head_rot": (0, 0, 0),
            "feet": {side: leg_points(sign)[2].copy() for side, sign in SIDES},
            "local_feet": 0, "jaw": 0, "eyes_closed": 0,
            "ear": 0, "ear_tip": 0, "toe": 0}


def walking(fast=False):
    n, speed = (FAST_FRAMES, FAST_SPEED) if fast else (WALK_FRAMES, WALK_SPEED)
    period, duty = n / FPS, 0.58
    stride = speed * duty * period
    reach = 0.43
    samples = 240
    heights = []
    for i in range(samples):
        phase = i / samples
        limits = []
        for offset in (0, 0.5):
            ph = (phase + offset) % 1
            if ph < duty:
                y, _ = C.foot_track(ph, duty, stride, 0, speed, period)
                limits.append(FOOT_Z + math.sqrt(max(0.04, reach * reach - y * y)) - 0.02)
        heights.append(min(limits))
    # Circular smoothing for a soft heavy gait, without a discontinuity at wrap.
    kernel = np.exp(-0.5 * (np.arange(-12, 13) / 5) ** 2)
    kernel /= kernel.sum()
    heights = [float(np.dot(kernel, np.take(heights, range(i - 12, i + 13), mode="wrap")))
               for i in range(samples)]

    def params(f):
        p = neutral()
        ph = (f / n) % 1
        w = TAU * ph
        z = float(np.interp(ph * samples, np.arange(samples + 1), heights + [heights[0]]))
        p["hips_pos"] = Vector(((0.026 if fast else 0.018) * math.sin(w), 0, z))
        p["hips_rot"] = (D(3 if fast else 1), D(3) * math.sin(w), D(3) * math.cos(w))
        p["lower_rot"] = (D(7 if fast else 2), D(7 if fast else 2) * math.sin(w + 0.2),
                          D(9 if fast else 2) * math.cos(w))
        p["upper_rot"] = (D(-3 if fast else -1), -D(10 if fast else 2) * math.sin(w - 0.35),
                          -D(13 if fast else 2) * math.cos(w - 0.3))
        p["head_rot"] = (D(3) + D(2) * math.sin(2 * w), D(7 if fast else 1) * math.sin(w - 0.8),
                         D(7 if fast else 1) * math.cos(w - 0.6))
        p["ear"] = D(7 if fast else 2) * math.sin(w - 0.8)
        p["ear_tip"] = D(11 if fast else 3) * math.sin(w - 1.35)
        p["jaw"] = D(5 if fast else 2) * (0.5 + 0.5 * math.sin(2 * w - 0.4))
        for side, sign in SIDES:
            offset = 0 if side == "L" else 0.5
            y, lift = C.foot_track((ph + offset) % 1, duty, stride, 0.10 if fast else 0.065,
                                   speed, period, skew=0.85)
            p["feet"][side] += Vector((0, y, lift))
        return p
    return params, n


def attack():
    k = C.keyframes
    lower = k((0, 0), (0.30, D(32)), (HIT_FRAME / FPS, D(52)), (0.73, D(49)), (1.0, D(38)), (1.6, 0))
    upper = k((0, 0), (0.30, D(26)), (HIT_FRAME / FPS, D(27)), (0.73, D(26)), (1.0, D(20)), (1.6, 0))
    head = k((0, 0), (0.26, D(20)), (HIT_FRAME / FPS, D(29)), (0.73, D(26)), (1.0, D(18)), (1.6, 0))
    crouch = k((0, 0), (0.30, -0.085), (HIT_FRAME / FPS, -0.055), (0.74, -0.07), (1.6, 0))
    lunge = k((0, 0), (0.30, 0.065), (HIT_FRAME / FPS, -0.13), (0.73, -0.10), (1.6, 0))
    jaw = k((0, 0), (0.30, D(20)), (0.47, D(26)), (HIT_FRAME / FPS, D(3)), (0.8, D(5)), (1.6, 0))
    ear = k((0, 0), (0.3, D(-5)), (0.50, D(4)), (0.60, D(-9)), (0.85, D(4)), (1.3, 0))

    def params(f):
        p, t = neutral(), f / FPS
        p["hips_pos"] += Vector((0, lunge(t), crouch(t)))
        p["lower_rot"] = (lower(t), 0, 0)
        p["upper_rot"] = (upper(t), 0, 0)
        p["head_rot"] = (head(t), 0, 0)
        p["jaw"] = jaw(t)
        p["ear"], p["ear_tip"] = ear(t), ear(max(0, t - 0.08)) * 1.3
        return p
    return params, ATTACK_FRAMES


def death():
    k = C.keyframes
    pitch = k((0, 0), (0.18, D(9)), (0.40, D(26)), (0.88, D(92)),
              (1.04, D(85)), (1.23, D(92)), (1.55, D(90)), (2.4, D(90)))
    z = k((0, 0), (0.24, -0.08), (0.56, -0.23), (0.88, -0.31), (1.04, -0.25), (1.45, -0.30))
    y = k((0, 0), (0.30, 0.035), (0.88, -0.16), (1.5, -0.18))
    local_feet = k((0, 0), (0.30, 0), (0.72, 1))
    closed = k((0, 0), (0.18, 0.1), (0.64, 1))
    curl = k((0, 0), (0.70, D(13)), (1.15, D(4)), (1.55, D(7)))

    def params(f):
        p, t = neutral(), f / FPS
        p["hips_pos"] += Vector((0.04 * C.smoothstep(0.3, 0.9, t), y(t), z(t)))
        p["hips_rot"] = (pitch(t), D(5) * C.smoothstep(0.3, 1.0, t), D(7) * C.smoothstep(0.3, 1, t))
        p["lower_rot"] = (D(3) * C.smoothstep(0.2, 0.8, t), 0, 0)
        p["upper_rot"] = (-D(5) * C.smoothstep(0.2, 0.8, t), 0, 0)
        p["head_rot"] = (D(8) * C.smoothstep(0.2, 1.35, t), 0, 0)
        p["local_feet"], p["eyes_closed"], p["toe"] = local_feet(t), closed(t), curl(t)
        p["ear"] = D(4) * math.sin(t * 11) * (1 - C.smoothstep(0.9, 1.6, t))
        p["ear_tip"] = D(7) * math.sin(t * 11 - 0.6) * C.smoothstep(0.05, 0.3, t) * (1 - C.smoothstep(1, 1.6, t))
        p["jaw"] = D(8) * C.smoothstep(0.6, 1.3, t)
        return p
    return params, DEATH_FRAMES


def rotation(angles):
    pitch, roll, yaw = angles
    return C.rot_z(yaw) @ C.rot_x(pitch) @ C.rot_y(roll)


def solve(rig, fn, n, lifts=None):
    skel = C.Skeleton(rig)
    frames = []
    for f in range(n + 1):
        p, poses, bases = fn(f), {}, {}
        if lifts is not None:
            p["hips_pos"] += Vector((0, 0, float(lifts[f])))
            # Translate every contact target by the same mesh correction.
            # A pelvis-only lift cannot fix a planted sole (and can oscillate
            # as the death clip blends between world- and pelvis-space feet).
            for side in p["feet"]:
                p["feet"][side].z += float(lifts[f])
        bases["root"] = skel.set("root", poses, skel.base("root", poses))
        world = Matrix.Translation(p["hips_pos"]) @ (rotation(p["hips_rot"]) @ skel.rest_rot["hips"]).to_4x4()
        bases["hips"] = skel.set("hips", poses, world)
        for name, key in (("spine_lower", "lower_rot"), ("spine_upper", "upper_rot"), ("head", "head_rot")):
            base = skel.base(name, poses)
            parent_rot = skel.frame_rot(skel.parent[name], poses)
            # Authored pitch/roll/yaw are in the parent's REST axes, not bone axes.
            desired = Matrix.Translation(base.translation) @ (
                parent_rot @ rotation(p[key]) @ skel.rest_rot[name]).to_4x4()
            bases[name] = skel.set(name, poses, desired)
        hip_rot = skel.frame_rot("hips", poses)
        for side, sign in SIDES:
            hip, knee, ankle = leg_points(sign)
            target = p["feet"][side].copy()
            if p["local_feet"]:
                local = p["hips_pos"] + hip_rot @ (ankle - HIP_C)
                target = target.lerp(local, p["local_feet"])
            base = skel.base(f"thigh.{side}", poses)
            k, ft = C.two_bone_ik(base.translation, target, (knee - hip).length,
                                  (ankle - knee).length, hip_rot @ Vector((0, -1, 0)))
            bases[f"thigh.{side}"] = skel.aim(f"thigh.{side}", poses, k - base.translation)
            bases[f"shin.{side}"] = skel.aim(f"shin.{side}", poses, ft - k)
            foot_base = skel.base(f"foot.{side}", poses)
            foot_rot = C.rot_x(p["toe"]) if p["local_feet"] else Matrix.Identity(3)
            desired = Matrix.Translation(foot_base.translation) @ (
                (hip_rot if p["local_feet"] else Matrix.Identity(3)) @ foot_rot
                @ skel.rest_rot[f"foot.{side}"]).to_4x4()
            bases[f"foot.{side}"] = skel.set(f"foot.{side}", poses, desired)
            for name, angle in ((f"ear.{side}", p["ear"]), (f"ear_tip.{side}", p["ear_tip"])):
                base = skel.base(name, poses)
                bases[name] = skel.set(name, poses, base @ Matrix.Rotation(sign * angle, 4, "Z"))
            base = skel.base(f"horn_socket.{side}", poses)
            bases[f"horn_socket.{side}"] = skel.set(f"horn_socket.{side}", poses, base)
            base = skel.base(f"eye.{side}", poses)
            scale = Matrix.Diagonal((1, 1, max(0.055, 1 - p["eyes_closed"]), 1))
            bases[f"eye.{side}"] = skel.set(f"eye.{side}", poses, base @ scale)
            base = skel.base(f"lid.{side}", poses)
            bases[f"lid.{side}"] = skel.set(f"lid.{side}", poses,
                                            base @ Matrix.Translation((0, 0, -0.083 * p["eyes_closed"])))
        base = skel.base("jaw", poses)
        bases["jaw"] = skel.set("jaw", poses, base @ Matrix.Rotation(-p["jaw"], 4, "X"))
        frames.append(bases)
    return frames


def bake(rig, name, frames, cyclic, extras=None):
    """Bake ALL TRS explicitly, including eye closure and floor correction."""
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    prev = {}
    for f, bases in enumerate(frames):
        for bone_name, basis in bases.items():
            pb = rig.pose.bones[bone_name]
            loc, quat, scale = basis.decompose()
            if bone_name in prev and quat.dot(prev[bone_name]) < 0:
                quat.negate()
            prev[bone_name] = quat.copy()
            pb.location, pb.rotation_quaternion, pb.scale = loc, quat, scale
            for key in ("location", "rotation_quaternion", "scale"):
                pb.keyframe_insert(key, frame=f, group=bone_name)
    # Blender 4.4+ uses layered actions / slots; avoid implicit Bezier overshoot.
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "LINEAR"
    act.use_frame_range = True
    act.frame_start, act.frame_end = 0, len(frames) - 1
    act.use_cyclic = cyclic
    act["loop"] = cyclic
    act["fps"] = FPS
    act["duration"] = (len(frames) - 1) / FPS
    act["root_motion"] = False
    for key, value in (extras or {}).items():
        act[key] = value
    return act


def ground_clip(rig, obj, name, fn, n, cyclic=False, extras=None, always=False):
    """Correct contact using the actual deformed mesh, not just bone endpoints."""
    lifts = np.zeros(n + 1)
    for iteration in range(6):
        frames = solve(rig, fn, n, lifts)
        if cyclic:
            frames[-1] = {key: mat.copy() for key, mat in frames[0].items()}
        act = bake(rig, name, frames, cyclic, extras)
        minima = C.mesh_min_z(rig, obj, act)
        correction = -minima if always else np.maximum(0, -minima)
        if np.abs(correction).max() < 0.0005:
            break
        if cyclic:
            # Circular convolution keeps the loop seam coherent.
            correction = np.array([(correction[(i - 1) % n] + 2 * correction[i % n]
                                    + correction[(i + 1) % n]) / 4 for i in range(n)] + [0])
            correction[-1] = correction[0]
        lifts += correction
    assert minima.min() > -0.001, (name, float(minima.min()))
    return act


def animate(rig=None, obj=None):
    rig = rig or bpy.data.objects[RIG_NAME]
    obj = obj or bpy.data.objects[NAME]
    bpy.context.scene.render.fps = FPS
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        if track.name in CLIPS:
            rig.animation_data.nla_tracks.remove(track)
    for name, fast in ((CLIPS[0], False), (CLIPS[1], True)):
        fn, n = walking(fast)
        ground_clip(rig, obj, name, fn, n, cyclic=True,
                    extras={"speed": FAST_SPEED if fast else WALK_SPEED, "wiggle": fast})
    fn, n = attack()
    act = ground_clip(rig, obj, CLIPS[2], fn, n,
                      extras={"attack_style": "head_down", "hit_frame": HIT_FRAME, "hit_time": HIT_FRAME / FPS,
                              "active_start": 13 / FPS, "active_end": 22 / FPS})
    marker = act.pose_markers.new("HeadDownContact")
    marker.frame = HIT_FRAME
    fn, n = death()
    ground_clip(rig, obj, CLIPS[3], fn, n,
                extras={"hold_last_frame": True, "hold_from": 1.65}, always=True)
    # Explicit action ownership is essential in a shared MCP session. The
    # glTF exporter's default "single armature" mode would otherwise include
    # the player / spider's actions too. Muted NLA tracks register our four
    # clips without layering them on top of the active preview action.
    for name in CLIPS:
        action = bpy.data.actions[name]
        track = rig.animation_data.nla_tracks.new()
        track.name, track.mute = name, True
        strip = track.strips.new(name, 0, action)
        strip.action_slot = action.slots[0]
        strip.extrapolation = "NOTHING"
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    return rig, obj


# --- inspection / export -----------------------------------------------------
def setup_stage(scene=None):
    scene = scene or bpy.context.scene
    coll = collection(STAGE_COLLECTION, scene)
    for obj in list(coll.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    ground_mesh = bpy.data.meshes.new("StunderGround")
    ground_mesh.from_pydata([(-12, -12, -0.01), (12, -12, -0.01),
                            (12, 12, -0.01), (-12, 12, -0.01)], [], [(0, 1, 2, 3)])
    ground_mesh.materials.append(material("StunderStageGround", "#bcc5b3"))
    ground = bpy.data.objects.new("StunderGround", ground_mesh)
    coll.objects.link(ground)
    for name, location, energy, size in (("StunderKey", (-3, -4, 6), 450, 4),
                                         ("StunderFill", (4, -1, 4), 180, 3),
                                         ("StunderRim", (1, 3, 5), 350, 3)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size = energy, size
        obj = bpy.data.objects.new(name, light)
        coll.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, 1.2)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    camera = bpy.data.objects.new("StunderCamera", bpy.data.cameras.new("StunderCamera"))
    coll.objects.link(camera)
    camera.location = (3.6, -7.5, 3.1)
    camera.rotation_euler = (Vector((0, -0.08, 1.35)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type, camera.data.ortho_scale = "ORTHO", 3.8
    scene.camera = camera
    scene.world = bpy.data.worlds.get("StunderWorld") or bpy.data.worlds.new("StunderWorld")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.65, 0.75, 0.6, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 800, 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    return camera


def validate(rig, obj, animations=True):
    assert obj.parent == rig and len(obj.modifiers) == 1
    assert obj.modifiers[0].type == "ARMATURE"
    assert tuple(rig.scale) == (1, 1, 1) and tuple(obj.scale) == (1, 1, 1)
    assert not obj.data.uv_layers
    assert all(p.use_smooth for p in obj.data.polygons)
    for v in obj.data.vertices:
        weights = [g.weight for g in v.groups]
        assert 0 < len(weights) <= 4 and abs(sum(weights) - 1) < 1e-5
        assert all(math.isfinite(x) for x in v.co)
    clips = []
    if animations:
        previous_action, frame = rig.animation_data.action, bpy.context.scene.frame_current
        for name in CLIPS:
            act = bpy.data.actions[name]
            minima = C.mesh_min_z(rig, obj, act)
            assert minima.min() > -0.001, (name, minima.min())
            # Exact cyclic seams; death ends in a genuinely held pose.
            sc = bpy.context.scene
            sc.frame_set(0 if act.use_cyclic else 60)
            start = {pb.name: pb.matrix.copy() for pb in rig.pose.bones}
            sc.frame_set(int(act.frame_end))
            if act.use_cyclic or name == "StunderDeath":
                for pb in rig.pose.bones:
                    assert max(abs(start[pb.name][i][j] - pb.matrix[i][j]) for i in range(4) for j in range(4)) < 0.001, (name, pb.name)
            if name == "StunderAttack":
                for f in range(10, 23):
                    sc.frame_set(f)
                    # Front of the face must point down throughout the strike.
                    face_forward = C.Skeleton(rig).frame_rot("head", {pb.name: pb.matrix for pb in rig.pose.bones}) @ Vector((0, -1, 0))
                    assert face_forward.z < -0.85, (f, tuple(face_forward))
            clips.append({"name": name, "duration": act["duration"], "loop": act["loop"],
                          "min_z": round(float(minima.min()), 5)})
        rig.animation_data.action = previous_action
        bpy.context.scene.frame_set(frame)
    obj.data.calc_loop_triangles()
    return {"vertices": len(obj.data.vertices), "triangles": len(obj.data.loop_triangles),
            "bones": len(rig.data.bones), "clips": clips}


def export_gltf(rig, obj, path):
    path = str(Path(path).resolve())
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                                  use_active_scene=True, export_yup=True, export_extras=True,
                                  export_animation_mode="ACTIONS", export_force_sampling=True,
                                  export_anim_single_armature=False, export_rest_position_armature=True,
                                  export_frame_step=1, export_skins=True, export_normals=True,
                                  export_texcoords=False, export_cameras=False, export_lights=False)
    finally:
        bpy.ops.object.select_all(action="DESELECT")
        for o in selected:
            o.select_set(True)
        bpy.context.view_layer.objects.active = active


def save_blend(scene, path):
    """Save an ordinary, isolated Blender project, even in a shared MCP session.

    A partial library write alone has no screen/window data and opens with a
    'Library file' warning. A background Blender converts that temporary
    library to a normal project without discarding the interactive session.
    """
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    isolated = scene.copy()
    for coll in list(isolated.collection.children):
        if coll.name not in (COLLECTION, STAGE_COLLECTION):
            isolated.collection.children.unlink(coll)
    for obj in list(isolated.collection.objects):
        isolated.collection.objects.unlink(obj)
    try:
        with tempfile.TemporaryDirectory(prefix="stunder-") as directory:
            library = Path(directory) / "asset.blend"
            bpy.data.libraries.write(str(library), {isolated, *(bpy.data.actions[n] for n in CLIPS)},
                                     compress=True)
            # Append into a factory project, retaining real workspaces/screens.
            # Opening a library as the main file first would discard those UI
            # datablocks, even if it were subsequently saved as a normal file.
            code = f"""import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load({str(library)!r}, link=False) as (source, target):
    target.scenes = source.scenes
    target.actions = source.actions
scene = target.scenes[0]
scene.name = 'Stunder'
bpy.context.window.scene = scene
for other in list(bpy.data.scenes):
    if other != scene:
        bpy.data.scenes.remove(other)
rig = bpy.data.objects['StunderRig']
rig.show_in_front = False
bpy.ops.object.select_all(action='DESELECT')
mesh = bpy.data.objects['Stunder']
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.shading.color_type = 'MATERIAL'
            space.region_3d.view_location = (0, 0, 1.35)
            space.region_3d.view_rotation = scene.camera.rotation_euler.to_quaternion()
            space.region_3d.view_distance = 4
            space.region_3d.view_perspective = 'ORTHO'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath={str(path)!r}, compress=True)
"""
            subprocess.run([bpy.app.binary_path, "-b", "--python-expr", code],
                           check=True, capture_output=True, text=True)
    finally:
        bpy.data.scenes.remove(isolated)


def main(scene=None, export_path=None, blend_path=None):
    rig, obj = build(scene)
    F.decimate(obj)
    setup_stage(scene)
    animate(rig, obj)
    report = validate(rig, obj)
    if export_path:
        export_gltf(rig, obj, export_path)
    if blend_path:
        save_blend(bpy.context.scene, blend_path)
    print("Stunder:", report)
    return rig, obj


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", default=str(Path(__file__).resolve().parent.parent / "assets" / "stunder.glb"))
    parser.add_argument("blend", nargs="?", default=str(Path(__file__).with_suffix(".blend")))
    parser.add_argument("--static", action="store_true")
    options = parser.parse_args(args)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if options.static:
        build()
        setup_stage()
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(options.output).resolve()))
    else:
        main(export_path=options.output, blend_path=options.blend)
