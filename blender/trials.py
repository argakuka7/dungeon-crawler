"""
The trial rooms' parts (docs/trials.md "Assets"): assets/trials.glb.

Same contract as props.py: one Blender unit = one cell, Z up, flat normals, linear
COLOR_0, glowing faces on an extra "<name>_glow" material. Unlike a prop, a part is
built from PIECES, each its own mesh named "trial_<part>[_<piece>]" at the origin, so
the game (src/render/trials.js) can move them: a lever's arm, a gate's bars, a
mirror's turntable, a flame. A piece is authored where it sits in its part, except
the ones that turn about a point off the ground: those are authored round their
pivot and carry it in their extras (`pivot`, glTF coordinates: x, y up, z front).
"Front" is glTF +Z, Blender -Y.

Pieces the game recolours (a knob, a rune, a gem, water) are white or plain; the game
gives them their material. What the trials reuse from the prop libraries is not here:
the crate (mines_crate_a) and the brazier (ruins_brazier_a, its flame lit or not).

Headless (build, export, render a preview):
    Blender -b --python blender/trials.py -- [output-directory] [--no-render]
then `npm run compress-assets`.

Inside Blender / MCP:
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, props, clutter_geo, trials
    for mod in (props, clutter_geo, trials): importlib.reload(mod)
    trials.main(render=False)
"""
import hashlib
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import props  # noqa: E402
from props import TAU, polar, STONE, STONE_DARK, WOOD, BARK, IRON  # noqa: E402
from clutter_geo import lit, xform, prism, pebble, BRASS, CHAR, LEATHER  # noqa: E402

SEED = 7171
COLLECTION = "CubeCrawlerTrials"
STONE_LIGHT = "#a8a8a8"
COPPER = "#c87533"
IRON_DARK = "#33343a"
GROOVE = "#3a3d44"
VOID = "#060408"
WHITE = "#ffffff"
WATER = "#3f8fe0"
RED = "#c03a2a"
FLAME = "#ffb050"
ASHES = "#4a4440"


def block(m, corners, y0, y1, color):
    """A solid from a quad in the XZ plane (corners: 4 (x, z), any winding) extruded y0..y1."""
    a = [m.vert((x, y0, z)) for x, z in corners]
    b = [m.vert((x, y1, z)) for x, z in corners]
    m.face(a, color)
    m.face(tuple(reversed(b)), color, shade=0.9)
    for i in range(4):
        j = (i + 1) % 4
        m.face((a[i], a[j], b[j], b[i]), color, shade=0.95)


def flame(m, n=3, height=0.4, radius=0.07, spread=0.09, color=FLAME):
    """Tongues of fire standing on z = 0 (the ruins brazier's, bigger as asked)."""
    start = len(m.faces)
    for i in range(n):
        m.shard(polar(spread if i else 0, i * TAU / max(1, n - 1) + 0.4, 0), radius * (1.25 if i == 0 else 1),
                height * (1 if i == 0 else 0.62 + 0.12 * (i % 3)), color, n=5, glow=True)
    lit(m, start)


# --- buttons and the parts built on them ------------------------------------------------------
def build_button(m):
    # a stepped octagonal plinth, a shaft with a brass band, a capital with a brass cup for the knob
    m.lathe((0, 0, 0), [(0, 0.38), (0.06, 0.38), (0.08, 0.34), (0.13, 0.32), (0.15, 0.28)], STONE, n=8, jitter=0)
    m.lathe((0, 0, 0.15), [(0, 0.22), (0.38, 0.2), (0.44, 0.26), (0.5, 0.33), (0.56, 0.34)], STONE, n=8, jitter=0,
            colors=[STONE, STONE, STONE_LIGHT, STONE_LIGHT])
    m.ring((0, 0, 0.33), 0.215, 0.022, BRASS, n=8, section=4)
    m.lathe((0, 0, 0.7), [(0, 0.2), (0.02, 0.21), (0.05, 0.19), (0.06, 0.15)], BRASS, n=10, jitter=0)


def build_knob(m):
    # the glowing dome on a button, its base at z = 0
    m.lathe((0, 0, 0), [(0, 0.15), (0.05, 0.148), (0.1, 0.115), (0.14, 0.05), (0.155, 0)], WHITE, n=10, jitter=0)
    lit(m, 0)


