"""Theme builders: the deep canyon (see themes.py).

    canyon     Deep canyon: the last of the sky, far down between sheer sandstone walls in
               red, salmon and cream strata; a green river floor with cottonwoods and reeds,
               hanging gardens where springs seep out, cairns, petroglyphs and cliff dwellings

Every builder is build_<prop>(m, variant) on a props.Mesh in attachment space.
"""
import math
from pathlib import Path
import sys

from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from props import WOOD, BARK  # noqa: E402,F401
from themes_geo import *  # noqa: E402,F401,F403

RED_ROCK = ("#a8502e", "#b8603a", "#9a4426", "#c27048")
SALMON = ("#d08a62", "#dca07a", "#c87a50")
CREAM = ("#ead2b0", "#e0c098", "#f0dcc0")
DESERT_VARNISH = "#4a2a1c"
SAGE = ("#8a9a72", "#9aaa80", "#7a8a64")
COTTON_LEAF = ("#7aa040", "#8ab048", "#6a9038", "#a0b850")
REED = ("#7a8a4a", "#8a9a52", "#a0a060")
ADOBE = ("#c89068", "#b88058", "#d8a078")
ADOBE_DARK = "#7a4a30"
PAPER = "#f0d8a8"
POT = ("#c8784a", "#d8906a", "#a86038")
POT_PAINT = "#3a2a22"


def strata_rock(m, center, r, h, n=6, jitter=0.18, colors=RED_ROCK, top=None):
    """A banded sandstone lump: a lathe in horizontal strata, the top a lighter cream."""
    bands = 4
    prof = [(0, r)] + [(h * (k + 1) / bands, r * (1 - 0.12 * (k + 1)) * (0.92 + 0.08 * ((k * 3) % 2)))
                       for k in range(bands)] + [(h * 1.04, r * 0.3)]
    cols = [colors[k % len(colors)] for k in range(bands)] + [top or CREAM[0]]
    m.lathe(center, prof, colors[0], n=n, jitter=jitter, colors=cols)


# ================================ cover ======================================
def build_desert_grass(m, v):
    for k in range(3 + v):
        c = Vector(polar(0.18 * (k > 0), k * 2.3 + v, 0))
        for i in range(5):
            a = i * 1.3 + k
            h = 0.12 + 0.1 * m.rng.random()
            blade(m, c + Vector(polar(0.015, a, 0)), c + Vector(polar(0.07 + 0.04 * m.rng.random(), a + 0.4, h)), 0.012,
                  ("#b8a860", "#a89a50", "#c8b878", "#98a058")[(i + k) % 4])
    clamp_ground(m)


def build_red_gravel(m, v):
    for i in range(6 + v):
        s = 0.03 + 0.035 * m.rng.random()
        st = len(m.vertices)
        m.blob((0, 0, 0), (s, s * 0.8, s * 0.5), (RED_ROCK + SALMON)[(i + v) % 7], n=4, jitter=0.2)
        xform(m, st, rot=(0, 0, i), offset=polar(0.25 * ((i * 0.618) % 1) + 0.03, i * 2.4 + v, s * 0.2))
    clamp_ground(m)


# ================================ ground =====================================
def build_cottonwood(m, v):
    h = 1.25 + 0.2 * v
    lean = 0.12 * (1 if v else -1)
    trunk = [Vector((0, 0, 0)), Vector((lean * 0.3, 0.02, h * 0.35)), Vector((lean * 0.8, 0, h * 0.62))]
    m.tube(trunk, [0.09, 0.07, 0.05], "#6a5a4a", n=5)
    top = trunk[-1]
    for k, (a, l) in enumerate(((0.4, 0.32), (2.4, 0.3), (4.3, 0.28))):
        end = top + Vector(polar(l, a + v, 0.25))
        m.tube([top, end], [0.04, 0.02], "#6a5a4a", n=4)
    for i in range(6):
        a = i * TAU / 6 + 0.5 * v
        c = top + Vector(polar(0.24 + 0.06 * (i % 2), a, 0.32 + 0.08 * ((i * 2) % 3)))
        m.blob(c, (0.22, 0.22, 0.17), COTTON_LEAF[(i + v) % 4], n=6, jitter=0.18)
    m.blob(top + Vector((0, 0, 0.55)), (0.24, 0.24, 0.18), COTTON_LEAF[v], n=6, jitter=0.15)
    for i in range(3):
        m.blob(polar(0.1, i * 2.1, 0.02), (0.05, 0.04, 0.03), "#5a4a3a", n=4)


