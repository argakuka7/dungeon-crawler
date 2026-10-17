"""Geometry helpers shared by the theme builders (see themes.py), on top of clutter_geo.

Cloth (flags, scarves, banners) is built as thin closed solids so both sides render and
the normals stay sane after props.finish recalculates them.
"""
import math
from pathlib import Path
import sys

from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clutter_geo import *  # noqa: E402,F401,F403
from clutter_geo import prism, xform  # noqa: E402
from props import TAU, polar, linear  # noqa: E402,F401

LUNGTA = ("#2f6fd0", "#f2f0e6", "#d03a2e", "#2f9a4a", "#f2c230")   # sky, air, fire, water, earth
WHITEWASH = "#ece6d6"
WHITEWASH_SHADE = "#d4cbb6"
MAROON = "#7a2a22"
TIBET_RED = "#b8322a"
GOLD = "#d8a83a"
GOLD_DARK = "#a87a28"
COTTON = "#d8d0bc"
YAK = "#2a2624"
YAK_LIGHT = "#3e3832"
TURF = "#8a8a4e"
TURF_LIGHT = "#a49a62"
SCREE = ("#8a8278", "#a09888", "#6e665e", "#b4ab9a")
CLAY = "#b07a4a"
WAX = "#f0d890"
HONEY = "#e8a020"
HONEY_DARK = "#b86a10"
LIMESTONE = "#b8b6a8"
LIMESTONE_DARK = "#8e8c80"
JADE = "#3a9a74"
JADE_LIGHT = "#6ac49a"
SALT = "#f4f2ec"
SALT_SHADE = "#d8d6d0"
SAND_LIGHT = "#e8d4a0"
BRONZE = "#9a6a32"
COPPER = "#b06a40"


def sheet(m, origin, u, v, color, cols=3, rows=2, t=0.006, wave=0.0, phase=0.0, colors=None):
    """A thin cloth panel: origin + s*u + r*v for s, r in [0, 1], `t` thick, rippled along
    its normal by `wave` (more towards the free edge, away from the u edge at the top).
    colors: optional per-cell colour function (col, row) -> hex."""
    origin, u, v = Vector(origin), Vector(u), Vector(v)
    n = u.cross(v).normalized()
    grid = []
    for r in range(rows + 1):
        row = []
        for s in range(cols + 1):
            p = origin + u * (s / cols) + v * (r / rows)
            p = p + n * wave * math.sin(s / cols * 3.4 + phase) * (0.35 + 0.65 * r / rows)
            row.append(p)
        grid.append(row)
    front = [[m.vert(p + n * t / 2) for p in row] for row in grid]
    back = [[m.vert(p - n * t / 2) for p in row] for row in grid]
    for r in range(rows):
        for s in range(cols):
            c = colors(s, r) if colors else color
            m.face((front[r][s], front[r + 1][s], front[r + 1][s + 1], front[r][s + 1]), c)
            m.face((back[r][s], back[r][s + 1], back[r + 1][s + 1], back[r + 1][s]), c, shade=0.85)
    ring = ([(0, s) for s in range(cols + 1)] + [(r, cols) for r in range(1, rows + 1)]
            + [(rows, s) for s in range(cols - 1, -1, -1)] + [(r, 0) for r in range(rows - 1, 0, -1)])
    for (r0, s0), (r1, s1) in zip(ring, ring[1:] + ring[:1]):
        m.face((front[r0][s0], back[r0][s0], back[r1][s1], front[r1][s1]), color, shade=0.9)


