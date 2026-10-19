// Falls across a side face (world/spouts.js). The source cube gets a strip of the spout's
// layer running in from the face (3 wide, 5 deep) with a channel down its middle; the other
// cube gets a lip of that layer on its outer ring (like upper-layer portal pads, so the face
// matches), and the water falls off the lip's inner edge into a pool on the ground inside.
import { N, DIRS, FLUID_NAME } from '../core/constants.js';
import { edgeCell } from './portals.js';
import { pool } from './cascades.js';

export const SPOUT = 99;   // prot id of spout slabs: flat, kept, no structures through them

// ground stage (after cascadeGround): which cells get spout slabs, the catch pools
export function spoutGround(ctx) {
  const { spec, K, sky, void0 } = ctx;
  ctx.spouts = [];
  spec.faces.forEach((f, d) => {
    const s = f.spout;
    if (!s || s.layer >= K) return;
    const src = s.from === spec.key, deep = src ? 5 : 1, cells = [], chan = [];
    for (let j = 0; j < deep; j++) for (let t = s.pos - 1; t <= s.pos + 1; t++) {
      cells.push(edgeCell(d, t, j));
      if (t === s.pos && (!src || j < deep - 1)) chan.push(edgeCell(d, t, j));   // a bank at the back
    }
    const sp = { ...s, d, cells, chan, src };
    if (!src) {
      // open air from the lip down to a pool just inside it
      for (let j = 1; j <= 3; j++) for (let t = s.pos - 2; t <= s.pos + 2; t++) void0[edgeCell(d, t, j)] = 0;
      for (let j = 1; j <= 2; j++) for (let t = s.pos - 1; t <= s.pos + 1; t++) sky.add(edgeCell(d, t, j));
      const c1 = edgeCell(d, s.pos, 1), [dx, dz] = DIRS[d];   // DIRS[d] points out through the face
      const [pc, S] = pool(ctx, c1 % N + 0.5 - dx * 0.5, ((c1 / N) | 0) + 0.5 - dz * 0.5, 1.6, s.type);
      pc.forEach(c => sky.add(c));
      sp.fall = { c: c1, d: d ^ 1, top: ctx.B[s.layer] - 1, bot: S, type: s.type, layer: 0, spout: true };   // (spout: from the cube beside)
    }
    ctx.spouts.push(sp);
  });
}

// slab stage: the spout cells on layer k (mask / pad map of buildSlabs)
export function spoutSlabs(ctx, k, mask, padOf) {
  for (const s of ctx.spouts) if (s.layer === k) for (const c of s.cells) { mask[c] = 1; padOf.set(c, SPOUT); }
}

// after the streams: water in the channels (surface a level under the banks), the fall
export function spoutWater(ctx) {
  for (const s of ctx.spouts) {
    const S = ctx.B[s.layer] - 1, bed = S - 2;
    for (const c of s.chan) {
      const f = ctx.layerFloor(c, s.layer);
      if (!f) continue;
      Object.assign(f, { fluid: s.type, surf: S, top: bed });
      if (!f.merged) f.bottom = Math.min(f.bottom, bed - 1);
    }
    if (s.fall) ctx.falls.push(s.fall);
    ctx.stats.fluids.push(FLUID_NAME[s.type] + (s.src ? ' stream into the next cube' : ' fall from the next cube'));
  }
}