def build_yucca(m, v):
    m.lathe((0, 0, 0), [(0, 0.08), (0.08, 0.07), (0.14, 0.04)], "#6a7a4a", n=5)
    for i in range(14 + 3 * v):
        a = i * 2.4
        lift = 0.22 + 0.18 * ((i * 0.618) % 1)
        blade(m, (0, 0, 0.1), polar(0.18 + 0.06 * (i % 3), a, 0.1 + lift), 0.022, SAGE[i % 3])
    if v:
        stalk = [Vector((0.02, 0, 0.12)), Vector((0.04, 0.01, 0.6)), Vector((0.05, 0.01, 0.95))]
        m.tube(stalk, [0.012, 0.01, 0.006], "#8a7a4a", n=4)
        for k in range(5):
            m.blob(Vector((0.05, 0.01, 0.62 + 0.07 * k)) + Vector(polar(0.035, k * 2.1, 0)), (0.03, 0.03, 0.035),
                   "#f0ead0", n=4)


def build_sagebrush(m, v):
    for i in range(5 + v):
        c = Vector(polar(0.12 * (i > 0), i * 2.4 + v, 0.12 + 0.04 * (i % 2)))
        m.tube([(c.x * 0.3, c.y * 0.3, 0), c], [0.02, 0.012], "#6a5a48", n=3)
        m.blob(c + Vector((0, 0, 0.05)), (0.11, 0.1, 0.08), SAGE[(i + v) % 3], n=5, jitter=0.25)
    clamp_ground(m)


def build_hoodoo(m, v):
    h = 1.1 + 0.25 * v
    s = len(m.vertices)
    prof = [(0, 0.34), (h * 0.18, 0.26), (h * 0.32, 0.22), (h * 0.5, 0.17), (h * 0.66, 0.2), (h * 0.82, 0.14),
            (h * 0.92, 0.12)]
    start = len(m.faces)
    m.lathe((0, 0, 0), prof, RED_ROCK[0], n=7, jitter=0.16)
    for b in range(len(prof) - 1):
        for i in range(7):
            idx = start + 1 + b * 7 + i
            col = (RED_ROCK + SALMON)[(b * 2 + (i % 2) * (b % 2)) % 7]
            m.colors[idx] = tuple(linear(col)) + (1,)
    wobble(m, s, 0.025, freq=5, phase=v)
    # the cap rock that keeps it standing
    m.blob((0.02, 0, h + 0.03), (0.24, 0.2, 0.08), CREAM[v], n=6, jitter=0.15)


def build_cairn(m, v):
    z = 0.0
    for k in range(4 + v):
        r = 0.16 - 0.025 * k
        hh = 0.07 + 0.02 * (k % 2)
        st = len(m.vertices)
        m.blob((0, 0, 0), (r, r * 0.85, hh / 2), (SALMON + CREAM + RED_ROCK)[(k * 2 + v) % 9], n=6, jitter=0.15)
        xform(m, st, rot=(0.08 * (k % 2), 0.06 * ((k + 1) % 2), k * 1.3), offset=(0.015 * math.sin(k * 2), 0, z + hh / 2))
        z += hh * 0.92
    clamp_ground(m)


def build_petroglyph_boulder(m, v):
    s = len(m.vertices)
    m.blob((0, 0, 0.22), (0.38, 0.3, 0.26), DESERT_VARNISH, n=7, jitter=0.12)
    clamp_ground(m, s)
    # pecked figures on the dark varnish of its front (-Y): spirals, a bighorn, hand prints
    pale = "#d8b088"
    face = Vector((0, -0.29, 0.26))
    m.ring(face + Vector((-0.12, -0.01, 0.02)), 0.07, 0.008, pale, n=8, section=3, vertical=True, yaw=0)
    m.ring(face + Vector((-0.12, -0.01, 0.02)), 0.035, 0.007, pale, n=6, section=3, vertical=True, yaw=0)
    body = face + Vector((0.1, -0.012, 0.0))
    m.box(body, (0.12, 0.012, 0.035), pale)
    for x in (-0.04, 0.04):
        m.box(body + Vector((x, 0, -0.05)), (0.012, 0.012, 0.07), pale)
    m.tube([body + Vector((0.06, 0, 0.02)), body + Vector((0.09, 0, 0.07)), body + Vector((0.06, 0, 0.1))],
           0.008, pale, n=3)
    if v:
        for k in range(3):
            m.box(face + Vector((-0.2 + 0.1 * k, -0.005, -0.12 + 0.02 * k)), (0.035, 0.012, 0.045), pale)


def build_clay_pots(m, v):
    for k in range(2 + v):
        c = polar(0.17 * (k > 0), k * 2.4 + 0.4, 0)
        r = 0.1 + 0.03 * (k == 0)
        h = 0.2 + 0.06 * (k == 0)
        m.lathe(c, [(0, r * 0.5), (h * 0.35, r), (h * 0.75, r * 0.8), (h * 0.9, r * 0.45), (h, r * 0.5)],
                POT[k % 3], n=7, jitter=0.04, colors=[POT[k % 3], POT_PAINT, POT[(k + 1) % 3], POT[k % 3]])
    if v:
        st = len(m.vertices)
        m.lathe((0, 0, 0), [(0, 0.06), (0.12, 0.1), (0.2, 0.08)], POT[2], n=6)
        xform(m, st, rot=(1.4, 0, 0.6), offset=(-0.2, -0.18, 0.08))
        clamp_ground(m, st)


