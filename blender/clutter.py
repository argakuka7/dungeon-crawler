"""
Clutter library for Cube Crawler: a second scatter library next to props.glb.

Same contract as props.py: one Blender unit = one game cell, Z up, flat normals,
linear COLOR_0, ONE mesh per prop named "<set>_<prop>_<variant>" at the origin,
glTF extras (attach, radius, blocking, priority, light, intensity, sway), an
optional "<name>_glow" emissive material. Neutral "any" props stay grey for the
game's per-theme tint. New placement slots for the world generator (hooked
up through src/render/propplace.js; see docs/assets/clutter.md):

    attach "ground"   origin at the base centre, base at z = 0
        cover: true   tiny ground cover (<= 0.3 tall, radius <= 0.35) for a separate
                      dense pass: several per cell, allowed on paths and slopes
        shore: true   only on dry cells next to a fluid
    attach "ceiling"  hangs down from z = 0 (slab undersides)
    attach "wall"     back flat on y = 0, sticks out along +Y (glTF -Z)
    attach "lip"      NEW: origin on the top edge of a cliff. The cliff body is
                      y < 0, z < 0; the prop may lie on the top (z >= 0) and drapes
                      down the face (y >= 0). drop: how far it hangs below the edge.
    attach "water"    NEW: origin on the fluid surface; floats.
                      fluid: "water" | "lava" | "acid"

New set "relics": story clutter for every cave theme, coloured and not tinted.
Builders live in clutter_surface.py and clutter_depths.py, helpers in clutter_geo.py.

Headless (build, validate, export, save the showroom, render previews):
    Blender -b --python blender/clutter.py -- [output-directory] [--no-render]

Default output: assets/clutter.glb + assets/clutter/manifest.json, blender/clutter.blend,
renders in blender/previews/ (clutter-preview.png, clutter/<set>.png).

Inside Blender / MCP:
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, props, clutter_geo, clutter_surface, clutter_depths, clutter
    for mod in (props, clutter_geo, clutter_surface, clutter_depths, clutter): importlib.reload(mod)
    clutter.main(render=False)
"""
import hashlib
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import props  # noqa: E402
import clutter_surface  # noqa: E402
import clutter_depths  # noqa: E402

SEED = 4242
COLLECTION = "CubeCrawlerClutter"
PREVIEW = "ClutterPreview_NOT_EXPORTED"
COVER_RADIUS = 0.35
COVER_HEIGHT = 0.3
COVER_TRIANGLES = 200
ATTACHES = ("ground", "ceiling", "wall", "lip", "water")
FLUIDS = ("water", "lava", "acid")


def spec(theme, prop, priority=1, variants=2, attach="ground", **hints):
    return (theme, prop, priority, variants, attach, hints)


def cover(theme, prop, priority=1, **hints):
    return spec(theme, prop, priority, cover=True, max_radius=COVER_RADIUS, **hints)


