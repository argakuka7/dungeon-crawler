"""Theme builders: surface themes (see themes.py).

    karst      Karst and rice terraces: limestone needles, flooded steps, bamboo, mist
    clouds     Cloud kingdom: islands on cloud banks, wind, the Wolks' home
    saltflats  Salt flats: white crust, a thin mirror of water, pink crystals, flamingos
    lagoon     Tropical lagoon: an archipelago over turquoise water, sand, palms, wrecks

Every builder is build_<prop>(m, variant) on a props.Mesh in attachment space.
"""
import math
from pathlib import Path
import sys

from mathutils import Euler, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from props import WOOD, BARK, STONE, STONE_DARK, MOSS  # noqa: E402,F401
from themes_geo import *  # noqa: E402,F401,F403

PADDY = ("#7ac848", "#8ad858", "#5aa83a", "#a0e070")
BAMBOO = ("#7a9a3a", "#8aaa48", "#6a8a32")
TILE_GREEN = "#3e6a5a"
LACQUER = "#b83a2a"
CLOUD = "#f6f8fc"
CLOUD_SHADE = "#dce4f0"
CLOUD_BLUE = "#bccbe6"
SILVER = "#c8ccd4"
RAINBOW = ("#e85a5a", "#f0a040", "#f0d850", "#6ac86a", "#5a9ae8", "#9a6ad8")
FLAMINGO = ("#f08aa0", "#f4a0b4", "#e07088")
PALM_LEAF = ("#3a8a3a", "#4a9a44", "#2e7a36")
SAND_DARK = "#d4b878"
KARST_STREAKS = ("#c4c2b4", "#8e8c80", "#b8b6a8", "#6e7262", "#d0cec0", "#9a988c", "#a8a698")
CORAL = ("#f06a7a", "#f09a4a", "#a06ad8", "#f0c84a")


def rotated(m, start, rot, offset=(0, 0, 0)):
    xform(m, start, rot=rot, offset=offset)


# =============================== karst =======================================
def build_rice_shoots(m, v):
    m.lathe((0, 0, 0), [(0, 0.3), (0.012, 0.28), (0.02, 0)], "#6a5a3a", n=7, jitter=0.15)
    spots = [(-0.12, -0.12), (0.12, -0.12), (-0.12, 0.12), (0.12, 0.12)] + ([(0, 0)] if v else [])
    for i, (x, y) in enumerate(spots):
        for k in range(4):
            a = k * TAU / 4 + i
            blade(m, (x, y, 0.015), (x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), 0.17 + 0.05 * ((i + k) % 3)),
                  0.014, PADDY[(i + k) % 4])


def build_moss_stones(m, v):
    for i in range(4 + v):
        r = 0.12 - 0.02 * i
        h = r * 1.1
        m.lathe(polar(0.18 * (i > 0), i * 2.3 + v), [(0, r * 0.8), (h * 0.5, r), (h, r * 0.4)],
                LIMESTONE, n=5, jitter=0.2, colors=[LIMESTONE_DARK, "#5a8a3a"])


def build_bamboo_clump(m, v):
    m.lathe((0, 0, 0), [(0, 0.25), (0.04, 0.2), (0.07, 0)], "#5a4a32", n=6, jitter=0.2)
    for i in range(5 + v):
        a = i * 2.4 + v
        base = Vector(polar(0.1 * (i > 0) + 0.02 * i, a))
        h = 1.6 + 0.6 * ((i * 0.618) % 1)
        lean = Vector(polar(0.22, a, 0)) * (0.5 + 0.5 * (i % 2))
        axis = (lean.x, lean.y, h)
        prof = [(h * k / 4, 0.035 - 0.004 * k) for k in range(5)]
        m.lathe(base, prof, BAMBOO[i % 3], n=4, jitter=0.0, axis=axis,
                colors=[BAMBOO[i % 3], "#c8c088"])
        top = base + Vector(axis).normalized() * h
        for k in range(3):
            d = Vector(polar(0.22, a + k * 2.1, -0.06))
            blade(m, top - Vector(axis).normalized() * 0.15 * k, top + d - Vector((0, 0, 0.1 * k)), 0.04,
                  PALM_LEAF[(i + k) % 3])


def build_banana_plant(m, v):
    h = 0.75 + 0.15 * v
    m.lathe((0, 0, 0), [(0, 0.09), (h * 0.5, 0.07), (h, 0.05)], "#7a8a4a", n=6, jitter=0.1,
            colors=["#6a7a3a", "#8a9a5a"])
    for i in range(6):
        a = i * TAU / 6 + 0.3 * v
        base = Vector((0, 0, h - 0.05 * (i % 2)))
        mid = base + Vector(polar(0.22, a, 0.28))
        tip = mid + Vector(polar(0.2, a + 0.15, -0.22))
        blade(m, base, mid, 0.09, ("#4a9a3a", "#5aaa44")[i % 2])
        blade(m, mid, tip, 0.085, ("#5aaa44", "#3e8a34")[i % 2])
    if v:
        m.tube([(0.03, 0, h - 0.05), (0.12, 0.02, h - 0.15), (0.14, 0.02, h - 0.4)], 0.015, "#6a7a3a", n=4)
        for k in range(4):
            m.blob((0.14 + 0.03 * math.cos(k * 1.6), 0.02 + 0.03 * math.sin(k * 1.6), h - 0.2 - 0.04 * k),
                   (0.035, 0.035, 0.05), "#a8c040", n=4)
        m.blob((0.14, 0.02, h - 0.43), (0.03, 0.03, 0.05), "#8a2a4a", n=4)


def build_stone_lantern(m, v):
    m.lathe((0, 0, 0), [(0, 0.24), (0.08, 0.22), (0.12, 0.14)], LIMESTONE, n=6, jitter=0.02,
            colors=[LIMESTONE_DARK, LIMESTONE])
    m.lathe((0, 0, 0.12), [(0, 0.07), (0.36 + 0.1 * v, 0.06)], LIMESTONE, n=6, jitter=0.02)
    z = 0.48 + 0.1 * v
    m.lathe((0, 0, z), [(0, 0.12), (0.05, 0.17)], LIMESTONE, n=6, jitter=0.02)
    m.box((0, 0, z + 0.14), (0.2, 0.2, 0.18), LIMESTONE)
    start = len(m.faces)
    for a in (0, math.pi / 2):
        m.box((0, 0, z + 0.14), (0.24 if a == 0 else 0.1, 0.1 if a == 0 else 0.24, 0.1), "#ffd080")
    lit(m, start)
    m.lathe((0, 0, z + 0.23), [(0, 0.28), (0.04, 0.24), (0.14, 0.06)], LIMESTONE_DARK, n=6, jitter=0.02,
            colors=[LIMESTONE, LIMESTONE_DARK])
    m.lathe((0, 0, z + 0.37), [(0, 0.04), (0.04, 0.05), (0.09, 0)], LIMESTONE, n=6)
    if v:
        m.lathe((0, 0, 0.002), [(0, 0.3), (0.02, 0.27)], "#5a8a3a", n=7, jitter=0.25)


