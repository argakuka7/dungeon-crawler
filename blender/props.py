"""
Low-poly decoration library for Cube Crawler (all P1 and P2 in docs/asset-brief.txt).

One cell = one Blender unit. Geometry uses Z up, flat normals and linear
COLOR_0; only glowing faces use an additional emissive material. Each prop
is ONE mesh, with an attachment-space origin and glTF extras. No textures,
UVs, unapplied transforms, modifiers, rigs or preview objects are exported.
Variants are reproducible and change silhouettes, not just object yaw.

Headless:
    Blender -b --python blender/props.py -- [assets/props]

Inside Blender / MCP (does not clear an existing scene):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, props; importlib.reload(props)
    objects = props.main(export_dir="<repo>/assets/props")

build(priority=1) builds only P1. main() builds P1 across every theme, then
P2, validates the mesh library, and exports only the library: one GLB per
prop set (export_sets: assets/props/<set>.glb), so the game loads a set
only when a cube shows it. Then `node tools/prop-metadata.mjs` and
`node tools/compress-assets.mjs` (README.md, "Assets"). All meshes
are at the origin for instancing. layout_preview() temporarily arranges
them in theme rows for inspection; export_gltf() always exports at origin
and restores their preview locations afterwards.
"""
import hashlib
import math
from pathlib import Path
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"  # exported game data, the only folder the game loads from
PREVIEWS = HERE / "previews"     # overview renders for humans, never loaded by the game
SEED = 1729
COLLECTION = "CubeCrawlerProps"
COLOR_ATTRIBUTE = "Color"
MAX_RADIUS = 0.45
MIN_TRIANGLES = 40
MAX_TRIANGLES = 400
TREE_TRIANGLES = 600
TAU = math.tau

# Authoring colours are sRGB hex; converted to linear before mesh assignment.
STONE = "#939393"
STONE_DARK = "#606060"
BARK = "#6e4420"
WOOD = "#82603b"
LEAF = "#659449"
LEAF_LIGHT = "#a3b26a"
SNOW = "#e6eef1"
PINE = "#2f4a3a"
ICE = "#aacbd7"
ROOT = "#5e4c35"
MOSS = "#4a5a2a"
SWAMP = "#4b5a2e"
WEB = "#e8e4ea"
BONE = "#d9d0b5"
SLATE = "#5a5a64"
# Stone stays neutral for the game's per-theme tint, including temple masonry
# and volcanic rock. Snow/moss caps are the explicitly coloured exceptions.
RUIN = "#969696"
RUIN_LIGHT = "#b0b0b0"
BASALT = "#343434"
OBSIDIAN = "#292632"
IRON = "#484852"


