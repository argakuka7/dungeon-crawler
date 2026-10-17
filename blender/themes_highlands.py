"""Theme builders: Prayer highlands (see themes.py).

A high, hilly, windy grassland under a deep blue sky: prayer flags (lungta) in the fixed
order blue, white, red, green, yellow; whitewashed chortens with maroon and gold; carved
mani stones; yak-hair tents. Sacred pieces are built to be looked at and walked around,
not broken. Every builder is build_<prop>(m, variant) on a props.Mesh in attachment space;
m.anchors collects string anchor points (Blender space).
"""
import math
from pathlib import Path
import sys

from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from props import WOOD, BARK  # noqa: E402
from themes_geo import *  # noqa: E402,F401,F403


def lungta(i):
    return LUNGTA[i % 5]


def stones(m, count, radius, colors=SCREE, z=0.0, size=0.08, flat=0.5):
    for i in range(count):
        r = size * m.rng.uniform(0.7, 1.2)
        m.blob(polar(radius * ((i * 0.618) % 1) + 0.02, i * 2.4 + m.rng.random(), z + r * flat * 0.6),
               (r, r * 0.8, r * flat), colors[i % len(colors)], n=6, jitter=0.18)


# --- cover --------------------------------------------------------------------
def build_tussock_grass(m, v):
    m.lathe((0, 0, 0), [(0, 0.12), (0.03, 0.09), (0.05, 0)], "#6a6a3c", n=6, jitter=0.2)
    for i in range(11 + 2 * v):
        a = i * 2.4 + v
        tip = polar(0.1 + 0.14 * m.rng.random(), a + 0.3, 0.17 + 0.11 * m.rng.random())
        blade(m, polar(0.035, a, 0.02), tip, 0.022, ("#b8a868", TURF, "#c8b878", "#7a7a42")[i % 4])


def build_scree_patch(m, v):
    for i in range(6 + 2 * v):
        c = polar(0.24 * ((i * 0.618) % 1) + 0.05 * (i > 0), i * 2.4 + v)
        outline = ngon(m, c, 0.06 + 0.035 * m.rng.random(), 4 + i % 3, jitter=0.25, phase=m.rng.random() * 6)
        tops = [0.02 + 0.04 * m.rng.random() for _ in outline]
        prism(m, outline, 0.0, tops, SCREE[i % 4], top=SCREE[(i + 1) % 4])


def build_lungta_scraps(m, v):
    for i in range(9 + 3 * v):
        c = Vector(polar(0.3 * ((i * 0.618) % 1) + 0.02, i * 2.4 + v * 0.7, 0.004 + 0.003 * (i % 3)))
        a = m.rng.random() * TAU
        s = 0.05 + 0.015 * m.rng.random()
        pts = [tuple((c + Vector(polar(s * 0.72, a + k * TAU / 4 + 0.785)))[:2]) for k in range(4)]
        prism(m, pts, c.z, c.z + 0.004, lungta(i))
    pebble(m, polar(0.12, 0.8 + v), 0.05, SCREE[0])
    pebble(m, polar(0.2, 3.6 + v), 0.04, SCREE[2])


# --- ground -------------------------------------------------------------------
def build_blue_poppy(m, v):
    for i in range(6):
        blade(m, (0, 0, 0.01), polar(0.14 + 0.03 * (i % 2), i * TAU / 6 + v, 0.05), 0.035,
              ("#7a8a6a", "#8a9a78")[i % 2])
    for i in range(2 + v):
        x, y, _ = polar(0.09 * (i > 0) + 0.02 * i, i * 2.6 + v)
        h = 0.34 + 0.08 * m.rng.random()
        top = Vector((x + 0.03, y + 0.01, h))
        m.tube([(x, y, 0), (x + 0.02, y, h * 0.7), top + Vector((0.02, 0, -0.02))], [0.009, 0.008, 0.006],
               "#7a8a5a", n=4)
        centre = top + Vector((0.02, 0, -0.04))
        for k in range(4):
            a = k * TAU / 4 + i
            tip = centre + Vector(polar(0.075, a, -0.05))
            blade(m, centre + Vector((0, 0, 0.01)), tip, 0.04, ("#4a7ae0", "#6a9af0")[k % 2])
        m.box(centre + Vector((0, 0, -0.005)), (0.025, 0.025, 0.03), "#f2c230")