# --- manifest: P1 for all sets first, then P2 ---------------------------------
SPECS = [
    cover("any", "gravel_patch"),
    cover("any", "stone_chips"),
    spec("any", "rock_outcrop", attach="wall"),
    spec("any", "rock_slab"),
    spec("any", "cairn"),
    spec("relics", "adventurer_remains"),
    spec("relics", "old_campfire"),
    spec("relics", "abandoned_pack"),
    spec("relics", "torch_sconce", attach="wall", light="#ffb060", intensity=1.5),
    cover("meadow", "clover_patch"),
    cover("meadow", "daisies", sway=0.3),
    spec("meadow", "island_roots", attach="ceiling", sway=0.25),
    spec("meadow", "grass_drape", attach="lip", sway=0.4),
    spec("meadow", "lily_pads", attach="water", fluid="water"),
    spec("meadow", "cattails", shore=True, sway=0.5),
    spec("meadow", "fern", sway=0.35),
    cover("peaks", "snow_patch"),
    cover("peaks", "frost_grass", sway=0.3),
    spec("peaks", "snow_cornice", attach="lip"),
    spec("peaks", "alpine_flowers", sway=0.3),
    cover("badlands", "cracked_mud"),
    cover("badlands", "dry_grass", sway=0.4),
    spec("badlands", "prickly_pear"),
    spec("badlands", "agave"),
    spec("badlands", "rib_cage", blocking=True),
    spec("badlands", "broken_wagon_wheel"),
    cover("roots", "leaf_litter"),
    cover("roots", "moss_patch"),
    spec("roots", "root_web", attach="wall"),
    spec("roots", "glowworm_threads", attach="ceiling", light="#7fd8ff", intensity=0.6, sway=0.15),
    cover("frozen", "frost_crust"),
    cover("frozen", "ice_chips"),
    spec("frozen", "frost_crystals", attach="wall"),
    spec("frozen", "ice_floe", attach="water", fluid="water"),
    spec("frozen", "frozen_adventurer", blocking=True),
    cover("swamp", "moss_carpet"),
    cover("swamp", "tiny_glowcaps", light="#8fff7a", intensity=0.5),
    spec("swamp", "swamp_lilies", attach="water", fluid="water", light="#c8ff9a", intensity=0.8),
    spec("swamp", "algae_mat", attach="water", fluid="water"),
    spec("swamp", "fungal_tree", blocking=True, light="#8fff7a", intensity=1.5),
    spec("swamp", "hanging_moss", attach="lip", sway=0.4),
    cover("nests", "web_floor"),
    cover("nests", "husk_scraps"),
    spec("nests", "web_sheet", attach="wall"),
    spec("nests", "shed_exoskeleton"),
    cover("mines", "ore_chips"),
    cover("mines", "coal_scatter"),
    spec("mines", "wall_lantern", attach="wall", light="#ffcf8a", intensity=2),
    spec("mines", "ore_vein", attach="wall", light="#8fa8ff", intensity=0.8, per_variant={1: {"light": "#c08fff"}}),
    spec("mines", "hanging_lantern", attach="ceiling", light="#ffcf8a", intensity=2, sway=0.15),
    spec("mines", "pickaxe_in_rock"),
    spec("mines", "ore_pile"),
    cover("ruins", "broken_tiles"),
    cover("ruins", "sand_drift"),
    spec("ruins", "wall_relief", attach="wall"),
    spec("ruins", "urn"),
    spec("ruins", "toppled_column", blocking=True),
    spec("ruins", "obelisk_broken", blocking=True),
    cover("volcanic", "cinders", light="#ff6a20", intensity=0.5),
    cover("volcanic", "pumice_chips"),
    spec("volcanic", "magma_seep", attach="wall", light="#ff6a20", intensity=1.5),
    spec("volcanic", "lava_crust", attach="water", fluid="lava", light="#ff5a1a", intensity=1),
    spec("volcanic", "sulfur_vent"),
    cover("abyss", "void_flakes"),
    spec("abyss", "dangling_chains", attach="lip", sway=0.2),
    spec("abyss", "void_crystal", light="#a050ff", intensity=1.5),
    spec("abyss", "ritual_circle", light="#ff3030", intensity=1),
    spec("abyss", "wall_shackles", attach="wall"),
    spec("abyss", "wall_runes", attach="wall", light="#ff3030", intensity=0.8),
    # --- priority 2 ---
    spec("any", "shore_stones", 2, shore=True),
    spec("relics", "broken_shield", 2),
    spec("relics", "signpost", 2),
    spec("relics", "sword_in_ground", 2),
    spec("meadow", "berry_bush", 2, sway=0.15),
    spec("meadow", "fairy_ring", 2),
    spec("meadow", "sapling", 2, sway=0.3),
    spec("peaks", "expedition_flag", 2, sway=0.5),
    spec("peaks", "dead_pine_snag", 2, blocking=True),
    spec("badlands", "termite_mound", 2, blocking=True),
    spec("badlands", "dry_root_drape", 2, attach="lip", sway=0.2),
    spec("badlands", "oasis_reeds", 2, shore=True, sway=0.5),
    spec("roots", "burrow_mound", 2),
    spec("roots", "cave_fern", 2, sway=0.3),
    spec("roots", "root_drape", 2, attach="lip", sway=0.2),
    spec("frozen", "ice_pillar", 2, blocking=True),
    spec("frozen", "frozen_drape", 2, attach="lip"),
    spec("swamp", "acid_foam", 2, attach="water", fluid="acid", light="#7dff3a", intensity=0.5),
    spec("swamp", "mangrove_roots", 2, shore=True, blocking=True),
    spec("swamp", "puffballs", 2),
    spec("swamp", "pitcher_plant", 2),
    spec("nests", "web_pillar", 2, blocking=True),
    spec("nests", "wall_eggs", 2, attach="wall"),
    spec("nests", "hanging_egg_sacs", 2, attach="ceiling", sway=0.2),
    spec("nests", "webbed_crate", 2, blocking=True),
    spec("mines", "wheelbarrow", 2, blocking=True),
    spec("mines", "plank_stack", 2, blocking=True),
    spec("mines", "sacks", 2),
    spec("mines", "tipped_cart", 2, blocking=True),
    spec("mines", "dynamite_crate", 2, blocking=True),
    spec("mines", "pulley_hook", 2, attach="ceiling", sway=0.2),
    spec("ruins", "hanging_censer", 2, attach="ceiling", light="#ffb050", intensity=1.5, sway=0.2),
    spec("ruins", "altar", 2, blocking=True),
    spec("ruins", "collapsed_arch", 2, blocking=True),
    spec("ruins", "stone_tablet", 2),
    spec("volcanic", "rope_lava", 2),
    spec("volcanic", "fire_crystal", 2, light="#ff8a3a", intensity=1.5),
    spec("volcanic", "lava_stalactite", 2, attach="ceiling", light="#ff5a1a", intensity=1),
    spec("volcanic", "scorched_bones", 2),
    spec("abyss", "hovering_rock", 2, blocking=True),
    spec("abyss", "weapon_graveyard", 2, blocking=True),
    spec("abyss", "broken_altar", 2, blocking=True),
]
SETS = list(dict.fromkeys(s[0] for s in SPECS))
EXTRA_KEYS = ("light", "intensity", "sway", "cover", "shore", "fluid")


