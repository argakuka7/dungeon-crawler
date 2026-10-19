// The ground under a fluid's surface, for its shores (materials.js cellMaterial): at a point of a
// surface, how high the ground under it stands (world units, not over the surface: the surface
// rises and falls) and how steep it is there (rise per unit across). The shader finds the
// waterline from them wherever the water meets sloping ground, as the tide moves it:
// (water - ground) / slope away. Where the ground meets the water in a wall instead (a bank at a
// cell's edge) its slope says nothing; the wall's foam comes from the cells round about
// (render/floors.js shores, section.js WATER_SHORE for a standing fluid).
// The same for the cube's own fluids (render/floors.js fluidVolume) and the standing ones
// (render/trials.js), so a shore looks the same whichever fluid it is. Pure: the world worker
// builds the cube's fluids with it.
import { N, LH, DIRS } from '../core/constants.js';
import { floorY, runY } from '../core/surfaces.js';

// how far a fluid's wet band on sloping ground stands over it (render/floors.js wetSlope)
export const WET_LIFT = 0.005;

// the height of floor f's top at (x, z) (the cube's coordinates; in its cell or on its edge)
export const groundAt = (f, x, z) => floorY(f, x - f.x, z - f.z);

// how steep floor f's top is at (fx, fz) in its cell: its triangle's slope there (render/floors.js:
// two triangles a cell, split along one diagonal or the other)
export function triangleSlope(f, fx, fz) {
  const c = f.cs;
  if (!f.split) return fx >= fz ? Math.hypot(c[1] - c[0], c[3] - c[1]) : Math.hypot(c[3] - c[2], c[2] - c[0]);
  return fx + fz <= 1 ? Math.hypot(c[1] - c[0], c[2] - c[0]) : Math.hypot(c[3] - c[2], c[3] - c[1]);
}

// What a fluid meets in a column (cell c): its floors (no crumbling crust: it may be gone) and the
// stairs, landings and bridge decks standing in it, each a whole cell wide and taken as a floor:
// its top through its corners (cs, world units; a run's is flat across it, so either diagonal
// does), its bottom (levels, as a floor's) where it rests or its underside. Sorted from the
// bottom up. The fluids find their ground (and its walls) in them, whichever fluid it is
// (render/floors.js fluidVolume, render/trials.js standingSurface, section.js WATER_SHORE).
const solidsOf = new WeakMap(), DECK = 0.25;
export function waterSolids(m, c) {
  let all = solidsOf.get(m);
  if (!all) {
    all = m.cols.map(col => col.filter(f => !f.crust));
    for (const list of m.pieces || []) for (const p of list) {
      if (p.kind === 'pillar' || !p.run) continue;
      const x = p.c % N, z = (p.c / N) | 0, cs = [0, 1, 2, 3].map(k => runY(p, k & 1, k >> 1));
      // (a bridge: its deck; what carries it stands on piers, waterBoxes)
      const bottom = p.run.kind === 'bridge' ? Math.min(...cs) - DECK : p.base;
      all[p.c].push({ piece: p, c: p.c, x, z, cs, split: 0, fluid: 0, bottom: bottom / LH, top: Math.max(...cs) / LH });
    }
    for (const list of all) list.sort((a, b) => a.bottom - b.bottom);
    solidsOf.set(m, all);
  }
  return all[c];
}

// The small things standing in a fluid's way, each a box [x0, z0, x1, z1] (the cube's
// coordinates) from y0 to y1 (world units), per cell (at most BOXES; materials.js cellMaterial
// finds the foam round them, section.js WATER_BOXES): pillars (bridge piers and legs, a landing's
// post), the rails of a ladder that has them, a fence's posts.
export const BOXES = 3;
export function waterBoxes(m) {
  const cells = Array.from({ length: N * N }, () => []);
  const add = (x0, z0, x1, z1, y0, y1) => {
    const c = Math.floor((z0 + z1) / 2) * N + Math.floor((x0 + x1) / 2);
    if (c >= 0 && c < N * N && cells[c].length < BOXES && y1 > y0) cells[c].push([x0, z0, x1, z1, y0, y1]);
  };
  for (const list of m.pieces || []) for (const p of list) if (p.kind === 'pillar') {
    const x = p.c % N, z = (p.c / N) | 0;
    add(x + p.x0, z + p.z0, x + p.x1, z + p.z1, p.bottom, p.top);
  }
  for (const l of m.ladders || []) if (l.style === 'wood' || l.style === 'rope' || l.style === 'vine') {
    const [dx, dz] = DIRS[l.d];
    for (const s of [-0.22, 0.22]) {
      const x = l.x + 0.5 + dx * 0.44 - dz * s, z = l.z + 0.5 + dz * 0.44 + dx * s;
      add(x - 0.035, z - 0.035, x + 0.035, z + 0.035, l.y0, l.y1);
    }
  }
  for (const f of m.fenceList || []) if (f.show) for (const [x, y, z] of f.pts) add(x - 0.045, z - 0.045, x + 0.045, z + 0.045, y, y + 0.5);
  return cells;
}

// How steep the ground under floor f is at (x, z): its slope averaged round the point, over f's
// triangles and those of the floors that carry its ground on without a step (a slope running on
// into the next cell), so that a point on a cell's edge has the same slope from either side and
// the shore runs on smoothly across it. m: the map (its columns).
const NUDGE = 1e-3, STEP = 0.02;
export function slopeAt(m, f, x, z) {
  const y = groundAt(f, x, z);
  let sum = 0, n = 0;
  for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const px = x + ox * NUDGE, pz = z + oz * NUDGE, cx = Math.floor(px), cz = Math.floor(pz);
    const g = cx === f.x && cz === f.z ? f : cx < 0 || cz < 0 || cx >= N || cz >= N ? null
      : waterSolids(m, cz * N + cx).find(g => Math.abs(groundAt(g, px, pz) - y) < STEP);
    if (!g) continue;
    sum += triangleSlope(g, px - g.x, pz - g.z); n++;
  }
  return n ? sum / n : 0;
}