def build_juniper_shrub(m, v):
    for i in range(3):
        a = i * 2.1 + v
        m.tube([(0, 0, 0), polar(0.12, a, 0.08), polar(0.22, a + 0.3, 0.12)], [0.035, 0.025, 0.012],
               "#5a4632", n=4)
    for i in range(4 + v):
        c = polar(0.2 * (i > 0), i * 2.2 + v, 0.13 + 0.05 * (i % 2))
        m.blob(c, (0.2 - 0.02 * i, 0.17, 0.11), ("#3e5a3a", "#4a6a42", "#36503a", "#56724a")[i % 4], n=7,
               jitter=0.2)
    for i in range(5):
        m.box(polar(0.25, i * 1.3 + v, 0.2 + 0.04 * (i % 2)), (0.03, 0.03, 0.03), "#5a6a8a", tilt=i)


def build_mani_stones(m, v):
    z = 0.0
    for i in range(4 + v):
        r = 0.36 - 0.06 * i
        s = len(m.vertices)
        m.lathe((0, 0, 0), [(0, r * 0.95), (0.04, r), (0.07, r * 0.85)], SCREE[i % 4], n=7, jitter=0.18)
        xform(m, s, rot=(m.rng.uniform(-0.12, 0.12), m.rng.uniform(-0.12, 0.12), 0),
              offset=(m.rng.uniform(-0.04, 0.04), m.rng.uniform(-0.04, 0.04), z))
        z += 0.065
    paint = ("#c84a3a", "#3a6ac0", "#e0b030", "#3a9a5a")
    for i in range(2 + v):
        a = i * 2.2 + 0.4 + v
        x, y, _ = polar(0.16, a)
        tablet(m, (x, y, z - 0.05 * i), 0.26 - 0.03 * i, 0.06, a + math.pi / 2, 0.0, paint[(i + v) % 4],
               "#f2f0e6", depth=0.16, rows=1)
    tablet(m, (0.0, -0.12, 0.0), 0.3, 0.38 + 0.06 * v, 0.1 - 0.2 * v, -0.2, "#9a9284", "#f2f0e6", rows=3)
    tablet(m, (0.16, 0.14, 0.0), 0.22, 0.28, 2.6, -0.15, ("#3a6ac0", "#c84a3a")[v], "#f2f0e6", rows=2)


def build_lhatse(m, v):
    m.lathe((0, 0, 0), [(0, 0.4), (0.12, 0.36), (0.28, 0.26), (0.42, 0.12), (0.5, 0)], "#8a8278", n=7,
            jitter=0.2, colors=["#7a7268", "#8a8278", "#a09888", "#8a8278"])
    for i in range(3):
        a, h = i * 2.4 + v, 0.08 + 0.3 * ((i * 0.37) % 1)
        rr = 0.36 - h * 0.5
        m.blob(polar(rr, a, h), (0.07, 0.06, 0.05), SCREE[i % 4], n=4)
    tips = []
    for i in range(3 + v):
        a = i * TAU / (3 + v) + 0.4
        h = 1.05 + 0.25 * ((i * 0.618) % 1) + (0.25 if i == 0 else 0)
        base, tip = Vector(polar(0.05, a, 0.4)), Vector(polar(0.24, a, h))
        m.tube([base, tip], [0.018, 0.01], ("#8a6a48", "#6e5236")[i % 2], n=4)
        tips.append(tip)
        for k in range(2 + (i == 0)):
            p = base.lerp(tip, 0.6 + k * 0.15)
            d = Vector(polar(1, a + math.pi / 2))
            sheet(m, p, d * 0.12, Vector((0, 0, -0.1)) + Vector(polar(0.02, a)), lungta(k + i * 3),
                  cols=1, rows=1, wave=0.015, phase=k)
    # white khata scarves knotted round the sticks
    for i in range(2):
        p = tips[i].lerp(Vector((0, 0, 0.4)), 0.6)
        ribbon(m, [p, p + Vector((0.05, 0.03, -0.12)), p + Vector((0.08, 0.02, -0.3))], (0, 1, 0), 0.06, "#f6f4ee")
    # yak horns on the cairn
    for s in (-1, 1):
        m.tube([(s * 0.04, 0, 0.47), (s * 0.15, -0.02, 0.52), (s * 0.2, 0.0, 0.62)], [0.03, 0.022, 0.006],
               "#d8ccb0", n=4)
    m.blob((0, 0, 0.47), (0.08, 0.06, 0.05), BONE, n=4)
    m.anchors.append(tuple(tips[0]))


