import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, LAVA } from '../src/core/constants.js';
import { flatMap, state } from './fixtures.js';
import { setMovers } from '../src/physics/collide.js';
import { setTide } from '../src/physics/fluid.js';
import { restGround, restsOn, restSpot, scatterSpot, settle } from '../src/physics/rest.js';

const cell = (x, z) => z * N + x;
// a platform like Foggery's (game/movers.js) over the floor, its top at y
const platform = (x0, z0, y) => ({ mover: true, x0, z0, x1: x0 + 2, z1: z0 + 2, y1: y, y0: y - 0.32, dx: 0, dz: 0, cs: [y, y, y, y] });
// a pit of lava in the floor at (x, z), a level deep
const pit = (x, z) => Object.assign(state.map.cols[cell(x, z)][0], { fluid: LAVA, surf: 1 });
const clean = () => { setMovers([]); setTide(null); };
const rand = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('a body high over the floor scatters its loot onto the floor round its feet', () => {
  flatMap(); clean();
  for (let i = 0; i < 20; i++) {
    const s = scatterSpot(8.5, 0.9, 8.5, 0.3, 0.8, rand(i + 1));
    assert.equal(s.y, 0);
    assert.ok(Math.hypot(s.x - 8.5, s.z - 8.5) <= 0.8 + 1e-9);
  }
  assert.deepEqual(restSpot(4.5, 3, 4.5), { x: 4.5, y: 0, z: 4.5 });
});

test('the platforms are no ground to rest on: what falls on one goes on down to the floor', () => {
  flatMap(); clean();
  setMovers([platform(7, 7, 1)]);
  assert.equal(restGround(8, 8, 1.2).h, 0);
  assert.equal(restSpot(8, 1.2, 8).y, 0);
  for (let i = 0; i < 10; i++) assert.equal(scatterSpot(8, 1.2, 8, 0.3, 0.8, rand(i + 7)).y, 0);
  // one lying on a platform falls through it, and lands
  const p = { x: 8, y: 1, z: 8 };
  let hard = false;
  for (let t = 0; t < 1 && p.y > 0; t += 1 / 60) hard = settle(p, 1 / 60) || hard;
  assert.equal(p.y, 0); assert.ok(hard, 'a noticeable fall lands again'); assert.equal(p.vy, undefined);
  clean();
});

test('ground a hair higher lifts it up; snapping drops it at once', () => {
  flatMap(); clean();
  const p = { x: 3.5, y: -0.03, z: 3.5 };
  assert.equal(settle(p, 1 / 60), false); assert.equal(p.y, 0);
  const q = { x: 3.5, y: 4, z: 3.5 };
  assert.equal(settle(q, 1 / 60, true), false); assert.equal(q.y, 0);
  const r = { x: 3.5, y: 0.01, z: 3.5 };   // (a short drop: no landing again)
  let hard = false;
  for (let t = 0; t < 0.5 && r.y > 0; t += 1 / 60) hard = settle(r, 1 / 60) || hard;
  assert.equal(r.y, 0); assert.equal(hard, false);
});

test('a pit of lava, or no ground at all, sends it to the nearest dry spot', () => {
  flatMap(); clean();
  pit(5, 5);
  const g = restGround(5.5, 5.5, 0);
  assert.ok(Number.isFinite(g.h) && !restsOn(g), 'a pit is no place to rest');
  const s = restSpot(5.5, 0.5, 5.5);
  assert.ok(Math.floor(s.x) !== 5 || Math.floor(s.z) !== 5, 'out of the pit');
  assert.ok(Math.hypot(s.x - 5.5, s.z - 5.5) < 1.6 && s.y === 0);
  state.map.cols[cell(9, 9)] = [];
  const v = restSpot(9.5, 2, 9.5);
  assert.ok(Math.floor(v.x) !== 9 || Math.floor(v.z) !== 9, 'off the hole');
  assert.ok(Number.isFinite(v.y));
  const p = { x: 9.5, y: 0, z: 9.5 };
  settle(p, 1 / 60);
  assert.ok(restsOn(restGround(p.x, p.z, p.y)), 'it settles where it rests');
  // scattered round a body over the pit: never into it
  for (let i = 0; i < 20; i++) {
    const t = scatterSpot(5.5, 0, 5.5, 0.3, 0.8, rand(i + 3));
    assert.ok(Math.floor(t.x) !== 5 || Math.floor(t.z) !== 5);
  }
});

test('a standing fluid that will drain may go over it, a dry spot first', () => {
  flatMap(); clean();
  // lava standing over the middle of the cube (a boss's tide), dry round it
  setTide({ y: 2 * LH, fluid: LAVA, box: [6, 6, 10, 10] });
  for (let i = 0; i < 20; i++) {
    const s = scatterSpot(8, 0.5, 8, 0.3, 0.8, rand(i + 11));   // (all round it under the lava)
    assert.equal(s.y, 0); assert.ok(s.x > 6 && s.x < 10 && s.z > 6 && s.z < 10);
  }
  const near = scatterSpot(6.2, 0.5, 8, 0.3, 0.8, () => 0.5);   // (one try out of it: dry)
  assert.equal(near.y, 0);
  const p = { x: 8, y: 0.5, z: 8 };
  for (let t = 0; t < 1; t += 1 / 60) settle(p, 1 / 60);
  assert.deepEqual([p.x, p.y, p.z], [8, 0, 8], 'it rests under the lava');
  clean();
});
