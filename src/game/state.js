// Mutable game state shared between modules.
import { CHAR_R, CHAR_H } from '../core/constants.js';
import { swordState } from '../core/combat.js';
import { DEFAULT_ZOOM } from '../core/zoom.js';
import { createPlayerStats, createRun } from '../core/progression.js';
import { together } from '../net/online.js';

const params = new URLSearchParams(location.search);
const dev = params.get('dev') === '1';

// learn: architecture.html#notebook (see learn/README.md)
export const player = {
  x: 0, z: 0, y: 0, vx: 0, vy: 0, vz: 0, visY: 0,
  r: CHAR_R, h: CHAR_H, layer: 0, yaw: 0,
  ...createPlayerStats(dev),   // ?dev=1: with gold to spend (core/progression.js DEV_GOLD)
  sword: swordState(),
  grounded: true, swimming: false, fluid: 0, fluidDeath: 0, support: null,
  airTime: 0, coyote: 0, jumpBuf: 0, stun: 0,
  burning: null,   // on fire (core/projectiles.js ignite)
  chilled: null,   // slowed by an ice ball (core/projectiles.js chillFrom)
  // event counters the animator watches
  jumpCount: 0, landCount: 0, landImpact: 0,
  ragdoll: null, getUp: null,   // getting up after a ragdoll (game/ragdoll.js)
  ragdollThen: null, climb: null, climbV: 0,
  safe: { x: 0, y: 0, z: 0 }, safeTimer: 0,
  autoDir: null,   // overrides the movement keys (used by test bots)
};

// learn: architecture.html#notebook (see learn/README.md)
export const state = {
  map: null, world: null, time: 0,
  showPath: false, transitioning: false, inventoryOpen: false, equipping: false,
  menuOpen: false,   // the Esc menu (game/escmenu.js)
  showLabels: false,   // X: name labels over every item on the floor (game/lootlabels.js)
  run: createRun(),
  statusMsg: '', statusUntil: 0,
  // the world of cubes and where we are in it; lookDepth: the depth the lighting shows
  cubes: null, cubeKey: '', arrival: null, portalLock: 0, portalCharge: null, showNeighbors: true, lookDepth: 0,   // showNeighbors: tests only
  openedFaces: new Set(), boundaryLock: -1,   // shared side faces unlocked this world
  enemyGrace: 0,     // s left before enemies may attack (game/enemies.js ENTRY_GRACE)
  cast: null,        // reading the town portal scroll: { t, duration, ... } (game/townportal.js)
  visit: null,       // this cube as you came in: what a death restores (game/flow.js)
  fallFrom: null,    // falling through cubes: the cube the fall started in (game/fall.js)
  dev,   // debug tools (?dev=1)
  keepHero: false,   // a saved hero is played (game/save.js): a new world (N) keeps it as it is
  devPassive: false,   // dev: enemies stand still and never attack (game/devspawn.js)
  baseSeed: params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : (Math.random() * 1e9) >>> 0,
};

// camera orientation and zoom (eased towards the targets)
export const view = { yaw: -Math.PI / 4, yawTarget: -Math.PI / 4, zoom: DEFAULT_ZOOM, zoomTarget: DEFAULT_ZOOM };

// The inventory and the Esc menu stop the world, except when playing together: the friend plays
// on, and so do the enemies (only your own input stops)
export const worldPaused = () => (state.inventoryOpen || state.menuOpen) && !together();

// what the game just said: a short line in the chat box (game/console.js), not kept (the
// chronicle, game/log.js, keeps what matters)
export function setStatus(s) { state.statusMsg = s; state.statusUntil = state.time + 2.2; }
