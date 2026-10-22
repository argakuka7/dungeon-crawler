import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/util.js';
import { ITEMS, CRYSTALS } from '../src/core/items.js';
import { RARITIES, RARITY } from '../src/core/gear/rarities.js';
import { AFFIX, MAX_PREFIXES, MAX_SUFFIXES, MAX_TIER, rerollAffix } from '../src/core/gear/affixes.js';
import { ENCHANTS, ENCHANT, enchantTier, enchantValue, enchantOf, describeEnchant, MAX_SLOW } from '../src/core/gear/enchants.js';
import { rollWeapon } from '../src/core/gear/generate.js';
import { baseTags } from '../src/core/gear/bases.js';
import { itemStats, enchantEntry, displayName } from '../src/core/gear/stats.js';
import { crystalDrops, crystalChance, rollCrystals } from '../src/core/gear/drops.js';
import { validGen } from '../src/core/loot.js';
import { createInventory, addInstance, addItem, addCopper, copperTotal, countOf, ownedItem, spendItem } from '../src/core/inventory.js';
import { enchantCost, canEnchant, enchantWeapon, rerollCost, canReroll, rerollWeapon, crystalsFor, roundPrice,
  ENCHANTER_SAYS, SMITH_SAYS, ENCHANTED_SAYS } from '../src/core/crafting.js';
import { SHOPS, shopOf } from '../src/core/shops.js';
import { enemySlow, zappable, bigFoe } from '../src/core/status.js';
import { chillFrom } from '../src/core/projectiles.js';
import { describe } from '../src/core/chronicle.js';
import { SPIDER, TRIANGLE } from '../src/core/enemies.js';

const sword = (rarity, ilvl, seed = 1) => rollWeapon(mulberry32(seed), ilvl, { rarity, itemId: 'weapon_sword_long' });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('enchantments: one per crystal, growing by tier, stronger on better weapons', () => {
  assert.deepEqual(ENCHANTS.map(e => e.id), ['toasty', 'icky', 'nippy', 'zappy', 'shiny']);
  assert.deepEqual(new Set(ENCHANTS.map(e => e.crystal)), new Set(CRYSTALS.map(c => c.id)));
  for (const c of CRYSTALS) { assert.ok(ITEMS[c.id].crystal && ITEMS[c.id].stackLimit === 99 && c.description); }
  for (const e of ENCHANTS) {
    assert.equal(e.tiers.length, MAX_TIER);
    for (let i = 1; i < e.tiers.length; i++) assert.ok(e.tiers[i] > e.tiers[i - 1], e.id);
    assert.ok(e.name && e.quip && describeEnchant(e.id, e.tiers[0]).length > 0);
    // deeper and better weapons hold it stronger
    assert.ok(enchantValue(sword('vanilla', 20), e.id) > enchantValue(sword('vanilla', 1), e.id), e.id);
    assert.ok(enchantValue(sword('fabled', 10), e.id) > enchantValue(sword('crap', 10), e.id), e.id);
    assert.ok(enchantValue(sword('omg', 20), e.id) >= enchantValue(sword('fabled', 20), e.id), e.id);
  }
  assert.equal(enchantTier(sword('vanilla', 1)), 1); assert.equal(enchantTier(sword('omg', 19)), MAX_TIER);
  for (const r of RARITIES) assert.ok(enchantValue(sword(r.id, 99), 'nippy') <= MAX_SLOW);
  // a weapon keeps only which one it has; its stats carry what it does now
  const w = sword('unusual', 6);
  assert.equal(enchantOf(w), null); assert.equal(itemStats(w).enchant, undefined); assert.equal(enchantEntry(w), null);
  w.gen = { ...w.gen, enchant: 'toasty' };
  assert.deepEqual(itemStats(w).enchant, { id: 'toasty', value: enchantValue(w, 'toasty') });
  assert.equal(enchantEntry(w).name, 'Toasty');
  // ... and its name wears it, in front of the name it was found with (which it keeps)
  assert.equal(displayName(w), `Toasty ${w.gen.name}`);
  assert.equal(displayName({ ...w, gen: { ...w.gen, enchant: 'icky' } }), `Icky ${w.gen.name}`);
  assert.ok(validGen(w.gen)); assert.ok(!validGen({ ...w.gen, enchant: 'sparkly' }));
  assert.deepEqual(JSON.parse(JSON.stringify(w)), w);
});