def builder(prop):
    for module in (clutter_surface, clutter_depths):
        fn = getattr(module, "build_" + prop, None)
        if fn:
            return fn
    raise KeyError("no builder for " + prop)


def parse(name):
    theme, *rest = name.split("_")
    return theme, "_".join(rest[:-1]), rest[-1]


def build(scene=None, priority=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for theme, prop, p, count, attach, hints in SPECS:
        if priority is not None and p != priority:
            continue
        for variant in range(count):
            name = f"{theme}_{prop}_{chr(97 + variant)}"
            seed = SEED + int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big")
            m = props.Mesh(random.Random(seed))
            builder(prop)(m, variant)
            info = {k: v for k, v in hints.items() if k != "per_variant"}
            info.update(hints.get("per_variant", {}).get(variant, {}))
            obj = props.finish(m, name, attach, info, collection)
            obj["priority"] = p
            obj["cube_crawler_clutter"] = True
            for key in ("cover", "shore", "fluid"):
                if key in info:
                    obj[key] = info[key]
            if attach == "lip":
                obj["drop"] = round(-min(v.co.z for v in obj.data.vertices), 4)
            objects.append(obj)
    return objects


def validate(objects):
    """Fail on attachment, budget, transform, colour or naming regressions."""
    names = {o.name for o in objects}
    assert len(names) == len(objects)
    taken = {f"{t}_{p}_{chr(97 + v)}" for t, p, _, _, n, _, _ in props.SPECS for v in range(n)}
    assert not names & taken, sorted(names & taken)
    report, failures = [], []
    for obj in objects:
        try:
            report.append(check(obj))
        except AssertionError as e:
            failures.append(repr(e.args[0] if e.args else obj.name))
    assert not failures, "\n".join(failures)
    return report


def check(obj, fluids=FLUIDS):
    """Checks for one prop; returns its manifest entry."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    attach = obj["attach"]
    theme, prop, variant = parse(obj.name)
    is_cover = bool(obj.get("cover"))
    budget = COVER_TRIANGLES if is_cover else props.TREE_TRIANGLES if "tree" in prop else props.MAX_TRIANGLES
    assert props.MIN_TRIANGLES <= count <= budget, (obj.name, count, budget)
    assert attach in ATTACHES, obj.name
    assert obj.parent is None and not obj.modifiers and not obj.constraints, obj.name
    assert tuple(obj.scale) == (1, 1, 1), obj.name
    assert not any(p.use_smooth for p in mesh.polygons), obj.name
    assert not mesh.uv_layers and props.COLOR_ATTRIBUTE in mesh.color_attributes, obj.name
    assert all(math.isfinite(c) for v in mesh.vertices for c in v.co), obj.name
    for tri in mesh.loop_triangles:
        a, b, c = (mesh.vertices[i].co for i in tri.vertices)
        assert (b - a).cross(c - a).length > 1e-10, obj.name
    lo = [min(v.co[k] for v in mesh.vertices) for k in range(3)]
    hi = [max(v.co[k] for v in mesh.vertices) for k in range(3)]
    radius = obj["radius"]
    if attach == "ground":
        assert abs(lo[2]) < 1e-6 and hi[2] > 0, obj.name
        assert radius <= props.MAX_RADIUS + 1e-4, (obj.name, radius)
        if is_cover:
            assert radius <= COVER_RADIUS + 1e-4 and hi[2] <= COVER_HEIGHT, (obj.name, radius, hi[2])
            assert not obj["blocking"], obj.name
    elif attach == "ceiling":
        assert abs(hi[2]) < 1e-6 and lo[2] < 0, obj.name
    elif attach == "wall":
        assert abs(lo[1]) < 1e-6 and hi[1] > 0, obj.name
    elif attach == "lip":
        assert -0.35 <= lo[1] and hi[1] <= 0.4 and hi[2] <= 0.25 and lo[2] < -0.15, (obj.name, lo, hi)
        inside = [v.co for v in mesh.vertices if v.co.y < -0.03 and v.co.z < -0.03]
        assert not inside, (obj.name, "geometry inside the cliff", inside[:3])
        assert abs(obj["drop"] + lo[2]) < 1e-3, obj.name
    elif attach == "water":
        assert -0.2 <= lo[2] < 0 < hi[2], (obj.name, lo[2], hi[2])
        assert radius <= props.MAX_RADIUS + 1e-4 and obj["fluid"] in fluids, obj.name
    if obj.get("shore"):
        assert attach == "ground", obj.name
    if theme == "any":
        for poly in mesh.polygons:
            if poly.material_index == 0:
                for i in poly.loop_indices:
                    color = mesh.color_attributes[props.COLOR_ATTRIBUTE].data[i].color[:3]
                    assert max(color) - min(color) < 1e-6, obj.name
    glowing = any(p.material_index == 1 for p in mesh.polygons)
    assert glowing == ("light" in obj), obj.name
    if glowing:
        assert mesh.materials[1].name == obj.name + "_glow", obj.name
    entry = {"name": obj.name, "set": theme, "prop": prop, "variant": variant, "priority": obj["priority"],
             "attach": attach, "blocking": bool(obj["blocking"]), "radius": radius, "triangles": count,
             "size": [round(b - a, 3) for a, b in zip(lo, hi)],
             "bounds_blender": [[round(x, 4) for x in lo], [round(x, 4) for x in hi]]}
    for key in EXTRA_KEYS + ("drop",):
        if key in obj:
            entry[key] = obj[key]
    return entry


def export_gltf(objects, path):
    """props.export_gltf, also zeroing showroom rotations for the export."""
    rotations = [(o, o.rotation_euler.copy()) for o in objects]
    try:
        for obj in objects:
            obj.rotation_euler = (0, 0, 0)
        props.export_gltf(objects, path)
    finally:
        for obj, rotation in rotations:
            obj.rotation_euler = rotation


def export(objects, directory):
    directory = Path(directory).resolve()
    (directory / "clutter").mkdir(parents=True, exist_ok=True)
    rotations = [(o, o.rotation_euler.copy()) for o in objects]
    for obj in objects:
        obj.rotation_euler = (0, 0, 0)
    try:
        report = validate(objects)
    finally:
        for obj, rotation in rotations:
            obj.rotation_euler = rotation
    export_gltf(objects, directory / "clutter.glb")
    sets = {s: sorted({r["prop"] for r in report if r["set"] == s}) for s in SETS}
    (directory / "clutter" / "manifest.json").write_text(json.dumps({
        "units": "cells", "up": "Y", "front": "+Z", "glb": "clutter.glb", "sets": sets,
        "triangles": sum(r["triangles"] for r in report), "props": report}, indent=2) + "\n")
    return report


# --- showroom -----------------------------------------------------------------
BLOCK_Y = 12
CAMERA_ELEVATION = math.radians(32)
CAMERA_AZIMUTH = math.radians(12)


def plain_material(name, color, alpha=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*props.linear(color), 1)
    shader.inputs["Roughness"].default_value = 0.92 if alpha == 1 else 0.15
    if alpha < 1:
        shader.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = (*props.linear(color), alpha)
    return mat


def setup_preview(scene, objects):
    """One block per set: ground props in columns (variant a in front), a cliff with
    wall / lip props, a pool with water props and a floating slab with ceiling props."""
    old = bpy.data.collections.get(PREVIEW)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    preview = bpy.data.collections.new(PREVIEW)
    scene.collection.children.link(preview)
    rock = plain_material("ClutterPreviewRock", "#8f8a80")
    ink = plain_material("ClutterPreviewInk", "#3f453e")
    pool = plain_material("ClutterPreviewWater", "#3f6f88")

    def slab(name, lo, hi, mat):
        mesh = bpy.data.meshes.new(name)
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        verts = [(x, y, z) for z in (z0, z1) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        mesh.from_pydata(verts, [], [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6),
                                     (3, 0, 4, 7)])
        mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        preview.objects.link(obj)
        return obj

    def label(text, location, size=0.13, name=None):
        data = bpy.data.curves.new(name or "Label_" + text, "FONT")
        data.body, data.align_x, data.size = text, "CENTER", size
        data.materials.append(ink)
        obj = bpy.data.objects.new(name or "Label_" + text, data)
        obj.location, obj.rotation_euler = location, (math.pi / 2 - CAMERA_ELEVATION, 0, 0)
        preview.objects.link(obj)
        return obj

    by_name = {o.name: o for o in objects}
    blocks = {}
    for row, theme in enumerate(SETS):
        oy = row * BLOCK_Y
        specs = [s for s in SPECS if s[0] == theme]
        names = lambda s: [by_name[f"{theme}_{s[1]}_{chr(97 + v)}"] for v in range(s[3])]  # noqa: E731
        x = 0.0
        for s in (s for s in specs if s[4] == "ground"):
            for v, obj in enumerate(names(s)):
                obj.location, obj.rotation_euler = (x, oy + 1.2 * v, 0), (0, 0, 0)
            tag = s[1] + (" (cover)" if s[5].get("cover") else " (shore)" if s[5].get("shore") else "")
            label(tag, (x, oy - 0.8, 0.02))
            x += 1.3
        cliff = [s for s in specs if s[4] in ("wall", "lip")]
        if cliff:
            x0 = x
            for s in cliff:
                for obj in names(s):
                    z = 1.0 if s[4] == "wall" else 2.0
                    obj.location, obj.rotation_euler = (x, oy + 1.2, z), (0, 0, math.pi)
                    x += 1.15
                label(f"{s[1]} ({s[4]})", (x - 1.15 * (s[3] + 1) / 2, oy - 0.8, 0.02))
            slab(f"Cliff_{theme}", (x0 - 0.6, oy + 1.2, 0), (x - 0.55, oy + 2.4, 2.0), rock)
            x += 0.3
        water = [s for s in specs if s[4] == "water"]
        if water:
            x0 = x
            for s in water:
                for obj in names(s):
                    obj.location, obj.rotation_euler = (x, oy + 0.3, 0.04), (0, 0, 0)
                    x += 1.1
                label(f"{s[1]} ({s[5]['fluid']})", (x - 1.1 * (s[3] + 1) / 2, oy - 0.8, 0.02))
            slab(f"Pool_{theme}", (x0 - 0.6, oy - 0.4, 0.0), (x - 0.5, oy + 1.0, 0.04), pool)
            x += 0.3
        ceiling = [s for s in specs if s[4] == "ceiling"]
        if ceiling:
            x0 = x
            for s in ceiling:
                for obj in names(s):
                    obj.location, obj.rotation_euler = (x, oy + 0.35, 2.5), (0, 0, 0)
                    x += 1.0
                label(f"{s[1]} (ceiling)", (x - 1.0 * (s[3] + 1) / 2, oy - 0.8, 0.02))
            slab(f"Slab_{theme}", (x0 - 0.55, oy + 0.0, 2.5), (x - 0.45, oy + 1.4, 2.7), rock)
        width = max(x, 6)
        label(theme.upper(), (-0.7, oy - 1.45, 0.02), size=0.32, name="Title_" + theme).data.align_x = "LEFT"
        blocks[theme] = (-1.0, width, oy)
    mesh = bpy.data.meshes.new("ClutterPreviewFloor")
    mesh.from_pydata([(-500, -500, -0.002), (500, -500, -0.002), (500, 500, -0.002), (-500, 500, -0.002)], [],
                     [(0, 1, 2, 3)])
    mesh.materials.append(plain_material("ClutterPreviewGround", "#c3c4b0"))
    preview.objects.link(bpy.data.objects.new("ClutterPreviewFloor", mesh))

    cam = bpy.data.objects.new("ClutterCamera", bpy.data.cameras.new("ClutterCamera"))
    preview.objects.link(cam)
    cam.data.type = "ORTHO"
    scene.camera = cam
    sun = bpy.data.objects.new("ClutterSun", bpy.data.lights.new("ClutterSun", "SUN"))
    preview.objects.link(sun)
    sun.data.energy, sun.data.angle = 3.2, math.radians(8)
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-35))
    world = bpy.data.worlds.get("ClutterWorld") or bpy.data.worlds.new("ClutterWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.76, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75
    scene.world = world
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 24
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    frame(scene, blocks, SETS[0])
    return preview, blocks


def frame(scene, blocks, theme, px_per_cell=110, height_cells=5.0):
    """Aim the ortho camera at one set's block, at a fixed pixels-per-cell scale."""
    x0, x1, oy = blocks[theme]
    span = x1 - x0 + 0.6
    target = Vector(((x0 + x1) / 2 + 0.2, oy + 0.6, 0.85))
    d = Vector((math.sin(CAMERA_AZIMUTH) * math.cos(CAMERA_ELEVATION),
                -math.cos(CAMERA_AZIMUTH) * math.cos(CAMERA_ELEVATION), math.sin(CAMERA_ELEVATION)))
    cam = scene.camera
    cam.location = target + d * 40
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = span
    cam.data.clip_end = 200
    scene.render.resolution_x = int(span * px_per_cell)
    scene.render.resolution_y = int(height_cells * px_per_cell)
    scene.render.resolution_percentage = 100


def render_previews(scene, blocks, directory):
    directory = Path(directory)
    (directory / "clutter").mkdir(parents=True, exist_ok=True)
    paths = []
    for theme in SETS:
        frame(scene, blocks, theme)
        path = directory / "clutter" / f"{theme}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    contact_sheet(paths, directory / "clutter-preview.png")
    frame(scene, blocks, SETS[0])
    return paths


def contact_sheet(paths, out, scale=0.6):
    """Stack the per-set renders vertically (left-aligned) into one overview."""
    import numpy as np
    tiles = []
    for path in paths:
        img = bpy.data.images.load(str(path))
        w, h = int(img.size[0] * scale), int(img.size[1] * scale)
        img.scale(w, h)
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        tiles.append(px.reshape(h, w, 4))
        bpy.data.images.remove(img)
    width, height = max(t.shape[1] for t in tiles), sum(t.shape[0] for t in tiles)
    sheet = np.empty((height, width, 4), dtype=np.float32)
    sheet[:] = tiles[0][-1, -1]
    y = height
    for tile in tiles:
        y -= tile.shape[0]
        sheet[y:y + tile.shape[0], :tile.shape[1]] = tile
    out_img = bpy.data.images.new("ClutterContactSheet", width, height, alpha=True)
    out_img.pixels.foreach_set(sheet.ravel())
    out_img.filepath_raw, out_img.file_format = str(out), "PNG"
    out_img.save()
    bpy.data.images.remove(out_img)


def main(directory=None, render=True):
    directory, blends, previews = props.output_dirs(directory)
    scene = bpy.data.scenes.get("ClutterShowroom") or bpy.data.scenes.new("ClutterShowroom")
    if bpy.context.window:
        bpy.context.window.scene = scene
    obj = getattr(bpy.context, "object", None)
    if obj is not None and obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    objects = build(scene)
    report = export(objects, directory)
    preview, blocks = setup_preview(scene, objects)
    for other in list(bpy.data.scenes):
        if other != scene and not other.objects:
            bpy.data.scenes.remove(other)
    bpy.ops.wm.save_as_mainfile(filepath=str(blends / "clutter.blend"))
    if render:
        render_previews(scene, blocks, previews)
    print(f"Cube Crawler clutter: {len(objects)} props, {sum(r['triangles'] for r in report)} triangles")
    return report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    flags = {a for a in args if a.startswith("--")}
    paths = [a for a in args if not a.startswith("--")]
    if len(paths) > 1 or flags - {"--no-render"}:
        raise SystemExit("Usage: Blender -b --python blender/clutter.py -- [output-directory] [--no-render]")
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    main(paths[0] if paths else None, render="--no-render" not in flags)
