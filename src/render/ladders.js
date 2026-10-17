// Ladders against cliff faces, or hanging from the edge of a floating platform, in the style
// the generator picked (themes/builds.js LADDER_STYLES): wooden ladders (two rails and rungs),
// rope ladders, vines, iron rungs bolted into the rock and holds cut into it. Every style keeps
// its rungs or holds where the wooden ladder has them (0.28 apart from a quarter over the foot),
// so the climb's hands and feet meet them (physics/climb.js, the climb clip covers two rungs).
import { DIRS, LH } from '../core/constants.js';
import { hash32, mulberry32 } from '../core/util.js';
import { POST, RAIL, ROPE, IRON, IRON2, VINE, VINE2, LEAF, LEAF2, gradient, SIDE_STOPS } from './palette.js';
import { tube } from './runframe.js';

const RUNG0 = 0.25, PITCH = 0.28;

// the ladder's frame: P(off, s, y) is the point `off` from the foot cell's centre towards the
// wall (the wall is at 0.5, the upper floor's cell centre at 1), `s` along the wall
function frameOf(l) {
  const [dx, dz] = DIRS[l.d], sx = -dz, sz = dx, cx = l.x + 0.5, cz = l.z + 0.5;
  const rungs = [];
  for (let y = l.y0 + RUNG0; y < l.y1 + 0.35; y += PITCH) rungs.push(y);
  return { dx, dz, sx, sz, top: l.y1 + 0.45, rungs, R: mulberry32(hash32(l.c * 7919 + l.d * 131 + Math.round(l.y0 * 8))),
    P: (off, s, y) => [cx + dx * off + sx * s, y, cz + dz * off + sz * s] };
}

// rails and rungs, from the foot to a little over the top
function buildWoodLadder(l, L) {
  const F = frameOf(l);
  for (const s of [-0.22, 0.22]) {   // rails: vertical boxes (a beam needs a non-vertical direction)
    const [x, , z] = F.P(0.44, s, 0);
    L.wood.box(x - 0.03, l.y0, z - 0.03, x + 0.03, F.top, z + 0.03, POST, POST);
  }
  for (const y of F.rungs) if (y < F.top - 0.1) L.wood.beam(F.P(0.44, -0.22, y), F.P(0.44, 0.22, y), 0.045, 0.045, RAIL);
}

// rope ladder: two ropes with wooden rungs, bowing a little out from the wall, over the edge to
// two stakes on the upper floor
function buildRopeLadder(l, L) {
  const F = frameOf(l), W = L.wood, h = l.y1 - l.y0;
  const off = y => 0.45 - 0.035 * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - l.y0) / h)));
  for (const s of [-0.21, 0.21]) {
    const pts = [];
    for (let i = 0; i <= Math.max(2, Math.ceil(h / 0.3)); i++) { const y = l.y0 + 0.02 + (h - 0.02) * i / Math.max(2, Math.ceil(h / 0.3)); pts.push(F.P(off(y), s, y)); }
    pts.push(F.P(0.52, s, l.y1 + 0.04), F.P(0.68, s * 0.95, l.y1 + 0.05), F.P(0.78, s * 0.9, l.y1 + 0.1));
    tube(W, pts, 0.022, ROPE, { sides: 5 });
    const [x, , z] = F.P(0.8, s * 0.9, 0);
    W.box(x - 0.03, l.y1 - 0.05, z - 0.03, x + 0.03, l.y1 + 0.2, z + 0.03, POST, POST);   // the stake
  }
  for (const y of F.rungs) if (y < l.y1 - 0.08) W.beam(F.P(off(y), -0.23, y), F.P(off(y), 0.23, y), 0.04, 0.04, RAIL);
}

// a leaf: a thin blade lying against the wall, pointing up and to a side (a closed shape: the
// back of an open face would show the section cap's colour)
function leaf(b, F, off, s, y, size, col) {
  const side = F.R() < 0.5 ? -1 : 1, a = 0.35 + F.R() * 0.9, ds = Math.cos(a) * size * side, dy = Math.sin(a) * size;
  b.beam(F.P(off - 0.012, s, y), F.P(off - 0.012, s + ds, y + dy), 0.012, size * 0.55, col);
}

