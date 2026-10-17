// The parts a cube is drawn from, the same for the active cube and its low-detail proxy: one
// merged, indexed and quantized geometry per part (terrain, structure stone, wood, each fluid's
// surface and each fluid's falls). Runs in the world worker (no three.js renderer here); the main
// thread only wraps the arrays (render/partmeshes.js) and decides how each part looks
// (render/materials.js). A new part added here shows up in both the cube and its proxy.
import { N, LH, DIRS, FLUIDS, FLUID_NAME } from '../core/constants.js';

// kind: 'solid' (vertex coloured, cut with a section cap of `cap`; `sway`: with uvs saying how
// far each vertex swings in the wind, render/materials.js swayMaterial), 'fluid' (a surface of
// `fluid`), 'fall' (a sheet of `fluid` pouring over an edge, with uvs for its scrolling streaks)
export const PARTS = [
  { name: 'terrain', kind: 'solid', cap: 'rock' },
  { name: 'stone', kind: 'solid', cap: 'stone' },
  { name: 'wood', kind: 'solid', cap: 'wood' },
  { name: 'flags', kind: 'solid', cap: 'wood', sway: true },   // prayer flags (render/bridges.js)
  ...FLUIDS.map(t => ({ name: FLUID_NAME[t], kind: 'fluid', fluid: t })),
  ...FLUIDS.map(t => ({ name: FLUID_NAME[t] + '-fall', kind: 'fall', fluid: t })),
];

// Vertex layout (all padded to four components so every attribute is 4-byte aligned, which
// Metal and D3D need to use the data as is):
//   position Int16 x4 in units of `scale` (1/1024: +-32 world units, a cube spans -0.6..17)
//   normal   Int8 x4, normalized
//   color    Uint16 x4, normalized (solids only; alpha 1); linear colours keep their dark shades
//   uv       Float32 x2 (falls and swaying solids only)
// 20 bytes a vertex for solids instead of 36, and shared corners are stored once.
const SCALE = 1 / 1024, LIMIT = 32767;

// layers: buildCubeGeometry's per-layer GeoBuilder arrays; m: the map (for the falls)
// -> { parts: { [name]: { pos, nor, col?, uv?, index } }, scale, bounds: [x0, y0, z0, x1, y1, z1] }
export function packParts(layers, m) {
  const sources = {};
  for (const part of PARTS) {
    const list = part.kind === 'solid' ? layers.map(L => L[part.name])
      : part.kind === 'fluid' ? layers.map(L => L.fluids[part.fluid])
      : [fallSheets(m, part.fluid)];
    sources[part.name] = list.filter(a => a && a.pos.length);
  }
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const list of Object.values(sources)) for (const a of list) for (let i = 0; i < a.pos.length; i += 3)
    for (let j = 0; j < 3; j++) { bounds[j] = Math.min(bounds[j], a.pos[i + j]); bounds[j + 3] = Math.max(bounds[j + 3], a.pos[i + j]); }
  // coarser steps only if something reaches unusually far out
  let scale = SCALE;
  while (Math.max(...bounds.map(Math.abs).filter(Number.isFinite), 0) / scale > LIMIT) scale *= 2;
  const parts = {};
  for (const part of PARTS) if (sources[part.name].length) parts[part.name] = pack(sources[part.name], scale, part);
  if (!Number.isFinite(bounds[0])) bounds.fill(0);
  return { parts, scale, bounds };
}

// the buffers to transfer (instead of copy) when posting the parts
export function partBuffers(geo) {
  const out = [];
  for (const p of Object.values(geo.parts)) for (const a of [p.pos, p.nor, p.col, p.uv, p.index]) if (a) out.push(a.buffer);
  return out;
}

// triangle soup -> indexed, quantized arrays; identical corners (after quantizing) are merged
function pack(list, scale, { kind, sway }) {
  const color = kind === 'solid', uvs = kind === 'fall' || !!sway;
  let total = 0;
  for (const a of list) total += a.pos.length / 3;
  const pos = new Int16Array(total * 4), nor = new Int8Array(total * 4);
  const col = color ? new Uint16Array(total * 4) : null, uv = uvs ? new Float32Array(total * 2) : null;
  const index = new Uint32Array(total), seen = new Map();
  let n = 0, k = 0;
  const q = new Int32Array(6), c = new Int32Array(3);
  for (const a of list) for (let i = 0; i < a.pos.length / 3; i++) {
    for (let j = 0; j < 3; j++) {
      q[j] = Math.round(a.pos[i * 3 + j] / scale);
      q[j + 3] = Math.max(-127, Math.min(127, Math.round(a.nor[i * 3 + j] * 127)));
      if (color) c[j] = Math.max(0, Math.min(65535, Math.round(a.col[i * 3 + j] * 65535)));
    }
    let key = q.join(',');
    if (color) key += ',' + c.join(',');
    if (uvs) key += ',' + a.uv[i * 2] + ',' + a.uv[i * 2 + 1];
    let v = seen.get(key);
    if (v === undefined) {
      v = n++;
      seen.set(key, v);
      for (let j = 0; j < 3; j++) { pos[v * 4 + j] = q[j]; nor[v * 4 + j] = q[j + 3]; }
      if (color) { for (let j = 0; j < 3; j++) col[v * 4 + j] = c[j]; col[v * 4 + 3] = 65535; }
      if (uvs) { uv[v * 2] = a.uv[i * 2]; uv[v * 2 + 1] = a.uv[i * 2 + 1]; }
    }
    index[k++] = v;
  }
  return {
    pos: pos.slice(0, n * 4), nor: nor.slice(0, n * 4), col: col ? col.slice(0, n * 4) : null, uv: uv ? uv.slice(0, n * 2) : null,
    index: n <= 65535 ? Uint16Array.from(index) : index,
  };
}

// The sheets of the falls of one fluid: a thin box pouring over the slab edge (splash rings and
// lights stay with the active cube, render/falls.js). v runs up the sheet, 0.7 per world unit.
function fallSheets(m, type) {
  const pos = [], nor = [], uv = [];
  const quad = (a, b, c, d, n, ua, ub) => {
    for (const [p, t] of [[a, ua[0]], [b, ua[1]], [c, ub[1]], [a, ua[0]], [c, ub[1]], [d, ub[0]]]) { pos.push(...p); nor.push(...n); uv.push(...t); }
  };
  // falls of lower layers first: drawn back to front from above
  for (const f of (m.falls || []).filter(f => f.type === type).sort((a, b) => a.layer - b.layer)) {
    const [dx, dz] = DIRS[f.d], bx = f.c % N, bz = (f.c / N) | 0;
    const yTop = f.top * LH - 0.04, y0 = f.bot * LH - 0.08, h = yTop - y0;
    const ex = dx > 0 ? bx : dx < 0 ? bx + 1 : bx + 0.5, ez = dz > 0 ? bz : dz < 0 ? bz + 1 : bz + 0.5;
    const cx = ex + dx * 0.12, cz = ez + dz * 0.12, hx = (dx ? 0.22 : 0.84) / 2, hz = (dx ? 0.84 : 0.22) / 2;
    const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz, y1 = yTop, v = h * 0.7;
    // sides: u across, v up
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[0, 0], [1, 0]], [[0, v], [1, v]]);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[0, 0], [1, 0]], [[0, v], [1, v]]);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[0, 0], [1, 0]], [[0, v], [1, v]]);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[0, 0], [1, 0]], [[0, v], [1, v]]);
    // top and bottom
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[0, 0], [1, 0]], [[0, v], [1, v]]);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [1, 0]], [[0, v], [1, v]]);
  }
  return { pos, nor, uv };
}
