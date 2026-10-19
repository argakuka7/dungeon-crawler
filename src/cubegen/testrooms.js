// The dev test rooms (world/testrooms.js, /testroom): small hand-made maps for trying one thing
// out, built straight from their plans instead of through the generator's stages. Ground is
// either flat terraces (`put` a floor of a level) or shaped by a height function over the cell
// corners (`shaped`): a cell with a corner under the water line is under water, its bed the
// shape's, so a shore runs down into the water as one slope. Floors next to each other link
// where their edges meet. No portals, no props, no enemies (/spawn brings some): nothing leads
// in or out but /testroom.
import { N, LH, DIRS, OPP, EDGE_CORNERS, WATER, LAVA, ACID, FLUID_NAME } from '../core/constants.js';
import { idx } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { indexBlockers } from '../core/blockers.js';
import { createContext } from './context.js';
import { ladderInfo } from './climbs.js';
import { testRoomOf } from '../world/testrooms.js';

const flat = top => Array(4).fill(top * LH);
const corners = (H, x, z) => [H(x, z), H(x + 1, z), H(x, z + 1), H(x + 1, z + 1)];
const border = (x, z) => !x || !z || x === N - 1 || z === N - 1;

function start(spec) {
  const ctx = createContext(spec.seed);
  ctx.falls = []; ctx.ladders = [];
  // a floor in cell (x, z): flat at `top`, or with its corners at cs (units)
  ctx.put = (x, z, { top, bottom = 0, layer = 0, fluid = 0, surf = 0, cs = null }) => {
    const f = ctx.mk(idx(x, z), top, bottom, layer);
    Object.assign(f, { fluid, surf, cs: cs ?? flat(top) });
    ctx.cols[f.c].push(f);
    return f;
  };
  // a cell of ground with its corners at the levels lv: under `fluid` standing at level S if a
  // corner dips under it, its top the lowest corner rounded. Walking goes by the bed's height
  // where the foot goes (physics/fluid.js wadeable), so a shore is waded down as far as the water
  // stays under the head, whatever the cell's corners.
  ctx.shaped = (x, z, lv, S = -Infinity, fluid = WATER) => {
    const lo = Math.min(...lv), cs = lv.map(v => v * LH);
    if (lo < S - 0.05) return ctx.put(x, z, { top: Math.round(lo), fluid, surf: S, cs });
    return ctx.put(x, z, { top: Math.round(lv.reduce((a, b) => a + b) / 4), cs });
  };
  // a pool of `fluid` (surface S, bed two levels under it) in the cells whose centres lie within
  // r of (cx, cz), with flat banks a level over its surface
  ctx.pool = (cx, cz, r, fluid, S) => {
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r) {
      ctx.cols[idx(x, z)] = [];
      ctx.put(x, z, { top: S - 2, fluid, surf: S });
    }
    ctx.stats.fluids.push(FLUID_NAME[fluid] + ' pool');
  };
  ctx.ladder = (lo, hi, style) => {
    const d = DIRS.findIndex(([dx, dz]) => lo.x + dx === hi.x && lo.z + dz === hi.z);
    ctx.ladders.push({ lo, hi, d, hang: hi.bottom > lo.top + 1, style });
  };
  return ctx;
}

// the floors indexed and linked (where the edges meet), the map
function finish(ctx, spec, { K = 1, B = [0], arrival, note }) {
  const floors = ctx.floors = [];
  for (const col of ctx.cols) {
    col.sort((a, b) => a.top - b.top);
    for (const f of col) { f.id = floors.length; floors.push(f); }
  }
  for (const f of floors) {
    f.split = Math.abs(f.cs[0] - f.cs[3]) <= Math.abs(f.cs[1] - f.cs[2]) ? 0 : 1;
    f.link = DIRS.map(([dx, dz], d) => {
      const x = f.x + dx, z = f.z + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) return null;
      const [a, b] = EDGE_CORNERS[d], [na, nb] = EDGE_CORNERS[OPP[d]];
      return ctx.cols[idx(x, z)].find(g => g.layer === f.layer
        && Math.abs(g.cs[na] - f.cs[a]) < 0.01 && Math.abs(g.cs[nb] - f.cs[b]) < 0.01) ?? null;
    });
  }
  const name = testRoomOf(spec.key), blockers = indexBlockers([]);
  // where /testroom puts you: on the top floor there
  const top = ctx.cols[idx(Math.floor(arrival.x), Math.floor(arrival.z))].at(-1);
  arrival = { ...arrival, y: floorY(top, arrival.x % 1, arrival.z % 1) };
  Object.assign(ctx.stats, { layers: K, mode: `test room (${name})` });
  return {
    seed: spec.seed, attempts: 1, K, B, cols: ctx.cols, floors, pieces: Array.from({ length: N * N }, () => []),
    runs: [], falls: ctx.falls, fences: new Map(), fenceList: [], stats: ctx.stats, moves: [], portals: [], exit: null,
    ladders: ctx.ladders.map(l => ladderInfo(l, l.style)),
    gateKeys: [null, null, null, null], trialFaces: [null, null, null, null], trial: null, clues: [],
    safe: new Uint8Array(floors.length).fill(1),
    kind: 'meadow', archetype: 'test', key: spec.key, depth: spec.depth, biome: spec.biome,
    cave: false, walled: false, enemyFree: false, populationScale: 0, horde: null,
    rewardSites: [], siteFailures: [], sitePlacements: [], siteReservations: [], spots: [],
    staticBlockers: blockers, blockers, occluders: [], authoredProps: [], routes: [],
    testRoom: { name, arrival, note },
  };
}

