// Depth (0 at the surface, MAX_DEPTH at the bottom) and its theme. Plain data, so the world
// worker can use it too. depthOf(cube key) = -Y.
// Every theme names the depths it may appear at (themes/index.js `depths`). Every world picks one
// theme per depth from its seed: worldThemes(seed) -> [{ at, theme }], the stretches of depths
// that share a theme (each starts at `at` and lasts until the next). The world carries its picks
// (world.layout.themes, each depth's layout.theme) and stamps each spec and map with its theme's
// id (`biome`, the theme's prop set; read back with themeOf).
import { THEMES, TOWN } from './index.js';
import { parse } from '../world/coords.js';
import { hash32, mulberry32 } from '../core/util.js';

export const MAX_DEPTH = 20;
// house interiors (keys off the grid, world/town.js interiorKey) are at the surface
export const depthOf = k => k.includes(',') ? -parse(k)[1] : 0;

const BY_ID = new Map(THEMES.map(t => [t.props, t]));
export const themeById = id => BY_ID.get(id) ?? null;

// the themes that may appear at depth d (the town's depth: the town's theme only)
export const themesAt = d => d === 0 ? [TOWN] : THEMES.filter(t => d >= t.depths[0] && d <= t.depths[1]);

// how likely a depth keeps the theme of the depth above (if it may appear there), so themes
// come in stretches of a few depths; otherwise it picks again, each theme equally likely
export const STICK = 0.55;

// the world's theme for every depth, from its seed alone, as stretches. Each depth has its own
// random stream. The town's meadows (depth 0) do not carry over. force: theme ids that win
// every depth they may appear at (dev, tests: ?theme=clouds,forge)
const picked = new Map();
export function worldThemes(seed, force = []) {
  const k = seed + '|' + force.join(',');
  if (picked.has(k)) return picked.get(k);
  const out = [];
  let prev = null;
  for (let d = 0; d <= MAX_DEPTH; d++) {
    const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x7e3a5b1d) ^ 0x7e3e5));
    const options = themesAt(d), stick = R() < STICK, roll = options[Math.floor(R() * options.length)];
    const theme = options.find(t => force.includes(t.props))
      || (d > 1 && stick && options.includes(prev) ? prev : roll);
    if (theme !== prev) out.push({ at: d, theme });
    prev = theme;
  }
  picked.set(k, out);
  return out;
}

const stretchOf = (depth, themes) => {
  let i = 0;
  while (i + 1 < themes.length && depth >= themes[i + 1].at) i++;
  return i;
};

// the theme of a depth in a world's picks (worldThemes)
export const themeAt = (depth, themes) => themes[stretchOf(depth, themes)].theme;
// the theme of a spec or generated map (its stamp)
export function themeOf(map) {
  const theme = BY_ID.get(map.biome);
  if (!theme) throw new Error(`no theme for map ${map.key} (biome ${map.biome})`);
  return theme;
}

// the themes around a (fractional) depth in a world's picks and how far we are between their
// starts: light is blended between them so every step down gets a little darker (a theme that
// lasts several depths is one stretch)
export function lightAt(depth, themes) {
  const i = stretchOf(depth, themes), a = themes[i], b = themes[i + 1] || a;
  const t = b === a ? 0 : Math.min(1, Math.max(0, (depth - a.at) / (b.at - a.at)));
  return { a: a.theme.light, b: b.theme.light, t };
}

// how bright the character's own light is at a (fractional) depth: 0 under the sky, about a half
// in the sunlit caves, 1 in the dark deep (the themes' `lamp`, blended like the rest of the light)
export function lampAt(depth, themes) {
  const { a, b, t } = lightAt(depth, themes);
  return (a.lamp ?? 0) + ((b.lamp ?? 0) - (a.lamp ?? 0)) * t;
}