def build_tharchok(m, v):
    h = 2.3 + 0.3 * v
    m.lathe((0, 0, 0), [(0, 0.3), (0.12, 0.26), (0.24, 0.16), (0.3, 0)], "#8a8278", n=7, jitter=0.2,
            colors=["#7a7268", "#a09888", "#8a8278"])
    pole = ("#8a6a48", WHITEWASH)[v]
    m.tube([(0, 0, 0.1), (0.01, 0, h)], [0.035, 0.025], pole, n=6)
    if v == 0:
        # three long darchen banners down the pole, and a gold trident finial
        for k in range(3):
            a = k * TAU / 3 + 0.3
            d = Vector(polar(1, a))
            top = Vector((0, 0, h - 0.18 - 0.05 * k)) + d * 0.025
            sheet(m, top, d * 0.2, Vector((0, 0, -1.25 + 0.15 * k)), (LUNGTA[0], LUNGTA[4], LUNGTA[2])[k],
                  cols=3, rows=4, wave=0.03, phase=k,
                  colors=lambda c, r, k=k: ("#f2f0e6" if r == 0 else (LUNGTA[0], LUNGTA[4], LUNGTA[2])[k]))
        m.lathe((0, 0, h), [(0, 0.04), (0.05, 0.05), (0.08, 0)], GOLD, n=6)
        for s in (-1, 0, 1):
            m.tube([(0, 0, h + 0.06), (s * 0.06, 0, h + 0.12), (s * 0.06, 0, h + 0.22 - 0.04 * abs(s))],
                   [0.012, 0.01, 0.004], GOLD, n=4)
        m.blob((0, 0, h - 0.06), (0.05, 0.05, 0.08), YAK, n=5)
    else:
        # a juniper bundle on top and short strings of flags sloping down
        m.blob((0, 0, h + 0.06), (0.09, 0.09, 0.12), "#3e5a3a", n=6, jitter=0.25)
        for k in range(4):
            a = k * TAU / 4 + 0.6
            p = Vector((0, 0, h - 0.08 - 0.32 * k))
            q = p + Vector(polar(0.4, a, -0.38))
            m.tube([p, q], 0.005, COTTON, n=3)
            for j in range(4):
                c = p.lerp(q, 0.12 + j * 0.22)
                sheet(m, c, (q - p).normalized() * 0.08, Vector((0, 0, -0.1)), lungta(j + k),
                      cols=1, rows=1, wave=0.01)
    m.anchors.append((0.01, 0, h - 0.05))


def chorten(m, base, steps, dome, spire, colors=(WHITEWASH, WHITEWASH_SHADE), trim=MAROON, bands=True, rings=4):
    """A Tibetan chorten: square steps, a bell-shaped dome, a harmika and a gold ringed spire.
    Returns the top of the spire. base: half width of the bottom step; dome: radius."""
    z, w = 0.0, base
    for i in range(steps):
        hgt = 0.9 * base / (steps + 1)
        m.box((0, 0, z + hgt / 2), (2 * w, 2 * w, hgt), colors[i % 2])
        z += hgt
        if bands and i == steps - 1:
            m.box((0, 0, z - hgt * 0.15), (2 * w + 0.01, 2 * w + 0.01, hgt * 0.22), trim)
        w *= 0.84
    r = dome
    m.lathe((0, 0, z), [(0, r * 0.82), (r * 0.15, r * 0.92), (r * 0.5, r), (r * 0.95, r * 0.96), (r * 1.15, r * 0.7)],
            WHITEWASH, n=8, jitter=0.0, colors=[WHITEWASH_SHADE, WHITEWASH, WHITEWASH, WHITEWASH])
    z += r * 1.15
    hw = r * 0.42
    m.box((0, 0, z + hw * 0.4), (2 * hw, 2 * hw, hw * 0.8), trim)
    m.box((0, 0, z + hw * 0.9), (2 * hw * 1.2, 2 * hw * 1.2, hw * 0.2), WHITEWASH)
    z += hw
    prof = []
    for i in range(rings):
        rr = hw * (0.75 - 0.5 * i / rings)
        prof += [(spire * i / rings, rr), (spire * (i + 0.7) / rings, rr * 0.8)]
    prof.append((spire, hw * 0.25))
    m.lathe((0, 0, z), prof, GOLD, n=6, jitter=0.0, colors=[GOLD, GOLD_DARK])
    z += spire
    m.lathe((0, 0, z), [(0, hw * 0.25), (hw * 0.15, hw * 0.9), (hw * 0.3, hw * 0.3)], GOLD, n=6, jitter=0)
    z += hw * 0.3
    m.blob((0, 0, z + hw * 0.18), (hw * 0.18, hw * 0.18, hw * 0.18), GOLD, n=6, jitter=0)
    m.ring((0, 0, z + hw * 0.42), hw * 0.16, hw * 0.05, GOLD, n=6, vertical=True, yaw=math.pi / 2)
    return z + hw * 0.6


def build_chorten_small(m, v):
    top = chorten(m, 0.3, 3 + v, 0.19 + 0.02 * v, 0.42 + 0.08 * v)
    if v:
        for s in (-1, 1):
            m.box((s * 0.25, 0, 0.27), (0.04, 0.18, 0.04), MAROON)
    m.anchors.append((0, 0, top))