def build_rod(m):
    # the lightning rod: a squat plinth, an iron mast held by struts, copper coils and spike;
    # its knob (trial_knob) in a brass cup at the plinth's front
    m.lathe((0, 0, 0), [(0, 0.44), (0.08, 0.43), (0.12, 0.36), (0.5, 0.3), (0.56, 0.38), (0.66, 0.38)],
            STONE, n=6, jitter=0, colors=[STONE, STONE, STONE, STONE_LIGHT, STONE_LIGHT])
    m.lathe((0, -0.2, 0.62), [(0, 0.17), (0.06, 0.18), (0.08, 0.16)], BRASS, n=10, jitter=0)
    m.tube([(0, 0, 0.6), (0, 0, 1.8), (0, 0, 3.0)], [0.075, 0.055, 0.04], IRON, n=6)
    for a in (math.pi / 2, math.pi / 2 + TAU / 3, math.pi / 2 - TAU / 3):
        m.tube([polar(0.3, a, 0.64), polar(0.04, a, 1.35)], 0.025, IRON_DARK, n=4)
    for z in (2.5, 2.6, 2.7, 2.8):
        m.ring((0, 0, z), 0.085, 0.016, COPPER, n=8, section=3)
    for a in (0, math.pi / 2):
        m.tube([polar(-0.28, a, 2.35), polar(0.28, a, 2.35)], 0.02, IRON, n=4)
        for s in (-1, 1):
            m.lathe(polar(0.28 * s, a, 2.35), [(0, 0.025), (0.16, 0)], COPPER, n=4, jitter=0)
    m.lathe((0, 0, 2.98), [(0, 0.065), (0.08, 0.045), (0.45, 0)], COPPER, n=6, jitter=0)


def build_valve(m):
    # the vent valve: a stone collar, a bronze pipe out of the ground, a big iron handwheel; its
    # knob (trial_knob) on the wheel's hub
    m.lathe((0, 0, 0), [(0, 0.36), (0.1, 0.34), (0.16, 0.26), (0.2, 0.22)], STONE, n=8, jitter=0)
    m.tube([(0, 0, 0.18), (0, 0, 0.84)], 0.095, COPPER, n=8)
    for z in (0.34, 0.66):
        m.lathe((0, 0, z), [(0, 0.13), (0.05, 0.13)], BRASS, n=8, jitter=0)
    # a vent elbow off to the side, puffing (dark mouth)
    m.tube([(0, 0, 0.5), (0.22, 0, 0.5), (0.3, 0, 0.42)], 0.06, COPPER, n=6)
    m.lathe((0.32, 0, 0.36), [(0, 0.075), (0.06, 0.09), (0.065, 0.06)], IRON_DARK, n=8, jitter=0)
    m.ring((0, 0, 0.86), 0.3, 0.032, IRON, n=14, section=4)
    for i in range(5):
        a = i * TAU / 5
        m.tube([polar(0.05, a, 0.86), polar(0.28, a, 0.86)], 0.02, IRON, n=4)
    m.lathe((0, 0, 0.83), [(0, 0.07), (0.07, 0.07)], IRON_DARK, n=8, jitter=0)


# --- plates, waypads ------------------------------------------------------------------------------
def build_plate(m):
    m.box((0, 0, 0.025), (0.86, 0.86, 0.05), STONE_DARK)
    m.box((0, 0, 0.065), (0.76, 0.76, 0.03), STONE)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * 0.38, sy * 0.38, 0.06), (0.07, 0.07, 0.025), IRON)
    # the groove the rune sits in
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        m.box(polar(0.17, a, 0.081), (0.3, 0.09, 0.004), GROOVE, tilt=a + math.pi / 2)


def diamond(m, r, w, z, h):
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        m.box(polar(r / math.sqrt(2), a, z), (r * math.sqrt(2) + w * 0.7, w, h), WHITE, tilt=a + math.pi / 2)


def build_plate_rune(m):
    diamond(m, 0.24, 0.055, 0.09, 0.016)
    m.box((0, 0, 0.09), (0.07, 0.07, 0.016), WHITE, tilt=math.pi / 4)
    lit(m, 0)


def build_waypad(m):
    m.lathe((0, 0, 0), [(0, 0.5), (0.05, 0.5), (0.08, 0.46)], STONE, n=12, jitter=0)
    m.lathe((0, 0, 0.08), [(0, 0.37), (0.006, 0.37)], GROOVE, n=12, jitter=0)
    for i in range(6):
        m.box(polar(0.42, i * TAU / 6 + TAU / 12, 0.085), (0.06, 0.06, 0.03), BRASS, tilt=i * TAU / 6)


def build_waypad_rune(m):
    R = 0.27
    for i in range(6):
        a = i * TAU / 6
        m.box(polar(R * math.cos(math.pi / 6), a, 0.095), (R + 0.04, 0.07, 0.014), WHITE, tilt=a + math.pi / 2)
    for i in range(3):
        m.box(polar(0.1, i * TAU / 3, 0.095), (0.05, 0.05, 0.014), WHITE, tilt=i * TAU / 3)
    lit(m, 0)


