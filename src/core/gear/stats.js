// A weapon instance's stats: its base type's, grown by its item level and scaled by rarity, then
// changed by its affixes. Combat (core/combat.js) only ever reads these, never the base type.
//   kind: sword, bow, crossbow or staff; ranged: it shoots (core/shots.js) rather than swings
//   damage: (base × item level growth × rarity + flat) × (1 + percent), rounded
//   interval: the time between attacks, shortened by `speed` percent (every attack time with it)
//   range: (+ reach in cells) × (1 + percent); arc: the base's × (1 + percent)
//   crit / critDamage: chance (0..1, CRIT_CHANCE without affixes) and multiplier; leech: life on
//   hit; knockback: multiplier; pierce / burst / color: the base's (core/items.js)
//   enchant: { id, value }, only when it has one: the Enchanter's (core/gear/enchants.js, game/enchants.js)
import { ITEMS } from '../items.js';
import { AFFIX, describeAffix } from './affixes.js';
import { rarityOf } from './rarities.js';
import { ENCHANT, enchantOf, describeEnchant } from './enchants.js';
import { namesBase } from './names.js';

export const ARC = Math.PI * 0.42;   // the basic swing arc (core/combat.js SWORD.arc)
// learn: combat.html#damage (see learn/README.md)
export const CRIT_CHANCE = 0.05;     // every weapon crits this often without affixes
// learn: combat.html#damage (see learn/README.md)
export const CRIT_DAMAGE = 1.5;      // a critical hit without affixes
// base damage grows by this share per item level: a weapon found ten depths further down hits
// half again as hard as the same one from the top (enemy health grows 12% a level; the
// player's level adds the rest, core/progression.js)
// learn: loot.html#stats-code (see learn/README.md)
export const ILVL_DAMAGE = 0.05;
// learn: loot.html#stats-code (see learn/README.md)
export const ilvlDamage = ilvl => 1 + ILVL_DAMAGE * (Math.max(1, ilvl || 1) - 1);

// learn: loot.html#stats-code, stronger.html#race (see learn/README.md)
export function itemStats(item) {
  const def = ITEMS[item?.itemId], w = def?.weapon;
  if (!w) return null;
  const sum = { damage: 0, damagePct: 0, speed: 0, arc: 0, crit: 0, critDamage: 0, range: 0, rangePct: 0, leech: 0, knockback: 0 };
  for (const a of item.gen?.affixes ?? []) {
    const { stat, op } = AFFIX[a.id];
    sum[op === 'pct' && (stat === 'damage' || stat === 'range') ? stat + 'Pct' : stat] += a.value;
  }
  const kind = w.kind ?? 'sword', enchant = enchantOf(item);
  return {
    kind, ranged: kind !== 'sword',
    damage: Math.max(1, Math.round((w.damage * ilvlDamage(item.gen?.ilvl) * rarityOf(item).damage + sum.damage) * (1 + sum.damagePct / 100))),
    interval: Math.round(w.interval * (1 - sum.speed / 100) * 1000) / 1000,
    range: Math.round((w.range + sum.range) * (1 + sum.rangePct / 100) * 100) / 100,
    arc: ARC * w.arc * (1 + sum.arc / 100),
    crit: CRIT_CHANCE + sum.crit / 100,
    critDamage: CRIT_DAMAGE + sum.critDamage / 100,
    leech: sum.leech,
    knockback: 1 + sum.knockback / 100,
    pierce: w.pierce ?? 0, burst: w.burst ?? 0, ...(w.color && { color: w.color }),
    ...(enchant && { enchant }),
  };
}

// what to call it, and the base type to show under the name (null when the name says it). An
// enchanted weapon wears its enchantment in front of its name ("Toasty Duskfang"); the name it was
// found with stays in `gen.name`, so a new enchantment renames it and an old save shows it too.
export function displayName(item) {
  const name = item?.gen?.name ?? ITEMS[item?.itemId]?.name ?? '', e = ENCHANT[item?.gen?.enchant];
  return e && name ? `${e.name} ${name}` : name;
}
export const baseLine = item => item?.gen && !namesBase(item.gen.rarity) ? ITEMS[item.itemId].name : null;
export const affixLines = item => (item?.gen?.affixes ?? []).map(describeAffix);
// ... with each affix's name: [{ name: 'Pointy', text: '+5 damage' }]
export const affixEntries = item => (item?.gen?.affixes ?? []).map(a => ({ name: AFFIX[a.id].name, text: describeAffix(a) }));
// ... and its enchantment: { name: 'Toasty', text: 'Sets things burning ...' } or null
export function enchantEntry(item) {
  const e = enchantOf(item);
  return e && { id: e.id, name: ENCHANT[e.id].name, text: describeEnchant(e.id, e.value) };
}
// damage per second, counting crits: what to compare weapons by
export const weaponDps = s => s.damage * (1 + s.crit * (s.critDamage - 1)) / s.interval;
