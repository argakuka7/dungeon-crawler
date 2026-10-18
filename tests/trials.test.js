import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLayouts } from '../src/world/layout.js';
import { World } from '../src/world/world.js';
import { step, faceKey, parse, key } from '../src/world/coords.js';
import { voidAllowed, fallMask } from '../src/world/voids.js';
import { MAX_DEPTH, worldThemes } from '../src/themes/depth.js';
import { TRIALS, trialGate, floodLevel, floodTime, nextPulse, drainLevel, DRAIN_TIME, fitFlood, floodEnd, FLOOD, ARM_TIME, SLACK,
  newTrial, stepTrial, resolveTrial, resetTrial, trialFluidLevel, trialSealed } from '../src/core/trials.js';
import { portalLocked } from '../src/core/guardians.js';
import { createRun } from '../src/core/progression.js';
import { discoveredFaces } from '../src/core/boundaries.js';
import { state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt } from '../src/physics/collide.js';
import { inFluid, setTrialFluid, underTrialFluid } from '../src/physics/fluid.js';
import { checkDeadlines } from '../src/cubegen/trials/timing.js';
import { N, LH, CHAR_R, CHAR_H } from '../src/core/constants.js';

const DEPTHS = Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1);
const forced = (seed, trial) => makeLayouts(seed, worldThemes(seed), { trial });

test('no trials in a world unless they are forced (until they are on)', () => {
  for (let seed = 0; seed < 40; seed++) {
    const L = makeLayouts(seed);
    for (let d = 0; d <= MAX_DEPTH; d++) assert.equal(L(d).trials.length, 0, `${seed}/${d}`);
  }
});

test('forced floods: one per depth where a room fits, the same plan whatever the order, never in an excluded room', () => {
  let rooms = 0, depths = 0;
  for (let seed = 0; seed < 60; seed++) {
    const a = forced(seed, 'flood'), b = forced(seed, 'flood');
    for (const d of [...DEPTHS].reverse()) b(d);   // the other way round
    for (let d = 0; d <= MAX_DEPTH; d++) {
      const L = a(d);
      assert.deepEqual(L.trials.map(t => [t.key, t.kind, t.from]), b(d).trials.map(t => [t.key, t.kind, t.from]), `${seed}/${d}`);
      if (d === 0 || d === MAX_DEPTH) { assert.equal(L.trials.length, 0); continue; }
      depths++;
      assert.ok(L.trials.length <= 1, `${seed}/${d}: one event slot`);
      for (const t of L.trials) {
        rooms++;
        assert.equal(t.kind, 'flood'); assert.equal(t.role, 'route');
        const i = L.route.indexOf(t.key);
        assert.ok(i >= 2 && i <= L.route.length - 2, `${seed}/${d}: at ${i} of ${L.route.length}`);
        assert.equal(L.route[i - 1], t.from);
        assert.equal(step(t.from, t.fromDir), t.key);
        assert.equal(step(t.key, t.exit), L.route[i + 1]);
        assert.equal(L.gateFaces.get(faceKey(t.key, t.exit)), trialGate(t.key));
        assert.equal(L.trialCells.get(t.key), t);
        for (const k of [t.key, t.from]) {
          assert.ok(!L.guardians.has(k) && !L.hordes.has(k) && !L.spanCells.has(k) && !L.heightCells.has(k) && !L.areaCells.has(k),
            `${seed}/${d}: ${k} is not ordinary`);
        }
        assert.ok(L.pinnacle !== t.key && L.peak !== t.key && L.lake !== t.key && L.annex?.key !== t.key && L.annex?.parent !== t.key);
        assert.ok(!L.sitePlans.has(t.key), `${seed}/${d}: a reward site in the trial room`);
        assert.ok(!(L.spots.get(t.key) || []).length, `${seed}/${d}: a quest spot in the trial room`);
        // entered only by its two portals: no branch attaches to it, nothing pinned beside it
        const links = [0, 1, 2, 3].filter(d4 => L.portals.has(faceKey(t.key, d4)) || L.portals.has(faceKey(step(t.key, d4), d4 ^ 1)));
        assert.deepEqual(links.sort(), [t.fromDir ^ 1, t.exit].sort(), `${seed}/${d}: portals of ${t.key}`);
        for (let d4 = 0; d4 < 4; d4++) {
          const n = step(t.key, d4);
          assert.ok(!L.spanCells.has(n) && !L.heightCells.has(n) && !L.areaCells.has(n), `${seed}/${d}: pinned beside ${t.key}`);
        }
      }
    }
  }
  assert.ok(rooms / depths > 0.85, `floods in ${rooms} of ${depths} depths`);
});

