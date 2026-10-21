// Weapon and armor affixes. Each one changes one stat; an item has each affix at most once, and at
// most MAX_PREFIXES / MAX_SUFFIXES of each kind. A tier is a value range; the item level
// picks the tier (affixTier), rarer items reach above it (RARITIES tierBonus).
// Values are kept as shown: whole numbers for flat stats and percentages, cells for reach.
// The name is shown beside the stat line in the item's tooltip (game/inventory.js).
// To add an affix: an entry here (stat must be one core/gear/stats.js applies), and tests
// check every tier is valid. `tags`: the bases it may roll on (core/gear/bases.js): melee
// (swords), ranged (bows, crossbows, staffs) or both; armor (any piece) or one slot of it
// (head, body, shield, feet).
export const MAX_PREFIXES = 3, MAX_SUFFIXES = 3;
// the item level each tier starts at; tiers 6 and 7 come only from tierBonus
// learn: loot.html#affixes (see learn/README.md)
export const TIER_LEVELS = [1, 4, 8, 13, 19];
export const MAX_TIER = 7;
export const affixTier = ilvl => TIER_LEVELS.filter(l => ilvl >= l).length;

const ANY = ['melee', 'ranged'];
const affix = (id, kind, name, stat, op, tiers, text, decimals = 0, tags = ANY) =>
  ({ id, kind, name, stat, op, tiers, text, decimals, tags });

// learn: loot.html#affixes (see learn/README.md)
export const AFFIXES = [
  affix('sharp', 'prefix', 'Pointy', 'damage', 'add',
    [[2, 4], [4, 7], [7, 11], [11, 16], [16, 22], [22, 29], [29, 38]], v => `+${v} damage`),
  affix('brutal', 'prefix', 'Rude', 'damage', 'pct',
    [[4, 8], [8, 13], [13, 18], [18, 24], [24, 30], [30, 37], [37, 45]], v => `+${v}% damage`),
  affix('swift', 'prefix', 'Twitchy', 'speed', 'pct',
    [[3, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 25]], v => `${v}% faster attacks`),
  affix('sweeping', 'prefix', 'Swooshy', 'arc', 'pct',
    [[8, 15], [15, 22], [22, 30], [30, 38], [38, 46], [46, 55], [55, 65]], v => `+${v}% swing arc`, 0, ['melee']),
  affix('vicious', 'prefix', 'Sneaky', 'crit', 'add',
    [[3, 5], [5, 7], [7, 9], [9, 12], [12, 15], [15, 18], [18, 22]], v => `+${v}% critical chance`),
  affix('reach', 'suffix', 'of Long Arms', 'range', 'add',
    [[0.05, 0.08], [0.08, 0.12], [0.12, 0.16], [0.16, 0.2], [0.2, 0.25], [0.25, 0.3], [0.3, 0.36]],
    v => `+${v.toFixed(2)} reach`, 2, ['melee']),
  affix('distance', 'suffix', 'of Far Away', 'range', 'pct',
    [[5, 9], [9, 14], [14, 19], [19, 25], [25, 31], [31, 38], [38, 46]], v => `+${v}% range`, 0, ['ranged']),
  affix('leech', 'suffix', 'of Second Helpings', 'leech', 'add',
    [[1, 2], [2, 3], [3, 5], [5, 7], [7, 10], [10, 13], [13, 17]], v => `+${v} life on hit`),
  affix('force', 'suffix', 'of the Big Shove', 'knockback', 'pct',
    [[15, 30], [30, 45], [45, 60], [60, 80], [80, 100], [100, 125], [125, 150]], v => `+${v}% knockback`),
  affix('precision', 'suffix', 'of Right Where It Hurts', 'critDamage', 'add',
    [[10, 20], [20, 30], [30, 40], [40, 55], [55, 70], [70, 85], [85, 100]], v => `+${v}% critical damage`),
  // armor (core/items.js ARMORS; core/gear/stats.js armorStats): 'armor' rolls on every slot,
  // the others on theirs
  affix('sturdy', 'prefix', 'Sturdy', 'armor', 'add',
    [[1, 3], [3, 5], [5, 8], [8, 11], [11, 15], [15, 19], [19, 24]], v => `+${v} armor`, 0, ['armor']),
  affix('thick', 'prefix', 'Thick', 'armor', 'pct',
    [[5, 10], [10, 15], [15, 21], [21, 28], [28, 35], [35, 43], [43, 52]], v => `+${v}% armor`, 0, ['armor']),
  affix('blocky', 'prefix', 'Blocky', 'block', 'add',
    [[2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 10]], v => `+${v}% chance to block`, 0, ['shield']),
  affix('zippy', 'prefix', 'Zippy', 'moveSpeed', 'add',
    [[2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 10]], v => `${v}% faster on your feet`, 0, ['feet']),
  affix('hearty', 'suffix', 'of the Big Breakfast', 'life', 'add',
    [[4, 8], [8, 13], [13, 19], [19, 26], [26, 34], [34, 43], [43, 54]], v => `+${v} health`, 0, ['armor']),
  affix('mending', 'suffix', 'of Licking Wounds', 'regen', 'add',
    [[10, 15], [15, 20], [20, 26], [26, 32], [32, 39], [39, 46], [46, 55]], v => `${v}% faster healing`, 0, ['armor']),
  affix('fireproof', 'suffix', 'of the Oven Mitt', 'burnResist', 'add',
    [[8, 12], [12, 16], [16, 20], [20, 25], [25, 30], [30, 35], [35, 40]], v => `${v}% less hurt by fire`, 0, ['armor']),
  affix('antivenom', 'suffix', 'of the Iron Stomach', 'poisonResist', 'add',
    [[8, 12], [12, 16], [16, 20], [20, 25], [25, 30], [30, 35], [35, 40]], v => `${v}% less hurt by poison`, 0, ['armor']),
  affix('steady', 'suffix', 'of Standing Firm', 'steady', 'add',
    [[10, 15], [15, 20], [20, 26], [26, 32], [32, 39], [39, 46], [46, 55]], v => `${v}% less shoved about`, 0, ['body', 'shield', 'feet']),
];
export const AFFIX = Object.fromEntries(AFFIXES.map(a => [a.id, a]));

