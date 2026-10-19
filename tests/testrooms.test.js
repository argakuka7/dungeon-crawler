import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, CHAR_R, HEAD_Y, WATER, LAVA, ACID } from '../src/core/constants.js';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { interiorKey } from '../src/world/town.js';
import { TEST_ROOM_NAMES, testRoomKey, testRoomOf, isTestRoom } from '../src/world/testrooms.js';
import { LADDER_STYLES } from '../src/themes/builds.js';
import { depthOf } from '../src/themes/depth.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { climb } from '../src/physics/climb.js';
import { groundAt } from '../src/physics/collide.js';
import { inFluid, wading, tooDeep } from '../src/physics/fluid.js';
import { supportedPoint } from '../src/physics/respawn.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';

const DT = 1 / 60;
function place(m, x, z, y = null) {
  state.map = m;
  y ??= groundAt(x, z, 99, 0).h;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0, wade: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: 0.85, support: null, climb: null, gust: null, pull: null });
  movePlayer(DT, 0, 0, false, false);
}
// how deep the water at the player's feet is, and whether it takes them
const water = () => { const gr = groundAt(player.x, player.z, player.y + 0.1, 0); return { wade: wading(gr, player.y), lost: inFluid(gr, player.y) }; };

test('test room keys are off the grid, keep their depth and are told apart from every other key', () => {
  const w = new World(3);
  for (const name of TEST_ROOM_NAMES) for (const d of [1, 7, 20]) {
    const k = testRoomKey(name, d);
    assert.equal(testRoomOf(k), name); assert.equal(depthOf(k), d);
    assert.equal(w.layout(d).exists.has(k), false);
  }
  assert.equal(new Set(TEST_ROOM_NAMES.map(n => testRoomKey(n, 1))).size, TEST_ROOM_NAMES.length);
  for (const k of ['0,0,0', '10000,-1,10001', '10001,-1,10000', '-3,-2,5', interiorKey('town_inn_a'), undefined]) assert.equal(isTestRoom(k), false, k);
});

test('every test room builds at every depth, dressed in its theme, with nothing in it but itself', () => {
  const w = new World(5);
  for (const name of TEST_ROOM_NAMES) for (let d = 1; d <= 20; d++) {
    const k = testRoomKey(name, d), m = w.cube(k).map;
    assert.equal(m.key, k); assert.equal(m.depth, d); assert.equal(m.biome, w.layout(d).theme.props);
    assert.deepEqual(m.portals, []); assert.equal(m.populationScale, 0); assert.deepEqual(m.authoredProps, []);
    assert.equal(m.testRoom.name, name);
    for (let c = 0; c < N * N; c++) assert.ok(m.cols[c].some(f => f.layer === 0 && f.bottom === 0), `${name}: ground in every cell`);
    m.floors.forEach((f, i) => assert.equal(f.id, i));
    for (const f of m.floors) if (f.fluid) assert.ok(f.pal !== undefined, 'fluid colours stamped');
    const a = m.testRoom.arrival;
    state.map = m;
    assert.ok(supportedPoint(a.x, a.y, a.z), `${name}: arrive on dry, supported ground`);
    if (d === 1 || d === 20) buildCubeGeometry(m);
  }
});

