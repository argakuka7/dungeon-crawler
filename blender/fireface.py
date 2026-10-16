"""
Fire-face: a floating, living flame from the whiteboard sketch.

A round glowing orb hovers above the floor; six S-curved flame tongues rise
from it (the tallest in the middle, smaller ones curling out to the sides and
one at the back). An angry face sits on the front of the orb: two glowing
eyes cut into slanted half moons under dark brows, and a dark open mouth.
Everything is red and orange and emissive: the body is banded from an orange
core to red tongue tips. Faces -Y in Blender, +Z up; one unit = one game cell.

The orb and the tongues are one OpenVDB SDF, skinned to the body and to two
bones per tongue (flame{i}_a / _b) so the flames can flicker. Eyes, pupils,
brows and mouth are rigid parts; `charge` is a fireball that grows in front
of the mouth during the attack (scaled away otherwise). The projectile the
game throws is a separate, unskinned mesh in the same file (FireFaceBall).

Clips, 30 fps, in place (the game supplies root motion):
    FireFloat   40-frame hover loop: bob, sway and flickering flames. It is a
                time-driven loop (the game plays it while idle, too).
    FireAttack  1.2 s: rear back, flare up and grow a fireball in front of the
                mouth, then thrust forward and spit it; the ball is released at
                extras.hit_frame (18) from extras.muzzle (game x, up, forward).
    FireDeath   2.0 s: flare up, then the flames die down, the orb sinks to the
                floor and flattens, the eyes fade. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, fireface; importlib.reload(creature); importlib.reload(fireface)
    fireface.main(export_path="<repo>/assets/fireface.glb", blend_path="<repo>/blender/fireface.blend")

Headless:
    Blender -b --python blender/fireface.py -- assets/fireface.glb blender/fireface.blend
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

NAME, RIG_NAME, BALL = "FireFace", "FireFaceRig", "FireFaceBall"
SCENE, COLLECTION, STAGE = "FireFace", "FireFaceAsset", "FireFaceStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
CORE_HEX, FLAME_HEX, TIP_HEX = "#ff7a1a", "#ff4a17", "#d61d10"
EYE_HEX, DARK_HEX, BALL_HEX = "#fff0a0", "#3d0904", "#ff9a2a"
CLIPS = ("FireFloat", "FireAttack", "FireDeath")
SIDES = (("L", 1), ("R", -1))

ORB_C, ORB_R = Vector((0, 0, 0.60)), (0.27, 0.235, 0.255)
BOTTOM = ORB_C.z - ORB_R[2]                    # hover gap under the orb
# (base, up direction, length, base radius, curl, side vector)
TONGUES = [
    (Vector((0, 0.02, 0.86)), Vector((0, 0.06, 1)), 0.50, 0.12, 0.09, Vector((1, 0, 0))),
    (Vector((0.13, 0, 0.74)), Vector((0.42, 0, 1)), 0.40, 0.10, -0.08, Vector((1, 0, -0.42))),
    (Vector((-0.13, 0, 0.74)), Vector((-0.42, 0, 1)), 0.40, 0.10, 0.08, Vector((1, 0, 0.42))),
    (Vector((0.22, 0, 0.62)), Vector((0.85, 0, 1)), 0.27, 0.075, 0.06, Vector((1, 0, -0.85))),
    (Vector((-0.22, 0, 0.62)), Vector((-0.85, 0, 1)), 0.27, 0.075, -0.06, Vector((1, 0, 0.85))),
    (Vector((0, 0.13, 0.72)), Vector((0, 0.45, 1)), 0.40, 0.10, 0.06, Vector((1, 0, 0))),
]
MANTLE = (Vector((0, 0, 0.62)), Vector((0, 0.03, 0.98)), 0.215, 0.05)
CHARGE_C, CHARGE_R = Vector((0, -0.33, 0.52)), 0.11
LOOP_FRAMES, WANDER = 40, 0.5
ATTACK_FRAMES, HIT_FRAME = 36, 18
DEATH_FRAMES = 60
VOXEL, DETAIL = 0.011, 0.006


def tongue(i):
    base, up, length, r0, curl, side = TONGUES[i]
    return K.flame_tongue(base, up.normalized(), side.normalized(), length, r0, curl)


def orb_sdf(P):
    return K.ellipsoid(P, ORB_C, ORB_R)


def mantle_sdf(P):
    """The orb tapers upwards into a teardrop flame."""
    a, b, r1, r2 = MANTLE
    return K.smin(orb_sdf(P), K.round_cone(P, a, b, r1, r2), 0.12)


def front(x, z, inset=0.0):
    """Point on the front of the body (orb + mantle) at (x, z), pushed `inset` along -Y."""
    lo, hi = -0.6, 0.0                     # bisect the surface along -Y
    for _ in range(40):
        mid = (lo + hi) / 2
        inside = body_sdf(np.array([[x, mid, z]], np.float32))[0] < 0
        lo, hi = (lo, mid) if inside else (mid, hi)
    return Vector((x, hi - inset, z))




# --- sculpture ---------------------------------------------------------------
def tongue_sdf(P, i):
    pts, radii = tongue(i)
    return K.tapered_tube(P, pts, radii)


def body_sdf(P):
    d = mantle_sdf(P)
    for i in range(len(TONGUES)):
        d = K.smin(d, tongue_sdf(P, i), 0.08)
    # a little flame lick under the orb, so it does not read as a ball
    d = K.smin(d, K.ellipsoid(P, ORB_C - Vector((0, -0.01, 0.17)), (0.14, 0.13, 0.12)), 0.08)
    return d


EYES = {s: front(sign * 0.095, 0.655, -0.012) for s, sign in SIDES}
MOUTH_C = front(0, 0.525, -0.012)


def bands(centers):
    """Orange core, orange-red flames, red tips (wavy borders)."""
    x, z = centers[:, 0], centers[:, 2]
    core = z < 0.78 + 0.035 * np.sin(17 * x + 0.5)
    tips = z > 0.98 + 0.05 * np.sin(13 * x + 1.0) - 0.25 * np.abs(x)
    return np.where(core, 0, np.where(tips, 2, 1))


def eye_sdf(P, sign):
    c = EYES["L" if sign > 0 else "R"]
    q = P - np.asarray(c, np.float32)
    d = K.ellipsoid(q, (0, 0, 0), (0.052, 0.03, 0.04))
    ex, ez = q[..., 0] * sign, q[..., 2]
    cut = (ez - 0.004 - 0.55 * ex) / math.sqrt(1 + 0.55 ** 2)      # angry: lower towards the nose
    return K.smax(d, cut, 0.006)


def brow_points(sign):
    a, b = front(sign * 0.035, 0.668, -0.014), front(sign * 0.165, 0.735, -0.002)
    return [a, a.lerp(b, 0.5) + Vector((0, -0.006, 0.006)), b]


def ball_sdf(P, c, r):
    """A fireball: a sphere with three tongues trailing behind it (+Y)."""
    d = K.F._sd_sphere(P, c, r)
    for k, (sx, sz) in enumerate(((0, 0.6), (0.55, -0.35), (-0.55, -0.35))):
        pts, radii = K.flame_tongue(c + Vector((sx * r * 0.4, 0.2 * r, sz * r * 0.4)),
                                    Vector((sx * 0.35, 1, sz * 0.35)).normalized(), Vector((1, 0, 0)),
                                    r * 2.1, r * 0.62, (-1) ** k * r * 0.25, tip=0.008, n=8)
        d = K.smin(d, K.tapered_tube(P, pts, radii), r * 0.4)
    return d


MATERIALS = (("FireFaceCore_glow", CORE_HEX, 1.3), ("FireFaceFlame_glow", FLAME_HEX, 2.2),
             ("FireFaceTips_glow", TIP_HEX, 1.8), ("FireFaceEyes_glow", EYE_HEX, 3.0),
             ("FireFaceDark", DARK_HEX, 0), ("FireFaceBall_glow", BALL_HEX, 1.6))


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.5, -0.4, 0.2), (0.5, 0.45, 1.36), VOXEL, mat=bands)
    for s, sign in SIDES:
        c = EYES[s]
        parts.add(f"eye.{s}", lambda P, g=sign: eye_sdf(P, g), c - Vector((0.08,) * 3), c + Vector((0.08,) * 3),
                  DETAIL * 0.8, mat=3)
        pupil = c + Vector((sign * -0.012, -0.024, -0.008))
        parts.add(f"eye.{s}", lambda P, p=pupil: K.ellipsoid(P, p, (0.016, 0.012, 0.018)),
                  pupil - Vector((0.04,) * 3), pupil + Vector((0.04,) * 3), 0.004, mat=4)
        brow = brow_points(sign)
        lo, hi = K.bounds(brow, 0.05)
        parts.add("brow", lambda P, b=brow: K.polyline(P, b, 0.017), lo, hi, DETAIL, mat=4)
    m = MOUTH_C
    parts.add("mouth", lambda P: K.ellipsoid(P, m, (0.07, 0.026, 0.038)), m - Vector((0.1,) * 3),
              m + Vector((0.1,) * 3), DETAIL * 0.8, mat=4)
    c = CHARGE_C
    parts.add("charge", lambda P: ball_sdf(P, c, CHARGE_R), c - Vector((0.2, 0.2, 0.2)),
              c + Vector((0.2, 0.4, 0.2)), DETAIL, mat=5)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "fireface"
    obj["body_color"] = FLAME_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_ball(coll):
    """The thrown fireball, centred on its origin, flying towards -Y (game +Z)."""
    parts = K.Parts()
    parts.add("ball", lambda P: ball_sdf(P, Vector(), CHARGE_R), (-0.2, -0.2, -0.2), (0.2, 0.4, 0.2), DETAIL, mat=5)
    obj = parts.mesh(BALL, coll, MATERIALS)
    obj["projectile"] = "fireball"
    obj["radius"] = CHARGE_R
    return obj


# --- rig / skin --------------------------------------------------------------
def tongue_bones(i):
    pts, _ = tongue(i)
    return pts[0], pts[len(pts) // 2], pts[-1]


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", ORB_C, ORB_C + Vector((0, 0, 0.25)), "root", True, fwd),
             ("mouth", MOUTH_C, MOUTH_C + Vector((0, -0.08, 0)), "body", True, up),
             ("charge", CHARGE_C, CHARGE_C + Vector((0, -0.12, 0)), "body", True, up)]
    for s, _ in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + Vector((0, -0.06, 0)), "body", True, up))
    for i in range(len(TONGUES)):
        a, m, b = tongue_bones(i)
        bones += [(f"flame{i}_a", a, m, "body", True, fwd), (f"flame{i}_b", m, b, f"flame{i}_a", True, fwd)]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "fireface", "forward": "-Y", "attack_style": "fireball", "normal_speed": WANDER,
        "light": FLAME_HEX, "hover": True, "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind != "body":                            # rigid parts (brows ride the body)
            W[lo:hi, names.index("body" if kind == "brow" else kind)] = 1
            continue
        Q = P[lo:hi]
        dists, parts = [mantle_sdf(Q)], [{"body": np.ones(len(Q))}]
        for i in range(len(TONGUES)):
            pts, radii = tongue(i)
            d, along = C._polyline_closest(Q, pts)
            total = sum((b - a).length for a, b in zip(pts, pts[1:]))
            u = along / total
            body = 1 - C.np_smoothstep(0.0, 0.28, u)
            tip = C.np_smoothstep(0.42, 0.62, u)
            dists.append(d - np.interp(u, np.linspace(0, 1, len(radii)), radii))
            parts.append({"body": body, f"flame{i}_a": np.clip(1 - body - tip, 0, 1), f"flame{i}_b": tip})
        dm = np.stack(dists, axis=1)
        membership = np.exp(-(dm - dm.min(axis=1, keepdims=True)) / 0.012)
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
    ball.location = (0.9, 0, 0.6)          # beside the creature in the .blend; the game places it
    return scene, rig, obj, ball


# --- motion ------------------------------------------------------------------
LOOP_T = LOOP_FRAMES / FPS


def params(**kw):
    p = {"t": 0.0, "pos": Vector(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0),
         "amp": 1.0, "flare": 1.0, "lean": 0.0, "mouth": (1.0, 1.0), "charge": 0.0, "charge_at": Vector(),
         "eyes": 1.0}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)
    charge_rot = skel.rest_rot["charge"].inverted()

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        sx, sz = p["squash"]
        S = Matrix.Diagonal((sx, sx, sz))
        body = L @ Matrix.Translation(ORB_C + p["pos"]) @ (R @ S @ skel.rest_rot["body"]).to_4x4()
        bases["body"] = skel.set("body", poses, body)
        mx, mz = p["mouth"]
        bases["mouth"] = K.pose_local(skel, "mouth", poses, Matrix.Diagonal((mx, 1, mz, 1)))
        c = max(0.01, p["charge"])
        bases["charge"] = K.pose_local(skel, "charge", poses, Matrix.Translation(charge_rot @ p["charge_at"])
                                       @ Matrix.Diagonal((c, c, c, 1)))
        for s, _ in SIDES:
            e = max(0.05, p["eyes"])
            bases[f"eye.{s}"] = K.pose_local(skel, f"eye.{s}", poses, Matrix.Diagonal((e, e, e, 1)))
        for i in range(len(TONGUES)):
            a, b, s = K.flicker(i, p["t"], LOOP_T, p["amp"])
            g = p["flare"] * (0.92 + 0.08 * s)
            lean = p["lean"] * (1.0 if i != 5 else 0.6)
            rot = Matrix.Rotation(0.5 * a + lean, 4, "X") @ Matrix.Rotation(0.5 * b, 4, "Z")
            bases[f"flame{i}_a"] = K.pose_local(skel, f"flame{i}_a", poses, rot @ Matrix.Diagonal((g, g, g, 1)))
            rot = Matrix.Rotation(a + 0.6 * lean, 4, "X") @ Matrix.Rotation(b, 4, "Z")
            bases[f"flame{i}_b"] = K.pose_local(skel, f"flame{i}_b", poses, rot @ Matrix.Diagonal((1, s, 1, 1)))
        return bases
    return solve


def hover(t):
    w = TAU * t / LOOP_T
    return dict(t=t, pos=Vector((0.012 * math.sin(w + 0.4), 0, 0.035 * math.sin(w))),
                pitch=D(3) * math.sin(w + 1.1), roll=D(3) * math.sin(w), yaw=D(4) * math.sin(w + 2.0),
                squash=(1 + 0.02 * math.sin(2 * w + 0.6), 1 - 0.025 * math.sin(2 * w + 0.6)),
                mouth=(1, 1 + 0.15 * math.sin(2 * w)))


def float_loop(f):
    return params(**hover(f / FPS))


def attack(f):
    k, t = C.keyframes, f / FPS
    hit = HIT_FRAME / FPS
    base = hover(t)
    shake = D(4) * math.sin(TAU * 8 * (t - hit)) * math.exp(-8 * (t - hit)) if t > hit else 0
    base.update(
        pos=base["pos"] + Vector((0, k((0, 0), (0.42, 0.08), (hit, -0.12), (0.8, -0.05), (1.2, 0))(t),
                                     k((0, 0), (0.42, 0.06), (hit, -0.02), (1.2, 0))(t))),
        pitch=D(k((0, 0), (0.42, -16), (hit, 14), (0.8, 4), (1.2, 0))(t)) + shake,
        squash=(k((0, 1), (0.42, 0.94), (hit, 1.1), (0.8, 1), (1.2, 1))(t), k((0, 1), (0.42, 1.08), (hit, 0.9), (0.8, 1), (1.2, 1))(t)),
        flare=k((0, 1), (0.42, 1.3), (hit, 1.15), (0.9, 1), (1.2, 1))(t),
        amp=k((0, 1), (0.42, 1.6), (0.9, 1), (1.2, 1))(t),
        lean=D(k((0, 0), (0.42, -14), (hit, 22), (0.9, 0), (1.2, 0))(t)),
        mouth=(k((0, 1), (0.42, 1.25), (hit, 1.5), (0.8, 1), (1.2, 1))(t), k((0, 1), (0.42, 1.9), (hit, 2.4), (0.8, 1), (1.2, 1))(t)),
        charge=k((0, 0), (0.12, 0), (0.45, 0.85), (hit - 1 / FPS, 1.0), (hit, 0.0))(t),
        charge_at=Vector((0, k((0, 0.10), (0.45, 0), (hit - 1 / FPS, -0.08))(t), 0)))
    return params(**base)


def death(f):
    k, t = C.keyframes, f / FPS
    base = hover(t)
    sink = k((0, 0), (0.3, -0.06), (1.3, 1), (1.5, 1))(t)
    base.update(
        pos=base["pos"] * (1 - C.smoothstep(0.2, 1.0, t)) + Vector((0, 0, 0.08 * C.smoothstep(0, 0.25, t) - 0.45 * sink)),
        pitch=D(k((0, 0), (0.25, -10), (1.3, 8))(t)), roll=D(k((0, 0), (0.6, 8), (1.3, -5))(t)),
        yaw=base["yaw"] * (1 - C.smoothstep(0.2, 1.2, t)),
        squash=(k((0, 1), (0.25, 0.92), (1.3, 1.3))(t), k((0, 1), (0.25, 1.12), (1.3, 0.5))(t)),
        flare=k((0, 1), (0.25, 1.35), (1.4, 0.18))(t), amp=k((0, 1), (0.25, 2), (0.9, 0.6), (1.5, 0))(t),
        mouth=(k((0, 1), (0.25, 1.3), (1.0, 0.8))(t), k((0, 1), (0.25, 2.2), (1.0, 0.6))(t)),
        eyes=k((0, 1), (0.5, 1), (1.4, 0.08))(t))
    return params(**base)


def charge_point(rig, action, frame):
    """Armature-space centre of the charge ball (= fireball launch point)."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones["charge"]
    return rig.matrix_world @ pb.head


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "FireFloat", solver(rig, float_loop), LOOP_FRAMES, cyclic=True,
                  extras={"speed": WANDER, "hover": True})
    act = K.ground_clip(rig, obj, "FireAttack", solver(rig, attack), ATTACK_FRAMES,
                        extras={"attack_style": "fireball", "hit_frame": HIT_FRAME, "hit_time": HIT_FRAME / FPS})
    act.pose_markers.new("Spit").frame = HIT_FRAME
    # where the ball is just before it leaves: game coordinates (x, up, forward)
    m = charge_point(rig, "FireAttack", HIT_FRAME - 1)
    act["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    K.ground_clip(rig, obj, "FireDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.5}, settle_from=round(1.5 * FPS))
    K.register(rig, CLIPS)
    return list(act["muzzle"])


def main(export_path=None, blend_path=None):
    scene, rig, obj, ball = build()
    K.decimate(obj)
    K.decimate(ball)
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("FireDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "FireFace", STAGE, (0, 0, 0.7), 2.2)
    scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, LOOP_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        ball.location = (0, 0, 0)
        K.export_gltf(rig, obj, export_path, extra=(ball,))
        ball.location = (0.9, 0, 0.6)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "FireFace", NAME, (0, 0, 0.7), 3)
    print("FireFace:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "fireface.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "fireface.blend"))