def build_luminaria(m, v):
    for k in range(3 + v):
        c = Vector(polar(0.2 * (k > 0), k * 2.1 + v * 0.5, 0))
        m.box(c + Vector((0, 0, 0.005)), (0.13, 0.13, 0.01), SAND_LIGHT, tilt=k * 0.4)
        start = len(m.faces)
        m.box(c + Vector((0, 0, 0.09)), (0.1, 0.1, 0.16), PAPER, tilt=k * 0.4)
        m.glows[start:] = [True] * (len(m.faces) - start)   # the paper glows from the candle inside
        flame(m, c + Vector((0, 0, 0.175)), 0.05, "#ffc070", r=0.03)


# ============================ lip, wall, water ===============================
def build_hanging_garden(m, v):
    m.blob((0, -0.1, 0.02), (0.36, 0.12, 0.04), "#5a7a32", n=6)
    for i in range(7 + v):
        x = -0.34 + 0.68 * i / (6 + v)
        drop = 0.25 + 0.35 * ((i * 0.618) % 1)
        col = ("#5a8a3a", "#6a9a42", "#4a7a32", "#7aa048")[i % 4]
        ribbon(m, [(x, -0.06, 0.04), (x + 0.02, 0.05, 0.02), (x - 0.02, 0.08, -drop * 0.5), (x + 0.02, 0.07, -drop)],
               (1, 0, 0), 0.07, col)
        if i % 3 == 0:
            m.blob((x, 0.1, -drop * 0.55), (0.035, 0.03, 0.03), ("#e8d870", "#f0a0c0")[(i + v) % 2], n=4)
    # a seep: a dark wet streak down the cliff
    ribbon(m, [(0.05 * v, 0.02, 0.0), (0.05 * v, 0.03, -0.4)], (1, 0, 0), 0.12, "#5a3424")
    clamp_lip(m)


def build_petroglyph_panel(m, v):
    w, h = 0.8, 0.6
    m.box((0, 0.01, 0), (w, 0.02, h), DESERT_VARNISH)
    pale = "#e0b890"
    y = 0.025
    # a row of figures: people with raised arms, a spiral, a sun, bighorn sheep
    for k in range(3):
        x = -0.28 + 0.12 * k
        m.box((x, y, -0.05), (0.025, 0.012, 0.12), pale)
        m.box((x, y, 0.03), (0.09, 0.012, 0.02), pale)
        m.box((x, y, 0.035 + 0.04), (0.03, 0.012, 0.03), pale)
    m.ring((0.2, y, 0.12), 0.08, 0.01, pale, n=10, section=3, vertical=True, yaw=0)
    m.ring((0.2, y, 0.12), 0.04, 0.009, pale, n=8, section=3, vertical=True, yaw=0)
    for k in range(2 + v):
        x = 0.05 + 0.13 * k - 0.15 * v
        m.box((x, y, -0.18), (0.08, 0.012, 0.03), pale)
        m.box((x - 0.025, y, -0.22), (0.01, 0.012, 0.05), pale)
        m.box((x + 0.025, y, -0.22), (0.01, 0.012, 0.05), pale)
        m.box((x + 0.05, y, -0.15), (0.015, 0.012, 0.05), pale)
    flatten_back(m)


def build_river_reeds(m, v):
    m.lathe((0, 0, -0.06), [(0, 0.18), (0.06, 0.14), (0.08, 0)], "#5a6a3a", n=6, jitter=0.2)
    for i in range(10 + 3 * v):
        a = i * 2.4 + v
        base = polar(0.03 + 0.1 * ((i * 0.618) % 1), a, 0.0)
        tip = polar(0.08 + 0.12 * ((i * 0.618) % 1), a + 0.2, 0.4 + 0.25 * m.rng.random())
        blade(m, base, tip, 0.015, REED[i % 3])
        if i % 4 == 0:
            m.tube([Vector(tip) * 0.85, Vector(tip) * 0.85 + Vector((0, 0, 0.1))], 0.018, "#5a3a24", n=4)


