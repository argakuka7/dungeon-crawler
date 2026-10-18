import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt } from '../src/core/bosses.js';
import { GUSTO, GUSTO_SPLIT, CUSTO_TRIANGLE, TRIANGLE, ENEMY_KINDS, GUARDIAN_TIERS, makeEnemy, enemyProfile, guardianLevel,
  attackOf, attacksInReach, blowOf, absent } from '../src/core/enemies.js';
import { GUSTO_FIGHT, splitHp, summonCount, gripAt } from '../src/core/gusto.js';
import { damageEnemy } from '../src/core/combat.js';
import { awardKill, createRun, createPlayerStats } from '../src/core/progression.js';
import { guardianId, gateLocked, guardianTitle, guardianLockMessage } from '../src/core/guardians.js';
import { weaponDrops, potionDrops } from '../src/core/gear/drops.js';
import { population, speciesIn } from '../src/core/spawns.js';
import { guardianSpots, enemySpots } from '../src/game/enemyspawn.js';
import { inGust } from '../src/core/gusts.js';
import { parseColor } from '../src/core/oklch.js';

const firstDescent = seed => {
  const w = new World(seed), L = w.layout(0);
  return { w, L, map: state.map = w.cube(L.down).map };
};

test('Gusto takes the place of the first descent guardian, and only that one', () => {
  assert.deepEqual(BOSSES, { 0: 'gusto' });
  assert.equal(bossAt(0), 'gusto'); assert.equal(bossAt(0, 'side'), null); assert.equal(bossAt(1), null);
  for (const seed of [0, 1, 7, 42, 123]) {
    const w = new World(seed);
    for (let d = 0; d < 20; d++) for (const [key, g] of w.layout(d).guardians) {
      const boss = d === 0 && g.role === 'descent';
      assert.equal(g.boss ?? null, boss ? 'gusto' : null, `${seed} ${d} ${key}`);
      if (!boss) continue;
      const map = w.cube(key).map;
      assert.equal(map.guardian.boss, 'gusto'); assert.equal(map.guardian.bossPlaceholder, false);
      assert.equal(guardianLockMessage(map), 'Defeat Gusto to unlock this descent');
    }
  }
});

test('his arena holds him alone, on the guardian spot, with the gate and the guardian id', () => {
  for (const seed of [0, 1, 2, 7, 42, 123]) {
    const { map } = firstDescent(seed), spots = guardianSpots(map);
    assert.equal(spots.length, 1, 'no defenders: he brings his own');
    const [s] = spots;
    assert.equal(s.kind, GUSTO); assert.equal(s.boss, 'gusto');
    assert.equal(s.id, guardianId(map.key)); assert.equal(s.guardianGate, map.key);
    assert.equal(s.guardian, true); assert.equal(s.guardianRole, 'descent'); assert.equal(s.bossPlaceholder, false);
    assert.equal(s.level, guardianLevel(0, 'descent'));
    assert.equal(s.f, map.guardian.floor);
    assert.deepEqual(enemySpots(map, GUSTO).map(x => x.id), [s.id]);
    assert.deepEqual(enemySpots(map, TRIANGLE), []);
    // his model and his triangles' are loaded before the arena is entered
    assert.deepEqual(speciesIn(map).sort(), ['gusto', 'triangle']);
    assert.deepEqual([...population(map).keys()], ['gusto']);
    assert.ok(gateLocked(map, createRun()));
  }
});