# --- gates and the cage ------------------------------------------------------------------------
def build_portcullis_post(m):
    # a gate post of dressed stone blocks with a groove the bars run in (toward x = 0: the
    # game mirrors the right-hand one), a plinth and a capital under the lintel
    m.box((0, 0, 0.08), (0.34, 0.44, 0.16), STONE_DARK)
    z = 0.16
    for i, h in enumerate((0.5, 0.46, 0.52, 0.48)):
        m.box((0, 0, z + h / 2), (0.24 - 0.02 * (i % 2), 0.36, h - 0.012), STONE if i % 2 else STONE_LIGHT, jitter=0.006)
        z += h
    m.box((0, 0, z + 0.07), (0.32, 0.42, 0.14), STONE_DARK)
    m.box((0.115, 0, (0.16 + z) / 2), (0.012, 0.09, z - 0.16), VOID)


def build_portcullis_lintel(m):
    # one cell of the lintel over the gate (one per cell side by side): a beam with a carved
    # band and the dark slot the bars rise into
    m.box((0, 0, 2.66), (1.0, 0.4, 0.22), STONE, jitter=0.004)
    m.box((0, -0.205, 2.66), (0.98, 0.012, 0.05), STONE_DARK)
    m.box((0, 0, 2.548), (0.96, 0.08, 0.008), VOID)
    m.box((0, 0, 2.8), (1.0, 0.44, 0.06), STONE_LIGHT)


def build_portcullis_bars(m):
    # one cell of the iron grate (x -0.5..0.5): four bars ending in spikes, three cross straps
    # with rivets
    for x in (-0.375, -0.125, 0.125, 0.375):
        m.box((x, 0, 1.24), (0.055, 0.055, 1.96), IRON)
        m.lathe((x, 0, 0.0), [(0, 0), (0.26, 0.05)], IRON_DARK, n=4, jitter=0, phase=math.pi / 4)
    for z in (0.62, 1.38, 2.1):
        m.box((0, 0, z), (1.0, 0.075, 0.08), IRON_DARK)
        for x in (-0.375, -0.125, 0.125, 0.375):
            m.box((x, -0.045, z), (0.04, 0.02, 0.04), BRASS)
    m.box((0, 0, 1.0), (0.98, 0.02, 0.02), IRON, tilt=0)


def build_cage(m):
    # an iron cage round a vault's chest (1.16 across, 1.36 tall): bars on four sides, bands,
    # a lattice roof with a ring on top
    for s in range(4):
        for i in range(5):
            t = -0.5 + i * 0.25
            x, y = [(t, -0.55), (t, 0.55), (-0.55, t), (0.55, t)][s]
            m.box((x, y, 0.66), (0.045, 0.045, 1.24), IRON)
    for z in (0.06, 0.7, 1.3):
        for s in (-1, 1):
            m.box((0, s * 0.55, z), (1.16, 0.06, 0.07), IRON_DARK)
            m.box((s * 0.55, 0, z), (0.06, 1.16, 0.07), IRON_DARK)
    for t in (-0.25, 0, 0.25):
        m.box((t, 0, 1.33), (0.04, 1.1, 0.03), IRON)
        m.box((0, t, 1.33), (1.1, 0.04, 0.03), IRON)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.lathe((sx * 0.55, sy * 0.55, 1.3), [(0, 0.05), (0.14, 0)], BRASS, n=4, jitter=0, phase=math.pi / 4)
    m.ring((0, 0, 1.42), 0.08, 0.015, IRON, n=8, vertical=True)


# --- levers ------------------------------------------------------------------------------------
LEVER_PIVOT = 0.4


def build_lever(m):
    # a dressed stone block, an iron slot plate on top, the iron cheeks holding the axle
    m.box((0, 0, 0.11), (0.5, 0.36, 0.22), STONE_DARK)
    m.box((0, 0, 0.27), (0.44, 0.3, 0.1), STONE)
    m.box((0, 0, 0.325), (0.38, 0.14, 0.012), IRON_DARK)
    m.box((0, 0, 0.329), (0.32, 0.04, 0.008), VOID)
    for s in (-1, 1):
        m.box((0, s * 0.06, LEVER_PIVOT - 0.02), (0.14, 0.025, 0.16), IRON)
        m.lathe((0, s * 0.075, LEVER_PIVOT), [(0, 0.035), (0.02, 0.035)], BRASS, n=6, jitter=0, axis=(0, s, 0))


def build_lever_arm(m):
    # round its pivot: the hub on the axle, the shaft, a leather grip
    m.lathe((0, -0.05, 0), [(0, 0.04), (0.1, 0.04)], IRON_DARK, n=8, jitter=0, axis=(0, 1, 0))
    m.tube([(0, 0, 0), (0, 0, 0.6)], [0.028, 0.022], IRON, n=6)
    m.tube([(0, 0, 0.38), (0, 0, 0.57)], 0.036, LEATHER, n=6)


