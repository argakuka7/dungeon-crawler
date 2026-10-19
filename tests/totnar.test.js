import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { TOTNAR, SNAP_SKULL, TOT_SPIDER, TOT_STUNDER, SPIDER, STUNDER, ENEMY_KINDS, GUARDIAN_TIERS, MINION_PROFILES,
  makeEnemy, guardianLevel, attackOf, attacksInReach, blowOf, steadyNow, fireAt, shotOf } from '../src/core/enemies.js';
import { TOTNAR_FIGHT, stageFloor, summonCount, spell, barred } from '../src/core/totnar.js';
import { damageEnemy } from '../src/core/combat.js';
import { awardKill, createRun, createPlayerStats } from '../src/core/progression.js';
import { guardianId, gateLocked, guardianTitle, guardianLockMessage } from '../src/core/guardians.js';
import { weaponDrops } from '../src/core/gear/drops.js';
import { population, speciesIn, kindsIn } from '../src/core/spawns.js';
import { guardianSpots } from '../src/game/enemyspawn.js';
import { launch } from '../src/core/projectiles.js';
import { startBeam, originOf, aimPoint, boltOffsets } from '../src/core/beams.js';
import { parseColor } from '../src/core/oklch.js';

const secondDescent = seed => {
  const w = new World(seed), L = w.layout(1);
  return { w, L, map: state.map = w.cube(L.down).map };
};
const named = name => TOTNAR.attacks.find(a => a.name === name);
const indexOf = name => TOTNAR.attacks.findIndex(a => a.name === name);

test('Totnar takes the place of the descent guardian of depth 1, and only that one', () => {
  assert.equal(BOSSES[1], 'totnar');
  assert.equal(bossAt(1), 'totnar'); assert.equal(bossAt(1, 'side'), null);
  for (const seed of [0, 1, 7, 42]) {
    const w = new World(seed);
    for (let d = 0; d < 20; d++) for (const [key, g] of w.layout(d).guardians) {
      const boss = d === 1 && g.role === 'descent';
      assert.equal(g.boss === 'totnar', boss, `${seed} ${d} ${key}`);
      if (!boss) continue;
      const map = w.cube(key).map;
      assert.equal(map.guardian.boss, 'totnar'); assert.equal(map.guardian.bossPlaceholder, false);
      assert.equal(guardianLockMessage(map), 'Defeat Totnar to unlock this descent');
    }
  }
});

test('his arena holds him alone, with braziers lit round it, and loads his minions', () => {
  for (const seed of [0, 1, 2, 7, 42]) {
    const { map } = secondDescent(seed), spots = guardianSpots(map);
    assert.equal(spots.length, 1, 'no defenders: he brings his own');
    const [s] = spots;
    assert.equal(s.kind, TOTNAR); assert.equal(s.boss, 'totnar');
    assert.equal(s.id, guardianId(map.key)); assert.equal(s.guardianGate, map.key);
    assert.equal(s.level, guardianLevel(1, 'descent'));
    assert.equal(s.f, map.guardian.floor);
    assert.deepEqual(speciesIn(map).sort(), ['snapskull', 'spider', 'stunder', 'totnar']);
    assert.deepEqual(kindsIn(map).sort(), ['snapskull', 'totnar', 'totspider', 'totstunder']);
    assert.deepEqual([...population(map).keys()], ['totnar']);
    assert.ok(gateLocked(map, createRun()));
    const braziers = map.arenaPlacements.filter(p => p.name.startsWith('ruins_brazier'));
    assert.ok(braziers.length >= BOSS_ARENAS.totnar.braziers, `${seed}: ${braziers.length} braziers`);
  }
});