test('nothing falls into a trial room, no river crosses it, it has one layer', () => {
  let n = 0;
  for (let seed = 0; seed < 12; seed++) {
    const w = new World(seed, { trial: 'flood' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) {
      n++;
      const [X, Y, Z] = parse(t.key);
      assert.equal(voidAllowed(w, t.key), false);
      if (d > 1 && w.layout(d - 1).exists.has(key(X, Y + 1, Z))) assert.equal(voidAllowed(w, key(X, Y + 1, Z)), false);
      assert.equal(fallMask(w, t.key), null, `${seed}/${d}: a fall into ${t.key}`);
      w.prepare(t.key);
      const tile = w.wfc.tiles.get(t.key);
      assert.deepEqual(tile.sock, ['L', 'L', 'L', 'L']); assert.equal(tile.K, 1);
      for (let d4 = 0; d4 < 4; d4++) {
        const f = w.faces.get(faceKey(t.key, d4));
        assert.ok(!f.river && !f.spout, `${seed}/${d}: ${t.key} face ${d4}`);
      }
      const spec = w.spec(t.key);
      assert.equal(spec.trial.kind, 'flood'); assert.ok(!spec.tunnel && !spec.pinnacle && !spec.voidOK);
      w.prepare(t.from);
      assert.equal(w.spec(t.from).trialFaces[t.fromDir], 'flood');
    }
  }
  assert.ok(n > 150, `${n} trial rooms`);
});

test('the kinds: every one has a name, a family and depths', () => {
  for (const [id, t] of Object.entries(TRIALS)) {
    assert.ok(t.name && ['event', 'puzzle'].includes(t.family) && t.depths[0] >= 1 && t.depths[1] <= 19, id);
    assert.equal(t.id, id);
  }
});

// every flood room of a few worlds, generated
function* floods(seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: 'flood' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'flood') yield { w, t, seed, d, m: w.cube(t.key).map };
  }
}
const SEEDS = Array.from({ length: 10 }, (_, i) => i);

test('every flood room generates: a summit, the highest ground, reached from every portal, and on to the exit', () => {
  let n = 0, attempts = 0;
  for (const { t, seed, d, m } of floods(SEEDS)) {
    n++; attempts += m.attempts;
    const tr = m.trial;
    assert.equal(tr.kind, 'flood'); assert.equal(tr.gate, t.gate); assert.equal(m.archetype, 'trial'); assert.ok(m.trialRoom);
    const top = m.floors[tr.goalFloor];
    assert.equal(top.top, tr.summit.level);
    const inside = g => Math.min(g.x, g.z, N - 1 - g.x, N - 1 - g.z) >= 2;
    assert.ok(m.floors.every(g => g.fluid || !inside(g) || g.top <= tr.summit.level), `${seed}/${d}: the summit is not the highest`);
    assert.ok(tr.summit.level - tr.lo >= 10, `${seed}/${d}: the summit is ${tr.summit.level - tr.lo} over its foot`);
    // the way up starts at the entry's pad and ends on the summit
    const entry = m.portals.find(p => p.dir === tr.entry);
    assert.equal(tr.entryFloor, entry.floor.id);
    const last = tr.path.at(-1);
    assert.ok(Math.hypot(last.x - tr.button.x, last.z - tr.button.z) < 0.01, `${seed}/${d}: the path ends off the summit`);
    for (const p of m.portals) assert.equal(m.safe[p.floor.id], 1, `${seed}/${d}: portal ${p.dir} cut off from the exit`);
    // nobody spawns on the way up
    assert.ok(tr.pathFloors.every(id => m.floors[id].noSpawn));
  }
  assert.ok(n > 150, `${n} floods`);
  assert.ok(attempts / n < 4, `${(attempts / n).toFixed(2)} attempts a room`);
});

