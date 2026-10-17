import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N } from '../src/core/constants.js';
import { flatMap, state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { groundAt } from '../src/physics/collide.js';
import { embedded, unstick, WEDGED_TIME } from '../src/physics/unstuck.js';

const cell = (x, z) => z * N + x;
// a trunk, in every cell it reaches into (as core/blockers.js indexBlockers does)
function tree(x, z, r = 0.4) {
  const b = { x, z, r, bottom: 0, top: 3 };
  for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++)
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) state.map.blockers[cell(cx, cz)].push(b);
}
function at(x, z, y = 0) {
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, hp: 100,
    support: groundAt(x, z, y + 0.05, 0).s, safe: { x: 2.5, y: 0, z: 2.5 } });
  state.fallFrom = null;
}
// a few steps of WEDGED_TIME / 4: whether it was moved
function wait(t = WEDGED_TIME + 0.05) {
  let moved = false;
  for (let s = 0; s < t; s += WEDGED_TIME / 4) moved = unstick(WEDGED_TIME / 4) || moved;
  return moved;
}
const free = () => !embedded();

test('a body standing freely, even against a wall, is left alone', () => {
  flatMap();
  at(6.5, 6.5);
  assert.ok(free());
  assert.equal(wait(2), false);
  tree(6.5, 7.2, 0.3);   // right in front of it
  at(6.5, 6.6);
  assert.ok(free(), 'a wall on one side is no trap');
  assert.equal(wait(2), false);
});

test('a body with a tree trunk through it steps out beside the trunk', () => {
  flatMap();
  tree(6.5, 6.5);
  at(6.6, 6.5);
  assert.ok(!free());
  assert.equal(unstick(WEDGED_TIME / 2), false, 'not at once');
  assert.ok(wait());
  assert.ok(free());
  const d = Math.hypot(player.x - 6.5, player.z - 6.5);
  assert.ok(d >= 0.62 && d < 1.2, 'just outside the trunk: ' + d);
  assert.equal(player.y, 0);
});

test('a body inside a raised block comes out next to it or on top of it', () => {
  flatMap();
  const f = state.map.cols[cell(6, 6)][0];
  f.cs = [1, 1, 1, 1];   // two levels up
  at(6.5, 6.5);
  assert.ok(!free());
  assert.ok(wait());
  assert.ok(free());
  assert.ok(Math.hypot(player.x - 6.5, player.z - 6.5) < 1.5);
  assert.equal(player.y, groundAt(player.x, player.z, player.y + 0.05, 0).h);
});

test('boxed in all round, it is moved too', () => {
  flatMap();
  for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) tree(6.5 + dx, 6.5 + dz, 0.3);
  at(6.5, 6.5);
  assert.ok(!free(), 'no way to move a little in any direction');
  assert.ok(wait());
  assert.ok(free());
});

test('it prefers a spot that leads out of the cube, else the last safe spot', () => {
  flatMap();
  const m = state.map;
  m.safe = Uint8Array.from(m.floors, f => f.x < 7 ? 1 : 0);
  tree(6.5, 6.5);
  at(6.8, 6.5);   // nearer to the trunk's unsafe side
  assert.ok(wait());
  assert.ok(free());
  assert.ok(player.x < 7 && Math.hypot(player.x - 6.8, player.z - 6.5) < 1, 'out on the safe side, close by: ' + player.x);
  // nothing safe nearby: back to the last safe spot
  m.safe = Uint8Array.from(m.floors, f => f.x < 2 ? 1 : 0);
  tree(6.5, 6.5);
  at(6.8, 6.5);
  player.safe = { x: 1.5, y: 0, z: 6.5 };
  assert.ok(wait());
  assert.deepEqual([player.x, player.z], [1.5, 6.5]);
});