test('water hill: walking down the shelf wades ever deeper, stops before the head would go under; deeper water drowns', () => {
  const m = new World(1).cube(testRoomKey('water_hill', 1)).map, a = m.testRoom.arrival;
  // no water you can walk into is deeper than the head stands
  for (const f of m.floors) if (f.fluid && !tooDeep(f)) assert.ok(f.surf * LH - Math.min(...f.cs) < HEAD_Y, `cell ${f.x}, ${f.z}`);
  // the shelf: a stretch of wadeable water, several cells long and wide
  const shelf = m.floors.filter(f => f.fluid === WATER && !tooDeep(f) && f.x >= 10 && f.z >= 6 && f.z <= 9);
  assert.ok(shelf.length >= 12, `${shelf.length} wading cells`);
  for (const lz of [6.5, 8.5]) {
    place(m, a.x, lz);
    let deepest = 0, last = 0, wet = 0;
    for (let i = 0; i < 600; i++) {
      movePlayer(DT, 1, 0, false, false);
      const { wade, lost } = water();
      assert.equal(lost, 0, 'never drowns walking');
      assert.equal(player.grounded, true, 'walks, never falls in');
      if (wade > 0) wet++;
      deepest = Math.max(deepest, wade); last = wade;
    }
    assert.ok(wet > 60, 'waded a while');
    assert.ok(deepest > HEAD_Y * 0.75 && deepest < HEAD_Y, `deepest ${deepest}`);
    assert.ok(last > HEAD_Y * 0.75, 'stopped at the deep water, up to the neck');
    assert.ok(player.x > 13 && player.x < 14, `stopped at ${player.x}`);
    // a little further out, the head is under
    const gr = groundAt(14.6, lz, 10, 0);
    assert.equal(inFluid(gr, gr.h), WATER);
  }
  // round the hill the water is deep right at its foot: walking down there stops at the edge, dry
  place(m, 6.5, 5.5);
  for (let i = 0; i < 300; i++) movePlayer(DT, 0, -1, false, false);
  assert.equal(water().lost, 0); assert.ok(player.z > 3, `stopped at ${player.z}`);
});

test('fluids: a waterfall into a lake, lava and acid pools', () => {
  const m = new World(2).cube(testRoomKey('fluids', 3)).map, kinds = new Set(m.floors.map(f => f.fluid));
  assert.ok(kinds.has(WATER) && kinds.has(LAVA) && kinds.has(ACID));
  assert.equal(m.falls.length, 1);
  const fall = m.falls[0], foot = m.cols[fall.c].at(-1);
  assert.equal(foot.fluid, WATER); assert.equal(foot.surf, fall.bot);
  const lip = m.cols[fall.c - N].at(-1);
  assert.equal(lip.fluid, WATER); assert.equal(lip.surf, fall.top);
  // the lake shelves: some of it can be waded, the middle cannot
  const lake = m.floors.filter(f => f.fluid === WATER && f.surf === fall.bot);
  assert.ok(lake.some(f => !tooDeep(f)) && lake.some(f => tooDeep(f)));
  for (const f of m.floors) if (f.fluid === LAVA || f.fluid === ACID) assert.ok(tooDeep(f));
  // the ladder up the cliff
  assert.equal(m.ladders.length, 1); assert.equal(m.ladders[0].y1 - m.ladders[0].y0, 5);
});

test('climb: every ladder style, the hanging ones hanging too, and every ladder climbs to its top', () => {
  const m = new World(4).cube(testRoomKey('climb', 2)).map;
  assert.deepEqual([...new Set(m.ladders.filter(l => !l.hang).map(l => l.style))].sort(), Object.keys(LADDER_STYLES).sort());
  assert.deepEqual(m.ladders.filter(l => l.hang).map(l => l.style).sort(),
    Object.keys(LADDER_STYLES).filter(s => LADDER_STYLES[s].hang).sort());
  for (const l of m.ladders) {
    const [nx, nz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][l.d];
    place(m, l.x + 0.5, l.z + 0.5, l.y0);
    let on = false;
    // (as the game does: on the ladder it climbs, else it walks)
    for (let i = 0; i < 1200 && !(on && !player.climb); i++) {
      if (climb(DT, nx, nz, false)) on = true; else movePlayer(DT, nx, nz, false, false);
    }
    assert.ok(on, `${l.style}: got on`);
    assert.equal(player.y, l.y1, `${l.style}${l.hang ? ' (hanging)' : ''}: up to the top`);
    assert.equal(player.climb, null);
    assert.equal(groundAt(player.x, player.z, player.y + 0.1, 0).s, m.floors[l.hi], 'stepped onto the floor at its top');
  }
});
