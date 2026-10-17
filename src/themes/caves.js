// Themes below the ground (depth 5 and deeper): caves without sun or sky, and their slots. See
// index.js.
import { WATER, LAVA, ACID } from '../core/constants.js';

const T = (name, o) => ({ name, tiles: {}, cave: true, ...o });

const ROOTS = T('Root caves', {
  music: 'roots',
  props: 'roots',
  void: 0.08, relief: 0.5,
  arche: { plain: 2, sinkhole: 2, chasm: 1, crater: 1 },
  top: [[0, '#4a3e2e'], [6, '#5e4c35'], [12, '#705c40'], [20, '#82704e']],
  side: [[0, '#352a20'], [8, '#46352a'], [14, '#574332'], [22, '#68523c']],
  lip: '#4a5a2a', under: '#1e1712', bed: ['#1a1614', '#151210'], fluids: [0.8, 0.05, 0.15], river: WATER,
  tiles: { highland: 1.5, gorge: 2 },
  light: { sky: ['#0e0d0f', '#050506'], hemi: ['#8a8f9a', '#2a2014', 0.8], sun: ['#9aa4c0', 0.85], fog: 0.3 },
});
const FROZEN = T('Frozen caves', {
  music: 'frozen',
  props: 'frozen',
  void: 0.08, relief: 0.6,
  arche: { crater: 2, sinkhole: 2, plain: 2 },
  top: [[0, '#5d7f93'], [6, '#82a6b8'], [12, '#aacbd7'], [20, '#d8ecf2']],
  side: [[0, '#1f2d3a'], [8, '#2b3f50'], [14, '#395166'], [22, '#4b677d']],
  lip: '#a8d0e0', under: '#131b23', bed: ['#161b22', '#11151b'], fluids: [0.9, 0, 0.1], river: WATER,
  tiles: { lake: 2 },
  light: { sky: ['#06090e', '#020305'], hemi: ['#6a8fb0', '#101820', 0.72], sun: ['#8fb8ff', 0.75], fog: 0.38 },
});
const SWAMP = T('Fungal swamp', {
  music: 'swamp',
  props: 'swamp',
  void: 0.06, relief: 0.4,
  arche: { archipelago: 2, plain: 2, crater: 1 },
  top: [[0, '#3a4826'], [6, '#4b5a2e'], [12, '#5c6a36'], [20, '#6d7a3e']],
  side: [[0, '#272d1b'], [8, '#333b22'], [14, '#3f4728'], [22, '#4b532e']],
  lip: '#5a7a30', under: '#14170e', bed: ['#151712', '#11130e'], fluids: [0.45, 0.05, 0.5], river: ACID,
  tiles: { lake: 2, river: 1.5 },
  light: { sky: ['#070a06', '#020302'], hemi: ['#7a8f6a', '#141a0e', 0.66], sun: ['#a0c890', 0.65], fog: 0.45 },
});
const NESTS = T('Spider nests', {
  music: 'nests',
  props: 'nests',
  void: 0.1, relief: 0.7,
  arche: { chasm: 2, sinkhole: 2, spire: 1, plain: 1 },
  top: [[0, '#4a444a'], [6, '#565058'], [12, '#625c66'], [20, '#6e6874']],
  side: [[0, '#28232a'], [8, '#322c34'], [14, '#3c363e'], [22, '#464048']],
  lip: '#605a66', under: '#121014', bed: ['#141216', '#100e12'], fluids: [0.3, 0.1, 0.6], river: ACID,
  tiles: { highland: 1.5, gorge: 1.5 },
  light: { sky: ['#060508', '#020203'], hemi: ['#6a6070', '#100c12', 0.6], sun: ['#b0a0c0', 0.6], fog: 0.5 },
});
const MINES = T('Crystal mines', {
  music: 'mines',
  props: 'mines',
  void: 0.08, relief: 0.8,
  arche: { chasm: 2, mesa: 2, spire: 2, plain: 1 },
  top: [[0, '#4a4a52'], [6, '#5a5a64'], [12, '#6a6a76'], [20, '#7a7a88']],
  side: [[0, '#24242c'], [8, '#30303a'], [14, '#3c3c48'], [22, '#484856']],
  lip: '#7a8aa8', under: '#16161c', bed: ['#141418', '#101014'], fluids: [0.7, 0.2, 0.1], river: WATER,
  tiles: { highland: 2, gorge: 1.5 },
  light: { sky: ['#05060a', '#020203'], hemi: ['#6a7aa0', '#0c0e16', 0.56], sun: ['#90a8ff', 0.55], fog: 0.55 },
});
const RUINS = T('Buried ruins', {
  music: 'ruins',
  props: 'ruins',
  void: 0.1, relief: 0.6,
  arche: { mesa: 3, sinkhole: 1, plain: 2 },
  top: [[0, '#7a6648'], [6, '#8c7650'], [12, '#9e8658'], [20, '#b09660']],
  side: [[0, '#4a3a24'], [8, '#5c482c'], [14, '#6e5634'], [22, '#80643c']],
  lip: '#a08a5e', under: '#2a2014', bed: ['#1a1610', '#15120d'], fluids: [0.2, 0.4, 0.4], river: ACID,
  tiles: { gorge: 2, highland: 1.5 },
  light: { sky: ['#0a0704', '#030201'], hemi: ['#a08a60', '#140e08', 0.52], sun: ['#ffcf8a', 0.5], fog: 0.55 },
});
const VOLCANIC = T('Volcanic depths', {
  music: 'volcanic',
  props: 'volcanic',
  void: 0.12, relief: 0.8,
  arche: { crater: 3, chasm: 2, spire: 1 },
  top: [[0, '#2a2626'], [6, '#363030'], [12, '#423a38'], [20, '#4e4440']],
  side: [[0, '#1a1414'], [8, '#241c1a'], [14, '#2e2420'], [22, '#382c26']],
  lip: '#5a2a1a', under: '#100a08', bed: ['#120c0a', '#0e0908'], fluids: [0.05, 0.85, 0.1], river: LAVA,
  tiles: { gorge: 2, lake: 2 },
  light: { sky: ['#1a0604', '#050101'], hemi: ['#a05030', '#1a0806', 0.5], sun: ['#ff7a40', 0.55], fog: 0.55 },
});
const ABYSS = T('Obsidian abyss', {
  music: 'abyss',
  props: 'abyss',
  void: 0.6, relief: 0.6,
  arche: { archipelago: 4, spire: 2, chasm: 1 },
  top: [[0, '#1a1820'], [6, '#22202a'], [12, '#2a2834'], [20, '#32303e']],
  side: [[0, '#0e0c12'], [8, '#14121a'], [14, '#1a1822'], [22, '#201e2a']],
  lip: '#3a1a3a', under: '#08070a', bed: ['#0a090c', '#070609'], fluids: [0, 1, 0], river: LAVA,
  tiles: { lake: 4, gorge: 1.5 },
  light: { sky: ['#160406', '#040101'], hemi: ['#803040', '#100406', 0.45], sun: ['#ff4a30', 0.5], fog: 0.55 },
});

