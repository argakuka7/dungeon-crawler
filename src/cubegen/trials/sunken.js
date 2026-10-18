// The sunken room (docs/trials.md, `sunken`): you come in from up high (the entry portal on the
// top layer, level 16) and everything under you is flooded; each stage puzzle you solve drains it a
// stage further, uncovering the way to the next, until the ground and the exit come out of the water.
//
// The room's four quadrants (7 x 7) make a ring. The entry's quadrant is a terrace at the entry's
// height; the stage platforms follow round the ring the long way (P1 next to the entry's, each
// lower), the exit's quadrant last (holding the last platform too, when there is no quadrant left).
// Anything else is the river's water. Stage i's platform stands at q_i, dry at W_(i-1); solving it
// lowers the water to W_i (core/trials.js), under which the next platform was until then. The
// platforms are joined by whatever the route search builds (stairs, ladders) over the water.
//   build: { stages: [{ kind, level, rect }], water: [W_0 .. W_n], terrace, quadrants }
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';
import { buildSlide } from './slide.js';
import { buildGrid, gridSize, gridGoal } from './grid.js';
import { BASIN, smallStages } from '../../core/trials.js';

const RING = [[0, 0], [1, 0], [1, 1], [0, 1]];   // the quadrants round the room
const quadOf = c => [c % N >= 8 ? 1 : 0, ((c / N) | 0) >= 8 ? 1 : 0];
const at = q => RING.findIndex(r => r[0] === q[0] && r[1] === q[1]);
const quadCells = q => { const out = []; for (let z = 1 + 7 * q[1]; z <= 7 + 7 * q[1]; z++) for (let x = 1 + 7 * q[0]; x <= 7 + 7 * q[0]; x++) out.push(idx(x, z)); return out; };
const quadRect = q => ({ x0: 1 + 7 * q[0], z0: 1 + 7 * q[1], x1: 7 + 7 * q[0], z1: 7 + 7 * q[1] });

// the quadrants from the entry's round to the exit's, the long way (null: the same quadrant, or no
// way that holds n platforms; share: the last may share the exit's quadrant, as a small puzzle can)
export function sunkenPath(qe, qx, n, share = false) {
  const a = at(qe), b = at(qx);
  if (a === b) return null;
  const ways = [1, -1].map(s => { const out = [RING[a]]; for (let i = a; (i = (i + s + 4) % 4) !== b;) out.push(RING[i]); out.push(RING[b]); return out; });
  ways.sort((x, y) => y.length - x.length);
  return ways[0].length - 1 >= n + (share ? 0 : 1) ? ways[0] : null;
}

// the water's levels: W_0 under the entry's terrace, W_(n-1) two over the exit, evenly between, the
// last down to the rivers'; a stage platform stands a level over the water it is dry at
export function sunkenLevels(top, exit, n) {
  const W = [top - 1];
  for (let i = 1; i < n; i++) W.push(Math.round(top - 1 - (top - 1 - (exit + 2)) * i / (n - 1)));
  W.push(BASIN);
  const q = [top, ...W.slice(1, n).map(w => w + 1)];
  for (let i = 1; i < n; i++) if (W[i - 1] - W[i] < 2 || q[i] >= W[i - 1]) return null;
  if (W[n - 1] <= exit) return null;
  return { W, q };
}

const SIZE = { slide: 4 };   // a stage puzzle's field on a platform