test('the flood rises in pulses, never falls, and stops at its mark', () => {
  const tl = { kind: 'flood', from: 2, to: 15, step: 2, rise: 3, pulses: [3, 10, 17, 24, 31, 38, 45] };
  let last = -Infinity;
  for (let t = 0; t <= 80; t += 0.05) {
    const l = floodLevel(tl, t);
    assert.ok(l >= last - 1e-9, `falls at ${t}`);
    assert.ok(l <= tl.to + 1e-9);
    last = l;
  }
  assert.equal(floodLevel(tl, 0), 2); assert.equal(floodLevel(tl, 3), 2);
  assert.equal(floodLevel(tl, 4.5), 3);   // half way up the first pulse
  assert.equal(floodLevel(tl, 6), 4); assert.equal(floodLevel(tl, 9.9), 4);   // holding
  assert.equal(floodLevel(tl, 80), 15);
  // floodTime is its inverse
  for (const h of [2.5, 3, 4.2, 9, 14.9]) assert.ok(Math.abs(floodLevel(tl, floodTime(tl, h)) - h) < 1e-9, `${h}`);
  assert.equal(floodTime(tl, 15), null);
  assert.equal(nextPulse(tl, 4), 10); assert.equal(nextPulse(tl, 46), null);
  assert.equal(drainLevel(tl, 10, 0), 10); assert.equal(drainLevel(tl, 10, DRAIN_TIME), 2);
});

test('fitting a flood: pulses wait for a slow player, last 50 to 70 s, and a way too long fails', () => {
  const easy = fitFlood(2, 16, []);
  assert.ok(floodEnd(easy) >= 50 && floodEnd(easy) <= 70, `${floodEnd(easy)}`);
  assert.ok(easy.pulses[0] >= ARM_TIME);
  for (let j = 1; j < easy.pulses.length; j++) assert.ok(easy.pulses[j] - easy.pulses[j - 1] >= FLOOD.rise + FLOOD.hold - 1e-9);
  // a need holds its pulse (and the ones after it) back
  const held = fitFlood(2, 16, [20, undefined, 30]);
  assert.ok(held.pulses[0] >= 20 && held.pulses[2] >= 30);
  assert.ok(floodEnd(held) <= 70);
  assert.equal(fitFlood(2, 16, [, , , , , , 69]), null);
});

test('the deadline check: a synthetic way up passes a fitted flood and fails a too fast one', () => {
  // a straight way up: node i at level 3 + i, reached after 1.5 s each
  const path = Array.from({ length: 12 }, (_, i) => ({ id: i, x: i, z: 0, top: 3 + i, landing: true }));
  const arr = { time: new Map(path.map((n, i) => [n.id, i * 1.5])) };
  const to = 13, needs = [];
  path.forEach((n, i) => { if (i + 1 < path.length && n.top < to) { const j = Math.floor((n.top - 2) / 2); needs[j] = Math.max(needs[j] ?? 0, arr.time.get(i + 1) * SLACK + ARM_TIME); } });
  const tl = fitFlood(2, to, needs), deadline = tl => n => n.top >= to ? null : floodTime(tl, n.top);
  assert.ok(checkDeadlines(path, arr, deadline(tl)).ok);
  const fast = { ...tl, pulses: tl.pulses.map((_, j) => ARM_TIME + j * 2) };
  const res = checkDeadlines(path, arr, deadline(fast));
  assert.ok(!res.ok && res.slack < 0, JSON.stringify(res.fail));
  // ending on a floor that floods fails
  assert.ok(!checkDeadlines(path.slice(0, 5), arr, deadline(tl)).ok);
});

test('every generated flood room passes its own timing check', () => {
  let n = 0;
  for (const { seed, d, m } of floods(SEEDS.slice(0, 6))) {
    n++;
    const { timeline: tl, check } = m.trial;
    assert.ok(check.slack >= 0, `${seed}/${d}: slack ${check.slack}`);
    assert.ok(floodEnd(tl) >= FLOOD.min - 1e-6 && floodEnd(tl) <= FLOOD.max + 1e-6, `${seed}/${d}: ${floodEnd(tl)} s`);
    assert.equal(tl.to, m.trial.summit.level - 2);
    // every floor of the checked path is left in time, again from the stored numbers
    check.path.forEach((p, i) => {
      if (p.dl == null) return;
      assert.ok(i + 1 < check.path.length, `${seed}/${d}: the path ends under water`);
      assert.ok(check.path[i + 1].t * SLACK + ARM_TIME <= p.dl + 1e-6, `${seed}/${d}: node ${i}`);
    });
    assert.equal(check.path.at(-1).dl, null);
  }
  assert.ok(n > 90);
});

