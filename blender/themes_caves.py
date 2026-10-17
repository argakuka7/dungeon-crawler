"""Theme builders: cave themes (see themes.py).

    hive     Honey hive: wax cells, honey as a slow fluid, candles, sleepy bees
    cenote   Sunlit cenote: a jungle under a hole in the sky, jade, vines, a step shrine
    grotto   Sunken grotto: flooded, bioluminescent, kelp, clams and jellies
    forge    Dwarven forge: gears, pipes, steam vents, crucibles, a great furnace
    ossuary  Ossuary catacombs: bones in neat rows, candles, quiet and a little sad

Every builder is build_<prop>(m, variant) on a props.Mesh in attachment space.
"""
import math
from pathlib import Path
import sys

from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from props import WOOD, BARK, STONE, STONE_DARK  # noqa: E402,F401
from themes_geo import *  # noqa: E402,F401,F403

COMB = ("#e8b040", "#d89a30", "#f0c858")
BEE = ("#f0c030", "#2a2420")
WING = "#d8e8f0"
JUNGLE = ("#2e7a3a", "#3a8a44", "#4a9a4a", "#256a32")
TEMPLE = ("#9a9a84", "#8a8a74", "#aaa892", "#7a7a66")
GLOW_CYAN = "#7fe8ff"
GLOW_PINK = "#ff7ad0"
KELP = ("#4a6a2a", "#5a7a32", "#3a5a24")
REEF = ("#e86a8a", "#f0a050", "#a070d8", "#50c0b0")
SOOT = "#2a2624"
STEEL_DARK = "#5a5e66"
HOT = "#ff8030"
BONE_SHADE = "#c8bea0"
CANDLE = "#f0e8d0"
CRYPT = ("#8a8478", "#7a746a", "#9a948a")


# ================================= hive ======================================
def comb_cells(m, centre, r, rows, cols, z0, z1, wall, fill=None, glow=False, skip=()):
    """A patch of hexagonal cells: raised wax walls; filled cells get a honey top."""
    w = r * math.sqrt(3)
    for j in range(rows):
        for i in range(cols):
            if (i, j) in skip:
                continue
            x = centre[0] + (i - (cols - 1) / 2) * w + (j % 2) * w / 2
            y = centre[1] + (j - (rows - 1) / 2) * r * 1.5
            start = len(m.faces)
            top = fill if fill and (i * 7 + j * 3) % 4 else wall
            hexagon(m, (x, y), r * 0.96, z0, z1 - (0.0 if top == wall else 0.02), wall, top=top, phase=math.pi / 6)
            if glow and top != wall:
                for k in range(4):
                    m.glows[start + 1 + 2 * k] = True


def build_wax_flakes(m, v):
    for i in range(6 + 2 * v):
        c = polar(0.25 * ((i * 0.618) % 1) + 0.03, i * 2.4 + v)
        hexagon(m, c, 0.035 + 0.02 * m.rng.random(), 0, 0.012, WAX, top=("#f8e8a8", WAX, "#e8c870")[i % 3],
                phase=m.rng.random())


def build_pollen_dust(m, v):
    for i in range(10 + 3 * v):
        c = polar(0.26 * ((i * 0.618) % 1) + 0.02, i * 2.4 + v, 0.015)
        m.box(c, (0.025, 0.025, 0.025), ("#f0c030", "#f8d850", "#e8a820")[i % 3], tilt=i)
    m.lathe((0, 0, 0), [(0, 0.12), (0.01, 0.1), (0.015, 0)], "#e8b830", n=6, jitter=0.25)


def build_comb_mound(m, v):
    m.lathe((0, 0, 0), [(0, 0.42), (0.15, 0.38), (0.3, 0.26), (0.38, 0.1)], HONEY_DARK, n=6, jitter=0.1)
    comb_cells(m, (0, 0), 0.09, 4, 4, 0.0, 0.48 + 0.08 * v, COMB[0], fill=HONEY, glow=True,
               skip=((0, 0), (3, 0), (0, 3), (3, 3)))
    for k in range(2):
        m.lathe(polar(0.12, k * 2.6 + v, 0.48 + 0.08 * v), [(0, 0.03), (0.04, 0.025), (0.08, 0.0)], HONEY, n=5)


def build_wax_candles(m, v):
    m.lathe((0, 0, 0), [(0, 0.26), (0.02, 0.24), (0.04, 0.18)], WAX, n=7, jitter=0.15)
    for i in range(3 + v):
        h = 0.2 + 0.12 * ((i * 0.618) % 1) + 0.1 * (i == 0)
        x, y, _ = polar(0.12 * (i > 0), i * 2.4 + v)
        m.lathe((x, y, 0.02), [(0, 0.04), (h * 0.9, 0.035), (h, 0.03)], ("#f0d890", "#e8c870", "#f8e8b0")[i % 3],
                n=6, jitter=0.05)
        m.lathe((x + 0.03, y, h * 0.6), [(0, 0.012), (0.04, 0.006)], WAX, n=4)
        flame(m, (x, y, h + 0.03), 0.07, "#ffd080", r=0.018)


def build_larva_cells(m, v):
    comb_cells(m, (0, 0), 0.1, 3, 3, 0.0, 0.14, COMB[0], fill=None)
    for k, (i, j) in enumerate(((0, 0), (1, 1), (2, 0), (1, 2), (0, 2))[:3 + v]):
        x = (i - 1) * 0.1 * math.sqrt(3) + (j % 2) * 0.05 * math.sqrt(3)
        y = (j - 1) * 0.15
        m.blob((x, y, 0.16), (0.06, 0.05, 0.045), "#f8f4e8", n=4)


def build_honey_pot(m, v):
    m.lathe((0, 0, 0), [(0, 0.14), (0.08, 0.2), (0.2, 0.22), (0.3, 0.16), (0.34, 0.12), (0.38, 0.14)], CLAY, n=8,
            jitter=0.03, colors=["#9a6a3a", CLAY, CLAY, "#c88a5a", "#9a6a3a"])
    m.lathe((0, 0, 0.37), [(0, 0.11), (0.01, 0.1)], HONEY, n=8)
    for k in range(3 + v):
        a = k * 2.1 + 0.4
        m.tube([polar(0.13, a, 0.38), polar(0.15, a, 0.3), polar(0.2, a, 0.24 - 0.04 * k)], [0.02, 0.018, 0.01],
               HONEY, n=4)
    m.tube([(0.02, 0, 0.3), (0.08, 0.02, 0.62)], 0.012, WOOD, n=4)
    m.lathe((0.08, 0.02, 0.62), [(0, 0.03), (0.04, 0.035), (0.08, 0.02)], WOOD, n=5)
    if v:
        m.blob((0.26, -0.12, 0.02), (0.1, 0.08, 0.02), HONEY, n=5)


def build_giant_flower(m, v):
    h = 0.75 + 0.15 * v
    m.tube([(0, 0, 0), (0.03, 0, h * 0.6), (0.0, 0.02, h)], [0.03, 0.025, 0.02], "#4a8a3a", n=4)
    for s in (-1, 1):
        blade(m, (0.01, 0, h * 0.3), (s * 0.28, 0.05, h * 0.45), 0.07, "#4a9a3a")
    petals = ("#f0d040", "#f8f0e8")[v]
    top = Vector((0.0, 0.02, h))
    for k in range(8):
        a = k * TAU / 8
        blade(m, top, top + Vector(polar(0.24, a, -0.05 + 0.04 * (k % 2))), 0.07, petals, ref=(0, 0, 1))
    m.lathe(top - Vector((0, 0, 0.03)), [(0, 0.1), (0.05, 0.11), (0.08, 0.06)], ("#7a4a1a", "#f0c030")[v], n=7)


def build_bee_husk(m, v):
    s = len(m.vertices)
    m.lathe((0, 0, 0), [(-0.16, 0.02), (-0.12, 0.08), (-0.04, 0.1), (0.04, 0.1), (0.12, 0.07), (0.16, 0.02)],
            BEE[0], n=6, axis=(1, 0, 0), colors=[BEE[1], BEE[0], BEE[1], BEE[0], BEE[1]])
    m.blob((0.2, 0, 0), (0.06, 0.06, 0.055), BEE[1], n=5)
    for side in (-1, 1):
        flat_leaf(m, (0.0, side * 0.05, 0.08), 0.2, 0.07, side * 1.9, 0.0, WING)
        for k in range(3):
            m.tube([(0.04 - 0.05 * k, side * 0.06, -0.04), (0.02 - 0.05 * k, side * 0.14, 0.04)], 0.008, BEE[1], n=3)
        m.tube([(0.24, side * 0.02, 0.03), (0.3, side * 0.06, 0.1)], 0.005, BEE[1], n=3)
    xform(m, s, rot=(0.0, 0, v * 1.4), offset=(0, 0, 0.1))
    if v:
        xform(m, s, rot=(math.pi * 0.85, 0, 0), pivot=(0, 0, 0.1))
    clamp_ground(m)


