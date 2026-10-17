// World-level destination budgets: fixed before terrain retries or asset loading.
import { hash32, mulberry32 } from '../core/util.js';
import { hashKey } from './coords.js';

export const PRESTIGE = ['basic', 'uncommon', 'rare', 'exceptional'];
const SETTINGS = {
  mines: ['storage', 'gallery', 'excavation'],
  ruins: ['burial', 'hall', 'courtyard'],
};

export function siteIntent(seed, key, biome, prestige, slot = 0) {
  const siteSeed = hash32(seed ^ hashKey(key) ^ Math.imul(slot + 1, 0x51e7));
  const R = mulberry32(siteSeed), rank = PRESTIGE.indexOf(prestige);
  const settings = SETTINGS[biome];
  return { id: `${seed}:${key}:site:${slot}`, seed: siteSeed, prestige, biome,
    setting: settings ? settings[Math.floor(R() * settings.length)] : 'alcove',
    form: ['alcove', 'overlook', 'sanctuary', 'sanctuary'][rank],
    encounter: null, spawn: 'treasure' };
}

export function planSites(seed, layout, distance) {
  const plans = new Map(), roles = new Map();
  const biome = layout.theme.props;
  for (const key of layout.exists) roles.set(key, distance.get(key) ? 'branch' : 'connector');
  if (layout.up) roles.set(layout.up, 'entrance');
  if (layout.down) roles.set(layout.down, 'descent');
  if (!layout.depth) return { plans, roles };
  const R = mulberry32(hash32(seed ^ Math.imul(layout.depth, 0x517e)));
  const candidates = [...layout.exists].filter(k => k !== layout.up && k !== layout.down && !layout.guardians?.has(k) && !layout.hordes?.has(k)
    && layout.spanCells?.get(k)?.role !== 'gorge')
    .map(key => ({ key, score: (distance.get(key) || 0) * 2 + R() }));
  candidates.sort((a, b) => b.score - a.score);
  // One major destination, plus modest discoveries. Exceptional loot is not guaranteed.
  const tiers = [R() < 0.2 ? 'exceptional' : 'rare', 'uncommon', 'basic', 'basic'];
  for (const [i, prestige] of tiers.entries()) {
    const c = candidates[i];
    if (!c) break;
    plans.set(c.key, [siteIntent(seed, c.key, biome, prestige)]);
    roles.set(c.key, i ? 'discovery' : 'landmark');
  }
  return { plans, roles };
}
