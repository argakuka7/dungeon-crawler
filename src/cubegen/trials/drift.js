// The drifting gate (docs/trials.md, `drift`): a ridge across the middle of the room (rock, six
// levels up) with one way round it at an end; two waypads on each side of it. The cycle goes to
// and fro across the ridge, so the next pad is always too far to catch in time, the one after it
// (on your side) near enough (cubegen/trials/index.js finishDrift orders them).
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

export function shapeDrift(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'drift', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / drifting gate`;
  // the ridge along x or z, its way round at the low end or the high: its closed end on a face with
  // no portal by the middle (a pad there would open a short way across)
  const ways = [[true, true], [true, false], [false, true], [false, false]].map(w => [w, R()]).sort((p, q) => p[1] - q[1]).map(([w]) => w);
  const closedFace = ([ax, low]) => ax ? (low ? 0 : 1) : (low ? 2 : 3);
  const pick = ways.find(w => !spec.portals.some(p => p.dir === closedFace(w) && Math.abs(p.pos - 7.5) <= 3.5));
  if (!pick) return;
  const [alongX, gapLow] = pick;
  const at = (a, b) => alongX ? idx(a, b) : idx(b, a);   // a along the ridge, b across it
  const pads = spec.portals.filter(p => p.dir < 4).flatMap(p => { const out = []; for (let t = p.pos - 2; t <= p.pos + 2; t++) for (let j = 0; j <= 3; j++) out.push(edgeCell(p.dir, Math.max(0, Math.min(N - 1, t)), j)); return out; });
  const near = new Set(pads), ridge = [];
  for (let a = 0; a < N; a++) {   // (to the cube's edge at its closed end: no way round along the outer ring)
    if (gapLow ? a <= 3 : a >= N - 4) continue;
    for (const b of [7, 8]) { const c = at(a, b); if (!near.has(c)) ridge.push(c); }
  }
  const top = Math.max(...ridge.map(c => lvl0[c])) + 6;
  for (const c of ridge) { void0[c] = 0; lvl0[c] = top; ctx.keep.add(c); }
  // the pads: two each side, far from the way round, apart from each other
  const spots = side => {
    const out = [];
    for (let a = 2; a <= N - 3; a++) for (let b = 2; b <= N - 3; b++) {
      if (side ? b < 10 || b > 13 : b > 5 || b < 2) continue;
      const c = at(a, b);
      if (near.has(c)) continue;
      out.push({ c, a, b, score: (gapLow ? a : N - a) + R() * 4 });
    }
    return out.sort((x, y) => y.score - x.score);
  };
  const chosen = [];
  for (const side of [0, 1]) {
    const list = spots(side), first = list[0], second = list.find(s => Math.abs(s.a - first.a) + Math.abs(s.b - first.b) >= 4 && Math.abs(s.a - first.a) >= 3);
    if (!first || !second) return;
    chosen.push(first, second);
  }
  // each pad a flat 1 x 1 at its ground (nothing built on it)
  for (const s of chosen) { void0[s.c] = 0; ctx.keep.add(s.c); }
  ctx.trialKeep = new Set([...ridge, ...chosen.map(s => s.c)]);
  Object.assign(ctx.trialBuild, { failed: false, ridge, pads: chosen.map(s => s.c), keep: [...ctx.trialKeep] });
}

// the route goes to the first pad (and every pad must be reached, finishDrift)
export const driftGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.pads[0], 0);
