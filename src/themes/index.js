// What each depth looks like. Every theme names the depths it may appear at (`depths`: [first,
// last]); each world picks one theme per depth from its seed (themes/depth.js worldThemes), so two
// worlds can have cloud islands or meadows under the town, and one may go from the meadows to the
// lagoons halfway down. Palettes, generator settings and the shape of the layout are per theme;
// the lighting (`light`) is blended between the starts of the stretches of depths sharing a
// theme, so every step down is a little darker.
// The light comes in three bands of depths: light on the surface and in the canyons (0-6),
// medium in the sunlit caves (7-13: light falls in through cracks, glowing things), dark down
// in the deep (14-20, only local lights). A theme's id is its prop set (`props`). The themes
// that may appear at a depth agree on `cave`.
//   depths: the first and last depth the theme may appear at (the town's depth, 0, is always TOWN's)
//   top / side: colour stops by height in levels (grass tops, cliff strata)
//   fluids: weights [water, lava, acid] for pools and falls; river: fluid of the rivers
//   soft: the colour of a plunge's soft landing (world/heights.js: hay, sand, snow, moss, web, ash)
//   heights: overrides for the big height pieces (world/heights.js heightsOf)
//   tiles: weight multipliers for the WFC kinds; cave: below the ground (no sun, no sky)
//   walls: rock walls along the faces like a cave's, under the open sky (the canyons)
//   void: how much of a cube may be open to the depth below; relief: how tall highlands get
//   arche: weights of the cube archetypes (cubegen/archetypes.js); props: prop set (assets/props.glb,
//   clutter.glb, themes.glb), propDensity: chance of a prop per floor (0.32)
//   light: sky [top, bottom, haze?, tint?] (backdrop, see render/sky.js), stars 0..1, hemi [sky, ground, intensity], sun [colour, intensity], fog 0..1,
//     lamp 0..1: how bright the character's own light is (0 under the sky, 1 in the dark deep)
//   music: the song (music/<name>.scrim) that plays here; the town and the core have their own (SONGS)
//   spans: gorge spans (world/spans.js), or null: the chance of any on a depth, at most `max`,
//   the chance of one on the route where it fits, of a lonely island branch and of a span over
//   the sky (no valley); deck: the highest deck level (22; lower under a cave's rock walls)
import { WATER } from '../core/constants.js';
import { CAVE_THEMES } from './caves.js';

const T = (name, o) => ({ name, tiles: {}, cave: false, spans: null, ...o });