// the sunken grotto: kelp, clams and glowing jellies around wide pools of sea water
const GROTTO = T('Sunken grotto', {
  music: 'frozen',
  props: 'grotto',
  void: 0.08, relief: 0.5,
  arche: { archipelago: 2, crater: 2, plain: 2, sinkhole: 1 },
  top: [[0, '#3e6260'], [6, '#58807a'], [12, '#8aa49a'], [20, '#c8c0a4']],
  side: [[0, '#1a2e34'], [8, '#244048'], [14, '#30525c'], [22, '#406a74']],
  lip: '#3a8a7a', under: '#0f1c20', bed: ['#121a1e', '#0e1518'], fluids: [1, 0, 0], river: WATER,
  tiles: { lake: 3, river: 1.3 },
  light: { sky: ['#04101a', '#020608'], hemi: ['#5aa0b0', '#0c1a20', 0.74], sun: ['#7ad8ff', 0.75], fog: 0.4 },
});
// the honey hive: wax, comb and candles in warm amber light (honey rivers: water until a honey
// fluid exists, see docs/assets/themes.md)
const HIVE = T('Honey hive', {
  music: 'swamp',
  props: 'hive',
  void: 0.06, relief: 0.5,
  arche: { crater: 2, sinkhole: 2, plain: 2, mesa: 1 },
  top: [[0, '#8a5a1a'], [6, '#a87024'], [12, '#c48a2e'], [20, '#dca848']],
  side: [[0, '#3a2410'], [8, '#4e3016'], [14, '#623e1c'], [22, '#784c22']],
  lip: '#e0a030', under: '#1e1408', bed: ['#1a130a', '#151008'], fluids: [0.85, 0.05, 0.1], river: WATER,
  tiles: { lake: 1.5, highland: 1.3 },
  light: { sky: ['#0e0904', '#040201'], hemi: ['#c0904a', '#1a1006', 0.66], sun: ['#ffc060', 0.65], fog: 0.45 },
});
// the ossuary: candlelit catacombs, bone walls and urns (spooky, but friendly)
const OSSUARY = T('Ossuary', {
  music: 'nests',
  props: 'ossuary',
  void: 0.08, relief: 0.6,
  arche: { mesa: 2, chasm: 2, plain: 2, sinkhole: 1 },
  top: [[0, '#5a544a'], [6, '#6e665a'], [12, '#82786a'], [20, '#968a7a']],
  side: [[0, '#2a2622'], [8, '#34302a'], [14, '#3e3832'], [22, '#48423a']],
  lip: '#8a8070', under: '#141210', bed: ['#151312', '#110f0e'], fluids: [0.4, 0.1, 0.5], river: ACID,
  tiles: { gorge: 1.5, highland: 1.5 },
  light: { sky: ['#08070a', '#020203'], hemi: ['#a08a6a', '#120e0a', 0.6], sun: ['#ffc890', 0.6], fog: 0.5 },
});
// the dwarven forge: pipes, gears and anvils, pools of slag
const FORGE = T('Dwarven forge', {
  music: 'mines',
  props: 'forge',
  void: 0.08, relief: 0.8,
  arche: { mesa: 3, chasm: 2, crater: 1, plain: 1 },
  top: [[0, '#3e3a38'], [6, '#4c4642'], [12, '#5a524c'], [20, '#6a6058']],
  side: [[0, '#1e1a1a'], [8, '#2a2422'], [14, '#36302c'], [22, '#423a34']],
  lip: '#8a5a3a', under: '#120e0c', bed: ['#141110', '#100d0c'], fluids: [0.45, 0.45, 0.1], river: WATER,
  tiles: { highland: 2, gorge: 1.5 },
  light: { sky: ['#0c0604', '#030201'], hemi: ['#a07050', '#140a06', 0.56], sun: ['#ff9a5a', 0.55], fog: 0.55 },
});
// the jungle cenote: a sunlit sinkhole temple, jade, glyphs and vines over clear pools
const CENOTE = T('Jungle cenote', {
  music: 'ruins',
  props: 'cenote',
  void: 0.08, relief: 0.6,
  arche: { sinkhole: 3, mesa: 2, crater: 1, plain: 1 },
  top: [[0, '#3a5a2a'], [6, '#4a6e32'], [12, '#5e823c'], [20, '#7a9648']],
  side: [[0, '#4a4434'], [8, '#5e5640'], [14, '#746a4e'], [22, '#8a7e5e']],
  lip: '#3a7a2e', under: '#1a180e', bed: ['#161812', '#12140e'], fluids: [0.75, 0.15, 0.1], river: WATER,
  tiles: { lake: 2, gorge: 1.3 },
  light: { sky: ['#06100a', '#020403'], hemi: ['#8ab070', '#0e140a', 0.54], sun: ['#d8ff9a', 0.55], fog: 0.5 },
});

// one theme per slot is picked per world (index.js); the first is the classic one
export const CAVE_SLOTS = [
  { at: 5, themes: [ROOTS] },
  { at: 7, themes: [FROZEN, GROTTO] },
  { at: 9, themes: [SWAMP, HIVE] },
  { at: 11, themes: [NESTS, OSSUARY] },
  { at: 13, themes: [MINES, FORGE] },
  { at: 15, themes: [RUINS, CENOTE] },
  { at: 17, themes: [VOLCANIC] },
  { at: 19, themes: [ABYSS] },
];