test('he is as strong as a descent guardian, and his attacks are telegraphed', () => {
  const t = GUARDIAN_TIERS.descent;
  assert.ok(GUSTO.hp >= t.hp); assert.equal(GUSTO.xp, t.xp); assert.ok(GUSTO.poise >= t.poise);
  assert.equal(ENEMY_KINDS.gusto, GUSTO); assert.equal(ENEMY_KINDS.custotriangle, CUSTO_TRIANGLE);
  assert.equal(GUSTO.guardianRole, 'descent'); assert.equal(guardianTitle('descent', GUSTO.label), '♛ Gusto');
  assert.deepEqual(GUSTO.attacks.map(a => a.name), ['grab', 'summon']);
  assert.deepEqual(GUSTO_SPLIT.attacks.map(a => a.name).sort(), ['grab', 'summon', 'vortex']);
  assert.equal(GUSTO_SPLIT.hp, GUSTO.hp);
  const grab = GUSTO.attacks[0], vortex = GUSTO_SPLIT.attacks.find(a => a.gust);
  // a wind-up to dodge, the catch, then the throw
  assert.ok(grab.hitAt >= 0.6 && grab.grab.throwAt > grab.hitAt + 0.5 && grab.attackTime > grab.grab.throwAt);
  assert.ok(blowOf(GUSTO, grab).knockDown);
  assert.equal(vortex.gust.kind, 'vortex'); assert.ok(vortex.hitAt >= 0.9, 'he breathes in first');
  assert.ok(vortex.gust.push * vortex.gust.pushTime / 2 >= 3, 'a powerful push');
  assert.ok(!blowOf(GUSTO_SPLIT, vortex).knockDown);
  // up close he grabs; further off he can only summon (or, split, blow)
  assert.deepEqual(attacksInReach(GUSTO, 1, 0), [0, 1]);
  assert.deepEqual(attacksInReach(GUSTO, 3, 0), [1]);
  assert.ok(attacksInReach(GUSTO_SPLIT, 3, 0).includes(GUSTO_SPLIT.attacks.indexOf(vortex)));
});

test('his grip carries the caught player up in front of him and down again', () => {
  const g = GUSTO.attacks[0].grab, hit = GUSTO.attacks[0].hitAt;
  assert.deepEqual(gripAt(g, hit, hit), g.grip[0]);
  assert.deepEqual(gripAt(g, hit, hit - 1), g.grip[0]);
  assert.deepEqual(gripAt(g, hit, 99), g.grip.at(-1));
  const mid = gripAt(g, hit, hit + g.step / 2);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(mid[i] - (g.grip[0][i] + g.grip[1][i]) / 2) < 1e-9);
  assert.ok(Math.abs(hit + g.step * (g.grip.length - 1) - g.throwAt) < 1e-9, 'the path ends at the throw');
  const top = Math.max(...g.grip.map(p => p[1]));
  assert.ok(top - g.hold > 1.2, 'lifted high'); assert.ok(g.grip.every(p => p[2] > GUSTO.radius), 'in front of him');
});

test('Custo triangles: half a Triangle, light blue, faster, weaker, and no knock-downs', () => {
  const k = CUSTO_TRIANGLE;
  assert.equal(k.species, 'triangle'); assert.ok(k.minion);
  assert.equal(k.size, 0.5); assert.ok(Math.abs(k.height - TRIANGLE.height / 2) < 1e-9);
  assert.ok(k.chase > TRIANGLE.chase * 1.5 && k.projectile.speed > TRIANGLE.projectile.speed);
  assert.ok(k.hp < TRIANGLE.hp / 3 && k.damage < TRIANGLE.damage / 2);
  assert.equal(blowOf(k).knockDown, false);
  const glow = parseColor(k.colors.glow);
  assert.ok(glow.h > 200 && glow.h < 250 && glow.l > 0.75, 'light blue');
  assert.ok(k.xp > 0 && k.xp < GUSTO.xp / 30, 'a bit of XP: his is the reward');
  assert.deepEqual(k.coins, [0, 0]);
  // no weapons; now and then a minor health potion
  let potions = 0;
  for (let i = 0; i < 2000; i++) {
    const e = { id: `gusto:minion:${i}`, level: 1, kind: k };
    assert.deepEqual(weaponDrops(e, 7), []);
    for (const p of potionDrops(e, 7)) { assert.equal(p.itemId, 'item_potion_health_minor'); potions++; }
  }
  assert.ok(potions > 60 && potions < 300, `rarely (${potions} in 2000)`);
});

