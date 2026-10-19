import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, WATER, LAVA, ACID, HEAD_Y } from '../src/core/constants.js';
import { flatMap, state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { canMove } from '../src/physics/canmove.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt } from '../src/physics/collide.js';
import { inFluid, wading, wadeable, tooDeep, WADE_MARGIN } from '../src/physics/fluid.js';

function bank(dx = 1, dz = 0, fluid = WATER) {
  const m = flatMap(), f = m.floors[5 * N + 5], water = m.floors[(5 + dz) * N + 5 + dx];
  Object.assign(water, { fluid, surf: -1, top: -3, bottom: -5, cs: [-1.5, -1.5, -1.5, -1.5] });
  Object.assign(player, { x: 5.5 + dx * 0.24, z: 5.5 + dz * 0.24, y: 0,
    vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, fluid: 0,
    support: f, stun: 0, coyote: 0, jumpBuf: 0 });
  return water;
}

test('walking and running stop before water, lava and acid ledges in every direction', () => {
  for (const fluid of [WATER, LAVA, ACID]) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (const run of [false, true]) {
      bank(dx, dz, fluid);
      for (let i = 0; i < 120; i++) movePlayer(1 / 60, dx, dz, run, false);
      assert.equal(Math.floor(player.x), 5);
      assert.equal(Math.floor(player.z), 5);
      assert.equal(player.y, 0);
      assert.equal(player.grounded, true);
      assert.equal(dx ? player.vx : player.vz, 0);
    }
  }
});

test('water guard includes corner probes and still permits sliding along the bank', () => {
  bank(); player.z = 5.99;
  assert.equal(canMove(5.8, 5.99, 'x', 1), false);
  assert.equal(canMove(5.74, 5.9, 'z', -1), true);
});

test('jumping and airborne movement can cross the guarded edge', () => {
  bank();
  movePlayer(1 / 60, 1, 0, false, true);
  assert.equal(player.grounded, false);
  assert.ok(player.vy > 0);
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  for (let i = 0; i < 20; i++) movePlayer(1 / 60, 1, 0, false, false);
  assert.ok(player.x > 6);
});

test('dry drops remain unguarded; every fluid and every void is guarded', () => {
  for (const fluid of [WATER, LAVA, ACID]) {
    bank(1, 0, fluid);
    assert.equal(canMove(5.85, 5.5, 'x', 1), false);
  }
  const dry = bank(); dry.fluid = 0;
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  const hole = bank(); state.map.cols[hole.c] = [];
  assert.equal(canMove(5.85, 5.5, 'x', 1), false);
  // a floor overhead is nothing to stand on either
  state.map.cols[hole.c] = [{ ...hole, fluid: 0, top: 8, bottom: 6, cs: [4, 4, 4, 4] }];
  assert.equal(canMove(5.85, 5.5, 'x', 1), false);
});

test('walking and running stop before a hole through the cube in every direction', () => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const run of [false, true]) {
    const hole = bank(dx, dz); state.map.cols[hole.c] = [];
    for (let i = 0; i < 120; i++) movePlayer(1 / 60, dx, dz, run, false);
    assert.equal(Math.floor(player.x), 5);
    assert.equal(Math.floor(player.z), 5);
    assert.equal(player.y, 0);
    assert.equal(player.grounded, true);
  }
  // a jump still goes out over it, and a bridge across it is walkable
  const hole = bank(); state.map.cols[hole.c] = [];
  movePlayer(1 / 60, 1, 0, false, true);
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  bank(); state.map.cols[hole.c] = [];
  state.map.pieces[hole.c].push({ c: hole.c, kind: 'bridge', dx: 1, dz: 0, j: 0, run: { kind: 'landing', y0: 0 } });
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
});

