import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { FOGGERY, FOGGERY_BALL, FOG_FACE, FOG_CAT, FIREFACE, FIRECAT, ENEMY_KINDS, STAGE_PROFILES, wardedNow } from '../src/core/enemies.js';
import { FOGGERY_FIGHT, TOWER, PLATFORMS, SLOTS, SLOT_NEXT, LAVA, splitHp, summonCount, barred, rampHeight, rampMarks,
  newLava, moveLava, stepLava, puzzleMoves, puzzleStart, puzzleAt, platformsAt } from '../src/core/foggery.js';
import { guardianLockMessage } from '../src/core/guardians.js';
import { tideLevel } from '../src/core/squarlo.js';
import { findPath } from '../src/physics/enemynav.js';
import { mulberry32 } from '../src/core/util.js';
import { floorY } from '../src/core/surfaces.js';
import { LH, HEAD, JUMP_V, GRAV, WALK_SPEED, CHAR_H } from '../src/core/constants.js';

const fifthDescent = seed => {
  const w = new World(seed), L = w.layout(4);
  return { w, L, map: state.map = w.cube(L.down).map };
};

test('Foggery takes the place of the descent guardian of depth 4, and only that one', () => {
  assert.equal(BOSSES[4], 'foggery'); assert.equal(bossAt(4), 'foggery'); assert.equal(bossAt(4, 'side'), null);
  for (const seed of [0, 3]) {
    const w = new World(seed);
    for (let d = 3; d < 6; d++) for (const [key, g] of w.layout(d).guardians) {
      assert.equal(g.boss === 'foggery', d === 4 && g.role === 'descent', `${seed} ${d} ${key}`);
      if (g.boss !== 'foggery') continue;
      const map = w.cube(key).map;
      assert.equal(map.arena.type, 'tower'); assert.equal(guardianLockMessage(map), 'Defeat Foggery to unlock this descent');
    }
  }
  assert.equal(ENEMY_KINDS.foggery, FOGGERY);
  assert.deepEqual(STAGE_PROFILES.foggery, [FOGGERY, FOGGERY_BALL, FOGGERY_BALL]);
  // his minions: plain Fire-faces and Fire-cats, weaker, minions; the cats wade through lava
  assert.equal(FOG_FACE.label, FIREFACE.label); assert.equal(FOG_CAT.label, FIRECAT.label);
  assert.ok(FOG_FACE.minion && FOG_CAT.minion && FOG_CAT.lavaproof && FOGGERY.lavaproof && !FOG_FACE.lavaproof);
  assert.ok(FOG_FACE.hp < FIREFACE.hp && FOG_CAT.hp < FIRECAT.hp);
});

test('his doorway is in the middle of its face, high up, and you come in onto the bridge over the lava', () => {
  for (const seed of [0, 1, 2, 5, 9]) {
    const { w, map } = fifthDescent(seed), door = map.portals[0], well = map.portals[1];
    assert.equal(door.y, BOSS_ARENAS.foggery.door * LH);
    assert.equal(w.cube(w.layout(4).down).map, map);
    // the face's portal in the middle (cubegen/portals.js: the pad's middle cell)
    assert.ok([door.x, door.z].includes(BOSS_ARENAS.foggery.centre));
    // past the doorway the bridge, over the lava at rest; he stands on it
    const g = map.guardian;
    assert.equal(g.floor.tower, 'bridge');
    assert.ok(g.floor.top * LH > tideLevel(map.tide, LAVA.rest) * LH + 2, 'the bridge well over the lava');
    // the well lies on the caldera's floor, under the lava until he is beaten
    assert.equal(well.kind, 'down'); assert.equal(well.y, TOWER.ground * LH);
    assert.ok(tideLevel(map.tide, LAVA.rest) > TOWER.ground && tideLevel(map.tide, LAVA.gone) < TOWER.ground);
  }
});

