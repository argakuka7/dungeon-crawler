// Which base types drop, from what item level and how often. A base is an item in
// core/items.js; `tags` decide which affixes may roll on it (core/gear/affixes.js): its kind
// (sword, bow, crossbow, staff) and how it fights (melee or ranged).
// To add a dropping weapon: define the item (with its model), then list it here.
// The Old Sword is never dropped: it is what a run starts with.
// Every kind has a light base from item level 1 and heavier ones further down; a kind's weights
// add up to the same, so each kind is about as likely as the others once all of it drops.
// Rolls lean towards the kind the player fights with (`favor`, FAVOR times its weight): about
// half of the weapons are of that kind, so whatever you use keeps finding upgrades while the
// other kinds still turn up.
import { ITEMS } from '../items.js';

const base = (itemId, minLevel, weight = 1, extra = []) => {
  const kind = ITEMS[itemId].weapon.kind;
  return { itemId, minLevel, weight, tags: [kind, kind === 'sword' ? 'melee' : 'ranged', ...extra] };
};

export const BASES = [
  base('weapon_sword_short', 1),
  base('weapon_sword_medium', 1),
  base('weapon_sword_long', 2),
  base('weapon_sword_broad', 4),
  base('weapon_sword_greatsword', 6, 1, ['two-handed']),
  base('weapon_bow_short', 1),
  base('weapon_bow_hunting', 1),
  base('weapon_bow_recurve', 3),
  base('weapon_bow_long', 5),
  base('weapon_bow_war', 7),
  base('weapon_crossbow_hand', 1),
  base('weapon_crossbow_light', 2),
  base('weapon_crossbow_heavy', 4),
  base('weapon_crossbow_repeating', 6),
  base('weapon_crossbow_arbalest', 8),
  base('weapon_staff_gnarled', 1),
  base('weapon_staff_oak', 2),
  base('weapon_staff_ember', 4),
  base('weapon_staff_crystal', 6),
  base('weapon_staff_arcane', 8),
];
export const BASE = Object.fromEntries(BASES.map(b => [b.itemId, b]));
// tags for any weapon, including those that never drop
export function baseTags(itemId) {
  if (BASE[itemId]) return BASE[itemId].tags;
  const kind = ITEMS[itemId]?.weapon?.kind ?? 'sword';
  return [kind, kind === 'sword' ? 'melee' : 'ranged'];
}

export const FAVOR = 3;
// favor: a kind (sword, bow, crossbow, staff) to lean towards, or null
export function rollBase(rng, ilvl, favor = null) {
  const open = BASES.filter(b => ilvl >= b.minLevel), weight = b => b.weight * (b.tags[0] === favor ? FAVOR : 1);
  let w = rng() * open.reduce((n, b) => n + weight(b), 0);
  for (const b of open) if ((w -= weight(b)) < 0) return b;
  return open.at(-1);
}
