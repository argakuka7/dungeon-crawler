// The cubes of the large areas (world/areas.js):
//   spiral   a quarter of the mountain on the corner the four cubes share, the ramp winding round
//            it, railed all along its open side, and in the last cube the ridge out to the exit;
//            the rest is low ground at the mountain's foot
//   foot     the hairpin's first room: low ground under the summit's cliff
//   turn     the two rooms at the hairpin's turn, climbing from the low span to the high one
//   summit   the hairpin's last room: high ground all round, where the high bridge lands
// The hairpin's gorges are span gorges (cubegen/span.js). The route search finds the way along
// the ramp (areaRoute keeps it from cutting across).
import { N, MAX_L } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { spiralAt } from '../world/areas.js';
import { edgeCell } from './portals.js';

const inner = fn => { for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z)); };

export function shapeSpiral(ctx) {
  const { spec, lvl0, void0 } = ctx, a = spec.area, p = a.piece;
  // the exit's headland on the last cube's face: railed like the ridge it ends
  // (and the pad, two cells deep)
  const head = new Set(a.i === 3 ? [-2, -1, 0, 1, 2].flatMap(t => [edgeCell(p.exit.dir, p.exit.pos + t, 0),
    ...Math.abs(t) < 2 ? [edgeCell(p.exit.dir, p.exit.pos + t, 1)] : []]) : []);
  for (const c of head) { ctx.ramp.add(c); ctx.railed.add(c); }
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), s = spiralAt(p, spec.X * N + x + 0.5, spec.Z * N + z + 0.5), rim = !x || !z || x === N - 1 || z === N - 1;
    // the outer ring is the faces' (they follow the same spiral, a cell's width off): marked where it agrees
    if (rim) { if (s.part !== 'foot' && s.part !== 'core' && Math.abs(lvl0[i] - s.level) <= 2) { ctx.ramp.add(i); ctx.railed.add(i); } continue; }
    void0[i] = 0;
    // the foot: as low as the ramp's start, so the ramp stands over it as a cliff
    if (s.part === 'foot' && !head.has(i)) { lvl0[i] = clamp(Math.min(lvl0[i], p.lo + 1), 2, MAX_L); ctx.foot.add(i); continue; }
    if (head.has(i)) { lvl0[i] = p.hi; ctx.keep.add(i); continue; }
    lvl0[i] = s.level; ctx.keep.add(i);
    if (s.part !== 'core') { ctx.ramp.add(i); ctx.railed.add(i); }
  }
  ctx.stats.mode = `${spec.kind} / spiral ${a.i + 1}/4`;
}

export function shapeFoot(ctx) {
  const { spec, lvl0, void0 } = ctx, cap = Math.max(spec.area.piece.spans[0].levels[0] + 1, 6);
  inner((x, z, i) => { void0[i] = 0; lvl0[i] = clamp(Math.min(lvl0[i], cap), 2, MAX_L); });
  ctx.stats.mode = spec.kind + ' / hairpin foot';
}

export function shapeTurn(ctx) {
  inner((x, z, i) => { ctx.void0[i] = 0; });
  ctx.stats.mode = ctx.spec.kind + ' / hairpin turn';
}

export function shapeSummit(ctx) {
  const { spec, lvl0, void0 } = ctx, top = spec.area.piece.top;
  inner((x, z, i) => { void0[i] = 0; lvl0[i] = top; });   // (no pools either, cubegen/river.js: level all over)
  ctx.stats.mode = spec.kind + ' / hairpin summit';
}

// the way up a spiral is its ramp, walked: stairs, ladders, bridges and jumps onto it, off it or
// along it cost more (any of them would be a way past part of the climb, both ways), and no way
// leaves it over the side (its rails)
export function areaRoute(ctx) {
  if (!ctx.ramp?.size) return;
  const movesFrom = ctx.movesFrom, on = f => !f.landing && ctx.ramp.has(f.c);
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest)
    .filter(m => !((m.kind === 'drop' || m.kind === 'jump') && on(f) && !on(m.to)))
    .map(m => m.kind === 'walk' || m.kind === 'drop' || (!on(f) && !on(m.to)) ? m : { ...m, cost: m.cost + 40 });
}
