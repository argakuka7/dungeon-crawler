"""Landmark builders for the classic themes (see themes.py): two each for the sets of
props.py and clutter.py, so every theme has a destination piece for its reward sites.

    meadow    windmill, wishing_well          peaks     expedition_camp, ice_arch
    badlands  covered_wagon, windpump         roots     root_gate, hollow_stump
    frozen    ice_throne, frozen_falls        swamp     giant_toadstool, witch_hut
    nests     web_gate, brood_cluster         mines     headframe, giant_geode
    ruins     temple_gate, colossus_head      volcanic  fire_shrine, fumarole
    abyss     chained_obelisk, void_throne

Every builder is build_<prop>(m, variant) on a props.Mesh, base on z = 0, the front towards -Y.
Gates keep a clear way through at x = 0 (themes.passage checks it).
"""
import math
from pathlib import Path
import sys

from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from props import (WOOD, BARK, STONE, STONE_DARK, LEAF, LEAF_LIGHT, SNOW, PINE, ICE, ROOT, MOSS,  # noqa: E402,F401
                   SWAMP, WEB, BONE, RUIN, RUIN_LIGHT, BASALT, OBSIDIAN, IRON)
from themes_geo import *  # noqa: E402,F401,F403

PLASTER = "#e8e0cc"
ROOF_RED = "#a8483a"
SAIL = "#efe6d0"
TENT = "#d86a3a"
CANVAS = "#e4dcc4"
RUST_RED = "#8a3a2a"
GLOWWORM = "#7fd8ff"
SPORE = "#8fff7a"
CAP = ("#c83a3a", "#b0302e", "#d84a42")
CAULDRON = "#2e2a2a"
EGG = ("#e8e0d0", "#d8ccb8", "#f0e8dc")
TIMBER = "#7a5a38"
TIMBER_DARK = "#5a4028"
LAMP = "#ffcf8a"
AMETHYST = ("#b07ae8", "#8a5ad0", "#d0a0ff")
GEODE = ("#6a6a72", "#7a7a84", "#5a5a62")
MARBLE = ("#d8d0c0", "#c8c0b0", "#e4dccc")
LAVA_GLOW = "#ff6a20"
EMBER = "#ffb040"
SULFUR_CRUST = "#d8c040"
RUNE = "#ff3030"
VOID = "#a050ff"
ICE_GLOW = "#9fd8ff"


def ring_wall(m, center, r_out, r_in, z0, z1, color, n=10, top=None):
    """A round wall (a short hollow cylinder): outer and inner faces, a top rim."""
    x, y, _ = center
    outer = [(x + r_out * math.cos(TAU * i / n), y + r_out * math.sin(TAU * i / n)) for i in range(n)]
    inner = [(x + r_in * math.cos(TAU * i / n), y + r_in * math.sin(TAU * i / n)) for i in range(n)]
    o0, o1 = [m.vert((a, b, z0)) for a, b in outer], [m.vert((a, b, z1)) for a, b in outer]
    i0, i1 = [m.vert((a, b, z0)) for a, b in inner], [m.vert((a, b, z1)) for a, b in inner]
    for k in range(n):
        j = (k + 1) % n
        m.face((o0[k], o0[j], o1[j], o1[k]), color)
        m.face((i0[j], i0[k], i1[k], i1[j]), color, shade=0.75)
        m.face((o1[k], o1[j], i1[j], i1[k]), top or color)
        m.face((o0[j], o0[k], i0[k], i0[j]), color)


def arch_legs(m, span, height, radii, colors, n=7, sag=0.25):
    """A natural arch over the X axis: legs at x = +-span, top at `height`."""
    pts = [Vector((-span, 0, 0)), Vector((-span, 0, height * 0.42)), Vector((-span * 0.8, 0, height * 0.8)),
           Vector((-span * 0.28, 0, height)), Vector((span * 0.28, 0, height)), Vector((span * 0.8, 0, height * 0.8)),
           Vector((span, 0, height * 0.42)), Vector((span, 0, 0))]
    for k in range(len(pts) - 1):
        m.tube([pts[k], pts[k + 1]], [radii[k], radii[k + 1]], colors[k % len(colors)], n=n)
    return pts


def gable(m, center, w, d, h, color, eave=0.06):
    """A pitched roof along X over a d deep body: two boards from the ridge (`h` over `center`)
    down past the walls by `eave`."""
    x, y, z = center
    slope = math.atan2(h, d / 2)
    length = (d / 2 + eave) / math.cos(slope)
    for s in (-1, 1):
        start = len(m.vertices)
        m.box((0, 0, 0), (w + 2 * eave, length, 0.06), color)
        mid = length / 2
        xform(m, start, rot=(-s * slope, 0, 0),
              offset=(x, y + s * mid * math.cos(slope), z + h - mid * math.sin(slope)))