test('crystals: enemies now and then, guardians always, chests by prestige; seeded', () => {
  const e = { id: '0,-4,0:spider:17', level: 3, kind: SPIDER };
  assert.deepEqual(crystalDrops(e, 9), crystalDrops(e, 9));
  for (const kind of [SPIDER, TRIANGLE]) {
    const n = 20000, got = many(n, i => crystalDrops({ id: `c:${kind.type}:${i}`, level: 4, kind }, 1)).flat().reduce((a, d) => a + d.count, 0);
    assert.ok(Math.abs(got / n - crystalChance(kind.xp)) < 0.005, `${kind.type}: ${got / n}`);
  }
  for (const [role, count] of [['side', 1], ['descent', 2]]) for (let i = 0; i < 40; i++) {
    const d = crystalDrops({ id: `${i}:guardian`, level: 5, guardian: true, guardianRole: role }, 2);
    assert.equal(d.reduce((a, x) => a + x.count, 0), count);
    for (const x of d) assert.ok(ITEMS[x.itemId].crystal);
  }
  assert.deepEqual(crystalDrops({ id: 'm', level: 3, kind: { xp: 6, drops: { weapons: false } } }, 1), [], 'minions drop none');
  const kinds = new Map();
  for (const d of rollCrystals(mulberry32(5), 5000)) kinds.set(d.itemId, d.count);
  assert.equal(kinds.size, CRYSTALS.length);
  for (const n of kinds.values()) assert.ok(Math.abs(n - 1000) < 150);
});

test('spendItem takes from as many stacks as it needs, or none', () => {
  const inv = createInventory();
  addItem(inv, 'item_crystal_ruby', 99); addItem(inv, 'item_crystal_ruby', 3);
  assert.equal(countOf(inv, 'item_crystal_ruby'), 102);
  assert.equal(spendItem(inv, 'item_crystal_ruby', 200), false); assert.equal(countOf(inv, 'item_crystal_ruby'), 102);
  assert.equal(spendItem(inv, 'item_crystal_ruby', 5), true); assert.equal(countOf(inv, 'item_crystal_ruby'), 97);
  assert.equal(inv.slots.filter(Boolean).length, 1);
});

test('the Enchanter: copper and crystals, more for deeper weapons; replaces, never doubles', () => {
  assert.equal(shopOf({ name: 'enchanter' }), SHOPS.enchanter); assert.equal(SHOPS.enchanter.service, 'enchant');
  assert.deepEqual(SHOPS.enchanter.wares, ENCHANTS.map(e => e.id));
  for (const r of RARITIES) assert.ok(ENCHANTER_SAYS[r.id] && SMITH_SAYS[r.id], r.id);
  for (const e of ENCHANTS) assert.ok(ENCHANTED_SAYS[e.id]);
  assert.deepEqual([1, 7, 8, 15, 16, 40].map(crystalsFor), [1, 1, 2, 2, 3, 3]);
  assert.deepEqual([7.4, 99, 1234, 56789].map(roundPrice), [7, 99, 1200, 57000]);
  let last = 0;
  for (const ilvl of [1, 4, 8, 12, 16, 20]) {
    const c = enchantCost(sword('decent', ilvl), 'icky');
    assert.ok(c.copper > last && Number.isSafeInteger(c.copper)); last = c.copper;
    assert.equal(c.crystal, 'item_crystal_emerald'); assert.equal(c.count, crystalsFor(ilvl));
  }
  const inv = createInventory(), id = addInstance(inv, sword('crap', 3)), cost = enchantCost(ownedItem(inv, id), 'toasty');
  const old = ownedItem(inv, id).gen;
  assert.equal(canEnchant(inv, id, 'toasty'), 'poor');
  addCopper(inv, cost.copper + 5);
  assert.equal(canEnchant(inv, id, 'toasty'), 'crystals');
  addItem(inv, 'item_crystal_ruby', cost.count + 1); addItem(inv, 'item_crystal_emerald', 5);
  assert.equal(canEnchant(inv, id, 'sparkly'), 'unknown'); assert.equal(canEnchant(inv, 'nope', 'toasty'), 'unknown');
  assert.equal(enchantWeapon(inv, id, 'toasty'), 'ok');
  assert.equal(copperTotal(inv), 5); assert.equal(countOf(inv, 'item_crystal_ruby'), 1);
  assert.equal(ownedItem(inv, id).gen.enchant, 'toasty'); assert.equal(old.enchant, undefined, 'the old gen is left alone');
  assert.equal(enchantWeapon(inv, id, 'toasty'), 'same');
  addCopper(inv, 10000);
  assert.equal(enchantWeapon(inv, id, 'icky'), 'ok');
  assert.equal(ownedItem(inv, id).gen.enchant, 'icky', 'one at a time: the new one replaces the old');
  // not weapons, not generated ones
  const potion = addInstance(inv, { itemId: 'item_potion_health', count: 1 });
  assert.equal(canEnchant(inv, potion, 'toasty'), 'unknown');
});