def linear(hex_color):
    rgb = [int(hex_color.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb)


def material(name, glow=None, strength=1):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.88
    shader.inputs["Base Color"].default_value = (1, 1, 1, 1)
    color = nodes.new("ShaderNodeVertexColor")
    color.layer_name = COLOR_ATTRIBUTE
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    if glow:
        shader.inputs["Emission Color"].default_value = (*linear(glow), 1)
        shader.inputs["Emission Strength"].default_value = strength
    links.new(shader.outputs["BSDF"], out.inputs["Surface"])
    return mat


class Mesh:
    """Small indexed mesh assembler; separate shells remain a single object."""

    def __init__(self, rng):
        self.rng = rng
        self.vertices = []
        self.faces = []
        self.colors = []
        self.glows = []

    def vert(self, co):
        self.vertices.append(tuple(co))
        return len(self.vertices) - 1

    def face(self, ids, color, glow=False, shade=1):
        self.faces.append(tuple(ids))
        rgb = linear(color)
        # Facet variation preserves neutral greys and does not fake smooth normals.
        value = shade * self.rng.uniform(0.93, 1.07)
        self.colors.append(tuple(min(1, c * value) for c in rgb) + (1,))
        self.glows.append(glow)

    def lathe(self, center, profile, color, n=8, jitter=0.04, colors=None,
              glow_bands=(), axis=(0, 0, 1), phase=0):
        """Closed faceted solid; profile is [(height, radius), ...]."""
        center = Vector(center)
        q = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized())
        rings = []
        perturb = [self.rng.uniform(1 - jitter, 1 + jitter) for _ in range(n)]
        for z, radius in profile:
            rings.append([self.vert(center + q @ Vector((
                radius * perturb[i] * math.cos(TAU * i / n + phase),
                radius * perturb[i] * math.sin(TAU * i / n + phase), z)))
                for i in range(n)] if radius else [self.vert(center + q @ Vector((0, 0, z)))])
        if len(rings[0]) > 1:
            self.face(tuple(reversed(rings[0])), color)
        for band, (a, b) in enumerate(zip(rings, rings[1:])):
            col = colors[band % len(colors)] if colors else color
            for i in range(n):
                j = (i + 1) % n
                if len(a) == 1:
                    face = (a[0], b[j], b[i])
                elif len(b) == 1:
                    face = (a[i], a[j], b[0])
                else:
                    face = (a[i], a[j], b[j], b[i])
                self.face(face, col, band in glow_bands, 0.9 + 0.15 * band / max(1, len(profile) - 2))
        if len(rings[-1]) > 1:
            self.face(rings[-1], color)

    def blob(self, center, size, color, n=7, jitter=0.1):
        """Irregular low-poly ellipsoid, flattened at both ends (48 tris at n=7)."""
        start = len(self.vertices)
        self.lathe((0, 0, 0), [(-1, 0), (-0.65, 0.72), (0, 1), (0.65, 0.76), (1, 0)],
                   color, n=n, jitter=jitter, phase=self.rng.random())
        for i in range(start, len(self.vertices)):
            v = self.vertices[i]
            self.vertices[i] = tuple(center[k] + v[k] * size[k] for k in range(3))

    def box(self, center, size, color, tilt=0, jitter=0):
        ids = []
        for z in (-0.5, 0.5):
            for x, y in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
                px, py = x * size[0], y * size[1]
                ids.append(self.vert((center[0] + px * math.cos(tilt) - py * math.sin(tilt),
                                      center[1] + px * math.sin(tilt) + py * math.cos(tilt),
                                      center[2] + z * size[2] + self.rng.uniform(-jitter, jitter))))
        for f in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                  (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face([ids[i] for i in f], color)

    def tube(self, points, radii, color, n=5):
        """Parallel-ish ring sweep with tapered ends; suitable for roots and wood."""
        points = list(map(Vector, points))
        if isinstance(radii, (float, int)):
            radii = [radii] * len(points)
        rings = []
        for i, (p, r) in enumerate(zip(points, radii)):
            tangent = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
            q = Vector((0, 0, 1)).rotation_difference(tangent.normalized())
            rings.append([self.vert(p + q @ Vector((r * math.cos(TAU * j / n),
                                                   r * math.sin(TAU * j / n), 0))) for j in range(n)])
        self.face(tuple(reversed(rings[0])), color)
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                j = (i + 1) % n
                self.face((a[i], a[j], b[j], b[i]), color)
        self.face(rings[-1], color)

    def ring(self, center, radius, thickness, color, n=10, section=3, vertical=False, yaw=0,
             ellipse=1, glow=False):
        rings = []
        for i in range(n):
            a = TAU * i / n
            pts = []
            for j in range(section):
                b = TAU * j / section
                r = radius + thickness * math.cos(b)
                p = Vector((r * math.cos(a), r * math.sin(a) * ellipse, thickness * math.sin(b)))
                if vertical:
                    p = Vector((p.x * math.cos(yaw) - p.z * math.sin(yaw),
                                p.x * math.sin(yaw) + p.z * math.cos(yaw), p.y))
                pts.append(self.vert(Vector(center) + p))
            rings.append(pts)
        for i in range(n):
            for j in range(section):
                self.face((rings[i][j], rings[(i + 1) % n][j],
                           rings[(i + 1) % n][(j + 1) % section], rings[i][(j + 1) % section]), color, glow)

    def leaf(self, base, tip, width, color):
        """Two-sided chunky blade with a central ridge, not a smooth cone."""
        base, tip = Vector(base), Vector(tip)
        mid = base.lerp(tip, 0.45)
        side = (tip - base).cross(Vector((0, 1, 0))).normalized() * width
        ids = [self.vert(p) for p in (base, mid + side, tip, mid - side,
                                     mid + Vector((0, -width * 0.4, 0)),
                                     mid + Vector((0, width * 0.4, 0)))]
        for i in range(4):
            self.face((ids[i], ids[(i + 1) % 4], ids[4]), color)
            self.face((ids[(i + 1) % 4], ids[i], ids[5]), color, shade=0.8)

    def shard(self, center, radius, height, color, n=6, glow=False):
        start = len(self.vertices)
        self.lathe(center, [(0, radius * 0.7), (height * 0.18, radius),
                            (height * 0.7, radius * 0.8), (height, 0)],
                   color, n=n, jitter=0.12, glow_bands=(1, 2) if glow else ())
        # The tip leans; broad alternating faces read as reflective facets.
        self.vertices[-1] = tuple(Vector(self.vertices[-1]) + Vector((radius * 0.35, radius * 0.2, 0)))
        for i in range(start, len(self.vertices)):
            x, y, z = self.vertices[i]
            self.vertices[i] = (x + radius * 0.15 * (z - center[2]) / height, y, z)


def polar(radius, angle, z=0):
    return (radius * math.cos(angle), radius * math.sin(angle), z)


def rock(m, v, radius=0.27, height=0.35, color=STONE, cap=None):
    n = 8 if v == 0 else 7
    top = height * (1.0 if v == 0 else 0.85)
    profile = [(0, radius * 0.75), (top * 0.23, radius),
               (top * 0.65, radius * 0.9), (top, radius * 0.4)]
    m.lathe((0, 0, 0), profile, color, n=n, jitter=0.18,
            colors=[color, color, cap or color])
    if cap:
        # A second shallow solid gives a visible overhanging cap, including its top.
        m.lathe((0.015, 0, top * 0.63), [(0, radius * 0.91), (top * 0.2, radius * 0.7),
                                        (top * 0.43, radius * 0.46)], cap, n=n, jitter=0.1)


def build_rock(m, v):
    rock(m, v, radius=0.23 + 0.025 * v, height=0.27 + 0.055 * v)


def build_boulder(m, v):
    rock(m, v, radius=0.39, height=0.62 + 0.18 * v, color=STONE_DARK)


def build_pebbles(m, v):
    for i in range(4 + v):
        a = TAU * i / (4 + v) + m.rng.random() * 0.4
        r = 0.19 if i else 0
        m.blob(polar(r, a, 0.035), (0.1, 0.08, 0.05), STONE, n=5)


def build_stalagmite(m, v):
    for i in range(3):
        p = polar(0.15 if i else 0, i * 2.4)
        h = (0.6 + v * 0.5) * (1 if i == 0 else 0.4 + i * 0.1)
        m.lathe(p, [(0, 0.12), (h * 0.25, 0.09), (h * 0.75, 0.04), (h, 0)], STONE, n=6, jitter=0.16)


def build_stalactite(m, v):
    build_stalagmite(m, v)
    m.vertices = [(x, y, -z * 0.8) for x, y, z in m.vertices]


def tree(m, v, tall=False, dead=False, charred=False):
    h = (3.0 if tall else 2.2) * (1 - 0.08 * v)
    bark = "#3a302c" if charred else BARK
    m.tube([(0, 0, 0), (0.035, 0.02, h * 0.35), (-0.04 + v * 0.05, 0, h * 0.7),
            (0.05, 0.02, h * 0.94)], [0.11, 0.09, 0.065, 0.025], bark, n=7)
    for i in range(3):
        a = i * TAU / 3 + v * 0.7
        m.tube([polar(0.24, a, 0.015), (0, 0, 0.2)], [0.035, 0.075], bark)
    if dead or charred:
        for i in range(4):
            a = i * 2.35 + v * 0.65
            z = h * (0.36 + i * 0.12)
            p = polar(0.28 + (i % 2) * 0.1, a, z + 0.16)
            end = polar(0.34, a + 0.4, z + 0.5)
            m.tube([(0, 0, z), p, end], [0.055, 0.035, 0.009], bark)
            if i % 2 == v:
                m.tube([p, polar(0.42, a - 0.35, z + 0.25)], [0.028, 0.008], bark)
    else:
        for i in range(3):
            z = h * (0.61 + i * 0.11) if tall else h * (0.73 + (i % 2) * 0.08)
            p = polar(0.13 if not tall else 0.06, i * 2.4 + v, z)
            m.tube([(0, 0, h * 0.48), p], [0.055, 0.025], bark)
            size = (0.28, 0.27, 0.48) if tall else (0.31, 0.30, 0.43)
            m.blob(p, size, [LEAF, LEAF_LIGHT, "#4c8a3c"][i], n=8)


def build_tree_round(m, v):
    tree(m, v)


def build_tree_tall(m, v):
    tree(m, v, tall=True)


def build_bush(m, v):
    for i in range(3 + v):
        p = polar(0.14, i * 2.4, 0.22 + (i % 2) * 0.05)
        m.tube([(0, 0, 0), p], [0.04, 0.015], BARK)
        m.blob(p, (0.22, 0.2, 0.25), LEAF if i % 2 else LEAF_LIGHT)


def build_grass_tuft(m, v):
    for i in range(5):
        a = i * 2.4 + v
        p = polar(0.055, a)
        tip = polar(0.12 + m.rng.random() * 0.08, a, 0.18 + m.rng.random() * 0.2)
        m.leaf(p, tip, 0.028 + (i % 2) * 0.012, LEAF if i % 2 else LEAF_LIGHT)


def build_flowers(m, v):
    for i in range(3 + v):
        a = i * 2.4 + v
        x, y, _ = polar(0.18, a)
        z = 0.18 + m.rng.random() * 0.14
        m.tube([(x, y, 0), (x + 0.025, y, z)], [0.008, 0.006], LEAF, n=4)
        m.leaf((x, y, z * 0.3), (x + 0.08, y, z * 0.65), 0.025, LEAF)
        col = ["#f5efd9", "#f2ce58", "#df8dac"][(i + v) % 3]
        for j in range(5):
            angle = TAU * j / 5
            c = Vector((x + 0.025, y, z))
            ids = [m.vert(p) for p in (c, c + Vector(polar(0.055, angle - 0.3, 0.01)),
                                      c + Vector(polar(0.075, angle, 0)),
                                      c + Vector(polar(0.055, angle + 0.3, 0.01)))]
            m.face(ids, col)
            m.face(tuple(reversed(ids)), col, shade=0.85)
        m.blob((x + 0.025, y, z + 0.008), (0.02, 0.02, 0.012), "#e9b644", n=4)


def build_stump(m, v):
    m.lathe((0, 0, 0), [(0, 0.21), (0.12, 0.16), (0.4 + v * 0.06, 0.145)], BARK, n=9, jitter=0.15)
    m.lathe((0, 0, 0.4 + v * 0.06), [(0, 0.132), (0.004, 0.132)], "#bb9665", n=9)
    m.ring((0, 0, 0.408 + v * 0.06), 0.083, 0.007, BARK, n=9)
    for i in range(3):
        m.tube([polar(0.28, i * 2.2, 0.015), (0, 0, 0.16)], [0.035, 0.065], BARK)


def build_fallen_log(m, v):
    m.lathe((-0.36, 0, 0.14), [(0, 0.13), (0.24, 0.145), (0.5, 0.12), (0.72, 0.13)],
            BARK, n=9, jitter=0.12, axis=(1, 0.1 * v, 0))
    for x in (-0.362, 0.362):
        m.lathe((x, x * 0.1 * v, 0.14), [(0, 0.115), (0.005, 0.115)], "#ba9562", n=9, axis=(1, 0, 0))
    m.tube([(0.02, 0, 0.2), (0.08, 0.13, 0.3), (0.15, 0.2, 0.33)], [0.04, 0.028, 0.012], BARK)


def mushroom(m, center, height, radius, cap, stem=BONE, glow=False, n=9):
    x, y, z = center
    m.tube([(x, y, z), (x + 0.025, y, z + height * 0.7)], [radius * 0.2, radius * 0.14], stem, n=6)
    m.lathe((x + 0.025, y, z + height * 0.65),
            [(0, radius * 0.28), (height * 0.035, radius),
             (height * 0.18, radius * 0.8), (height * 0.35, 0)],
            cap, n=n, jitter=0.06, colors=["#8fff7a" if glow else stem, cap, cap],
            glow_bands=(0,) if glow else ())


def build_mushroom_small(m, v):
    for i in range(2 + v):
        p = polar(0.13 if i else 0, i * 2.4)
        h = 0.24 + (i % 2) * 0.08
        mushroom(m, p, h, 0.115, "#bd4940", n=7)
        m.blob((p[0] + 0.025, p[1], h * 0.94), (0.032, 0.024, 0.012), "#f1e9cf", n=4)


def pine(m, v, small=False):
    h = (1.25 if small else 2.5) * (1 - 0.1 * v)
    m.tube([(0, 0, 0), (0.03, 0, h)], [0.075, 0.015], BARK, n=7)
    for i in range(3):
        r = (0.32 if small else 0.41) * (1 - i * 0.23)
        z = h * (0.22 + i * 0.23)
        m.lathe((0.02 * i, 0, z), [(0, r * 0.82), (0.07, r), (h * 0.36, 0)], PINE, n=9, jitter=0.08)
        m.lathe((0.02 * i, 0, z + h * 0.1), [(0, r * 0.78), (h * 0.05, r * 0.7),
                                           (h * 0.3, 0)], SNOW, n=9, jitter=0.1)


def build_pine_snow(m, v):
    pine(m, v)


def build_pine_small(m, v):
    pine(m, v, small=True)


def build_snow_rock(m, v):
    rock(m, v, radius=0.31, height=0.45, color="#737e87", cap=SNOW)


def build_ice_shard(m, v):
    for i in range(2 + v):
        m.shard(polar(0.13 if i else 0, i * 2.4), 0.11, 0.5 + (i % 2) * 0.25,
                "#d8ecf2" if i % 2 else "#82a6b8")


def build_snow_lump(m, v):
    m.blob((0, 0, 0.26), (0.33, 0.3, 0.29), SNOW, n=8)
    m.blob((0.04 * v, 0, 0.57), (0.22, 0.2, 0.23), SNOW, n=8)


def shrub(m, v, frozen=False):
    color = "#ad925d" if not frozen else "#8199a0"
    for i in range(5):
        a = i * 2.4 + v * 0.4
        p = polar(0.23, a, 0.22)
        end = polar(0.34, a + 0.4, 0.34 + (i % 2) * 0.13)
        m.tube([(0, 0, 0.04), p, end], [0.024, 0.018, 0.007], color, n=4)
        m.tube([p, polar(0.26, a - 0.6, 0.4)], [0.013, 0.004], SNOW if frozen else color, n=4)
    if frozen:
        m.blob((0, 0, 0.055), (0.24, 0.2, 0.06), SNOW, n=6)


def build_frozen_bush(m, v):
    shrub(m, v, frozen=True)


def build_cactus(m, v):
    col = "#688250" if v == 0 else "#7b9455"
    h = 1.4 - 0.13 * v
    m.lathe((0, 0, 0), [(0, 0.115), (h * 0.85, 0.105), (h * 0.97, 0.065), (h, 0)], col, n=9, jitter=0.03)
    for s in (-1, 1):
        z = 0.45 + (s == 1) * 0.25 + 0.06 * v
        m.tube([(0, 0, z), (s * 0.25, 0.015, z), (s * 0.27, 0.02, z + 0.36 + s * 0.06)],
               [0.075, 0.073, 0.045], col, n=7)
        m.blob((s * 0.27, 0.02, z + 0.36 + s * 0.06), (0.045, 0.044, 0.06), col, n=5)
    for i in range(6):
        z = 0.18 + i * 0.15
        m.leaf((0.035 * (-1) ** i, -0.109, z), (0.07 * (-1) ** i, -0.14, z + 0.03), 0.008, "#d6c293")


def build_dead_tree(m, v):
    tree(m, v, dead=True)


def build_dry_shrub(m, v):
    shrub(m, v)
    for i in range(2):
        m.ring((0, 0, 0.23), 0.22, 0.01, "#ad925d", n=8, vertical=True, yaw=i * 1.6 + v)


def skull(m, center, scale=1, cow=False):
    """Stylised skull with inset dark eye/nose patches and a tapered muzzle."""
    start = len(m.vertices)
    m.blob((0, 0, 0.12), (0.13, 0.12, 0.14), BONE, n=7)
    m.blob((0, -0.11, 0.055), (0.09, 0.12 if cow else 0.055, 0.07), BONE, n=6)
    for s in (-1, 1):
        m.box((s * 0.057, -0.106, 0.14), (0.045, 0.018, 0.05), "#49443d", tilt=s * 0.2)
        if cow:
            m.tube([(s * 0.09, 0, 0.2), (s * 0.21, 0, 0.24), (s * 0.3, 0.01, 0.34)],
                   [0.04, 0.022, 0.004], BONE)
    ids = [m.vert(p) for p in ((-0.023, -0.157, 0.09), (0, -0.16, 0.045), (0.023, -0.157, 0.09))]
    m.face(ids, "#49443d")
    for i in range(3):
        m.box(((i - 1) * 0.038, -0.157, 0.025), (0.025, 0.035, 0.03), BONE)
    for i in range(start, len(m.vertices)):
        m.vertices[i] = tuple(Vector(center) + Vector(m.vertices[i]) * scale)


def build_bleached_skull(m, v):
    skull(m, (0, 0, 0), scale=1 + v * 0.1, cow=True)


def build_sandstone_pillar(m, v):
    h = 1.7 + v * 0.6
    m.lathe((0, 0, 0), [(0, 0.3), (h * 0.15, 0.23), (h * 0.35, 0.17),
                            (h * 0.48, 0.24), (h * 0.62, 0.18), (h * 0.8, 0.2),
                            (h * 0.85, 0.34), (h * 0.95, 0.32), (h, 0.2)],
            STONE, n=9, jitter=0.16, colors=[STONE_DARK, STONE, "#777777", "#b3b3b3"])


def hanging_roots(m, v, vines=False):
    color = SWAMP if vines else ROOT
    for i in range(4 + v):
        a = i * 2.4 + v
        x, y, _ = polar(0.19, a)
        length = 0.65 + m.rng.random() * 0.75
        pts = [(x, y, 0), (x + 0.07, y - 0.03, -length * 0.3),
               (x - 0.07, y + 0.04, -length * 0.68), (x + 0.05, y, -length)]
        m.tube(pts, [0.035, 0.024, 0.015, 0.004], color, n=4)
        if vines:
            for p in pts[1:3]:
                m.leaf(p, (p[0] + 0.13, p[1], p[2] - 0.13), 0.055, MOSS)
        elif i % 2 == 0:
            p = pts[2]
            m.tube([p, (p[0] + 0.16, p[1], p[2] - 0.2)], [0.013, 0.004], color, n=4)


def build_hanging_roots(m, v):
    hanging_roots(m, v)


def build_root_arch(m, v):
    pts = [(-0.33, 0, 0), (-0.31, 0.02, 0.28), (-0.17, 0.06, 0.58 + v * 0.12),
           (0.07, 0.1, 0.66 + v * 0.12), (0.3, 0.02, 0.36), (0.33, 0, 0)]
    m.tube(pts, [0.1, 0.09, 0.08, 0.075, 0.09, 0.1], ROOT, n=7)
    for s in (-1, 1):
        m.tube([(s * 0.31, 0, 0.14), (s * 0.34, -0.15, 0.015)], [0.05, 0.018], ROOT)


def build_mushroom_cluster(m, v):
    for i in range(3 + v):
        mushroom(m, polar(0.19 if i else 0, i * 2.4 + v),
                 0.25 + (i % 2) * 0.16, 0.12, "#8c7858" if i % 2 else "#c8b99a", n=7)


def build_moss_rock(m, v):
    rock(m, v, radius=0.32, height=0.45, color="#776e5e", cap=MOSS)


def crystals(m, v, color, glow=True):
    for i in range(4):
        h = (0.8 + v * 0.22) if i == 0 else 0.32 + (i % 3) * 0.17
        m.shard(polar(0.21 if i else 0, i * 2.4 + v), 0.12 if i == 0 else 0.085,
                h, color if i % 2 == 0 else (
                    "#d8ecf2" if color == ICE else "#7a8aa8" if glow else "#484252"), glow=glow)


def build_ice_crystal(m, v):
    crystals(m, v, ICE)


def build_icicles(m, v):
    for i in range(4 + v):
        x = (i - (3 + v) / 2) * 0.14
        h = 0.3 + m.rng.random() * 0.55
        start = len(m.vertices)
        m.lathe((x, 0.04 * (i % 2), 0), [(0, 0.065), (-h * 0.25, 0.045), (-h, 0)],
                "#d8ecf2" if i % 2 else ICE, n=6, jitter=0.08)
        # Winding is fixed centrally by bmesh, including these downward profiles.
        assert len(m.vertices) > start


def build_frozen_pool_rim(m, v):
    for i in range(7 + v):
        a = i * TAU / (7 + v)
        m.box(polar(0.31, a, 0.045), (0.17, 0.11, 0.065 + (i % 3) * 0.02),
              "#d8ecf2" if i % 2 else ICE, tilt=a + 0.4, jitter=0.008)


def cocoon(m, v, icy=False):
    color = ICE if icy else WEB
    m.tube([(0, 0, 0), (0.02, 0, -0.22)], [0.015, 0.01], color, n=4)
    m.blob((0.02, 0, -0.67 - v * 0.08), (0.22, 0.2, 0.45 + v * 0.08), color, n=8)
    for i in range(4):
        m.ring((0.02, 0, -0.42 - i * 0.15), 0.19 if i in (1, 2) else 0.145,
               0.009, "#d8ecf2" if icy else "#b8b2c0", n=8)


def build_frozen_spider_cocoon(m, v):
    m.blob((0, 0, 0.27), (0.29, 0.24, 0.28), ICE, n=8)
    for i in range(3):
        m.shard(polar(0.18, i * 2.4, 0.12), 0.06, 0.25 + i * 0.04, "#d8ecf2")
    for i in range(2):
        m.ring((0, 0, 0.2 + i * 0.13), 0.24, 0.008, "#e8e4ea", n=8)


def build_glow_mushroom(m, v):
    mushroom(m, (0, 0, 0), 0.9 + v * 0.22, 0.38, "#667b3d", stem="#b1b989", glow=True, n=11)
    # Raised flecks on the cap, not a texture.
    for i in range(3):
        p = polar(0.14, i * 2.4, 0.82 + v * 0.22)
        m.blob(p, (0.035, 0.025, 0.017), "#aec47a", n=4)


def build_mushroom_shelf(m, v):
    # Two closed half-disc brackets: the cut side is exactly on wall y=0.
    for k in range(2):
        x, z = (-0.12, 0.02) if k == 0 else (0.14, 0.22 + 0.04 * v)
        r = 0.28 if k == 0 else 0.2
        outline = [(x + r * math.cos(math.pi * i / 8), r * math.sin(math.pi * i / 8)) for i in range(9)]
        lo = [m.vert((px, py, z)) for px, py in outline]
        hi = [m.vert((px, py * 0.94, z + 0.07 + 0.02 * (i % 2))) for i, (px, py) in enumerate(outline)]
        center_lo = m.vert((x, r * 0.28, z - 0.015))
        center_hi = m.vert((x, r * 0.28, z + 0.14))
        for i in range(9):
            j = (i + 1) % 9
            m.face((lo[j], lo[i], center_lo), "#8fff7a", glow=True)
            m.face((hi[i], hi[j], center_hi), "#7b8750")
            m.face((lo[i], lo[j], hi[j], hi[i]), "#a1ab77")


def build_reeds(m, v):
    for i in range(5):
        x, y, _ = polar(0.18, i * 2.4 + v)
        h = 0.55 + m.rng.random() * 0.3
        m.tube([(x, y, 0), (x + 0.04, y, h)], [0.013, 0.009], SWAMP, n=4)
        m.leaf((x, y, 0.1), (x + (-1) ** i * 0.15, y + 0.03, h * 0.8), 0.027, MOSS)
        m.blob((x + 0.04, y, h), (0.031, 0.03, 0.12), "#8b7650", n=5)


def build_spore_pod(m, v):
    m.tube([(0, 0, 0), (0.02, 0, 0.24)], [0.06, 0.04], SWAMP)
    m.blob((0.02, 0, 0.38), (0.26, 0.24, 0.3), "#657544", n=9)
    for i in range(5):
        a = i * 2.4 + v
        p = (0.02 + 0.215 * math.cos(a), 0.2 * math.sin(a), 0.4 + (i % 2) * 0.1)
        start = len(m.faces)
        m.blob(p, (0.032, 0.032, 0.042), "#7dff3a", n=4)
        m.glows[start:] = [True] * (len(m.faces) - start)


def build_slime_puddle(m, v):
    m.lathe((0, 0, 0), [(0, 0.32), (0.018, 0.4), (0.04, 0.26), (0.046, 0)],
            "#698f36", n=11, jitter=0.2)
    for i in range(2 + v):
        m.blob(polar(0.17, i * 2.4, 0.045), (0.047, 0.041, 0.034), "#a3c45a", n=5)


def build_vines(m, v):
    hanging_roots(m, v, vines=True)


def build_cobweb_corner(m, v):
    # A true triangular network, with no opaque filled web plane.
    # Coordinates are in the wall XZ plane; all strands sit slightly in front.
    corner = Vector((-0.43, 0.008, 0.43))
    ends = [Vector((0.43, 0.008, 0.43)), Vector((-0.43, 0.008, -0.43))]
    spokes = [corner.lerp(ends[0].lerp(ends[1], i / 4), 1) for i in range(5)]
    for end in spokes:
        m.tube([corner, end], 0.0055, WEB, n=3)
    for t in (0.25, 0.48, 0.73, 1):
        pts = [corner.lerp(end, t) + Vector((0, 0, -0.015 * math.sin(i * math.pi / 4)))
               for i, end in enumerate(spokes)]
        m.tube(pts, 0.004, "#c7c1ce" if v else WEB, n=3)


def build_egg_sac(m, v):
    m.blob((0, 0, 0.04), (0.32, 0.28, 0.045), "#8e8598", n=6)
    for i in range(5 + v):
        p = polar(0.19 if i else 0, i * 2.4, 0.17 + (i == 0) * 0.05)
        m.blob(p, (0.085, 0.08, 0.18), WEB if i % 2 else "#ccc4d0", n=6)


def build_wrapped_victim(m, v):
    cocoon(m, v)


def build_web_strands(m, v):
    for i in range(4 + v):
        x, y, _ = polar(0.22, i * 2.4)
        h = 0.5 + m.rng.random() * 0.55
        m.tube([(x, y, 0), (x + 0.03, y + 0.02, -h * 0.4),
                (x - 0.04, y, -h * 0.8), (x, y, -h)], [0.006, 0.005, 0.004, 0.002], WEB, n=3)


def bone(m, a, b, radius=0.025):
    m.tube([a, b], [radius, radius * 0.8], BONE, n=5)
    for p in (a, b):
        m.blob(p, (radius * 1.3, radius, radius * 1.3), BONE, n=4)


def build_bone_pile(m, v):
    skull(m, (0, 0, 0.08), scale=0.8)
    for i in range(3):
        a = i * 1.1 + v
        bone(m, polar(0.28, a, 0.035 + i * 0.018), polar(0.24, a + math.pi, 0.045 + i * 0.02))


def build_crystal_cluster(m, v):
    crystals(m, v, "#8fa8ff" if v == 0 else "#c08fff")
    m.blob((0, 0, 0.035), (0.27, 0.24, 0.06), SLATE, n=6)


def build_support_frame(m, v):
    for s in (-1, 1):
        m.box((s * 0.43, 0, 0.74), (0.14, 0.16, 1.48), WOOD, jitter=0.007)
        m.box((s * 0.43, 0, 0.08), (0.14, 0.22, 0.16), "#655947")
        m.tube([(s * 0.41, 0, 1.1), (s * 0.19, 0, 1.5)], 0.045, BARK, n=4)
        for z in (0.17, 1.38):
            m.box((s * 0.43, -0.086, z), (0.09, 0.017, 0.045), IRON)
    m.box((0, 0, 1.54), (1.0, 0.19, 0.16), WOOD, jitter=0.007 + v * 0.003)


def build_ore_cart(m, v):
    m.box((0, 0, 0.18), (0.55, 0.52, 0.12), IRON)
    for s in (-1, 1):
        m.box((s * 0.28, 0, 0.37), (0.045, 0.56, 0.34), SLATE)
        m.box((0, s * 0.26, 0.37), (0.55, 0.045, 0.34), SLATE)
        for x in (-0.18, 0.18):
            m.lathe((x, s * 0.28, 0.1), [(0, 0.095), (0.04 * s, 0.095)], IRON,
                    n=8, axis=(0, 1, 0), jitter=0)
    # An open cart with a visible inset bed and two lumps of ore.
    m.box((0, 0, 0.25), (0.48, 0.44, 0.02), "#34343d")
    for i in range(2):
        m.blob(((-1) ** i * 0.1, 0.02, 0.32), (0.12, 0.13, 0.1 + v * 0.02), SLATE, n=6)


def build_lantern(m, v):
    m.tube([(0, 0, 0), (0, 0, 1.22 + v * 0.12)], [0.045, 0.03], WOOD)
    m.tube([(0, 0, 1.2 + v * 0.12), (0.23, 0, 1.2 + v * 0.12)], 0.025, IRON, n=4)
    x, z = 0.22, 0.89 + v * 0.12
    start = len(m.faces)
    m.box((x, 0, z), (0.12, 0.12, 0.19), "#ffcf8a")
    m.glows[start:] = [True] * (len(m.faces) - start)
    for dz in (-0.12, 0.12):
        m.box((x, 0, z + dz), (0.19, 0.18, 0.055), IRON)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((x + sx * 0.075, sy * 0.075, z), (0.02, 0.02, 0.24), IRON)
    m.tube([(x, 0, z + 0.14), (x, 0, 1.2 + v * 0.12)], 0.013, IRON, n=4)


def build_rail_piece(m, v):
    for y in (-0.5, -0.25, 0, 0.25, 0.5):
        m.box((0, y, 0.028), (0.65, 0.06, 0.055), WOOD)
    for x in (-0.21, 0.21):
        m.box((x, 0, 0.069), (0.045, 1, 0.045), IRON)
        for y in (-0.25, 0.25):
            m.box((x, y, 0.095), (0.065, 0.035, 0.01), IRON if v == 0 else "#716050")
    # Sleepers at the ends are trimmed so the complete segment is exactly 1 cell.
    m.vertices = [(x, max(-0.5, min(0.5, y)), z) for x, y, z in m.vertices]


def build_crate(m, v):
    m.box((0, 0, 0.24), (0.48, 0.46, 0.48), WOOD)
    for s in (-1, 1):
        for x in (-0.17, 0.17):
            m.box((x, s * 0.24, 0.24), (0.055, 0.025, 0.48), BARK)
        for y in (-0.17, 0.17):
            m.box((s * 0.25, y, 0.24), (0.025, 0.055, 0.48), BARK)
    m.box((0, 0, 0.493), (0.055, 0.46, 0.024), BARK, tilt=0.7 + v * 0.3)


def build_barrel(m, v):
    m.lathe((0, 0, 0), [(0, 0.19), (0.1, 0.22), (0.29, 0.25), (0.48, 0.22), (0.58, 0.19)],
            WOOD, n=10, jitter=0.025, colors=[WOOD, BARK, WOOD, WOOD])
    for z in (0.12, 0.45):
        m.ring((0, 0, z), 0.23, 0.016, IRON, n=10, section=4)
    m.box((0.06 * v, 0, 0.59), (0.07, 0.07, 0.025), BARK)


def column_base(m, radius=0.31):
    m.box((0, 0, 0.07), (radius * 2, radius * 2, 0.14), RUIN, jitter=0.008)
    m.lathe((0, 0, 0.14), [(0, radius * 0.95), (0.09, radius * 0.9),
                             (0.15, radius * 0.65)], RUIN, n=12, jitter=0.025)


def build_broken_column(m, v):
    column_base(m, 0.29)
    h = 0.92 + v * 1.18
    n = 16
    rings = []
    for z in (0.27, h * 0.75, h):
        pts = []
        for i in range(n):
            a = TAU * i / n
            r = 0.19 if i % 2 else 0.225
            top = z + (m.rng.uniform(-0.12, 0.1) if z == h else 0)
            pts.append(m.vert((r * math.cos(a), r * math.sin(a), top)))
        rings.append(pts)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            m.face((a[i], a[j], b[j], b[i]), RUIN, shade=0.84 if i % 2 else 1)
    center = m.vert((0, 0, h - 0.12))
    for i in range(n):
        m.face((rings[-1][i], rings[-1][(i + 1) % n], center), RUIN_LIGHT)
    m.face(tuple(reversed(rings[0])), RUIN)


def build_column_base(m, v):
    column_base(m)
    m.lathe((0, 0, 0.29), [(0, 0.2), (0.12 + v * 0.05, 0.18)], RUIN, n=12, jitter=0.05)


def build_rubble(m, v):
    for i in range(5 + v):
        p = polar(0.23 if i else 0, i * 2.4, 0.07 + (i == 0) * 0.09)
        m.box(p, (0.22, 0.17, 0.13), RUIN if i % 2 else RUIN_LIGHT,
              tilt=m.rng.random() * 2, jitter=0.025)


def build_statue_head(m, v):
    # Flat-shaded temple head, facing -Y, sunk to the chin. Neutral stone for tinting.
    m.blob((0, 0.02, 0.35), (0.32, 0.26, 0.39), STONE, n=9)
    for s in (-1, 1):
        m.box((s * 0.12, -0.226, 0.42), (0.14, 0.045, 0.045), STONE_DARK, tilt=s * 0.12)
        m.box((s * 0.12, -0.247, 0.47), (0.18, 0.07, 0.055), STONE)
        m.blob((s * 0.3, 0.01, 0.34), (0.045, 0.07, 0.1), STONE, n=5)
    m.box((0, -0.28, 0.32), (0.085, 0.14, 0.18), STONE)
    m.box((0, -0.25, 0.16), (0.19, 0.045, 0.035), STONE_DARK)
    m.box((0.025 * v, 0.025, 0.69), (0.52, 0.43, 0.09), STONE, jitter=0.015)


def build_brazier(m, v):
    column_base(m, 0.23)
    # Bowl profile goes back inward: visible concave basin, not a solid cap.
    m.lathe((0, 0, 0.3), [(0, 0.1), (0.13, 0.23), (0.21, 0.3),
                           (0.23, 0.27), (0.13, 0.15), (0.11, 0)], RUIN, n=9)
    for i in range(3):
        start = len(m.faces)
        m.shard(polar(0.09 if i else 0, i * 2.4, 0.43), 0.06,
                0.28 + (i == v) * 0.15, "#ffb050", n=5, glow=True)
        m.glows[start:] = [True] * (len(m.faces) - start)


def build_sarcophagus(m, v):
    # Upright compact burial chest, within one cell rather than a >1-cell coffin.
    m.box((0, 0, 0.54), (0.47, 0.36, 1.08), RUIN, jitter=0.01)
    m.box((0, -0.205, 0.54), (0.52, 0.07, 1.14), RUIN_LIGHT)
    m.blob((0, -0.275, 0.88), (0.09, 0.04, 0.1), RUIN, n=6)
    m.tube([(0, -0.25, 0.76), (0, -0.25, 0.25)], [0.045, 0.025], RUIN, n=4)
    for s in (-1, 1):
        m.tube([(s * 0.12, -0.25, 0.73), (s * 0.06, -0.26, 0.57)], 0.028, RUIN, n=4)
    if v:
        m.box((0, -0.245, 0.35), (0.33, 0.008, 0.025), STONE_DARK, tilt=0.3)


def build_basalt_columns(m, v):
    for i in range(5):
        p = polar(0.24 if i else 0, i * TAU / 4 + v * 0.25)
        h = 0.35 + ((i * 3 + v) % 5) * 0.24
        m.lathe(p, [(0, 0.13), (h * 0.4, 0.132), (h, 0.13)],
                BASALT, n=6, jitter=0.02, phase=math.pi / 6)


def build_magma_rock(m, v):
    rock(m, v, radius=0.33, height=0.48, color=BASALT)
    # Branching emissive fissures embedded on the front and rising across the crown.
    for s in (-1, 1):
        pts = [(s * 0.13, -0.29, 0.12), (s * 0.08, -0.295, 0.23),
               (s * 0.12, -0.24, 0.34), (s * 0.035, -0.13, 0.45)]
        start = len(m.faces)
        m.tube(pts, [0.01, 0.013, 0.008, 0.004], "#ff5a1a", n=3)
        m.tube([pts[1], (s * 0.2, -0.255, 0.24)], [0.008, 0.003], "#ff6a20", n=3)
        m.glows[start:] = [True] * (len(m.faces) - start)


def build_ash_vent(m, v):
    # Hollow vent with a visibly dark interior; no animated smoke mesh.
    m.lathe((0, 0, 0), [(0, 0.32), (0.15, 0.24), (0.3 + v * 0.05, 0.13),
                           (0.3 + v * 0.05, 0.085), (0.08, 0.04)],
            BASALT, n=10, jitter=0.14, colors=["#484848", BASALT, "#222222", "#161616"])


def build_charred_tree(m, v):
    tree(m, v, charred=True)


def build_obsidian_shard(m, v):
    crystals(m, v, OBSIDIAN, glow=False)


def build_obsidian_spike(m, v):
    for i in range(3):
        m.shard(polar(0.18 if i else 0, i * 2.4 + v), 0.15 if i == 0 else 0.085,
                (1.5 + v * 0.85) if i == 0 else 0.55 + i * 0.13,
                OBSIDIAN if i % 2 == 0 else "#484252", n=7)


def build_chain(m, v):
    # Six interlocking, alternating-plane links: 360 triangles, ~1.7 / 2.2 long.
    r = 0.105 + v * 0.025
    for i in range(6):
        m.ring((0, 0, -r * 1.85 - i * r * 2.55), r, 0.019, IRON,
               n=10, vertical=True, yaw=(i % 2) * math.pi / 2, ellipse=1.65)


def build_bone_spire(m, v):
    for i in range(3):
        z = i * 0.32
        m.tube([(-0.18 + i * 0.04, 0.02, z), (0.12 - i * 0.03, 0, z + 0.42)],
               [0.045, 0.032], BONE, n=5)
        m.tube([(0.17 - i * 0.04, 0.1, z), (-0.11 + i * 0.03, 0.02, z + 0.42)],
               [0.04, 0.03], BONE, n=5)
    skull(m, (0, -0.035, 0.91 + v * 0.1), scale=0.8)
    m.shard((0, 0.05, 0.96), 0.055, 0.43 + v * 0.1, BONE, n=5)


def build_rune_stone(m, v):
    rock(m, v, radius=0.29, height=0.85 + v * 0.15, color=OBSIDIAN)
    # Raised angular runes on the -Y-facing surface.
    for i in range(2):
        z = 0.22 + i * 0.24
        start = len(m.faces)
        m.tube([(-0.085, -0.255, z), (0, -0.27, z + 0.07), (0.07, -0.255, z + 0.02)],
               0.009, "#ff3030", n=3)
        m.tube([(0, -0.27, z - 0.03), (0, -0.27, z + 0.13)], 0.009, "#ff3030", n=3)
        m.glows[start:] = [True] * (len(m.faces) - start)


def build_cage(m, v):
    m.ring((0, 0, -0.06), 0.055, 0.012, IRON, n=8, vertical=True)
    for z in (-0.3, -0.9 - v * 0.12):
        m.ring((0, 0, z), 0.27, 0.023, IRON, n=10)
    for i in range(8):
        a = i * TAU / 8
        m.tube([(0, 0, -0.12), polar(0.27, a, -0.3), polar(0.27, a, -0.9 - v * 0.12)],
               [0.015, 0.015, 0.015], IRON, n=3)
    m.lathe((0, 0, -0.93 - v * 0.12), [(0, 0.265), (0.035, 0.265)], IRON, n=10, jitter=0)


# --- manifest: P1 for ALL themes first, then P2 ------------------------------
# Each entry: theme, prop, builder, priority, variant count, attachment, hints.
def spec(theme, prop, priority=1, variants=2, attach="ground", **hints):
    return (theme, prop, globals()["build_" + prop], priority, variants, attach, hints)


SPECS = [
    spec("any", "rock", variants=3),
    spec("any", "boulder", blocking=True, max_radius=0.4),
    spec("any", "pebbles"),
    spec("meadow", "tree_round", blocking=True),
    spec("meadow", "tree_tall", blocking=True),
    spec("meadow", "bush", sway=0.2),
    spec("meadow", "grass_tuft", sway=0.6),
    spec("meadow", "flowers", sway=0.4),
    spec("peaks", "pine_snow", blocking=True),
    spec("peaks", "pine_small", blocking=True),
    spec("peaks", "snow_rock"),
    spec("peaks", "ice_shard"),
    spec("badlands", "cactus", blocking=True),
    spec("badlands", "dead_tree", blocking=True),
    spec("badlands", "dry_shrub", sway=0.3),
    spec("badlands", "bleached_skull"),
    spec("roots", "hanging_roots", attach="ceiling", sway=0.3),
    spec("roots", "root_arch", blocking=True),
    spec("roots", "mushroom_cluster"),
    spec("frozen", "ice_crystal", light="#9fd8ff", intensity=1),
    spec("frozen", "icicles", attach="ceiling"),
    spec("frozen", "frozen_pool_rim"),
    spec("swamp", "glow_mushroom", light="#8fff7a", intensity=1.5),
    spec("swamp", "mushroom_shelf", attach="wall", light="#8fff7a", intensity=1),
    spec("swamp", "reeds", sway=0.5),
    spec("swamp", "spore_pod", light="#7dff3a", intensity=1),
    spec("nests", "cobweb_corner", attach="wall"),
    spec("nests", "egg_sac"),
    spec("nests", "wrapped_victim", attach="ceiling"),
    spec("mines", "crystal_cluster", light="#8fa8ff", intensity=2),
    spec("mines", "support_frame", blocking=True, max_radius=None),
    spec("mines", "ore_cart", blocking=True),
    spec("mines", "lantern", light="#ffcf8a", intensity=2),
    spec("ruins", "broken_column", blocking=True),
    spec("ruins", "column_base", blocking=True),
    spec("ruins", "rubble"),
    spec("ruins", "statue_head", blocking=True),
    spec("volcanic", "basalt_columns", blocking=True),
    spec("volcanic", "magma_rock", light="#ff6a20", intensity=1),
    spec("volcanic", "ash_vent", sway=0),
    spec("abyss", "obsidian_spike", blocking=True),
    spec("abyss", "chain", attach="ceiling", sway=0.2),
    spec("abyss", "bone_spire", blocking=True),
    spec("any", "stalagmite", priority=2, blocking=True),
    spec("any", "stalactite", priority=2, attach="ceiling"),
    spec("meadow", "stump", priority=2, blocking=True),
    spec("meadow", "fallen_log", priority=2, blocking=True),
    spec("meadow", "mushroom_small", priority=2),
    spec("peaks", "snow_lump", priority=2),
    spec("peaks", "frozen_bush", priority=2, sway=0.1),
    spec("badlands", "sandstone_pillar", priority=2, blocking=True),
    spec("roots", "moss_rock", priority=2),
    spec("frozen", "frozen_spider_cocoon", priority=2),
    spec("swamp", "slime_puddle", priority=2),
    spec("swamp", "vines", priority=2, attach="ceiling", sway=0.4),
    spec("nests", "web_strands", priority=2, attach="ceiling", sway=0.3),
    spec("nests", "bone_pile", priority=2),
    spec("mines", "rail_piece", priority=2, max_radius=None),
    spec("mines", "crate", priority=2, blocking=True),
    spec("mines", "barrel", priority=2, blocking=True),
    spec("ruins", "brazier", priority=2, light="#ffb050", intensity=2),
    spec("ruins", "sarcophagus", priority=2, blocking=True),
    spec("volcanic", "charred_tree", priority=2, blocking=True),
    spec("volcanic", "obsidian_shard", priority=2),
    spec("abyss", "rune_stone", priority=2, light="#ff3030", intensity=1),
    spec("abyss", "cage", priority=2, attach="ceiling", sway=0.2),
]


def finish(m, name, attach, hints, collection):
    """Bake attachment space, color and flat normals directly into a mesh."""
    limit = hints.get("max_radius", MAX_RADIUS)
    if limit is not None and attach not in ("wall", "lip"):
        radius = max(math.hypot(x, y) for x, y, z in m.vertices)
        factor = min(1, limit / radius)
        m.vertices = [(x * factor, y * factor, z) for x, y, z in m.vertices]
    if attach == "ground":
        dz = -min(z for x, y, z in m.vertices)
        m.vertices = [(x, y, z + dz) for x, y, z in m.vertices]
    elif attach == "ceiling":
        dz = -max(z for x, y, z in m.vertices)
        m.vertices = [(x, y, z + dz) for x, y, z in m.vertices]
    elif attach in ("lip", "water", "line"):
        # Authored in attachment space (clutter.py, themes.py): cliff edge / waterline /
        # string start at the origin.
        pass
    else:
        dy = -min(y for x, y, z in m.vertices)
        m.vertices = [(x, y + dy, z) for x, y, z in m.vertices]

    # Triangulate explicitly, retaining per-face colors and material assignments.
    triangles, colors, glows = [], [], []
    for f, c, g in zip(m.faces, m.colors, m.glows):
        for i in range(1, len(f) - 1):
            triangles.append((f[0], f[i], f[i + 1]))
            colors.append(c)
            glows.append(g)
    # Eliminate zero-area triangles (e.g. trimmed rail sleeper ends).
    keep = [i for i, f in enumerate(triangles) if
            (Vector(m.vertices[f[1]]) - Vector(m.vertices[f[0]])).cross(
                Vector(m.vertices[f[2]]) - Vector(m.vertices[f[0]])).length > 1e-10]
    triangles, colors, glows = ([a[i] for i in keep] for a in (triangles, colors, glows))
    # Tiny props still meet the requested lower bound; splitting preserves shape.
    while len(triangles) < MIN_TRIANGLES:
        i = max(range(len(triangles)), key=lambda j: sum(
            (Vector(m.vertices[triangles[j][k]]) - Vector(m.vertices[triangles[j][(k + 1) % 3]])).length_squared
            for k in range(3)))
        a, b, c = triangles[i]
        mid = m.vert((Vector(m.vertices[a]) + Vector(m.vertices[b]) + Vector(m.vertices[c])) / 3)
        col, glow = colors[i], glows[i]
        triangles[i] = (a, b, mid)
        triangles.extend([(b, c, mid), (c, a, mid)])
        colors.extend([col, col])
        glows.extend([glow, glow])

    old = bpy.data.objects.get(name)
    if old:
        if old.get("cube_crawler_prop") is not True:
            raise ValueError(f"Refusing to replace unrelated object: {name}")
        data = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(m.vertices, [], triangles)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material("Props_VertexColor"))
    light = hints.get("light")
    if any(glows):
        if not light:
            raise ValueError(f"Emissive geometry without light hint: {name}")
        mesh.materials.append(material(name + "_glow", light, max(1, min(3, hints.get("intensity", 1)))))
    attr = mesh.color_attributes.new(name=COLOR_ATTRIBUTE, type="FLOAT_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = attr
    for poly, color, glow in zip(mesh.polygons, colors, glows):
        poly.use_smooth = False
        poly.material_index = int(glow)
        for loop in poly.loop_indices:
            attr.data[loop].color = color
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["cube_crawler_prop"] = True
    obj["attach"] = attach
    obj["blocking"] = bool(hints.get("blocking", False))
    if attach == "wall":
        radius = max(math.hypot(x, z) for x, y, z in m.vertices)
    elif attach == "lip":
        radius = max(abs(x) for x, y, z in m.vertices)
    else:
        radius = max(math.hypot(x, y) for x, y, z in m.vertices)
    obj["radius"] = math.ceil(radius * 10000) / 10000
    for key in ("light", "intensity", "sway"):
        if key in hints:
            obj[key] = hints[key]
    return obj


def build(scene=None, priority=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for theme, prop, builder, p, count, attach, hints in SPECS:
        if priority is not None and p != priority:
            continue
        for variant in range(count):
            name = f"{theme}_{prop}_{chr(97 + variant)}"
            seed = SEED + int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big")
            m = Mesh(random.Random(seed))
            builder(m, variant)
            info = dict(hints)
            if prop == "crystal_cluster" and variant == 1:
                info["light"] = "#c08fff"
            obj = finish(m, name, attach, info, collection)
            obj["priority"] = p
            objects.append(obj)
    return objects


def validate(objects):
    """Fail export on attachment, budget, transform, color or mesh regressions."""
    report = []
    assert len({o.name for o in objects}) == len(objects)
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        count = len(mesh.loop_triangles)
        budget = TREE_TRIANGLES if any(word in obj.name for word in ("tree", "pine")) else MAX_TRIANGLES
        assert MIN_TRIANGLES <= count <= budget, (obj.name, count, budget)
        assert obj.parent is None and not obj.modifiers and not obj.constraints, obj.name
        assert tuple(obj.scale) == (1, 1, 1) and tuple(obj.rotation_euler) == (0, 0, 0), obj.name
        assert not any(p.use_smooth for p in mesh.polygons), obj.name
        assert not mesh.uv_layers and COLOR_ATTRIBUTE in mesh.color_attributes, obj.name
        assert all(math.isfinite(c) for v in mesh.vertices for c in v.co), obj.name
        for tri in mesh.loop_triangles:
            a, b, c = (mesh.vertices[i].co for i in tri.vertices)
            assert (b - a).cross(c - a).length > 1e-10, obj.name
        lo = [min(v.co[k] for v in mesh.vertices) for k in range(3)]
        hi = [max(v.co[k] for v in mesh.vertices) for k in range(3)]
        attach = obj["attach"]
        if attach == "ground":
            assert abs(lo[2]) < 1e-6 and hi[2] > 0, obj.name
            if "support_frame" not in obj.name and "rail_piece" not in obj.name:
                assert obj["radius"] <= MAX_RADIUS + 0.0001, (obj.name, obj["radius"])
        elif attach == "ceiling":
            assert abs(hi[2]) < 1e-6 and lo[2] < 0, obj.name
        else:
            assert abs(lo[1]) < 1e-6 and hi[1] > 0, obj.name
        neutral_stone = (obj.name.startswith(("any_", "ruins_")) or
                         any(word in obj.name for word in ("sandstone_pillar", "basalt_columns", "magma_rock", "ash_vent")))
        if neutral_stone:
            for poly in mesh.polygons:
                if poly.material_index == 0:
                    for i in poly.loop_indices:
                        color = mesh.color_attributes[COLOR_ATTRIBUTE].data[i].color[:3]
                        assert max(color) - min(color) < 1e-6, obj.name
        if "light" in obj:
            assert any(p.material_index == 1 for p in mesh.polygons), obj.name
            assert mesh.materials[1].name == obj.name + "_glow", obj.name
        if "rail_piece" in obj.name:
            assert abs(hi[1] - lo[1] - 1) < 1e-6, obj.name
        if "support_frame" in obj.name:
            assert abs(hi[0] - lo[0] - 1) < 1e-6, obj.name
        report.append({"name": obj.name, "triangles": count, "size": [round(b - a, 3) for a, b in zip(lo, hi)],
                       "attach": attach, "radius": obj["radius"]})
    return report


def export_gltf(objects, path, animations=False):
    """animations: also export the objects' children and their NLA-owned actions as clips."""
    path = str(Path(path).resolve())
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    active = bpy.context.view_layer.objects.active
    selected = list(bpy.context.selected_objects)
    states = [(o, o.location.copy(), o.hide_get(), o.hide_viewport) for o in objects]
    try:
        bpy.ops.object.select_all(action="DESELECT")
        for obj, location, hidden, viewport in states:
            obj.location = (0, 0, 0)
            obj.hide_viewport = False
            obj.hide_set(False)
            obj.select_set(True)
            if animations:
                for child in obj.children_recursive:
                    child.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        anim = dict(export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_step=1) if animations else {}
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, use_active_scene=True,
                                  export_yup=True, export_extras=True, export_animations=animations,
                                  export_normals=True, export_texcoords=False,
                                  export_materials="EXPORT", export_cameras=False, export_lights=False, **anim)
    finally:
        bpy.ops.object.select_all(action="DESELECT")
        for obj, location, hidden, viewport in states:
            obj.location = location
            obj.hide_viewport = viewport
            obj.hide_set(hidden)
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active


def set_of(obj):
    """A prop's set: the first part of its name (`abyss_cage_a` -> `abyss`)."""
    return obj.name.split("_")[0]


def export_sets(objects, directory, export=export_gltf):
    """One GLB per prop set, directory/<set>.glb, each with its props in their order; GLBs of
    sets that are gone are removed. export(objects, path) writes one (export_gltf by default)."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    sets = {}
    for obj in objects:
        sets.setdefault(set_of(obj), []).append(obj)
    for name, members in sets.items():
        export(members, directory / f"{name}.glb")
    for old in directory.glob("*.glb"):
        if old.stem not in sets:
            old.unlink()
    return sorted(sets)


def layout_preview(objects, spacing=1.35, row_spacing=4.6):
    """P1/P2 in manifest order, variants adjacent. Ceiling origins sit at z=3.3."""
    themes = list(dict.fromkeys(s[0] for s in SPECS))
    for row, theme in enumerate(themes):
        props = [obj for obj in objects if obj.name.startswith(theme + "_")]
        for col, obj in enumerate(props):
            obj.location = (col * spacing, row * row_spacing, 3.3 if obj["attach"] == "ceiling" else
                            1 if obj["attach"] == "wall" else 0)
    return objects


def output_dirs(directory=None):
    """(assets, blend, previews) folders for a library export.

    By default: exports to assets/, the .blend next to the script, renders to
    blender/previews/. An explicit directory receives everything (scratch builds)."""
    if directory:
        directory = Path(directory).resolve()
        return directory, directory, directory
    return ASSETS, HERE, PREVIEWS


def main(scene=None, export_dir=None):
    obj = bpy.context.object
    if obj is not None and obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    objects = build(scene)
    report = validate(objects)
    if export_dir:
        export_sets(objects, export_dir)
    print(f"Cube Crawler: {len(objects)} props, {sum(r['triangles'] for r in report)} triangles")
    return objects


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) > 1:
        raise SystemExit("Usage: Blender -b --python blender/props.py -- [assets/props]")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    main(export_dir=args[0] if args else str(ASSETS / "props"))