def ribbon(m, points, side, width, color, t=0.006, colors=None):
    """A strip of cloth following a polyline; its width lies along `side`."""
    pts = [Vector(p) for p in points]
    side = Vector(side).normalized() * width / 2
    left, right = [], []
    for i, p in enumerate(pts):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        n = d.cross(side).normalized() * t / 2
        left.append((m.vert(p - side + n), m.vert(p - side - n)))
        right.append((m.vert(p + side + n), m.vert(p + side - n)))
    for i in range(len(pts) - 1):
        c = colors[i % len(colors)] if colors else color
        m.face((left[i][0], left[i + 1][0], right[i + 1][0], right[i][0]), c)
        m.face((left[i][1], right[i][1], right[i + 1][1], left[i + 1][1]), c, shade=0.85)
        m.face((left[i][0], left[i][1], left[i + 1][1], left[i + 1][0]), c, shade=0.9)
        m.face((right[i][0], right[i + 1][0], right[i + 1][1], right[i][1]), c, shade=0.9)
    m.face((left[0][0], right[0][0], right[0][1], left[0][1]), color)
    m.face((left[-1][0], left[-1][1], right[-1][1], right[-1][0]), color)


def extrude_x(m, outline, x0, x1, color, top=None):
    """Extrude a (y, z) outline along X from x0 to x1 (a prism lying on its side)."""
    s = len(m.vertices)
    prism(m, outline, x0, x1, color, top=top)
    m.vertices[s:] = [(w, u, v) for u, v, w in m.vertices[s:]]