def build_lever_knob(m):
    # round the lever's pivot too, on the arm's end; the game colours it (red: the reset)
    m.lathe((0, 0, 0.57), [(0, 0.035), (0.03, 0.07), (0.09, 0.075), (0.14, 0.04), (0.155, 0)], WHITE, n=8, jitter=0)


# --- mirrors and crystals ------------------------------------------------------------------------
BEAM_Y = 0.75


def build_mirror(m):
    m.lathe((0, 0, 0), [(0, 0.34), (0.05, 0.34), (0.07, 0.3), (0.14, 0.28), (0.16, 0.23)], STONE, n=10, jitter=0)
    for i in range(10):
        m.box(polar(0.275, i * TAU / 10, 0.15), (0.05, 0.04, 0.03), STONE_DARK, tilt=i * TAU / 10)


def build_mirror_frame(m):
    # turns with the pane: a brass turntable, a yoke and a frame round the pane
    m.lathe((0, 0, 0.16), [(0, 0.21), (0.04, 0.21), (0.05, 0.18)], BRASS, n=12, jitter=0)
    m.tube([(0, 0, 0.2), (0, 0, 0.38)], 0.04, IRON, n=6)
    m.box((0, 0, 0.4), (0.78, 0.07, 0.05), IRON)
    for s in (-1, 1):
        m.box((s * 0.37, 0, 0.75), (0.045, 0.07, 0.72), IRON)
        m.lathe((s * 0.37, 0, 1.11), [(0, 0.035), (0.08, 0)], BRASS, n=4, jitter=0)
        m.box((s * 0.33, 0, 0.75), (0.04, 0.06, 0.66), BRASS)
    for z in (0.44, 1.06):
        m.box((0, 0, z), (0.7, 0.06, 0.04), BRASS)


def build_mirror_pane(m):
    m.box((0, 0, BEAM_Y), (0.62, 0.025, 0.6), "#d8e6f0")


def pedestal(m, n):
    m.lathe((0, 0, 0), [(0, 0.3), (0.07, 0.3), (0.1, 0.24), (0.4, 0.19), (0.44, 0.25), (0.5, 0.25)], STONE, n=n,
            jitter=0, phase=math.pi / n, colors=[STONE, STONE, STONE, STONE_LIGHT, STONE_LIGHT])


def build_emitter(m):
    # the beam's source: a hexagonal pedestal, brass claws holding the crystal up
    pedestal(m, 6)
    for i in range(3):
        a = i * TAU / 3
        m.tube([polar(0.16, a, 0.48), polar(0.2, a, 0.62), polar(0.13, a, 0.84)], [0.025, 0.022, 0.012], BRASS, n=4)
    m.ring((0, 0, 0.5), 0.17, 0.025, BRASS, n=10, section=4)


def build_receiver(m):
    # what the beam must reach: a square pedestal with a brass dish cradling the crystal
    pedestal(m, 4)
    m.lathe((0, 0, 0.5), [(0, 0.05), (0.04, 0.09), (0.1, 0.2), (0.12, 0.22)], BRASS, n=10, jitter=0)
    for i in range(4):
        a = i * TAU / 4 + math.pi / 4
        m.tube([polar(0.2, a, 0.62), polar(0.24, a, 0.82)], [0.02, 0.01], BRASS, n=4)


def build_gem(m):
    m.lathe((0, 0, BEAM_Y - 0.2), [(0, 0), (0.18, 0.15), (0.24, 0.15), (0.4, 0)], WHITE, n=6, jitter=0)
    lit(m, 0)


# --- fires -----------------------------------------------------------------------------------------
GREAT_FIRE_PIVOT = 0.16
BEACON_PIVOT = 1.5


def build_great_fire(m):
    # the cold's great fire: a ring of big stones, ashes, a stack of logs
    for i in range(11):
        a = i * TAU / 11
        pebble(m, polar(0.62, a, 0), 0.13 + 0.03 * (i % 3), STONE if i % 2 else STONE_LIGHT, n=6, h=0.2 + 0.04 * (i % 2))
    m.lathe((0, 0, 0), [(0, 0.55), (0.04, 0.5), (0.06, 0.3)], ASHES, n=11, jitter=0.05)
    for i in range(7):
        a = i * TAU / 7 + 0.3
        m.tube([polar(0.46, a, 0.04), polar(0.05, a + 0.4, 0.62)], [0.06, 0.04], BARK if i % 2 else WOOD, n=5)
    for i in range(3):
        m.tube([polar(0.4, i * 2.1, 0.08), polar(0.4, i * 2.1 + 2.6, 0.1)], 0.05, CHAR, n=5)


