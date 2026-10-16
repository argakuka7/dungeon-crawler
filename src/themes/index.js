// What each depth looks like. A theme starts at depth `at` and lasts until the next one.
// Palettes and generator settings are per theme; the lighting (`light`) is blended between
// theme starts, so every step down is a little darker.
//   top / side: colour stops by height in levels (grass tops, cliff strata)
//   fluids: weights [water, lava, acid] for pools and falls; river: fluid of the rivers
//   tiles: weight multipliers for the WFC kinds; cave: below the ground (no sun, no sky)
//   void: how much of a cube may be open to the depth below; relief: how tall highlands get
//   spans: gorge spans (world/spans.js): chance per depth, at most `max`, the chance of one on
//   the route where it fits and of a lonely island branch
//   arche: weights of the cube archetypes (cubegen/archetypes.js); props: prop set (assets/props.glb), propDensity: chance of a prop per floor (0.32)
//   light: sky [top, bottom, haze?, tint?] (backdrop, see render/sky.js), stars 0..1, hemi [sky, ground, intensity], sun [colour, intensity], fog 0..1
//   music: the song (music/<name>.scrim) that plays here; the town and the core have their own (SONGS)
import { WATER } from '../core/constants.js';
import { CAVES } from './caves.js';

const T = (at, name, o) => ({ at, name, tiles: {}, cave: false, ...o });

export const THEMES = [
  T(0, 'Meadow islands', {
    music: 'overworld',
    props: 'meadow', propDensity: 0.15,
    void: 0.5, relief: 0.5,
    spans: { chance: 0.9, max: 2, route: 0.8, island: 0.6 },
    arche: { plain: 3, archipelago: 3, spire: 1, mesa: 1, chasm: 1 },
    top: [[0, '#3b6532'], [4, '#4c8a3c'], [8, '#76ad50'], [12, '#a3b26a'], [16, '#b7a888'], [20, '#d9d3c5']],
    side: [[0, '#4e382a'], [6, '#7a5638'], [11, '#7a6d62'], [20, '#9a948c']],
    lip: '#3f6b2e', under: '#3a2f28', bed: ['#2a2a31', '#23232a'], fluids: [0.85, 0.05, 0.1], river: WATER,
    light: { sky: ['#163640', '#081218', '#4a6966', '#3b3656'], stars: 1, hemi: ['#dfeaff', '#3a3020', 1.1], sun: ['#fff1dd', 2.4], fog: 0 },
  }),
  T(3, 'Snowy peaks', {
    music: 'peaks',
    props: 'peaks',
    void: 0.42, relief: 1.0,
    arche: { spire: 3, chasm: 2, mesa: 2, plain: 1 },
    top: [[0, '#8fa4ab'], [6, '#c3d3d8'], [12, '#e6eef1'], [20, '#ffffff']],
    side: [[0, '#4f5862'], [8, '#6c7781'], [14, '#8a949d'], [22, '#b4bcc3']],
    lip: '#d6e2e6', under: '#454b53', bed: ['#2c3038', '#25282f'], fluids: [0.9, 0, 0.1], river: WATER,
    tiles: { highland: 2, slope: 1.5, river: 0.6 },
    light: { sky: ['#1c2e46', '#0a0f18', '#4c5d74', '#3d3a5e'], stars: 1, hemi: ['#e6f0ff', '#565c6c', 1.15], sun: ['#f4f8ff', 2.2], fog: 0.15 },
  }),
  T(4, 'Badlands', {
    music: 'badlands',
    props: 'badlands',
    void: 0.12, relief: 0.8,
    arche: { chasm: 3, mesa: 3, spire: 1, plain: 1 },
    top: [[0, '#9a6a3c'], [6, '#b9864f'], [12, '#d3a466'], [20, '#e8cf9a']],
    side: [[0, '#5e3520'], [8, '#80502f'], [14, '#a06f46'], [22, '#bf9468']],
    lip: '#b0824e', under: '#432818', bed: ['#2a2220', '#231c1a'], fluids: [0.5, 0.3, 0.2], river: WATER,
    tiles: { gorge: 3, highland: 1.5, meadow: 0.7, river: 0.8 },
    light: { sky: ['#40282e', '#110a0c', '#6a4a44', '#4a2a42'], stars: 0.6, hemi: ['#f0b890', '#3a2418', 0.8], sun: ['#ffb37a', 1.6], fog: 0.25 },
  }),
  ...CAVES,
];

// every song the game plays: the town (and the merchant camp), one per theme, and the core (depth 20)
export const SONGS = ['town', ...new Set(THEMES.map(t => t.music)), 'core'];