def build_scarecrow(m, v):
    m.tube([(0, 0, 0), (0, 0, 1.15)], 0.025, WOOD, n=4)
    m.tube([(-0.38, 0, 0.82), (0.38, 0, 0.84)], 0.02, WOOD, n=4)
    m.lathe((0, 0, 0.45), [(0, 0.2), (0.25, 0.16), (0.42, 0.08)], ("#8a5a3a", "#3a5a8a")[v], n=6, jitter=0.12)
    for s in (-1, 1):
        m.lathe((s * 0.2, 0, 0.82), [(0, 0.06), (0.16, 0.05)], STRAW, n=5, axis=(s, 0, 0), jitter=0.2)
        blade(m, (s * 0.35, 0, 0.82), (s * 0.42, 0.02, 0.72), 0.03, STRAW)
    m.blob((0, 0, 0.98), (0.09, 0.09, 0.1), BURLAP, n=6)
    m.lathe((0, 0, 1.05), [(0, 0.26), (0.03, 0.24), (0.15, 0.0)], STRAW, n=8, jitter=0.03,
            colors=["#b89850", STRAW])
    if v:
        ribbon(m, [(0.38, 0, 0.84), (0.42, 0.02, 0.7), (0.44, 0.04, 0.55)], (0, 1, 0), 0.04, LACQUER)


def build_rice_sheaves(m, v):
    for s in (-1, 1):
        m.tube([(s * 0.36, 0, 0), (s * 0.36, 0, 0.7)], 0.02, BARK, n=4)
    m.tube([(-0.4, 0, 0.66), (0.4, 0, 0.66)], 0.018, BAMBOO[0], n=4)
    for i in range(4):
        x = -0.24 + i * 0.16
        m.lathe((x, 0, 0.36), [(0, 0.02), (0.12, 0.06), (0.26, 0.04), (0.3, 0.025)], STRAW, n=5, jitter=0.15,
                colors=["#d8c070", STRAW, "#b89850"])
        m.box((x, 0, 0.64), (0.05, 0.05, 0.03), "#8a6a40")
    if v:
        for i in range(3):
            c = polar(0.25, 1.4 + i * 0.6, 0)
            c = (c[0], c[1] - 0.05, 0)
            m.lathe(c, [(0, 0.05), (0.12, 0.08), (0.25, 0.02)], STRAW, n=5, jitter=0.15, colors=[STRAW, "#d8c070"])


def build_karst_needle(m, v):
    h = 1.25 + 0.3 * v
    prof = [(0, 0.3), (h * 0.12, 0.34), (h * 0.3, 0.27), (h * 0.5, 0.3), (h * 0.68, 0.25), (h * 0.84, 0.2),
            (h * 0.95, 0.12), (h, 0.03)]
    s, f = len(m.vertices), len(m.faces)
    m.lathe((0, 0, 0), prof, LIMESTONE, n=7, jitter=0.25)
    streaks(m, f, 7, len(prof) - 1, KARST_STREAKS)
    wobble(m, s, 0.03, freq=4, phase=v, lean=(0.04, 0.02))
    for i in range(4):
        z = h * (0.35 + 0.17 * i)
        m.blob(polar(0.26 - 0.03 * i, i * 2.3 + v, z), (0.1, 0.08, 0.06), ("#4a7a3a", "#5a8a44")[i % 2], n=5)
    top = Vector((0.04 * h, 0.02 * h, h - 0.04))
    m.blob(top, (0.13, 0.12, 0.08), "#4a7a3a", n=5)
    m.tube([top, top + Vector((0.03, 0.02, 0.22))], [0.015, 0.008], BARK, n=3)
    m.blob(top + Vector((0.03, 0.02, 0.26)), (0.1, 0.1, 0.07), "#3e6a34", n=5)


def build_lotus(m, v):
    for i in range(3 + v):
        lily_pad(m, polar(0.2 * (i > 0) + 0.02 * i, i * 2.3 + v, 0.0), 0.15 - 0.02 * i,
                 ("#3a8a4a", "#4a9a52", "#2e7a40", "#5aa85a")[i], notch=m.rng.random() * TAU, rim="#2e6a3a")
    c = Vector((0.05, 0.06, 0.0))
    m.tube([c, c + Vector((0, 0, 0.22))], 0.01, "#4a8a3a", n=3)
    top = c + Vector((0, 0, 0.22))
    for k in range(6):
        a = k * TAU / 6
        blade(m, top, top + Vector(polar(0.07, a, 0.1)), 0.035, ("#f4a0c0", "#fbd4e2")[k % 2])
    m.lathe(top, [(0, 0.025), (0.04, 0.03)], "#d8c840", n=5)
    if v:
        m.tube([(-0.15, -0.1, 0), (-0.15, -0.1, 0.3)], 0.009, "#4a8a3a", n=3)
        m.lathe((-0.15, -0.1, 0.3), [(0, 0.02), (0.03, 0.045), (0.05, 0.04)], "#8a9a4a", n=6)


def build_bamboo_raft(m, v):
    for i in range(6):
        y = -0.18 + i * 0.072
        m.tube([(-0.4, y, 0.015), (0.4 + 0.03 * (i % 2), y, 0.015)], 0.034, BAMBOO[i % 3], n=5)
    for x in (-0.28, 0.28):
        m.box((x, 0, 0.05), (0.04, 0.42, 0.02), "#8a6a40")
    if v == 0:
        m.lathe((0.1, 0.0, 0.05), [(0, 0.17), (0.02, 0.15), (0.09, 0)], STRAW, n=8, jitter=0.03)
    else:
        m.lathe((-0.1, 0.02, 0.05), [(0, 0.06), (0.14, 0.08), (0.18, 0.06)], "#a08050", n=6)
        m.tube([(-0.35, 0.15, 0.06), (0.38, 0.05, 0.08)], 0.012, BAMBOO[2], n=4)


def build_fern_curtain(m, v):
    w = 0.42
    front = [(x, 0.03 + 0.02 * math.sin(x * 9 + v)) for x in [w - 2 * w * i / 6 for i in range(7)]]
    prism(m, [(-w, -0.2), (w, -0.2)] + front, 0.0, 0.05, "#5a4a32", top="#5a8a3a")
    for i in range(6 + v):
        x = -w + 2 * w * (i + 0.5) / (6 + v)
        drop = 0.35 + 0.35 * ((i * 0.618 + v * 0.3) % 1)
        pts = [Vector((x, 0.04, 0.03)), Vector((x + 0.02, 0.08, -drop * 0.4)), Vector((x - 0.02, 0.09, -drop))]
        m.tube(pts, [0.008, 0.006, 0.003], "#4a7a3a", n=3)
        for k in range(2):
            p = pts[1].lerp(pts[2], 0.3 + 0.5 * k)
            for s in (-1, 1):
                blade(m, p, p + Vector((s * 0.09, 0.03, -0.04)), 0.03, PALM_LEAF[(i + k) % 3], ref=(0, 1, 0))
    clamp_lip(m)


def build_wall_shrine(m, v):
    m.box((0, 0.1, 0), (0.34, 0.2, 0.3), LACQUER)
    m.box((0, 0.2, 0.0), (0.26, 0.01, 0.22), "#3a2a22")
    m.lathe((0, 0.1, 0.15), [(0, 0.3), (0.04, 0.26), (0.12, 0.05)], TILE_GREEN, n=4, jitter=0, phase=math.pi / 4)
    m.box((0, 0.14, -0.17), (0.38, 0.28, 0.04), "#6e5236")
    m.lathe((0, 0.2, -0.15), [(0, 0.05), (0.05, 0.06)], BRASS, n=6)
    for i in range(3):
        x = -0.02 + 0.02 * i
        m.tube([(x, 0.2, -0.1), (x, 0.2 + 0.01 * i, 0.04)], 0.004, "#8a3a2a", n=3)
        start = len(m.faces)
        m.box((x, 0.2 + 0.01 * i, 0.045), (0.012, 0.012, 0.012), "#ffb060")
        lit(m, start)
    for k in range(2 + v):
        m.blob((-0.11 + 0.04 * k, 0.22, -0.13), (0.025, 0.025, 0.025), ("#f0a030", "#e05a3a", "#f0d050")[k], n=4)
    flatten_back(m)