const MEADOW = T('Meadow islands', {
  music: 'overworld',
  props: 'meadow', propDensity: 0.15,
  depths: [0, 2], spans: { chance: 0.9, max: 2, route: 0.8, island: 0.6, sky: 0.5 },
  void: 0.5, relief: 0.5,
  arche: { plain: 3, archipelago: 3, spire: 1, mesa: 1, chasm: 1 },
  top: [[0, '#3b6532'], [4, '#4c8a3c'], [8, '#76ad50'], [12, '#a3b26a'], [16, '#b7a888'], [20, '#d9d3c5']],
  side: [[0, '#4e382a'], [6, '#7a5638'], [11, '#7a6d62'], [20, '#9a948c']],
  soft: '#d8c070', lip: '#3f6b2e', under: '#3a2f28', bed: ['#2a2a31', '#23232a'], fluids: [0.85, 0.05, 0.1], river: WATER,
  light: { sky: ['#163640', '#081218', '#4a6966', '#3b3656'], stars: 1, hemi: ['#dfeaff', '#3a3020', 1.1], sun: ['#fff1dd', 2.4], fog: 0 },
});
// cloud kingdom: puffy islands over a lot of open sky
const CLOUDS = T('Cloud kingdom', {
  music: 'overworld',
  props: 'clouds', propDensity: 0.18,
  depths: [1, 2], spans: { chance: 0.9, max: 2, route: 0.8, island: 0.6, sky: 0.7 },
  void: 0.62, relief: 0.6,
  arche: { archipelago: 4, plain: 2, spire: 1, mesa: 1 },
  top: [[0, '#b9bfd4'], [4, '#cfd4e4'], [8, '#e0e3ee'], [12, '#ebe6ef'], [16, '#f1edf3'], [20, '#f6f6fa']],
  side: [[0, '#7e84a0'], [6, '#959bb6'], [12, '#acb1c8'], [20, '#c6cadb']],
  soft: '#f6f8fe', lip: '#e2e6f2', under: '#6e7390', bed: ['#2c2e3a', '#25262f'], fluids: [0.95, 0, 0.05], river: WATER,
  tiles: { highland: 1.2, lake: 0.6, river: 0.7, gorge: 0.7 },
  light: { sky: ['#202c58', '#0a0e22', '#646a98', '#56487a'], stars: 1, hemi: ['#eef0ff', '#585a78', 1.2], sun: ['#fff6ee', 2.4], fog: 0.05 },
});
// lagoon isles: sand, palms and a lot of water between low islands
const LAGOON = T('Lagoon isles', {
  music: 'overworld',
  props: 'lagoon', propDensity: 0.16,
  depths: [1, 2], spans: { chance: 0.9, max: 2, route: 0.8, island: 0.7, sky: 0.3 },
  void: 0.3, relief: 0.35,
  arche: { archipelago: 4, crater: 2, plain: 2, mesa: 1 },
  top: [[0, '#d2bd86'], [3, '#e0cf9c'], [6, '#82a852'], [10, '#5e9440'], [16, '#8a9a6a'], [20, '#c8c0a8']],
  side: [[0, '#94744e'], [6, '#b29066'], [12, '#8a7a66'], [20, '#a89a88']],
  soft: '#ecdcae', lip: '#6a9a3e', under: '#4a3a2a', bed: ['#2a3a3e', '#233236'], fluids: [1, 0, 0], river: WATER,
  tiles: { lake: 3, river: 1.5, highland: 0.5, gorge: 0.6 },
  light: { sky: ['#123c48', '#061a20', '#3a7470', '#2a4a66'], stars: 1, hemi: ['#e2f4ff', '#3a3a24', 1.15], sun: ['#fff0d8', 2.4], fog: 0 },
});
// karst and rice terraces: limestone needles, flooded steps, bamboo, mist
const KARST = T('Karst terraces', {
  music: 'overworld',
  props: 'karst', propDensity: 0.18,
  depths: [1, 2], spans: { chance: 0.9, max: 2, route: 0.8, island: 0.6, sky: 0.5 },
  void: 0.4, relief: 0.9,
  arche: { spire: 4, mesa: 2, plain: 2, archipelago: 1 },
  top: [[0, '#5a8a3a'], [4, '#6ea444'], [8, '#86b858'], [12, '#7a9a5a'], [16, '#a8b09a'], [20, '#d0d2c8']],
  side: [[0, '#6a6a62'], [6, '#8a8a80'], [12, '#a6a59a'], [20, '#c4c2b6']],
  soft: '#86b858', lip: '#4e8a34', under: '#4a4a42', bed: ['#2a2c30', '#232529'], fluids: [0.95, 0, 0.05], river: WATER,
  tiles: { highland: 1.5, slope: 1.3, lake: 1.5 },
  light: { sky: ['#1a3a3a', '#081414', '#5a7a6a', '#3a4a56'], stars: 1, hemi: ['#e4f2e8', '#34382a', 1.1], sun: ['#fff4e0', 2.3], fog: 0.1 },
});
const PEAKS = T('Snowy peaks', {
  music: 'peaks',
  props: 'peaks',
  depths: [3, 3], spans: { chance: 0.8, max: 2, route: 0.8, island: 0.5, sky: 0.5 },
  void: 0.42, relief: 1.0,
  arche: { spire: 3, chasm: 2, mesa: 2, plain: 1 },
  top: [[0, '#8fa4ab'], [6, '#c3d3d8'], [12, '#e6eef1'], [20, '#ffffff']],
  side: [[0, '#4f5862'], [8, '#6c7781'], [14, '#8a949d'], [22, '#b4bcc3']],
  soft: '#f4f8fc', lip: '#d6e2e6', under: '#454b53', bed: ['#2c3038', '#25282f'], fluids: [0.9, 0, 0.1], river: WATER,
  tiles: { highland: 2, slope: 1.5, river: 0.6 },
  light: { sky: ['#1c2e46', '#0a0f18', '#4c5d74', '#3d3a5e'], stars: 1, hemi: ['#e6f0ff', '#565c6c', 1.15], sun: ['#f4f8ff', 2.2], fog: 0.15 },
});
// prayer highlands: windy grassland and lakes under the snow line, chortens and prayer flags
const HIGHLANDS = T('Prayer highlands', {
  music: 'peaks',
  props: 'highlands',
  depths: [3, 3], spans: { chance: 0.7, max: 2, route: 0.8, island: 0.5, sky: 0.4 },
  void: 0.35, relief: 0.85,
  arche: { mesa: 3, plain: 2, spire: 1, chasm: 1 },
  top: [[0, '#7a8a4a'], [5, '#9a9a58'], [9, '#b4a868'], [13, '#a89a80'], [17, '#d8dce0'], [20, '#ffffff']],
  side: [[0, '#5a4a3e'], [8, '#7a6650'], [14, '#958672'], [22, '#bab0a2']],
  soft: '#f0f2f4', lip: '#8a9a4a', under: '#4a4038', bed: ['#2c2c34', '#25252c'], fluids: [1, 0, 0], river: WATER,
  tiles: { highland: 2, slope: 1.5, lake: 1.3, river: 0.8 },
  light: { sky: ['#10285a', '#060c20', '#3a5a8a', '#3a3a6a'], stars: 1, hemi: ['#e8f0ff', '#4a4a3a', 1.15], sun: ['#fff6e6', 2.3], fog: 0.05 },
});
const BADLANDS = T('Badlands', {
  music: 'badlands',
  props: 'badlands',
  depths: [4, 4], spans: { chance: 0.7, max: 2, route: 0.8, island: 0.4, sky: 0 },
  void: 0.12, relief: 0.8,
  arche: { chasm: 3, mesa: 3, spire: 1, plain: 1 },
  top: [[0, '#9a6a3c'], [6, '#b9864f'], [12, '#d3a466'], [20, '#e8cf9a']],
  side: [[0, '#5e3520'], [8, '#80502f'], [14, '#a06f46'], [22, '#bf9468']],
  soft: '#dcb87c', lip: '#b0824e', under: '#432818', bed: ['#2a2220', '#231c1a'], fluids: [0.5, 0.3, 0.2], river: WATER,
  tiles: { gorge: 3, highland: 1.5, meadow: 0.7, river: 0.8 },
  light: { sky: ['#40282e', '#110a0c', '#6a4a44', '#4a2a42'], stars: 0.6, hemi: ['#f0b890', '#3a2418', 0.8], sun: ['#ffb37a', 1.6], fog: 0.25 },
});
// salt flats: white crust, brine pools, pink halite and flamingos; flat and wide
const SALTFLATS = T('Salt flats', {
  music: 'badlands',
  props: 'saltflats',
  depths: [4, 4], spans: { chance: 0.4, max: 1, route: 0.8, island: 0.4, sky: 0 },
  void: 0.08, relief: 0.4,
  arche: { plain: 3, crater: 2, mesa: 2, archipelago: 1 },
  top: [[0, '#cfc6bd'], [4, '#ddd6cd'], [8, '#e6dfd8'], [12, '#e2d0cb'], [20, '#ece4e0']],
  side: [[0, '#8a6a5a'], [8, '#a8887a'], [14, '#c4a89a'], [22, '#dccabe']],
  soft: '#f4f0e8', lip: '#e4dcd2', under: '#5a4038', bed: ['#2a2224', '#231c1e'], fluids: [0.85, 0.05, 0.1], river: WATER,
  tiles: { lake: 2, meadow: 1.5, highland: 0.6, gorge: 0.5 },
  light: { sky: ['#40283a', '#120a12', '#7a5266', '#5a3a5a'], stars: 0.6, hemi: ['#ffe0e4', '#4a3a38', 0.8], sun: ['#ffc8a8', 1.6], fog: 0.25 },
});
// the deep canyon: the last of the sky, far down between sheer sandstone walls (red, salmon and
// cream strata), a green river floor with cottonwoods, hanging gardens at the springs
const CANYON = T('Deep canyon', {
  music: 'badlands',
  props: 'canyon', propDensity: 0.3,
  depths: [5, 6], spans: { chance: 0.85, max: 2, route: 0.8, island: 0.5, sky: 0, deck: 15 },
  void: 0.1, relief: 1.1, walls: true, heights: { tableland: 0.8, tunnel: 0.45 },
  arche: { chasm: 3, mesa: 2, spire: 2, plain: 1 },
  top: [[0, '#5e7a3a'], [4, '#7a8a46'], [7, '#c27a48'], [11, '#d49466'], [15, '#e2b48a'], [20, '#f0dcc0']],
  side: [[0, '#6e2e1c'], [5, '#9a4426'], [9, '#b8603a'], [13, '#c8825a'], [17, '#d8a880'], [22, '#e8cfae']],
  soft: '#e8c498', lip: '#6a8a3a', under: '#4a2418', bed: ['#2a2420', '#231e1a'], fluids: [0.9, 0.05, 0.05], river: WATER,
  tiles: { gorge: 3, river: 2, highland: 1.3, slope: 1.5, lake: 0.5 },
  light: { sky: ['#1e3e6e', '#0a1630', '#8aa0c0', '#c0805a'], stars: 0.4, hemi: ['#ffe6cc', '#5a3020', 1.0], sun: ['#ffdcb0', 2.1], fog: 0.1 },
});

// every theme, the town's first
export const THEMES = [MEADOW, CLOUDS, LAGOON, KARST, PEAKS, HIGHLANDS, BADLANDS, SALTFLATS, CANYON, ...CAVE_THEMES];
// the town and its road (depth 0)
export const TOWN = MEADOW;

// every song the game plays: the town (and the merchant camp), one per theme, and the core (depth 20)
export const SONGS = ['town', ...new Set(THEMES.map(t => t.music)), 'core'];