// A hill standing in a lake to halfway up (its top 15 levels up, the water at 8, the bed at 1),
// steep all round but to the east: there a shelf runs out under the water, so gently that
// walking down it the water rises to just under the head (physics/fluid.js HEAD_Y) by its far
// edge (x = 14); past that it drops off into deep water. A dry rim runs round the cube.
const HILL = { S: 8, bed: 1, top: 15, x: 6, z: 8 };
export function hillHeight(X, Z) {
  const { S, bed, top } = HILL, r = Math.hypot(X - HILL.x, Z - HILL.z);
  const hill = top - 2.6 * Math.max(0, r - 1);
  const across = Math.max(0, Math.abs(Z - HILL.z) - 2.5);
  // (out of the hill's east side: falling away west of x = 9.5, under the hill)
  const shelf = Math.min(S + 0.5 - 0.42 * (X - 9.5), S - 1.4 - 3 * (X - 14), S + 0.5 + 3 * (X - 9.5)) - 2.5 * across;
  return Math.max(bed, hill, Math.min(shelf, top));
}
function waterHill(spec) {
  const ctx = start(spec), { S } = HILL;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (border(x, z)) ctx.put(x, z, { top: S + 1 });
    else ctx.shaped(x, z, corners(hillHeight, x, z), S);
  }
  ctx.stats.fluids.push('water lake with a wading shelf');
  return finish(ctx, spec, { arrival: { x: 8.5, z: 8.5, yaw: Math.PI / 2 },
    note: 'wade east down the shelf; it stops where the water gets too deep (jump in to drown)' });
}

// Flat ground (level 4) before a cliff along the north (level 14, up a ladder in its west end):
// a channel on top pours over its edge as a waterfall into a lake below, deep under the fall
// and shelving up to its shores; a lava pool and an acid pool in the south corners.
const FLUIDS_ROOM = { G: 4, cliff: 14, lake: 3, chan: 8 };
const lakeHeight = (X, Z) => Math.min(FLUIDS_ROOM.G, Math.max(1, 1 + 1.1 * (Math.hypot((X - 8) / 1.5, Z - 4.2) - 1)));
function fluids(spec) {
  const ctx = start(spec), { G, cliff, lake, chan } = FLUIDS_ROOM;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (z <= 2) {
      if (x === chan && z) ctx.put(x, z, { top: cliff - 3, fluid: WATER, surf: cliff - 1 });   // the channel
      else ctx.put(x, z, { top: cliff });
    } else if (border(x, z)) ctx.put(x, z, { top: G });
    else ctx.shaped(x, z, corners(lakeHeight, x, z), lake);
  }
  ctx.pool(3.5, 12, 1.7, LAVA, G - 1);
  ctx.pool(12.5, 12, 1.7, ACID, G - 1);
  ctx.falls.push({ c: idx(chan, 3), d: 2, top: cliff - 1, bot: lake, type: WATER, layer: 0 });
  ctx.stats.fluids.push('water channel', 'waterfall', 'water lake');
  ctx.ladder(ctx.cols[idx(1, 3)][0], ctx.cols[idx(1, 2)][0], 'wood');
  return finish(ctx, spec, { arrival: { x: 8.5, z: 10.5, yaw: Math.PI }, note: 'the cliff\'s ladder is in its west end' });
}

// Flat ground (level 2): a tower for every ladder style along the north, each taller than the
// one before (one ladder longer than any normal one), and a platform floating in the south
// (levels 10 to 12) with the styles that hang free hanging from its north edge.
const STYLES = ['wood', 'rope', 'vine', 'iron', 'footholds'], HANGING = ['wood', 'rope', 'vine'];
const TOWERS = [8, 10, 13, 16, 22];
function climb(spec) {
  const ctx = start(spec), G = 2, P = { top: 12, bottom: 10, x0: 3, x1: 12, z0: 10, z1: 12 };
  const tower = (x, z) => x >= 1 && z >= 1 && z <= 3 && (x - 1) % 3 < 2 ? TOWERS[(x - 1) / 3 | 0] ?? null : null;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    ctx.put(x, z, { top: tower(x, z) ?? G });
    if (x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1) ctx.put(x, z, { top: P.top, bottom: P.bottom, layer: 1 });
  }
  const at = (x, z, layer = 0) => ctx.cols[idx(x, z)].find(f => f.layer === layer);
  STYLES.forEach((s, i) => ctx.ladder(at(1 + 3 * i, 4), at(1 + 3 * i, 3), s));
  HANGING.forEach((s, i) => ctx.ladder(at(4 + 3 * i, P.z0 - 1), at(4 + 3 * i, P.z0, 1), s));
  return finish(ctx, spec, { K: 2, B: [0, P.bottom], arrival: { x: 8, z: 6.5, yaw: Math.PI },
    note: `towers: ${STYLES.join(', ')}; hanging from the platform: ${HANGING.join(', ')}` });
}

const BUILD = { water_hill: waterHill, fluids, climb };
// spec: { key, depth, seed, biome (the depth's theme) }
export function generateTestRoom(spec) {
  const name = testRoomOf(spec.key);
  if (!BUILD[name]) throw new Error('No test room ' + spec.key);
  return BUILD[name](spec);
}
