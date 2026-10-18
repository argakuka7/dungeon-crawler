// World-level destination budgets: fixed before terrain retries or asset loading.
import { hash32, mulberry32 } from '../core/util.js';
import { hashKey } from './coords.js';
import { PROP_METADATA } from '../core/propmetadata.js';

export const PRESTIGE = ['basic', 'uncommon', 'rare', 'exceptional'];
const SETTINGS = {
  mines: ['storage', 'gallery', 'excavation'],
  ruins: ['burial', 'hall', 'courtyard'],
};

// every theme's landmarks (assets/themes/: bigger than a cell, built around by cubegen/sites.js), by set
const LANDMARKS = new Map();
for (const p of PROP_METADATA) if (p.landmark) {
  if (!LANDMARKS.has(p.set)) LANDMARKS.set(p.set, []);
  LANDMARKS.get(p.set).push(p);
}
export const landmarksOf = biome => LANDMARKS.get(biome) || [];

// landmark: the name of the landmark the site is built around (the depth's major site), or null
export function siteIntent(seed, key, biome, prestige, slot = 0, landmark = null) {
  const siteSeed = hash32(seed ^ hashKey(key) ^ Math.imul(slot + 1, 0x51e7));
  const R = mulberry32(siteSeed), rank = PRESTIGE.indexOf(prestige);
  const settings = SETTINGS[biome];
  const setting = settings ? settings[Math.floor(R() * settings.length)] : 'alcove';
  const role = landmark && PROP_METADATA.find(p => p.name === landmark)?.role;
  return { id: `${seed}:${key}:site:${slot}`, seed: siteSeed, prestige, biome,
    setting: landmark ? 'landmark' : setting, ...(landmark ? { landmark, role } : {}),
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
  // a large area's rooms (world/areas.js) only where nothing else is left, and only those you walk
  // about in on foot: the foot of a spiral or a hairpin, a hairpin's summit
  const open = k => { const a = layout.areaCells?.get(k); return !a || (a.i === 0 || (a.piece.kind === 'hairpin' && a.i === 5)); };
  const candidates = [...layout.exists].filter(k => k !== layout.up && k !== layout.down && !layout.guardians?.has(k) && !layout.hordes?.has(k)
    && layout.spanCells?.get(k)?.role !== 'gorge' && open(k))
    .map(key => ({ key, score: (distance.get(key) || 0) * 2 + R() - (layout.areaCells?.has(key) ? 100 : 0) }));
  candidates.sort((a, b) => b.score - a.score);
  // One major destination, plus modest discoveries. Exceptional loot is not guaranteed.
  const tiers = [R() < 0.2 ? 'exceptional' : 'rare', 'uncommon', 'basic', 'basic'];
  // The major one is built around one of the theme's landmarks: the next depth of the same theme
  // gets the next one, so a theme's landmarks take turns
  const marks = landmarksOf(biome);
  const landmark = marks.length ? marks[(layout.depth + seed % marks.length) % marks.length].name : null;
  for (const [i, prestige] of tiers.entries()) {
    const c = candidates[i];
    if (!c) break;
    plans.set(c.key, [siteIntent(seed, c.key, biome, prestige, 0, i ? null : landmark)]);
    roles.set(c.key, i ? 'discovery' : 'landmark');
  }
  return { plans, roles };
}
