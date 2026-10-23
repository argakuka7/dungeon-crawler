import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, CHAR_R, CHAR_H, SIT_IMPACT } from '../src/core/constants.js';
import { idx, edgeKey } from '../src/core/util.js';
import { topOf } from '../src/core/surfaces.js';
import { flatMap, state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { testRoomKey } from '../src/world/testrooms.js';
import { LEAPS } from '../src/cubegen/testrooms.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { climb } from '../src/physics/climb.js';
import { leapsFrom } from '../src/physics/leaps.js';
import { passable, planWalk, steerWalk, findWay } from '../src/physics/playernav.js';

const DT = 1 / 60;
function stand(m, f) {
  state.map = m;
  Object.assign(player, { x: f.x + 0.5, y: topOf(f, 0.5, 0.5), z: f.z + 0.5, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false,
    fluid: 0, wade: 0, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: f, climb: null, gust: null, pull: null, effects: {} });
}
// Click node `to` (its middle) and play the order out as game/update.js does (game/orders.js:
// slowing down onto the spot; on a ladder it climbs, else it walks): how it went and what its way
// was made of
function click(to, frames = 3600) {
  const w = planWalk(to, to.x + 0.5, to.z + 0.5, topOf(to, 0.5, 0.5), false);
  const used = new Set((w.how || []).map((h, i) => h?.ladder ? (h.up ? 'up' : 'down') : h ? (h.drop ? 'drop' : 'jump' + h.k) : w.path[i].kind).filter(Boolean));
  let hard = 0;
  for (let i = 0; i < frames; i++) {
    const s = steerWalk(w, DT);
    if (!s) return { ok: false, why: 'on a ladder not on the way', used, w };
    const left = Math.hypot(w.x - player.x, w.z - player.z);
    if (w.done && left < 0.08) return { ok: w.reached && player.support === to, hard, used, w, why: 'ended elsewhere' };
    const ease = s.end ? Math.min(1, Math.max(0.25, left / 0.5)) : 1, dx = s.dx * ease, dz = s.dz * ease;
    if (!climb(DT, dx, dz, s.jump, s.ladder)) hard = Math.max(hard, movePlayer(DT, dx, dz, true, s.jump).landed);
  }
  return { ok: false, why: `stuck at ${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)}`, used, w };
}

test('leaps room: clicks jump the trench, onto the ledge and down over the wide gap, climb the tower and out of the pit, and come back', () => {
  const m = new World(1).cube(testRoomKey('leaps', 1)).map, at = (x, z) => m.cols[idx(x, z)][0];
  const { ledge, tower, pit, gap, steps } = LEAPS;
  stand(m, at(2, 8));
  const trip = [
    [at(7, 8), ['jump1']],                       // over the trench
    [at(ledge.x, 3), ['jump0']],                 // up onto the ledge
    [at(tower.x, tower.z1), ['up']],             // up the tower
    [at(8, 8), ['down']],                        // and down again
    [at(12, 5), ['jump2']],                      // over the wide gap, down onto the low ground
    [at(pit.x0, 8), ['drop']],                   // down into the pit
    [at(12, 12), ['up']],                        // out up its ladder
    [at(gap[0], steps), ['jump0']],              // back up the steps
    [at(2, 8), ['jump1']],                       // and home over the trench
  ];
  for (const [to, kinds] of trip) {
    const r = click(to);
    assert.ok(r.ok, `to ${to.x}, ${to.z}: ${r.why}`);
    for (const k of kinds) assert.ok(r.used.has(k), `to ${to.x}, ${to.z} by ${k}: ${[...r.used]}`);
    assert.ok(r.hard < SIT_IMPACT, `to ${to.x}, ${to.z}: a soft landing (${r.hard})`);
  }
  // the trench is never jumped into, the pit only left by its ladder
  assert.equal(leapsFrom(m, at(pit.x0, 8), passable).length, 0, 'no jump out of the pit');
});

test('no leap that is too far or too high, but higher with a leaping potion', () => {
  // ground at level 4, a gap four cells wide (x = 4..7) at level 0 and a ledge two levels up
  const m = flatMap(), level = (x, z) => x >= 4 && x <= 7 ? 0 : x === 10 && z === 8 ? 6 : 4;
  for (const f of m.floors) { f.top = level(f.x, f.z); f.cs = Array(4).fill(f.top * LH); }
  for (const f of m.floors) f.link = f.link.map(g => g && g.top === f.top ? g : null);
  const at = (x, z) => m.floors[idx(x, z)];
  stand(m, at(2, 8));
  const way = findWay(at(2, 8), at(9, 8), { x: 9.5, z: 8.5 });
  assert.notEqual(way.path.at(-1), at(9, 8), 'four cells are too far');
  assert.equal(way.path.at(-1).x, 3, 'it goes as far as the edge');
  assert.ok(!leapsFrom(m, at(9, 8), passable).some(e => e.g === at(10, 8)), 'two levels up is too high');
  stand(m, at(9, 8));
  player.effects = { 'buff:jump': { value: 1 } };
  assert.ok(leapsFrom(m, at(9, 8), passable).some(e => e.g === at(10, 8)), '... but not with a leaping potion');
  const r = click(at(10, 8));
  assert.ok(r.ok && r.used.has('jump0'), r.why);
  player.effects = {};
});

test('climb room: a click takes every ladder to its top, and another back down', () => {
  const m = new World(4).cube(testRoomKey('climb', 2)).map;
  for (const l of m.ladders) {
    const lo = m.floors[l.lo], hi = m.floors[l.hi];
    stand(m, lo);
    const up = click(hi);
    assert.ok(up.ok && up.used.has('up'), `${l.style}${l.hang ? ' (hanging)' : ''} up: ${up.why}`);
    const down = click(lo);
    assert.ok(down.ok && down.used.has('down'), `${l.style}${l.hang ? ' (hanging)' : ''} down: ${down.why}`);
  }
});

test('a mouse order takes hold of no ladder but the one its way climbs', () => {
  const m = new World(4).cube(testRoomKey('climb', 2)).map, [l, other] = m.ladders, [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][l.d];
  for (const [only, holds] of [[undefined, true], [null, false], [other, false], [l, true]]) {
    stand(m, m.floors[l.lo]);
    let on = false;
    for (let i = 0; i < 60 && !on; i++) on = climb(DT, dx, dz, false, only) || (movePlayer(DT, dx, dz, false, false), false);
    assert.equal(on, holds);
  }
});

test('generated cubes: clicks get there, over stairs, bridges, ladders and jumps', () => {
  const used = {}, out = { ok: 0, failed: [] };
  for (const seed of [1, 2]) {
    const w = new World(seed);
    for (let d = 1; d <= 6; d++) for (const k of [...w.layout(d).exists].slice(0, 2)) {
      const m = w.cube(k).map;
      state.map = m;
      const nodes = m.floors.filter(f => !f.fluid && passable(f));
      let r = seed * 7919 + d;
      const pick = () => nodes[(r = (r * 16807) % 2147483647) % nodes.length];
      for (let j = 0; j < 12; j++) {
        const a = pick(), b = pick();
        stand(m, a);
        if (!findWay(a, b, { x: b.x + 0.5, z: b.z + 0.5 }).path.includes(b)) continue;
        stand(m, a);
        const res = click(b);
        for (const u of res.used) used[u] = (used[u] || 0) + 1;
        if (res.ok && res.hard < SIT_IMPACT) out.ok++; else out.failed.push(`${seed} ${k}: ${a.id} -> ${b.id} ${res.why}`);
      }
    }
  }
  // (a node or two the floor graph has headroom on that the body has not: those orders give up)
  assert.ok(out.failed.length <= Math.ceil(out.ok / 100), `${out.ok} arrived, failed: ${out.failed.join('; ')}`);
  for (const k of ['stair', 'bridge', 'up', 'down', 'jump0', 'jump1', 'drop']) assert.ok(used[k] > 0, `${k}: ${JSON.stringify(used)}`);
});

test('corner cutting keeps off a stair\'s side: onto it only along its run', () => {
  // a stair east along z = 8 from level 0 (x = 4) up to level 4 (x = 9), its sides railed
  const m = flatMap(), at = (x, z) => m.floors[idx(x, z)];
  for (let x = 9; x < N; x++) for (let z = 0; z < N; z++) { const f = at(x, z); f.top = 4; f.cs = Array(4).fill(4 * LH); }
  for (const f of m.floors) f.link = f.link.map(g => g && g.top === f.top ? g : null);
  const run = { kind: 'stair', from: at(4, 8), to: at(9, 8), d: 0, dx: 1, dz: 0, k: 4, sag: 0, y0: 0, y1: 4 * LH, ymid: LH * 2 };
  run.pieces = [5, 6, 7, 8].map((x, j) => ({ kind: 'stair', c: idx(x, 8), j, dx: 1, dz: 0, run, base: 0 }));
  m.runs = [run];
  for (const p of run.pieces) m.pieces[p.c].push(p);
  // its invisible side rails (cubegen/fences.js)
  for (const p of run.pieces) for (const z of [7, 9]) {
    const x = p.c % N, ymin = run.y1 * p.j / run.k, ymax = run.y1 * (p.j + 1) / run.k;
    m.fences.set(edgeKey(x, 8, x, z), [{ ymin, ymax, show: false }]);
  }
  // from beside it, its foot behind: round to the foot, then up (cutting the corner by the cells
  // on the way alone would head straight up its side, into the rail)
  stand(m, at(8, 10));
  const r = click(at(12, 8));
  assert.ok(r.ok && r.used.has('stair'), r.why);
  assert.ok(r.w.path.indexOf(at(4, 8)) > 0, 'by its foot');
});