// vines: two or three strands twisting up the wall and over the edge, loops for rungs, leaves
function buildVineLadder(l, L) {
  const F = frameOf(l), W = L.wood, h = l.y1 - l.y0, R = F.R, n = Math.max(3, Math.ceil(h / 0.15));
  const strands = [[-0.19, R() * 6], [0.19, R() * 6], ...(R() < 0.5 ? [[(R() - 0.5) * 0.1, R() * 6]] : [])];
  const sAt = ([s, ph], y) => s + 0.045 * Math.sin(y * 3.1 + ph);
  for (const [j, st] of strands.entries()) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const y = l.y0 + h * i / n; pts.push(F.P(0.465 - 0.012 * Math.sin(y * 5 + st[1]), sAt(st, y), y)); }
    pts.push(F.P(0.54, sAt(st, l.y1) * 0.9, l.y1 + 0.05), F.P(0.7, sAt(st, l.y1) * 0.8, l.y1 + 0.04), F.P(0.86, sAt(st, l.y1) * 0.7, l.y1 + 0.02));
    tube(W, pts, j < 2 ? 0.028 : 0.02, (i, f) => (i + f) % 3 ? VINE : VINE2, { sides: 5 });
    // leaves along it, a tuft over the edge
    for (let y = l.y0 + 0.1 + R() * 0.2; y < l.y1; y += 0.12 + R() * 0.2) leaf(W, F, 0.46, sAt(st, y) + (R() - 0.5) * 0.06, y, 0.07 + R() * 0.05, R() < 0.5 ? LEAF : LEAF2);
    for (let k = 0; k < 3; k++) leaf(W, F, 0.62 + R() * 0.2, sAt(st, l.y1) * 0.8 + (R() - 0.5) * 0.1, l.y1 + 0.04, 0.08, R() < 0.5 ? LEAF : LEAF2);
  }
  // loops between the outer strands to step on
  for (const y of F.rungs) if (y < l.y1 - 0.08) {
    const a = sAt(strands[0], y), b = sAt(strands[1], y);
    tube(W, [F.P(0.46, a, y), F.P(0.41, (a + b) / 2, y - 0.035), F.P(0.46, b, y)], 0.018, VINE2, { sides: 4 });
  }
}

// iron rungs: U-shaped staples bolted into the rock, two grab handles over the top edge
function buildIronLadder(l, L) {
  const F = frameOf(l), W = L.wood;
  for (const y of F.rungs) if (y < l.y1 - 0.08) {
    for (const s of [-0.18, 0.18]) {
      W.beam(F.P(0.5, s, y), F.P(0.39, s, y), 0.028, 0.028, IRON);
      const [x, , z] = F.P(0.49, s, 0);
      W.box(x - 0.03, y - 0.03, z - 0.03, x + 0.03, y + 0.03, z + 0.03, IRON2, IRON2);   // the bolt plate
    }
    W.beam(F.P(0.39, -0.19, y), F.P(0.39, 0.19, y), 0.03, 0.03, IRON);
  }
  for (const s of [-0.18, 0.18]) {   // grab handles: up from the edge and over
    const [x, , z] = F.P(0.55, s, 0);
    W.box(x - 0.018, l.y1 - 0.02, z - 0.018, x + 0.018, l.y1 + 0.42, z + 0.018, IRON, IRON);
    W.beam(F.P(0.55, s, l.y1 + 0.42), F.P(0.42, s, l.y1 + 0.42), 0.032, 0.032, IRON);
    const [bx, , bz] = F.P(0.42, s, 0);
    W.box(bx - 0.018, l.y1 + 0.18, bz - 0.018, bx + 0.018, l.y1 + 0.43, bz + 0.018, IRON, IRON);
  }
}

// footholds: holds cut into the rock, left and right in turn, each a dark notch with a worn lip
// of rock to stand on, and a chain from a peg on the top edge to hold on to
function buildFootholds(l, L) {
  const F = frameOf(l), T = L.terrain, W = L.wood;
  F.rungs.forEach((y, i) => {
    if (y > l.y1 - 0.1) return;
    const s = i & 1 ? 0.1 : -0.1, rock = gradient(SIDE_STOPS, y / LH);
    const [x0, , z0] = F.P(0.493, s - 0.1, 0), [x1, , z1] = F.P(0.5, s + 0.1, 0);
    T.box(Math.min(x0, x1), y, Math.min(z0, z1), Math.max(x0, x1), y + 0.11, Math.max(z0, z1), rock.clone().multiplyScalar(0.3), rock.clone().multiplyScalar(0.3));
    const [a0, , c0] = F.P(0.43, s - 0.11, 0), [a1, , c1] = F.P(0.5, s + 0.11, 0);
    T.box(Math.min(a0, a1), y - 0.04, Math.min(c0, c1), Math.max(a0, a1), y, Math.max(c0, c1), rock.clone().multiplyScalar(1.12), rock.clone().multiplyScalar(0.9));
  });
  // the chain: links in turn across and along the wall, down to a little over the foot
  const s = 0.3, [px, , pz] = F.P(0.6, s, 0);
  W.box(px - 0.03, l.y1 - 0.05, pz - 0.03, px + 0.03, l.y1 + 0.12, pz + 0.03, IRON2, IRON2);   // the peg
  W.beam(F.P(0.6, s, l.y1 + 0.07), F.P(0.47, s, l.y1 + 0.02), 0.03, 0.02, IRON);
  let i = 0;
  for (let y = l.y1; y > l.y0 + 0.35; y -= 0.09, i++) {
    const [x, , z] = F.P(0.465, s, 0), [ws, wo] = i & 1 ? [0.022, 0.008] : [0.008, 0.022];
    const hx = Math.abs(F.sx) * ws + Math.abs(F.dx) * wo, hz = Math.abs(F.sz) * ws + Math.abs(F.dz) * wo;
    W.box(x - hx, y - 0.1, z - hz, x + hx, y, z + hz, IRON, IRON2);
  }
}

// the builder of each style
export const LADDERS = { wood: buildWoodLadder, rope: buildRopeLadder, vine: buildVineLadder, iron: buildIronLadder, footholds: buildFootholds };

export function buildLadder(l, L) {
  (LADDERS[l.style] || buildWoodLadder)(l, L);
}
