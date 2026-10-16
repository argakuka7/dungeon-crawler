// The cubes of a gorge span (world/spans.js): the valley under the bridge and the island at the
// end of one. A gorge cube is the valley's cross-section all the way through: a ledge along the
// room it starts from (a headland where the bridge leaves high up), a sheer drop to the valley
// floor and the river, and the far side's bank, a pinnacle or the island's foot. Its bridge is
// laid down whole, pad to pad (spanBridge), instead of being found by the route search, whose
// bridges are short and nearly level. An island is a plateau standing in the valley.
import { N, LH, MAX_L, SHEAD, DIRS } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { valleyFloor } from '../world/spans.js';
import { edgeCell } from './portals.js';

// how far a span's deck sags in the middle (units), by style; the generator keeps the ground clear of it
export const spanSag = (style, k) => style === 'rope' ? Math.min(0.9, 0.07 * k) : style === 'plank' ? Math.min(0.3, 0.03 * k) : 0;

// cell (x, z) in span terms: u along the span (0 at the face towards end0), w across it
const along = (dir, x, z) => [[x, z], [N - 1 - x, z], [z, x], [N - 1 - z, x]][dir];

export function shapeGorge(ctx) {
  const { lvl0, spec } = ctx, s = spec.span, back = s.dir ^ 1;
  const P0 = spec.faces[back].profile, P1 = spec.faces[s.dir].profile;
  const k = N - 4, sag = spanSag(s.style, k) / LH;
  // the deck's level over cell u (its run covers u = 2 .. N - 3)
  const deck = u => { const T = (u - 1.5) / k; return s.hi + (s.lo - s.hi) * T - sag * Math.sin(Math.PI * clamp(T, 0, 1)); };
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const [u, w] = along(s.dir, x, z), i = idx(x, z);
    let v = valleyFloor(spec.noise, spec.X * N + x + 0.5, spec.Z * N + z + 0.5, spec.Y);
    if (u <= 1) v = P0[w];                                   // the ledge, headland or pinnacle
    else if (u >= N - 2) v = P1[w];
    // a low bank comes up to its room, so the valley floor is never a pit without a way out
    else if (u === 2 && s.room0 && P0[w] < 8) v = Math.max(v, P0[w] - 2);
    else if (u === N - 3 && s.room1 && P1[w] < 8) v = Math.max(v, P1[w] - 2);
    // under the deck: room to walk beneath it
    if (w === s.pos && u >= 2 && u <= N - 3) v = Math.min(v, Math.floor(deck(u) - 1 - SHEAD));
    lvl0[i] = clamp(v, 0, MAX_L);
  }
  ctx.stats.mode = spec.kind + ' / gorge';
}

export function shapeIsland(ctx) {
  const { lvl0, spec, noise } = ctx, s = spec.span, back = s.dir ^ 1, P = spec.faces[back].profile;
  const cw = clamp(s.pos, 5, N - 6), rw = 4.6 + ctx.R() * 0.8, ru = 5.2 + ctx.R() * 0.6;
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const [u, w] = along(s.dir, x, z), i = idx(x, z);
    const du = Math.abs(u + 0.5 - 7.2) / ru, dw = Math.abs(w + 0.5 - cw - 0.5) / rw;
    const on = du ** 4 + dw ** 4 + (noise(x * 0.6 + 7, z * 0.6 + 3) - 0.5) * 0.7 < 1 || (u <= 2 && Math.abs(w - s.pos) <= 1);
    lvl0[i] = u <= 1 && !on ? P[w] : on ? s.level : valleyFloor(spec.noise, spec.X * N + x + 0.5, spec.Z * N + z + 0.5, spec.Y);
  }
  ctx.stats.mode = spec.kind + ' / island';
}

// the gorge's bridge as a move from pad to pad (both ways), for the route search to take
export function spanBridge(ctx) {
  const s = ctx.spec.span;
  if (s?.role !== 'gorge') return;
  const back = s.dir ^ 1, pad = (d, j) => ctx.cols[edgeCell(d, s.pos, j)].find(f => f.prot);
  const a = pad(back, 1), b = pad(s.dir, 1);
  if (!a || !b) return;
  const cells = [];
  for (let j = 2; j <= N - 3; j++) cells.push(edgeCell(back, s.pos, j));
  const [dx, dz] = DIRS[s.dir];
  ctx.extraMoves = new Map([
    [a.id, [{ kind: 'bridge', from: a, to: b, d: s.dir, dx, dz, cells, cost: 1, span: true }]],
    [b.id, [{ kind: 'bridge', from: b, to: a, d: back, dx: -dx, dz: -dz, cells: [...cells].reverse(), cost: 1, span: true }]],
  ]);
}
