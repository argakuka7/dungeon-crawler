// Hold the beacon (docs/trials.md, `siege`): the beacon in the middle of a flat ring (radius 3) and
// 2-3 spawn mouths (dark arches) by the room's edges, at least 8 cells from it, each with a way to
// the ring (cubegen/trials/index.js finishSiege checks it).
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

export const RING = 3, MOUTH_FAR = 6.5;   // (a mouth that far from the beacon: 8 fits only the corners of a 16-cell room)
export function shapeSiege(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'siege', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / siege`;
  const pads = spec.portals.filter(p => p.dir < 4).map(p => [edgeCell(p.dir, p.pos, 1) % N, (edgeCell(p.dir, p.pos, 1) / N) | 0]);
  const spots = [];
  for (let z = 6; z <= 9; z++) for (let x = 6; x <= 9; x++) spots.push({ x, z, d: Math.min(9, ...pads.map(([px, pz]) => Math.hypot(px - x, pz - z))) + R() * 1.5 });
  spots.sort((a, b) => b.d - a.d);
  const { x: cx, z: cz } = spots[0], ring = [];
  // (flat a cell further out than the ring, so the smoothing leaves the ring itself flat)
  const flat = [];
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    const d = Math.hypot(x - cx, z - cz);
    if (d <= RING + 1.5) flat.push(idx(x, z));
    if (d <= RING + 0.5) ring.push(idx(x, z));
  }
  const level = Math.max(3, Math.round(flat.reduce((s, c) => s + lvl0[c], 0) / flat.length));
  for (const c of flat) { void0[c] = 0; lvl0[c] = level; ctx.keep.add(c); }
  // the mouths: by the edge (two cells in), far from the beacon and the portals, apart
  const options = [];
  for (let z = 2; z <= N - 3; z++) for (let x = 2; x <= N - 3; x++) {
    if (Math.min(x, z, N - 1 - x, N - 1 - z) !== 2) continue;
    if (Math.hypot(x - cx, z - cz) < MOUTH_FAR || pads.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4)) continue;
    options.push({ x, z, r: R() });
  }
  options.sort((a, b) => a.r - b.r);
  const mouths = [], want = 2 + (R() < 0.5 ? 1 : 0);
  for (const o of options) if (mouths.length < want && mouths.every(m => Math.hypot(m.x - o.x, m.z - o.z) >= 5)) mouths.push(o);
  if (mouths.length < 2) return;
  for (const m of mouths) { const c = idx(m.x, m.z); void0[c] = 0; ctx.keep.add(c); }
  ctx.trialKeep = new Set([...flat, ...mouths.map(m => idx(m.x, m.z))]);
  Object.assign(ctx.trialBuild, { failed: false, beacon: { c: idx(cx, cz), x: cx, z: cz, level }, ring, mouths, keep: [...ctx.trialKeep] });
}

export const siegeGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.beacon.c, 0);
