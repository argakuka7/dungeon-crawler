// Enchantments: what the Enchanter in town puts on a weapon (core/crafting.js), one per weapon,
// apart from its affixes. Loot never rolls them. Where affixes change numbers, an enchantment
// changes what a hit does: it burns, poisons, slows or stuns, or shakes more coins loose.
// Each one takes its own crystal (core/items.js CRYSTALS), and copper.
// A weapon keeps only which enchantment it has (`gen.enchant`, an id); how strong it is follows
// from the weapon: the item level picks the tier like an affix's (affixTier, Impossible and OMG
// reach above it), and the rarity's damage factor scales the tier's value (a Crap weapon holds
// magic worse, an OMG one better). So retuning these numbers changes enchanted weapons too.
// The hits themselves: game/enchants.js; the statuses: core/status.js, game/statuses.js.
import { affixTier, MAX_TIER } from './affixes.js';
import { rarityOf } from './rarities.js';
import { tr, msg } from '../../i18n/i18n.js';

export const TOASTY_TIME = 3, ICKY_TIME = 4, NIPPY_TIME = 2, ZAPPY_TIME = 0.6;
// guardians and bosses take half of a slow and of a stun (bosses are not stunned at all)
export const BIG_SHARE = 0.5;
export const MAX_SLOW = 50;   // %

// text: a message, with the value as {v} and its time as {time}; name, text and quip are English,
// translated where they are shown
const enchant = (id, name, crystal, tiers, text, quip, time = null) => ({ id, name, crystal, tiers, text, quip, time });

// tiers: the value at tiers 1-7, before the rarity's factor
export const ENCHANTS = [
  // sets what it hits burning for a share of the hit over 3 s, unless it burns already (fire
  // does not hurt the fiery kinds): best on slow, heavy blows
  enchant('toasty', 'Toasty', 'item_crystal_ruby', [60, 70, 80, 90, 100, 110, 120],
    msg('Sets things burning for {v}% of the hit over {time} s'), 'Mind your eyebrows.', TOASTY_TIME),
  // every hit adds a share of its damage to the poison, spread over the next 4 s: it piles up,
  // best on quick weapons
  enchant('icky', 'Icky', 'item_crystal_emerald', [8, 10, 12, 14, 16, 18, 20],
    msg('Poisons for {v}% of every hit; it piles up'), 'Leaves something unpleasant behind.'),
  // slows what it hits (all it does, its blows too) for 2 s
  enchant('nippy', 'Nippy', 'item_crystal_sapphire', [15, 18, 21, 24, 27, 30, 33],
    msg('Slows what it hits by {v}% for {time} s'), 'Brr.', NIPPY_TIME),
  // now and then the hit stuns: the enemy holds still for a moment
  enchant('zappy', 'Zappy', 'item_crystal_amethyst', [6, 7, 8, 9, 10, 11, 12],
    msg('{v}% chance to stun for {time} s'), 'They hold still and think about it.', ZAPPY_TIME),
  // more coins from what it defeats
  enchant('shiny', 'Shiny', 'item_crystal_diamond', [15, 20, 25, 30, 35, 40, 50],
    msg('+{v}% coins from what it defeats'), 'Pays for itself. Eventually.'),
];
export const ENCHANT = Object.fromEntries(ENCHANTS.map(e => [e.id, e]));

// the tier an enchantment has on `item`: its item level's, plus the rarity's bonus
export const enchantTier = item => Math.min(MAX_TIER, affixTier(item?.gen?.ilvl ?? 1) + rarityOf(item).tierBonus);
// how strong enchantment `id` is (or would be) on `item`: the tier's value × the rarity's factor
export function enchantValue(item, id) {
  const e = ENCHANT[id];
  if (!e) return 0;
  const v = Math.round(e.tiers[enchantTier(item) - 1] * rarityOf(item).damage);
  return id === 'nippy' ? Math.min(MAX_SLOW, v) : v;
}
// the enchantment on `item`: { id, value } or null
export function enchantOf(item) {
  const id = item?.gen?.enchant;
  return ENCHANT[id] ? { id, value: enchantValue(item, id) } : null;
}
export const describeEnchant = (id, value) => ENCHANT[id] ? tr(ENCHANT[id].text, { v: value, time: ENCHANT[id].time }) : '';
