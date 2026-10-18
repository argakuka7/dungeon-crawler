"""Blender-native checks for the clutter library: geometry, repeatability and the GLB contract.

    Blender --background --python blender/tests/test_clutter.py

Writes only to a temporary directory, not the checked-in exports.
"""
import json
import math
from pathlib import Path
import struct
import sys
import tempfile

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import props  # noqa: E402
import clutter  # noqa: E402


def fingerprint(objects):
    return [(obj.name, [tuple(v.co) for v in obj.data.vertices],
             [tuple(p.vertices) for p in obj.data.polygons],
             [tuple(c.color) for c in obj.data.color_attributes['Color'].data]) for obj in objects]


def read_glb(path):
    data = Path(path).read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and length == len(data), path
    chunk_length, chunk_type = struct.unpack_from('<II', data, 12)
    assert chunk_type == 0x4E4F534A, path
    return json.loads(data[20:20 + chunk_length])


def check_glb(path, reports):
    gltf = read_glb(path)
    expected = {r['name']: r for r in reports}
    assert not gltf.get('images') and not gltf.get('textures')
    assert not gltf.get('animations') and not gltf.get('skins') and not gltf.get('cameras')
    roots = gltf['scenes'][gltf.get('scene', 0)]['nodes']
    assert len(roots) == len(reports)
    seen = set()
    for index in roots:
        node = gltf['nodes'][index]
        name = node['name']
        seen.add(name)
        report = expected[name]
        assert node.get('translation', [0, 0, 0]) == [0, 0, 0], name
        assert node.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1], name
        assert node.get('scale', [1, 1, 1]) == [1, 1, 1], name
        extras = node['extras']
        assert extras['cube_crawler_prop'] is True and extras['cube_crawler_clutter'] is True, name
        assert extras['attach'] == report['attach'] and extras['blocking'] == report['blocking'], name
        assert extras['priority'] == report['priority'] and abs(extras['radius'] - report['radius']) < 1e-6, name
        for key in clutter.EXTRA_KEYS + ('drop',):
            assert extras.get(key) == report.get(key), (name, key)
        meshes = [gltf['meshes'][node['mesh']]] if 'mesh' in node else \
            [gltf['meshes'][gltf['nodes'][c]['mesh']] for c in node.get('children', [])]
        primitives = [p for mesh in meshes for p in mesh['primitives']]
        assert primitives, name
        triangles = 0
        lo, hi = [math.inf] * 3, [-math.inf] * 3
        for primitive in primitives:
            assert primitive.get('mode', 4) == 4
            attrs = primitive['attributes']
            assert 'COLOR_0' in attrs and 'NORMAL' in attrs and 'TEXCOORD_0' not in attrs, name
            accessor = gltf['accessors'][attrs['POSITION']]
            lo = [min(a, b) for a, b in zip(lo, accessor['min'])]
            hi = [max(a, b) for a, b in zip(hi, accessor['max'])]
            triangles += gltf['accessors'][primitive['indices']]['count'] // 3
            material = gltf['materials'][primitive['material']]
            assert not material.get('pbrMetallicRoughness', {}).get('baseColorTexture'), name
        assert triangles == report['triangles'], (name, triangles, report['triangles'])
        # Blender (x, y, z) exports as glTF (x, z, -y).
        attach = report['attach']
        if attach == 'ground':
            assert abs(lo[1]) < 1e-5 and hi[1] > 0, name
        elif attach == 'ceiling':
            assert abs(hi[1]) < 1e-5 and lo[1] < 0, name
        elif attach == 'wall':
            assert abs(hi[2]) < 1e-5 and lo[2] < 0, name
        elif attach == 'lip':
            assert lo[1] < -0.15 and abs(-lo[1] - report['drop']) < 1e-3, name
        elif attach == 'water':
            assert lo[1] < 0 < hi[1], name
        glowing = [gltf['materials'][p['material']] for p in primitives
                   if any(gltf['materials'][p['material']].get('emissiveFactor', []))]
        if 'light' in report:
            assert len(glowing) == 1 and glowing[0]['name'] == name + '_glow', name
        else:
            assert not glowing, name
    assert seen == set(expected)


def main():
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    # The shared finish() also serves props.py; its own library must stay valid.
    props.validate(props.build())
    objects = clutter.build()
    first = fingerprint(objects)
    objects = clutter.build()
    assert first == fingerprint(objects), 'Procedural rebuild must be deterministic'
    report = clutter.validate(objects)
    by_attach = {a: sum(r['attach'] == a for r in report) for a in clutter.ATTACHES}
    assert all(by_attach.values()), by_attach
    assert {r['set'] for r in report} == set(clutter.SETS)
    for theme in clutter.SETS:
        if theme not in ('any', 'relics'):
            assert any(r.get('cover') for r in report if r['set'] == theme), theme
    # Export from a showroom layout; positions and rotations must come back afterwards.
    for i, obj in enumerate(objects):
        obj.location, obj.rotation_euler = (i * 1.5, 3, 0.5), (0, 0, math.pi)
    states = [(tuple(o.location), tuple(o.rotation_euler)) for o in objects]
    with tempfile.TemporaryDirectory(prefix='cube-clutter-test-') as directory:
        clutter.export(objects, directory)
        for path in sorted((Path(directory) / 'clutter').glob('*.glb')):
            check_glb(path, [r for r in report if r['set'] == path.stem])
        assert sorted(p.stem for p in (Path(directory) / 'clutter').glob('*.glb')) == sorted(clutter.SETS)
        manifest = json.loads((Path(directory) / 'clutter' / 'manifest.json').read_text())
        assert [p['name'] for p in manifest['props']] == [r['name'] for r in report]
        assert manifest['triangles'] == sum(r['triangles'] for r in report)
    assert states == [(tuple(o.location), tuple(o.rotation_euler)) for o in objects]
    print(f"PASS: {len(report)} deterministic clutter props in {len(clutter.SETS)} sets, "
          f"{sum(r['triangles'] for r in report)} triangles, attachments {by_attach}; "
          'GLB roots, extras, bounds, vertex colours and glow materials match')


if __name__ == '__main__':
    main()
