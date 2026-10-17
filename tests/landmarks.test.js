import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAR_R, CHAR_H } from '../src/core/constants.js';
import { PROP_METADATA } from '../src/core/propmetadata.js';
import { THEMES } from '../src/themes/index.js';
import { World } from '../src/world/world.js';
import { siteIntent, landmarksOf } from '../src/world/sites.js';
import { generate } from '../src/cubegen/index.js';
import { containsXZ } from '../src/core/blockers.js';

const LANDMARKS = PROP_METADATA.filter(p => p.landmark);

test('every theme has landmarks, each with a role and boxes derived from its mesh', () => {
  for (const t of THEMES) assert.ok(landmarksOf(t.props).length >= 2, t.props);
  assert.equal(LANDMARKS.length, 47);
  for (const p of LANDMARKS) {
    assert.ok(['shrine', 'gate', 'camp', 'monument'].includes(p.role), p.name);
    assert.ok(p.colliders.length && p.occluders.length, p.name);
    const [x0, z0, x1, z1] = p.bounds;
    for (const b of [...p.colliders, ...p.occluders]) {
      assert.ok(b[0] < b[2] && b[1] < b[3] && b[4] >= 0 && b[4] < b[5], p.name);
      assert.ok(b[0] >= x0 - 0.3 && b[2] <= x1 + 0.3 && b[1] >= z0 - 0.3 && b[3] <= z1 + 0.3, `${p.name}: inside its bounds`);
    }
    // a gate leaves a way through along its Z axis, under head height
    if (p.role === 'gate')
      assert.ok(!p.colliders.some(b => b[0] < CHAR_R + 0.05 && b[2] > -CHAR_R - 0.05 && b[4] < CHAR_H), p.name);
  }
});

test("each depth's major site is built around one of its theme's landmarks, taking turns", () => {
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    let previous = null;
    for (let d = 1; d < 20; d++) {
      const L = w.layout(d), marks = [...L.sitePlans.values()].flat().filter(i => i.landmark);
      assert.equal(marks.length, 1, `seed ${seed} depth ${d}`);
      const [intent] = marks;
      assert.ok(['rare', 'exceptional'].includes(intent.prestige));
      assert.equal(PROP_METADATA.find(p => p.name === intent.landmark).set, L.theme.props);
      assert.equal(intent.role, PROP_METADATA.find(p => p.name === intent.landmark).role);
      // the next depth of the same theme shows the theme's next landmark
      if (previous && previous.theme === L.theme)
        assert.notEqual(intent.landmark, previous.landmark, `seed ${seed} depth ${d}`);
      previous = { theme: L.theme, landmark: intent.landmark };
    }
  }
});

// the map's landmark site and what the character can and cannot do around it
function checkLandmark(m, intent) {
  const site = m.rewardSites.find(s => s.id === intent.id);
  assert.ok(site, `${intent.landmark}: ${JSON.stringify(m.siteFailures)}`);
  const L = site.landmark, p = PROP_METADATA.find(q => q.name === intent.landmark);
  assert.equal(L.name, intent.landmark);
  assert.equal(L.role, p.role);
  assert.equal(L.anchors.length, (p.anchors || []).length);
  assert.ok(m.sitePlacements.some(q => q.name === L.name && q.x === L.x && q.z === L.z && q.y === L.y));
  assert.ok(Math.abs(Math.round(L.yaw / (Math.PI / 2)) * Math.PI / 2 - L.yaw) < 1e-9, 'quarter turns');
  // its colliders are boxes in the map, and the cutaway knows its volume
  const boxes = new Set(m.staticBlockers.flat().filter(b => b.shape === 'box'));
  assert.equal(boxes.size, p.colliders.length);
  assert.ok(m.occluders.length >= p.occluders.length);
  assert.ok(m.occluders.some(b => b.top > L.y + p.height - 0.6));
  const walls = [...boxes].filter(b => b.bottom < L.y + CHAR_H);
  const clear = (x, z) => !walls.some(b => containsXZ(b, x, z, CHAR_R));
  // the chest's approach is clear, and every floor of the site the route search may stand on
  assert.ok(clear(site.approach.x, site.approach.z), `${L.name}: approach`);
  for (const f of m.floors) if (f.site === site.id && !f.siteBlocked && !f.fluid)
    assert.ok(clear(f.x + 0.5, f.z + 0.5), `${L.name}: floor ${f.x},${f.z} is free but inside the landmark`);
  // it faces the approach: a shrine has the chest in front of it, a gate behind it
  const front = [Math.sin(L.yaw), Math.cos(L.yaw)], to = [site.anchor.x - L.x, site.anchor.z - L.z];
  const dot = front[0] * to[0] + front[1] * to[1];
  if (p.role === 'shrine') assert.ok(dot > 0.5, `${L.name}: the chest stands in front`);
  if (p.role === 'gate') {
    assert.ok(dot < -0.5, `${L.name}: the chest stands behind the gate`);
    // and the cells through the gate stay walkable
    const through = m.floors.filter(f => f.site === site.id && !f.siteBlocked
      && Math.abs((f.x + 0.5 - L.x) * front[1] - (f.z + 0.5 - L.z) * front[0]) < 0.1
      && Math.abs((f.x + 0.5 - L.x) * front[0] + (f.z + 0.5 - L.z) * front[1]) < 0.6);
    assert.ok(through.length, `${L.name}: a way through`);
  }
}

test('every landmark can be built: placed, collidable, facing its approach, the site still walkable', () => {
  for (const p of LANDMARKS) {
    const depth = Math.max(1, THEMES.find(t => t.props === p.set).depths[0]);
    // the first of the depth's site rooms with room for it (a lava sea may leave none)
    const w = new World(7, { themes: [p.set] });
    let spec, intent, m;
    for (const key of w.layout(depth).sitePlans.keys()) {
      w.prepare(key);
      spec = w.spec(key); intent = siteIntent(7, key, p.set, 'rare', 0, p.name);
      m = generate({ ...spec, rewardSites: [intent] });
      if (!m.siteFailures.length) break;
    }
    checkLandmark(m, intent);
    assert.deepEqual(generate({ ...spec, rewardSites: [intent] }).rewardSites, m.rewardSites, `${p.name}: deterministic`);
  }
});

test('landmark sites almost always come about in real worlds', () => {
  let want = 0, got = 0;
  for (const seed of [11, 12, 13]) {
    const w = new World(seed);
    for (let d = 1; d < 20; d++) for (const [key, plans] of w.layout(d).sitePlans) for (const intent of plans) {
      if (!intent.landmark) continue;
      want++;
      const m = w.cube(key).map;
      if (m.rewardSites.some(s => s.id === intent.id)) { got++; checkLandmark(m, intent); }
    }
  }
  assert.ok(got / want > 0.9, `${got} of ${want}`);
});
