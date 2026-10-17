// A short tunnel the way leads through: a ridge of rock across the cube, between two of its
// portals, with a passage two cells wide and 3 to 6 long bored through it at ground level and a
// flat apron at each mouth. In a cave or a canyon the ridge runs from wall to wall, so the
// tunnel is the way; on the surface it falls away towards the faces, a hill with a tunnel.
// The passage's roof is a floor of its own over the tunnel floor (`roof`, layer 0), solid from
// two units over the floor up to the ridge's top: the character walks under it and the
// cutaway opens it like a slab overhead (game/cutinfo.js). No structure stands in the passage
// or on the aprons (ctx.noCross).
import { N, MAX_L, HEAD } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { edgeCell } from './portals.js';

export const ROOF = HEAD + 1;   // levels between the tunnel floor and its roof

// the cell a portal's pad leads in from (side portals one step in, wells and rings their centre)
function cellOf(p) {
  if (p.dir < 4) { const c = edgeCell(p.dir, p.pos, 1); return [c % N, (c / N) | 0]; }
  return [p.x, p.z];
}

// learn: world.html#heights (see learn/README.md)
export function carveTunnel(ctx) {
  const { spec, R, ri, lvl0, void0, noise } = ctx;
  // between the two portals farthest apart (one of them on the ground; a lone portal: towards
  // the far side of the cube)
  if (!spec.portals.some(p => !p.layer)) return;
  const ends = spec.portals.map(cellOf);
  if (ends.length === 1) ends.push(ends[0].map(v => N - 1 - v));
  let a = null, b = null, best = 0;
  for (const p of ends) for (const q of ends) {
    const far = Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]));
    if (far > best) { best = far; a = p; b = q; }
  }
  if (!a) return;
  const ax = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1, len = ri(3, 6);
  const lo = Math.min(a[ax], b[ax]), hi = Math.max(a[ax], b[ax]);
  // the ridge stands between them, with room for an apron on either side, clear of the pads
  // of the portals on the faces along it and of wells and rings
  const options = [];
  for (let s = Math.max(lo + 3, 3); s + len - 1 <= Math.min(hi - 3, N - 4); s++) {
    const clash = spec.portals.some(p => {
      if (p.dir >= 4) { const t = ax ? p.z : p.x; return t >= s - 3 && t <= s + len + 2; }
      if ((p.dir >> 1) !== (ax ? 0 : 1)) return false;   // a face across the way: never in the ridge
      return p.pos >= s - 2 && p.pos <= s + len + 1;
    });
    if (!clash) options.push(s);
  }
  if (!options.length) return;
  const s0 = options[Math.floor(R() * options.length)], mid = s0 + (len - 1) / 2;
  // across: where the straight line between the two ends crosses the ridge
  const t = (mid - a[ax]) / ((b[ax] - a[ax]) || 1), cross = a[1 - ax] + (b[1 - ax] - a[1 - ax]) * t;
  const c0 = clamp(Math.round(cross - 0.5), 3, N - 5);   // the passage: c0 and c0 + 1
  const at = (u, v) => ax ? idx(v, u) : idx(u, v);      // u along the way, v across it
  const g = clamp(Math.round((lvl0[at(s0 - 1, c0)] + lvl0[at(s0 - 1, c0 + 1)] + lvl0[at(s0 + len, c0)] + lvl0[at(s0 + len, c0 + 1)]) / 4), 3, 12);
  const top = Math.min(MAX_L, g + ROOF + ri(4, 6)), walled = spec.walled;
  const roofs = ctx.roofs = new Map();
  for (let v = 1; v < N - 1; v++) {
    // on the surface the ridge falls away towards the faces
    const fall = walled ? 1 : clamp(1 - (Math.abs(v - c0 - 0.5) - 3) / 6, 0.35, 1);
    for (let u = s0; u < s0 + len; u++) {
      const i = at(u, v), h = Math.round(g + (top - g) * fall) + (noise(u * 0.7 + 11, v * 0.7 + 5) > 0.6 ? 1 : 0);
      void0[i] = 0; ctx.keep.add(i);
      if (v === c0 || v === c0 + 1) { lvl0[i] = g; roofs.set(i, { bottom: g + ROOF, top: Math.max(h, g + ROOF + 3) }); ctx.noCross.add(i); }
      else lvl0[i] = Math.max(Math.min(MAX_L, h), Math.min(lvl0[i], MAX_L));
    }
  }
  // the aprons: flat ground at the tunnel's level in front of both mouths
  for (const [u0, u1] of [[s0 - 2, s0 - 1], [s0 + len, s0 + len + 1]]) for (let u = u0; u <= u1; u++)
    for (let v = c0 - 1; v <= c0 + 2; v++) { const i = at(u, v); lvl0[i] = g; void0[i] = 0; ctx.keep.add(i); ctx.noCross.add(i); }
  ctx.seaCells = ctx.seaCells.filter(i => !ctx.keep.has(i));
  ctx.tunnel = { axis: ax, from: s0, len, at: c0, level: g };
  ctx.stats.mode += ' + tunnel';
}
