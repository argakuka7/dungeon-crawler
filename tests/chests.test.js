import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHESTS, chestLoot } from '../src/core/chests.js';
import { PRESTIGE } from '../src/world/sites.js';
import { makeLayouts } from '../src/world/layout.js';
import { RARITY } from '../src/core/gear/rarities.js';
import { depthLevel, coinRange, SPIDER } from '../src/core/enemies.js';
import { itemStats } from '../src/core/gear/stats.js';
import { ITEMS } from '../src/core/items.js';

const site = (prestige, i = 0) => ({ id: `7:0,-3,1:site:${i}`, prestige });
const weapons = loot => loot.items.filter(i => i.gen);
const potions = loot => loot.items.filter(i => ITEMS[i.itemId].category === 'potion').reduce((n, i) => n + i.count, 0);
const crystals = loot => loot.items.filter(i => ITEMS[i.itemId].crystal).reduce((n, i) => n + i.count, 0);

test('every site prestige has a chest, and a chest always holds the same', () => {
  assert.deepEqual(Object.keys(CHESTS), PRESTIGE);
  for (const p of PRESTIGE) {
    assert.deepEqual(chestLoot(site(p), 5, 3), chestLoot(site(p), 5, 3));
    assert.notDeepEqual(chestLoot(site(p), 5, 3), chestLoot(site(p), 5, 4), 'another world, another chest');
    assert.deepEqual(JSON.parse(JSON.stringify(chestLoot(site(p), 5, 3))), chestLoot(site(p), 5, 3));
  }
});

test('grander sites hold more coins, potions and better weapons, a little above the depth', () => {
  const avg = (p, depth, f) => { let n = 0; for (let i = 0; i < 300; i++) n += f(chestLoot(site(p, i), depth, 1)); return n / 300; };
  for (const depth of [1, 6, 14, 20]) {
    let before = null;
    for (const p of PRESTIGE) {
      const t = CHESTS[p];
      for (let i = 0; i < 60; i++) {
        const loot = chestLoot(site(p, i), depth, 9);
        assert.equal(weapons(loot).length, t.weapons.length);
        for (const [k, w] of weapons(loot).entries()) {
          assert.equal(w.gen.ilvl, depthLevel(depth) + t.level);
          assert.ok(RARITY[w.gen.rarity].rank >= Math.min(RARITY[t.weapons[k].floor].rank, RARITY.unusual.rank), `${p} d${depth}: ${w.gen.rarity}`);
          assert.ok(RARITY[w.gen.rarity].rank >= RARITY.vanilla.rank, w.gen.rarity); assert.notEqual(w.gen.rarity, 'omg');
          assert.ok(itemStats(w).damage > 0);
        }
        const n = potions(loot), c = crystals(loot);
        assert.ok(n >= t.potions[0] && n <= t.potions[1]);
        assert.ok(c >= t.crystals[0] && c <= t.crystals[1], `${p}: ${c} crystals`);
        for (const i of loot.items.filter(i => !i.gen && !ITEMS[i.itemId].crystal)) assert.ok(ITEMS[i.itemId].level <= depthLevel(depth) + t.level, `${i.itemId} at depth ${depth}`);
        assert.ok(Number.isSafeInteger(loot.copper) && loot.copper > 0);
      }
      const now = { copper: avg(p, depth, l => l.copper), rank: avg(p, depth, l => Math.max(...weapons(l).map(w => RARITY[w.gen.rarity].rank))) };
      if (before) assert.ok(now.copper > before.copper && now.rank >= before.rank, `${p} at depth ${depth}`);
      before = now;
    }
  }
  // a basic chest is worth several ordinary enemies' coins at its depth
  const spider = coinRange(SPIDER, depthLevel(8));
  assert.ok(chestLoot(site('basic'), 8, 1).copper > 3 * spider[1]);
});

test('exceptional chests promise the best the depth allows, without breaking shallow down', () => {
  for (let i = 0; i < 100; i++) {
    const shallow = weapons(chestLoot(site('exceptional', i), 1, 2)), deep = weapons(chestLoot(site('exceptional', i), 9, 2));
    assert.ok(shallow.every(w => w.gen.rarity === 'unusual'), 'no Remarkable below its item level: the floor comes down to Unusual');
    assert.ok(RARITY[deep[0].gen.rarity].rank >= RARITY.remarkable.rank);
  }
});

test('the planned reward sites of real layouts all roll a chest', () => {
  for (const seed of [1, 2, 3]) {
    const L = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) for (const plans of L(d).sitePlans.values()) for (const s of plans) {
      const loot = chestLoot(s, d, seed);
      assert.ok(loot.items.length && loot.copper > 0, s.id);
    }
  }
});