def build_honey_bubbles(m, v):
    for i in range(4 + 2 * v):
        r = 0.06 + 0.04 * ((i * 0.618) % 1)
        m.lathe(polar(0.25 * ((i * 0.618) % 1) + 0.03, i * 2.4 + v, -0.01), [(0, r), (r * 0.4, r * 0.85), (r * 0.7, 0)],
                ("#f0b830", "#e8a020")[i % 2], n=6, jitter=0.05)


def build_comb_raft(m, v):
    comb_cells(m, (0, 0), 0.08, 3, 3 + v, -0.05, 0.05, COMB[2], fill=HONEY_DARK)


def build_wall_comb(m, v):
    s, f = len(m.vertices), len(m.faces)
    comb_cells(m, (0, 0), 0.085, 4, 4, 0.0, 0.08 + 0.03 * v, COMB[0], fill=HONEY, glow=True,
               skip=((0, 0), (3, 3)) if v else ((3, 0), (0, 3)))
    xform(m, s, rot=(-math.pi / 2, 0, 0))
    flatten_back(m)


def build_honey_drips(m, v):
    m.blob((0, 0, 0), (0.24, 0.2, 0.04), HONEY_DARK, n=6)
    for i in range(4 + v):
        x, y, _ = polar(0.16 * ((i * 0.618) % 1) + 0.04, i * 2.4 + v)
        length = 0.2 + 0.35 * ((i * 0.37) % 1)
        m.lathe((x, y, -length), [(0, 0.0), (0.03, 0.035), (0.08, 0.02), (length, 0.03)], HONEY, n=5, jitter=0.05)


def build_honey_overflow(m, v):
    w = 0.42
    front = [(x, 0.05 + 0.03 * math.sin(x * 8 + v)) for x in [w - 2 * w * i / 6 for i in range(7)]]
    prism(m, [(-w, -0.2), (w, -0.2)] + front, 0.0, 0.03, HONEY_DARK, top=HONEY)
    for i in range(4 + v):
        x = -0.32 + 0.64 * i / (3 + v)
        drop = 0.25 + 0.3 * ((i * 0.618 + v * 0.2) % 1)
        m.tube([(x, 0.04, 0.0), (x, 0.06, -drop * 0.6), (x + 0.01, 0.06, -drop)], [0.03, 0.022, 0.012], HONEY, n=4)
        m.blob((x + 0.01, 0.06, -drop - 0.02), (0.035, 0.035, 0.045), HONEY, n=4)
    clamp_lip(m)


def build_comb_tower(m, v):
    for layer in range(3):
        s = len(m.vertices)
        comb_cells(m, (0, 0), 0.22 - 0.03 * layer, 4 - layer, 4 - layer, 0, 0.9, COMB[layer % 3], fill=HONEY,
                   glow=True, skip=((0, 0), (3 - layer, 0)) if layer < 2 else ())
        xform(m, s, offset=(0.05 * layer, 0, layer * 0.9))
    for k in range(5):
        m.lathe(polar(0.5, k * 1.4, 2.7 - 0.5 * k), [(0, 0.05), (0.05, 0.04), (0.1, 0)], HONEY, n=5)
    for i in range(6):
        m.blob(polar(0.95, i * TAU / 6 + 0.3, 0.06), (0.22, 0.18, 0.08), ("#c88a30", HONEY_DARK)[i % 2], n=5)


def build_royal_cell(m, v):
    s = len(m.vertices)
    m.lathe((0, 0, 0), [(0, 0.55), (0.3, 0.62), (0.8, 0.58), (1.3, 0.48), (1.8, 0.36), (2.1, 0.22), (2.25, 0)],
            WAX, n=8, jitter=0.06, colors=["#c89a40", "#d8aa50", WAX, "#e8c870", WAX, "#f0d890"])
    wobble(m, s, 0.03, freq=4)
    for k in range(18):
        a, z = k * 2.4, 0.3 + 0.1 * k
        r = 0.6 - 0.012 * k ** 1.3
        m.lathe(polar(r, a, z), [(0, 0.06), (0.03, 0.05)], "#d8aa50", n=6, axis=(math.cos(a), math.sin(a), 0))
    # a glowing opening of royal jelly
    start = len(m.faces)
    m.blob(polar(0.42, -math.pi / 2, 1.3), (0.18, 0.12, 0.22), "#fff0b0", n=6)
    lit(m, start)
    comb_cells(m, (0, 0), 0.14, 6, 6, 0, 0.12, COMB[0], fill=HONEY, skip=((0, 0), (5, 0), (0, 5), (5, 5)))


# ================================ cenote =====================================
def build_jungle_litter(m, v):
    for i in range(8 + v):
        c = polar(0.25 * ((i * 0.618) % 1) + 0.03, i * 2.4 + v)
        flat_leaf(m, c, 0.13 + 0.03 * m.rng.random(), 0.045, m.rng.random() * TAU, 0.006 * (i % 3),
                  ("#4a7a2a", "#7a6a2a", "#3a6a2a", "#8a5a2a")[i % 4])


def build_jade_shards(m, v):
    for i in range(4 + v):
        st = len(m.vertices)
        m.shard((0, 0, 0), 0.04, 0.1 + 0.04 * (i % 2), (JADE, JADE_LIGHT, "#2a7a5a")[i % 3], n=5)
        xform(m, st, rot=(0.9 + 0.3 * i, 0.2, i * 1.7), offset=polar(0.2 * ((i * 0.618) % 1) + 0.04, i * 2.4 + v,
                                                                   0.03))
    pebble(m, polar(0.15, 4.0 + v), 0.06, TEMPLE[1])
    clamp_ground(m)


def build_monstera(m, v):
    for i in range(5 + v):
        a = i * TAU / (5 + v) + 0.4 * v
        base = Vector((0, 0, 0.02))
        mid = Vector(polar(0.16, a, 0.32 + 0.1 * (i % 2)))
        m.tube([base, mid], [0.014, 0.01], "#3a7a2a", n=3)
        tip = mid + Vector(polar(0.24, a, -0.06))
        side = Vector(polar(0.1, a + math.pi / 2, 0))
        # a split leaf: three lobes per side
        for t in (0.2, 0.5, 0.8):
            p = mid.lerp(tip, t)
            for s in (-1, 1):
                blade(m, p, p + side * s * (1.1 - 0.5 * t) + (tip - mid) * 0.15, 0.04, JUNGLE[(i + int(t * 3)) % 4])
        blade(m, mid, tip, 0.025, JUNGLE[i % 4])


def build_orchid_rock(m, v):
    m.lathe((0, 0, 0), [(0, 0.32), (0.12, 0.3), (0.26, 0.2), (0.32, 0.05)], TEMPLE[0], n=7, jitter=0.2,
            colors=[TEMPLE[3], TEMPLE[0], "#6a8a4a"])
    for i in range(3):
        blade(m, (0, 0, 0.3), polar(0.18, i * 2.1 + v, 0.33), 0.04, "#3a7a2a")
    for k in range(2 + v):
        base = Vector(polar(0.05, k * 2.4, 0.3))
        top = base + Vector(polar(0.12, k * 2.4 + 0.5, 0.25))
        m.tube([base, top], 0.006, "#5a7a3a", n=3)
        for j in range(3):
            p = base.lerp(top, 0.5 + 0.25 * j)
            for q in range(3):
                blade(m, p, p + Vector(polar(0.045, q * TAU / 3 + j, -0.01)), 0.022, ("#e870b0", "#f8f0f8")[(k + v) % 2])


def build_jade_idol(m, v):
    m.box((0, 0, 0.08), (0.5, 0.42, 0.16), TEMPLE[1])
    body = JADE if v == 0 else TEMPLE[2]
    m.box((0, 0, 0.4), (0.38, 0.3, 0.48), body)
    m.box((0, 0, 0.8), (0.46, 0.36, 0.32), body)
    for s in (-1, 1):
        m.box((s * 0.11, -0.185, 0.84), (0.1, 0.02, 0.08), "#1a2a22")
        m.box((s * 0.25, -0.02, 0.42), (0.08, 0.22, 0.3), JADE_LIGHT if v == 0 else TEMPLE[0])
        m.box((s * 0.28, 0, 0.95), (0.06, 0.2, 0.18), GOLD)
    m.box((0, -0.19, 0.7), (0.24, 0.03, 0.05), "#1a2a22")
    m.box((0, 0, 1.0), (0.5, 0.4, 0.08), GOLD)
    for k in range(5):
        m.box((-0.2 + 0.1 * k, 0, 1.08 + 0.04 * (k % 2)), (0.06, 0.3, 0.1), ("#3aa0d0", GOLD, "#3aa070")[k % 3])