def build_great_fire_flame(m):
    flame(m, n=7, height=1.0, radius=0.15, spread=0.22)


def build_beacon(m):
    # the siege's beacon: stepped base, a tapering square pillar, an iron fire basket on top
    m.box((0, 0, 0.06), (0.92, 0.92, 0.12), STONE_DARK)
    m.box((0, 0, 0.18), (0.74, 0.74, 0.12), STONE)
    m.lathe((0, 0, 0.24), [(0, 0.38), (1.0, 0.3), (1.08, 0.36), (1.18, 0.4)], STONE, n=4, jitter=0,
            phase=math.pi / 4, colors=[STONE_LIGHT, STONE, STONE])
    for z in (0.5, 0.86):
        m.box((0, 0, z), (0.5, 0.5, 0.05), STONE_DARK)
    # the basket: a ring of straps flaring out, two bands, coals in it
    for i in range(10):
        a = i * TAU / 10
        m.tube([polar(0.2, a, 1.4), polar(0.27, a, 1.55), polar(0.4, a, 1.78)], [0.025, 0.025, 0.02], IRON, n=4)
        m.lathe(polar(0.4, a, 1.78), [(0, 0.022), (0.08, 0)], IRON_DARK, n=4, jitter=0)
    m.ring((0, 0, 1.55), 0.27, 0.025, IRON_DARK, n=12, section=4)
    m.ring((0, 0, 1.76), 0.39, 0.025, IRON_DARK, n=14, section=4)
    m.lathe((0, 0, 1.4), [(0, 0.22), (0.1, 0.26), (0.16, 0.18)], CHAR, n=9, jitter=0.1)


def build_beacon_flame(m):
    flame(m, n=6, height=0.95, radius=0.14, spread=0.17)


# --- the channel tiles ---------------------------------------------------------------------------
# a 3x3 grid over the slab; the channel runs through the middle and the arms (glTF +x, -x, +z:
# Blender +x, -x, -y); the rest is raised
EDGES = (-0.48, -0.13, 0.13, 0.48)
ARMS = {"I": ((2, 1), (0, 1)), "L": ((2, 1), (1, 0)), "T": ((2, 1), (0, 1), (1, 0))}


def cell_box(m, i, j, z0, z1, color, inset=0.0):
    x0, x1, y0, y1 = EDGES[i] + inset, EDGES[i + 1] - inset, EDGES[j] + inset, EDGES[j + 1] - inset
    m.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), color)


def tile_builder(shape):
    def build(m):
        m.box((0, 0, 0.03), (0.96, 0.96, 0.06), STONE_DARK)
        channel = {(1, 1), *ARMS[shape]}
        for i in range(3):
            for j in range(3):
                if (i, j) in channel:
                    cell_box(m, i, j, 0.06, 0.07, GROOVE)
                else:
                    cell_box(m, i, j, 0.06, 0.14, STONE, inset=0.008)
    return build


def water_builder(shape):
    def build(m):
        for i, j in {(1, 1), *ARMS[shape]}:
            cell_box(m, i, j, 0.07, 0.1, WATER, inset=0.02)
    return build


# --- spout and wheel ---------------------------------------------------------------------------------
WHEEL_PIVOT = 0.5


def build_spout(m):
    # a pipe out of a stone block, pouring at +x
    m.box((-0.42, 0, 0.32), (0.18, 0.42, 0.64), STONE)
    m.box((-0.42, 0, 0.67), (0.22, 0.46, 0.06), STONE_LIGHT)
    m.tube([(-0.36, 0, 0.36), (0.32, 0, 0.36)], 0.1, IRON, n=8)
    for x in (-0.3, 0.05):
        m.lathe((x, 0, 0.36), [(0, 0.13), (0.05, 0.13)], BRASS, n=8, jitter=0, axis=(1, 0, 0))
    m.lathe((0.3, 0, 0.36), [(0, 0.1), (0.08, 0.14), (0.1, 0.13)], IRON_DARK, n=8, jitter=0, axis=(1, 0, 0))
    m.tube([(0.05, 0, 0.26), (0.05, 0, 0.0)], 0.03, IRON_DARK, n=4)
    m.box((0.05, 0, 0.015), (0.14, 0.14, 0.03), IRON_DARK)


def build_spout_stream(m):
    # what pours out (the game colours it: water or lava), a splash where it lands
    m.tube([(0.4, 0, 0.34), (0.46, 0, 0.22), (0.49, 0, 0.0)], [0.07, 0.075, 0.08], WHITE, n=6)
    m.lathe((0.49, 0, 0), [(0, 0.17), (0.02, 0.15), (0.03, 0.08)], WHITE, n=8, jitter=0.15)