def build_pavilion(m, v):
    R = 1.0
    hexagon(m, (0, 0), R + 0.12, 0, 0.12, "#9a9890", top=LIMESTONE)
    hexagon(m, (0, 0), R, 0.12, 0.22, LIMESTONE, top="#c8c6b8")
    m.box((0, -R - 0.18, 0.06), (0.6, 0.3, 0.12), LIMESTONE)
    cols = []
    for k in range(6):
        a = k * TAU / 6 + TAU / 12
        p = Vector(polar(R * 0.82, a, 0.22))
        cols.append(p)
        m.tube([p, p + Vector((0, 0, 1.25))], 0.05, LACQUER, n=6)
        m.lathe(p, [(0, 0.08), (0.06, 0.07)], "#5a5850", n=6)
    for k in range(6):
        a, b = cols[k], cols[(k + 1) % 6]
        if k == 4:
            continue  # the open front
        mid = (a + b) / 2
        m.box(mid + Vector((0, 0, 0.32)), ((a - b).length, 0.05, 0.05), LACQUER,
              tilt=math.atan2(b.y - a.y, b.x - a.x))
        m.box(mid + Vector((0, 0, 0.14)), ((a - b).length, 0.03, 0.03), LACQUER,
              tilt=math.atan2(b.y - a.y, b.x - a.x))
    z = 1.47
    hexagon(m, (0, 0), R * 0.86, z, z + 0.1, LACQUER, phase=TAU / 12)
    m.lathe((0, 0, z + 0.1), [(0, R * 1.3), (0.08, R * 1.18), (0.35, R * 0.62), (0.65, R * 0.18), (0.75, 0.04)],
            TILE_GREEN, n=6, jitter=0, phase=TAU / 12, colors=["#2e5a4a", TILE_GREEN, "#4a7a6a", TILE_GREEN])
    for k in range(6):
        a = k * TAU / 6 + TAU / 12
        base = Vector(polar(R * 1.25, a, z + 0.16))
        m.tube([base - Vector(polar(0.2, a, 0.03)), base, base + Vector(polar(0.14, a, 0.16))], [0.04, 0.035, 0.01],
               TILE_GREEN, n=4)
    m.lathe((0, 0, z + 0.82), [(0, 0.08), (0.12, 0.1), (0.24, 0.04), (0.32, 0)], GOLD, n=6)
    # a lantern hanging inside
    m.tube([(0, 0, z), (0, 0, z - 0.35)], 0.008, IRON, n=3)
    m.lathe((0, 0, z - 0.58), [(0, 0.06), (0.06, 0.12), (0.18, 0.12), (0.24, 0.06)], LACQUER, n=6,
            colors=[GOLD, LACQUER, GOLD])


def build_karst_tower(m, v):
    h = 3.7
    prof = [(0, 1.15), (0.3, 1.22), (0.8, 1.02), (1.3, 1.1), (1.8, 0.96), (2.3, 1.02), (2.8, 0.88), (3.2, 0.72),
            (3.5, 0.45), (h, 0.1)]
    s, f = len(m.vertices), len(m.faces)
    m.lathe((0, 0, 0), prof, LIMESTONE, n=9, jitter=0.2)
    streaks(m, f, 9, len(prof) - 1, KARST_STREAKS)
    for i in range(9):
        for b in (len(prof) - 3, len(prof) - 2):
            m.colors[f + 1 + b * 9 + i] = tuple(linear(("#5a8a44", "#4a7a3a", "#6a9a4a")[(i + b) % 3])) + (1,)
    wobble(m, s, 0.06, freq=1.8, lean=(0.03, 0.0))
    greens = ("#4a7a3a", "#5a8a44", "#3e6a34")
    for i in range(9):
        z = 0.6 + 0.3 * i
        r = next(rr for zz, rr in reversed(prof) if zz <= z) * 0.97
        p = Vector(polar(r, i * 2.4, z)) + Vector((0.03 * z, 0, 0))
        m.blob(p, (0.24, 0.18, 0.11), greens[i % 3], n=5)
    for i in range(6):
        a = i * TAU / 6 + 0.3
        m.blob(Vector(polar(0.45, a, 3.3)) + Vector((0.1, 0, 0)), (0.3, 0.26, 0.16), greens[i % 3], n=5)
    for i in range(3):
        c = Vector(polar(0.2 * (i > 0), i * 2.1, h - 0.1)) + Vector((0.11, 0, 0))
        m.tube([c, c + Vector(polar(0.06, i, 0.35))], [0.03, 0.015], BARK, n=4)
        m.blob(c + Vector(polar(0.06, i, 0.42)), (0.24, 0.22, 0.14), greens[i % 3], n=6)
    # a little shrine ledge and steps cut into the foot
    m.box((0.0, -1.2, 0.28), (0.5, 0.3, 0.05), LIMESTONE_DARK)
    m.box((0.0, -1.3, 0.12), (0.45, 0.25, 0.24), LIMESTONE)


# =============================== clouds ======================================
def puff(m, center, r, color=CLOUD, n=6, flat=0.8):
    """A cloud puff: a rounder, smoother blob than a rock (more sides, little jitter)."""
    s = len(m.vertices)
    m.lathe((0, 0, 0), [(-1, 0), (-0.8, 0.6), (-0.4, 0.92), (0, 1), (0.45, 0.9), (0.8, 0.6), (1, 0)], color,
            n=n, jitter=0.04, phase=m.rng.random(), colors=[CLOUD_SHADE, color, color, color, color, "#ffffff"])
    m.vertices[s:] = [(center[0] + x * r, center[1] + y * r * 0.92, center[2] + z * r * flat)
                      for x, y, z in m.vertices[s:]]


def build_cloud_tufts(m, v):
    for i in range(3 + v):
        r = 0.13 - 0.02 * i
        puff(m, polar(0.15 * (i > 0), i * 2.4 + v, r * 0.45), r, (CLOUD, CLOUD_SHADE, CLOUD, CLOUD_BLUE)[i],
             n=5, flat=0.65)
    clamp_ground(m)


def build_wind_feathers(m, v):
    for i in range(3 + v):
        c = polar(0.16 * (i > 0) + 0.03 * i, i * 2.5 + v)
        a = m.rng.random() * TAU
        flat_leaf(m, c, 0.2 - 0.02 * i, 0.04, a, 0.01 + 0.006 * i, ("#f4f4f4", "#c8d0dc", "#8aa0c8", "#f4f4f4")[i])
        m.tube([(c[0], c[1], 0.012 + 0.006 * i), (c[0] + 0.24 * math.cos(a), c[1] + 0.24 * math.sin(a),
                                                   0.016 + 0.006 * i)], 0.005, "#e8e4d8", n=3)