def build_serpent_head(m, v):
    s = len(m.vertices)
    m.box((0, 0.02, 0.22), (0.44, 0.6, 0.44), TEMPLE[0])
    m.box((0, -0.27, 0.12), (0.4, 0.2, 0.18), TEMPLE[1])
    m.box((0, -0.24, 0.3), (0.42, 0.2, 0.14), TEMPLE[2])
    for k in range(4):
        m.box((-0.15 + 0.1 * k, -0.37, 0.2), (0.04, 0.03, 0.08), BONE)
    for sx in (-1, 1):
        m.box((sx * 0.15, -0.2, 0.4), (0.1, 0.12, 0.08), TEMPLE[3])
        m.box((sx * 0.15, -0.26, 0.4), (0.06, 0.02, 0.05), JADE if v == 0 else "#c84a3a")
        for k in range(3):
            m.box((sx * 0.25, 0.2 - 0.16 * k, 0.32), (0.06, 0.14, 0.1), TEMPLE[k % 3], tilt=sx * 0.2)
    xform(m, s, rot=(0, 0, 0.25 * (1 - 2 * v)))


def build_copal_bowl(m, v):
    m.lathe((0, 0, 0), [(0, 0.12), (0.12, 0.08), (0.24, 0.2), (0.3, 0.24), (0.32, 0.2)], TEMPLE[0], n=7,
            colors=[TEMPLE[3], TEMPLE[1], TEMPLE[0], TEMPLE[2]])
    m.lathe((0, 0, 0.28), [(0, 0.18), (0.02, 0.15)], SOOT, n=7)
    flame(m, (0, 0, 0.3), 0.22, "#ffb050", r=0.07)
    for k in range(3):
        m.blob(polar(0.05 * k, k * 2.1, 0.6 + 0.16 * k), (0.06 + 0.02 * k, 0.05 + 0.02 * k, 0.05),
               ("#f0ece4", "#e4e0d8", "#d8d4cc")[k], n=5)
    if v:
        for k in range(4):
            m.box(polar(0.22, k * TAU / 4 + 0.3, 0.29), (0.05, 0.05, 0.03), JADE, tilt=k)


def build_macaw_perch(m, v):
    m.tube([(0, 0, 0), (0, 0, 1.05)], 0.025, BARK, n=4)
    m.tube([(-0.25, 0, 1.0), (0.25, 0, 1.0)], 0.018, BARK, n=4)
    cols = (("#d83a2a", "#f0c030", "#3a7ad0"), ("#3a8ad0", "#f0c030", "#2a9a5a"))[v]
    body = Vector((0.08, 0, 1.12))
    m.blob(body, (0.06, 0.05, 0.09), cols[0], n=5)
    m.blob(body + Vector((0.0, 0, 0.11)), (0.045, 0.04, 0.045), cols[0], n=5)
    m.lathe(body + Vector((0.04, 0, 0.1)), [(0, 0.018), (0.04, 0.0)], "#2a2420", n=4, axis=(1, 0, -0.4))
    for s in (-1, 1):
        flat_leaf(m, (0.08, s * 0.05, 1.12), 0.12, 0.03, -math.pi / 2 - s * 0.1, 0.0, cols[2])
        xform(m, len(m.vertices) - 8, rot=(s * 1.3, 0, 0), pivot=(0.08, s * 0.05, 1.12))
    blade(m, body - Vector((0, 0, 0.05)), body + Vector((-0.02, 0, -0.38)), 0.03, cols[0], ref=(0, 1, 0))
    blade(m, body - Vector((0, 0, 0.06)), body + Vector((0.01, 0.01, -0.34)), 0.022, cols[2], ref=(0, 1, 0))
    m.box(body + Vector((0.02, 0, 0.1)), (0.02, 0.06, 0.02), cols[1])
    for k in range(3):
        m.blob(polar(0.18, k * 2.1, 0.04), (0.08, 0.07, 0.05), JUNGLE[k], n=4)


def build_hanging_vines(m, v):
    m.blob((0, 0, 0), (0.22, 0.2, 0.04), "#3a5a2a", n=6)
    for i in range(5 + v):
        x, y, _ = polar(0.16 * ((i * 0.618) % 1) + 0.03, i * 2.4 + v)
        length = 0.6 + 0.6 * ((i * 0.37) % 1)
        pts = [Vector((x, y, -0.02)), Vector((x + 0.04, y, -length * 0.5)), Vector((x, y + 0.03, -length))]
        m.tube(pts, [0.012, 0.009, 0.004], "#4a6a2a", n=3)
        for t in (0.35, 0.7):
            p = pts[0].lerp(pts[2], t)
            blade(m, p, p + Vector(polar(0.09, i + t * 5, -0.05)), 0.03, JUNGLE[(i + int(t * 3)) % 4])


def build_jungle_drape(m, v):
    w = 0.42
    front = [(x, 0.03 + 0.02 * math.sin(x * 9 + v)) for x in [w - 2 * w * i / 6 for i in range(7)]]
    prism(m, [(-w, -0.2), (w, -0.2)] + front, 0.0, 0.05, "#4a3a2a", top="#3a7a2a")
    for i in range(5 + v):
        x = -0.36 + 0.72 * i / (4 + v)
        drop = 0.4 + 0.4 * ((i * 0.618 + 0.3 * v) % 1)
        pts = [Vector((x, 0.03, 0.03)), Vector((x + 0.02, 0.07, -drop * 0.5)), Vector((x - 0.02, 0.08, -drop))]
        m.tube(pts, [0.01, 0.008, 0.003], "#4a6a2a", n=3)
        for t in (0.3, 0.75):
            p = pts[0].lerp(pts[2], t)
            for s in (-1, 1):
                blade(m, p, p + Vector((s * 0.1, 0.03, -0.05)), 0.035, JUNGLE[(i + s) % 4], ref=(0, 1, 0))
    for k in range(2):
        m.blob((-0.2 + 0.4 * k, 0.1, -0.2 - 0.1 * k), (0.035, 0.03, 0.035), ("#e870b0", "#f0c030")[(k + v) % 2], n=4)
    clamp_lip(m)


def build_glyph_panel(m, v):
    m.box((0, 0.03, 0), (0.8, 0.06, 0.6), TEMPLE[1])
    m.box((0, 0.065, 0), (0.72, 0.01, 0.52), TEMPLE[0])
    for r in range(2):
        for c in range(3):
            x, z = -0.24 + 0.24 * c, 0.12 - 0.24 * r
            m.box((x, 0.08, z), (0.18, 0.02, 0.18), TEMPLE[2])
            if (r + c + v) % 2:
                m.box((x - 0.03, 0.095, z + 0.03), (0.05, 0.015, 0.05), TEMPLE[3])
                m.box((x + 0.04, 0.095, z - 0.03), (0.06, 0.015, 0.03), TEMPLE[3])
            else:
                m.ring((x, 0.095, z), 0.05, 0.012, TEMPLE[3], n=6, vertical=True, yaw=math.pi / 2)
    if v:
        m.box((0, 0.1, 0.0), (0.12, 0.02, 0.12), JADE)
    flatten_back(m)


def build_cenote_lilies(m, v):
    for i in range(3 + v):
        lily_pad(m, polar(0.2 * (i > 0) + 0.03 * i, i * 2.3 + v, 0.0), 0.14 - 0.02 * i,
                 ("#2e7a3a", "#3a8a44", "#256a32", "#4a9a4a")[i], notch=m.rng.random() * TAU, rim="#1e5a2a")
    for k in range(2):
        c = Vector(polar(0.12, k * 3 + v, 0.01))
        for j in range(6):
            blade(m, c, c + Vector(polar(0.06, j * TAU / 6, 0.05)), 0.025, ("#f8f0f8", "#f0c8e0")[(j + k) % 2])
        m.box(c + Vector((0, 0, 0.02)), (0.025, 0.025, 0.02), "#f0d040")


