// What structures are made of at each theme (keyed by the theme's prop set): the stone and wood
// of stairs, landings, bridges, fences and ladders, the rope of rope bridges, the iron of iron
// bridges, and how often each bridge style is picked. The styles themselves, and where each may
// go, are in BRIDGE_STYLES below.
export const BUILDS = {
  meadow: { stone: '#cfc5b2', wood: '#a0703f', rope: '#cdb88e', iron: '#5a5c64', bridges: { stone: 1, plank: 1, rope: 2 } },
  peaks: { stone: '#b8bcc2', wood: '#6e5236', rope: '#d8d0c0', iron: '#5a5c64', bridges: { stone: 2, rope: 2, plank: 1 } },
  badlands: { stone: '#c9a070', wood: '#8a6a48', rope: '#c8a878', iron: '#5a5c64', bridges: { plank: 2, stone: 1, rope: 1 } },
  roots: { stone: '#8a7a66', wood: '#5e4630', rope: '#a89070', iron: '#4a4c54', bridges: { plank: 2, stone: 1, rope: 1 } },
  frozen: { stone: '#a8c0cc', wood: '#7a8a96', rope: '#d0dce4', iron: '#5a6470', bridges: { stone: 2, plank: 1 } },
  swamp: { stone: '#6e7a5a', wood: '#5a5a36', rope: '#8a8a5a', iron: '#4a4c44', bridges: { plank: 2, rope: 2 } },
  nests: { stone: '#8a8490', wood: '#4e4448', rope: '#e8e4ea', iron: '#4a4650', bridges: { rope: 3, plank: 1 } },
  mines: { stone: '#7a7a86', wood: '#8a6a44', rope: '#b0a080', iron: '#5a5c64', bridges: { plank: 2, iron: 2, stone: 1 } },
  ruins: { stone: '#c8b48a', wood: '#7a6040', rope: '#b8a070', iron: '#5a5048', bridges: { stone: 3, plank: 1 } },
  volcanic: { stone: '#4a4040', wood: '#3a2c24', rope: '#7a6a5a', iron: '#3c3a3e', bridges: { iron: 3, stone: 1 } },
  abyss: { stone: '#3a3644', wood: '#2a2430', rope: '#5a5060', iron: '#2e2c34', bridges: { iron: 2, stone: 2 } },
  // the alternative themes (docs/assets/themes.md)
  clouds: { stone: '#dfe2ec', wood: '#c4ac8c', rope: '#f0e8d8', iron: '#8a90a8', bridges: { rope: 3, plank: 1, stone: 1 } },
  lagoon: { stone: '#d4c49c', wood: '#94704a', rope: '#d8c090', iron: '#5a5c64', bridges: { plank: 2, rope: 2 } },
  karst: { stone: '#b8b6aa', wood: '#9a4a2a', rope: '#c8b070', iron: '#5a5c64', bridges: { stone: 3, plank: 1, rope: 1 } },
  highlands: { stone: '#d8d0c0', wood: '#7a3a2a', rope: '#e0c870', iron: '#5a5c64', bridges: { rope: 3, stone: 1, plank: 1 } },
  saltflats: { stone: '#e4dcd0', wood: '#9a8068', rope: '#d0c0a0', iron: '#6a6460', bridges: { plank: 2, stone: 2 } },
  canyon: { stone: '#d8a47a', wood: '#7a5638', rope: '#c8a878', iron: '#5a5c64', bridges: { rope: 2, plank: 2, stone: 1 } },
  grotto: { stone: '#8aaaa8', wood: '#6a7468', rope: '#a8c0b0', iron: '#4a5a60', bridges: { plank: 2, rope: 1, stone: 1 } },
  hive: { stone: '#d0a048', wood: '#7a5020', rope: '#e8c870', iron: '#5a4a30', bridges: { plank: 2, rope: 1, stone: 1 } },
  ossuary: { stone: '#c8bca4', wood: '#4a3a2e', rope: '#8a7a68', iron: '#3a3836', bridges: { stone: 3, plank: 1 } },
  forge: { stone: '#5a5450', wood: '#5a4030', rope: '#8a7a60', iron: '#4a4a52', bridges: { iron: 3, stone: 1 } },
  cenote: { stone: '#b8a888', wood: '#6a5030', rope: '#8a9a50', iron: '#4a4a40', bridges: { rope: 2, stone: 2, plank: 1 } },
};

export const buildOf = theme => BUILDS[theme.props] || BUILDS.meadow;

// The bridge styles (drawn by render/bridges.js) and where each may go:
//   surface   what it sounds like underfoot (core/footing.js)
//   sag(k, span)  how far a deck of k cells hangs in the middle (units); span: a gorge span's
//             long bridge (cubegen/span.js keeps the valley floor clear of it)
//   supports  what holds it up (cubegen/shape.js): 'piers' between arches, 'legs' (timber legs
//             under long ordinary bridges, tall trestles under a span) or 'none' (it hangs)
//   ground    only over dry ground close below, with nothing else passing underneath
//   sky       may cross the open sky (a sky span: nothing to stand on below)
const sagBy = (route, routeMax, span, spanMax) => (k, isSpan) =>
  isSpan ? Math.min(spanMax, span * k) : k >= 2 ? Math.min(routeMax, route * k) : 0;
const flat = () => 0;
export const BRIDGE_STYLES = {
  stone: { surface: 'stone', sag: flat, supports: 'piers', ground: true, sky: false },
  plank: { surface: 'wood', sag: sagBy(0.05, 0.22, 0.03, 0.3), supports: 'legs', ground: false, sky: true },
  rope: { surface: 'rope', sag: sagBy(0.09, 0.4, 0.07, 0.9), supports: 'none', ground: false, sky: true },
  iron: { surface: 'iron', sag: flat, supports: 'legs', ground: false, sky: true },
};

// may `style` carry this bridge? where: { solid (dry ground close below, nothing underneath),
// span (a gorge span's long bridge), sky (over the open sky) }
export function bridgeFits(style, where) {
  const s = BRIDGE_STYLES[style];
  if (!s) return false;
  if (s.ground && (where.span ? where.sky : !where.solid)) return false;
  if (where.sky && !s.sky) return false;
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
