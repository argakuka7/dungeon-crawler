// What structures are made of at each theme (keyed by the theme's prop set): the stone and wood
// of stairs, landings, bridges, fences and ladders, the rope of rope bridges, the iron of iron
// and chain bridges, the ice of ice bridges (ICE below where a theme names none), and how often
// each bridge style is picked. The styles themselves, and where each may
// go, are in BRIDGE_STYLES below.
export const BUILDS = {
  meadow: { stone: '#cfc5b2', wood: '#a0703f', rope: '#cdb88e', iron: '#5a5c64', bridges: { stone: 1, plank: 1, rope: 1, log: 2 } },
  peaks: { stone: '#b8bcc2', wood: '#6e5236', rope: '#d8d0c0', iron: '#5a5c64', ice: '#b8deee', bridges: { stone: 2, rope: 1, flags: 1, chain: 1, ice: 1 } },
  badlands: { stone: '#c9a070', wood: '#8a6a48', rope: '#c8a878', iron: '#5a5c64', bridges: { plank: 2, rockarch: 2, stone: 1, rope: 1 } },
  roots: { stone: '#8a7a66', wood: '#5e4630', rope: '#a89070', iron: '#4a4c54', bridges: { log: 3, plank: 1, rope: 1, stone: 1 } },
  frozen: { stone: '#a8c0cc', wood: '#7a8a96', rope: '#d0dce4', iron: '#5a6470', ice: '#a8d6ea', bridges: { ice: 3, stone: 1, plank: 1 } },
  swamp: { stone: '#6e7a5a', wood: '#5a5a36', rope: '#8a8a5a', iron: '#4a4c44', bridges: { log: 2, plank: 2, rope: 1 } },
  nests: { stone: '#8a8490', wood: '#4e4448', rope: '#e8e4ea', iron: '#4a4650', bridges: { rope: 3, plank: 1 } },
  mines: { stone: '#7a7a86', wood: '#8a6a44', rope: '#b0a080', iron: '#5a5c64', bridges: { plank: 2, iron: 2, chain: 1, stone: 1 } },
  ruins: { stone: '#c8b48a', wood: '#7a6040', rope: '#b8a070', iron: '#5a5048', bridges: { stone: 3, plank: 1 } },
  volcanic: { stone: '#4a4040', wood: '#3a2c24', rope: '#7a6a5a', iron: '#3c3a3e', bridges: { iron: 2, rockarch: 2, chain: 1, stone: 1 } },
  abyss: { stone: '#3a3644', wood: '#2a2430', rope: '#5a5060', iron: '#2e2c34', bridges: { iron: 1, chain: 2, stone: 2 } },
  // the alternative themes (docs/assets/themes.md)
  clouds: { stone: '#dfe2ec', wood: '#c4ac8c', rope: '#f0e8d8', iron: '#8a90a8', bridges: { rope: 3, chain: 1, stone: 1 } },
  lagoon: { stone: '#d4c49c', wood: '#94704a', rope: '#d8c090', iron: '#5a5c64', bridges: { plank: 2, rope: 2, log: 1 } },
  karst: { stone: '#b8b6aa', wood: '#9a4a2a', rope: '#c8b070', iron: '#5a5c64', bridges: { stone: 2, rockarch: 2, plank: 1, rope: 1 } },
  highlands: { stone: '#d8d0c0', wood: '#7a3a2a', rope: '#e0c870', iron: '#5a5c64', bridges: { flags: 3, rope: 1, stone: 1, log: 1 } },
  saltflats: { stone: '#e4dcd0', wood: '#9a8068', rope: '#d0c0a0', iron: '#6a6460', bridges: { plank: 2, stone: 1, rockarch: 1 } },
  canyon: { stone: '#d8a47a', wood: '#7a5638', rope: '#c8a878', iron: '#5a5c64', bridges: { rope: 2, plank: 1, rockarch: 2 } },
  grotto: { stone: '#8aaaa8', wood: '#6a7468', rope: '#a8c0b0', iron: '#4a5a60', bridges: { plank: 1, rope: 1, rockarch: 2, log: 1 } },
  hive: { stone: '#d0a048', wood: '#7a5020', rope: '#e8c870', iron: '#5a4a30', bridges: { plank: 2, rope: 1, stone: 1 } },
  ossuary: { stone: '#c8bca4', wood: '#4a3a2e', rope: '#8a7a68', iron: '#3a3836', bridges: { stone: 3, plank: 1 } },
  forge: { stone: '#5a5450', wood: '#5a4030', rope: '#8a7a60', iron: '#4a4a52', bridges: { iron: 2, chain: 2, stone: 1 } },
  cenote: { stone: '#b8a888', wood: '#6a5030', rope: '#8a9a50', iron: '#4a4a40', bridges: { rope: 2, stone: 1, log: 1, rockarch: 1 } },
};