test('bridges and stacked dry floors above fluids stay walkable', () => {
  for (const fluid of [WATER, LAVA, ACID]) {
  const water = bank(1, 0, fluid);
  state.map.pieces[water.c].push({ c: water.c, kind: 'bridge', dx: 1, dz: 0, j: 0,
    run: { kind: 'landing', y0: 0 } });
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  assert.equal(inFluid(groundAt(6.5, 5.5, 0, 0), -0.1), 0);
  state.map.pieces[water.c] = [];
  state.map.cols[water.c].push({ ...water, fluid: 0, bottom: -0.4, cs: [0, 0, 0, 0] });
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  assert.equal(inFluid(groundAt(6.5, 5.5, 0, 0), -0.1), 0);
  }
});

test('fluid contact begins below the surface, not while jumping above it; water only over the head', () => {
  for (const fluid of [WATER, LAVA, ACID]) {
    const water = bank(1, 0, fluid), gr = groundAt(6.5, 5.5, 10, 0), surface = water.surf * LH;
    assert.equal(inFluid(gr, surface + 1), 0);
    assert.equal(inFluid(gr, surface), 0);
    assert.equal(inFluid(gr, surface - 0.01), fluid === WATER ? 0 : fluid, 'water only drowns over the head');
    assert.equal(inFluid(gr, surface - HEAD_Y - 0.01), fluid);
    water.fluid = 0;
    assert.equal(inFluid(gr, surface - HEAD_Y - 0.01), 0);
  }
  assert.equal(inFluid({ s: null }, -10), 0);
});

test('water shallower than the head is waded through, slowly; deeper water and the rest stop walking', () => {
  // a step down into water half a cell deep: walked into, the player wades on, slowed
  for (const [fluid, wades] of [[WATER, true], [LAVA, false], [ACID, false]]) {
    const water = bank(1, 0, fluid);
    Object.assign(water, { surf: -0.4, top: -1, cs: [-0.5, -0.5, -0.5, -0.5] });
    assert.equal(canMove(5.85, 5.5, 'x', 1), wades, `${fluid}`);
  }
  const water = bank();
  Object.assign(water, { surf: -0.4, top: -1, cs: [-0.5, -0.5, -0.5, -0.5] });
  state.map.floors[5 * N + 5].cs = [-0.5, -0.5, -0.5, -0.5]; state.map.floors[5 * N + 5].top = -1;
  player.y = -0.5;
  for (let i = 0; i < 30; i++) movePlayer(1 / 60, 1, 0, true, false);
  assert.ok(player.x > 6, 'walked in');
  const gr = groundAt(player.x, player.z, player.y + 0.1, 0);
  assert.equal(inFluid(gr, player.y), 0, 'not drowned');
  assert.ok(wading(gr, player.y) > 0.2 && wading(gr, player.y) < HEAD_Y);
});

test('a sloping bed is waded down as far as the water stays under the head, not judged by its deepest corner', () => {
  // the next cell's bed falls from 0.3 under the surface at its near edge to 1.7 at its far one
  const slope = () => {
    const water = bank();
    Object.assign(water, { surf: 0, top: -4, cs: [-0.3, -1.7, -0.3, -1.7] });
    state.map.floors[5 * N + 5].cs = [0, -0.3, 0, -0.3];
    return water;
  };
  assert.ok(tooDeep(slope()), 'too deep at its floor top');
  for (const run of [false, true]) {
    slope();
    for (let i = 0; i < 240; i++) {
      movePlayer(1 / 60, 1, 0, run, false);
      assert.equal(inFluid(groundAt(player.x, player.z, player.y + 0.1, 0), player.y), 0, 'never drowns');
      assert.equal(player.grounded, true);
    }
    const gr = groundAt(player.x, player.z, player.y + 0.1, 0), depth = wading(gr, player.y);
    assert.ok(player.x > 6.05 && player.x < 6.5, `walked partway in: ${player.x}`);
    assert.ok(depth > HEAD_Y - WADE_MARGIN - 0.22 * 1.4 - 0.02 && depth < HEAD_Y - WADE_MARGIN, `up to the neck: ${depth}`);
    // the probe a radius ahead is where it stopped: the bed there is as deep as wading goes
    const ahead = groundAt(player.x + player.r + 0.01, player.z, player.y + 0.1, 0);
    assert.equal(wadeable(ahead), false);
  }
});