test('the Smith: one affix re-rolled, within the limits and at its tier; dearer for better weapons', () => {
  assert.equal(SHOPS.smith.service, 'reroll');
  for (const r of ['crap', 'vanilla', 'unremarkable']) assert.equal(rerollCost(sword(r, 10)), null, r);
  assert.ok(rerollCost(sword('fabled', 10)) > rerollCost(sword('unusual', 10)));
  assert.ok(rerollCost(sword('unusual', 15)) > rerollCost(sword('unusual', 5)));
  // re-rolls: always as many affixes, distinct, within the limits, at the old tier, on tags
  for (let seed = 1; seed <= 300; seed++) {
    const rng = mulberry32(seed), itemId = seed % 2 ? 'weapon_sword_long' : 'weapon_bow_long';
    const w = rollWeapon(rng, 1 + seed % 20, { rarity: ['decent', 'unusual', 'remarkable', 'fabled', 'impossible', 'omg'][seed % 6], itemId });
    const index = seed % w.gen.affixes.length, next = rerollAffix(rng, w.gen.affixes, index, baseTags(itemId));
    assert.equal(next.length, w.gen.affixes.length);
    assert.equal(new Set(next.map(a => a.id)).size, next.length);
    const kinds = k => next.filter(a => AFFIX[a.id].kind === k).length;
    assert.ok(kinds('prefix') <= MAX_PREFIXES && kinds('suffix') <= MAX_SUFFIXES);
    for (const a of next) {
      assert.ok(AFFIX[a.id].tags.some(t => baseTags(itemId).includes(t)), `${a.id} on ${itemId}`);
      const [lo, hi] = AFFIX[a.id].tiers[a.tier - 1];
      assert.ok(a.value >= lo && a.value <= hi);
    }
    // the others stay as they were
    const rest = w.gen.affixes.filter((_, i) => i !== index);
    for (const a of rest) assert.ok(next.some(b => b.id === a.id && b.value === a.value && b.tier === a.tier));
    // ... and the new one has the old one's tier
    assert.equal(next.find(b => !rest.some(a => a.id === b.id)).tier, w.gen.affixes[index].tier);
  }
  const inv = createInventory(), id = addInstance(inv, sword('remarkable', 9, 4)), cost = rerollCost(ownedItem(inv, id));
  assert.equal(canReroll(inv, id, 0), 'poor'); assert.equal(canReroll(inv, id, 7), 'unknown');
  addCopper(inv, cost);
  const before = ownedItem(inv, id).gen;
  assert.equal(rerollWeapon(inv, id, 1, mulberry32(3)), 'ok');
  assert.equal(copperTotal(inv), 0);
  assert.notDeepEqual(ownedItem(inv, id).gen.affixes, before.affixes);
  assert.equal(ownedItem(inv, id).gen.name, before.name);
  assert.ok(validGen(ownedItem(inv, id).gen));
});

test('chilled enemies slow down, zaps do not stun bosses, and the chronicle tells of the work', () => {
  const e = { profile: { hp: 10 }, chilled: chillFrom({ time: 2, slow: 0.7 }) };
  assert.equal(enemySlow(e), 0.7); assert.equal(enemySlow({ profile: {} }), 1);
  assert.equal(enemySlow({ chilled: { shown: true } }), 1, 'one shown from another game is not slowed here');
  assert.ok(zappable({ profile: {} })); assert.ok(!zappable({ boss: 'gusto', profile: {} })); assert.ok(!zappable({ profile: { steadfast: true } }));
  assert.ok(bigFoe({ guardian: true })); assert.ok(!bigFoe({}));
  assert.equal(describe({ kind: 'craft', data: { what: 'enchant', item: 'Duskfang', enchant: 'toasty', copper: 30 } }), 'The Enchanter made Duskfang Toasty for 3s');
  assert.equal(describe({ kind: 'craft', data: { what: 'reroll', item: 'Duskfang', affix: 'sharp', into: 'brutal', copper: 10 } }),
    "The Smith re-rolled Duskfang's Pointy into Rude for 1s");
});