def build_wheel_frame(m):
    # two wooden trestles holding the wheel's axle
    for y in (-0.24, 0.24):
        m.box((0, y, 0.04), (0.8, 0.09, 0.08), BARK)
        for s in (-1, 1):
            m.tube([(s * 0.32, y, 0.06), (0, y, WHEEL_PIVOT + 0.04)], 0.035, WOOD, n=4)
        m.box((0, y, WHEEL_PIVOT), (0.1, 0.1, 0.12), IRON_DARK)


def build_wheel(m):
    # round its axle (Blender y; the game turns it about glTF z): two rims, spokes, paddles
    m.lathe((0, -0.3, 0), [(0, 0.035), (0.6, 0.035)], IRON, n=6, jitter=0, axis=(0, 1, 0))
    m.lathe((0, -0.12, 0), [(0, 0.08), (0.24, 0.08)], WOOD, n=8, jitter=0, axis=(0, 1, 0))
    for y in (-0.1, 0.1):
        m.ring((0, y, 0), 0.4, 0.028, BARK, n=16, section=4, vertical=True)
        for i in range(6):
            a = i * TAU / 6
            m.tube([(0.07 * math.cos(a), y, 0.07 * math.sin(a)), (0.4 * math.cos(a), y, 0.4 * math.sin(a))], 0.022, WOOD, n=4)
    for i in range(8):
        a = i * TAU / 8 + 0.2
        start = len(m.vertices)
        m.box((0.44, 0, 0), (0.18, 0.28, 0.035), WOOD)
        xform(m, start, rot=(0, -a, 0))


# --- the sluice tank ----------------------------------------------------------------------------------
def build_tank(m):
    # its walls one unit tall (the game stretches them to what the tank holds), corner posts
    for x, y, w, d in ((0, -0.42, 0.9, 0.07), (0, 0.42, 0.9, 0.07), (-0.42, 0, 0.07, 0.9), (0.42, 0, 0.07, 0.9)):
        m.box((x, y, 0.5), (w, d, 1.0), STONE)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * 0.44, sy * 0.44, 0.5), (0.11, 0.11, 1.0), STONE_DARK)


def build_tank_floor(m):
    m.box((0, 0, 0.03), (1.0, 1.0, 0.06), STONE_DARK)
    m.box((0, 0, 0.155), (0.84, 0.84, 0.19), STONE)


def build_tank_rim(m):
    # coping stones on the walls' top (the game puts it there), brass caps on the corners
    for x, y, w, d in ((0, -0.43, 1.0, 0.12), (0, 0.43, 1.0, 0.12), (-0.43, 0, 0.12, 0.76), (0.43, 0, 0.12, 0.76)):
        m.box((x, y, 0.03), (w, d, 0.06), STONE_LIGHT)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.lathe((sx * 0.44, sy * 0.44, 0.06), [(0, 0.05), (0.05, 0.04), (0.08, 0)], BRASS, n=4, jitter=0, phase=math.pi / 4)


def build_float(m):
    # a bobber, its waterline at z = 0
    m.lathe((0, 0, -0.07), [(0, 0), (0.03, 0.07), (0.07, 0.09)], WOOD, n=8, jitter=0)
    m.lathe((0, 0, 0), [(0, 0.09), (0.04, 0.07), (0.08, 0)], RED, n=8, jitter=0)
    m.tube([(0, 0, 0.06), (0, 0, 0.2)], 0.012, WOOD, n=4)


# --- runes ---------------------------------------------------------------------------------------------
def build_runestone(m):
    # a standing stone with a flat panel front and back (the game puts its glyph there:
    # 0.4 across at 0.72, the faces at glTF z +-0.15), framed; rubble round its foot
    out = [(-0.22, -0.15), (0.22, -0.15), (0.27, -0.06), (0.27, 0.06), (0.22, 0.15), (-0.22, 0.15), (-0.27, 0.06), (-0.27, -0.06)]
    tops = [1.08, 1.13, 1.1, 1.05, 1.11, 1.06, 1.0, 1.03]
    prism(m, out, 0, tops, STONE, top=STONE_LIGHT)
    for s in (-1, 1):
        y = s * 0.158
        for z in (0.5, 0.94):
            m.box((0, y, z), (0.46, 0.016, 0.04), STONE_DARK)
        for x in (-0.21, 0.21):
            m.box((x, y, 0.72), (0.04, 0.016, 0.48), STONE_DARK)
    m.box((0, 0, 0.04), (0.66, 0.44, 0.08), STONE_DARK, jitter=0.01)
    for i in range(4):
        pebble(m, polar(0.33, 0.5 + i * TAU / 4, 0), 0.06 + 0.015 * (i % 2), STONE, n=5)


