import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { step, faceKey, parse } from '../src/world/coords.js';
import { N, LH } from '../src/core/constants.js';
import { runY } from '../src/core/surfaces.js';

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
// cell j steps in from face d at position t (portals.js edgeCell)
const edge = (d, t, j) => d === 0 ? t * N + N - 1 - j : d === 1 ? t * N + j : d === 2 ? (N - 1 - j) * N + t : j * N + t;
const ground = (m, c) => m.cols[c].find(f => f.layer === 0);

test('spans are planned from the seed on the sky-island depths, straight and in budget', () => {
  let route = 0, island = 0, long = 0;
  for (let seed = 0; seed < 200; seed++) {
    const a = makeLayouts(seed), b = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) {
      const L = a(d);
      assert.deepEqual(L.spans.map(s => s.keys), b(d).spans.map(s => s.keys));
      if (d === 0 || d > 2) { assert.equal(L.spans.length, 0); continue; }
      for (const s of L.spans) {
        s.island ? island++ : route++;
        if (s.n === 2) long++;
        // a straight line, every face of it a portal, nothing guarded or crowded on it
        s.keys.forEach((k, j) => {
          assert.ok(L.exists.has(k));
          if (j) assert.equal(step(s.keys[j - 1], s.dir), k);
          if (j < s.keys.length - 1) assert.ok(L.portals.has(faceKey(k, s.dir)));
          assert.ok(!L.guardians.has(k) && !L.hordes.has(k), `${seed}/${d}: ${k} on a span`);
        });
        for (const k of s.keys.slice(1, -1)) assert.ok(!L.sitePlans.has(k));
        assert.equal(s.levels.length, s.n + 1);
        if (s.island) {
          // nothing but the bridge leads to the island or its gorge
          for (const k of s.keys.slice(1)) for (let d4 = 0; d4 < 4; d4++) {
            const n = step(k, d4);
            if (L.exists.has(n)) assert.ok(s.keys.includes(n), `${seed}/${d}: ${n} next to the island of ${s.id}`);
          }
        } else s.keys.forEach((k, j) => assert.equal(L.route.indexOf(k) - L.route.indexOf(s.keys[0]), j));
      }
    }
  }
  assert.ok(route > 150 && island > 80 && long > 100, JSON.stringify({ route, island, long }));
});

test('a span\'s cubes meet at every face and carry one long bridge from pad to pad', () => {
  let bridges = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const d of [1, 2]) for (const s of w.layout(d).spans) {
      const maps = s.keys.map(k => w.cube(k).map);
      // the crossings: pads at the deck's level on both sides, at the same place
      for (let j = 0; j <= s.n; j++) {
        const a = maps[j], b = maps[j + 1];
        const pa = a.portals.find(p => p.dir === s.dir), pb = b.portals.find(p => p.dir === (s.dir ^ 1));
        assert.equal(pa.y, s.levels[j] * LH, `${seed}: ${s.keys[j]} pad`);
        assert.equal(pb.y, s.levels[j] * LH);
        assert.equal(s.dir < 2 ? pa.z : pa.x, s.pos);
        assert.equal(s.dir < 2 ? pb.z : pb.x, s.pos);
      }
      // ground matches on both sides of every face of every span cube
      for (const k of s.keys.slice(1)) for (let d4 = 0; d4 < 4; d4++) {
        const n = step(k, d4);
        if (!w.layout(d).exists.has(n)) continue;
        const m = w.cube(k).map, o = w.cube(n).map;
        for (let t = 0; t < N; t++) {
          const f = ground(m, edge(d4, t, 0)), g = ground(o, edge(d4 ^ 1, t, 0));
          assert.equal(!!f, !!g);
          if (f && !f.fluid && !g.fluid) assert.equal(f.top, g.top, `${seed}: ${k} face ${d4} at ${t}`);
        }
      }
      // each gorge cube: one bridge over the whole valley, its deck over the ground
      s.keys.slice(1, s.n + 1).forEach((k, i) => {
        const m = w.cube(k).map, runs = m.runs.filter(r => r.span);
        assert.equal(runs.length, 1, `${seed}: ${k} has ${runs.length} span bridges`);
        const r = runs[0];
        assert.equal(r.k, N - 4);
        assert.deepEqual([r.from.top, r.to.top].sort((x, y) => x - y), [s.levels[i], s.levels[i + 1]].sort((x, y) => x - y));
        for (const p of r.pieces) {
          const deck = Math.min(runY(p, 0, 0), runY(p, 1, 1), runY(p, 0.5, 0.5));
          for (const f of m.cols[p.c]) if (f.top * LH < deck) assert.ok(Math.max(...f.cs) < deck - 0.4, `${seed}: ${k} ground under the deck`);
        }
        assert.equal(m.archetype, 'gorge');
        bridges++;
      });
      // every portal of every span cube leads on (the bridge works both ways)
      for (const m of maps) for (const p of m.portals) assert.equal(m.safe[p.floor.id], 1);
      if (s.island) assert.ok(maps.at(-1).rewardSites.length + maps.at(-1).siteFailures.length > 0, 'the island has a destination');
    }
  }
  assert.ok(bridges > 15);
});

test('span cubes are the same whichever way the depth is explored', () => {
  const sig = m => JSON.stringify({ floors: m.floors.map(f => [f.c, f.bottom, f.top]), runs: m.runs.map(r => [r.kind, r.style, r.cells]) });
  for (const seed of [2, 7]) {
    const keys = [1, 2].flatMap(d => new World(seed).layout(d).spans.flatMap(s => s.keys));
    const a = new World(seed), b = new World(seed);
    const fwd = keys.map(k => sig(a.cube(k).map)), back = [...keys].reverse().map(k => sig(b.cube(k).map)).reverse();
    assert.deepEqual(back, fwd);
    for (const k of keys) assert.ok(parse(k)[1] < 0);
  }
});