def build_prayer_wheel(m, v):
    m.box((0, 0, 0.08), (0.42, 0.42, 0.16), "#9a9284" if v else WHITEWASH)
    m.box((0, 0, 0.17), (0.34, 0.34, 0.03), MAROON)
    m.tube([(0, 0, 0.18), (0, 0, 1.0 + 0.1 * v)], 0.018, IRON, n=4)
    z0, hh, r = 0.36, 0.42, 0.16
    m.lathe((0, 0, z0), [(0, r * 0.9), (0.04, r), (hh - 0.04, r), (hh, r * 0.9)], TIBET_RED, n=10, jitter=0,
            colors=[GOLD, TIBET_RED, GOLD])
    for k in range(10):
        a = k * TAU / 10
        letters(m, polar(r + 0.004, a, z0 + 0.25), polar(1, a + math.pi / 2), (0, 0, 1), 1, 0.05, GOLD)
    m.lathe((0, 0, z0 + hh), [(0, r * 0.7), (0.06, 0.03)], GOLD, n=8, jitter=0)
    m.box(polar(r + 0.03, 0.3, z0 + 0.08), (0.03, 0.03, 0.06), IRON)
    if v == 0:
        for s in (-1, 1):
            m.tube([(s * 0.18, 0, 0.18), (s * 0.18, 0, 1.0)], 0.025, MAROON, n=4)
        m.box((0, 0, 1.0), (0.48, 0.3, 0.05), MAROON)
        m.lathe((0, 0, 1.02), [(0, 0.32), (0.1, 0.0)], GOLD_DARK, n=4, jitter=0, phase=math.pi / 4)
        m.box((0, 0, 1.13), (0.04, 0.04, 0.05), GOLD)
    else:
        ribbon(m, [(0.02, 0.0, 0.97), (0.06, -0.06, 0.88), (0.09, -0.07, 0.62)], (1, 0, 0), 0.06, "#f6f4ee")
        m.lathe((0, 0, 1.08), [(0, 0.03), (0.02, 0.06), (0.06, 0.0)], GOLD, n=6)


def build_butter_lamps(m, v):
    if v == 0:
        m.box((0, 0, 0.09), (0.66, 0.3, 0.18), WHITEWASH)
        m.box((0, 0, 0.19), (0.7, 0.34, 0.03), MAROON)
        spots = [(x, y, 0.205) for x in (-0.22, 0.0, 0.22) for y in (-0.07, 0.07)]
    else:
        stones(m, 3, 0.3, size=0.07)
        spots = [polar(0.2 + 0.06 * (k % 2), k * TAU / 5, 0.0) for k in range(5)]
    for i, (x, y, z) in enumerate(spots):
        m.lathe((x, y, z), [(0, 0.02), (0.02, 0.014), (0.045, 0.04), (0.065, 0.045)], BRASS, n=5, jitter=0.03,
                colors=[BRASS, BRASS, WAX])
        flame(m, (x, y, z + 0.065), 0.07 + 0.015 * (i % 3), "#ffc060", r=0.018)


def build_sang_burner(m, v):
    m.lathe((0, 0, 0), [(0, 0.18), (0.08, 0.22), (0.3, 0.24), (0.45, 0.18), (0.52, 0.2), (0.56, 0.17)],
            WHITEWASH, n=8, jitter=0.03, colors=[WHITEWASH_SHADE, WHITEWASH, WHITEWASH, "#8a8070", "#5a5048"])
    m.lathe((0, 0, 0.53), [(0, 0.15), (0.03, 0.12)], "#3a302a", n=8)
    start = len(m.faces)
    for i in range(4):
        m.box(polar(0.07, i * 1.7, 0.575), (0.05, 0.05, 0.03), "#ff9a50", tilt=i)
    lit(m, start)
    for i in range(4):
        m.tube([polar(0.04, i * 1.6, 0.56), polar(0.11, i * 1.6 + 0.3, 0.62)], [0.012, 0.004], "#3e5a3a", n=3)
    for i in range(3 + v):
        h = 0.68 + i * 0.17
        r = 0.05 + 0.02 * i
        m.blob((0.07 * i * (1 - 2 * v), 0.03 * i, h), (r, r * 0.8, r * 0.75),
               ("#f4f2ee", "#eceae4", "#e2e0da", "#d8d6d0")[i], n=5, jitter=0.25)
    if v:
        m.box((0, -0.235, 0.32), (0.12, 0.02, 0.1), MAROON)


