// Item rarities, from worst to best. Each tier rolls more affixes and a stronger base, and
// glows more on the floor (render/loot.js reads `glow`). Colours are OKLCH, so the steps
// read as evenly bright; `css` is the same colour as a hex string for the DOM.
import { fromOklch, toHex } from '../oklch.js';

const tier = (id, name, rank, oklch, spec) => {
  const rgb = fromOklch(oklch);
  return { id, name, rank, rgb, css: toHex(rgb), ...spec };
};

// weight: base odds; minLevel: the least item level that may roll it (rarer tiers only drop
// deeper down); affixes: how many (the bottom four roll none: an Unremarkable weapon is just that);
// tierBonus: affix tiers above what the item level allows; damage: base damage factor;
// glow: what the floor shows (none, ring, halo, beam height, sparks, runes, light; rainbow: the
// colour runs through every hue, and the weapon hops on the floor)
// learn: loot.html#rarities, random.html#weighted (see learn/README.md)
export const RARITIES = [
  tier('crap', 'Crap', 0, { l: 0.55, c: 0.045, h: 55 },
    { weight: 11, minLevel: 1, affixes: 0, tierBonus: 0, damage: 0.75, glow: null }),
  tier('shitty', 'Shitty', 1, { l: 0.66, c: 0.06, h: 105 },
    { weight: 14, minLevel: 1, affixes: 0, tierBonus: 0, damage: 0.88, glow: null }),
  tier('vanilla', 'Vanilla', 2, { l: 0.96, c: 0.035, h: 92 },
    { weight: 28, minLevel: 1, affixes: 0, tierBonus: 0, damage: 1, glow: null }),
  tier('unremarkable', 'Unremarkable', 3, { l: 0.8, c: 0.025, h: 70 },
    { weight: 14, minLevel: 1, affixes: 0, tierBonus: 0, damage: 1.03, glow: null }),
  tier('decent', 'Decent', 4, { l: 0.8, c: 0.19, h: 145 },
    { weight: 22, minLevel: 1, affixes: 1, tierBonus: 0, damage: 1.06,
      glow: { ring: 0.55, halo: 0, beam: 0, sparks: 0, runes: false, light: 0 } }),
  tier('unusual', 'Unusual', 5, { l: 0.72, c: 0.16, h: 250 },
    { weight: 8, minLevel: 1, affixes: 2, tierBonus: 0, damage: 1.11,
      glow: { ring: 0.7, halo: 0.55, beam: 0, sparks: 0, runes: false, light: 0 } }),
  tier('remarkable', 'Remarkable', 6, { l: 0.66, c: 0.22, h: 305 },
    { weight: 2.2, minLevel: 4, affixes: 3, tierBonus: 0, damage: 1.17,
      glow: { ring: 0.85, halo: 0.75, beam: 1, sparks: 0, runes: false, light: 0 } }),
  tier('fabled', 'Fabled', 7, { l: 0.78, c: 0.17, h: 68 },
    { weight: 0.42, minLevel: 8, affixes: 4, tierBonus: 0, damage: 1.24,
      glow: { ring: 0.95, halo: 0.9, beam: 3, sparks: 4, runes: false, light: 0 } }),
  tier('impossible', 'Impossible', 8, { l: 0.62, c: 0.23, h: 22 },
    { weight: 0.07, minLevel: 13, affixes: 4, tierBonus: 1, damage: 1.32,
      glow: { ring: 1, halo: 1, beam: 3.5, sparks: 6, runes: true, light: 2 } }),
  tier('omg', 'OMG', 9, { l: 0.92, c: 0.09, h: 95 },
    { weight: 0.014, minLevel: 17, affixes: 5, tierBonus: 2, damage: 1.4, guardianOnly: true,
      glow: { ring: 1, halo: 1.2, beam: 5, sparks: 10, runes: true, light: 3, rainbow: true } }),
];
export const RARITY = Object.fromEntries(RARITIES.map(r => [r.id, r]));
export const rarityOf = item => RARITY[item?.gen?.rarity] || RARITY.vanilla;

// how much each step up the tiers gains per item level, on top of its base weight: deeper
// drops are better, but a Fabled one stays a find (about 1 weapon in 40 at item level 20)
// learn: loot.html#rarities (see learn/README.md)
export const LEVEL_SHIFT = 0.025;

// the odds of every rarity at item level `ilvl`. luck shifts weight upwards (guardians, chests);
// floor: the least rank that may roll (lowered to the best this item level allows); guardian:
// whether the guardian-only tier (OMG) may roll at all
// learn: loot.html#odds (see learn/README.md)
export function rarityOdds(ilvl, { luck = 0, floor = 0, guardian = false } = {}) {
  floor = Math.min(floor, Math.max(...RARITIES.filter(r => ilvl >= r.minLevel && (!r.guardianOnly || guardian)).map(r => r.rank)));
  const w = RARITIES.map(r => r.rank < floor || ilvl < r.minLevel || (r.guardianOnly && !guardian) ? 0
    : r.weight * Math.exp((LEVEL_SHIFT * (ilvl - 1) + luck) * r.rank));
  const total = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / total);
}
export function rollRarity(rng, ilvl, opts) {
  const odds = rarityOdds(ilvl, opts);
  let u = rng();
  for (let i = 0; i < odds.length; i++) if ((u -= odds[i]) < 0 && odds[i] > 0) return RARITIES[i];
  return RARITIES[odds.findLastIndex(p => p > 0)];
}