def letters(m, origin, along, up, count, size, color, rows=1, gap=1.6, word=3):
    """A line (or lines) of raised script: `count` letters grouped into words of `word`
    letters, each word one low block (cheap: 10 triangles a word)."""
    origin, along, up = Vector(origin), Vector(along).normalized(), Vector(up).normalized()
    out = along.cross(up).normalized()   # -Y for along +X, up +Z: towards the viewer
    for r in range(rows):
        i = 0
        while i < count:
            k = min(word, count - i)
            h = size * (1.0 + 0.3 * ((i + r) % 2))
            c = origin + along * ((i + (k - 1) / 2) * size * gap) - up * (r * size * 2.6) + out * size * 0.15
            length = ((k - 1) * gap + 0.7) * size
            ids = []
            for dz in (-0.5, 0.5):
                for da, do in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
                    ids.append(m.vert(c + along * da * length + up * dz * h + out * do * size * 0.3))
            for f in ((4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
                m.face([ids[k] for k in f], color)
            i += k + 1


def tablet(m, center, w, h, yaw, lean, stone, ink, depth=0.045, rows=2):
    """A carved mani stone standing (or leaning) with script on its front (-Y) face."""
    s = len(m.vertices)
    m.box((0, 0, h / 2), (w, depth, h), stone, jitter=0.004)
    letters(m, (-w * 0.36, -depth / 2, h * 0.72), (1, 0, 0), (0, 0, 1), max(3, int(w / 0.045)), 0.026, ink,
            rows=rows)
    xform(m, s, rot=(lean, 0, yaw), offset=center)


def cup(m, center, r, h, color, fill=None, n=6):
    """A small open-looking bowl or lamp cup (a short solid with a filled top)."""
    x, y, z = center
    m.lathe((x, y, z), [(0, r * 0.45), (h * 0.25, r * 0.3), (h * 0.55, r * 0.75), (h, r)], color, n=n,
            jitter=0.04)
    if fill:
        m.lathe((x, y, z + h * 0.82), [(0, r * 0.85), (h * 0.2, r * 0.8)], fill, n=n, jitter=0.02)


def hexagon(m, center, r, z0, z1, color, top=None, phase=0.0):
    pts = [(center[0] + r * math.cos(phase + TAU * i / 6), center[1] + r * math.sin(phase + TAU * i / 6))
           for i in range(6)]
    prism(m, pts, z0, z1, color, top=top)


def flame(m, center, h, color, r=None):
    """A little glowing flame (marks its faces emissive)."""
    start = len(m.faces)
    m.lathe(center, [(0, (r or h * 0.3) * 0.6), (h * 0.35, r or h * 0.3), (h, 0)], color, n=5, jitter=0.1)
    m.glows[start:] = [True] * (len(m.faces) - start)


def loft(m, rings, color, caps=True, colors=None, shade_caps=0.95):
    """Connect closed rings of equal length (lists of 3D points) into a solid; caps the
    ends (concave caps are triangulated). colors: optional per-band colours."""
    from mathutils.geometry import tessellate_polygon
    ids = [[m.vert(p) for p in ring] for ring in rings]
    k = len(rings[0])
    for b, (a, c) in enumerate(zip(ids, ids[1:])):
        col = colors[b % len(colors)] if colors else color
        for i in range(k):
            j = (i + 1) % k
            m.face((a[i], a[j], c[j], c[i]), col)
    if caps:
        for ring, flip in ((ids[0], True), (ids[-1], False)):
            pts = [Vector(m.vertices[i]) for i in ring]
            for tri in tessellate_polygon([pts]):
                f = [ring[t] for t in tri]
                m.face(tuple(reversed(f)) if flip else tuple(f), color, shade=shade_caps)


def hull(m, length, width, depth, color, inner, stations=6, t=0.03, stern=0.55, rim=None):
    """A boat hull along X (bow at +X), gunwale at z = 0, keel at -depth: a lofted U-shaped
    band with wall thickness t. stern: how wide the transom is (0 = pointed)."""
    rings = []
    for i in range(stations + 1):
        u = i / stations
        f = max(0.04, (1 - u ** 2.2) ** 0.5 * (stern + (1 - stern) * min(1, u * 3)))
        x = -length / 2 + length * u
        w, d = width / 2 * f, depth * (0.55 + 0.45 * f)
        outer = [(-w, 0), (-w * 0.85, -d * 0.6), (0, -d), (w * 0.85, -d * 0.6), (w, 0)]
        wi, di = max(0.005, w - t), max(0.005, d - t)
        inn = [(wi, 0), (wi * 0.85, -di * 0.6), (0, -di), (-wi * 0.85, -di * 0.6), (-wi, 0)]
        rise = 0.08 * depth * (u ** 3) * 3
        rings.append([(x, y, z + rise) for y, z in outer + inn])
    start = len(m.faces)
    loft(m, rings, color)
    # the inner half of every band (ring indices 5..9) is the inside of the boat
    k = 10
    for b in range(stations):
        for i in range(5, k):
            idx = start + b * k + i
            m.colors[idx] = tuple(linear(inner)) + (1,)
    return rings


def wobble(m, start, amp, freq=3.0, phase=0.0, lean=(0.0, 0.0)):
    """Bend and bulge everything from vertex `start` on: an organic, uneven column."""
    out = []
    for x, y, z in m.vertices[start:]:
        dx = amp * math.sin(z * freq + phase) + lean[0] * z
        dy = amp * math.cos(z * freq * 1.3 + phase * 2) + lean[1] * z
        k = 1 + 0.6 * amp * math.sin(z * freq * 2.1 + phase)
        out.append((x * k + dx, y * k + dy, z))
    m.vertices[start:] = out


def streaks(m, start_face, n, bands, colors, dark=0.88):
    """Recolour a lathe (begun at face `start_face`, n around, `bands` bands) in vertical
    streaks: each column keeps its colour, now and then shifting, slightly darker at the foot."""
    for b in range(bands):
        for i in range(n):
            idx = start_face + 1 + b * n + i
            k = dark + (1 - dark) * min(1, 2 * (b + 1) / bands)
            base = linear(colors[(i * 3 + (b // 4) * (i % 2)) % len(colors)])
            m.colors[idx] = tuple(min(1, c * k * m.rng.uniform(0.96, 1.04)) for c in base) + (1,)


def skull_tiny(m, center, scale=1.0, color=BONE, dark="#3a342c"):
    """A cheap front-facing (-Y) skull for walls and rows (about 50 triangles)."""
    x, y, z = center
    s = scale
    m.lathe((x, y, z), [(0, 0.075 * s), (0.06 * s, 0.09 * s), (0.13 * s, 0.07 * s), (0.17 * s, 0)], color, n=5,
            jitter=0.04, phase=math.pi / 2)
    m.box((x, y - 0.06 * s, z + 0.02 * s), (0.08 * s, 0.05 * s, 0.05 * s), color)
    for side in (-1, 1):
        m.box((x + side * 0.035 * s, y - 0.075 * s, z + 0.08 * s), (0.035 * s, 0.03 * s, 0.035 * s), dark)