def build_yak_skull(m, v):
    stones(m, 3 + v, 0.25, size=0.12, flat=0.4)
    s = len(m.vertices)
    m.blob((0, 0, 0.12), (0.12, 0.13, 0.1), BONE, n=6, jitter=0.06)
    m.lathe((0, -0.06, 0.1), [(0, 0.08), (0.16, 0.06), (0.26, 0.035)], BONE, n=6, axis=(0, -1, -0.3))
    for side in (-1, 1):
        m.box((side * 0.06, -0.1, 0.13), (0.04, 0.04, 0.04), "#3a342c")
        m.tube([(side * 0.08, 0.04, 0.2), (side * 0.22, 0.05, 0.24), (side * 0.3, 0.0, 0.36),
                (side * 0.27, -0.04, 0.44)], [0.04, 0.03, 0.018, 0.005], "#cfc3a8", n=5)
    # painted mantra on the brow
    letters(m, (-0.06, -0.12, 0.2), (1, 0, 0), (0, 0.4, 1), 4, 0.025, ("#c84a3a", "#3a6ac0")[v])
    xform(m, s, rot=(0.15, 0, 0.4 - 0.8 * v), offset=(0, 0, 0.06 + 0.02 * v))


# --- lip / wall / water ------------------------------------------------------
def build_khata_drape(m, v):
    m.blob((0.05 - 0.1 * v, -0.14, 0.03), (0.12, 0.1, 0.07), SCREE[2], n=6)
    for i in range(2 + v):
        x = -0.25 + 0.25 * i + 0.05 * v
        drop = 0.45 + 0.15 * ((i + v) % 2)
        ribbon(m, [(x, -0.18, 0.07), (x + 0.02, -0.05, 0.08), (x, 0.05, 0.03), (x + 0.03, 0.07, -drop * 0.5),
                   (x - 0.02, 0.09, -drop)], (1, 0, 0), 0.1, "#f6f4ee")
    clamp_lip(m)


def build_flag_drape(m, v):
    m.tube([(-0.45, 0.03, 0.03), (0.45, 0.03, 0.03)], 0.006, COTTON, n=3)
    for s in (-1, 1):
        m.blob((s * 0.42, -0.08, 0.03), (0.07, 0.07, 0.05), SCREE[1], n=5)
    for i in range(5):
        x = -0.4 + i * 0.165
        sheet(m, (x, 0.035, 0.02), (0.14, 0, 0), (0, 0.04, -0.18), lungta(i), cols=2, rows=2, wave=0.012,
              phase=i)
    if v:
        m.tube([(-0.4, 0.06, -0.2), (0.45, 0.07, -0.42)], 0.005, COTTON, n=3)
        for i in range(5):
            p = Vector((-0.35 + i * 0.17, 0.065, -0.21 - i * 0.045))
            sheet(m, p, (0.13, 0, -0.03), (0, 0.03, -0.16), lungta(i), cols=2, rows=1, wave=0.01)
    clamp_lip(m)


def build_prayer_wheel_row(m, v):
    n = 4 + v
    w = 0.2 * n + 0.1
    m.box((0, 0.02, 0), (w, 0.04, 0.62), MAROON)
    m.box((0, 0.11, 0.33), (w + 0.06, 0.22, 0.05), WHITEWASH)
    m.box((0, 0.11, -0.33), (w + 0.06, 0.22, 0.05), "#6e5236")
    for i in range(n):
        x = -0.2 * (n - 1) / 2 + i * 0.2
        m.tube([(x, 0.12, -0.31), (x, 0.12, 0.31)], 0.008, IRON, n=3)
        m.lathe((x, 0.12, -0.2), [(0, 0.06), (0.03, 0.075), (0.37, 0.075), (0.4, 0.06)], TIBET_RED, n=6, jitter=0,
                colors=[GOLD, (TIBET_RED, "#c8a040")[(i + v) % 2], GOLD])
        letters(m, (x - 0.03, 0.12 - 0.077, 0.02), (1, 0, 0), (0, 0, 1), 3, 0.018, GOLD)
    flatten_back(m)


def build_tsatsa_niche(m, v):
    w, h = 0.6, 0.55
    m.box((0, 0.03, 0), (w + 0.12, 0.06, h + 0.12), WHITEWASH)
    m.box((0, 0.08, h / 2 + 0.03), (w + 0.16, 0.12, 0.08), MAROON)
    m.box((0, 0.1, -h / 2 + 0.02), (w + 0.04, 0.16, 0.05), WHITEWASH_SHADE)
    for s in (-1, 1):
        m.box((s * (w / 2 + 0.02), 0.09, 0), (0.06, 0.12, h), WHITEWASH)
    m.box((0, 0.065, 0), (w, 0.01, h), "#5a4a3c")
    for row in range(2):
        z = -h / 2 + 0.05 + row * 0.24
        if row:
            m.box((0, 0.1, z - 0.01), (w, 0.14, 0.025), "#6e5236")
        for i in range(5 - row + v):
            x = -w / 2 + 0.07 + i * (w - 0.14) / (4 - row + v)
            m.lathe((x, 0.1, z), [(0, 0.035), (0.04, 0.035), (0.07, 0.025), (0.13, 0.0)], CLAY, n=5, jitter=0.05,
                    colors=[CLAY, "#c48a5a", "#d0a070"])
    flatten_back(m)


