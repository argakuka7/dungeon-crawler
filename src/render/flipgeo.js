// Flip's box drawn (cubegen/fliparena.js, core/flip.js): every face of its cells that shows, as
// it stands unturned. Runs in the world worker with the rest of the cube's geometry
// (render/cubegeo.js); the active cube's meshes are then turned with the box (render/flipview.js),
// the neighbours' proxies show it as it was built (the floor of the box in the terrain part, the
// walls in the stone part, the island in the wood part). The active cube draws each side of the
// box on its own (`only`: that side's cells, into the terrain part), so whichever is overhead can
// go (render/flipview.js).
// The insides of the box (the floor, each wall's inner face, the island's underside: every side
// that can be the floor) are tiled in the theme's stone, a little icy; the rest is rock, its
// strata by height; the island's top is the theme's ground.
import { S, vi, GROUP, DIR6 } from '../core/flip.js';
import { C, gradient, TOP_STOPS, SIDE_STOPS, STONE, STONE2 } from './palette.js';

const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// the direction each side's cells face into the box (the island's underside: down)
const INWARD = { [GROUP.bottom]: 2, [GROUP.px]: 1, [GROUP.nx]: 0, [GROUP.pz]: 5, [GROUP.nz]: 4, [GROUP.island]: 3 };
const ICE = C('#cfe9ff'), DEEP = C('#5f8fb8');
const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the four corners of the face of cell (x, y, z) facing direction d
function corners(x, y, z, d) {
  const [nx, ny, nz] = NORMALS[d];
  if (nx) { const X = nx > 0 ? x + 1 : x; return [[X, y, z], [X, y + 1, z], [X, y + 1, z + 1], [X, y, z + 1]]; }
  if (ny) { const Y = ny > 0 ? y + 1 : y; return [[x, Y, z], [x + 1, Y, z], [x + 1, Y, z + 1], [x, Y, z + 1]]; }
  const Z = nz > 0 ? z + 1 : z;
  return [[x, y, Z], [x + 1, y, Z], [x + 1, y + 1, Z], [x, y + 1, Z]];
}

// the faces of a box from lo to hi (box frame), each coloured by col(direction)
function box(into, lo, hi, col) {
  for (let d = 0; d < 6; d++) {
    const [nx, ny, nz] = NORMALS[d], k = nx ? 0 : ny ? 1 : 2, at = (nx || ny || nz) > 0 ? hi[k] : lo[k];
    const [a, b] = [0, 1, 2].filter(j => j !== k), pt = (p, q) => { const v = [0, 0, 0]; v[k] = at; v[a] = p; v[b] = q; return v; };
    into.quad(pt(lo[a], lo[b]), pt(hi[a], lo[b]), pt(hi[a], hi[b]), pt(lo[a], hi[b]), NORMALS[d], col(d));
  }
}
// A stair cell (core/flip.js: a slope a cell up, rising along r) drawn as four steps, its treads
// facing its side's way in
function steps(into, x, y, z, r, up, tread, rock) {
  for (let i = 0; i < 4; i++) {
    const lo = [x, y, z], hi = [x + 1, y + 1, z + 1];
    for (let k = 0; k < 3; k++) {
      if (r[k]) { if (r[k] > 0) lo[k] += i / 4; else hi[k] -= i / 4; }
      if (up[k]) { if (up[k] > 0) { lo[k] += i / 4; hi[k] = lo[k] - i / 4 + (i + 1) / 4; } else { hi[k] -= i / 4; lo[k] = hi[k] - 1 / 4; } }
    }
    box(into, lo, hi, d => NORMALS[d].every((v, k) => v === up[k]) ? tread : rock);
  }
}

// m: the arena's map (m.flip); layers: render/cubegeo.js's; only: one side's cells (core/flip.js GROUP);
// has(i): which cells are there at all (the rest is drawn as if it were air: a wall broken open,
// or a piece of it flying off, render/flipview.js)
export function buildFlipGeometry(m, layers, only = null, has = null) {
  const { solid, bottom } = m.flip, stairs = m.flip.stairs;
  const tileA = STONE.clone().lerp(ICE, 0.35), tileB = STONE2.clone().lerp(DEEP, 0.4).multiplyScalar(0.8);
  const grass = gradient(TOP_STOPS, 18);
  // (a stair cell is not whole: what is beside it shows its face to it)
  const at = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= S || y >= S || z >= S || stairs?.[vi(x, y, z)] || (has && !has(vi(x, y, z))) ? 0 : solid[vi(x, y, z)];
  for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const g = solid[vi(x, y, z)];
    if (!g || (only && g !== only) || (has && !has(vi(x, y, z)))) continue;
    const into = only ? layers[0].terrain : g === GROUP.bottom ? layers[0].terrain : g === GROUP.island ? layers[0].wood : layers[0].stone, jitter = 0.9 + 0.2 * hash(x, y, z);
    if (stairs?.[vi(x, y, z)]) {
      const up = NORMALS[INWARD[g]], [a, b] = up[0] ? [y, z] : up[1] ? [x, z] : [x, y];
      steps(into, x, y, z, DIR6[stairs[vi(x, y, z)] - 1], up, ((a + b) % 2 ? tileA : tileB).clone().multiplyScalar(jitter * 1.08),
        gradient(SIDE_STOPS, y * 2 + 2).multiplyScalar(jitter * 0.9));
      continue;
    }
    for (let d = 0; d < 6; d++) {
      const [nx, ny, nz] = NORMALS[d], n = at(x + nx, y + ny, z + nz);
      // a face shows where nothing is beside it, and a wall's face against the floor of the box
      // shows too (the floor goes while the box is upside down); a side on its own shows its
      // faces against every other side (any of them may go)
      if (n && (only ? n === g : !(n === GROUP.bottom && g !== GROUP.bottom))) continue;
      let col;
      if (d === INWARD[g] || (g === GROUP.bottom && d === 2)) {
        // the tiles: in a checker over the side's own two directions
        const [a, b] = nx ? [y, z] : ny ? [x, z] : [x, y];
        col = ((a + b) % 2 ? tileA : tileB).clone().multiplyScalar(jitter * (y >= bottom && g === GROUP.bottom ? 0.9 : 1));
      } else if (g === GROUP.island && d === 2) col = grass.clone().multiplyScalar(jitter);
      else col = gradient(SIDE_STOPS, y * 2 + 2).multiplyScalar(jitter * (ny < 0 ? 0.7 : 1));
      const [a, b, c, e] = corners(x, y, z, d);
      into.quad(a, b, c, e, NORMALS[d], col);
    }
  }
}