def build_tablet(m):
    # the clue tablet: a plinth, a slab with a raised border (the glyphs go on its front at
    # glTF z 0.061, in a row at 0.68), a peaked cap
    m.box((0, 0, 0.05), (0.84, 0.48, 0.1), STONE_DARK)
    m.box((0, 0, 0.2), (0.72, 0.4, 0.2), STONE)
    m.box((0, 0, 0.65), (0.9, 0.12, 0.7), STONE)
    for y in (-0.065, 0.065):
        for z in (0.33, 0.97):
            m.box((0, y, z), (0.9, 0.016, 0.05), STONE_DARK)
        for x in (-0.425, 0.425):
            m.box((x, y, 0.65), (0.05, 0.016, 0.66), STONE_DARK)
    start = len(m.vertices)
    prism(m, [(-0.5, 0), (0.5, 0), (0, 0.16)], -0.08, 0.08, STONE_LIGHT)
    xform(m, start, rot=(math.pi / 2, 0, 0), offset=(0, 0, 1.0))


# --- the siege's spawn mouth -----------------------------------------------------------------------------
def build_mouth(m):
    # a rough arch of big blocks round a dark opening, facing front (glTF +z)
    for s in (-1, 1):
        z = 0
        for i, h in enumerate((0.5, 0.46, 0.44)):
            w = 0.32 - 0.03 * (i % 2)
            m.box((s * 0.6, 0, z + h / 2), (w, 0.42, h - 0.015), STONE if (i + (s > 0)) % 2 else STONE_LIGHT, jitter=0.02)
            z += h
    cz, r0, r1, n = 1.4, 0.45, 0.78, 7
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        grow = 0.08 if i == n // 2 else 0
        corners = [(r0 * math.cos(a0), cz + r0 * math.sin(a0)), (r1 * math.cos(a0) * (1 + grow), cz + (r1 + grow) * math.sin(a0)),
                   (r1 * math.cos(a1) * (1 + grow), cz + (r1 + grow) * math.sin(a1)), (r0 * math.cos(a1), cz + r0 * math.sin(a1))]
        block(m, corners, -0.22 - grow * 0.4, 0.22, STONE_LIGHT if i == n // 2 else STONE if i % 2 else STONE_DARK)
    # the darkness inside
    outline = [(-0.45, 0), (0.45, 0)] + [(0.45 * math.cos(math.pi * k / 8), 1.4 + 0.45 * math.sin(math.pi * k / 8)) for k in range(9)]
    start = len(m.vertices)
    prism(m, outline, 0, 0.03, VOID)
    xform(m, start, rot=(math.pi / 2, 0, 0), offset=(0, 0.06, 0))
    m.box((0, 0, 0.01), (1.5, 0.6, 0.02), STONE_DARK)
    for i in range(5):
        pebble(m, (-0.8 + 0.4 * i + m.rng.uniform(-0.08, 0.08), -0.32 + m.rng.uniform(-0.05, 0.05), 0), 0.07 + 0.03 * (i % 2), STONE, n=5)


# --- the library ------------------------------------------------------------------------------------------
# name, builder, glTF extras (light: the glow colour of a glowing piece; pivot: what it turns
# round, glTF x, y, z)
PIECES = [
    ("trial_button", build_button, {}),
    ("trial_knob", build_knob, {"light": WHITE}),
    ("trial_rod", build_rod, {}),
    ("trial_valve", build_valve, {}),
    ("trial_plate", build_plate, {}),
    ("trial_plate_rune", build_plate_rune, {"light": WHITE}),
    ("trial_waypad", build_waypad, {}),
    ("trial_waypad_rune", build_waypad_rune, {"light": WHITE}),
    ("trial_portcullis_post", build_portcullis_post, {}),
    ("trial_portcullis_lintel", build_portcullis_lintel, {}),
    ("trial_portcullis_bars", build_portcullis_bars, {}),
    ("trial_cage", build_cage, {}),
    ("trial_lever", build_lever, {}),
    ("trial_lever_arm", build_lever_arm, {"pivot": [0, LEVER_PIVOT, 0]}),
    ("trial_lever_knob", build_lever_knob, {"pivot": [0, LEVER_PIVOT, 0]}),
    ("trial_mirror", build_mirror, {}),
    ("trial_mirror_frame", build_mirror_frame, {}),
    ("trial_mirror_pane", build_mirror_pane, {}),
    ("trial_emitter", build_emitter, {}),
    ("trial_receiver", build_receiver, {}),
    ("trial_gem", build_gem, {"light": WHITE}),
    ("trial_great_fire", build_great_fire, {}),
    ("trial_great_fire_flame", build_great_fire_flame, {"light": FLAME, "pivot": [0, GREAT_FIRE_PIVOT, 0]}),
    ("trial_beacon", build_beacon, {}),
    ("trial_beacon_flame", build_beacon_flame, {"light": FLAME, "pivot": [0, BEACON_PIVOT, 0]}),
    *[(f"trial_tile_{s}", tile_builder(s), {}) for s in "ILT"],
    *[(f"trial_tile_{s}_water", water_builder(s), {}) for s in "ILT"],
    ("trial_spout", build_spout, {}),
    ("trial_spout_stream", build_spout_stream, {}),
    ("trial_wheel_frame", build_wheel_frame, {}),
    ("trial_wheel", build_wheel, {"pivot": [0, WHEEL_PIVOT, 0]}),
    ("trial_tank", build_tank, {}),
    ("trial_tank_floor", build_tank_floor, {}),
    ("trial_tank_rim", build_tank_rim, {}),
    ("trial_float", build_float, {}),
    ("trial_runestone", build_runestone, {}),
    ("trial_tablet", build_tablet, {}),
    ("trial_mouth", build_mouth, {}),
]
MAX_TRIANGLES = 1200


def build(scene=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for name, builder, extras in PIECES:
        seed = SEED + int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big")
        m = props.Mesh(random.Random(seed))
        builder(m)
        # (authored in place: no ground shift, no radius clamp)
        obj = props.finish(m, name, "line", {"max_radius": None, **({"light": extras["light"]} if "light" in extras else {})}, collection)
        obj["attach"] = "trial"
        for key in ("radius", "blocking"):
            del obj[key]
        if "pivot" in extras:
            obj["pivot"] = extras["pivot"]
        objects.append(obj)
    return objects


def validate(objects):
    report = []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        count = len(mesh.loop_triangles)
        assert count <= MAX_TRIANGLES, (obj.name, count)
        assert obj.parent is None and tuple(obj.scale) == (1, 1, 1), obj.name
        assert not any(p.use_smooth for p in mesh.polygons), obj.name
        assert all(math.isfinite(c) for v in mesh.vertices for c in v.co), obj.name
        report.append((obj.name, count))
    return report


def layout_preview(objects, spacing=1.6, per_row=10):
    for i, obj in enumerate(objects):
        obj.location = ((i % per_row) * spacing, -(i // per_row) * spacing * 2.2, 0)


def setup_preview(scene, objects):
    layout_preview(objects)
    preview = bpy.data.collections.get("TrialsPreview") or bpy.data.collections.new("TrialsPreview")
    if preview.name not in scene.collection.children:
        scene.collection.children.link(preview)
    mesh = bpy.data.meshes.new("TrialsPreviewFloor")
    mesh.from_pydata([(-50, -50, -0.002), (50, -50, -0.002), (50, 50, -0.002), (-50, 50, -0.002)], [], [(0, 1, 2, 3)])
    preview.objects.link(bpy.data.objects.new("TrialsPreviewFloor", mesh))
    cam = bpy.data.objects.new("TrialsCamera", bpy.data.cameras.new("TrialsCamera"))
    preview.objects.link(cam)
    cam.data.type = "ORTHO"
    rows = (len(objects) + 9) // 10
    center = Vector((4.5 * 1.6, -(rows - 1) * 1.6 * 1.1, 0.8))
    d = Vector((0.35, -1, 0.75)).normalized()
    cam.location = center + d * 40
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = 17
    cam.data.clip_end = 200
    scene.camera = cam
    sun = bpy.data.objects.new("TrialsSun", bpy.data.lights.new("TrialsSun", "SUN"))
    preview.objects.link(sun)
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-35))
    world = bpy.data.worlds.get("TrialsWorld") or bpy.data.worlds.new("TrialsWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.76, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 2000, 1400
    scene.view_settings.view_transform = "AgX"
    return preview


def main(directory=None, render=True):
    directory, blends, previews = props.output_dirs(directory)
    scene = bpy.context.scene
    objects = build(scene)
    report = validate(objects)
    props.export_gltf(objects, Path(directory) / "trials.glb")
    if render:
        setup_preview(scene, objects)
        scene.render.filepath = str(Path(previews) / "trials-preview.png")
        bpy.ops.render.render(write_still=True)
        for obj in objects:
            obj.location = (0, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(blends) / "trials.blend"))
    print(f"Cube Crawler trials: {len(objects)} pieces, {sum(c for _, c in report)} triangles")
    return objects


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    flags = {a for a in args if a.startswith("--")}
    paths = [a for a in args if not a.startswith("--")]
    if len(paths) > 1 or flags - {"--no-render"}:
        raise SystemExit("Usage: Blender -b --python blender/trials.py -- [output-directory] [--no-render]")
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    main(paths[0] if paths else None, render="--no-render" not in flags)