test('the lava: under the top in phases 1 and 2, over it in phase 3, under the platforms always', () => {
  const L = TOWER.lava;
  assert.ok(L.rest > TOWER.ground && L.high < TOWER.top && L.flood > TOWER.top && L.flood < PLATFORMS.top);
  assert.ok((PLATFORMS.top - L.flood) * LH > 0.1, 'the platforms stand out of it');
  // the platforms are reached from the top with a jump (a jump rises JUMP_V² / 2g)
  assert.ok((PLATFORMS.top - TOWER.top) * LH < JUMP_V * JUMP_V / (2 * GRAV) - 0.2);
  const w = newLava();
  moveLava(w, LAVA.high, 60);
  stepLava(w, 30); assert.ok(Math.abs(w.k - 0.5) < 1e-9);
  stepLava(w, 40); assert.equal(w.k, 1);
  moveLava(w, LAVA.flood, 6); stepLava(w, 6); assert.equal(w.k, LAVA.flood);
});

test('the ramp winds up round the tower, with room to walk under each turn, and leads from the bridge to the top and down to the well', () => {
  for (const seed of [0, 1, 2, 3, 4, 7, 11]) {
    const { map } = fifthDescent(seed), t = map.tower;
    // stacked floors leave room for him (and his ball) to walk under
    for (const col of map.cols) for (let i = 1; i < col.length; i++) {
      const lo = col[i - 1], hi = col[i];
      assert.ok(hi.bottom - Math.max(...lo.cs) / LH >= HEAD, `${lo.x},${lo.z}: ${lo.top} under ${hi.bottom}`);
    }
    // the ramp: from the floor to the bridge to the top
    const m = rampMarks(t.door);
    assert.equal(rampHeight(0, t.door), TOWER.ground); assert.equal(rampHeight(m.jc, t.door), t.door); assert.equal(rampHeight(m.end, t.door), TOWER.top);
    const goal = map.cols[t.goal.z * 16 + t.goal.x].at(-1);
    assert.equal(goal.tower, 'top');
    for (const h of [FOGGERY.height, FOGGERY_BALL.height]) assert.ok(findPath(map.guardian.floor, goal, 200, h), `${seed}: he climbs to the top`);
    assert.ok(findPath(goal, map.portals[1].floor, 200, CHAR_H), `${seed}: the way down to the well`);
    // a slow walker up the ramp keeps ahead of the rising lava (half again as slow as walking)
    const path = findPath(map.portals[0].floor, goal, 200, CHAR_H);
    let s = 0;
    path.forEach((f, i) => {
      if (i) s += 1;
      const at = s / WALK_SPEED * 1.5, lava = tideLevel(map.tide, Math.min(1, at / FOGGERY_FIGHT.lava.rise));
      assert.ok(floorY(f, 0.5, 0.5) / LH > lava, `${seed}: overtaken at ${f.x},${f.z} (${at.toFixed(1)} s)`);
    });
    // his top: the core and the landing, all at the top's height, and some of it touches the platforms' slots
    const top = map.floors.filter(f => f.tower === 'top');
    assert.ok(top.length >= 28 && top.every(f => f.cs.every(y => y === TOWER.top * LH)));
    assert.ok(map.movers.touch.length >= PLATFORMS.near + 2);
    // nothing of the arena stands where the platforms float
    for (const s of SLOTS) for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++)
      for (const f of map.cols[(s.z + b) * 16 + s.x + a]) assert.ok(Math.max(...f.cs) < map.movers.top - map.movers.thick - 1, `${f.x},${f.z}`);
  }
});

