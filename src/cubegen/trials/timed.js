// The timed gate (docs/trials.md, `timedgate`): the lever on a perch of rock (2 x 2, three metres
// over the ground about it) as far from the exit as the room allows; the gate is the exit's seal.
// The route search builds the way up (a ladder, a stair, jumps); the way back to the exit, at
// RUN_SPEED, times the gate (cubegen/trials/index.js finishTimed).
import { N } from '../../core/constants.js';
import { idx, clamp } from '../../core/util.js';

const pads = spec => spec.portals.filter(p => p.dir < 4).map(p => ({ dir: p.dir, at: [[N - 2, p.pos], [1, p.pos], [p.pos, N - 2], [p.pos, 1]][p.dir] }));
export const PERCH_UP = 6;   // levels over the ground about it

export function shapeTimed(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'timedgate', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / timed gate`;
  const ps = pads(spec), exit = ps.find(p => p.dir === spec.trial.exit);
  if (!exit) return;
  const cheb = ([ax, az], [bx, bz]) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
  const spots = [];
  for (let z = 2; z <= N - 4; z++) for (let x = 2; x <= N - 4; x++) {
    const corners = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
    const far = Math.min(...corners.map(c => cheb(c, exit.at)));
    if (far < 8 || ps.some(p => corners.some(c => cheb(c, p.at) < 3))) continue;
    spots.push({ x, z, score: far + R() * 3 });
  }
  if (!spots.length) return;
  spots.sort((a, b) => b.score - a.score);
  const { x, z } = spots[0], cells = [idx(x, z), idx(x + 1, z), idx(x, z + 1), idx(x + 1, z + 1)];
  // the ground round it (two cells out) at about one level; the perch over it
  const ring = [];
  for (let dz = -2; dz <= 3; dz++) for (let dx = -2; dx <= 3; dx++) {
    const cx = x + dx, cz = z + dz;
    if (cx < 1 || cz < 1 || cx > N - 2 || cz > N - 2 || (dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1)) continue;
    ring.push(idx(cx, cz));
  }
  const base = clamp(Math.round(ring.reduce((s, c) => s + lvl0[c], 0) / ring.length), 3, 8);
  for (const c of ring) { void0[c] = 0; lvl0[c] = clamp(lvl0[c], base - 1, base + 1); }
  for (const c of cells) { void0[c] = 0; lvl0[c] = base + PERCH_UP; ctx.keep.add(c); }
  ctx.trialKeep = new Set(cells);
  Object.assign(ctx.trialBuild, { failed: false, perch: { c: cells[0], cells, x: x + 1, z: z + 1, level: base + PERCH_UP }, keep: cells });
}

// the goal of the way in: the perch (the lever on it)
export const timedGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.perch.c, 0);
