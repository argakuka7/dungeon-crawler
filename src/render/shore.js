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
import { N, LH, DIRS, OPP, EDGE_CORNERS } from '../core/constants.js';
import { restY, ownTakes, ownUnder } from './surface.js';
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

// What stands in a fluid's way, each a box [x0, z0, x1, z1] (the cube's coordinates) from y0 up
// to its top, which runs from ya at its low end to yb at its high end along x (axis 0) or z (1)
// (world units), per cell (at most BOXES; materials.js cellMaterial finds the foam round where
// they stand out of it, render/wet.js): the pieces of stairs, landings and bridge decks (a ramp
// as their run goes; where they stand in the water only partly, the cell's edges are no wall),
// pillars (bridge piers and legs, a landing's post), the rails of a ladder that has them, a
// fence's posts.
export const BOXES = 3;
export function waterBoxes(m) {
  const cells = Array.from({ length: N * N }, () => []);
  const add = (x0, z0, x1, z1, y0, ya, yb = ya, axis = 0) => {
    const c = Math.floor((z0 + z1) / 2) * N + Math.floor((x0 + x1) / 2);
    if (c >= 0 && c < N * N && cells[c].length < BOXES && Math.max(ya, yb) > y0) cells[c].push([x0, z0, x1, z1, y0, ya, yb, axis]);
  };
  for (const list of m.pieces || []) for (const p of list) {
    const x = p.c % N, z = (p.c / N) | 0;
    if (p.kind === 'pillar') add(x + p.x0, z + p.z0, x + p.x1, z + p.z1, p.bottom, p.top);
    else if (p.run) {
      const s = waterSolids(m, p.c).find(g => g.piece === p), axis = p.dz ? 1 : 0;
      add(x, z, x + 1, z + 1, s.bottom * LH, runY(p, 0, 0), runY(p, axis ? 0 : 1, axis ? 1 : 0), axis);
    }
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

// What the fluids are drawn by and a map must keep to (the generator's rules), for the dev
// checks (game/flow.js devShores, the tests): every line a place that breaks one.
// - Only a fluid's own cells reach under its surface: a floor beside it at its level or over it
//   (a bank) has the corners next to it at its surface or over it (cubegen/smooth.js), or the
//   waterline would run through a cell no fluid is drawn in (its side would show there instead,
//   with no foam and no wet band). (A corner a stair or ladder pins may win; structures standing
//   in a fluid are its boxes, waterBoxes.)
// - No column shows two fluid surfaces close together: two of the cube's own stacked, or the
//   cube's own and its standing fluid (a trial's, a boss's tide) at any level it may stand at,
//   in its box (render/surface.js ownTakes, ownUnder).
export function shoreIssues(m) {
  const out = [];
  for (const f of m.floors) if (f.fluid && !f.crust) for (let d = 0; d < 4; d++) {
    const x = f.x + DIRS[d][0], z = f.z + DIRS[d][1];
    if (x < 0 || z < 0 || x >= N || z >= N) continue;
    const [a, b] = EDGE_CORNERS[OPP[d]], rest = restY(f.surf * LH), bed = f.top * LH;
    for (const g of waterSolids(m, z * N + x)) {
      if (g.fluid || g.piece || g.top < f.surf || g.bottom * LH >= rest || Math.max(g.cs[a], g.cs[b]) <= bed + 0.01) continue;
      const lo = Math.min(g.cs[a], g.cs[b]);
      if (lo < rest) out.push(`bank under the surface: (${x}, ${z}) beside the fluid in (${f.x}, ${f.z}), ${(rest - lo).toFixed(2)} under`);
    }
  }
  const standing = m.trial?.fluid && (m.trial.kind === 'flood' || m.trial.kind === 'sunken') ? [0, 0, N, N] : m.tide?.box;
  for (let c = 0; c < N * N; c++) {
    const own = m.cols[c].filter(f => f.fluid && !f.crust);
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++)
      if (Math.abs(own[i].surf - own[j].surf) * LH < 0.3) out.push(`two fluids in (${c % N}, ${c / N | 0}) at levels ${own[i].surf}, ${own[j].surf}`);
    const [x0, z0, x1, z1] = standing ?? [0, 0, 0, 0], x = c % N, z = c / N | 0;
    if (!own.length || x < x0 || z < z0 || x >= x1 || z >= z1) continue;
    for (let level = 0; level <= 40; level += 0.25) {
      const y = level * LH;
      if (ownTakes(m.cols[c], y)) continue;   // (the standing fluid is not drawn here)
      for (const f of own) if (!ownUnder(f.surf * LH, y) && Math.abs(f.surf * LH - y) < 0.3)
        out.push(`two fluids in (${x}, ${z}): its own at ${f.surf}, the standing one at ${level}`);
    }
  }
  return out;
}