def build_glacier_floe(m, v):
    for i in range(2 + v):
        c = polar(0.18 * (i > 0) + 0.04 * i, i * 2.5 + v)
        outline = ngon(m, c, 0.17 - 0.035 * i, 6, jitter=0.22, phase=m.rng.random())
        tops = [0.03 + 0.04 * m.rng.random() for _ in outline]
        prism(m, outline, -0.08, tops, "#6ac8d0", top="#eef8f8")


# --- line ---------------------------------------------------------------------
def build_flag_run(m, v):
    m.tube([(0, 0, 0), (0.5, 0, -0.002), (1, 0, 0)], 0.007, COTTON, n=3)
    for i in range(5):
        if v == 0:
            x, w, h = 0.015 + 0.2 * i, 0.17, 0.19
        else:
            x, w, h = 0.04 + 0.2 * i, 0.12, 0.26
        sheet(m, (x, 0, -0.008), (w, 0, 0), (0, 0, -h), lungta(i), cols=3, rows=2, wave=0.018, phase=i * 1.3)
        # the printed windhorse block, darker in the middle of the flag
        dark = tuple(max(0, int(lungta(i)[k:k + 2], 16) - 60) for k in (1, 3, 5))
        ink = "#%02x%02x%02x" % dark if i != 1 else "#a8a090"
        m.box((x + w / 2, -0.005, -h * 0.5), (w * 0.45, 0.004, h * 0.4), ink)


# --- landmarks ----------------------------------------------------------------
def build_chorten_great(m, v):
    # a broad stepped plinth, a red band with white stripes, a dome, a gold spire
    z, w = 0.0, 1.15
    for i, (hh, col) in enumerate(((0.22, WHITEWASH_SHADE), (0.24, WHITEWASH), (0.22, WHITEWASH_SHADE),
                                   (0.22, WHITEWASH))):
        m.box((0, 0, z + hh / 2), (2 * w, 2 * w, hh), col)
        z += hh
        w -= 0.13
    # steps up the front
    for k in range(3):
        y0 = -1.55 + k * 0.13
        m.box((0, (y0 - 1.15) / 2, (k + 1) * 0.075), (0.5, -1.15 - y0, (k + 1) * 0.15), "#c8bfa8")
    # red section with white stripes, like the photo
    hh = 0.42
    m.box((0, 0, z + hh / 2), (2 * w, 2 * w, hh), TIBET_RED)
    for k in range(5):
        x = -w + 0.12 + k * (2 * w - 0.24) / 4
        m.box((x, -w - 0.005, z + hh / 2), (0.05, 0.02, hh), "#f2f0e6")
        m.box((x, w + 0.005, z + hh / 2), (0.05, 0.02, hh), "#f2f0e6")
        m.box((-w - 0.005, x, z + hh / 2), (0.02, 0.05, hh), "#f2f0e6")
        m.box((w + 0.005, x, z + hh / 2), (0.02, 0.05, hh), "#f2f0e6")
    z += hh
    m.box((0, 0, z + 0.05), (2 * w + 0.08, 2 * w + 0.08, 0.1), WHITEWASH)
    z += 0.1
    # a niche with butter lamps in the red band
    m.box((0, -w - 0.01, z - 0.3), (0.34, 0.03, 0.28), "#3a2a22")
    start = len(m.faces)
    for x in (-0.09, 0, 0.09):
        m.box((x, -w - 0.03, z - 0.38), (0.03, 0.03, 0.05), "#ffd080")
    lit(m, start)
    s = len(m.vertices)
    top = chorten(m, 0.62, 2, 0.5, 0.95, bands=True, rings=6)
    xform(m, s, offset=(0, 0, z))
    top += z
    # stones and offerings at the foot
    for i in range(14):
        a = i * TAU / 14 + 0.2
        m.blob(polar(1.32 + 0.08 * (i % 2), a, 0.05), (0.1, 0.08, 0.07), SCREE[i % 4], n=5)
    for i in range(6):
        tablet(m, polar(1.38, 0.5 + i * 0.35 + math.pi, 0), 0.2, 0.22, 0.5 + i * 0.35 + math.pi / 2, -0.25,
               SCREE[i % 4], "#f2f0e6", rows=2)
    m.anchors.append((0, 0, top - 0.02))
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.anchors.append((sx * 0.75, sy * 0.75, z))


