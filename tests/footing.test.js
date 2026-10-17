import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WATER, LAVA } from '../src/core/constants.js';
import { SURFACES, surfaceAt } from '../src/core/footing.js';
import { THEMES } from '../src/themes/index.js';
import { themeOf } from '../src/themes/depth.js';
import { World } from '../src/world/world.js';
import './fixtures.js';

const floor = (top, link = []) => ({ top, link: [...link, null, null, null, null].slice(0, 4) });

test('structures sound like what they are made of', () => {
  const piece = (kind, style) => ({ kind, run: { kind, style } });
  assert.equal(surfaceAt(piece('stair'), null, 'meadow', 0, 0), 'stone');
  assert.equal(surfaceAt(piece('landing'), null, 'meadow', 0, 0), 'stone');
  for (const [style, s] of [['stone', 'stone'], ['plank', 'wood'], ['rope', 'rope'], ['iron', 'iron']])
    assert.equal(surfaceAt(piece('bridge', style), null, 'swamp', 0, 0), s);
  assert.equal(surfaceAt(null, null, 'meadow', 0, 0), null, 'nothing underfoot');
});

test('terrain goes by theme and height, banks are mud', () => {
  assert.equal(surfaceAt(floor(4), null, 'meadow', 0, 0), 'grass');
  assert.equal(surfaceAt(floor(16), null, 'meadow', 0, 0), 'gravel');
  assert.equal(surfaceAt(floor(1), null, 'peaks', 0, 0), 'gravel');
  assert.equal(surfaceAt(floor(8), null, 'peaks', 0, 0), 'snow');
  assert.equal(surfaceAt(floor(8), null, 'frozen', 0, 0), 'ice');
  assert.equal(surfaceAt(floor(8), null, 'swamp', 0, 0), 'mud');
  assert.equal(surfaceAt(floor(4, [{ fluid: WATER }]), null, 'meadow', 0, 0), 'mud');
  assert.equal(surfaceAt(floor(4, [{ fluid: LAVA }]), null, 'meadow', 0, 0), 'gravel');
  for (const t of THEMES) for (let level = 0; level <= 20; level++)
    assert.ok(SURFACES.includes(surfaceAt(floor(level), null, t.props, 0, 0)), `${t.name} at ${level}`);
});

test('town paths are dirt, the rest of the town grass', () => {
  const w = new World(5), m = w.cube(w.start).map, theme = themeOf(m).props;
  const f = m.floors.find(g => !g.fluid && !g.link.some(h => h?.fluid));
  const [[ax, az], [bx, bz]] = m.town.paths[0].points;
  assert.equal(surfaceAt(f, m, theme, (ax + bx) / 2, (az + bz) / 2), 'dirt');
  // far from every point along every path
  const near = (g, d) => m.town.paths.some(p => p.points.slice(1).some(([qx, qz], i) => {
    const [px, pz] = p.points[i];
    for (let t = 0; t <= 1; t += 0.05) if (Math.hypot(px + (qx - px) * t - g.x - 0.5, pz + (qz - pz) * t - g.z - 0.5) <= d) return true;
    return false;
  }));
  const far = m.floors.find(g => !g.fluid && !g.link.some(h => h?.fluid) && !near(g, 2.5));
  assert.equal(surfaceAt(far, m, theme, far.x + 0.5, far.z + 0.5), 'grass');
});

test('every floor and structure of generated cubes has a surface', () => {
  const w = new World(11);
  for (const depth of [1, 3, 4, 5, 7, 9, 11, 13, 15, 17, 19]) {
    const m = w.cube(w.layout(depth).route[0]).map, props = themeOf(m).props;
    for (const f of m.floors) if (!f.fluid) assert.ok(SURFACES.includes(surfaceAt(f, m, props, f.x + 0.5, f.z + 0.5)));
    for (const r of m.runs) for (const p of r.pieces) assert.ok(SURFACES.includes(surfaceAt(p, m, props, 0, 0)), `${r.kind} ${r.style}`);
  }
});
