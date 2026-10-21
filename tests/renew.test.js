import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { RENEW, RENEW_BOW, RENEW_FLAIL, RENEW_TWIN, REN_SPIDER, REN_FACE, SPIDER, FIREFACE, ENEMY_KINDS, STAGE_PROFILES, BOSS_PROFILES,
  attacksInReach, guardianLevel, enemyProfile } from '../src/core/enemies.js';
import { RENEW_FIGHT, PHASES, risenAt, bodyRow, bodiesAt, summonCount, barred, duskAt, newTape, record, spanAt, tapeLength, rewindTime, rewoundAt,
  echoEvents, inStrike, echoesIn } from '../src/core/renew.js';
import { ITEMS } from '../src/core/items.js';
import { SWORD } from '../src/core/combat.js';
import { guardianLockMessage, guardianId } from '../src/core/guardians.js';
import { guardianSpots } from '../src/game/enemyspawn.js';
import { population, speciesIn, kindsIn } from '../src/core/spawns.js';
import { findPath, walkable } from '../src/physics/enemynav.js';
import { CHAR_R } from '../src/core/constants.js';

const sixthDescent = seed => {
  const w = new World(seed), L = w.layout(5);
  return { w, L, map: state.map = w.cube(L.down).map };
};
const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('Renew takes the place of the descent guardian of depth 5, and only that one', () => {
  assert.equal(BOSSES[5], 'renew');
  assert.equal(bossAt(5), 'renew'); assert.equal(bossAt(5, 'side'), null);
  assert.ok(BOSS_PROFILES.includes(RENEW)); assert.equal(ENEMY_KINDS.renew, RENEW);
  for (const seed of [0, 3, 42]) {
    const w = new World(seed);
    for (let d = 0; d < 8; d++) for (const [key, g] of w.layout(d).guardians) {
      const boss = d === 5 && g.role === 'descent';
      assert.equal(g.boss === 'renew', boss, `${seed} ${d} ${key}`);
      if (!boss) continue;
      const map = w.cube(key).map;
      assert.equal(map.guardian.boss, 'renew'); assert.equal(map.guardian.bossPlaceholder, false);
      assert.equal(guardianLockMessage(map), 'Defeat Renew to unlock this descent');
    }
  }
});

test('his arena is the one his depth would have, with braziers lit round it; he stands alone and brings his minions', () => {
  assert.equal(BOSS_ARENAS.renew.type, undefined, 'no arena type of his own');
  for (const seed of [0, 1, 2, 7, 42]) {
    const { map } = sixthDescent(seed), spots = guardianSpots(map);
    assert.equal(spots.length, 1, 'no defenders');
    const [s] = spots;
    assert.equal(s.kind, RENEW); assert.equal(s.boss, 'renew'); assert.equal(s.id, guardianId(map.key));
    assert.equal(s.level, guardianLevel(5, 'descent'));
    assert.deepEqual([...population(map).keys()], ['renew']);
    // (his minions of every phase are loaded with the cube, though he only casts them later)
    assert.deepEqual(kindsIn(map).sort(), ['renew', 'renface', 'renspider']);
    assert.deepEqual(speciesIn(map).sort(), ['fireface', 'renew', 'spider']);
    const braziers = map.arenaPlacements.filter(p => p.name.startsWith('ruins_brazier'));
    assert.ok(braziers.length >= BOSS_ARENAS.renew.braziers, `${seed}: ${braziers.length} braziers`);
    const entry = map.portals.find(p => p.dir < 4);
    assert.ok(walkable(map.guardian.floor, RENEW.height));
    assert.ok(findPath(entry.floor, map.guardian.floor, 60, RENEW.height), `${seed}: he gets to the entrance`);
  }
});

