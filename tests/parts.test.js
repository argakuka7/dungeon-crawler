import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { FLUIDS, LAVA, ACID } from '../src/core/constants.js';
import { buildCubeGeometry, buildCubeParts } from '../src/render/cubegeo.js';
import { PARTS, packParts, partBuffers } from '../src/render/parts.js';

// a few cubes with every fluid and some falls among them: the surface, the acid rivers of the
// fungal swamp and the lava rivers of the volcanic depths
function sample() {
  const out = [], w = new World(3, { themes: ['swamp'] });
  for (const depth of [0, 1, 2, 3, 4, 9, 17]) for (const k of [...w.layout(depth).exists].slice(0, 3)) out.push(w.cube(k).map);
  return out;
}
const maps = sample();
const tris = a => a ? a.pos.length / 9 : 0;

test('every layer the cube builder makes is a part, so the proxies cannot miss one', () => {
  const kinds = new Set(Object.keys(buildCubeGeometry(maps[0])[0]).filter(k => k !== 'fluids'));
  assert.deepEqual([...kinds].sort(), PARTS.filter(p => p.kind === 'solid').map(p => p.name).sort());
  for (const t of FLUIDS) assert.ok(PARTS.some(p => p.kind === 'fluid' && p.fluid === t) && PARTS.some(p => p.kind === 'fall' && p.fluid === t));
});

test('packed parts keep every triangle, in place to a quantization step', () => {
  for (const m of maps) {
    const layers = buildCubeGeometry(m), geo = packParts(layers, m);
    for (const part of PARTS.filter(p => p.kind !== 'fall')) {
      const src = layers.map(L => part.kind === 'solid' ? L[part.name] : L.fluids[part.fluid]).filter(a => a && a.pos.length);
      const p = geo.parts[part.name];
      assert.equal(!!p, src.length > 0, `${part.name} present iff built`);
      if (!p) continue;
      assert.equal(p.index.length / 3, src.reduce((s, a) => s + tris(a), 0), `${part.name}: triangle count`);
      const n = p.pos.length / 4;
      assert.ok(p.index.every(i => i < n), `${part.name}: indices in range`);
      assert.ok(n < p.index.length, `${part.name}: shared corners are stored once`);
      // the corners of the first triangles land where they were built
      let start = 0;
      for (const a of src) {
        for (let i = 0; i < Math.min(a.pos.length / 3, 30); i++) {
          const v = p.index[start + i];
          for (let j = 0; j < 3; j++) assert.ok(Math.abs(p.pos[v * 4 + j] * geo.scale - a.pos[i * 3 + j]) <= geo.scale / 2 + 1e-6);
        }
        start += a.pos.length / 3;
      }
      if (part.kind === 'solid') assert.ok(p.col.every((c, i) => i % 4 !== 3 || c === 65535), 'opaque vertex colours');
      else assert.equal(p.col, null, 'fluid surfaces take their colour from the material');
    }
    const [x0, y0, z0, x1, y1, z1] = geo.bounds;
    assert.ok(x0 >= -1 && z0 >= -1 && x1 <= 17 && z1 <= 17 && y0 >= -1 && y1 <= 17, `${m.key}: bounds ${geo.bounds}`);
  }
});

test('falls are parts of their own fluid, with streak uvs', () => {
  const withFalls = maps.filter(m => m.falls.length);
  assert.ok(withFalls.length, 'the sample has falls');
  for (const m of withFalls) {
    const geo = buildCubeParts(m);
    for (const t of new Set(m.falls.map(f => f.type))) {
      const p = geo.parts[PARTS.find(q => q.kind === 'fall' && q.fluid === t).name];
      assert.equal(p.index.length / 3, m.falls.filter(f => f.type === t).length * 12, 'a box (12 triangles) per fall');
      assert.equal(p.uv.length, p.pos.length / 2);
    }
  }
});

test('the sample covers lava and acid, and the worker transfers every buffer', () => {
  const geos = maps.map(buildCubeParts);
  assert.ok(geos.some(g => g.parts.lava) && geos.some(g => g.parts.acid), `${LAVA}/${ACID} in the sample`);
  for (const g of geos) {
    const buffers = partBuffers(g);
    assert.equal(new Set(buffers).size, buffers.length);
    assert.ok(Object.values(g.parts).every(p => buffers.includes(p.pos.buffer) && buffers.includes(p.index.buffer)));
  }
});