def build_step_shrine(m, v):
    z = 0.0
    for k, (w, h) in enumerate(((1.15, 0.3), (0.92, 0.3), (0.7, 0.3), (0.5, 0.25))):
        m.box((0, 0, z + h / 2), (2 * w, 2 * w, h), TEMPLE[k % 3])
        m.box((0, 0, z + h - 0.02), (2 * w + 0.04, 2 * w + 0.04, 0.04), TEMPLE[3])
        z += h
    # a stair up the front with serpent balustrades
    for k in range(8):
        m.box((0, -1.15 - 0.15 + k * 0.1, 0.07 + k * 0.14), (0.44, 0.3, 0.14), TEMPLE[2])
    for s in (-1, 1):
        m.tube([(s * 0.28, -1.35, 0.1), (s * 0.28, -0.4, 1.2)], 0.06, TEMPLE[0], n=4)
        m.box((s * 0.28, -1.42, 0.14), (0.14, 0.2, 0.2), TEMPLE[3])
        m.box((s * 0.28, -1.53, 0.14), (0.08, 0.02, 0.05), JADE)
    # the shrine on top
    m.box((0, 0.05, z + 0.3), (0.7, 0.6, 0.6), TEMPLE[0])
    m.box((0, -0.26, z + 0.24), (0.26, 0.02, 0.42), "#1a1612")
    m.box((0, 0.05, z + 0.66), (0.8, 0.7, 0.12), TEMPLE[3])
    for k in range(5):
        m.box((-0.3 + 0.15 * k, 0.05, z + 0.78), (0.08, 0.6, 0.12), (JADE, TEMPLE[2])[k % 2])
    for k in range(6):
        m.blob(polar(1.3, k * TAU / 6 + 0.5, 0.05), (0.2, 0.16, 0.1), JUNGLE[k % 4], n=5)


def build_ceiba_roots(m, v):
    s = len(m.vertices)
    m.lathe((0, 0, 0), [(0, 0.62), (0.6, 0.5), (1.4, 0.44), (2.2, 0.42), (3.0, 0.45)], "#8a8070", n=8, jitter=0.1,
            colors=["#7a7060", "#8a8070", "#9a9080", "#8a8070"])
    wobble(m, s, 0.05, freq=2)
    # flat buttress roots: tall thin fins running out from the trunk
    for k in range(6):
        a = k * TAU / 6 + 0.2
        reach = 1.35 + 0.12 * (k % 2)
        outline = [(0.3, 0), (reach, 0), (reach - 0.25, 0.1), (0.95, 0.3), (0.7, 0.65), (0.55, 1.1), (0.42, 1.5)]
        st = len(m.vertices)
        prism(m, outline, -0.07, 0.07, ("#8a8070", "#7a7060")[k % 2], top=("#9a9080", "#8a8070")[k % 2])
        m.vertices[st:] = [(x, z, y) for x, y, z in m.vertices[st:]]
        xform(m, st, rot=(0, 0, a))
    # epiphytes and moss on the trunk
    for k in range(6):
        p = polar(0.47, k * 2.2, 1.5 + 0.25 * k)
        for j in range(4):
            blade(m, p, Vector(p) + Vector(polar(0.22, k * 2.2 + (j - 1.5) * 0.6, 0.15)), 0.05,
                  ("#c84a6a", "#3a8a44", "#4a9a4a", "#2e7a3a")[(j + k) % 4] if j else "#e8607a")
    for k in range(4):
        m.blob(polar(0.42, k * 1.6 + 0.8, 0.9 + 0.5 * k), (0.14, 0.1, 0.12), JUNGLE[k % 4], n=4)


# ================================ grotto =====================================
def build_sea_glass(m, v):
    for i in range(5 + v):
        c = polar(0.24 * ((i * 0.618) % 1) + 0.04, i * 2.4 + v)
        start = len(m.faces)
        outline = ngon(m, c, 0.035 + 0.015 * m.rng.random(), 5, jitter=0.25, phase=i)
        prism(m, outline, 0, 0.025, ("#7fe0ff", "#9af0d0", "#80b0ff")[i % 3])
        if i % 2 == 0:
            m.glows[start:] = [True] * (len(m.faces) - start)
    pebble(m, polar(0.1, 3.0), 0.05, "#5a6a70")


def build_pearl_sand(m, v):
    m.lathe((0, 0, 0), [(0, 0.32), (0.015, 0.28), (0.03, 0.15), (0.035, 0)], "#c8c0a8", n=8, jitter=0.18)
    for i in range(3 + v):
        c = polar(0.18 * ((i * 0.618) % 1) + 0.05, i * 2.4 + v, 0.035)
        m.lathe(c, [(0, 0.04), (0.015, 0.035), (0.03, 0)], ("#f0e8f8", "#e0d8f0", "#f8f0e8")[i % 3], n=5)
    m.lathe(polar(0.2, 1.0 + v, 0.03), [(0, 0.03), (0.02, 0.025), (0.06, 0)], "#e8a0b0", n=5, axis=(1, 0, 0.4))


def build_kelp_stalk(m, v):
    for i in range(3):
        base = Vector(polar(0.1 * (i > 0), i * 2.4 + v))
        h = 1.2 + 0.5 * ((i * 0.618 + 0.3 * v) % 1)
        pts = [base + Vector((0.05 * math.sin(k + i), 0.05 * math.cos(k * 1.3 + i), h * k / 4)) for k in range(5)]
        m.tube(pts, [0.02, 0.018, 0.015, 0.012, 0.006], KELP[i % 3], n=3)
        for k in (1, 3):
            p = pts[k]
            ribbon(m, [p, p + Vector(polar(0.08, k * 2 + i, 0.02)), p + Vector(polar(0.16, k * 2 + i + 0.3, -0.04))],
                   (0, 0, 1), 0.05, KELP[(i + k) % 3])
            if k == 2:
                m.blob(p, (0.025, 0.025, 0.03), "#8a9a3a", n=4)


def build_anemone(m, v):
    m.lathe((0, 0, 0), [(0, 0.14), (0.1, 0.12), (0.16, 0.14)], ("#a03a6a", "#3a7a8a")[v], n=7)
    start = len(m.faces)
    for k in range(10):
        a = k * TAU / 10
        r = 0.08 + 0.04 * (k % 2)
        m.tube([polar(r, a, 0.15), polar(r + 0.08, a + 0.2, 0.3 + 0.05 * (k % 3))], [0.016, 0.006],
               (GLOW_PINK, "#7af0e0")[v], n=3)
    lit(m, start)


def build_giant_clam(m, v):
    for top in (False, True):
        st = len(m.vertices)
        m.lathe((0, 0, 0), [(0, 0.04), (0.04, 0.28), (0.1, 0.36), (0.14, 0.3)], "#7a8aa0", n=8, jitter=0.03,
                colors=["#5a6a80", "#8a9ab0", "#a8b8c8"])
        for k in range(5):
            m.box(polar(0.3, k * 1.2 + 0.5, 0.1), (0.05, 0.1, 0.03), "#5a6a80", tilt=k * 1.2 + 0.5)
        if top:
            xform(m, st, scale=(1, 1, -0.8))
            xform(m, st, rot=(-(0.5 + 0.4 * v), 0, 0), pivot=(0, 0.33, 0), offset=(0, 0, 0.26))
    m.lathe((0, 0, 0.13), [(0, 0.3), (0.03, 0.24)], "#e8a0c0", n=8)
    start = len(m.faces)
    m.blob((0.05, 0.0, 0.2), (0.07, 0.07, 0.07), "#f8f8ff", n=5)
    lit(m, start)


def build_brain_coral(m, v):
    m.lathe((0, 0, 0), [(0, 0.32), (0.1, 0.34), (0.22, 0.26), (0.3, 0.12), (0.32, 0)], ("#d8a060", "#a070c8")[v],
            n=8, jitter=0.08, colors=[("#c08850", "#8a5ab0")[v], ("#d8a060", "#a070c8")[v], ("#e8b878", "#b888d8")[v]])
    for k in range(5):
        a = k * 1.3
        m.tube([polar(0.25, a, 0.18), polar(0.12, a + 0.8, 0.29), polar(-0.05, a + 1.6, 0.31)], 0.018,
               ("#b88040", "#7a4a9a")[v], n=3)


def build_sunken_anchor(m, v):
    s = len(m.vertices)
    m.tube([(0, 0, 0.0), (0, 0, 0.9)], 0.04, RUST, n=5)
    m.tube([(-0.18, 0, 0.78), (0.18, 0, 0.78)], 0.03, RUST, n=4)
    m.ring((0, 0, 0.98), 0.07, 0.018, RUST, n=8, vertical=True)
    m.tube([(-0.36, 0, 0.3), (-0.3, 0, 0.12), (0, 0, 0.02), (0.3, 0, 0.12), (0.36, 0, 0.3)], 0.035, RUST, n=4)
    for sx in (-1, 1):
        m.lathe((sx * 0.36, 0, 0.3), [(0, 0.06), (0.1, 0)], RUST, n=4, axis=(sx * 0.3, 0, 1))
    xform(m, s, rot=(0, 0.35 + 0.2 * v, 0.4), offset=(0, 0, 0.1))
    clamp_ground(m, s)
    m.tube([(0.0, -0.1, 0.05), (0.1, -0.25, 0.0), (0.35, -0.2, 0.02)], 0.02, RUST, n=4)
    for k in range(4):
        m.lathe(polar(0.1 + 0.07 * k, 0.8 + k, 0.2 + 0.1 * k), [(0, 0.025), (0.03, 0.015)], "#d8d0c0", n=4)
    m.blob((0.2, 0.2, 0.0), (0.12, 0.1, 0.05), KELP[0], n=5)


