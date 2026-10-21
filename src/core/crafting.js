// The Enchanter and the Smith in town work on the player's weapons (core/shops.js says who does
// what; game/inventory.js is where you ask them). Pure.
//   enchanting: puts an enchantment on a weapon (core/gear/enchants.js), replacing the one it had;
//     costs copper and crystals of the enchantment's kind
//   re-rolling: one affix of a weapon becomes a fresh one (core/gear/affixes.js rerollAffix);
//     costs copper
// Prices grow with the weapon's item level (PRICE_GROWTH a level, on the price at level 1): about
// as fast as what a depth pays grows (enemy coins, and more enemies deeper down; `node
// tools/balance.mjs` prints both), so an enchantment costs about a quarter of what the depth of
// its weapon brings in, and a re-roll a few percent. Better weapons cost more to re-roll.
import { ITEMS } from './items.js';
import { ownedItem, countOf, copperTotal, spendCopper, spendItem } from './inventory.js';
import { ENCHANT } from './gear/enchants.js';
import { rerollAffix } from './gear/affixes.js';
import { baseTags } from './gear/bases.js';
import { rarityOf } from './gear/rarities.js';

// copper at item level 1, before rounding, and its growth per item level
export const ENCHANT_COPPER = 300, REROLL_COPPER = 80, PRICE_GROWTH = 0.75;
// a re-roll's price by rarity (only weapons with affixes have anything to re-roll)
export const REROLL_RARITY = { decent: 1, unusual: 1.25, remarkable: 1.5, fabled: 2, impossible: 2.5, omg: 3 };
const grown = (c, ilvl) => c * (1 + PRICE_GROWTH * (ilvl - 1));
// how many crystals an enchantment takes at item level `ilvl`: one, two from 8, three from 16
export const crystalsFor = ilvl => ilvl >= 16 ? 3 : ilvl >= 8 ? 2 : 1;
// a price with two significant figures (1234 -> 1200), the way a shopkeeper would say it
export function roundPrice(c) {
  if (c < 100) return Math.max(1, Math.round(c));
  const k = 10 ** (Math.floor(Math.log10(c)) - 1);
  return Math.round(c / k) * k;
}
const level = item => Math.max(1, item?.gen?.ilvl ?? 1);
const isWeapon = item => !!ITEMS[item?.itemId]?.weapon;

// what enchanting `item` with enchantment `id` costs: { copper, crystal, count }
export function enchantCost(item, id) {
  return { copper: roundPrice(grown(ENCHANT_COPPER, level(item))), crystal: ENCHANT[id]?.crystal ?? null, count: crystalsFor(level(item)) };
}
// what re-rolling one of `item`'s affixes costs, in copper (null: nothing to re-roll)
export function rerollCost(item) {
  const f = REROLL_RARITY[rarityOf(item).id];
  return f && item?.gen?.affixes?.length ? roundPrice(grown(REROLL_COPPER, level(item)) * f) : null;
}
// can the Enchanter put `id` on the weapon? 'ok', or why not: 'unknown' (no such weapon or
// enchantment), 'same' (it has it already), 'poor' (not enough copper), 'crystals'
export function canEnchant(inv, instanceId, id) {
  const item = ownedItem(inv, instanceId);
  if (!isWeapon(item) || !item.gen || !ENCHANT[id]) return 'unknown';
  if (item.gen.enchant === id) return 'same';
  const cost = enchantCost(item, id);
  if (copperTotal(inv) < cost.copper) return 'poor';
  if (countOf(inv, cost.crystal) < cost.count) return 'crystals';
  return 'ok';
}
// Enchant it (all or nothing): what canEnchant says; on 'ok' it is paid and done. The item's gen
// is replaced, not changed, so what shared it before (a save, a quest reward) keeps the old one.
export function enchantWeapon(inv, instanceId, id) {
  const why = canEnchant(inv, instanceId, id);
  if (why !== 'ok') return why;
  const item = ownedItem(inv, instanceId), cost = enchantCost(item, id);
  spendCopper(inv, cost.copper); spendItem(inv, cost.crystal, cost.count);
  item.gen = { ...item.gen, enchant: id };
  inv.version++;
  return 'ok';
}
// can the Smith re-roll affix `index` of the weapon? 'ok', 'unknown' (no such weapon or affix),
// 'poor'
export function canReroll(inv, instanceId, index) {
  const item = ownedItem(inv, instanceId), cost = rerollCost(item);
  if (!isWeapon(item) || cost === null || !item.gen.affixes[index]) return 'unknown';
  return copperTotal(inv) < cost ? 'poor' : 'ok';
}
// Re-roll it with rng (all or nothing): what canReroll says
export function rerollWeapon(inv, instanceId, index, rng = Math.random) {
  const why = canReroll(inv, instanceId, index);
  if (why !== 'ok') return why;
  const item = ownedItem(inv, instanceId);
  spendCopper(inv, rerollCost(item));
  item.gen = { ...item.gen, affixes: rerollAffix(rng, item.gen.affixes, index, baseTags(item.itemId)) };
  inv.version++;
  return 'ok';
}

// What they say when you hand them a weapon, by its rarity
export const ENCHANTER_SAYS = {
  crap: "I can enchant this. I'd rather nobody watched.",
  shitty: 'Magic sticks to dents. Mostly.',
  vanilla: "A sensible weapon. Let's make it less sensible.",
  unremarkable: 'Finally, something worth remarking on.',
  decent: "Oh, decent! It'll take a charm nicely.",
  unusual: 'Unusual. My favourite kind.',
  remarkable: "Remarkable. It's practically asking for it.",
  fabled: "It's humming already. Careful.",
  impossible: "That shouldn't exist. Hold it still.",
  omg: '...I need to sit down.',
};
const PLAIN = 'Nothing on this to hammer at. It is what it is.';
export const SMITH_SAYS = {
  crap: PLAIN, shitty: PLAIN, vanilla: PLAIN, unremarkable: PLAIN,
  decent: 'One line to fix. Easy.',
  unusual: "Two lines. I'll be gentle.",
  remarkable: "Nice work, whoever made this. I'll make it nicer.",
  fabled: "Fabled, eh? I'll hit it softly.",
  impossible: "I'm not sure my anvil agrees with this.",
  omg: "I'll need a bigger hammer. And a minute.",
};
// ... when it is done: the enchantment (by id), a re-roll
export const ENCHANTED_SAYS = {
  toasty: 'There. Toasty. Mind your eyebrows.',
  icky: "Done. Don't lick it.",
  nippy: 'Done. Brr. Wear a scarf.',
  zappy: "Done. It'll tingle a bit.",
  shiny: "Done. Ooh, shiny. Don't let the magpies see.",
};
export const REROLLED_SAYS = ['There, good as new. Better, maybe.', 'Clang. Done.', "Hammered out. Don't tell the Enchanter.",
  'Fresh off the anvil.'];
