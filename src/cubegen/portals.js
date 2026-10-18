// Portal pads. Side portals sit on a face (3 cells wide; 2 deep on the ground, 3 deep on an
// upper layer), down portals are wells in the ground, up portals rings on the top layer, and
// the first cube gets a spawn pad. Ground pads are flattened and protected (prot = portal id).
import { N } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';

// cell j steps in from face d at position t along it
export const edgeCell = (d, t, j) => d === 0 ? idx(N - 1 - j, t) : d === 1 ? idx(j, t) : d === 2 ? idx(t, N - 1 - j) : idx(t, j);
const square = (x, z) => { const out = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) out.push(idx(x + dx, z + dz)); return out; };
const KIND = ['side', 'side', 'side', 'side', 'down', 'up'];

export function placePortals(ctx) {
  const { R, ri, spec, lvl0, K, B } = ctx;
  const prot0 = new Uint8Array(N * N), portals = [];
  // pads (and the ground right around them) are never open to the depth below; a sky span's
  // pads stand at the edge of the void on purpose (cubegen/span.js)
  const solid = c => { if (spec.span?.sky) return; const x = c % N, z = (c / N) | 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, nz = z + dz; if (nx > 0 && nz > 0 && nx < N - 1 && nz < N - 1) ctx.void0[idx(nx, nz)] = 0; } };
  const add = p => { p.id = portals.length + 1; portals.push(p); if (!p.layer) for (const c of p.cells) { lvl0[c] = p.level; prot0[c] = p.id; solid(c); } };
  const groundLevel = cells => clamp(Math.max(...cells.map(c => lvl0[c])), 3, 14);
  // a free 3x3 spot (with a cell of margin) as close as possible to (x, z); a spout's slab, or the
  // open air and pool under its lip (cubegen/spouts.js), would take a well's or a ring's floor
  const spouts = spec.faces.flatMap((f, d) => {
    const s = f.spout, out = [];
    if (s) for (let j = 0; j < 5; j++) for (let t = Math.max(0, s.pos - 2); t <= Math.min(N - 1, s.pos + 2); t++) out.push(edgeCell(d, t, j));
    return out;
  });
  const taken = () => new Set([...spouts, ...portals.flatMap(p => p.cells)]);
  const near = (x, z) => {
    const t = taken();
    for (let r = 0; r < N; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = clamp(x + dx, 4, N - 5), cz = clamp(z + dz, 4, N - 5);
      let free = true;
      for (let a = -2; a <= 2 && free; a++) for (let b = -2; b <= 2; b++) if (t.has(idx(cx + b, cz + a))) { free = false; break; }
      if (free) return [cx, cz];
    }
    return [x, z];
  };

  for (const sp of spec.portals) {
    if (sp.dir < 4) {
      const cells = [];
      for (let t = sp.pos - 1; t <= sp.pos + 1; t++) for (let j = 0; j < (sp.layer ? 3 : 2); j++) cells.push(edgeCell(sp.dir, t, j));
      add({ kind: 'side', dir: sp.dir, pos: sp.pos, layer: sp.layer, level: sp.level, cells, c: edgeCell(sp.dir, sp.pos, 0) });
    } else {
      const [x, z] = near(sp.x, sp.z), cells = square(x, z), layer = sp.dir === 5 ? K - 1 : 0;
      add({ kind: KIND[sp.dir], dir: sp.dir, layer, level: layer ? B[layer] : groundLevel(cells), cells, c: idx(x, z) });
    }
  }
  if (spec.spawn) {
    const [x, z] = near(ri(5, N - 6), ri(5, N - 6)), cells = square(x, z);
    add({ kind: 'spawn', dir: -1, layer: 0, level: groundLevel(cells), cells, c: idx(x, z) });
  }
  ctx.portals = portals; ctx.prot0 = prot0;
  void R;
}
