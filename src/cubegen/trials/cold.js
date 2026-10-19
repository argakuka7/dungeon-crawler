// The cold snap (docs/trials.md, `cold`): a long way across the room to the great fire (a bonfire
// pit near the exit, on the face opposite the entry). Ridges of rock (six levels over the ground,
// nothing built over them) stand across the way, each open at one end, the ends alternating, so the
// way winds back and forth. Braziers along it (cubegen/trials/index.js finishCold spaces
// them by the time a slow player takes between their warm circles, well apart), one or two more
// off the way.
//   build: { fire: { c, level }, ridges: [cells], keep }
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

export const RIDGE_UP = 6;   // levels over the ground round a ridge

export function shapeCold(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'cold', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / cold snap`;
  const entry = spec.portals.find(p => p.dir === spec.trial.entry), exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!entry || !exit) return;
  // the fire's hollow: 3 x 3, flat, four cells in from the exit's face
  const c = edgeCell(exit.dir, Math.max(3, Math.min(N - 4, exit.pos)), 4), x = c % N, z = (c / N) | 0, hollow = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) hollow.push(idx(x + dx, z + dz));
  const level = Math.max(2, Math.round(hollow.reduce((s, h) => s + lvl0[h], 0) / hollow.length));
  // the ridges: across the way from the entry's face to the exit's (opposite faces: the planner asks
  // it), two or three, at least three cells apart and two from the entry's pad and the hollow, each
  // open at one end (three cells at the room's edge), the ends alternating. A line across another
  // portal's pad is open at that pad's end; one that cannot be is left out.
  const pads = spec.portals.filter(p => p.dir < 4 && p !== entry && p !== exit).map(p => { const q = edgeCell(p.dir, p.pos, 1); return [q % N, (q / N) | 0, p.dir]; });
  const alongX = entry.dir < 2, ein = edgeCell(entry.dir, entry.pos, 1), from = alongX ? ein % N : (ein / N) | 0, to = alongX ? x : z;
  const lo = Math.min(from, to) + 2, hi = Math.max(from, to) - 2, span = hi - lo;
  const count = span >= 6 ? 3 : span >= 3 ? 2 : span >= 0 ? 1 : 0;
  if (!count) return;
  const want = [];
  for (let k = 0; k < count; k++) want.push(Math.round(lo + (count === 1 ? span / 2 : span * k / (count - 1))));
  // the end a line must be open at (true: the high end), or null: either
  const must = l => {
    const pad = pads.find(([px, pz]) => Math.abs((alongX ? px : pz) - l) <= 2);
    return pad ? (alongX ? pad[2] === 2 : pad[2] === 0) : null;
  };
  const first = R() < 0.5 ? 0 : 1, lines = [];
  want.forEach((l, k) => {
    const high = (lines.length + first) % 2 === 1, m = must(l);
    if (m == null || m === high) lines.push({ l, high });
  });
  if (!lines.length) return;
  const ridges = [], hollowSet = new Set(hollow);
  for (const { l, high } of lines) for (let t = 0; t <= N - 1; t++) {   // (to the cube's edge: nothing goes round along it)
    if (high ? t >= N - 4 : t <= 3) continue;
    const cell = alongX ? idx(l, t) : idx(t, l);
    if (!hollowSet.has(cell)) ridges.push(cell);
  }
  // the ground beside them (one cell either way) brought to the line's level, the ridges up over it
  for (const { l } of lines) {
    const row = [];
    for (let t = 1; t <= N - 2; t++) for (const o of [-1, 0, 1]) row.push(alongX ? idx(l + o, t) : idx(t, l + o));
    const base = Math.round(row.reduce((s, q) => s + lvl0[q], 0) / row.length);
    for (const q of row) if (!hollowSet.has(q)) { void0[q] = 0; lvl0[q] = Math.max(lvl0[q], base); }
  }
  const ridgeSet = new Set(ridges);
  for (const q of ridges) { void0[q] = 0; lvl0[q] += RIDGE_UP; ctx.keep.add(q); }
  for (const h of hollow) { void0[h] = 0; lvl0[h] = level; ctx.keep.add(h); }
  ctx.trialKeep = new Set([...hollow, ...ridges]);
  ctx.noFence = new Set([...ctx.noFence || [], ...ridges]);   // (bare rock: no rails along its top)
  ctx.noBuild ??= new Set();
  for (const q of ridges) ctx.noBuild.add(q);
  Object.assign(ctx.trialBuild, { failed: false, fire: { c, level }, ridges, ridgeSet, keep: [...hollow, ...ridges] });
}

// the ways round the ridges: nothing built onto, off or over them (walks and drops only there)
export function coldRoute(ctx) {
  const movesFrom = ctx.movesFrom, on = f => !!ctx.trialBuild?.ridgeSet?.has(f.c);   // (a stair's landing up there too)
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => !on(f) && !on(m.to) && (m.kind === 'walk' || m.kind === 'drop'
    || !m.cells?.some(c => ctx.trialBuild?.ridgeSet?.has(c))));
}

export const coldGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.fire.c, 0);