def build_jelly_lantern(m, v):
    m.tube([(0, 0, 0), (0, 0, 1.0), (0.1, 0, 1.12), (0.2, 0, 1.08)], [0.025, 0.02, 0.018, 0.015], BRONZE, n=4)
    c = Vector((0.2, 0, 0.82))
    m.tube([c + Vector((0, 0, 0.26)), c + Vector((0, 0, 0.18))], 0.004, BRONZE, n=3)
    m.lathe(c, [(-0.15, 0.06), (-0.1, 0.12), (0.1, 0.12), (0.17, 0.05)], "#5a8aa0", n=6,
            colors=[BRONZE, "#7ab0c8", BRONZE])
    start = len(m.faces)
    m.lathe(c + Vector((0, 0, 0.0)), [(-0.02, 0.08), (0.05, 0.075), (0.09, 0.0)], "#c8f0ff", n=6)
    for k in range(4):
        m.tube([c + Vector(polar(0.04, k * 1.6, 0)), c + Vector(polar(0.05, k * 1.6 + 0.4, -0.12))], 0.005,
               "#c8f0ff", n=3)
    lit(m, start)
    m.lathe((0, 0, 0), [(0, 0.12), (0.05, 0.08)], BRONZE, n=6)


def build_jellyfish(m, v):
    start = len(m.faces)
    m.lathe((0, 0, -0.02), [(0, 0.12 + 0.03 * v), (0.04, 0.13 + 0.03 * v), (0.09, 0.09), (0.12, 0)], "#a8e8ff", n=7,
            colors=["#c8f4ff", "#a8e8ff", "#e0f8ff"])
    lit(m, start)
    for k in range(6):
        a = k * TAU / 6
        m.tube([polar(0.07, a, -0.02), polar(0.09, a + 0.3, -0.1), polar(0.07, a + 0.6, -0.18)],
               [0.008, 0.006, 0.003], "#d8f4ff", n=3)
    if v:
        m.lathe(polar(0.3, 2.0, -0.01), [(0, 0.06), (0.04, 0.06), (0.06, 0)], "#c8f4ff", n=6)


def build_glow_strands(m, v):
    m.blob((0, 0, 0), (0.2, 0.18, 0.03), "#2a3a44", n=6)
    start = len(m.faces)
    for i in range(6 + v):
        x, y, _ = polar(0.16 * ((i * 0.618) % 1) + 0.03, i * 2.4 + v)
        length = 0.35 + 0.5 * ((i * 0.37) % 1)
        m.tube([(x, y, 0), (x + 0.02, y, -length * 0.5), (x, y + 0.02, -length)], [0.006, 0.005, 0.003], GLOW_CYAN,
               n=3)
        m.blob((x, y + 0.02, -length - 0.02), (0.025, 0.025, 0.03), "#c8faff", n=4)
    lit(m, start)


def build_coral_wall(m, v):
    m.blob((0, 0, 0), (0.4, 0.12, 0.3), "#6a6a72", n=6)
    for i in range(6 + v):
        x, z = 0.3 * math.cos(i * 2.4) * ((i * 0.618) % 1), 0.22 * math.sin(i * 2.4) * ((i * 0.618) % 1)
        start = len(m.faces)
        m.lathe((x, 0.1, z), [(0, 0.05), (0.06, 0.07), (0.1, 0.04)], REEF[i % 4], n=5, axis=(0, 1, 0.2))
        if i % 3 == 0:
            lit(m, start)
    for k in range(2):
        m.tube([(-0.2 + 0.4 * k, 0.12, 0.0), (-0.15 + 0.4 * k, 0.24, 0.15), (-0.2 + 0.4 * k, 0.26, 0.3)],
               [0.02, 0.014, 0.006], REEF[k], n=3)
    flatten_back(m)


def build_kelp_drape(m, v):
    m.blob((0, -0.08, 0.02), (0.32, 0.1, 0.04), "#3a4a2a", n=6)
    for i in range(5 + v):
        x = -0.32 + 0.64 * i / (4 + v)
        drop = 0.4 + 0.35 * ((i * 0.618) % 1)
        ribbon(m, [(x, -0.06, 0.04), (x + 0.02, 0.05, 0.02), (x - 0.03, 0.08, -drop * 0.4), (x + 0.03, 0.07, -drop)],
               (1, 0, 0), 0.06, KELP[i % 3])
    for k in range(2):
        m.blob((-0.15 + 0.3 * k, 0.1, -0.25 - 0.1 * k), (0.02, 0.02, 0.02), GLOW_CYAN, n=4)
    clamp_lip(m)


def build_sunken_bell(m, v):
    s = len(m.vertices)
    m.lathe((0, 0, 0), [(0, 1.0), (0.15, 0.95), (0.5, 0.75), (1.0, 0.62), (1.4, 0.58), (1.65, 0.45), (1.75, 0)],
            BRONZE, n=10, jitter=0.0, colors=["#7a5a2a", BRONZE, "#5a8a7a", BRONZE, "#4a7a6a", BRONZE])
    for k in range(3):
        m.ring((0, 0, 0.2 + 0.35 * k), 0.92 - 0.12 * k, 0.03, "#b08040", n=10, section=3)
    m.ring((0, 0, 1.9), 0.18, 0.05, BRONZE, n=8, vertical=True)
    xform(m, s, rot=(0.0, 0.35, 0.3), offset=(0, 0, 0.0))
    clamp_ground(m, s)
    for i in range(7):
        m.blob(polar(1.15, i * TAU / 7, 0.05), (0.26, 0.2, 0.08), "#c8c0a8", n=5)
    for k in range(3):
        m.tube([polar(0.7, k * 2, 0.0), polar(0.75, k * 2 + 0.2, 0.8 + 0.3 * k)], [0.03, 0.006], KELP[k], n=3)


def build_giant_shell(m, v):
    s = len(m.vertices)
    prof = [(0, 1.05), (0.35, 1.08), (0.8, 0.98), (1.25, 0.8), (1.7, 0.58), (2.1, 0.36), (2.45, 0.16), (2.7, 0.0)]
    m.lathe((0, 0, 0), prof, "#e8c8b0", n=10, jitter=0.03, colors=["#d8a888", "#f0d8c0", "#e8b8a0", "#f8e0c8"])
    # one ridge spiralling round the shell to its tip
    pts, radii = [], []
    for k in range(25):
        t = k / 24
        z = t * 2.55
        r = next(rr for zz, rr in reversed(prof) if zz <= z) if z > 0 else prof[0][1]
        nxt = next(((zz, rr) for zz, rr in prof if zz > z), prof[-1])
        prv = next((zz, rr) for zz, rr in reversed(prof) if zz <= z)
        f = (z - prv[0]) / max(1e-6, nxt[0] - prv[0])
        r = prv[1] + (nxt[1] - prv[1]) * f
        a = t * TAU * 3.2
        pts.append(polar(r * 1.02, a, z))
        radii.append(0.09 * (1 - 0.7 * t))
    m.tube(pts, radii, "#c89880", n=4)
    wobble(m, s, 0.03, freq=2)
    # the flared mouth: a pink lip around the doorway
    m.box((0, -1.02, 0.42), (0.55, 0.12, 0.8), "#2a2220")
    m.ring((0, -1.06, 0.45), 0.4, 0.07, "#f0b8c0", n=10, section=3, vertical=True, ellipse=1.25)
    start = len(m.faces)
    m.blob((0, -1.1, 0.22), (0.2, 0.06, 0.1), "#c8f0ff", n=5)
    lit(m, start)


# ================================= forge =====================================
def gear(m, center, r, teeth, t, color, axis="y", hub=None):
    """A flat gear: a ring of teeth around a disc, its face along `axis`."""
    s = len(m.vertices)
    m.lathe((0, 0, -t / 2), [(0, r * 0.9), (t, r * 0.9)], color, n=max(6, teeth), jitter=0)
    for k in range(teeth):
        a = k * TAU / teeth
        m.box(polar(r * 0.98, a, 0), (r * 0.22, r * 0.22, t), color, tilt=a)
    m.lathe((0, 0, -t / 2 - 0.01), [(0, r * 0.3), (t + 0.02, r * 0.3)], hub or STEEL_DARK, n=6, jitter=0)
    if axis == "y":
        xform(m, s, rot=(math.pi / 2, 0, 0))
    elif axis == "x":
        xform(m, s, rot=(0, math.pi / 2, 0))
    xform(m, s, offset=center)