test('phase 1: no blow takes him below half his health; split, nothing hurts him', () => {
  const e = makeEnemy({ id: 'g', level: 3, f: null, x: 0, y: 0, z: 0, yaw: 0 }, GUSTO);
  e.hpFloor = splitHp(e.profile.hp);
  assert.equal(e.hpFloor, Math.ceil(e.profile.hp / 2));
  damageEnemy(e, e.profile.hp * 10);
  assert.equal(e.hp, e.hpFloor); assert.notEqual(e.mode, 'dead');
  damageEnemy(e, 50); assert.equal(e.hp, e.hpFloor);
  e.hpFloor = 0; e.shield = 1;
  assert.equal(damageEnemy(e, 50), false); assert.equal(e.hp, Math.ceil(e.profile.hp / 2));
  e.shield = 0; e.mode = 'gone';
  assert.ok(absent(e)); assert.equal(damageEnemy(e, 50), false);
  e.mode = 'chase';
  assert.ok(damageEnemy(e, 50)); assert.equal(e.hp, Math.ceil(e.profile.hp / 2) - 50);
  damageEnemy(e, e.hp); assert.equal(e.mode, 'dead');
});

test('a proxy goes at the first touch, pays nothing; his minions pay once and are not remembered', () => {
  const run = createRun(), hero = createPlayerStats();
  const p = makeEnemy({ id: 'g:proxy:1', level: 1, proxy: true, noReward: true, guardian: true, f: null, x: 0, y: 0, z: 0, yaw: 0 }, GUSTO_SPLIT);
  p.hp = 700;
  assert.ok(damageEnemy(p, 1, false)); assert.equal(p.hp, 0); assert.equal(p.mode, 'dead');
  assert.equal(awardKill(hero, run, p), null); assert.equal(hero.xp, 0); assert.ok(!run.defeated.has(p.id));
  const m = makeEnemy({ id: 'g:minion:1', level: 1, summoned: true, kind: CUSTO_TRIANGLE, coinDrop: 0, f: null, x: 0, y: 0, z: 0, yaw: 0 }, CUSTO_TRIANGLE);
  damageEnemy(m, m.hp);
  const reward = awardKill(hero, run, m);
  assert.ok(reward && reward.xp > 0 && reward.coins === 0);
  assert.equal(awardKill(hero, run, m), null, 'once');
  assert.ok(!run.defeated.has(m.id));
});

test('the fight rules: summons fill up to three, then two; the vortex catches what is ahead', () => {
  assert.deepEqual(GUSTO_FIGHT.minions, [3, 2]);
  assert.equal(summonCount(1, 0), 3); assert.equal(summonCount(1, 2), 1); assert.equal(summonCount(1, 5), 0);
  assert.equal(summonCount(2, 0), 2); assert.equal(summonCount(2, 2), 0);
  assert.equal(GUSTO_FIGHT.proxies, 2); assert.ok(GUSTO_FIGHT.window >= 0.8 && GUSTO_FIGHT.window <= 1.5);
  const e = makeEnemy({ id: 'g', level: 1, f: null, x: 8, y: 0, z: 8, yaw: 0 }, GUSTO_SPLIT);
  e.attack = GUSTO_SPLIT.attacks.findIndex(a => a.gust); e.mode = 'attack';
  const g = attackOf(e).gust, body = (x, z) => ({ x, y: 0, z, r: 0.22, h: 0.85 });
  assert.ok(inGust(e, g, body(8, 11))); assert.ok(!inGust(e, g, body(8, 5))); assert.ok(!inGust(e, g, body(11, 9)));
  assert.equal(enemyProfile(GUSTO_SPLIT, 4).hp, enemyProfile(GUSTO, 4).hp);
});