export function shapeSunken(ctx) {
  const { spec, lvl0, void0, R } = ctx, stages = spec.trial.stages || ['slide', 'slide'], n = stages.length;
  ctx.trialBuild = { kind: 'sunken', failed: true, keep: [] };
  ctx.stats.mode = spec.kind + ' / sunken room';
  const entry = spec.portals.find(p => p.dir === spec.trial.entry), exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!entry || !exit || !entry.layer) return;
  const path = sunkenPath(quadOf(edgeCell(entry.dir, entry.pos, 1)), quadOf(edgeCell(exit.dir, exit.pos, 1)), n, smallStages());
  const levels = path && sunkenLevels(entry.level, exit.level, n);
  if (!levels) return;
  const exitPad = []; for (let t = exit.pos - 1; t <= exit.pos + 1; t++) for (let j = 0; j < 2; j++) exitPad.push(edgeCell(exit.dir, t, j));
  // everything the river's water, but the terrace, the platforms and the ground by the exit
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { const c = idx(x, z); lvl0[c] = 0; void0[c] = 0; ctx.keep.add(c); }
  const sea = new Set();
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) sea.add(idx(x, z));
  const raise = (cells, level) => { for (const c of cells) { lvl0[c] = level; sea.delete(c); } };
  raise(quadCells(path[0]), entry.level);
  const shared = path.length - 1 === n;   // the last platform shares the exit's quadrant
  if (!shared) raise(quadCells(path.at(-1)), exit.level);
  // the platforms and their puzzles; each faces where the way comes in, its goal towards where it
  // goes on (or, sharing the exit's quadrant, towards the exit)
  const built = [];
  for (let i = 0; i < n; i++) {
    const q = path[i + 1], prev = path[i], rect = quadRect(q), level = levels.q[i];
    if (shared && i === n - 1) {   // the puzzle keeps off the row by the exit's pad
      const side = exit.dir;
      if (side === 0) rect.x1--; else if (side === 1) rect.x0++; else if (side === 2) rect.z1--; else rect.z0++;
    }
    raise(quadCells(q), level);   // (in the exit's quadrant the row by the exit is the platform's too: the pad drops to its own level)
    const centre = r => [r[0] * 7 + 4.5, r[1] * 7 + 4.5], towards = centre(prev).map((v, k) => (v + centre(q)[k]) / 2);
    const sideTo = r => r[0] > q[0] ? 0 : r[0] < q[0] ? 1 : r[1] > q[1] ? 2 : 3;
    const next = path[i + 2] ?? null, entrySide = sideTo(prev), goalSide = next ? sideTo(next) : exit.dir;
    const kind = stages[i], within = { ...rect, level, walk: 0, free: [entrySide, goalSide].filter(s => !(shared && i === n - 1 && s === exit.dir)) };
    const pz = kind === 'slide' ? buildSlide(ctx, { size: SIZE.slide, band: [3, 5], decoys: 2, towards, entrySide, goalSides: [goalSide], within })
      : buildGrid(ctx, kind, { ...gridSize(kind, spec.depth, true), towards, within, entrySide });
    if (!pz) return;
    if (kind !== 'slide') pz.goalCell = gridGoal(pz);
    // where you stand to begin it: beyond a slide's entry gap; beside a grid puzzle's field, on the side the way comes in
    const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][kind === 'slide' ? pz.field.entry.side : entrySide];
    pz.approach = kind === 'slide' ? pz.entryGap + dx + dz * N : pz.approach != null ? pz.approach
      : idx(Math.min(N - 2, Math.max(1, pz.deck.x0 + (pz.deck.w >> 1) + dx * ((pz.deck.w >> 1) + 1))), Math.min(N - 2, Math.max(1, pz.deck.z0 + (pz.deck.h >> 1) + dz * ((pz.deck.h >> 1) + 1))));
    pz.stage = i; pz.level = level; pz.rect = rect;
    built.push(pz);
  }
  for (const c of sea) ctx.seaCells.push(c);
  ctx.trialKeep = new Set([...ctx.trialKeep || [], ...quadCells(path[0])]);
  Object.assign(ctx.trialBuild, { failed: false, puzzles: built, water: levels.W, levels: levels.q, path, entryLevel: entry.level,
    exitLevel: exit.level, exitPad, keep: [...ctx.trialKeep] });
}

// the first stage's plate: the route goes there first (and on, over the platforms, to the exit)
export const sunkenGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.puzzles[0].goalCell, 0);
