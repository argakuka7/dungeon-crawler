// The hunter (docs/trials.md, `chase`): a winding corridor carved through rock (a self-avoiding walk
// over the room's odd cells, a maze's way: one cell wide, walls between), 35-50 cells from the
// entry's pad to the exit's; a portcullis across it a few cells before the exit, the lever just past
// it. The levels change gently along it from the entry's to the exit's.
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

const G = 7, SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// the odd cell (grid coordinates) a portal's pad opens onto
function padNode(p) {
  const t = Math.max(0, Math.min(G - 1, Math.round((p.pos - 1) / 2)));
  return [[G - 1, t], [0, t], [t, G - 1], [t, 0]][p.dir];
}
// a self-avoiding walk over the G x G grid from a to b, `lo`-`hi` steps (null: none found)
function walk(R, a, b, lo, hi, budget = 30000) {
  const seen = new Set([`${a}`]), path = [a];
  let left = budget;
  const go = () => {
    if (--left < 0) return false;
    const [x, z] = path.at(-1);
    if (x === b[0] && z === b[1]) return path.length - 1 >= lo;
    if (path.length - 1 >= hi) return false;
    // (too far from b to get there in the steps left: give up this branch)
    if (Math.abs(x - b[0]) + Math.abs(z - b[1]) > hi - (path.length - 1)) return false;
    const next = SD.map(([dx, dz]) => [x + dx, z + dz]).filter(([nx, nz]) => nx >= 0 && nz >= 0 && nx < G && nz < G && !seen.has(`${nx},${nz}`));
    for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; }
    for (const n of next) {
      if ((n[0] === b[0] && n[1] === b[1]) && path.length < lo) continue;
      seen.add(`${n}`); path.push(n);
      if (go()) return true;
      seen.delete(`${n}`); path.pop();
    }
    return false;
  };
  return go() ? path : null;
}

export function shapeChase(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'chase', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / the hunter`;
  const entry = spec.portals.find(p => p.dir === spec.trial.entry), exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!entry || !exit) return;
  const a = padNode(entry), b = padNode(exit), path = walk(R, a, b, 17, 24);
  if (!path) return;
  const cellOf = ([gx, gz]) => idx(1 + 2 * gx, 1 + 2 * gz);
  // the corridor's cells in order: from the entry's pad, along the walk, to the exit's
  const way = [];
  const padIn = p => edgeCell(p.dir, p.pos, 1);
  const lineTo = (from, to) => {   // straight (one axis, then the other) from cell `from` to `to`
    let x = from % N, z = (from / N) | 0;
    const tx = to % N, tz = (to / N) | 0, out = [];
    while (x !== tx) { x += Math.sign(tx - x); out.push(idx(x, z)); }
    while (z !== tz) { z += Math.sign(tz - z); out.push(idx(x, z)); }
    return out;
  };
  way.push(padIn(entry), ...lineTo(padIn(entry), cellOf(path[0])));
  for (let i = 1; i < path.length; i++) way.push(...lineTo(cellOf(path[i - 1]), cellOf(path[i])));
  way.push(...lineTo(cellOf(path.at(-1)), padIn(exit)));
  const cells = [...new Set(way)];
  if (cells.length < 35 || cells.length > 52) return;
  // other portals: a straight passage from their pad to the corridor
  const others = spec.portals.filter(p => p.dir < 4 && p !== entry && p !== exit), side = [];
  for (const p of others) side.push(padIn(p), ...lineTo(padIn(p), cellOf(padNode(p))));
  const open = new Set([...cells, ...side]);
  const levels = new Map(cells.map((c, i) => [c, Math.round(entry.level + (exit.level - entry.level) * i / (cells.length - 1))]));
  const top = Math.max(entry.level, exit.level, ...others.map(p => p.level)) + 6;
  const pad = new Map();   // the portals' pads (three wide, two deep) at their levels
  for (const p of spec.portals.filter(q => q.dir < 4)) for (let t = p.pos - 1; t <= p.pos + 1; t++) for (let j = 0; j <= 1; j++) pad.set(edgeCell(p.dir, t, j), p.level);
  // (the outer ring too: nothing goes round the corridor along the cube's edge)
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = idx(x, z);
    void0[c] = 0; ctx.keep.add(c);
    if (pad.has(c)) lvl0[c] = pad.get(c);
    else if (levels.has(c)) lvl0[c] = levels.get(c);
    else if (open.has(c)) lvl0[c] = lvl0[cells.find(q => Math.abs(q % N - x) + Math.abs(((q / N) | 0) - z) <= 2) ?? cells[0]] ?? entry.level;
    else lvl0[c] = top;
  }
  // the portcullis five cells before the exit's pad, the lever two past it
  const g = cells.length - 6, gate = cells[g], lever = cells[g + 2], prev = cells[g - 1];
  const dir = SD.findIndex(([dx, dz]) => gate % N - prev % N === dx && ((gate / N) | 0) - ((prev / N) | 0) === dz);
  ctx.trialKeep = new Set(cells);
  ctx.noFence = new Set([...ctx.noFence || [], ...cells]);
  Object.assign(ctx.trialBuild, { failed: false, corridor: cells, gate: { c: gate, dir }, lever: { c: lever }, keep: cells });
}

export const chaseGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.lever.c, 0);