def build_cloud_bush(m, v):
    m.tube([(0, 0, 0), (0.02, 0, 0.25)], [0.03, 0.02], SILVER, n=4)
    for i in range(5 + v):
        c = Vector(polar(0.2 * (i > 0), i * 2.4 + v, 0.32 + 0.1 * (i % 2) + 0.12 * (i == 0)))
        puff(m, c, 0.17 - 0.012 * i, (CLOUD, CLOUD_SHADE, CLOUD, CLOUD_BLUE, CLOUD, CLOUD_SHADE)[i], n=5)


def build_storm_jar(m, v):
    m.lathe((0, 0, 0), [(0, 0.17), (0.05, 0.18), (0.07, 0.14)], IRON, n=6)
    m.lathe((0, 0, 0.5), [(0, 0.14), (0.04, 0.16), (0.07, 0.06), (0.14, 0.03)], IRON, n=6)
    m.ring((0, 0, 0.62), 0.05, 0.012, IRON, n=6, vertical=True)
    for k in range(5):
        a = k * TAU / 5
        m.tube([polar(0.15, a, 0.07), polar(0.17, a, 0.3), polar(0.14, a, 0.5)], 0.01, IRON, n=3)
    start = len(m.faces)
    m.blob((0, 0, 0.3), (0.09, 0.09, 0.08), "#cfe4ff", n=5)
    pts = [(0.0, 0.0, 0.45), (0.05, 0.02, 0.36), (-0.03, 0.0, 0.3), (0.04, -0.02, 0.22), (0.0, 0.0, 0.12)]
    m.tube(pts, [0.016, 0.014, 0.014, 0.01, 0.004], "#e8f4ff", n=3)
    lit(m, start)
    if v:
        for k in range(3):
            puff(m, polar(0.24, k * 2.3, 0.05), 0.08, CLOUD_SHADE, n=5, flat=0.5)
        clamp_ground(m)


def build_wind_chimes(m, v):
    h = 1.35
    m.tube([(0, 0, 0), (0, 0, h), (0.12, 0, h + 0.1), (0.24, 0, h - 0.02)], [0.025, 0.02, 0.018, 0.015], SILVER,
           n=4)
    c = Vector((0.24, 0, h - 0.12))
    m.tube([c + Vector((0, 0, 0.1)), c], 0.004, "#8a8a8a", n=3)
    m.lathe(c, [(0, 0.15), (0.02, 0.15)], ("#a8884a", SILVER)[v], n=8)
    for k in range(5 + v):
        a = k * TAU / (5 + v)
        p = c + Vector(polar(0.11, a))
        length = 0.22 + 0.06 * (k % 3)
        m.tube([p, p - Vector((0, 0, 0.06))], 0.003, "#8a8a8a", n=3)
        m.lathe(p - Vector((0, 0, 0.06 + length)), [(0, 0.016), (length, 0.016)], ("#d8b860", "#c8d0dc")[(k + v) % 2],
                n=5)
    sheet(m, c - Vector((0, 0, 0.38)), (0.0, 0.14, 0), (0, 0, -0.16), "#5a9ae8", cols=1, rows=1, wave=0.02)
    for k in range(3):
        puff(m, polar(0.14, k * 2.1, 0.03), 0.09, CLOUD, flat=0.5)
    clamp_ground(m)


def build_rainbow_crystal(m, v):
    puff(m, (0, 0, 0.03), 0.28, CLOUD_SHADE, flat=0.3)
    clamp_ground(m)
    start = len(m.faces)
    m.shard((0, 0, 0.04), 0.09, 0.7 + 0.15 * v, "#ffffff", n=6)
    lit(m, start)
    for i in range(6):
        h = 0.25 + 0.1 * ((i * 3) % 4)
        m.shard(polar(0.18, i * TAU / 6 + v, 0.03), 0.055, h, RAINBOW[i], n=5)


def build_sky_nest(m, v):
    m.lathe((0, 0, 0), [(0, 0.22), (0.06, 0.28), (0.14, 0.32), (0.18, 0.3)], "#a8885a", n=8, jitter=0.12,
            colors=["#8a6a40", "#a8885a", "#c8a870"])
    m.lathe((0, 0, 0.14), [(0, 0.24), (0.02, 0.2)], "#6a5232", n=8)
    for k in range(2):
        m.ring((0, 0, 0.15 + 0.04 * k), 0.3 - 0.02 * k, 0.025, ("#8a6a40", "#b8986a")[k], n=8, section=3)
    for k in range(3 - v):
        m.blob(polar(0.08 * (k > 0), k * 2.2, 0.21), (0.06, 0.05, 0.07), ("#c8e0f0", "#e0ecf8", "#b0d0e8")[k], n=5)
    for k in range(2):
        flat_leaf(m, polar(0.18, k * 3 + 1, 0), 0.14, 0.03, k * 3 + 1.5, 0.2, "#f4f4f4")


def build_weather_vane(m, v):
    h = 1.55
    m.lathe((0, 0, 0), [(0, 0.16), (0.06, 0.12), (0.1, 0.05)], SILVER, n=6)
    m.tube([(0, 0, 0), (0, 0, h)], 0.02, SILVER, n=4)
    for k in range(4):
        a = k * TAU / 4
        m.tube([(0, 0, h - 0.3), polar(0.2, a, h - 0.3)], 0.01, SILVER, n=3)
        m.blob(polar(0.22, a, h - 0.3), (0.03, 0.03, 0.03), "#d8b860", n=4)
    if v == 0:
        m.tube([(-0.3, 0, h), (0.32, 0, h)], 0.012, "#d8b860", n=4)
        m.lathe((0.32, 0, h), [(0, 0.05), (0.12, 0)], "#d8b860", n=4, axis=(1, 0, 0))
        s = len(m.vertices)
        prism(m, [(-0.36, 0), (-0.26, 0.0), (-0.22, 0.14), (-0.36, 0.12)], -0.008, 0.008, "#d8b860")
        xform(m, s, rot=(math.pi / 2, 0, 0), offset=(0, 0, h - 0.02))
    else:
        for k in range(3):
            a = k * TAU / 3
            m.tube([(0, 0, h), polar(0.2, a, h)], 0.008, SILVER, n=3)
            m.lathe(polar(0.22, a, h - 0.05), [(0, 0.045), (0.08, 0.02)], "#5a9ae8", n=6,
                    axis=(math.cos(a + 1.57), math.sin(a + 1.57), 0))
    puff(m, (0, 0, h + 0.05), 0.07, CLOUD, n=5)


def build_cloud_spill(m, v):
    for i in range(3):
        x = -0.3 + 0.3 * i
        puff(m, (x, -0.1, 0.06), 0.15, CLOUD, n=5, flat=0.6)
    for i in range(3 + v):
        x = -0.25 + 0.5 * i / (2 + v) + m.rng.uniform(-0.04, 0.04)
        z = -0.12 - 0.15 * (i % 2) - 0.08 * v
        r = 0.12 - 0.02 * (i % 2)
        puff(m, (x, r * 0.9 + 0.01, z), r, (CLOUD_SHADE, CLOUD)[i % 2], n=5, flat=0.8)
    puff(m, (0.05, 0.08, -0.4 - 0.1 * v), 0.07, CLOUD_BLUE, n=5)
    clamp_lip(m)