test('four phases, each with a weapon of the game in his hands: a sword, a bow, a morning star, a twin morning star', () => {
  assert.equal(PHASES, 4);
  assert.deepEqual(STAGE_PROFILES.renew, [RENEW, RENEW_BOW, RENEW_FLAIL, RENEW_TWIN]);
  assert.deepEqual(STAGE_PROFILES.renew.map(p => p.weapon), RENEW_FIGHT.weapons);
  assert.deepEqual(RENEW_FIGHT.weapons.map(id => ITEMS[id].weapon.kind), ['sword', 'bow', 'flail', 'flail']);
  assert.deepEqual(RENEW_FIGHT.weapons.slice(2).map(id => ITEMS[id].weapon.balls ?? 1), [1, 2], 'first one ball, then two');
  for (const p of STAGE_PROFILES.renew) {
    assert.ok(p.figure && p.model === 'character' && p.boss === 'renew' && p.guardian, p.type);
    assert.equal(p.hp, RENEW.hp, 'each phase is a whole bar of the same health');
    assert.ok(p.height > 1 && p.height < 1.3, 'as tall as the hero');
    assert.ok(p.attacks.some(a => (a.name === 'roll' || a.name === 'leap') && a.dodge && a.weight === 0), 'he rolls (or leaps) out of the way');
    for (const a of p.attacks) assert.ok(a.hitAt < a.attackTime || a.dodge, `${p.type} ${a.name}`);
  }
  // he runs about as fast as the hero; his blows are a little slower than a player's
  assert.ok(RENEW.chase > 2 && RENEW.chase < 2.8);
  const slash = RENEW.attacks[0];
  assert.ok(slash.hitAt > SWORD.activeStart && slash.hitAt < 2.5 * SWORD.activeStart);
  // the morning star: slower, wider, further and harder than the sword; its lunge knocks you down
  const swing = RENEW_FLAIL.attacks[0];
  assert.equal(swing.clip, 'slash');
  assert.ok(swing.hitAt > slash.hitAt && swing.arc < slash.arc && swing.hitReach > slash.hitReach && swing.power > slash.power);
  assert.ok(RENEW_FLAIL.attacks.find(a => a.name === 'dash').knockDown);
  // the twin morning star strikes twice in a swing, each blow lighter, together harder
  for (const a of RENEW_TWIN.attacks.filter(a => a.name === 'slash' || a.name === 'dash')) {
    assert.ok(a.twice > a.hitAt && a.twice < a.attackTime, a.name);
    assert.ok(a.power < swing.power && 2 * a.power > swing.power && !a.knockDown, a.name);
  }
  // the sword and the flails: blows from close by (a lunge from further off)
  const at = (p, d) => attacksInReach(p, d, 0).map(i => p.attacks[i].name);
  assert.deepEqual(at(RENEW, 0.8), ['slash']); assert.deepEqual(at(RENEW, 2), ['dash']);
  assert.deepEqual(at(RENEW_TWIN, 1), ['slash']); assert.deepEqual(at(RENEW_TWIN, 2.2), ['dash']);
  // strong as a descent boss over the three bars, though each is less
  const level = guardianLevel(5, 'descent'), bar = enemyProfile(RENEW, level).hp, tier = enemyProfile({ ...RENEW, hp: 1000 }, level).hp;
  assert.ok(bar < tier && PHASES * bar > tier && PHASES * bar < 3 * tier);
});

test('with the bow he keeps his distance: running backwards, leaping back', () => {
  const p = RENEW_BOW;
  assert.equal(p.style, 'ranged'); assert.ok(p.backpedal >= 1 && p.keep[0] >= 3, p.type);
  const leap = p.attacks.find(a => a.name === 'leap');
  assert.ok(leap.dodge.back && leap.dodge.dist > 2 && leap.dodge.hop > 0.5 && leap.dodge.to < leap.attackTime);
  assert.ok(barred({ stage: 2 }).has('leap'), 'only ever as a dodge');
  for (const q of [RENEW, RENEW_FLAIL, RENEW_TWIN]) assert.notEqual(q.style, 'ranged', q.type);
  // the bow: arrows (the game's arrow), now and then three at once, a little slower to draw than a player's
  const at = (p, d) => attacksInReach(p, d, 0).map(i => p.attacks[i].name);
  assert.deepEqual(at(RENEW_BOW, 6).filter(n => n !== 'summon').sort(), ['arrows', 'shoot']);
  const shot = RENEW_BOW.attacks[0];
  assert.equal(shot.clip, 'shoot'); assert.equal(shot.projectile.kind, 'arrow');
  assert.ok(shot.hitAt > 0.36 && shot.projectile.speed < 16, 'slower than a player\'s bow, to be dodged');
  assert.equal(RENEW_BOW.attacks.find(a => a.name === 'arrows').projectile.volley, 3);
});