export const buildOf = theme => BUILDS[theme.props] || BUILDS.meadow;
export const ICE = '#b4dcee';

// The bridge styles (drawn by render/bridges.js) and where each may go:
//   surface   what it sounds like underfoot (core/footing.js)
//   sag(k, span)  how far a deck of k cells hangs in the middle (units); span: a gorge span's
//             long bridge (cubegen/span.js keeps the valley floor clear of it)
//   supports  what holds it up (cubegen/shape.js): 'piers' between arches, 'legs' (timber legs
//             under long ordinary bridges, tall trestles under a span) or 'none' (it hangs, or
//             is held up by what it is: a log, a slab of ice, a rock arch)
//   ground    only over dry ground close below, with nothing else passing underneath
//   sky       may cross the open sky (a sky span: nothing to stand on below)
//   span      may carry a gorge span's long bridge (12 cells); level: only a level one
//   k         [shortest, longest] ordinary bridge (cells; they are 1-7)
//   towers    how high its towers or poles stand over both ends (units): only where nothing
//             is overhead (a span's cubes have one layer, nothing is)
const sagBy = (route, routeMax, span, spanMax) => (k, isSpan) =>
  isSpan ? Math.min(spanMax, span * k) : k >= 2 ? Math.min(routeMax, route * k) : 0;
const flat = () => 0;
const ANY = { supports: 'none', ground: false, sky: true, span: true, level: false, k: [1, 7], towers: 0 };
export const BRIDGE_STYLES = {
  stone: { ...ANY, surface: 'stone', sag: flat, supports: 'piers', ground: true, sky: false },
  plank: { ...ANY, surface: 'wood', sag: sagBy(0.05, 0.22, 0.03, 0.3), supports: 'legs' },
  rope: { ...ANY, surface: 'rope', sag: sagBy(0.09, 0.4, 0.07, 0.9) },
  iron: { ...ANY, surface: 'iron', sag: flat, supports: 'legs' },
  // a few logs side by side: short ones only, never a span
  log: { ...ANY, surface: 'wood', sag: flat, span: false, k: [1, 4] },
  // a plank deck hung from chains between iron towers
  chain: { ...ANY, surface: 'wood', sag: sagBy(0.07, 0.3, 0.04, 0.5), k: [3, 7], towers: 1.45 },
  // a slab of ice with icicles under it
  ice: { ...ANY, surface: 'ice', sag: flat },
  // a natural rock arch, like the stone arches only over ground; on a span only a level one
  rockarch: { ...ANY, surface: 'stone', sag: flat, ground: true, sky: false, level: true },
  // a rope bridge with strings of prayer flags between tall poles
  flags: { ...ANY, surface: 'rope', sag: sagBy(0.09, 0.4, 0.07, 0.9), towers: 1.3 },
};

// may `style` carry this bridge? where: { solid (dry ground close below, nothing underneath), k
// (cells), room (units free over both ends), or for a gorge span's bridge: span, sky, level }
export function bridgeFits(style, where) {
  const s = BRIDGE_STYLES[style];
  if (!s) return false;
  if (where.span) return s.span && !(s.level && !where.level) && !(where.sky && (!s.sky || s.ground));
  if (s.ground && !where.solid) return false;
  if (where.k !== undefined && (where.k < s.k[0] || where.k > s.k[1])) return false;
  if (s.towers && !(where.room >= s.towers + 0.25)) return false;
  return true;
}

// one of `weights` ({ style: weight }) that fits, by weight, for a roll r in [0, 1); 'plank' if
// none does (it goes anywhere)
export function pickBridge(weights, where, r) {
  const w = Object.entries(weights).filter(([s]) => bridgeFits(s, where));
  r *= w.reduce((a, [, v]) => a + v, 0);
  for (const [s, v] of w) if ((r -= v) < 0) return s;
  return 'plank';
}

// the bridge weights of a theme; force: one style everywhere (dev: ?bridge=chain), where it fits
export const bridgesOf = (theme, force) => force ? { [force]: 1 } : buildOf(theme).bridges;