def build_nomad_tent(m, v):
    L, W, H = 0.95, 0.9, 0.88
    seg = 3
    for k in range(seg):
        x0, x1 = -L + 2 * L * k / seg, -L + 2 * L * (k + 1) / seg
        ridge, eave = H - 0.07 * (k == 1), 0.48 - 0.05 * (k == 1)
        outline = [(-W, 0), (W, 0), (W - 0.2, eave), (0.1, ridge), (-0.1, ridge), (-W + 0.2, eave)]
        extrude_x(m, outline, x0, x1, (YAK, YAK_LIGHT, YAK)[k], top=(YAK, YAK_LIGHT, YAK)[k])
    # white trim along the eaves
    for sy in (-1, 1):
        m.tube([(-L - 0.01, sy * (W - 0.2), 0.48), (0, sy * (W - 0.2), 0.43), (L + 0.01, sy * (W - 0.2), 0.48)],
               0.025, "#e8e4da", n=4)
    # the smoke slot along the ridge and a stove pipe
    m.box((0, 0, H - 0.02), (1.2, 0.18, 0.04), "#14110f")
    m.tube([(0.4, 0.05, H - 0.1), (0.4, 0.05, H + 0.45)], 0.04, "#3a3836", n=6)
    # white appliqué band and the door on the front gable (-Y)
    for x in (-L - 0.005, L + 0.005):
        letters(m, (x, -0.45, 0.55), (0, 1, 0), (0, 0, 1), 7, 0.05, "#f2f0e6")
    s = len(m.vertices)
    m.box((0, 0, 0.42), (0.5, 0.03, 0.06), "#f2f0e6")
    m.box((0, 0, 0.2), (0.38, 0.03, 0.4), "#14110f")
    sheet(m, (0.19, -0.02, 0.42), (0.22, -0.18, 0), (0, 0, -0.42), "#5a2a22", cols=2, rows=2, wave=0.02)
    xform(m, s, rot=(0, 0, -math.pi / 2), offset=(-L - 0.01, 0, 0))
    # guy ropes over short poles to pegs
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            a = Vector((sx * L * 0.9, sy * (W - 0.18), 0.66))
            pole = Vector((sx * (L + 0.1), sy * (W + 0.28), 0.0))
            m.tube([pole, pole + Vector((0, 0, 0.8))], 0.016, "#6e5236", n=4)
            m.tube([a, pole + Vector((0, 0, 0.8)), pole + Vector((sx * 0.08, sy * 0.12, 0))], 0.006, COTTON, n=3)
    # a little flag pole and a dung pile for the stove
    m.tube([(L + 0.15, -0.3, 0), (L + 0.15, -0.3, 1.9)], 0.02, "#6e5236", n=4)
    for k in range(5):
        sheet(m, (L + 0.15, -0.3 + 0.02, 1.85 - k * 0.2), (0, 0.22, -0.02), (0, 0, -0.16), lungta(k),
              cols=2, rows=1, wave=0.015)
    s = len(m.vertices)
    for i in range(6):
        m.blob(polar(0.18 * (i > 0), i * 1.1, 0.04 + 0.05 * (i % 3)), (0.09, 0.09, 0.04), "#5a4632", n=5)
    xform(m, s, offset=(-L - 0.35, -0.6, 0))
    m.anchors.append((L + 0.15, -0.3, 1.88))