test('the states: idle until a player steps off the pad, armed for ARM_TIME, then running; resolved for good, reset to idle', () => {
  const t = { key: 'k', kind: 'flood' };
  const s = newTrial(t);
  assert.equal(s.phase, 'idle');
  assert.equal(stepTrial(s, 1, { away: false }), null); assert.equal(s.phase, 'idle'); assert.equal(s.t, 0);
  assert.equal(stepTrial(s, 0.1, { away: true }), 'armed');
  for (let i = 0; i < 29; i++) stepTrial(s, 0.1);
  assert.equal(s.phase, 'armed');
  assert.equal(stepTrial(s, 0.1), 'running');
  stepTrial(s, 1); assert.ok(Math.abs(s.t - (ARM_TIME + 1)) < 1e-9);
  assert.ok(resolveTrial(s, 7)); assert.equal(s.phase, 'resolved'); assert.equal(resolveTrial(s), false);
  stepTrial(s, 2); assert.equal(s.done, 2);
  resetTrial(s); assert.deepEqual([s.phase, s.t], ['idle', 0]);
  assert.equal(newTrial(t, true).phase, 'resolved');
  // puzzles never arm
  const p = newTrial({ key: 'p', kind: 'slide' });
  stepTrial(p, 1, { away: true }); assert.equal(p.phase, 'idle');
  // the fluid: none while idle, the timeline's level while it runs, draining back once resolved
  const m = { kind: 'flood', timeline: { kind: 'flood', from: 2, to: 15, step: 2, rise: 3, pulses: [3, 10, 17] } };
  const f = newTrial({ key: 'f', kind: 'flood' });
  assert.equal(trialFluidLevel(m, f), null);
  stepTrial(f, 0, { away: true }); stepTrial(f, 11.5);
  assert.equal(trialFluidLevel(m, f), floodLevel(m.timeline, 11.5));
  resolveTrial(f, trialFluidLevel(m, f));
  stepTrial(f, DRAIN_TIME / 2);
  assert.ok(trialFluidLevel(m, f) < 5 && trialFluidLevel(m, f) > 2);
  stepTrial(f, DRAIN_TIME);
  assert.equal(trialFluidLevel(m, f), null);
});

const DT = 1 / 60;
function place(m, x, y, z) {
  state.map = m;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: null, climb: null });
  movePlayer(DT, 0, 0, false, false);
}

test('under the trial\'s fluid everything drowns, and walking stops at its edge', () => {
  const { m } = floods([1]).next().value, tr = m.trial, entry = m.portals.find(p => p.dir === tr.entry);
  const a = tr.check.path[1];
  place(m, a.x, a.y, a.z);
  const gr = groundAt(player.x, player.z, player.y + 0.1, 0);
  setTrialFluid(null);
  assert.equal(inFluid(gr, player.y), 0);
  setTrialFluid({ y: player.y + 0.4, fluid: tr.fluid });
  assert.equal(inFluid(gr, player.y), tr.fluid, 'standing in it drowns');
  assert.equal(inFluid(gr, player.y + 0.5), 0, 'over it is dry');
  // on the summit, the water round its foot: walking off the top towards it stops at the edge
  const b = tr.button;
  place(m, b.x, b.y, b.z);
  setTrialFluid({ y: b.y - 0.3, fluid: tr.fluid });
  assert.equal(underTrialFluid(b.y), false);
  assert.ok(underTrialFluid(b.y - 1));
  setTrialFluid(null);
  void entry;
});

