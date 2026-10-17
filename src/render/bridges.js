// Bridge styles (picked per theme in themes/builds.js): stone arches, sagging plank bridges,
// rope bridges (spaced slats hanging between two posts, rope hand lines) and iron bridges
// (a flat girder deck with railings and bracing).
import { STONE, STONE2, CHEEK, CAP, PIER, WOOD, WOOD2, BEAM, ROPE, IRON, IRON2 } from './palette.js';
import { runFrame, slab } from './runframe.js';
import { pillarBox } from './stairs.js';

// stone deck with parapets, carried by round arches that spring from the banks / piers
export function buildStoneBridge(r, L) {
  const S = L.stone, F = runFrame(r), k = r.k, segs = k * 4;
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs, ya = F.Y(s0), yb = F.Y(s1);
    slab(S, F, s0, s1, -0.5, 0.5, ya - 0.25, ya, yb - 0.25, yb, (i >> 1) & 1 ? STONE : STONE2, CHEEK);
    for (const [w0, w1] of [[-0.5, -0.4], [0.4, 0.5]]) slab(S, F, s0, s1, w0, w1, ya, ya + 0.3, yb, yb + 0.3, CAP, CHEEK);
  }
  const bounds = [0, ...(r.splits || []), k];
  for (let a = 0; a + 1 < bounds.length; a++) {
    const s0 = bounds[a], s1 = bounds[a + 1], span = s1 - s0;
    let deckMin = Infinity;
    for (let i = 0; i <= 8; i++) deckMin = Math.min(deckMin, F.Y(s0 + span * i / 8) - 0.25);
    const H = Math.min(span * 0.5, 1.1), spring = deckMin - H - 0.12;
    const under = t => spring + H * Math.sqrt(Math.max(0, 1 - (2 * (t - s0) / span - 1) ** 2));
    const steps = Math.max(8, Math.round(span * 10));
    for (let i = 0; i < steps; i++) {
      const sa = s0 + span * i / steps, sb = s0 + span * (i + 1) / steps;
      slab(S, F, sa, sb, -0.45, 0.45, under(sa), F.Y(sa) - 0.25, under(sb), F.Y(sb) - 0.25, CHEEK, CHEEK);
    }
  }
  for (const q of r.pillars || []) pillarBox(S, q, PIER);
}

// plank bridge: sagging deck, stringers, posts with rope rails, timber legs
export function buildPlankBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k;
  const planks = Math.round(k / 0.2);
  for (let i = 0; i < planks; i++) {
    const sc = (i + 0.5) * k / planks, sa = sc - 0.088, sb = sc + 0.088;
    slab(W, F, sa, sb, -0.46, 0.46, F.Y(sa) - 0.07, F.Y(sa), F.Y(sb) - 0.07, F.Y(sb), i & 1 ? WOOD : WOOD2, BEAM);
  }
  const segs = k * 4;
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs;
    for (const [w0, w1] of [[-0.42, -0.32], [0.32, 0.42]])
      slab(W, F, s0, s1, w0, w1, F.Y(s0) - 0.2, F.Y(s0) - 0.07, F.Y(s1) - 0.2, F.Y(s1) - 0.07, BEAM, BEAM);
  }
  for (const side of [-0.47, 0.47]) {
    let last = null;
    for (let s = 0; s <= k + 1e-6; s += 0.5) {
      const [px, py, pz] = F.P(s, side, F.Y(s));
      W.box(px - 0.04, py - 0.1, pz - 0.04, px + 0.04, py + 0.56, pz + 0.04, BEAM, BEAM);
      if (last) for (const ry of [0.28, 0.5]) W.beam([last[0], last[1] + ry, last[2]], [px, py + ry, pz], 0.035, 0.035, ROPE);
      last = [px, py, pz];
    }
  }
  for (const q of r.pillars || []) pillarBox(W, q, BEAM);
}

// rope bridge: spaced slats between two posts, rope hand lines
export function buildRopeBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k, slats = Math.round(k / 0.26);
  for (let i = 0; i < slats; i++) {
    const sc = (i + 0.5) * k / slats, sa = sc - 0.09, sb = sc + 0.09, w = 0.4 + (i % 3) * 0.03;
    slab(W, F, sa, sb, -w, w, F.Y(sa) - 0.06, F.Y(sa), F.Y(sb) - 0.06, F.Y(sb), i & 1 ? WOOD : WOOD2, BEAM);
  }
  // a post at each end, rope hand lines and the ropes under the slats
  for (const side of [-0.45, 0.45]) {
    for (const s of [0, k]) {
      const [px, py, pz] = F.P(s, side, F.Y(s));
      W.box(px - 0.05, py - 0.15, pz - 0.05, px + 0.05, py + 0.7, pz + 0.05, BEAM, BEAM);
    }
    let last = null;
    for (let i = 0; i <= k * 4; i++) {
      const s = i / 4, [px, py, pz] = F.P(s, side, F.Y(s));
      if (last) for (const ry of [-0.04, 0.6]) W.beam([last[0], last[1] + ry, last[2]], [px, py + ry, pz], 0.03, 0.03, ROPE);
      last = [px, py, pz];
    }
  }
}

// iron bridge: flat girder deck with railings and bracing
export function buildIronBridge(r, L) {
  const W = L.wood, F = runFrame(r), k = r.k, segs = k * 4;
  for (let i = 0; i < segs; i++) {
    const s0 = i * k / segs, s1 = (i + 1) * k / segs, ya = F.Y(s0), yb = F.Y(s1);
    slab(W, F, s0, s1, -0.48, 0.48, ya - 0.08, ya, yb - 0.08, yb, i & 1 ? IRON : IRON2, IRON2);   // deck plates
    for (const [w0, w1] of [[-0.48, -0.4], [0.4, 0.48]]) slab(W, F, s0, s1, w0, w1, ya - 0.32, ya - 0.08, yb - 0.32, yb - 0.08, IRON2, IRON2);   // girders
  }
  for (const side of [-0.45, 0.45]) {
    let last = null;
    for (let s = 0; s <= k + 1e-6; s += 0.5) {
      const [px, py, pz] = F.P(s, side, F.Y(s));
      W.box(px - 0.03, py, pz - 0.03, px + 0.03, py + 0.55, pz + 0.03, IRON, IRON);
      if (last) {
        W.beam([last[0], last[1] + 0.55, last[2]], [px, py + 0.55, pz], 0.04, 0.04, IRON);
        W.beam([last[0], last[1] + 0.05, last[2]], [px, py + 0.5, pz], 0.025, 0.025, IRON2);   // bracing
      }
      last = [px, py, pz];
    }
  }
  for (const q of r.pillars || []) pillarBox(W, q, IRON2);
}

// the builder of each style (themes/builds.js BRIDGE_STYLES)
export const BRIDGES = { stone: buildStoneBridge, plank: buildPlankBridge, rope: buildRopeBridge, iron: buildIronBridge };