# ================================= meadow =====================================
def build_windmill(m, v):
    m.lathe((0, 0, 0), [(0, 0.78), (0.15, 0.74), (2.4, 0.56), (2.5, 0.6)], PLASTER, n=10, jitter=0.02,
            colors=["#d8d0bc", PLASTER, PLASTER, "#cfc6b0"])
    m.lathe((0, 0, 2.5), [(0, 0.66), (0.1, 0.64), (0.85, 0.06), (0.95, 0)], ROOF_RED, n=10, jitter=0.03)
    m.box((0, -0.72, 0.42), (0.38, 0.12, 0.8), TIMBER_DARK)
    m.box((0, -0.74, 0.86), (0.46, 0.1, 0.08), TIMBER)
    for z, a in ((1.3, 0.4), (1.9, -0.5)):
        m.box(polar(0.66, -math.pi / 2 + a, z), (0.16, 0.12, 0.2), "#3a4a5a", tilt=a)
    hub = Vector((0, -0.72, 2.3))
    m.tube([hub + Vector((0, 0.25, 0)), hub], 0.08, TIMBER_DARK, n=6)
    for k in range(4):
        a = k * TAU / 4 + 0.35
        d = Vector((math.cos(a), 0, math.sin(a)))
        side = Vector((-math.sin(a), 0, math.cos(a)))
        m.tube([hub, hub + d * 1.25], 0.035, TIMBER, n=4)
        sheet(m, hub + d * 0.3 + side * 0.02 + Vector((0, -0.04, 0)), d * 0.92, side * 0.3, SAIL, cols=3, rows=1,
              t=0.012, colors=lambda c, r: (SAIL, "#ddd2b8")[c % 2])
    for i in range(7):
        a = -math.pi / 2 + 0.7 + i * 0.8
        m.lathe(polar(0.98, a), [(0, 0.12), (0.12, 0.14), (0.24, 0)], LEAF if i % 2 else LEAF_LIGHT, n=5, jitter=0.2)


def build_wishing_well(m, v):
    ring_wall(m, (0, 0, 0), 0.62, 0.44, 0, 0.62, STONE, n=10, top="#a8a8a0")
    m.lathe((0, 0, 0.3), [(0, 0.45), (0.02, 0.44)], "#2a4a6a", n=10, jitter=0)
    for s in (-1, 1):
        m.box((s * 0.52, 0, 0.95), (0.09, 0.09, 1.9), TIMBER)
    gable(m, (0, 0, 1.75), 1.25, 0.95, 0.45, ROOF_RED)
    m.tube([(-0.5, 0, 1.25), (0.5, 0, 1.25)], 0.05, TIMBER_DARK, n=5)
    m.tube([(0.5, 0, 1.25), (0.62, 0, 1.25), (0.62, -0.15, 1.12)], 0.02, IRON, n=3)
    m.tube([(0, 0, 1.22), (0, 0, 0.9)], 0.008, "#cdb88e", n=3)
    m.lathe((0, 0, 0.72), [(0, 0.07), (0.16, 0.09)], WOOD, n=6)
    for i in range(6):
        a = i * TAU / 6 + 0.4
        m.lathe(polar(0.85, a), [(0, 0.1), (0.1, 0.12), (0.2, 0)], (LEAF, LEAF_LIGHT)[i % 2], n=5, jitter=0.2)
        m.blob(polar(0.85, a, 0.2), (0.04, 0.04, 0.04), ("#f0d850", "#e86a8a", "#ffffff")[i % 3], n=4)


# ================================= peaks ======================================
def build_expedition_camp(m, v):
    # an A-frame tent, its door to the front
    extrude_x(m, [(-0.55, 0), (0.55, 0), (0, 0.85)], -0.55, 0.65, TENT)
    m.box((0.05, -0.56, 0.3), (0.34, 0.02, 0.55), "#5a2a1a")
    for x in (-0.6, 0.7):
        m.tube([(x, 0, 0), (x, 0, 0.95)], 0.025, TIMBER_DARK, n=4)
    # crates, a sled and the flag
    m.box((1.0, -0.2, 0.18), (0.4, 0.36, 0.36), WOOD, tilt=0.2)
    m.box((1.05, 0.25, 0.14), (0.32, 0.3, 0.28), TIMBER, tilt=-0.3)
    m.box((-1.05, -0.35, 0.06), (0.35, 0.8, 0.05), TIMBER)
    for sx in (-1, 1):
        m.tube([(-1.05 + sx * 0.15, -0.75, 0.12), (-1.05 + sx * 0.15, -0.8, 0.02), (-1.05 + sx * 0.15, 0.05, 0.02)],
               0.015, IRON, n=3)
    m.box((-1.05, -0.3, 0.2), (0.28, 0.4, 0.22), "#7a8a5a")
    m.tube([(-0.9, 0.55, 0), (-0.9, 0.55, 2.2)], 0.03, IRON, n=4)
    sheet(m, (-0.9, 0.55, 2.15), (0.55, 0, 0), (0, 0, -0.35), "#d03a2e", cols=4, rows=2, wave=0.05,
          colors=lambda c, r: ("#d03a2e", "#f2f0e6")[(c + r) % 2])
    for i in range(6):
        m.lathe(polar(1.2 + 0.1 * (i % 2), 0.6 + i * 1.05), [(0, 0.3), (0.1, 0.22), (0.16, 0)], SNOW, n=6, jitter=0.2)
    m.lathe((0.45, -0.75, 0), [(0, 0.16), (0.06, 0.14)], STONE_DARK, n=6, jitter=0.2)


