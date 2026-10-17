import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLayouts, MIN_ROUTE_ROOMS, MAX_ROUTE_ROOMS } from '../src/world/layout.js';
import { key, faceKey, step } from '../src/world/coords.js';
import { discoveredFaces } from '../src/core/boundaries.js';
import { portalLocked } from '../src/core/guardians.js';
import { createRun } from '../src/core/progression.js';

// Model all rooms as already discovered, including rooms reached accidentally by falls.
// This exercises the extra full-face paths, not merely the authored portal graph.
function rooms(L) {
  return new Map([...L.exists].map(k => [k, { key: k, visits: 1, map: {
    key: k, exit: L.exit.get(k), guardian: L.guardians.get(k), routeIndex: L.routeIndex.get(k), route: L.route,
    gateKeys: [0, 1, 2, 3].map(d => L.gateFaces.get(faceKey(k, d))),
    portals: [0, 1, 2, 3].filter(d => L.portals.has(faceKey(k, d))).map(dir => ({ dir, kind: 'side' })),
  } }]));
}

function distances(L, cubes, run, from, avoid = null) {
  const dist = new Map([[from, 1]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = cubes.get(queue[i]), open = new Set(discoveredFaces(cubes, c, run));
    for (let dir = 0; dir < 4; dir++) {
      const n = step(c.key, dir);
      if (!cubes.has(n) || n === avoid || dist.has(n) || portalLocked(c.map, run, { dir })) continue;
      if (!L.portals.has(faceKey(c.key, dir)) && !open.has(faceKey(c.key, dir))) continue;
      dist.set(n, dist.get(c.key) + 1); queue.push(n);
    }
  }
  return dist;
}

test('all depths have 7–14-room routes; discovery joins neighbours only over explored, unguarded ground', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const get = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) {
      const L = get(d), run = createRun(), cubes = rooms(L);
      assert.ok(L.spine >= MIN_ROUTE_ROOMS && L.spine <= MAX_ROUTE_ROOMS);
      assert.ok(L.cells.length <= MAX_ROUTE_ROOMS);
      assert.equal(L.route.length, L.spine);
      const entry = key(L.start[0], -d, L.start[1]), goal = L.route.at(-1);
      if (d) {
        assert.equal(L.up, entry);
        assert.deepEqual(L.start, get(d - 1).end);
      }
      if (d < 20) assert.equal(goal, L.down);
      for (const k of L.guardians.keys()) run.unlockedGates.add(k);
      const forward = distances(L, cubes, run, entry), back = distances(L, cubes, run, goal);
      assert.equal(forward.size, L.exists.size); assert.equal(back.size, L.exists.size);
      // Fully explored and unlocked, every pair of neighbouring rooms is joined.
      for (const c of cubes.values()) for (let dir = 0; dir < 4; dir++)
        if (cubes.has(step(c.key, dir))) assert.ok(discoveredFaces(cubes, c, run).includes(faceKey(c.key, dir)), `seed ${seed}, depth ${d}: ${c.key} ${dir} sealed`);
      // An undiscovered route room cannot be skipped, whatever else was discovered
      // (rooms beyond it reached by a fall or the town portal).
      for (const k of L.route.slice(1, -1)) {
        cubes.get(k).visits = 0;
        assert.equal(distances(L, cubes, run, entry, k).has(goal), false, `seed ${seed}, depth ${d}: ${k} skipped`);
        cubes.get(k).visits = 1;
      }
      // Every side guardian cuts all paths to the descent, even after discovery elsewhere.
      for (const [k, g] of L.guardians) if (g.role === 'side') {
        run.unlockedGates.delete(k);
        assert.equal(distances(L, cubes, run, entry).has(goal), false);
        const c = cubes.get(k);
        assert.equal(discoveredFaces(cubes, c, run).includes(faceKey(k, g.exit)), false);
        run.unlockedGates.add(k);
      }
      if (L.down) {
        run.unlockedGates.delete(L.down);
        assert.equal(portalLocked(cubes.get(L.down).map, run, { kind: 'down', dir: 4 }), true);
      }
    }
  }
});

// docs/world.md, "Only where you have been": the next cube is behind a portal until you have been
// there, whatever stands on the way (a gorge span, a large area, a tableland)
test('every step of every route crosses a portal, through spans and large areas too', () => {
  for (let seed = 0; seed < 200; seed++) {
    const get = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) {
      const L = get(d);
      for (let i = 1; i < L.route.length; i++) {
        const a = L.route[i - 1], b = L.route[i], dir = [0, 1, 2, 3].find(x => step(a, x) === b);
        if (dir === undefined) continue;   // (a way down or up between depths)
        assert.ok(L.portals.has(faceKey(a, dir)), `seed ${seed}, depth ${d}: no portal from ${a} to ${b}`);
      }
    }
  }
});