def build_raincloud(m, v):
    for i in range(4 + v):
        c = polar(0.22 * (i > 0), i * 2.3 + v, -0.08 - 0.04 * (i % 2))
        puff(m, c, 0.18 - 0.015 * i, ("#b8c4d8", "#a8b4c8", "#c8d2e4", "#9aa6ba", "#b8c4d8")[i], n=5, flat=0.6)
    for k in range(7 + v):
        x, y, _ = polar(0.2 * ((k * 0.618) % 1), k * 2.4)
        top = -0.16 - 0.02 * (k % 3)
        m.tube([(x, y, top), (x + 0.02, y, top - 0.3 - 0.1 * (k % 3))], [0.006, 0.003], "#9ac0e8", n=3)


def build_sky_gate(m, v):
    m.ring((0, 0, 1.25), 1.05, 0.13, "#f2f0ea", n=14, section=4, vertical=True)
    m.ring((0, 0, 1.25), 0.9, 0.04, "#d8b860", n=14, section=3, vertical=True)
    for k in range(5):
        a = k * TAU / 5 + 0.3
        m.blob((math.cos(a) * 1.05, 0, 1.25 + math.sin(a) * 1.05), (0.07, 0.07, 0.07), "#5a9ae8", n=4)
    for i in range(9):
        x = -1.2 + i * 0.3
        puff(m, (x, 0.15 * math.sin(i * 1.7), 0.1 + 0.08 * (i % 2)), 0.3 - 0.04 * (i % 3),
             (CLOUD, CLOUD_SHADE, CLOUD_BLUE)[i % 3], n=5, flat=0.6)
    for s in (-1, 1):
        p = Vector((s * 0.55, 0, 2.15))
        m.tube([p - Vector((0, 0, 0.05)), p + Vector((0, 0, 0.45))], 0.012, SILVER, n=3)
        sheet(m, p + Vector((0, 0, 0.42)), (s * 0.3, 0, -0.04), (0, 0, -0.12), ("#5a9ae8", "#f0d850")[s > 0],
              cols=3, rows=1, wave=0.03)
    clamp_ground(m)


def build_wind_harp(m, v):
    m.lathe((0, 0, 0), [(0, 0.55), (0.12, 0.5), (0.2, 0.42)], "#f2f0ea", n=8, colors=["#d8d6d0", "#f2f0ea"])
    base, top = Vector((-0.45, 0, 0.2)), Vector((-0.45, 0, 2.4))
    m.tube([base, top], [0.07, 0.05], "#d8b860", n=6)
    arc = [Vector((-0.45 + 0.9 * t, 0, 2.4 - 0.4 * t + 0.3 * math.sin(t * math.pi))) for t in (0, 0.25, 0.5, 0.75, 1)]
    m.tube(arc, [0.06, 0.07, 0.06, 0.05, 0.045], "#d8b860", n=5)
    m.tube([arc[-1], Vector((0.5, 0, 0.2))], [0.05, 0.06], "#f2f0ea", n=5)
    for k in range(7):
        t = (k + 1) / 8
        x = -0.45 + 0.95 * t
        ztop = 2.4 - 0.4 * t + 0.3 * math.sin(t * math.pi) - 0.05
        m.tube([(x, 0, 0.22), (x, 0, ztop)], 0.007, ("#e8e4d8", "#c8d0dc")[k % 2], n=3)
    m.blob(top + Vector((0, 0, 0.08)), (0.1, 0.1, 0.1), "#5a9ae8", n=5)
    for i in range(6):
        puff(m, polar(0.55, i * TAU / 6, 0.12), 0.24, (CLOUD, CLOUD_SHADE)[i % 2], n=5, flat=0.6)
    clamp_ground(m)


# ============================== saltflats ====================================
def build_salt_crust(m, v):
    for i in range(6 + v):
        c = polar(0.22 * ((i * 0.618) % 1) + 0.07 * (i > 0), i * 2.4 + v)
        hexagon(m, c, 0.075 + 0.015 * m.rng.random(), 0.0, 0.015 + 0.01 * (i % 2), SALT_SHADE, top=SALT,
                phase=m.rng.random())


def build_salt_crystals(m, v):
    for i in range(6 + 2 * v):
        s = 0.03 + 0.03 * m.rng.random()
        st = len(m.vertices)
        m.box((0, 0, 0), (s, s, s), ("#ffffff", "#f8e0e4", SALT_SHADE, "#f0c8d0")[i % 4])
        xform(m, st, rot=(m.rng.random(), m.rng.random(), m.rng.random()),
              offset=polar(0.22 * ((i * 0.618) % 1) + 0.03, i * 2.4 + v, s * 0.4))
    clamp_ground(m)


def build_salt_pillar(m, v):
    h = 0.9 + 0.3 * v
    prof = [(0, 0.32), (h * 0.15, 0.24), (h * 0.3, 0.27), (h * 0.5, 0.18), (h * 0.65, 0.23), (h * 0.85, 0.2),
            (h, 0.12)]
    s = len(m.vertices)
    m.lathe((0, 0, 0), prof, SALT, n=7, jitter=0.2,
            colors=[SALT_SHADE, SALT, "#e8e0d4", SALT, "#f0e8e0", SALT_SHADE])
    wobble(m, s, 0.02, freq=6, phase=v)
    m.lathe((0, 0, h), [(0, 0.16), (0.04, 0.12), (0.07, 0)], "#ffffff", n=6, jitter=0.2)


def build_pink_halite(m, v):
    for i in range(5 + v):
        s = 0.16 - 0.02 * i if i < 3 else 0.08
        st = len(m.vertices)
        m.box((0, 0, 0), (s, s, s), ("#f4b8c8", "#f8d0dc", "#e8a0b4", "#ffffff", "#f8d0dc", "#f4b8c8")[i])
        xform(m, st, rot=(0.3 * i + 0.2, 0.5 * i, i * 1.1),
              offset=polar(0.14 * (i > 0) + 0.04 * (i > 2), i * 2.2 + v, s * 0.45 + 0.06 * (i == 0)))
    clamp_ground(m)


def flamingo(m, wading=False, pose=0):
    body = Vector((0, 0, 0.62))
    m.blob(body, (0.17, 0.09, 0.09), FLAMINGO[0], n=6)
    m.blob(body + Vector((-0.15, 0, 0.03)), (0.08, 0.06, 0.05), FLAMINGO[2], n=4)
    neck = [body + Vector((0.12, 0, 0.04)), body + Vector((0.2, 0, 0.18)), body + Vector((0.12, 0, 0.3)),
            body + Vector((0.16, 0, 0.42 - 0.25 * pose))]
    m.tube(neck, [0.035, 0.025, 0.022, 0.02], FLAMINGO[1], n=4)
    head = neck[-1] + Vector((0.02, 0, 0.02))
    m.blob(head, (0.045, 0.035, 0.035), FLAMINGO[1], n=4)
    m.tube([head + Vector((0.03, 0, 0)), head + Vector((0.08, 0, -0.03)), head + Vector((0.09, 0, -0.07))],
           [0.016, 0.012, 0.004], "#2a2420", n=3)
    m.box(head + Vector((0.035, 0, -0.0)), (0.03, 0.03, 0.025), "#f4e8d8")
    foot = -0.15 if wading else 0.0
    m.tube([body + Vector((0.0, 0.02, -0.06)), Vector((0.01, 0.02, 0.3)), Vector((0.0, 0.02, foot))],
           [0.012, 0.011, 0.008], FLAMINGO[2], n=3)
    m.box((0.03, 0.02, foot + 0.005), (0.08, 0.04, 0.01), FLAMINGO[2])
    m.tube([body + Vector((-0.02, -0.03, -0.06)), Vector((0.03, -0.03, 0.34)), Vector((-0.1, -0.03, 0.42))],
           [0.011, 0.01, 0.007], FLAMINGO[2], n=3)