# ================================ landmarks ==================================
def build_cliff_dwelling(m, v):
    # an alcove in a sandstone cliff: a back wall in strata and a deep overhang over the rooms
    rock = len(m.vertices)
    for k, (z, h, d) in enumerate(((0.0, 0.7, 0.42), (0.7, 0.6, 0.36), (1.3, 0.45, 0.3))):
        m.box((0, 0.8 - 0.04 * k, z + h / 2), (2.3 - 0.1 * k, d + 0.2, h), RED_ROCK[k], jitter=0.05)
    m.box((0, 0.3, 1.86), (2.3, 1.2, 0.32), SALMON[0], jitter=0.06)
    m.box((0, 0.36, 2.08), (2.1, 1.0, 0.14), CREAM[0], jitter=0.04)
    wobble(m, rock, 0.03, freq=2.2)
    clamp_ground(m, rock)
    # rooms: boxes with dark doors and roof beams sticking out
    for k, (x, y, w, h) in enumerate(((-0.65, 0.0, 0.55, 0.62), (0.05, -0.1, 0.65, 0.9), (0.72, 0.05, 0.45, 0.55))):
        m.box((x, y, h / 2), (w, 0.6, h), ADOBE[k % 3])
        m.box((x, y - 0.305, h * 0.38), (0.16, 0.02, 0.28 if k != 1 else 0.36), ADOBE_DARK)
        for b in range(3):
            m.tube([(x - w / 2 + 0.1 + b * (w - 0.2) / 2, y - 0.2, h - 0.04), (x - w / 2 + 0.1 + b * (w - 0.2) / 2, y - 0.42, h - 0.06)],
                   0.022, WOOD, n=4)
    # a round tower and a ladder up to the tall room's roof
    m.lathe((-1.05, -0.3, 0), [(0, 0.22), (0.8, 0.2), (0.82, 0.0)], ADOBE[2], n=8)
    m.box((-1.05, -0.51, 0.45), (0.08, 0.02, 0.1), ADOBE_DARK)
    for s in (-1, 1):
        m.tube([(0.05 + s * 0.12, -0.75, 0.0), (0.05 + s * 0.12, -0.45, 1.15)], 0.02, WOOD, n=4)
    for k in range(5):
        t = (k + 1) / 6
        m.tube([(-0.07, -0.75 + 0.3 * t, 1.15 * t), (0.17, -0.75 + 0.3 * t, 1.15 * t)], 0.012, WOOD, n=3)
    for i in range(2):
        m.lathe(polar(0.6, -1.2 - 0.5 * i, 0) if i else (0.95, -0.55, 0),
                [(0, 0.09), (0.1, 0.13), (0.2, 0.09), (0.24, 0.05)], POT[i], n=6)


def build_canyon_arch(m, v):
    pts = [Vector((-1.05, 0, 0)), Vector((-1.05, 0, 0.9)), Vector((-0.85, 0, 1.7)), Vector((-0.32, 0, 2.1)),
           Vector((0.32, 0, 2.1)), Vector((0.85, 0, 1.7)), Vector((1.05, 0, 0.9)), Vector((1.05, 0, 0))]
    radii = [0.42, 0.36, 0.32, 0.28, 0.28, 0.32, 0.38, 0.44]
    cols = [RED_ROCK[0], RED_ROCK[1], SALMON[0], SALMON[1], SALMON[0], RED_ROCK[3], RED_ROCK[2]]
    s = len(m.vertices)
    for k in range(len(pts) - 1):
        m.tube([pts[k], pts[k + 1]], [radii[k], radii[k + 1]], cols[k], n=7)
    wobble(m, s, 0.05, freq=2.5)
    clamp_ground(m, s)
    # a cream cap along the top of the span and rubble at its feet
    m.blob((0, 0, 2.35), (0.6, 0.32, 0.1), CREAM[1], n=6)
    for i in range(5):
        side = 1 if i % 2 else -1
        m.blob((side * (1.05 + 0.08 * i), 0.55 * (1 if i < 3 else -1), 0.06), (0.13, 0.11, 0.08), (RED_ROCK + SALMON)[i], n=5)


def build_balanced_rock(m, v):
    # a slender red pedestal with a huge cream boulder on top
    s = len(m.vertices)
    prof = [(0, 0.55), (0.3, 0.42), (0.7, 0.3), (1.1, 0.22), (1.35, 0.2), (1.45, 0.25)]
    start = len(m.faces)
    m.lathe((0, 0, 0), prof, RED_ROCK[0], n=8, jitter=0.12)
    for b in range(len(prof) - 1):
        for i in range(8):
            m.colors[start + 1 + b * 8 + i] = tuple(linear((RED_ROCK + SALMON)[(b + (i % 2)) % 7])) + (1,)
    wobble(m, s, 0.04, freq=3)
    m.blob((0.08, 0, 1.95), (0.8, 0.68, 0.55), CREAM[0], n=8, jitter=0.1)
    m.blob((0.0, 0.05, 1.55), (0.6, 0.5, 0.15), SALMON[1], n=7, jitter=0.1)
    for i in range(4):
        m.blob(polar(0.85 + 0.15 * (i % 2), i * 1.7 + 0.3, 0.06), (0.16, 0.13, 0.09), (RED_ROCK + SALMON)[i], n=5)
