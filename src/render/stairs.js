// Stair flights and stone landings.
import { N } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { STONE, STONE2, CHEEK, CAP, SOFFIT, PIER, WOOD, WOOD2, BEAM, POST } from './palette.js';
import { runFrame, slab } from './runframe.js';

export const pillarBox = (b, q, col) => {
  const x = q.c % N, z = (q.c / N) | 0;
  b.box(x + q.x0, q.bottom, z + q.z0, x + q.x1, q.top, z + q.z1, col, col);
};

// stone platform with low parapets on the sides no flight connects to
export function buildLanding(r, L) {
  const S = L.stone, p = r.pieces[0], x = r.from.x, z = r.from.z, y = r.y0;
  S.box(x + 0.02, p.base, z + 0.02, x + 0.98, y, z + 0.98, (x + z) & 1 ? STONE : STONE2, CHEEK);
  for (let d = 0; d < 4; d++) {
    if (r.conn.has(d)) continue;
    const e = [[x + 0.88, z, x + 1, z + 1], [x, z, x + 0.12, z + 1], [x, z + 0.88, x + 1, z + 1], [x, z, x + 1, z + 0.12]][d];
    S.box(e[0], y, e[1], e[2], y + 0.28, e[3], CAP, CHEEK);
  }
  for (const q of r.pillars || []) pillarBox(S, q, PIER);
}

// uniform steps over the whole flight, side walls, solid where the flight rests on ground;
// stone, or wood for `r.wood` (inside houses). A step straddling a cell edge reaches down to the
// lower ground of the cells it spans, or it would leave a hole over the lower one.
export function buildStair(r, L) {
  const F = runFrame(r), k = r.k, S = r.wood ? L.wood : L.stone;
  const [STEP_A, STEP_B, SIDE, RIM, UNDER] = r.wood ? [WOOD, WOOD2, BEAM, POST, BEAM] : [STONE, STONE2, CHEEK, CAP, SOFFIT];
  const rise = r.y1 - r.y0, n = Math.max(2, Math.round(Math.abs(rise) / 0.2)), half = Math.abs(rise) / n / 2;
  for (let i = 0; i < n; i++) {
    const s0 = i * k / n, s1 = (i + 1) * k / n, top = r.y0 + rise * (i + 0.5) / n;
    let bot = Infinity;
    for (let j = clamp(Math.floor(s0 + 1e-6), 0, k - 1); j <= clamp(Math.ceil(s1 - 1e-6) - 1, 0, k - 1); j++) {
      const p = r.pieces[j];
      bot = Math.min(bot, p.supported ? p.base : top - 0.16);
    }
    slab(S, F, s0, s1, -0.4, 0.4, bot, top, bot, top, i & 1 ? STEP_A : STEP_B, SIDE);
  }
  for (let j = 0; j < k; j++) {
    const p = r.pieces[j], ya = F.Y(j), yb = F.Y(j + 1);
    const ba = p.supported ? p.base : ya - 0.4, bb = p.supported ? p.base : yb - 0.4;
    for (const [w0, w1] of [[-0.5, -0.4], [0.4, 0.5]]) slab(S, F, j, j + 1, w0, w1, ba, ya + half + 0.14, bb, yb + half + 0.14, RIM, SIDE);
    if (!p.supported) slab(S, F, j, j + 1, -0.4, 0.4, ya - 0.36, ya - half - 0.1, yb - 0.36, yb - half - 0.1, UNDER, UNDER);
  }
}