def build_flamingo(m, v):
    flamingo(m, pose=v)


def build_salt_bricks(m, v):
    for layer in range(3 + v):
        for k in range(2):
            m.box((-0.12 + 0.24 * k + 0.02 * (layer % 2), 0, 0.06 + 0.12 * layer), (0.22, 0.32, 0.11),
                  (SALT, SALT_SHADE, "#e8e0d4")[(layer + k) % 3], tilt=0.04 * (layer - 1))
            m.box((-0.12 + 0.24 * k + 0.02 * (layer % 2), -0.161, 0.06 + 0.12 * layer), (0.2, 0.004, 0.025),
                  "#b8b0a4")
    m.tube([(0.3, 0.1, 0.0), (0.24, 0.05, 0.7)], 0.015, WOOD, n=4)
    s = len(m.vertices)
    prism(m, [(-0.07, 0), (0.07, 0), (0.06, -0.16), (-0.06, -0.16)], -0.008, 0.008, IRON)
    xform(m, s, rot=(math.pi / 2 - 0.1, 0, 0.3), offset=(0.31, 0.11, 0.17))


def build_bleached_shrub(m, v):
    m.lathe((0, 0, 0), [(0, 0.2), (0.03, 0.15), (0.05, 0)], SALT_SHADE, n=6, jitter=0.2)
    for i in range(5 + v):
        a = i * 2.4 + v
        mid = Vector(polar(0.15, a, 0.25 + 0.05 * (i % 2)))
        tip = mid + Vector(polar(0.15, a + 0.4, 0.2))
        m.tube([(0, 0, 0.02), mid, tip], [0.025, 0.014, 0.004], ("#e8e4dc", "#d8d0c4")[i % 2], n=4)
        if i % 2 == 0:
            m.tube([mid, mid + Vector(polar(0.12, a - 0.6, 0.12))], [0.01, 0.003], "#e8e4dc", n=3)


def build_salt_cones(m, v):
    for i in range(2 + v):
        r = 0.2 - 0.03 * i
        m.lathe(polar(0.2 * (i > 0), i * 2.5 + v), [(0, r), (r * 0.6, r * 0.65), (r * 1.4, 0.0)], SALT, n=7,
                jitter=0.06, colors=[SALT_SHADE, SALT, "#ffffff"])


def build_brine_crystals(m, v):
    for i in range(3 + v):
        c = polar(0.22 * (i > 0), i * 2.4 + v)
        hexagon(m, c, 0.12 - 0.015 * i, -0.02, 0.012, SALT_SHADE, top=SALT, phase=i)
        st = len(m.vertices)
        m.box((0, 0, 0), (0.05, 0.05, 0.05), ("#ffffff", "#f8d0dc")[i % 2])
        xform(m, st, rot=(0.6, 0.4, i), offset=(c[0], c[1], 0.03))


def build_wading_flamingo(m, v):
    flamingo(m, wading=True, pose=v)
    for k in range(2):
        m.ring((0.02 - 0.1 * k, 0.02 - 0.05 * k, 0.0), 0.09 + 0.08 * k, 0.006, "#d8e8f0", n=10, section=3)


def build_salt_crust_lip(m, v):
    w = 0.45
    front = [(x, 0.08 + 0.03 * math.sin(x * 7 + v)) for x in [w - 2 * w * i / 6 for i in range(7)]]
    prism(m, [(-w, -0.22), (w, -0.22)] + front, 0.0, 0.05 + 0.02 * v, SALT_SHADE, top=SALT)
    for i in range(5 + v):
        x = -0.38 + 0.76 * i / (4 + v) + m.rng.uniform(-0.03, 0.03)
        length = 0.12 + m.rng.random() * 0.3
        m.lathe((x, 0.07, -0.0), [(0, 0.035), (-length * 0.4, 0.025), (-length, 0)], (SALT, "#f0e8e0")[i % 2],
                n=5, jitter=0.15)
    clamp_lip(m)


def build_salt_harvest(m, v):
    for i in range(4):
        r = 0.32 + 0.04 * (i % 2)
        m.lathe((-1.0 + i * 0.62, 0.15, 0), [(0, r), (r * 0.6, r * 0.62), (r * 1.4, 0)], SALT, n=8, jitter=0.06,
                colors=[SALT_SHADE, SALT, "#ffffff"])
    # a rake leaning on a cone and a small cart with baskets
    m.tube([(-0.6, -0.35, 0.0), (-0.3, -0.05, 0.55)], 0.015, WOOD, n=4)
    m.box((-0.62, -0.37, 0.02), (0.3, 0.04, 0.04), WOOD, tilt=0.8)
    cx = 0.95
    m.box((cx, -0.45, 0.32), (0.5, 0.36, 0.06), WOOD)
    for s in (-1, 1):
        m.box((cx, -0.45 + s * 0.17, 0.42), (0.5, 0.03, 0.16), "#8a6a44")
        m.ring((cx, -0.45 + s * 0.22, 0.17), 0.15, 0.025, BARK, n=8, vertical=True, yaw=0)
    m.tube([(cx - 0.25, -0.45, 0.32), (cx - 0.7, -0.45, 0.42)], 0.015, WOOD, n=4)
    m.lathe((cx, -0.45, 0.35), [(0, 0.17), (0.12, 0.14)], SALT, n=6)
    for k in range(2):
        m.lathe((0.6 + 0.3 * k, 0.55, 0), [(0, 0.1), (0.16, 0.13), (0.18, 0.12)], "#a08050", n=6,
                colors=["#8a6a40", "#b8985a"])
        m.lathe((0.6 + 0.3 * k, 0.55, 0.16), [(0, 0.11), (0.05, 0.06)], SALT, n=6)


def build_salt_arch(m, v):
    pts = [Vector((-1.15, 0, 0)), Vector((-1.15, 0, 0.8)), Vector((-0.9, 0, 1.55)), Vector((-0.3, 0, 1.95)),
           Vector((0.3, 0, 1.95)), Vector((0.9, 0, 1.55)), Vector((1.15, 0, 0.8)), Vector((1.15, 0, 0))]
    radii = [0.45, 0.36, 0.3, 0.28, 0.3, 0.32, 0.38, 0.48]
    cols = [SALT_SHADE, SALT, "#e8e0d4", SALT, "#f0e8e0", SALT, SALT_SHADE]
    s = len(m.vertices)
    for k in range(len(pts) - 1):
        m.tube([pts[k], pts[k + 1]], [radii[k], radii[k + 1]], cols[k], n=7)
    wobble(m, s, 0.04, freq=3)
    clamp_ground(m, s)
    for i in range(5):
        m.lathe(polar(1.4, (0.2 + i * 0.3) * (1 if i % 2 else -1) + (math.pi if i > 2 else 0)),
                [(0, 0.12), (0.12, 0.1), (0.2, 0)], SALT, n=5, jitter=0.2)


