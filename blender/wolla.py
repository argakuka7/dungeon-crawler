"""
Wolla: a creature made of waves, from the kids' sketch.

Four wavy rings of water stacked on top of each other make its body (seen from
the front, four wavy lines, one above the other), and two eyes float above
them, joined to nothing. The rings carry seven crests each; neighbouring rings
are half a wave out of step. Faces -Y in Blender, +Z up; one unit = one game
cell, about 1.15 cells tall.

The waves move: the game spins each ring about its own axis (render/enemies.js,
`waves` on the profile; alternate rings turn the other way), so the crests run
round the body whatever clip plays. The clips leave that spin out: they only
sway, tilt, lift and squeeze the rings.

Rig: root, wave0..3 (one ring each, bottom to top; the game spins them about
their bone axis), eye.L/R (parented to the root: they float on their own;
scale = glow), cloud (its storm cloud, scale 0 except in the attack) and
bolt0/1 (two lightning bolts under the cloud, children of it, flashing).

Clips, 30 fps, in place (the game supplies root motion):
    WollaGlide  32-frame loop: hovering just above the ground, the rings
                swaying one after the other like water in a glass, the eyes
                bobbing out of step. Played on time (the profile `hover`s).
    WollaBlow   1.8 s: a little storm cloud puffs up above it and rumbles,
                lightning flashes from it twice (extras.thunder, s), while the
                Wolla leans back and draws its rings in. At frame 27
                (extras.hit_frame) it blows: the upper rings lift at the front
                like a lid and open a wide mouth between the second and the
                third ring (extras.muzzle: game x, up, forward), it leans into
                the blow, and the cloud is swept forward and away. The storm
                blows until extras.gust_end; then the mouth closes.
    WollaDeath  2.0 s: shudders, then the rings slump to the ground one after
                the other, top last, spreading into flat concentric ripples,
                and the eyes drop and roll apart. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, wolla; importlib.reload(creature); importlib.reload(wolla)
    wolla.main(export_path="<repo>/assets/wolla.glb", blend_path="<repo>/blender/wolla.blend")

Headless:
    Blender -b --python blender/wolla.py -- assets/wolla.glb blender/wolla.blend \
        blender/previews/wolla-preview.png
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

NAME, RIG_NAME = "Wolla", "WollaRig"
SCENE, COLLECTION, STAGE = "Wolla", "WollaAsset", "WollaStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("WollaGlide", "WollaBlow", "WollaDeath")

WAVE_HEX, DEEP_HEX = "#3d8bff", "#2a64d8"
EYE_HEX, PUPIL_HEX = "#ffd23a", "#140c02"
CLOUD_HEX, BOLT_HEX = "#5b6272", "#ffe45a"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("WollaWaves", WAVE_HEX, 0), ("WollaWavesDeep", DEEP_HEX, 0),
             ("WollaEyes_glow", EYE_HEX, 1.8), ("WollaPupils", PUPIL_HEX, 0),
             ("WollaCloud", CLOUD_HEX, 0), ("WollaBolt_glow", BOLT_HEX, 4))
WAVES, DEEP, EYES_M, PUPILS, CLOUD_M, BOLT_M = range(len(MATERIALS))

VOXEL, DETAIL = 0.011, 0.006
GLIDE_FRAMES, GLIDE_SPEED = 32, 0.5
BLOW_FRAMES, BLOW_HIT, GUST_END = 54, 27, 44
THUNDER = (13, 20)                    # frames the bolts flash at (bolt0, bolt1)
DEATH_FRAMES = 60
LOOP_T = GLIDE_FRAMES / FPS
HIDDEN = 0.001                        # the scale of a part that is not shown

# --- body plan -----------------------------------------------------------------
RING_Z = (0.13, 0.38, 0.63, 0.88)
RING_R = (0.34, 0.355, 0.345, 0.30)
TUBE = (0.047, 0.046, 0.045, 0.043)
CRESTS, AMP = 7, 0.05
SPIN = (1, -1, 1, -1)                 # which way the game turns each ring

EYES = {s: V((sign * 0.11, -0.1, 1.1)) for s, sign in SIDES}
EYE_R = 0.07
CLOUD = V((0, -0.04, 1.5))
CLOUD_K = 1.35                        # the puffs below, scaled
# the cloud's puffs: (centre offset, radii)
PUFFS = tuple((tuple(v * CLOUD_K for v in o), tuple(v * CLOUD_K for v in r)) for o, r in (
    ((0, 0, 0.03), (0.15, 0.12, 0.1)), ((0.13, 0.01, 0.0), (0.12, 0.1, 0.08)),
    ((-0.13, -0.01, 0.0), (0.12, 0.1, 0.085)), ((0.24, 0.0, -0.03), (0.08, 0.07, 0.06)),
    ((-0.23, 0.02, -0.03), (0.085, 0.07, 0.06)), ((0.05, 0.06, 0.07), (0.1, 0.08, 0.07))))
BOLT_X = (0.25, -0.23)


def ring_curve(k, theta):
    """Points of ring k's centre line at angles theta (0 = front, -Y)."""
    r, z = RING_R[k], RING_Z[k]
    phase = math.pi * k                     # neighbours half a wave out of step
    return np.stack([r * np.sin(theta), -r * np.cos(theta), z + AMP * np.sin(CRESTS * theta + phase)], axis=-1)