test('he is as strong as a descent guardian; his attacks are telegraphed', () => {
  const t = GUARDIAN_TIERS.descent;
  assert.ok(TOTNAR.hp >= t.hp); assert.equal(TOTNAR.xp, t.xp); assert.ok(TOTNAR.poise >= t.poise);
  assert.equal(ENEMY_KINDS.totnar, TOTNAR); assert.equal(guardianTitle('descent', TOTNAR.label), '♛ Totnar');
  assert.deepEqual(TOTNAR.attacks.map(a => a.name), ['throw', 'gloom', 'spiders', 'roll', 'storm', 'stunders']);
  for (const a of TOTNAR.attacks) assert.ok(fireAt(a) >= 0.35 && a.attackTime > a.hitAt, a.name);
  const roll = named('roll');
  assert.ok(roll.roll.from >= 0.6, 'he spins up before he rolls');
  assert.ok(roll.roll.to > roll.roll.from && roll.attackTime > roll.roll.to + 0.5, 'and sits dizzy after');
  assert.ok(blowOf(TOTNAR, roll).knockDown && roll.roll.speed > 5);
  assert.ok(!blowOf(TOTNAR, named('throw')).knockDown);
  // the gloom is cast from anywhere, at any height; the roll needs a run-up
  assert.ok(attacksInReach(TOTNAR, 25, 5).includes(indexOf('gloom')));
  assert.ok(!attacksInReach(TOTNAR, 1, 0).includes(indexOf('roll')));
  assert.ok(attacksInReach(TOTNAR, 4, 0).includes(indexOf('roll')));
});

test('three stages: a skull (and a shell of sticks) lost at two thirds and at a third of his health', () => {
  assert.deepEqual(TOTNAR_FIGHT.stages, [2 / 3, 1 / 3]);
  assert.equal(stageFloor(1340, 1), 894); assert.equal(stageFloor(1340, 2), 447); assert.equal(stageFloor(1340, 3), 0);
  assert.deepEqual(TOTNAR.shed, { 2: ['skull2', 'shell0'], 3: ['skull0', 'shell1'] });
  const e = makeEnemy({ id: 't', level: 3, f: null, x: 0, y: 0, z: 0, yaw: 0 }, TOTNAR);
  e.hpFloor = stageFloor(e.profile.hp, 1);
  damageEnemy(e, e.profile.hp * 10);
  assert.equal(e.hp, e.hpFloor); assert.notEqual(e.mode, 'dead');
  e.shield = 1; assert.equal(damageEnemy(e, 50), false, 'nothing hurts him while a skull bursts off');
});

test('what he may start in each stage; the gloom when it is due, and nothing else then', () => {
  const may = (stage, gloom = false, summon = true) => {
    const no = barred(stage, gloom, summon);
    return TOTNAR.attacks.map(a => a.name).filter(n => !no.has(n));
  };
  assert.deepEqual(may(1), ['throw']);
  assert.deepEqual(may(2), ['throw', 'spiders', 'roll']);
  assert.deepEqual(may(2, false, false), ['throw', 'roll']);
  assert.deepEqual(may(3), ['storm', 'stunders']);
  for (const s of [1, 2, 3]) assert.deepEqual(may(s, true), ['gloom']);
  assert.equal(summonCount('spiders', 0), TOTNAR_FIGHT.minions.spiders); assert.equal(summonCount('spiders', 9), TOTNAR_FIGHT.minions.spiders - 9);
  assert.equal(summonCount('stunders', 2), 0);
  assert.ok(TOTNAR_FIGHT.minions.spiders >= 10, 'a very large number of spiders');
  // the dark lasts longer than the light, both a while
  assert.equal(spell(true, 0), TOTNAR_FIGHT.dark[0]); assert.equal(spell(false, 1), TOTNAR_FIGHT.light[1]);
  assert.ok(TOTNAR_FIGHT.dark[0] > TOTNAR_FIGHT.light[0] && TOTNAR_FIGHT.shedLight >= 4);
});

test('a roll cannot be stopped by a blow, its wind-up can', () => {
  const e = makeEnemy({ id: 't', level: 3, f: null, x: 0, y: 0, z: 0, yaw: 0 }, TOTNAR), roll = named('roll');
  Object.assign(e, { mode: 'attack', attack: indexOf('roll'), t: roll.roll.from + 0.3, poised: 0 });
  assert.ok(steadyNow(e));
  damageEnemy(e, 10);
  assert.equal(e.mode, 'attack'); assert.ok(!e.staggered);
  Object.assign(e, { mode: 'attack', attack: indexOf('roll'), t: 0.2, poised: 0 });
  assert.ok(!steadyNow(e));
  damageEnemy(e, 10);
  assert.equal(e.mode, 'chase', 'staggered out of the wind-up'); assert.ok(e.staggered);
});

