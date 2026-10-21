// What a treasure chest holds. Every stratum budgets four reward sites (world/sites.js): two
// basic, one uncommon and one rare (now and then exceptional), each with a chest. Opening one
// (game/chests.js) spills coins, potions and weapons a little above the depth's level,
// better the grander the site. Seeded by the world seed and the site, so a chest always holds
// the same; an opened chest stays open for the run (run.chests).
import { mulberry32, hash32 } from './util.js';
import { hashString, rollCrystals } from './gear/drops.js';
import { rollWeapon } from './gear/generate.js';
import { RARITY } from './gear/rarities.js';
import { rollPotions } from './potions.js';
import { depthLevel, grown, GROWTH } from './enemies.js';

// level: item levels above the depth's; copper: [least, most] at level 1 (grown like enemy
// coins); potions and crystals (for the Enchanter): [least, most]; weapons: one roll each,
// `floor` the least rarity it may be
// learn: loot.html#drops (see learn/README.md)
export const CHESTS = {
  basic: { level: 0, copper: [25, 45], potions: [0, 1], crystals: [0, 1], weapons: [{ floor: 'vanilla', luck: 0.1 }] },
  uncommon: { level: 1, copper: [50, 90], potions: [1, 1], crystals: [1, 1], weapons: [{ floor: 'decent', luck: 0.2 }] },
  rare: { level: 1, copper: [100, 160], potions: [1, 2], crystals: [1, 2], weapons: [{ floor: 'unusual', luck: 0.3 }, { floor: 'decent', luck: 0.3 }] },
  exceptional: { level: 2, copper: [180, 280], potions: [2, 2], crystals: [2, 3], weapons: [{ floor: 'remarkable', luck: 0.45 }, { floor: 'unusual', luck: 0.45 }] },
};

// site: a reward site ({ id, prestige }); { copper, items: [{ itemId, count, gen? }] }; favor:
// the kind of weapon the player fights with (weapons lean towards it, gear/bases.js)
export function chestLoot(site, depth, seed = 0, favor = null) {
  const t = CHESTS[site.prestige] ?? CHESTS.basic, level = depthLevel(depth) + t.level;
  const R = mulberry32(hash32(hashString(String(site.id)) ^ Math.imul(seed >>> 0, 0x85ebca6b) ^ 0xc4e57));
  const range = ([lo, hi]) => lo + Math.floor(R() * (hi - lo + 1));
  const copper = range(t.copper.map(c => Math.round(grown(c, GROWTH.coins, level))));
  const items = t.weapons.map(w => rollWeapon(R, level, { floor: RARITY[w.floor].rank, luck: w.luck, favor }));
  items.push(...rollPotions(R, level, range(t.potions)));
  items.push(...rollCrystals(R, range(t.crystals)));   // (drawn last: what came before stays as it was)
  return { copper, items };
}