def build_metal_shavings(m, v):
    for i in range(6 + v):
        c = polar(0.22 * ((i * 0.618) % 1) + 0.04, i * 2.4 + v, 0.01)
        a = m.rng.random() * TAU
        m.tube([c, Vector(c) + Vector(polar(0.05, a, 0.02)), Vector(c) + Vector(polar(0.08, a + 1.5, 0.0))], 0.006,
               (STEEL, "#b08a50", STEEL_DARK)[i % 3], n=3)
    m.lathe((0, 0, 0), [(0, 0.12), (0.01, 0.1), (0.015, 0)], SOOT, n=6, jitter=0.25)


def build_slag_bits(m, v):
    for i in range(5 + v):
        c = polar(0.22 * ((i * 0.618) % 1) + 0.04, i * 2.4 + v)
        start = len(m.faces)
        pebble(m, c, 0.035 + 0.02 * (i % 2), (SOOT, "#ff7030", "#3a3230")[i % 3], n=5)
        if i % 3 == 1:
            lit(m, start)


def build_anvil_block(m, v):
    m.lathe((0, 0, 0), [(0, 0.24), (0.32, 0.22), (0.36, 0.2)], WOOD, n=7, colors=["#6e5236", WOOD])
    m.box((0, 0, 0.42), (0.18, 0.14, 0.12), IRON)
    m.box((0, 0, 0.53), (0.38, 0.18, 0.1), STEEL_DARK)
    m.lathe((0.19, 0, 0.53), [(0, 0.06), (0.16, 0.0)], STEEL_DARK, n=4, axis=(1, 0, 0), phase=math.pi / 4)
    m.box((-0.2, 0, 0.55), (0.06, 0.14, 0.06), STEEL_DARK)
    s = len(m.vertices)
    m.tube([(0, 0, 0), (0.28, 0, 0)], 0.015, WOOD, n=4)
    m.box((0.3, 0, 0), (0.06, 0.1, 0.06), IRON)
    xform(m, s, rot=(0, 0, 0.6 - 1.4 * v), offset=(-0.05, 0.02, 0.61))
    if v:
        m.box((0.08, 0.0, 0.6), (0.12, 0.05, 0.02), HOT)


def build_ingot_stack(m, v):
    for layer in range(3 + v):
        for k in range(3 - layer % 2):
            x = -0.14 + 0.14 * k + 0.07 * (layer % 2)
            outline = [(-0.055, -0.14), (0.055, -0.14), (0.04, 0.14), (-0.04, 0.14)]
            prism(m, [(x + a, b) for a, b in outline], 0.06 * layer, 0.06 * layer + 0.055,
                  ("#c8a040", STEEL, COPPER)[(layer + v) % 3])
            xform(m, len(m.vertices) - 8, rot=(0, 0, math.pi / 2 * (layer % 2)))


def build_gear_pile(m, v):
    for k in range(3):
        r = (0.2, 0.17)[v] - 0.04 * k
        gear(m, polar(0.12 * k, k * 2.1 + v, 0.03 + 0.05 * k), r, 6, 0.05,
             (STEEL, "#b08a50", STEEL_DARK, COPPER)[k], axis="z")
    clamp_ground(m)


def build_steam_vent(m, v):
    m.lathe((0, 0, 0), [(0, 0.32), (0.04, 0.3), (0.06, 0.24)], STEEL_DARK, n=8)
    for k in range(5):
        m.box((-0.16 + 0.08 * k, 0, 0.065), (0.03, 0.42, 0.02), IRON)
    for k in range(3 + v):
        r = 0.08 + 0.04 * k
        m.blob(polar(0.03 * k, k * 2.3, 0.18 + 0.2 * k), (r, r * 0.9, r * 0.7), ("#f0f0f0", "#e4e4e4", "#d8d8d8",
                                                                                 "#cccccc")[k], n=5)


def build_crucible(m, v):
    for s in (-1, 1):
        m.tube([(s * 0.3, 0, 0), (s * 0.3, 0, 0.55)], 0.025, IRON, n=4)
    m.tube([(-0.32, 0, 0.5), (0.32, 0, 0.5)], 0.02, IRON, n=4)
    s = len(m.vertices)
    m.lathe((0, 0, 0.15), [(0, 0.1), (0.08, 0.17), (0.28, 0.2), (0.32, 0.19)], "#4a4040", n=8,
            colors=[SOOT, "#4a4040", "#5a4a44"])
    xform(m, s, rot=(0.0, 0.25 * v, 0), pivot=(0, 0, 0.4))
    start = len(m.faces)
    m.lathe((0, 0, 0.44), [(0, 0.17), (0.01, 0.16)], HOT, n=8)
    lit(m, start)
    m.lathe((0, 0, 0), [(0, 0.2), (0.08, 0.16)], "#3a3230", n=6)
    start = len(m.faces)
    for k in range(4):
        m.box(polar(0.1, k * 1.6, 0.09), (0.06, 0.06, 0.03), "#ff6020", tilt=k)
    lit(m, start)


def build_valve_pipe(m, v):
    m.tube([(0, 0, 0), (0, 0, 0.9)], 0.07, (COPPER, STEEL_DARK)[v], n=6)
    for z in (0.05, 0.45, 0.88):
        m.lathe((0, 0, z - 0.03), [(0, 0.1), (0.06, 0.1)], BRASS, n=6)
    m.tube([(0, 0, 0.9), (0, 0, 1.0), (0.15, 0, 1.12), (0.35, 0, 1.12)], 0.06, (COPPER, STEEL_DARK)[v], n=6)
    m.ring((0, -0.13, 0.55), 0.1, 0.014, "#c83a2a", n=8, vertical=True, yaw=math.pi / 2)
    m.tube([(0, -0.06, 0.55), (0, -0.13, 0.55)], 0.015, IRON, n=4)
    m.lathe((0.08, 0, 0.72), [(0, 0.06), (0.03, 0.06)], BRASS, n=8, axis=(1, 0, 0))
    m.box((0.115, 0, 0.72), (0.005, 0.07, 0.07), "#f0e8d0")


def build_coal_bin(m, v):
    m.box((0, 0, 0.18), (0.6, 0.4, 0.36), "#4a4040")
    for s in (-1, 1):
        m.box((s * 0.29, 0, 0.18), (0.04, 0.42, 0.38), IRON)
    for k in range(7 + v):
        m.blob(polar(0.17 * ((k * 0.618) % 1), k * 2.4, 0.36 + 0.03 * (k % 3)), (0.07, 0.06, 0.05), SOOT, n=4)
    m.tube([(0.2, 0.1, 0.38), (0.32, 0.25, 0.75)], 0.012, WOOD, n=3)
    m.box((0.18, 0.08, 0.36), (0.12, 0.1, 0.03), IRON, tilt=0.6)


def build_pipe_run(m, v):
    for k in range(2):
        z = 0.15 - 0.3 * k
        m.tube([(-0.45, 0.1, z), (0.45, 0.1, z)], 0.06, (COPPER, STEEL_DARK)[(k + v) % 2], n=6)
        for x in (-0.3, 0.3):
            m.box((x, 0.04, z), (0.04, 0.08, 0.16), IRON)
    m.lathe((0.1, 0.1, -0.15), [(-0.06, 0.08), (0.06, 0.08)], BRASS, n=6, axis=(1, 0, 0))
    if v:
        m.tube([(0.0, 0.1, 0.15), (0.0, 0.18, 0.3), (0.0, 0.18, 0.45)], 0.045, COPPER, n=6)
    else:
        m.ring((-0.1, 0.2, 0.15), 0.07, 0.012, "#c83a2a", n=8, vertical=True, yaw=0)
        m.tube([(-0.1, 0.1, 0.15), (-0.1, 0.2, 0.15)], 0.012, IRON, n=3)
    flatten_back(m)


