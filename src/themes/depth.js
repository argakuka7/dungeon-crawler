// Depth (0 at the surface, MAX_DEPTH at the bottom) and its theme. Plain data, so the world
// worker can use it too. depthOf(cube key) = -Y.
// Every world picks one theme per slot (themes/index.js SLOTS) from its seed: worldThemes(seed)
// -> [{ at, theme }], one per slot. The world carries its picks (world.layout.themes) and stamps
// each spec and map with its theme's id (`biome`, the theme's prop set; read back with themeOf). Without picks themeAt and
// lightAt use the classic world (the first theme of every slot).
import { SLOTS, THEMES } from './index.js';
import { parse } from '../world/coords.js';
import { hash32, mulberry32 } from '../core/util.js';

export const MAX_DEPTH = 20;
// house interiors (keys off the grid, world/town.js interiorKey) are at the surface
export const depthOf = k => k.includes(',') ? -parse(k)[1] : 0;

const BY_ID = new Map(THEMES.map(t => [t.props, t]));
export const themeById = id => BY_ID.get(id) ?? null;

export const CLASSIC = SLOTS.map(s => ({ at: s.at, theme: s.themes[0] }));

// the world's theme for every slot, from its seed alone. force: theme ids that win their slot (dev,
// tests: ?theme=clouds,forge)
const picked = new Map();
export function worldThemes(seed, force = []) {
  const k = seed + '|' + force.join(',');
  if (!picked.has(k)) picked.set(k, SLOTS.map((s, i) => {
    const R = mulberry32(hash32(seed ^ Math.imul(i + 1, 0x7e3a5b1d) ^ 0x7e3e5));
    const theme = s.themes.find(t => force.includes(t.props)) || s.themes[Math.floor(R() * s.themes.length)];
    return { at: s.at, theme };
  }));
  return picked.get(k);
}

const slotOf = (depth, list) => {
  let i = 0;
  while (i + 1 < list.length && depth >= list[i + 1].at) i++;
  return i;
};

export const themeAt = (depth, themes = CLASSIC) => themes[slotOf(depth, themes)].theme;
// the theme of a spec or generated map (its stamp; maps without one go by their depth)
export const themeOf = map => themeById(map?.biome) ?? themeAt(map?.depth ?? 0);
// what a depth's slot says about the layout (gorge spans): the same whichever theme is picked
export const spansAt = depth => SLOTS[slotOf(depth, SLOTS)].spans ?? null;

// the themes around a (fractional) depth and how far we are between their starts: light is
// blended between them so every step down gets a little darker (a theme that goes on into the
// next slot, like the meadows under the town, is one stretch)
const stretches = new WeakMap();
export function lightAt(depth, themes = CLASSIC) {
  if (!stretches.has(themes)) stretches.set(themes, themes.filter((s, i) => !i || s.theme !== themes[i - 1].theme));
  const list = stretches.get(themes), i = slotOf(depth, list);
  const a = list[i], b = list[i + 1] || a;
  const t = b === a ? 0 : Math.min(1, Math.max(0, (depth - a.at) / (b.at - a.at)));
  return { a: a.theme.light, b: b.theme.light, t };
}