test('the platforms slide like a sliding puzzle: into empty slots next to theirs, never overlapping, some always at the top', () => {
  const { map } = fifthDescent(1), mv = map.movers, cache = {};
  assert.equal(SLOTS.length, 20);
  assert.equal(mv.start.length, PLATFORMS.count);
  assert.ok(mv.start.filter(s => mv.touch.includes(s)).length >= PLATFORMS.near);
  let prev = null;
  for (let n = 0; n < 300; n++) {
    const { occ, moves } = puzzleAt(mv, n * PLATFORMS.every, cache);
    const held = [...occ].filter(p => p >= 0);
    assert.equal(held.length, PLATFORMS.count); assert.equal(new Set(held).size, PLATFORMS.count);
    assert.ok(mv.touch.filter(s => occ[s] >= 0).length >= PLATFORMS.near, `step ${n}`);
    assert.ok(moves.length >= 1 && moves.length <= PLATFORMS.moves);
    for (const m of moves) { assert.equal(occ[m.from], m.p); assert.equal(occ[m.to], -1); assert.ok(SLOT_NEXT[m.from].includes(m.to)); }
    assert.equal(new Set(moves.map(m => m.to)).size, moves.length);
    if (prev) for (let s = 0; s < 20; s++) assert.ok(occ[s] === prev.occ[s] || prev.moves.some(m => m.from === s || m.to === s));
    prev = { occ: Int8Array.from(occ), moves };
  }
  // every game that knows the time sees the same, whatever it asked before
  const a = platformsAt(mv, 123.4, {}), b = platformsAt(mv, 123.4, cache);
  assert.deepEqual(a, b);
  // half way through a slide: between its slots
  const t = 7 * PLATFORMS.every + PLATFORMS.move / 2, { moves } = puzzleAt(mv, t, {}), at = platformsAt(mv, t, {});
  const m = moves[0], p = at.find(o => o.p === m.p);
  assert.ok(Math.abs(p.x - (SLOTS[m.from].x + SLOTS[m.to].x) / 2) < 1e-9 && Math.abs(p.z - (SLOTS[m.from].z + SLOTS[m.to].z) / 2) < 1e-9);
  // no move that would leave the top too few
  const occ = new Int8Array(20).fill(-1), touch = [0, 1];
  occ[0] = 0; occ[1] = 1;
  for (let i = 0; i < 20; i++) assert.ok(puzzleMoves(occ, [-1, -1], touch, mulberry32(i)).every(m => touch.includes(m.to)));
  assert.equal(puzzleStart(touch, mulberry32(3)).filter(s => touch.includes(s)).length, 2);
});

test('his fight: eyes thrown one at a time, Fire-faces, then the ball, his cats, fireballs and geysers', () => {
  assert.equal(splitHp(1000, 1), 667); assert.equal(splitHp(1000, 2), 334);
  assert.equal(summonCount(1, 1), 2); assert.equal(summonCount(2, 0), 2); assert.equal(summonCount(3, 2), 0);
  // phase 1: an eye only while he has it; the summon when due
  const names = list => FOGGERY.attacks.map(a => a.name).filter(n => !list.has(n));
  assert.deepEqual(names(barred({ phase: 1, eyes: [1, 1] })), ['eyeL', 'eyeR']);
  assert.deepEqual(names(barred({ phase: 1, eyes: [0.4, 1], summonDue: true })), ['eyeR', 'summon']);
  assert.deepEqual(names(barred({ phase: 1, eyes: [0, 0.2] })), []);
  // phases 2 and 3: his cats when due and nothing else; the fireball, the volley, the geysers when due
  const ball = list => FOGGERY_BALL.attacks.map(a => a.name).filter(n => !list.has(n));
  assert.deepEqual(ball(barred({ phase: 2, catsDue: true, geyserDue: true })), ['cats']);
  assert.deepEqual(ball(barred({ phase: 2 })), ['spit']);
  assert.deepEqual(ball(barred({ phase: 3, geyserDue: true })), ['volley', 'geyser']);
  // the eyes are each thrown from their own hand; the cats are called warded, from any height
  const [eyeL, eyeR] = FOGGERY.attacks;
  assert.equal(eyeL.projectile.eye, 0); assert.equal(eyeR.projectile.eye, 1);
  assert.equal(eyeL.projectile.muzzle[0], -eyeR.projectile.muzzle[0]);
  const cats = FOGGERY_BALL.attacks.find(a => a.name === 'cats');
  assert.ok(cats.ward && cats.cast && cats.summon.kind === 'fogcat');
  assert.ok(wardedNow({ mode: 'attack', profile: FOGGERY_BALL, attack: FOGGERY_BALL.attacks.indexOf(cats) }));
  const geyser = FOGGERY_BALL.attacks.find(a => a.name === 'geyser');
  assert.ok(geyser.beam.kind === 'geyser' && geyser.beam.bolts === 3 && geyser.burn && geyser.pop > 0);
  assert.equal(FOGGERY_BALL.attacks.find(a => a.name === 'volley').projectile.volley, 3);
  assert.equal(FOGGERY_FIGHT.catsAgain, 8); assert.equal(FOGGERY_FIGHT.lava.rise, 60); assert.equal(FOGGERY_FIGHT.rescue, 0.25);
});