test('a thrown skull pushes back and comes to life; from his right hand it still crosses his aim', () => {
  const a = named('throw'), p = a.projectile;
  assert.equal(p.becomes, 'snapskull'); assert.equal(ENEMY_KINDS[p.becomes], SNAP_SKULL);
  const blow = blowOf(TOTNAR, a);
  assert.deepEqual(blow.push, { speed: p.push, time: p.pushTime });
  assert.ok(p.push * p.pushTime / 2 >= 1.5, 'a real push');
  const e = { x: 5, y: 0, z: 5, yaw: 0 }, pr = launch(e, p, { x: 5, y: 1, z: 11 });
  const t = (11 - pr.z) / pr.vz, x = pr.x + pr.vx * t;
  assert.ok(Math.abs(p.muzzle[0]) > 0.3 && Math.abs(x - 5) < 0.05, `crosses at ${x.toFixed(2)}`);
});

test('the storm: bolts out of the sky, one at the player and the others round them', () => {
  const a = named('storm'), spec = shotOf(a);
  assert.equal(spec.kind, 'bolt'); assert.ok(spec.sky >= 5 && spec.bolts === 3 && spec.shock > 0);
  const e = { x: 3, y: 1, z: 3, yaw: 0 }, aim = aimPoint({ x: 6, y: 1, z: 6, h: 0.85 }, spec);
  assert.deepEqual(originOf(e, spec, aim), { x: 6, y: aim.y + spec.sky, z: 6 });
  const b = startBeam(e, spec, aim);
  assert.equal(b.x, 6); assert.equal(b.y, aim.y + spec.sky);
  const offs = boltOffsets(spec, () => 0.5);
  assert.equal(offs.length, 2);
  for (const o of offs) { const d = Math.hypot(o.x, o.z); assert.ok(d >= spec.spread[0] - 1e-9 && d <= spec.spread[1] + 1e-9); }
  assert.ok(Math.hypot(offs[0].x - offs[1].x, offs[0].z - offs[1].z) > 2 * spec.radius, 'apart');
  const beside = aimPoint({ x: 6, y: 1, z: 6, h: 0.85 }, spec, offs[0]);
  assert.ok(Math.abs(beside.x - 6 - offs[0].x) < 1e-9 && beside.y === aim.y);
});

test('his minions: small, quick, weak, pay little once, never weapons', () => {
  assert.deepEqual(MINION_PROFILES, [SNAP_SKULL]);
  assert.equal(TOT_SPIDER.species, 'spider'); assert.equal(TOT_SPIDER.size, 0.55);
  assert.ok(TOT_SPIDER.hp < SPIDER.hp / 2 && TOT_SPIDER.chase > SPIDER.chase);
  assert.equal(TOT_STUNDER.species, 'stunder'); assert.ok(TOT_STUNDER.size < 0.8 && TOT_STUNDER.hp < STUNDER.hp);
  assert.equal(blowOf(TOT_STUNDER).knockDown, false);
  assert.ok(SNAP_SKULL.lifetime > 0 && SNAP_SKULL.hp < 30);
  for (const k of [SNAP_SKULL, TOT_SPIDER, TOT_STUNDER]) {
    assert.ok(k.minion && k.xp > 0 && k.xp < TOTNAR.xp / 30, k.type);
    assert.deepEqual(k.coins, [0, 0]);
    assert.deepEqual(weaponDrops({ id: `t:minion:${k.type}`, level: 3, kind: k }, 7), []);
    const m = makeEnemy({ id: `t:minion:${k.type}`, level: 3, summoned: true, kind: k, coinDrop: 0, f: null, x: 0, y: 0, z: 0, yaw: 0 }, k);
    const run = createRun(), hero = createPlayerStats();
    damageEnemy(m, m.hp);
    assert.ok(awardKill(hero, run, m)?.xp > 0); assert.equal(awardKill(hero, run, m), null);
  }
  const eyes = parseColor(TOT_SPIDER.colors.eyes);
  assert.ok(eyes.h > 20 && eyes.h < 50, 'ember eyes like his');
});

test('he and his minions have voices, and every part they recolour exists', async () => {
  const { voices, VOICE_KINDS } = await import('../src/audio/voices.js');
  const v = voices({ amp() {}, noise() {}, filter() {}, tone() {}, sweep() {} });
  for (const s of ['totnar', 'snapskull']) for (const k of VOICE_KINDS) assert.equal(typeof v[`${s}_${k}`], 'function');
  assert.equal(attackOf({ mode: 'attack', attack: indexOf('storm'), profile: TOTNAR }).name, 'storm');
});