def ring_sdf(P, k):
    """A tube along the wavy ring: the nearest of samples around each point's own angle."""
    theta = np.arctan2(P[..., 0], -P[..., 1])
    best = None
    for dt in np.linspace(-0.32, 0.32, 17):
        c = ring_curve(k, theta + dt).astype(np.float32)
        d = np.linalg.norm(P - c, axis=-1)
        best = d if best is None else np.minimum(best, d)
    return best - TUBE[k]


def bolt_points(i):
    x = BOLT_X[i]
    top = CLOUD + V((x, 0.0, -0.07))
    zig = ((0, 0, 0), (0.07, -0.01, -0.12), (-0.03, 0.0, -0.18), (0.06, -0.01, -0.3), (0.0, 0.0, -0.43))
    mirror = 1 if i == 0 else -1
    return [top + V((mirror * a, b, c)) for a, b, c in zig]


def cloud_sdf(P):
    d = None
    for off, radii in PUFFS:
        e = K.ellipsoid(P, CLOUD + V(off), radii)
        d = e if d is None else K.smin(d, e, 0.04)
    return K.smax(d, -(P[..., 2] - (CLOUD.z - 0.07 * CLOUD_K)), 0.03)     # a flat-ish bottom


def build_mesh(coll):
    parts = K.Parts()
    for k in range(len(RING_Z)):
        r, z, pad = RING_R[k], RING_Z[k], AMP + TUBE[k] + 0.02
        parts.add(f"wave{k}", lambda P, k=k: ring_sdf(P, k), (-r - pad, -r - pad, z - pad), (r + pad, r + pad, z + pad),
                  VOXEL, mat=WAVES if k % 2 == 0 else DEEP)
    for s, sign in SIDES:
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: F._sd_sphere(P, c, EYE_R), e - V((0.09,) * 3), e + V((0.09,) * 3),
                  DETAIL * 0.8, mat=EYES_M)
        pupil = e + V((sign * -0.008, -0.058, 0.004))
        parts.add(f"eye.{s}", lambda P, c=pupil: K.ellipsoid(P, c, (0.028, 0.018, 0.034)),
                  pupil - V((0.045,) * 3), pupil + V((0.045,) * 3), 0.004, mat=PUPILS)
    parts.add("cloud", cloud_sdf, CLOUD - V((0.48, 0.26, 0.16)), CLOUD + V((0.48, 0.26, 0.26)), 0.014, mat=CLOUD_M)
    for i in range(2):
        pts = bolt_points(i)
        parts.add(f"bolt{i}", lambda P, pts=pts: K.tapered_tube(P, pts, [0.038, 0.033, 0.028, 0.021, 0.012]),
                  V((min(p.x for p in pts) - 0.04, min(p.y for p in pts) - 0.04, min(p.z for p in pts) - 0.04)),
                  V((max(p.x for p in pts) + 0.04, max(p.y for p in pts) + 0.04, max(p.z for p in pts) + 0.04)),
                  0.005, mat=BOLT_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "wolla"
    obj["wave_color"] = WAVE_HEX
    obj["eye_color"] = EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up)]
    for k, z in enumerate(RING_Z):
        bones.append((f"wave{k}", (0, 0, z), (0, 0, z + 0.1), "root", True, fwd))
    for s, _ in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + V((0, -0.08, 0)), "root", True, up))
    bones.append(("cloud", CLOUD, CLOUD + V((0, 0, 0.1)), "root", True, fwd))
    for i in range(2):
        pts = bolt_points(i)
        bones.append((f"bolt{i}", pts[0], pts[-1], "cloud", True, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "wolla", "forward": "-Y", "attack_style": "storm", "normal_speed": GLIDE_SPEED,
        "crests": CRESTS, "spin": list(SPIN), "eye_light": EYE_HEX, "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:                 # every part rides one bone
        W[o["lo"]:o["hi"], names.index(o["kind"])] = 1
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
    for name, roughness in (("WollaWaves", 0.22), ("WollaWavesDeep", 0.25), ("WollaEyes_glow", 0.25), ("WollaCloud", 0.9)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
PIVOT = V((0, 0, 0.1))


def params(**kw):
    n = len(RING_Z)
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0,
         "rings": [{"off": V(), "tilt": 0.0, "side": 0.0, "scale": 1.0, "squash": 1.0} for _ in range(n)],
         "eyes": {s: EYES[s].copy() for s, _ in SIDES},      # world (they float)
         "look": (0.0, 0.0), "glow": 1.0,
         "cloud": (CLOUD.copy(), HIDDEN, 0.0), "bolts": (HIDDEN, HIDDEN)}
    p.update(kw)
    return p


def ring_matrix(skel, k, p, L, body):
    """Ring k's bone: tilted (front up or down) about its back, side-tilted about its centre,
    moved, scaled out (radius) and squashed (height)."""
    r = p["rings"][k]
    c = V((0, 0, RING_Z[k])) + r["off"]
    back = c + V((0, RING_R[k] * r["scale"], 0))
    tilt = K.about(back, C.rot_x(r["tilt"])) @ K.about(c, C.rot_y(r["side"]))
    S = Matrix.Diagonal((r["scale"], r["scale"], r["squash"], 1))
    world = L @ body @ tilt @ Matrix.Translation(c) @ S
    return world @ skel.rest_rot[f"wave{k}"].to_4x4()


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        body = Matrix.Translation(p["pos"]) @ K.about(PIVOT, R)
        for k in range(len(RING_Z)):
            bases[f"wave{k}"] = skel.set(f"wave{k}", poses, ring_matrix(skel, k, p, L, body))
        e = max(HIDDEN, p["glow"])
        ly, lp = p["look"]
        look = (C.rot_z(ly) @ C.rot_x(lp)).to_4x4()
        for s, _ in SIDES:
            eye = Matrix.Translation(L @ body @ p["eyes"][s]) @ look @ skel.rest_rot[f"eye.{s}"].to_4x4() @ Matrix.Diagonal((e, e, e, 1))
            bases[f"eye.{s}"] = skel.set(f"eye.{s}", poses, eye)
        at, size, wobble = p["cloud"]
        cloud = Matrix.Translation(L @ at) @ C.rot_y(wobble).to_4x4() @ skel.rest_rot["cloud"].to_4x4() @ Matrix.Diagonal((size, size, size, 1))
        bases["cloud"] = skel.set("cloud", poses, cloud)
        for i, b in enumerate(p["bolts"]):
            bases[f"bolt{i}"] = K.pose_local(skel, f"bolt{i}", poses, Matrix.Diagonal((b, b, b, 1)))
        return bases
    return solve


def floating(t, s, amp=1.0):
    """The eyes' own bob (whole multiples of the loop, out of step with each other)."""
    w = TAU * t / LOOP_T
    k = 0 if s == "L" else 1
    return V((0.008 * math.sin(w + 1 + 2 * k), 0.01 * math.sin(w + 0.4 * k), 0.025 * math.sin(w + 0.5 + 1.9 * k))) * amp


def sway(t, k, amp=1.0):
    """Ring k slopping about like water in a glass: each ring a little behind the one below."""
    w = TAU * t / LOOP_T
    lag = 0.7 * k
    return ({"off": V((0.022 * math.sin(w - lag), 0.012 * math.sin(w - lag + 1.2), 0.008 * math.sin(2 * w - lag))) * amp,
             "side": D(3) * math.sin(w - lag + 0.5) * amp, "tilt": D(2) * math.sin(w - lag + 2) * amp})


def ring(**kw):
    r = {"off": V(), "tilt": 0.0, "side": 0.0, "scale": 1.0, "squash": 1.0}
    r.update(kw)
    return r


def glide(f):
    t = f / FPS
    w = TAU * f / GLIDE_FRAMES
    rings = [ring(**sway(t, k)) for k in range(len(RING_Z))]
    eyes = {s: EYES[s] + floating(t, s) + V((0.015 * math.sin(w - 2.2), 0, 0)) for s, _ in SIDES}
    return params(t=t, pos=V((0, 0, 0.012 * math.sin(w))), pitch=D(4), roll=D(2) * math.sin(w + 0.3),
                  rings=rings, eyes=eyes, look=(D(5) * math.sin(w - 1), 0))


def blow(f):
    k, t = C.keyframes, f / FPS
    hit, end = BLOW_HIT / FPS, GUST_END / FPS
    gust = 1 if hit <= t < end else 0
    flutter = gust * math.sin(TAU * 11 * t)
    inhale = k((0, 0), (0.15, 0.15), (hit - 0.08, 1), (hit + 0.04, 0))(t)       # draws in and leans back
    mouth = k((0, 0), (hit - 0.1, 0), (hit + 0.06, 1), (end, 0.9), (end + 0.2, 0))(t)   # the lid lifts
    lean = D(-9) * inhale + D(9) * mouth + D(1.2) * flutter
    shake = math.sin(TAU * 9 * t) * C.smoothstep(0.3, 0.45, t) * (1 - C.smoothstep(hit - 0.15, hit, t))
    rings = []
    # front of the lid up (negative tilt), the lower jaw a little down
    tilts = (D(3), D(6), D(-13), D(-17))
    lifts = (0.0, -0.02, 0.02, 0.05)
    for i in range(len(RING_Z)):
        s = sway(t, i, 1 - 0.7 * min(1, inhale + mouth))
        rings.append(ring(off=s["off"] + V((0.006 * shake * (-1) ** i, 0, 0.025 * inhale * i / 3 + lifts[i] * mouth)),
                          side=s["side"] + D(2) * flutter * (-1) ** i,
                          tilt=s["tilt"] + tilts[i] * mouth + D(1.5) * flutter * (1 if i >= 2 else -1),
                          scale=1 - 0.1 * inhale + 0.1 * mouth, squash=1 + 0.08 * inhale - 0.04 * mouth))
    eyes = {s: EYES[s] + floating(t, s, 1 - 0.8 * min(1, inhale + mouth))
            + V((0, 0.06 * mouth, 0.04 * inhale + 0.09 * mouth)) for s, _ in SIDES}
    glow = 1 + 0.25 * inhale + 0.2 * mouth
    # the cloud: puffs up above it, rumbles while the lightning flashes, then is blown away
    grow = k((0, HIDDEN), (0.08, HIDDEN), (0.3, 1.12), (0.4, 1.0), (hit, 1.05), (hit + 0.15, 0.8), (end - 0.1, HIDDEN))(t)
    swept = k((0, 0), (hit, 0), (end - 0.1, 1))(t)
    rumble = V((0.015 * math.sin(TAU * 7 * t), 0, 0.01 * math.sin(TAU * 5 * t + 1))) * C.smoothstep(0.25, 0.35, t) * (1 - swept)
    at = CLOUD + rumble + V((0, -1.0 * swept, -0.5 * swept))
    bolts = []
    for i, frame in enumerate(THUNDER):
        on = frame <= f <= frame + 3 and (f - frame) != 2           # a double flicker
        bolts.append(1.0 if on else HIDDEN)
    return params(t=t, pos=V((0, 0.03 * inhale - 0.05 * mouth, 0)), pitch=lean, roll=D(2) * shake,
                  rings=rings, eyes=eyes, glow=glow, look=(0, D(-8) * mouth),
                  cloud=(at, grow, D(4) * math.sin(TAU * 3 * t)), bolts=tuple(bolts))


def death(f):
    k, t = C.keyframes, f / FPS
    shudder = math.sin(TAU * 10 * t) * (1 - C.smoothstep(0.1, 0.5, t))
    rings = []
    spread = (1.38, 1.12, 0.86, 0.58)            # flat concentric ripples on the floor
    for i in range(len(RING_Z)):
        start = 0.25 + 0.14 * (3 - i)             # the bottom one first
        fall = C.smoothstep(start, start + 0.45, t)
        splash = math.exp(-8 * max(0, t - start - 0.45)) * math.sin(TAU * 3 * max(0, t - start - 0.45)) if t > start + 0.45 else 0
        floor_z = 0.035 + 0.006 * i
        rings.append(ring(off=V((0.01 * shudder * (-1) ** i, 0, (floor_z - RING_Z[i]) * fall)),
                          side=D(4) * shudder * (-1) ** i * (1 - fall) + D(2) * splash,
                          tilt=D(5) * math.sin(2.1 * i + 1) * fall * (1 - fall) * 4,
                          scale=1 + (spread[i] - 1) * fall + 0.04 * splash, squash=1 - 0.45 * fall))
    eyes = {}
    for s, sign in SIDES:
        e = EYES[s]
        ground = EYE_R * 0.75 - e.z
        drop = k((0, 0), (0.25, 0.04), (0.9, ground), (1.02, ground + 0.07), (1.12, ground), (1.18, ground + 0.02), (1.24, ground))(t)
        out = V((sign * 0.42, -0.2 - 0.06 * sign, 0)) * C.smoothstep(0.5, 1.6, t)
        eyes[s] = e + out + V((0, 0, drop))
    return params(t=t, roll=D(3) * shudder, rings=rings, eyes=eyes,
                  look=(0, D(70) * C.smoothstep(0.8, 1.6, t)), glow=k((0, 1), (0.6, 1.1), (1.8, 0.75))(t))


def mouth_point(rig, action, frame):
    """Armature-space centre of the mouth: in front, between the second and the third ring."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    a, b = (rig.matrix_world @ rig.pose.bones[f"wave{k}"].head for k in (1, 2))
    mid = (a + b) / 2
    return V((0, mid.y - RING_R[1], mid.z))          # on its middle line


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "WollaGlide", solver(rig, glide), GLIDE_FRAMES, cyclic=True,
                  extras={"speed": GLIDE_SPEED})
    act = K.ground_clip(rig, obj, "WollaBlow", solver(rig, blow), BLOW_FRAMES,
                        extras={"attack_style": "storm", "hit_frame": BLOW_HIT, "hit_time": BLOW_HIT / FPS,
                                "gust_end": GUST_END, "thunder": [round(f / FPS, 4) for f in THUNDER]})
    act.pose_markers.new("Blow").frame = BLOW_HIT
    act.pose_markers.new("Calm").frame = GUST_END
    for i, f in enumerate(THUNDER):
        act.pose_markers.new(f"Thunder{i}").frame = f
    m = mouth_point(rig, "WollaBlow", BLOW_HIT + 3)
    act["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    K.ground_clip(rig, obj, "WollaDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.7}, settle_from=round(1.4 * FPS))
    K.register(rig, CLIPS)
    return list(act["muzzle"])


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
    shots = [("WollaGlide", 0, (2.2, -5.0, 2.4)), ("WollaGlide", 10, (-4.5, -2.5, 2.2)),
             ("WollaBlow", THUNDER[0], (3.0, -4.6, 2.2)), ("WollaBlow", BLOW_HIT + 3, (0.6, -5.5, 1.4)),
             ("WollaBlow", BLOW_HIT + 6, (5.0, -1.2, 1.8)), ("WollaDeath", DEATH_FRAMES, (3.0, -4.0, 3.2))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 0.65), size=360, cols=3)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("WollaDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "Wolla", STAGE, (0, 0, 0.7), 2.4)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, GLIDE_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Wolla", NAME, (0, 0, 0.7), 3.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Wolla:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "wolla.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "wolla.blend"),
         preview_path=args[2] if len(args) > 2 else None)