def build_gauge_panel(m, v):
    m.box((0, 0.025, 0), (0.6, 0.05, 0.45), BRASS)
    m.box((0, 0.055, 0), (0.54, 0.01, 0.39), "#3a3230")
    for k in range(3):
        x = -0.17 + 0.17 * k
        m.lathe((x, 0.06, 0.08), [(0, 0.07), (0.03, 0.07)], BRASS, n=8, axis=(0, 1, 0))
        m.lathe((x, 0.09, 0.08), [(0, 0.058), (0.005, 0.058)], "#f0e8d0", n=8, axis=(0, 1, 0))
        m.box((x + 0.02, 0.097, 0.09), (0.05, 0.005, 0.008), "#c83a2a", tilt=0)
    start = len(m.faces)
    for k in range(4):
        m.box((-0.18 + 0.12 * k, 0.065, -0.12), (0.05, 0.02, 0.05), ("#7aff9a", "#7aff9a", "#7aff9a", "#7aff9a")[k])
    lit(m, start)
    m.box((0.22, 0.08, -0.12), (0.03, 0.06, 0.12), "#c83a2a", tilt=0.0)
    flatten_back(m)


def build_chain_hoist(m, v):
    m.box((0, 0, -0.04), (0.3, 0.18, 0.08), IRON)
    gear(m, (0, 0, -0.15), 0.1, 6, 0.04, BRASS, axis="y")
    chain(m, (0.06, 0, -0.15), 5 + v, r=0.035, t=0.008, n=4)
    chain(m, (-0.06, 0, -0.15), 3, r=0.035, t=0.008, n=4)
    hook = Vector((0.06, 0, -0.18 - (5 + v) * 0.035 * 2.5))
    m.tube([hook, hook - Vector((0, 0, 0.08)), hook + Vector((0.06, 0, -0.14)), hook + Vector((0.08, 0, -0.08))],
           0.014, STEEL_DARK, n=4)


def build_slag_raft(m, v):
    for i in range(2 + v):
        c = polar(0.18 * (i > 0), i * 2.5 + v)
        outline = ngon(m, c, 0.16 - 0.03 * i, 6, jitter=0.25, phase=m.rng.random())
        prism(m, outline, -0.06, [0.03 + 0.03 * m.rng.random() for _ in outline], "#2a2220", top="#3a302a")
        start = len(m.faces)
        m.box((c[0], c[1], 0.035), (0.1, 0.015, 0.02), "#ff6020", tilt=i)
        lit(m, start)


def build_pipe_bend(m, v):
    m.tube([(0, -0.3, 0.07), (0, 0.0, 0.07), (0, 0.1, -0.03), (0, 0.1, -0.5 - 0.15 * v)], 0.065,
           (COPPER, STEEL_DARK)[v], n=6)
    for p in ((0, -0.2, 0.07), (0, 0.1, -0.3)):
        m.lathe(p, [(-0.03, 0.085), (0.03, 0.085)], BRASS, n=6, axis=(0, 1, 0) if p[2] > 0 else (0, 0, 1))
    m.box((0, -0.25, 0.01), (0.2, 0.06, 0.02), IRON)
    clamp_lip(m)


def build_great_gear(m, v):
    m.box((0, 0, 0.1), (2.4, 0.9, 0.2), "#4a4040")
    for s in (-1, 1):
        m.box((s * 1.05, 0, 1.25), (0.16, 0.5, 2.3), STEEL_DARK)
        m.box((s * 1.05, 0, 2.4), (0.3, 0.6, 0.12), IRON)
    m.tube([(-1.1, 0, 1.3), (1.1, 0, 1.3)], 0.08, IRON, n=6)
    gear(m, (0, 0, 1.3), 0.95, 18, 0.16, BRASS, axis="x", hub=IRON)
    for k in range(6):
        a = k * TAU / 6
        m.tube([(0, 0.0, 1.3), (0, 0.8 * math.cos(a), 1.3 + 0.8 * math.sin(a))], 0.05, "#a07a40", n=4)
    gear(m, (0.0, -0.0, 0.42), 0.32, 10, 0.12, COPPER, axis="x", hub=IRON)
    m.box((-0.5, 0.42, 0.42), (0.35, 0.02, 0.3), BRASS)
    m.box((-0.5, 0.44, 0.42), (0.2, 0.02, 0.1), "#7aff9a")


def build_furnace(m, v):
    m.lathe((0, 0, 0), [(0, 1.15), (0.25, 1.1), (0.3, 1.0), (1.4, 0.9), (1.6, 0.6), (1.8, 0.45)], "#5a4a44", n=8,
            jitter=0.03, colors=["#3a3230", "#5a4a44", "#6a5a50", "#4a3e38", "#3a3230"])
    for k in range(4):
        m.ring((0, 0, 0.45 + 0.35 * k), 1.0 - 0.02 * k, 0.04, IRON, n=8, section=3)
    m.tube([(0, 0, 1.75), (0, 0, 3.0)], 0.28, "#4a3e38", n=6)
    m.lathe((0, 0, 3.0), [(0, 0.36), (0.12, 0.34)], IRON, n=6)
    # the glowing mouth on the front (-Y)
    m.box((0, -0.92, 0.6), (0.7, 0.2, 0.6), "#3a3230")
    start = len(m.faces)
    m.box((0, -1.01, 0.58), (0.52, 0.04, 0.44), HOT)
    for k in range(3):
        m.box((-0.15 + 0.15 * k, -1.06, 0.38), (0.1, 0.06, 0.06), "#ffb040")
    lit(m, start)
    m.box((0, -1.06, 0.88), (0.76, 0.08, 0.08), IRON)
    # bellows on the side and a coal pile
    m.box((1.1, 0, 0.25), (0.25, 0.5, 0.18), "#6a4a32")
    m.lathe((1.1, 0, 0.34), [(0, 0.22), (0.12, 0.15), (0.16, 0.05)], LEATHER, n=6)
    for k in range(8):
        m.blob(polar(1.15 + 0.15 * (k % 2), -1.9 + 0.2 * k, 0.05), (0.12, 0.1, 0.07), SOOT, n=4)


# ================================ ossuary ====================================
def build_bone_dust(m, v):
    m.lathe((0, 0, 0), [(0, 0.3), (0.01, 0.27), (0.02, 0.15), (0.025, 0)], "#a8a090", n=8, jitter=0.2)
    for i in range(3 + v):
        a = i * 2.4 + v
        bone_lite(m, polar(0.15, a, 0.03), polar(0.15 + 0.1, a + 0.8, 0.03), r=0.012, knobs=i % 2 == 0)


def build_candle_stubs(m, v):
    for i in range(3):
        x, y, _ = polar(0.13 * (i > 0) + 0.03 * i, i * 2.4 + v)
        h = 0.06 + 0.04 * ((i + v) % 3)
        m.lathe((x, y, 0), [(0, 0.045), (0.015, 0.035), (h, 0.03)], CANDLE, n=5, jitter=0.1,
                colors=["#e8e0c8", CANDLE])
        flame(m, (x, y, h), 0.05, "#ffb060", r=0.013)
    m.lathe((0, 0, 0), [(0, 0.22), (0.008, 0.18)], "#e8e0c8", n=6, jitter=0.25)


def build_skull_pile(m, v):
    spots = ([(-0.14, -0.1, 0), (0.12, -0.12, 0), (0.0, 0.12, 0), (-0.02, -0.02, 0.17)] if v == 0 else
             [(-0.16, 0.0, 0), (0.1, -0.1, 0), (0.15, 0.14, 0), (0.0, 0.02, 0.17)])
    for k, (x, y, z) in enumerate(spots):
        skull_lite(m, (x, y, z), scale=1.15, yaw=-0.3 + 0.4 * k + v)
    for k in range(2):
        a = k * 2.1 + v
        bone_lite(m, polar(0.28, a, 0.03), polar(0.2, a + 1.2, 0.05), r=0.015)


def build_candelabra(m, v):
    m.lathe((0, 0, 0), [(0, 0.16), (0.04, 0.12), (0.08, 0.04)], BRASS, n=6)
    h = 0.9 + 0.15 * v
    m.tube([(0, 0, 0.08), (0, 0, h)], 0.02, BRASS, n=4)
    tips = [(0, 0, h + 0.05)]
    for s in (-1, 1):
        m.tube([(0, 0, h - 0.15), (s * 0.12, 0, h - 0.12), (s * 0.2, 0, h - 0.02)], 0.012, BRASS, n=3)
        tips.append((s * 0.2, 0, h))
    for x, y, z in tips:
        m.lathe((x, y, z - 0.02), [(0, 0.04), (0.02, 0.03)], BRASS, n=5)
        m.lathe((x, y, z), [(0, 0.022), (0.12, 0.02)], CANDLE, n=5)
        m.tube([(x, y, z + 0.06), (x + 0.025, y, z - 0.02)], [0.012, 0.004], "#e8e0c8", n=3)
        flame(m, (x, y, z + 0.12), 0.06, "#ffc070", r=0.015)