# ================================ lagoon =====================================
def build_shell_scatter(m, v):
    for i in range(3 + v):
        c = polar(0.2 * ((i * 0.618) % 1) + 0.05, i * 2.4 + v)
        a = m.rng.random() * TAU
        pts = [(c[0], c[1])] + [(c[0] + 0.07 * math.cos(a + t), c[1] + 0.07 * math.sin(a + t))
                                for t in (-0.9, -0.45, 0, 0.45, 0.9)]
        prism(m, pts, 0, 0.018, "#e8c8b0", top=("#f4dcc8", "#f0b8a0", "#e8e0d0")[i % 3])
    c = polar(0.15, 2.6 + v)
    star = []
    for k in range(10):
        r = 0.1 if k % 2 == 0 else 0.04
        star.append((c[0] + r * math.cos(k * TAU / 10), c[1] + r * math.sin(k * TAU / 10)))
    prism(m, star, 0, 0.02, "#e8784a", top="#f08a5a")
    m.lathe(polar(0.22, 0.5 + v), [(0, 0.035), (0.03, 0.03), (0.07, 0.0)], "#f0e0d0", n=5, axis=(1, 0, 0.3))


def build_sand_ripples(m, v):
    m.lathe((0, 0, 0), [(0, 0.33), (0.015, 0.3), (0.03, 0.2), (0.035, 0)], SAND_LIGHT, n=8, jitter=0.15)
    for k in range(4 + v):
        y = -0.18 + k * 0.1
        m.box((0.02 * math.sin(k), y, 0.035), (0.42 - 0.12 * abs(k - 2), 0.025, 0.012), SAND_DARK, tilt=0.15)


def build_palm_tree(m, v):
    h = 1.45 + 0.2 * v
    bend = 0.1
    pts = [Vector((bend * (t ** 2) * (1 if v else -1), 0, h * t)) for t in (0, 0.2, 0.4, 0.6, 0.8, 1.0)]
    for k in range(len(pts) - 1):
        m.tube([pts[k], pts[k + 1]], [0.07 - 0.008 * k, 0.065 - 0.008 * k], ("#8a7050", "#a08060")[k % 2], n=4)
    top = pts[-1]
    for i in range(7):
        a = i * TAU / 7 + 0.3 * v
        mid = top + Vector(polar(0.18, a, 0.1))
        tip = mid + Vector(polar(0.16, a + 0.1, -0.22))
        m.tube([top, mid, tip], [0.012, 0.01, 0.003], "#5a7a3a", n=3)
        for p, q, ts in ((top, mid, (0.35, 0.8)), (mid, tip, (0.5,))):
            for s in (-1, 1):
                side = Vector(polar(0.07, a + s * math.pi / 2, -0.05))
                for t in ts:
                    b = p.lerp(q, t)
                    blade(m, b, b + side + (q - p) * 0.3, 0.025, PALM_LEAF[(i + s + int(t * 2)) % 3])
    for k in range(3):
        m.blob(top + Vector(polar(0.06, k * 2.1, -0.06)), (0.045, 0.045, 0.05), "#6a4a2a", n=4)


def build_beach_grass(m, v):
    m.lathe((0, 0, 0), [(0, 0.22), (0.03, 0.18), (0.05, 0)], SAND_LIGHT, n=6, jitter=0.2)
    for i in range(10 + 2 * v):
        a = i * 2.4 + v
        h = 0.35 + 0.25 * m.rng.random()
        blade(m, polar(0.04, a, 0.02), polar(0.18 + 0.08 * m.rng.random(), a + 0.3, h), 0.02,
              ("#9ab060", "#b8c070", "#7a9a50")[i % 3])


def build_driftwood(m, v):
    pts = [(-0.4, -0.05, 0.05), (-0.1, 0.0, 0.07), (0.2, 0.04, 0.06), (0.42, 0.0, 0.04)]
    m.tube(pts, [0.07, 0.06, 0.05, 0.03], "#c8bca8", n=5)
    m.tube([(-0.05, 0.0, 0.07), (0.05, 0.2, 0.16), (0.12, 0.3, 0.18)], [0.03, 0.02, 0.006], "#d8ccb8", n=4)
    m.tube([(-0.38, -0.05, 0.06), (-0.42, -0.22, 0.12)], [0.035, 0.01], "#b8ac98", n=4)
    if v:
        m.tube([(0.2, 0.04, 0.06), (0.32, -0.2, 0.16)], [0.025, 0.006], "#c8bca8", n=4)
        m.lathe((0.0, -0.18, 0), [(0, 0.04), (0.03, 0.035), (0.08, 0.0)], "#f0e0d0", n=5, axis=(1, 0.2, 0.2))
    clamp_ground(m)


def build_tiki_torch(m, v):
    h = 1.2 + 0.15 * v
    m.tube([(0, 0, 0), (0, 0, h)], 0.025, BAMBOO[0], n=4)
    for k in range(3):
        m.ring((0, 0, 0.3 + 0.35 * k), 0.028, 0.006, "#c8c088", n=6)
    m.lathe((0, 0, h - 0.02), [(0, 0.05), (0.08, 0.08), (0.14, 0.07)], "#a08050", n=6,
            colors=["#8a6a40", "#b8985a"])
    flame(m, (0, 0, h + 0.1), 0.2, "#ffa040", r=0.06)
    for i in range(3):
        m.blob(polar(0.14, i * 2.1 + v, 0.03), (0.06, 0.05, 0.04), SAND_DARK, n=4)


def build_rowboat(m, v):
    s = len(m.vertices)
    hull(m, 0.86, 0.38, 0.17, "#3a6a8a" if v == 0 else "#a0603a", "#8a6a44", stations=5, stern=0.6)
    for x in (-0.18, 0.12):
        m.box((x, 0, -0.04), (0.06, 0.32 - 0.1 * (x > 0), 0.025), "#8a6a44")
    xform(m, s, rot=(0.12 * (1 if v else -1), 0, 0), offset=(0, 0, 0.17))
    clamp_ground(m, s)
    for k in range(2):
        m.tube([(-0.3, -0.08 + 0.16 * k, 0.2), (0.3, -0.1 + 0.2 * k, 0.24)], 0.012, WOOD, n=3)
        m.box((0.32, -0.1 + 0.2 * k, 0.24), (0.1, 0.05, 0.012), WOOD)


def build_buried_chest(m, v):
    m.lathe((0, 0, 0), [(0, 0.36), (0.05, 0.3), (0.1, 0.15)], SAND_LIGHT, n=8, jitter=0.12)
    s = len(m.vertices)
    m.box((0, 0, 0.0), (0.36, 0.24, 0.2), "#8a5a32")
    m.lathe((0, 0, 0.1), [(-0.18, 0.12), (0.18, 0.12)], "#9a6a3a", n=6, axis=(1, 0, 0), phase=0)
    for x in (-0.12, 0.12):
        m.box((x, 0, 0.08), (0.03, 0.25, 0.25), IRON)
    m.box((0, -0.125, 0.08), (0.05, 0.02, 0.06), "#d8b040")
    xform(m, s, rot=(0.15, 0.2 * (1 - 2 * v), 0.5), offset=(0, 0, 0.06))
    clamp_ground(m, s)
    for k in range(3 + 2 * v):
        m.lathe(polar(0.25, k * 0.6 - 1.4, 0.0), [(0, 0.03), (0.01, 0.03)], "#e8c040", n=6)