test('beaten, he always drops a flail', () => {
  assert.equal(RENEW.ownWeapon, 'flail');
  for (const p of STAGE_PROFILES.renew) assert.equal(p.ownWeapon, 'flail', p.type);
});

test('beaten, he rises away into the sky; the echoes fight on a while', () => {
  assert.equal(risenAt(0), 0); assert.equal(risenAt(RENEW_FIGHT.ascend.time), 1); near(risenAt(RENEW_FIGHT.ascend.time / 2), 0.5);
  assert.ok(RENEW_FIGHT.ascend.height > 4 && RENEW_FIGHT.outro > 1);
  assert.ok(RENEW_FIGHT.outro + RENEW_FIGHT.echo.fade < RENEW.corpseTime, 'faded before he is let go');
});

test('his minions: spiders in phase 2, Fire-faces in phase 3, cast out of the sky', () => {
  assert.equal(RENEW.attacks.some(a => a.summon), false);
  assert.equal(RENEW_BOW.attacks.find(a => a.summon).summon.kind, 'renspider');
  assert.equal(RENEW_FLAIL.attacks.find(a => a.summon).summon.kind, 'renface');
  assert.equal(RENEW_TWIN.attacks.some(a => a.summon), false);
  for (const [k, base] of [[REN_SPIDER, SPIDER], [REN_FACE, FIREFACE]]) {
    assert.ok(k.minion && k.plain && k.species === base.species && k.label === base.label && k.hp < base.hp, k.type);
    assert.equal(ENEMY_KINDS[k.type], k);
  }
  assert.equal(summonCount(1, 0), 0);
  assert.equal(summonCount(2, 1), RENEW_FIGHT.minions[1] - 1);
  assert.equal(summonCount(3, 9), 0); assert.equal(summonCount(4, 0), 0, 'no minions with the twin morning star');
  assert.ok(barred({ stage: 1 }).has('roll') && barred({ stage: 2, summonDue: true }).has('roll'));
  assert.ok(barred({ stage: 2 }).has('summon') && !barred({ stage: 2, summonDue: true }).has('summon'));
  assert.ok(!barred({ stage: 2, summonDue: true }).has('slash'));
  assert.ok(RENEW_FIGHT.drop.height > 3);
});

test('the fight falls from day into night, a quarter a phase, never lighter', () => {
  assert.equal(duskAt(1, 0), 0); assert.equal(duskAt(PHASES, 1), 1);
  near(duskAt(2, 0), 1 / PHASES); near(duskAt(1, 1), duskAt(2, 0));
  let last = -1;
  for (let stage = 1; stage <= PHASES; stage++) for (let s = 0; s <= 1; s += 0.1) { const d = duskAt(stage, s); assert.ok(d >= last); last = d; }
});

test('a tape plays back at any time between its frames', () => {
  const tape = newTape();
  assert.equal(spanAt(tape, 1), null);
  for (let i = 0; i <= 10; i++) assert.ok(record(tape, i * 0.5, { x: i }));
  assert.equal(record(tape, 5, { x: 99 }), false, 'never back in time');
  assert.equal(tapeLength(tape), 5);
  const s = spanAt(tape, 1.25);
  assert.equal(s.a.x, 2); assert.equal(s.b.x, 3); near(s.k, 0.5);
  assert.equal(spanAt(tape, -1).a.x, 0); assert.equal(spanAt(tape, 9).a.x, 10);
  // a rewind: slow at first, all the way back at the end, within its time
  near(rewoundAt(60, 0), 60); near(rewoundAt(60, 1), 0); near(rewoundAt(60, 0.5), 30);
  assert.ok(60 - rewoundAt(60, 0.05) < 60 * 0.05);
  assert.equal(rewindTime(0), RENEW_FIGHT.rewind.min); assert.equal(rewindTime(1e4), RENEW_FIGHT.rewind.max);
  near(rewindTime(60), 60 / RENEW_FIGHT.rewind.speed);
  assert.equal(echoesIn(1), 0); assert.equal(echoesIn(4), 3);
});