def build_sarcophagus(m, v):
    outline = [(-0.42, -0.14), (-0.42, 0.14), (0.3, 0.2), (0.42, 0.12), (0.42, -0.12), (0.3, -0.2)]
    prism(m, outline, 0, 0.32, CRYPT[1], top=CRYPT[0])
    s = len(m.vertices)
    prism(m, [(x * 1.05, y * 1.15) for x, y in outline], 0.32, 0.4, CRYPT[2], top=CRYPT[0])
    if v:
        xform(m, s, rot=(0, 0, 0.35), offset=(0.08, 0.12, 0.0))
    m.box((0.1, 0, 0.42), (0.3, 0.12, 0.03), CRYPT[0])
    m.box((0.1, 0, 0.44), (0.05, 0.22, 0.03), CRYPT[0])
    skull_lite(m, (-0.2, 0.0, 0.4), scale=0.6, yaw=math.pi / 2)


def build_funeral_urn(m, v):
    m.lathe((0, 0, 0), [(0, 0.1), (0.04, 0.08), (0.08, 0.16), (0.3, 0.2), (0.45, 0.12), (0.5, 0.08), (0.56, 0.1)],
            ("#6a7a8a", CRYPT[2])[v], n=8, jitter=0.02, colors=[CRYPT[1], ("#6a7a8a", CRYPT[2])[v], BRASS])
    for s in (-1, 1):
        m.ring((s * 0.2, 0, 0.38), 0.05, 0.012, BRASS, n=6, vertical=True)
    m.lathe((0, 0, 0.56), [(0, 0.1), (0.04, 0.08), (0.08, 0.02)], BRASS, n=6)
    if v:
        m.lathe((0.25, 0.1, 0), [(0, 0.06), (0.08, 0.07), (0.12, 0.04)], CRYPT[1], n=6)


def build_bone_lantern(m, v):
    m.lathe((0, 0, 0), [(0, 0.18), (0.06, 0.14)], CRYPT[1], n=6)
    for k in range(4):
        a = k * TAU / 4 + math.pi / 4
        bone_lite(m, polar(0.1, a, 0.06), polar(0.08, a, 0.5), r=0.018)
    skull_lite(m, (0, 0, 0.5), scale=1.2, yaw=v * 0.5)
    start = len(m.faces)
    m.blob((0, 0, 0.28), (0.07, 0.07, 0.09), "#ffc070", n=5)
    lit(m, start)


def build_skull_wall(m, v):
    m.box((0, 0.03, 0), (0.9, 0.06, 0.7), CRYPT[1])
    for r in range(3):
        n = 3 if r == 1 else (3, 2)[(r // 2 + v) % 2]
        for c in range(n):
            x = (c - (n - 1) / 2) * 0.26
            z = 0.2 - 0.22 * r
            if r == 1:
                bone_lite(m, (x - 0.12, 0.09, z), (x + 0.12, 0.09, z), r=0.022, knobs=False)
            else:
                skull_tiny(m, (x, 0.14, z - 0.08), scale=1.1)
    flatten_back(m)


def build_candle_niche(m, v):
    m.box((0, 0.03, 0), (0.5, 0.06, 0.55), CRYPT[0])
    m.box((0, 0.065, 0.03), (0.36, 0.01, 0.4), "#2a2622")
    m.box((0, 0.12, -0.18), (0.42, 0.14, 0.04), CRYPT[2])
    m.lathe((0, 0.06, 0.23), [(0, 0.18), (0.08, 0.15), (0.12, 0.05)], CRYPT[2], n=4, phase=math.pi / 4,
            axis=(0, 0, 1))
    for k in range(2 + v):
        x = -0.1 + 0.2 * k / max(1, 1 + v)
        h = 0.12 + 0.05 * (k % 2)
        m.lathe((x, 0.12, -0.16), [(0, 0.025), (h, 0.022)], CANDLE, n=5)
        flame(m, (x, 0.12, -0.16 + h), 0.05, "#ffb060", r=0.013)
    skull_lite(m, (0.12 - 0.24 * v, 0.12, -0.16), scale=0.55, yaw=0)
    flatten_back(m)


def build_bone_chandelier(m, v):
    chain(m, (0, 0, 0), 3, r=0.03, t=0.007, n=4)
    z = -0.25
    m.ring((0, 0, z), 0.25, 0.025, BONE, n=8, section=3)
    for k in range(4 + v):
        a = k * TAU / (4 + v)
        m.tube([(0, 0, -0.18), polar(0.25, a, z)], 0.008, IRON, n=3)
        m.lathe(polar(0.25, a, z + 0.02), [(0, 0.02), (0.08, 0.018)], CANDLE, n=4)
        flame(m, polar(0.25, a, z + 0.1), 0.05, "#ffc070", r=0.012)
    skull_tiny(m, (0, 0, z - 0.25), scale=1.0)
    m.tube([(0, 0, z - 0.02), (0, 0, z - 0.08)], 0.01, IRON, n=3)


def build_skull_ledge(m, v):
    m.box((0, -0.12, 0.02), (0.9, 0.22, 0.04), CRYPT[0])
    for k in range(4 + v):
        x = -0.33 + 0.66 * k / (3 + v)
        if (k + v) % 3 == 2:
            m.lathe((x, -0.08, 0.04), [(0, 0.025), (0.1, 0.022)], CANDLE, n=5)
        else:
            skull_tiny(m, (x, -0.06, 0.04), scale=0.9)
    for k in range(3):
        x = -0.25 + 0.25 * k
        m.tube([(x, 0.0, 0.0), (x + 0.02, 0.03, -0.25 - 0.1 * k)], [0.015, 0.006], "#e8e0c8", n=3)
    clamp_lip(m)


def build_bone_arch(m, v):
    for s in (-1, 1):
        m.box((s * 1.0, 0, 0.9), (0.4, 0.45, 1.8), CRYPT[1])
        for r in range(6):
            for c in range(2):
                skull_lite(m, (s * 1.0 - 0.09 + 0.18 * c, -0.25, 0.2 + 0.28 * r), scale=0.75, yaw=0.0)
    pts = [Vector((-1.0, 0, 1.8)), Vector((-0.7, 0, 2.35)), Vector((0, 0, 2.6)), Vector((0.7, 0, 2.35)),
           Vector((1.0, 0, 1.8))]
    m.tube(pts, 0.25, CRYPT[2], n=4)
    for k in range(7):
        t = (k + 0.5) / 7
        a = math.pi * (1 - t)
        p = Vector((math.cos(a) * 1.0, -0.24, 1.8 + math.sin(a) * 0.8))
        skull_lite(m, p - Vector((0, 0, 0.08)), scale=0.7, yaw=0.0)
    skull_lite(m, (0, -0.28, 2.55), scale=1.4, yaw=0)
    for s in (-1, 1):
        bone_lite(m, (s * 0.2, -0.3, 2.35), (s * -0.35, -0.3, 2.75), r=0.03)


def build_crypt_shrine(m, v):
    W, D = 0.9, 0.8
    m.box((0, 0, 0.1), (2 * W + 0.2, 2 * D + 0.2, 0.2), CRYPT[2])
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * (W - 0.1), sy * (D - 0.1), 0.95), (0.2, 0.2, 1.5), CRYPT[0])
    m.box((0, D - 0.05, 0.95), (2 * W - 0.2, 0.1, 1.5), CRYPT[1])
    for sx in (-1, 1):
        m.box((sx * (W - 0.05), 0, 0.95), (0.1, 2 * D - 0.2, 1.5), CRYPT[1])
    m.lathe((0, 0, 1.7), [(0, 1.35), (0.1, 1.2), (0.6, 0.6), (0.85, 0.08)], CRYPT[2], n=4, jitter=0,
            phase=math.pi / 4, colors=[CRYPT[0], CRYPT[2], CRYPT[1]])
    m.lathe((0, 0, 2.52), [(0, 0.08), (0.08, 0.05), (0.12, 0.02)], IRON, n=6)
    m.blob((0, 0, 2.7), (0.07, 0.07, 0.07), BRASS, n=5)
    # an altar with candles and a skull inside
    m.box((0, 0.3, 0.45), (0.8, 0.35, 0.5), CRYPT[0])
    for k in range(5):
        x = -0.3 + 0.15 * k
        h = 0.1 + 0.06 * (k % 2)
        m.lathe((x, 0.2, 0.7), [(0, 0.025), (h, 0.022)], CANDLE, n=5)
        flame(m, (x, 0.2, 0.7 + h), 0.06, "#ffb060", r=0.014)
    skull_lite(m, (0, 0.38, 0.7), scale=1.2, yaw=0)
    for k in range(4):
        m.box((-0.6 + 0.4 * k, D + 0.02, 1.5), (0.18, 0.04, 0.18), CRYPT[2])