def build_mani_wall(m, v):
    L, D, H = 1.15, 0.3, 0.55
    m.box((0, 0, H / 2), (2 * L, 2 * D, H), "#8a8278", jitter=0.01)
    for i in range(10):
        x = -L + 0.15 + i * (2 * L - 0.3) / 9
        m.box((x, -D - 0.005, 0.12 + 0.2 * (i % 3)), (0.2, 0.02, 0.08), SCREE[i % 4])
    # a heap of flat carved slabs along the top
    for i in range(7):
        x = -L + 0.2 + i * (2 * L - 0.4) / 6
        s = len(m.vertices)
        m.lathe((0, 0, 0), [(0, 0.2), (0.05, 0.22), (0.08, 0.16)], SCREE[(i * 3) % 4], n=5, jitter=0.2)
        xform(m, s, rot=(m.rng.uniform(-0.15, 0.15), m.rng.uniform(-0.15, 0.15), m.rng.random()),
              offset=(x, m.rng.uniform(-0.06, 0.06), H))
    stone = ("#9a9284", "#a8a090", "#8a8278", "#b4ab9a", "#c84a3a", "#9a9284", "#3a6ac0", "#a8a090")
    ink = ("#f2f0e6", "#c84a3a", "#f2f0e6", "#3a6ac0", "#f2f0e6", "#e0b030", "#f2f0e6", "#3a9a5a")
    for i in range(10):
        x = -L + 0.12 + i * (2 * L - 0.24) / 9
        side = (-1, 1)[i % 2]
        tablet(m, (x, side * D * 0.5, H + 0.04), 0.22, 0.2 + 0.07 * ((i * 5) % 3),
               (0 if side < 0 else math.pi) + m.rng.uniform(-0.25, 0.25), m.rng.uniform(0.1, 0.4),
               stone[(i + v) % 8], ink[(i + v) % 8], rows=2)
    for sx in (-1, 1):
        s = len(m.vertices)
        chorten(m, 0.26, 2, 0.17, 0.35)
        xform(m, s, offset=(sx * (L + 0.2), 0, 0))
    m.anchors.append((-L - 0.2, 0, 1.05))
    m.anchors.append((L + 0.2, 0, 1.05))


def build_hermitage(m, v):
    W, D, H = 0.85, 0.75, 1.5
    # sloping whitewashed walls, narrower at the top
    pts = [(-W, -D), (W, -D), (W, D), (-W, D)]
    base = [m.vert((x, y, 0)) for x, y in pts]
    top = [m.vert((x * 0.92, y * 0.92, H)) for x, y in pts]
    m.face(tuple(reversed(base)), WHITEWASH)
    for i in range(4):
        j = (i + 1) % 4
        m.face((base[i], base[j], top[j], top[i]), (WHITEWASH, WHITEWASH_SHADE)[i % 2])
    m.face(tuple(top), WHITEWASH_SHADE)
    # the maroon penbey band under the roof, the parapet above it
    m.box((0, 0, H - 0.12), (2 * W * 0.93 + 0.03, 2 * D * 0.93 + 0.03, 0.2), MAROON)
    m.box((0, 0, H + 0.05), (2 * W * 0.95, 2 * D * 0.95, 0.1), WHITEWASH)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.tube([(sx * W * 0.82, sy * D * 0.82, H + 0.08), (sx * W * 0.82, sy * D * 0.82, H + 0.75)], 0.015,
                   "#6e5236", n=4)
            k = (sx + 1) + (sy + 1) // 2
            sheet(m, (sx * W * 0.82, sy * D * 0.82 + 0.015, H + 0.72), (0, 0, -0.4), (0.12 * sx, 0, 0),
                  LUNGTA[k % 5], cols=2, rows=1, wave=0.02)
    # trapezoid windows with black frames and striped awnings; a door
    for x in (-0.45, 0.45):
        y = -D * 0.96 - 0.01
        outline = [(-0.16, 0), (0.16, 0), (0.12, 0.34), (-0.12, 0.34)]
        s = len(m.vertices)
        prism(m, outline, -0.01, 0.01, "#1a1614")
        xform(m, s, rot=(math.pi / 2, 0, 0), offset=(x, y, 0.65))
        m.box((x, y - 0.01, 0.62), (0.3, 0.03, 0.05), "#1a1614")
        for k in range(4):
            m.box((x - 0.12 + k * 0.08, y - 0.06, 1.04), (0.08, 0.12, 0.03),
                  ("#d03a2e", "#2f6fd0", "#f2c230", "#2f9a4a")[k])
    m.box((0, -D * 0.96 - 0.02, 0.38), (0.3, 0.04, 0.76), MAROON)
    m.box((0, -D * 0.96 - 0.04, 0.36), (0.22, 0.02, 0.66), "#3a2a22")
    sheet(m, (-0.11, -D * 0.96 - 0.06, 0.72), (0.22, 0, 0), (0, 0, -0.3), "#f2f0e6", cols=2, rows=1, wave=0.01,
          colors=lambda c, r: ("#2f6fd0", "#f2f0e6")[c % 2])
    m.box((0, -D - 0.12, 0.04), (0.5, 0.25, 0.08), "#9a9284")
    # a sang burner on the roof
    m.lathe((W * 0.5, D * 0.4, H + 0.1), [(0, 0.08), (0.15, 0.1), (0.2, 0.07)], WHITEWASH, n=6)
    m.blob((W * 0.5, D * 0.4, H + 0.45), (0.08, 0.08, 0.12), "#d6d2ca", n=5)
    m.anchors.append((-W * 0.82, -D * 0.82, H + 0.74))
    m.anchors.append((W * 0.82, -D * 0.82, H + 0.74))