// The slow player: walking (not running) along the checked path, the water rising as the
// timeline says from the moment it arms (they step off the pad), every step checked for drowning.
// Climbs the walker cannot do (a ladder, a jump) are taken at their checked time.
test('walking the checked way up of every flood with the real water: the summit is reached dry', () => {
  let n = 0, worst = Infinity;
  for (const { seed, d, m } of floods(SEEDS.slice(0, 4))) {
    const { check, timeline: tl } = m.trial, pts = check.path;
    place(m, pts[0].x, pts[0].y, pts[0].z);
    let t = 0, drowned = null;
    const water = () => { setTrialFluid({ y: floodLevel(tl, t) * LH, fluid: m.trial.fluid }); };
    for (let j = 1; j < pts.length && !drowned; j++) {
      const q = pts[j];
      let steps = 0;
      while (Math.hypot(q.x - player.x, q.z - player.z) > 0.15 && steps++ < 300) {
        const dx = q.x - player.x, dz = q.z - player.z, dist = Math.hypot(dx, dz);
        movePlayer(DT, dx / dist, dz / dist, false, false);
        t += DT; water();
        const gr = groundAt(player.x, player.z, player.y + 0.1, 0);
        if (inFluid(gr, player.y)) { drowned = `at ${t.toFixed(1)} s on the way to point ${j}`; break; }
      }
      if (Math.hypot(q.x - player.x, q.z - player.z) > 0.15) {   // a climb: at its checked time
        t = Math.max(t, q.t); place(m, q.x, q.y + 0.05, q.z);
      }
    }
    setTrialFluid(null);
    assert.ok(!drowned, `${seed}/${d}: drowned ${drowned}`);
    const dl = floodTime(tl, tl.to - 0.01);
    worst = Math.min(worst, dl - t);
    n++;
  }
  assert.ok(n > 40 && worst > 0, `${n} walks, the least margin ${worst.toFixed(1)} s`);
});

test('the flood\'s summit is climbed by its ramp: no stair, ladder or bridge leads onto it', () => {
  for (const { seed, d, m } of floods(SEEDS.slice(0, 5))) {
    const keep = new Set([...m.trial.summit.cells, ...m.trial.pathFloors.map(id => m.floors[id].c)]);
    const needle = new Set(m.trial.summit.cells);
    for (const r of m.runs) if (r.kind !== 'landing') assert.ok(!needle.has(r.from.c) && !needle.has(r.to.c), `${seed}/${d}: a ${r.kind} onto the summit`);
    for (const l of m.ladders) assert.ok(!needle.has(l.hi) && !needle.has(l.lo), `${seed}/${d}: a ladder onto the summit`);
    void keep;
  }
});

test('sealed while an event is armed or running; the exit locked by its gate until resolved', () => {
  const { m, t } = floods([3]).next().value, s = newTrial(m.trial), run = createRun();
  assert.equal(trialSealed(s), false);
  assert.ok(portalLocked(m, run, { dir: t.exit }), 'the exit is locked');
  assert.ok(!portalLocked(m, run, { dir: t.fromDir ^ 1 }), 'the way back is not');
  stepTrial(s, 0, { away: true });
  assert.ok(trialSealed(s));
  stepTrial(s, ARM_TIME + 1);
  assert.equal(s.phase, 'running'); assert.ok(trialSealed(s));
  resolveTrial(s); run.unlockedGates.add(m.trial.gate);
  assert.equal(trialSealed(s), false);
  assert.ok(!portalLocked(m, run, { dir: t.exit }), 'resolved: the exit opens');
  resetTrial(s); assert.equal(trialSealed(s), false);
  // puzzles and unsealed kinds never seal
  const p = newTrial({ key: 'p', kind: 'slide' }); p.phase = 'running';
  assert.equal(trialSealed(p), false);
});

test('discovery joins a trial room only through its portals; its gate keeps the way on shut', () => {
  for (let seed = 0; seed < 30; seed++) {
    const L = forced(seed, 'flood');
    for (const d of DEPTHS) for (const t of L(d).trials) {
      const rooms = new Map([...L(d).exists].map(k => [k, { key: k, visits: 1, map: { key: k, exit: L(d).exit.get(k), routeIndex: L(d).routeIndex.get(k),
        route: L(d).route, trialRoom: L(d).trialCells.has(k), gateKeys: [0, 1, 2, 3].map(d4 => L(d).gateFaces.get(faceKey(k, d4))),
        portals: [0, 1, 2, 3].filter(d4 => L(d).portals.has(faceKey(k, d4)) || L(d).portals.has(faceKey(step(k, d4), d4 ^ 1))).map(dir => ({ dir, kind: 'side' })) } }]));
      const run = createRun(), c = rooms.get(t.key);
      const open = discoveredFaces(rooms, c, run);
      assert.ok(!open.includes(faceKey(t.key, t.exit)), `${seed}/${d}: the exit opens before it is resolved`);
      for (const fk of open) assert.ok(c.map.portals.some(p => faceKey(t.key, p.dir) === fk), `${seed}/${d}: ${fk} is not a portal`);
      run.unlockedGates.add(t.gate);
      assert.ok(discoveredFaces(rooms, c, run).includes(faceKey(t.key, t.exit)), `${seed}/${d}: resolved, the exit opens`);
    }
  }
});