def build_crab(m, v):
    s = len(m.vertices)
    m.blob((0, 0, 0.07), (0.1, 0.075, 0.04), ("#d84a3a", "#e8784a")[v], n=6)
    for side in (-1, 1):
        for k in range(3):
            x = -0.04 + 0.04 * k
            m.tube([(x, side * 0.06, 0.07), (x - 0.02, side * 0.13, 0.08), (x - 0.03, side * 0.16, 0.0)],
                   [0.008, 0.007, 0.004], "#c83a2a", n=3)
        m.tube([(0.08, side * 0.04, 0.07), (0.13, side * 0.07, 0.08)], 0.01, "#c83a2a", n=3)
        m.blob((0.16, side * 0.08, 0.08), (0.04, 0.025, 0.03), ("#d84a3a", "#e8784a")[v], n=4)
        m.tube([(0.07, side * 0.025, 0.09), (0.08, side * 0.03, 0.13)], 0.005, "#c83a2a", n=3)
        m.box((0.08, side * 0.03, 0.135), (0.02, 0.02, 0.02), "#1a1614")
    xform(m, s, rot=(0, 0, v * 1.2))


def build_coral_head(m, v):
    m.blob((0, 0, -0.04), (0.28, 0.24, 0.1), "#c8b090", n=6)
    for i in range(4 + v):
        a = i * 2.4 + v
        base = Vector(polar(0.14 * (i > 0), a, 0.0))
        col = CORAL[(i + v) % 4]
        tip = base + Vector(polar(0.06, a, 0.2 + 0.06 * (i % 2)))
        m.tube([base, tip], [0.025, 0.012], col, n=4)
        for k in range(2):
            mid = base.lerp(tip, 0.5)
            m.tube([mid, mid + Vector(polar(0.08, a + 1.2 * (k * 2 - 1), 0.08))], [0.012, 0.006], col, n=3)
    m.blob(polar(0.2, 4.0 + v, 0.04), (0.1, 0.1, 0.07), "#d8a060", n=5)


def build_seaweed_drape(m, v):
    m.blob((0, -0.08, 0.02), (0.3, 0.1, 0.04), "#4a5a2a", n=6)
    for i in range(6 + v):
        x = -0.32 + 0.64 * i / (5 + v)
        drop = 0.3 + 0.35 * ((i * 0.618) % 1)
        ribbon(m, [(x, -0.06, 0.04), (x + 0.02, 0.05, 0.02), (x - 0.02, 0.07, -drop * 0.5), (x + 0.03, 0.06, -drop)],
               (1, 0, 0), 0.05, ("#5a6a2a", "#6a7a32", "#4a5a24")[i % 3])
    if v:
        m.blob((0.15, 0.1, -0.2), (0.06, 0.06, 0.06), "#e8784a", n=5)
        m.tube([(0.15, 0.04, 0.02), (0.15, 0.09, -0.15)], 0.004, COTTON, n=3)
    clamp_lip(m)


def build_barnacles(m, v):
    for i in range(7 + 2 * v):
        x, z = 0.3 * math.cos(i * 2.4) * ((i * 0.618) % 1), 0.25 * math.sin(i * 2.4) * ((i * 0.618) % 1)
        r = 0.05 + 0.02 * (i % 3)
        m.lathe((x, 0, z), [(0, r), (0.04, r * 0.75), (0.06, r * 0.4)], ("#d8d0c0", "#c8c0b0")[i % 2], n=5,
                axis=(0, 1, 0), colors=["#c8c0b0", "#a8a090"])
    for k in range(3 + v):
        s = len(m.vertices)
        m.blob((0, 0, 0), (0.06, 0.03, 0.03), "#2a3a5a", n=4)
        xform(m, s, rot=(0, k * 0.7, 0), offset=(-0.2 + 0.08 * k, 0.02, -0.15 + 0.03 * k))
    flatten_back(m)


def build_shipwreck(m, v):
    s = len(m.vertices)
    hull(m, 2.6, 1.0, 0.75, "#6a4a32", "#4a3426", stations=6, stern=0.9)
    xform(m, s, rot=(0.3, -0.12, 0), offset=(0, 0, 0.55))
    clamp_ground(m, s)
    # exposed ribs at the broken stern end
    for k in range(4):
        x = -1.25 + 0.14 * k
        m.tube([(x, -0.45, 0.05), (x, -0.5, 0.45), (x + 0.05, -0.25, 0.75)], [0.035, 0.03, 0.02], "#5a3a26", n=4)
    # broken mast and a torn sail
    m.tube([(0.2, 0.0, 0.5), (0.35, 0.3, 1.9)], [0.06, 0.045], "#8a6a44", n=5)
    m.tube([(0.3, 0.2, 1.6), (0.3, -0.25, 1.55), (0.3, 0.6, 1.62)], 0.025, "#8a6a44", n=4)
    sheet(m, (0.3, -0.3, 1.58), (0.0, 1.0, 0.05), (0.15, 0.15, -0.95), "#e8dcc0", cols=3, rows=3, wave=0.1,
          colors=lambda c, r: "#e8dcc0" if (c + r) % 3 else "#d8c8a8")
    for i, (x, y, r) in enumerate(((-0.9, -0.55, 0.55), (0.6, -0.6, 0.6), (-0.4, 0.6, 0.6), (0.9, 0.5, 0.5))):
        m.lathe((x, y, 0), [(0, r), (0.08, r * 0.75), (0.16, r * 0.35), (0.2, 0)], SAND_LIGHT, n=7, jitter=0.15,
                colors=[SAND_DARK, SAND_LIGHT, "#f0e0b8"])
    m.box((-0.6, 0.65, 0.12), (0.3, 0.24, 0.24), "#8a5a32", tilt=0.5)


def build_stilt_hut(m, v):
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.tube([(sx * 0.6, sy * 0.55, 0), (sx * 0.6, sy * 0.55, 0.85)], 0.05, "#8a7050", n=5)
    m.box((0, 0, 0.88), (1.5, 1.4, 0.07), "#a08060")
    m.box((0, 0, 1.25), (1.1, 1.0, 0.7), "#c8a870")
    for k in range(5):
        m.box((-0.44 + 0.22 * k, -0.505, 1.25), (0.02, 0.02, 0.7), "#a08050")
    m.box((0, -0.51, 1.12), (0.3, 0.02, 0.48), "#3a2a1a")
    m.lathe((0, 0, 1.6), [(0, 1.0), (0.06, 0.95), (0.85, 0.05)], STRAW, n=4, jitter=0.02, phase=math.pi / 4,
            colors=["#b89850", STRAW])
    for k in range(5):
        y = -0.75 - 0.1 * k
        m.box((0, y, 0.85 - 0.17 * k), (0.35, 0.1, 0.03), "#8a7050")
    for s in (-1, 1):
        m.tube([(s * 0.18, -0.72, 0.9), (s * 0.18, -1.2, 0.0)], 0.02, "#8a7050", n=4)
    sheet(m, (0.76, -0.4, 1.4), (0, 0.8, 0), (0.02, 0, -0.6), "#8a8a6a", cols=4, rows=3, wave=0.03,
          colors=lambda c, r: ("#8a8a6a", "#a8a880")[(c + r) % 2])
    m.blob((0.78, 0.0, 0.85), (0.05, 0.05, 0.05), "#e8784a", n=4)
