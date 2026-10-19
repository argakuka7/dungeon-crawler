// The storm (docs/trials.md, `storm`): the way runs across the room from the entry to the exit
// (opposite faces), the gusts blow across it from one of the other faces towards the gorge along
// the leeward one (two rows of the depth's sea under the edge: blown in, you drown). Lines of
// windbreaks (rock outcrops two cells wide, four levels up, two-cell gaps between, every third
// row, staggered, off the pads and the rod) shelter the two cells downwind of them. The lightning rod stands by the exit.
//   build: { wind: [dx, dz] (the way it blows), shelter: [cells], rocks: [cells], gorge: [cells], rod }
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

export function shapeStorm(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'storm', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / storm`;
  const entry = spec.portals.find(p => p.dir === spec.trial.entry), exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!entry || !exit || (entry.dir ^ 1) !== exit.dir) return;
  const up = (entry.dir < 2 ? 2 : 0) + (R() < 0.5 ? 0 : 1), lee = up ^ 1;   // the face it blows from, and to
  const wind = [[-1, 0], [1, 0], [0, -1], [0, 1]][up];   // (from face `up` inwards)
  // the cell t along the way, j in from the upwind face
  const cell = (t, j) => edgeCell(up, t, j);
  const gorge = [], rocks = [], shelter = new Set(), lines = [];
  for (let t = 3; t <= N - 4; t++) for (const j of [1, 2]) gorge.push(edgeCell(lee, t, j));
  for (const c of gorge) { void0[c] = 0; lvl0[c] = 0; ctx.seaCells.push(c); ctx.keep.add(c); }
  const rod = edgeCell(exit.dir, exit.pos, 3), free = [rod];
  for (const p of [entry, exit]) for (let t = p.pos - 1; t <= p.pos + 1; t++) for (let j = 0; j <= 2; j++) free.push(edgeCell(p.dir, t, j));
  const near = c => free.some(f => Math.max(Math.abs(c % N - f % N), Math.abs(((c / N) | 0) - ((f / N) | 0))) <= 1);
  for (let j = 3, k = 0; j <= N - 6; j += 3, k++) {
    const off = Math.floor(R() * 4);
    lines.push(j);
    for (let t = 2; t <= N - 3; t++) {
      if ((t + off + k) % 4 >= 2) continue;
      const c = cell(t, j);
      if (near(c)) continue;
      rocks.push(c);
      for (const d of [1, 2]) shelter.add(cell(t, j + d));
    }
  }
  for (const c of rocks) { void0[c] = 0; lvl0[c] = Math.max(lvl0[c], lvl0[cell((c % N), 0)] ?? 0) + 4; ctx.keep.add(c); }
  for (const c of rocks) shelter.delete(c);
  const rodCells = [rod]; void0[rod] = 0; ctx.keep.add(rod);
  ctx.trialKeep = new Set([...rocks, ...rodCells]);
  ctx.noFence = new Set([...ctx.noFence || [], ...rocks]);   // (bare rock: no rails along its top)
  Object.assign(ctx.trialBuild, { failed: false, wind, up, lee, rocks, gorge, shelter: [...shelter], rod: { c: rod }, keep: [...ctx.trialKeep] });
}

export const stormGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.rod.c, 0);