test('the bodies of the fight on a tape: where each was, what it did, and those not yet there (the ghosts)', () => {
  const tape = newTape(), boss = { x: 0, y: 1, z: 0, yaw: 0, hp: 100, mode: 'chase', attack: 0, t: 0, attacks: 3, speed: 2, deadT: 0, profile: RENEW };
  const spider = { x: 5, y: 1, z: 5, yaw: 1, hp: 30, mode: 'attack', attack: 0, t: 0.2, attacks: 1, speed: 0, deadT: 0, profile: REN_SPIDER };
  record(tape, 0, { bodies: [bodyRow(boss)] });
  Object.assign(boss, { x: 1, hp: 90, mode: 'attack', attacks: 4, t: 0.1 });
  record(tape, 1, { bodies: [bodyRow(boss), bodyRow(spider)] });
  const at = bodiesAt(tape, 0.25), b = at.get(boss);
  near(b.x, 0.25); near(b.hp, 98, 0.5); assert.equal(b.mode, 'chase'); assert.equal(b.profile, RENEW);
  assert.ok(!at.has(spider), 'not cast yet');
  const later = bodiesAt(tape, 1);
  assert.equal(later.get(boss).mode, 'attack'); assert.equal(later.get(spider).t, 0.2);
});

test('the echo strikes the blows and lets go the shots the hero did, where and when they did', () => {
  const tape = newTape(), sword = { ranged: false, kind: 'sword', range: 0.85, arc: Math.PI * 0.42, a0: 0.16, a1: 0.27 };
  // a swing (serial 1) over a few frames, nothing, a shot (serial 2), another swing that is cut short before its blade went through
  const frames = [null, { n: 1, t: 0.05, yaw: 0, fired: false, ...sword }, { n: 1, t: 0.2, yaw: 0, fired: false, ...sword },
    { n: 1, t: 0.25, yaw: 0, fired: false, ...sword }, null,
    { n: 2, t: 0.1, yaw: 1, fired: false, ranged: true, kind: 'staff' }, { n: 2, t: 0.35, yaw: 1, fired: true, ranged: true, kind: 'staff', color: '#7fb4ff' },
    { n: 2, t: 0.4, yaw: 1, fired: true, ranged: true, kind: 'staff' }, { n: 3, t: 0.1, yaw: 0, fired: false, ...sword }];
  frames.forEach((sw, i) => record(tape, i * 0.05, { x: 4 + i * 0.1, y: 1, z: 4, sw }));
  const { strikes, shots } = echoEvents(tape);
  assert.equal(strikes.length, 1); near(strikes[0].t, 0.1); near(strikes[0].x, 4.2);
  assert.equal(shots.length, 1); near(shots[0].t, 0.3); assert.equal(shots[0].yaw, 1); assert.equal(shots[0].color, '#7fb4ff');
  // in the blade's arc in front of it (+z), at the height of the body: hit; behind it, too far, or a floor up: not
  const s = strikes[0];
  assert.ok(inStrike(s, { x: s.x, y: 1, z: s.z + 0.7, r: CHAR_R }));
  assert.ok(!inStrike(s, { x: s.x, y: 1, z: s.z - 0.7, r: CHAR_R }));
  assert.ok(!inStrike(s, { x: s.x, y: 1, z: s.z + 1.3, r: CHAR_R }));
  assert.ok(!inStrike(s, { x: s.x, y: 2.5, z: s.z + 0.5, r: CHAR_R }));
  // a flail of two balls: each strikes, in its half of the active window
  const twin = newTape(), flail = { ranged: false, kind: 'flail', range: 1, arc: 2, a0: 0.2, a1: 0.4, balls: 2 };
  [0.1, 0.22, 0.26, 0.32, 0.38].forEach((t, i) => record(twin, i * 0.05, { x: 0, y: 1, z: 0, sw: { n: 1, t, yaw: 0, fired: false, ...flail } }));
  assert.deepEqual(echoEvents(twin).strikes.map(x => Math.round(x.t * 100)), [5, 15]);
});