def build_ice_arch(m, v):
    s = len(m.vertices)
    arch_legs(m, 1.15, 2.3, [0.45, 0.4, 0.33, 0.3, 0.3, 0.33, 0.4, 0.45], [ICE, ICE_LIGHT, "#c4dce6", ICE_DEEP])
    wobble(m, s, 0.03, freq=3)
    clamp_ground(m, s)
    for k in range(7):
        x = -0.75 + 0.25 * k
        z = 2.0 - 0.25 * abs(x)
        m.lathe((x, 0.05 * (k % 2), z), [(0, 0.06), (-0.25 - 0.1 * (k % 3), 0)], ICE_LIGHT, n=4, jitter=0.1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.lathe((sx * 1.1, sy * 0.55, 0), [(0, 0.25), (0.12, 0.18), (0.2, 0)], SNOW, n=6, jitter=0.2)


# ================================ badlands ====================================
def build_covered_wagon(m, v):
    m.box((0, 0, 0.55), (1.8, 0.9, 0.3), WOOD)
    m.box((0, 0, 0.42), (1.9, 0.95, 0.05), TIMBER_DARK)
    rings = []
    for k in range(5):
        x = -0.8 + 0.4 * k
        rings.append([(x, 0.47 * math.cos(a), 0.7 + 0.62 * math.sin(a)) for a in [i * math.pi / 6 for i in range(7)]])
    loft(m, rings, CANVAS, colors=[CANVAS, "#d6ccb0"])
    for x in (-0.6, 0.6):
        for y in (-0.5, 0.5):
            m.ring((x, y, 0.32), 0.3, 0.035, TIMBER_DARK, n=10, section=3, vertical=True)
        m.tube([(x, -0.5, 0.32), (x, 0.5, 0.32)], 0.03, TIMBER_DARK, n=4)
    m.tube([(0.9, 0, 0.42), (1.5, -0.1, 0.12)], 0.03, TIMBER, n=4)
    for i, (x, y) in enumerate(((-1.25, -0.6), (1.2, 0.65), (-1.2, 0.7))):
        m.box((x, y, 0.15), (0.3, 0.3, 0.3), "#8a6a48", tilt=0.4 * i)
    m.lathe((1.3, -0.65, 0), [(0, 0.16), (0.32, 0.14), (0.36, 0.16)], "#6a5040", n=7)


def build_windpump(m, v):
    top = 2.9
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.tube([(sx * 0.55, sy * 0.55, 0), (sx * 0.12, sy * 0.12, top)], 0.035, "#8a8a90", n=4)
    for z in (0.7, 1.4, 2.1):
        k = 1 - z / top * 0.78
        for a, b in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            m.tube([(a[0] * 0.55 * k, a[1] * 0.55 * k, z), (b[0] * 0.55 * k, b[1] * 0.55 * k, z)], 0.015,
                   "#7a7a80", n=3)
    hub = Vector((0, -0.25, top + 0.1))
    m.box((0, 0, top + 0.08), (0.2, 0.5, 0.18), "#6a6a70")
    m.ring(hub, 0.75, 0.025, "#9a9aa0", n=14, section=3, vertical=True)
    for k in range(12):
        a = k * TAU / 12
        c = hub + Vector((math.cos(a) * 0.48, 0, math.sin(a) * 0.48))
        start = len(m.vertices)
        m.box((0, 0, 0), (0.1, 0.02, 0.5), "#c8c8cc")
        xform(m, start, rot=(0, math.pi / 2 - a, 0), offset=c)
    m.tube([(0, 0, top + 0.1), (0, 0.9, top + 0.15)], 0.025, "#6a6a70", n=4)
    sheet(m, (0, 0.75, top + 0.45), (0, 0.45, 0), (0, 0, -0.55), "#c8c8cc", cols=2, rows=2, t=0.01)
    m.box((0.95, -0.2, 0.18), (0.5, 0.9, 0.36), "#8a6a48")
    m.box((0.95, -0.2, 0.34), (0.4, 0.8, 0.04), "#3a6a8a")


# ================================== roots =====================================
def build_root_gate(m, v):
    s = len(m.vertices)
    for sx in (-1, 1):
        m.tube([(sx * 1.15, 0.1, 0), (sx * 1.08, 0, 0.9), (sx * 0.9, -0.05, 1.8), (sx * 0.4, 0.05, 2.35),
                (-sx * 0.15, 0.1, 2.45)], [0.38, 0.33, 0.26, 0.2, 0.12], (BARK, ROOT)[sx > 0], n=7)
        for k in range(3):
            a = sx * (0.9 + 0.55 * k)
            m.tube([(sx * 1.1, 0.1, 0.3), Vector(polar(1.3, -math.pi / 2 + a, 0.1)),
                    Vector(polar(1.45, -math.pi / 2 + a * 1.1, 0))], [0.12, 0.07, 0.03], ROOT, n=4)
    wobble(m, s, 0.03, freq=2.5)
    clamp_ground(m, s)
    for i, (x, z) in enumerate(((-0.95, 1.9), (0.7, 2.2), (-0.3, 2.42), (1.15, 1.3))):
        m.blob((x, -0.15, z), (0.2, 0.12, 0.1), MOSS, n=5)
    for k in range(5):
        x = -0.6 + 0.3 * k
        m.tube([(x, -0.02, 2.3 - 0.1 * abs(x)), (x + 0.03, -0.04, 1.75 - 0.1 * (k % 2))], [0.02, 0.008], ROOT, n=3)


def build_hollow_stump(m, v):
    s = len(m.faces)
    m.lathe((0, 0, 0), [(0, 1.15), (0.3, 1.0), (1.6, 0.9), (2.0, 0.95), (2.05, 0.8)], BARK, n=11, jitter=0.08)
    streaks(m, s, 11, 4, (BARK, "#5a3a1c", "#7a5028", ROOT))
    m.lathe((0, 0, 2.05), [(0, 0.8), (0.02, 0.6)], "#c8a070", n=11, jitter=0.08)
    # the dark hollow in the front, a little door and a lamp
    m.box((0, -0.86, 0.6), (0.7, 0.2, 1.2), "#1e140c")
    m.box((0, -0.93, 0.55), (0.5, 0.06, 1.0), TIMBER)
    m.blob((0.16, -0.97, 0.55), (0.03, 0.03, 0.03), IRON, n=4)
    for k in range(6):
        a = -math.pi / 2 + 0.9 + k * 0.9
        m.tube([polar(0.9, a, 0.3), polar(1.35, a + 0.1, 0.12), polar(1.6, a + 0.2, 0)], [0.16, 0.1, 0.04], ROOT, n=4)
    for x, z, r in ((0.95, 1.3, 0.22), (1.0, 0.9, 0.16), (-0.98, 1.5, 0.18)):
        m.lathe((x * 0.98, 0.1, z), [(0, 0.03), (0.05, r), (0.08, 0)], "#c8a060", n=6)
    m.blob((-0.4, 0.3, 2.07), (0.25, 0.2, 0.06), MOSS, n=5)


# ================================= frozen =====================================
def build_ice_throne(m, v):
    for k, (w, d) in enumerate(((2.2, 1.8), (1.7, 1.35), (1.25, 0.95))):
        m.box((0, 0.15 * k, 0.12 + 0.24 * k), (w, d, 0.24), (ICE_DEEP, ICE, ICE_LIGHT)[k], jitter=0.01)
    m.box((0, 0.45, 1.3), (1.0, 0.25, 1.5), ICE, jitter=0.02)
    m.box((0, 0.15, 0.9), (0.8, 0.5, 0.18), ICE_LIGHT)
    for sx in (-1, 1):
        m.box((sx * 0.45, 0.15, 1.1), (0.14, 0.5, 0.35), ICE_DEEP)
    for i in range(7):
        x = -0.6 + 0.2 * i
        m.shard((x, 0.5, 1.95), 0.1, 0.5 + 0.35 * (1 - abs(x) / 0.6), (ICE_LIGHT, ICE)[i % 2], n=5)
    start = len(m.faces)
    m.shard((0, 0.45, 2.05), 0.13, 0.95, ICE_GLOW, n=6)
    lit(m, start)
    for i in range(6):
        a = i * TAU / 6 + 0.3
        m.shard(polar(1.35, a), 0.12, 0.4 + 0.2 * (i % 3), (ICE, ICE_LIGHT, ICE_DEEP)[i % 3], n=5)


def build_frozen_falls(m, v):
    m.lathe((0, 0.6, 0), [(0, 0.85), (1.4, 0.78), (2.9, 0.62), (3.1, 0.35)], STONE_DARK, n=8, jitter=0.12,
            colors=[STONE_DARK, "#5a6470", "#6c7781"])
    s = len(m.vertices)
    rings = []
    for k in range(6):
        z = 3.0 - k * 0.55
        w = 0.45 + 0.12 * k
        rings.append([(w * math.cos(a), -0.05 - 0.28 * math.sin(a) - 0.04 * k, z) for a in
                      [i * math.pi / 5 for i in range(6)]])
    loft(m, rings, ICE_LIGHT, colors=[ICE_LIGHT, ICE, "#c4dce6"])
    wobble(m, s, 0.04, freq=4)
    clamp_ground(m, s)
    m.lathe((0, -0.5, 0), [(0, 0.95), (0.12, 0.9), (0.18, 0.75)], ICE_DEEP, n=10, jitter=0.1,
            colors=[ICE_DEEP, "#9ac0d0"])
    for i in range(8):
        a = -math.pi / 2 + (i - 3.5) * 0.35
        m.lathe(polar(0.9, a, 3.0 - 0.1 * (i % 3)), [(0, 0.05), (-0.3 - 0.15 * (i % 3), 0)], ICE_LIGHT, n=4)
    for i in range(5):
        m.shard(polar(1.2, -math.pi / 2 + (i - 2) * 0.55), 0.1, 0.35 + 0.15 * (i % 2), ICE, n=5)


# ================================== swamp =====================================
def build_giant_toadstool(m, v):
    m.lathe((0, 0, 0), [(0, 0.45), (0.3, 0.36), (1.6, 0.3), (2.3, 0.38)], "#e8e0c8", n=9, jitter=0.06)
    m.ring((0, 0, 1.5), 0.36, 0.06, "#d8d0b8", n=9, section=3)
    start = len(m.faces)
    m.lathe((0, 0, 2.25), [(0, 0.3), (0.05, 1.15)], SPORE, n=12, jitter=0.04)
    lit(m, start)
    m.lathe((0, 0, 2.28), [(0, 1.25), (0.25, 1.15), (0.55, 0.8), (0.8, 0.3), (0.85, 0)], CAP[0], n=12, jitter=0.05,
            colors=list(CAP))
    for i in range(9):
        a = i * TAU / 9 + 0.2
        r = 0.55 + 0.35 * (i % 2)
        m.blob(polar(r, a, 2.28 + 0.75 * (1 - r / 1.25) ** 0.7 + 0.1), (0.1, 0.1, 0.05), "#f4f0e0", n=4)
    for i, (r, h) in enumerate(((1.0, 0.6), (1.25, 0.4), (0.95, 0.5), (1.3, 0.35))):
        a = i * 1.7 + 0.5
        c = polar(r, a)
        m.lathe(c, [(0, 0.06), (h * 0.8, 0.05)], "#e8e0c8", n=5)
        m.lathe((c[0], c[1], h * 0.8), [(0, 0.18 * h / 0.5), (0.12, 0.12), (0.2, 0)], CAP[i % 3], n=6)
    m.lathe((0, 0, 0), [(0, 0.95), (0.05, 0.75)], MOSS, n=9, jitter=0.25)


def build_witch_hut(m, v):
    s = len(m.vertices)
    m.box((0, 0.1, 0.65), (1.4, 1.2, 1.3), "#6a5a3a")
    for k in range(6):
        m.box((-0.6 + 0.24 * k, -0.505, 0.65), (0.03, 0.03, 1.3), TIMBER_DARK)
    xform(m, s, rot=(0, 0.06, 0.05))
    m.box((-0.15, -0.53, 0.5), (0.38, 0.06, 0.9), "#2a1e14")
    start = len(m.faces)
    m.box((0.38, -0.53, 0.9), (0.22, 0.04, 0.22), SPORE)
    lit(m, start)
    s = len(m.vertices)
    m.lathe((0, 0.1, 1.25), [(0, 1.05), (0.12, 1.0), (1.2, 0.2), (1.45, 0.05)], STRAW, n=7, jitter=0.12,
            colors=["#8a7a4a", STRAW, "#a8945a"])
    xform(m, s, rot=(0.08, -0.1, 0), pivot=(0, 0.1, 1.25))
    m.box((0.45, 0.4, 2.0), (0.22, 0.22, 0.9), STONE_DARK, tilt=0.2)
    # the cauldron outside, bubbling green
    m.lathe((0.85, -0.85, 0), [(0, 0.12), (0.08, 0.28), (0.35, 0.3), (0.45, 0.26)], CAULDRON, n=8)
    start = len(m.faces)
    m.lathe((0.85, -0.85, 0.42), [(0, 0.24), (0.03, 0.22)], SPORE, n=8)
    for k in range(3):
        m.blob((0.85 + 0.1 * math.cos(k * 2.1), -0.85 + 0.1 * math.sin(k * 2.1), 0.47), (0.05, 0.05, 0.04), "#c8ff9a",
               n=4)
    lit(m, start)
    for k in range(3):
        a = k * TAU / 3
        m.tube([(0.85 + 0.3 * math.cos(a), -0.85 + 0.3 * math.sin(a), 0.38), (0.85 + 0.42 * math.cos(a),
                -0.85 + 0.42 * math.sin(a), 0)], 0.02, IRON, n=3)
    for i in range(5):
        m.lathe(polar(1.25, 0.8 + i * 0.9), [(0, 0.12), (0.5 + 0.2 * (i % 2), 0.02)], "#5a6a2e", n=4, jitter=0.3)


# ================================== nests =====================================
def build_web_gate(m, v):
    for sx in (-1, 1):
        m.lathe((sx * 1.15, 0, 0), [(0, 0.38), (0.4, 0.32), (1.8, 0.27), (2.4, 0.2), (2.7, 0)], WEB, n=8, jitter=0.1,
                colors=["#d8d4dc", WEB, "#c8c4cc"])
        for sy in (-1, 1):
            m.blob((sx * 1.15, sy * 0.48, 0.2), (0.18, 0.16, 0.22), EGG[sy > 0], n=5)
    # the canopy of web strung between them, high over the way through
    for k in range(5):
        z = 1.75 + 0.12 * k
        sag = 0.25 - 0.04 * k
        m.tube([(-1.15, -0.1 + 0.05 * k, z + 0.2), (-0.5, -0.1, z - sag * 0.7), (0, -0.05, z - sag),
                (0.5, -0.1, z - sag * 0.7), (1.15, -0.1 + 0.05 * k, z + 0.2)], 0.012, WEB, n=3)
    sheet(m, (-1.0, 0.0, 2.45), (2.0, 0, 0), (0, 0, -0.5), "#e8e4ea", cols=4, rows=2, t=0.006, wave=0.06)
    for k in range(4):
        x = -0.75 + 0.5 * k
        m.tube([(x, -0.05, 1.8), (x + 0.05, -0.08, 1.62 + 0.05 * k)], 0.006, WEB, n=3)
        m.blob((x + 0.05, -0.08, 1.58 + 0.05 * k), (0.06, 0.06, 0.09), EGG[k % 3], n=4)


def build_brood_cluster(m, v):
    m.lathe((0, 0, 0), [(0, 1.2), (0.2, 1.0), (0.45, 0.6), (0.55, 0)], "#c8c4cc", n=10, jitter=0.15)
    m.lathe((0, 0.15, 0.4), [(0, 0.3), (1.6, 0.18), (2.6, 0.08), (2.8, 0)], WEB, n=7, jitter=0.15)
    for i in range(9):
        a = i * TAU / 9 + 0.2 * (i % 2)
        r = 0.6 + 0.25 * (i % 3)
        h = 0.3 + 0.08 * ((i * 5) % 3)
        m.blob(polar(r, a, 0.4 + h * 0.6), (h * 0.7, h * 0.65, h), EGG[i % 3], n=6)
    for k in range(6):
        a = k * TAU / 6 + 0.5
        m.tube([(0, 0.15, 2.4 - 0.1 * k), polar(0.9, a, 1.2), polar(1.4, a + 0.2, 0.05)], [0.012, 0.01, 0.006], WEB, n=3)
    for k in range(3):
        m.blob(polar(0.25, k * 2.1, 1.6 + 0.3 * k), (0.15, 0.15, 0.22), EGG[k], n=5)


# ================================== mines =====================================
def build_headframe(m, v):
    for sx in (-1, 1):
        m.box((sx * 1.0, 0, 1.15), (0.2, 0.2, 2.3), TIMBER)
        m.tube([(sx * 1.0, 0.0, 2.2), (sx * 0.15, 0.0, 3.1)], 0.07, TIMBER_DARK, n=4)
    m.box((0, 0, 2.35), (2.3, 0.24, 0.22), TIMBER)
    m.ring((0, -0.05, 3.0), 0.32, 0.04, IRON, n=10, section=3, vertical=True)
    m.tube([(0, 0.1, 3.0), (0, -0.2, 3.0)], 0.04, IRON, n=4)
    m.tube([(0.32, -0.05, 3.0), (0.32, -0.05, 2.47)], 0.008, "#b0a080", n=3)
    m.box((0.32, -0.05, 2.38), (0.12, 0.12, 0.12), IRON)
    # rails running in under it, ties too low to stumble over
    for sx in (-1, 1):
        m.box((sx * 0.3, 0, 0.05), (0.05, 2.6, 0.06), IRON)
    for k in range(6):
        m.box((0, -1.1 + 0.44 * k, 0.025), (0.85, 0.12, 0.05), TIMBER_DARK)
    lantern_body(m, (1.0, -0.2, 1.75), s=1.4, glow=LAMP)
    m.box((-1.25, 0.45, 0.2), (0.36, 0.32, 0.4), WOOD, tilt=0.3)
    m.box((1.3, 0.5, 0.15), (0.3, 0.26, 0.3), TIMBER, tilt=-0.2)


def build_giant_geode(m, v):
    # the back half of a split boulder, its flat face to the front lined with crystal
    s = len(m.vertices)
    m.lathe((0, 0, 0), [(0, 0.5), (0.4, 1.05), (1.0, 1.2), (1.6, 1.0), (2.1, 0.45), (2.25, 0)], GEODE[0], n=10,
            jitter=0.1, colors=list(GEODE))
    m.vertices[s:] = [(x, max(y, 0.0), z) for x, y, z in m.vertices[s:]]
    m.lathe((0, -0.02, 1.1), [(0, 0.95), (0.06, 0.85)], "#3a2a4a", n=10, jitter=0.06, axis=(0, -1, 0))
    for i in range(14):
        a = i * TAU / 14
        r = 0.25 + 0.45 * ((i * 0.618) % 1)
        start = len(m.faces)
        s = len(m.vertices)
        m.shard((0, 0, 0), 0.08 + 0.03 * (i % 2), 0.3 + 0.15 * (i % 3), AMETHYST[i % 3], n=5)
        xform(m, s, rot=(math.pi / 2 + 0.3 * math.sin(a), 0, 0.3 * math.cos(a)),
              offset=(r * math.cos(a) * 1.1, -0.06, 1.1 + r * math.sin(a)))
        if i % 2 == 0:
            lit(m, start)
    # the front half, broken off, lying on its back with crystals up
    s = len(m.vertices)
    m.lathe((0, 0, 0), [(0, 0.3), (0.2, 0.6), (0.4, 0.55), (0.5, 0)], GEODE[1], n=8, jitter=0.12)
    xform(m, s, offset=(-0.8, -0.9, 0), scale=0.8)
    for i in range(4):
        start = len(m.faces)
        m.shard((-0.8 + 0.2 * math.cos(i * 1.6), -0.9 + 0.2 * math.sin(i * 1.6), 0.3), 0.07, 0.28, AMETHYST[i % 3],
                n=5)
        if i % 2:
            lit(m, start)
    for i, (x, y) in enumerate(((1.05, -0.8), (0.7, -1.2), (-1.4, -0.3))):
        m.blob((x, y, 0.1), (0.2, 0.16, 0.12), GEODE[i % 3], n=5)


# ================================== ruins =====================================
def column(m, x, y, h, colors=MARBLE, broken=0.0):
    m.box((x, y, 0.08), (0.62, 0.62, 0.16), colors[1])
    m.lathe((x, y, 0.16), [(0, 0.24), (h - 0.3 - broken, 0.21)], colors[0], n=8, jitter=0.02)
    if not broken:
        m.lathe((x, y, h - 0.14), [(0, 0.22), (0.1, 0.3)], colors[2], n=8)
        m.box((x, y, h - 0.02), (0.66, 0.66, 0.1), colors[1])


def build_temple_gate(m, v):
    for sx in (-1, 1):
        column(m, sx * 1.1, 0, 2.5)
    m.box((0, 0, 2.62), (2.9, 0.62, 0.3), MARBLE[2])
    prism(m, [(-1.35, -0.28), (1.35, -0.28), (1.35, 0.28), (-1.35, 0.28)], 2.77, 2.87, MARBLE[1])
    s = len(m.vertices)
    extrude_x(m, [(-0.3, 0), (0.3, 0), (0, 0.5)], -1.3, 0.55, MARBLE[0])
    xform(m, s, offset=(0, 0, 2.87))
    m.box((0.9, -0.05, 2.97), (0.6, 0.5, 0.2), MARBLE[1], tilt=0.3)
    letters(m, (-0.9, -0.31, 2.62), (1, 0, 0), (0, 0, 1), 18, 0.05, "#8a8274")
    for i, (x, y, r) in enumerate(((1.0, -0.85, 0.28), (1.3, -0.45, 0.2), (-1.15, -0.75, 0.22), (-1.1, 0.8, 0.25))):
        m.box((x, y, r / 2), (r * 1.6, r * 1.2, r), MARBLE[i % 3], tilt=i * 0.7, jitter=0.02)


def build_colossus_head(m, v):
    s = len(m.vertices)
    m.blob((0, 0, 1.0), (1.05, 1.0, 1.05), "#b8b0a0", n=10, jitter=0.05)
    m.box((0, -0.98, 1.0), (0.3, 0.3, 0.5), "#b0a898")
    for sx in (-1, 1):
        m.box((sx * 0.38, -0.88, 1.35), (0.3, 0.12, 0.12), "#7a7266")
        m.box((sx * 0.38, -0.8, 1.52), (0.36, 0.2, 0.08), "#a8a090")
    m.box((0, -0.86, 0.55), (0.5, 0.12, 0.1), "#8a8274")
    for k in range(7):
        a = math.pi * (0.1 + 0.8 * k / 6)
        m.box((math.cos(a) * 0.95, 0.15 + 0.1 * (k % 2), 1.0 + math.sin(a) * 0.95), (0.28, 0.4, 0.28), "#9a9284",
              tilt=a)
    xform(m, s, rot=(0, 0.35, 0.25))
    clamp_ground(m, s)
    m.lathe((0.25, 0.55, 0), [(0, 0.55), (0.3, 0.5), (0.35, 0.3)], "#a8a090", n=8, jitter=0.15)
    for i, (x, y, r) in enumerate(((-1.2, -0.7, 0.22), (1.25, -0.5, 0.18), (1.1, 0.9, 0.25), (-1.0, 0.95, 0.2))):
        m.box((x, y, r / 2), (r * 1.5, r * 1.2, r), RUIN_LIGHT, tilt=i * 0.9, jitter=0.02)
    m.blob((-0.5, 0.2, 1.95), (0.3, 0.25, 0.08), MOSS, n=5)


# ================================= volcanic ===================================
def build_fire_shrine(m, v):
    for k, (w, d) in enumerate(((2.3, 2.0), (1.7, 1.45), (1.1, 0.9))):
        m.box((0, 0.1 * k, 0.15 + 0.3 * k), (w, d, 0.3), (BASALT, "#3e3634", "#463c3a")[k], jitter=0.02)
    m.lathe((0, 0.2, 0.9), [(0, 0.2), (0.3, 0.42), (0.45, 0.48)], "#2e2826", n=8)
    start = len(m.faces)
    m.lathe((0, 0.2, 1.3), [(0, 0.42), (0.04, 0.4)], LAVA_GLOW, n=8)
    flame(m, (0, 0.2, 1.33), 0.55, EMBER, r=0.2)
    lit(m, start)
    for i in range(6):
        a = i * TAU / 6 + 0.5
        m.shard(polar(1.35, a), 0.13, 0.7 + 0.35 * (i % 2), OBSIDIAN, n=5)
    start = len(m.faces)
    for k in range(4):
        m.box((-0.75 + 0.5 * k, -0.95, 0.31), (0.3, 0.04, 0.03), LAVA_GLOW, tilt=0.2 * k)
    lit(m, start)


def build_fumarole(m, v):
    m.lathe((0, 0, 0), [(0, 1.25), (0.4, 1.05), (1.4, 0.7), (2.6, 0.42), (3.0, 0.38)], "#3a3230", n=10, jitter=0.12,
            colors=["#2e2826", "#3a3230", "#4a3e38", "#3a3230"])
    start = len(m.faces)
    m.lathe((0, 0, 2.95), [(0, 0.3), (0.04, 0.26)], LAVA_GLOW, n=8)
    for k in range(5):
        a = -math.pi / 2 + (k - 2) * 0.5
        z0 = 0.3 + 0.4 * k
        r0 = 1.05 - 0.13 * k
        m.tube([polar(r0 + 0.02, a, z0), polar(r0 - 0.12, a + 0.1, z0 + 0.45)], 0.035, LAVA_GLOW, n=3)
    lit(m, start)
    m.lathe((0, 0, 3.0), [(0, 0.36), (0.15, 0.3)], SULFUR_CRUST, n=8, jitter=0.15)
    for k in range(3):
        m.blob((0.1 * k, -0.05 * k, 3.35 + 0.35 * k), (0.32 + 0.1 * k, 0.28 + 0.08 * k, 0.2), ("#8a8480", "#a09a96")[k % 2],
               n=6)
    for i in range(5):
        a = i * TAU / 5 + 0.8
        m.lathe(polar(1.45, a), [(0, 0.18), (0.1, 0.14), (0.15, 0)], SULFUR_CRUST, n=5, jitter=0.2)


# ================================== abyss =====================================
def build_chained_obelisk(m, v):
    s = len(m.vertices)
    prism(m, [(-0.42, -0.42), (0.42, -0.42), (0.42, 0.42), (-0.42, 0.42)], 0, 3.2, OBSIDIAN)
    m.vertices[s:] = [(x * (1 - 0.45 * z / 3.2), y * (1 - 0.45 * z / 3.2), z) for x, y, z in m.vertices[s:]]
    m.lathe((0, 0, 3.2), [(0, 0.25), (0.45, 0)], "#3a3446", n=4, jitter=0, phase=math.pi / 4)
    m.box((0, 0, 0.12), (1.4, 1.4, 0.24), "#22202a")
    start = len(m.faces)
    for k in range(5):
        z = 0.6 + 0.5 * k
        w = 0.42 * (1 - 0.45 * z / 3.2)
        m.box((0, -w - 0.005, z), (w * 1.1, 0.02, 0.1), RUNE)
        m.box((-w - 0.005, 0, z + 0.2), (0.02, w * 1.1, 0.1), RUNE)
    lit(m, start)
    for k in range(4):
        a = k * TAU / 4 + math.pi / 4
        top = Vector((0.3 * math.cos(a), 0.3 * math.sin(a), 2.2))
        stake = Vector(polar(1.45, a, 0))
        for t in range(6):
            p = top.lerp(stake, t / 6) - Vector((0, 0, 0.35 * math.sin(math.pi * t / 6)))
            m.ring(p, 0.06, 0.014, IRON, n=6, vertical=True, yaw=a + (t % 2) * math.pi / 2)
        m.tube([stake, stake + Vector((0, 0, 0.35))], [0.06, 0.03], IRON, n=4)


def build_void_throne(m, v):
    m.box((0, 0.1, 0.15), (2.0, 1.8, 0.3), "#22202a", jitter=0.01)
    m.box((0, 0.25, 0.45), (1.3, 1.2, 0.3), "#2a2834")
    m.box((0, 0.35, 0.75), (0.9, 0.7, 0.3), OBSIDIAN)
    s = len(m.vertices)
    prism(m, [(-0.45, 0.55), (0.45, 0.55), (0.5, 0.72), (-0.5, 0.72)], 0.9, 2.6, OBSIDIAN)
    m.vertices[s:] = [(x * (1 - 0.3 * max(0, z - 0.9) / 1.7), y, z) for x, y, z in m.vertices[s:]]
    for sx in (-1, 1):
        m.box((sx * 0.42, 0.35, 1.05), (0.12, 0.6, 0.3), "#3a3446")
        m.shard((sx * 0.55, 0.65, 2.0), 0.12, 0.9, "#3a2a4a", n=5)
    start = len(m.faces)
    m.blob((0, 0.6, 2.85), (0.2, 0.2, 0.2), VOID, n=6)
    for i in range(5):
        a = i * TAU / 5 + 0.4
        m.shard(polar(1.15, a), 0.1, 0.4 + 0.2 * (i % 2), VOID, n=5)
    lit(m, start)
    for i in range(4):
        m.shard(polar(1.3, i * TAU / 4 + 1.2), 0.12, 0.6, OBSIDIAN, n=5)