export function rollAffixValue(a, tier, rng) {
  const [lo, hi] = a.tiers[tier - 1], k = 10 ** a.decimals;
  return Math.round((lo + (hi - lo) * rng()) * k) / k;
}

// `count` distinct affixes allowed on `tags`, tier from the item level plus the bonus
export function rollAffixes(rng, count, ilvl, tags, tierBonus = 0) {
  const tier = Math.min(MAX_TIER, affixTier(ilvl) + tierBonus);
  const pool = AFFIXES.filter(a => a.tags.some(t => tags.includes(t))), out = [];
  const kinds = { prefix: 0, suffix: 0 }, max = { prefix: MAX_PREFIXES, suffix: MAX_SUFFIXES };
  while (out.length < count) {
    const open = pool.filter(a => !out.some(o => o.id === a.id) && kinds[a.kind] < max[a.kind]);
    if (!open.length) break;
    const a = open[Math.floor(rng() * open.length)];
    kinds[a.kind]++;
    out.push({ id: a.id, tier, value: rollAffixValue(a, tier, rng) });
  }
  // prefixes first, then suffixes, each in table order: a stable reading order
  return out.sort((x, y) => AFFIXES.indexOf(AFFIX[x.id]) - AFFIXES.indexOf(AFFIX[y.id]));
}
// The Smith's re-roll (core/crafting.js): affix `index` of `affixes` becomes a fresh one, any that
// may roll on `tags` and is not on the item already (the same one again too, with a new value),
// keeping the prefix and suffix limits and its tier. A new list, in reading order.
export function rerollAffix(rng, affixes, index, tags) {
  const old = affixes[index];
  if (!old) return affixes;
  const rest = affixes.filter((_, i) => i !== index), kinds = { prefix: 0, suffix: 0 }, max = { prefix: MAX_PREFIXES, suffix: MAX_SUFFIXES };
  for (const a of rest) kinds[AFFIX[a.id].kind]++;
  const open = AFFIXES.filter(a => a.tags.some(t => tags.includes(t)) && !rest.some(o => o.id === a.id) && kinds[a.kind] < max[a.kind]);
  const a = open[Math.floor(rng() * open.length)] ?? AFFIX[old.id];
  const tier = Math.max(1, Math.min(MAX_TIER, old.tier || 1));
  return [...rest, { id: a.id, tier, value: rollAffixValue(a, tier, rng) }]
    .sort((x, y) => AFFIXES.indexOf(AFFIX[x.id]) - AFFIXES.indexOf(AFFIX[y.id]));
}
export const describeAffix = a => AFFIX[a.id].text(a.value);
