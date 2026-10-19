// Terrain geometry for every floor: smooth top, cliff walls, slab underside, fluid volume.
import { N, LH, DIRS, OPP, DIRV, EDGE_CORNERS, edgePts } from '../core/constants.js';
import { idx, inb, hash32 } from '../core/util.js';
import { C, gradient, TOP_STOPS, UNDERSIDE, SOFT, fluidBed, fluidBank } from './palette.js';
import { cliffWall } from './walls.js';
import { palRow } from '../themes/fluids.js';
import { buildInteriorFloors } from './interior.js';
import { restY } from './surface.js';

const ICE_TOP = C('#cfe8f4');
const shade = (x, z) => ((x + z) & 1 ? 1.0 : 0.95) * (0.97 + (hash32(x * 31 + z * 977) % 100) / 1600);

function topColor(m, f) {
  const cs = f.cs;
  if (f.fluid) return fluidBed(f.fluid);
  if (f.soft) return SOFT.clone().multiplyScalar(shade(f.x, f.z));   // a plunge's landing
  if (f.ice) return ICE_TOP.clone().multiplyScalar(shade(f.x, f.z));   // a slide puzzle's ice (cubegen/trials/slide.js)
  const top = gradient(TOP_STOPS, (cs[0] + cs[1] + cs[2] + cs[3]) / 4 / LH).multiplyScalar(shade(f.x, f.z));
  // sandy / scorched banks next to fluids
  for (const g of f.link) if (g && g.fluid) top.lerp(fluidBank(g.fluid), 0.4);
  for (let d = 0; d < 4; d++) {
    const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
    if (!inb(nx, nz)) continue;
    const wf = m.cols[idx(nx, nz)].find(g => g.fluid && Math.abs(g.surf - f.top) <= 2);
    if (wf) top.lerp(fluidBank(wf.fluid), 0.35);
  }
  return top;
}

// our side face minus whatever the neighbouring column covers
function walls(m, f, b) {
  const fb = f.bottom * LH, cs = f.cs;
  for (let d = 0; d < 4; d++) {
    const [ea, eb] = EDGE_CORNERS[d], [na, nb] = EDGE_CORNERS[OPP[d]];
    const topLine = [cs[ea], cs[eb]];
    const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
    // (a crumbling crust's floors, render/trials.js, may be gone: walls behind them are drawn)
    const nbs = inb(nx, nz) ? m.cols[idx(nx, nz)].filter(g => !g.crust).sort((a, b) => a.bottom - b.bottom) : [];
    const [P0, P1] = edgePts(f.x, f.z, d);
    let gl = [-1e9, -1e9];
    const gaps = [];
    for (const g of nbs) { gaps.push([gl, [g.bottom * LH, g.bottom * LH]]); gl = [g.cs[na], g.cs[nb]]; }
    gaps.push([gl, [1e9, 1e9]]);
    for (const [lo, hi] of gaps) cliffWall(b, P0, P1, [[fb, fb], lo], [topLine, hi], topLine, DIRV[d], !f.fluid);
  }
}

// A fluid box from the bed up to the surface, faces hidden where a neighbour covers them. The
// surface is SUB x SUB quads a cell (its waves, render/materials.js cellMaterial), and its uvs
// say what each face is, for the shader (v: the surface's rest height, y in the cube):
//   top: u = c * 256 + the cell's shores, a bit for each neighbour that is a bank (a solid
//        reaching over the surface): 1 << d for the sides (DIRS order), 16 << i for the
//        corners (DIAG order), so the foam can follow the shore
//   side: u = -2
//   wet band: u = -1, a strip on a bank's wall just inside the fluid, from under the lowest
//        the surface sinks to over the highest it rises, darkened where the water has just been
const SUB = 4, DIAG = [[1, 1], [-1, 1], [1, -1], [-1, -1]], BAND = 0.4;
function fluidVolume(m, f, b) {
  const x = f.x, z = f.z, sy = restY(f.surf * LH), by = f.top * LH;
  // a solid in the neighbouring column that covers the corners of it next to us up to the surface
  const bank = (nx, nz, corners) => inb(nx, nz) && m.cols[idx(nx, nz)].find(g => !g.crust && !g.fluid
    && g.bottom * LH <= by + 0.01 && Math.min(...corners.map(k => g.cs[k])) >= sy);
  const hidden = d => {
    const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    if (!inb(nx, nz)) return false;
    return !!bank(nx, nz, EDGE_CORNERS[OPP[d]]) || m.cols[idx(nx, nz)].some(g => !g.crust && g.fluid && g.surf >= f.surf && g.top * LH <= sy);
  };
  let shores = 0;
  for (let d = 0; d < 4; d++) if (bank(x + DIRS[d][0], z + DIRS[d][1], EDGE_CORNERS[OPP[d]])) shores |= 1 << d;
  DIAG.forEach(([dx, dz], i) => { if (bank(x + dx, z + dz, [(dx > 0 ? 0 : 1) + (dz > 0 ? 0 : 2)])) shores |= 16 << i; });
  const white = C('#ffffff');
  b.palNow = f.pal ?? m.fluidRows?.[f.fluid] ?? palRow(m.depth ?? 0, f.fluid, 0);   // its colours (cubegen/fluidbodies.js)
  b.uvNow = [(z * N + x) * 256 + shores, sy];
  for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
    const x0 = x + i / SUB, x1 = x + (i + 1) / SUB, z0 = z + j / SUB, z1 = z + (j + 1) / SUB;
    b.quad([x0, sy, z0], [x0, sy, z1], [x1, sy, z1], [x1, sy, z0], [0, 1, 0], white);
  }
  for (let d = 0; d < 4; d++) {
    const [[ax, az], [bx, bz]] = edgePts(x, z, d);
    const at = k => [ax + (bx - ax) * k / SUB, az + (bz - az) * k / SUB];
    const g = bank(x + DIRS[d][0], z + DIRS[d][1], EDGE_CORNERS[OPP[d]]);
    if (g) {
      // the wet band, a little in front of the bank's wall, up to its top
      const [ca, cb] = EDGE_CORNERS[OPP[d]], ix = -DIRS[d][0] * 0.005, iz = -DIRS[d][1] * 0.005, lo = Math.max(by, sy - BAND);
      const ta = Math.min(g.cs[ca], sy + BAND), tb = Math.min(g.cs[cb], sy + BAND);
      b.uvNow = [-1, sy];
      b.quad([ax + ix, lo, az + iz], [bx + ix, lo, bz + iz], [bx + ix, tb, bz + iz], [ax + ix, ta, az + iz], [-DIRS[d][0], 0, -DIRS[d][1]], white);
    } else if (!hidden(d)) {
      b.uvNow = [-2, sy];
      for (let k = 0; k < SUB; k++) {
        const [px, pz] = at(k), [qx, qz] = at(k + 1);
        b.quad([px, by, pz], [qx, by, qz], [qx, sy, qz], [px, sy, pz], DIRV[d], white);
      }
    }
  }
}

export function buildFloors(m, layers) {
  if (m.interior) return buildInteriorFloors(m, layers);
  for (const f of m.floors) {
    if (f.crust) continue;   // the crumbling crust: drawn on its own, it falls (render/trials.js)
    const L = layers[f.layer], x = f.x, z = f.z, cs = f.cs;
    const P = [[x, cs[0], z], [x + 1, cs[1], z], [x, cs[2], z + 1], [x + 1, cs[3], z + 1]];
    // smooth top surface: 2 triangles, shared normals for soft shading
    const top = topColor(m, f);
    const tris = f.split ? [[0, 1, 2], [1, 3, 2]] : [[0, 1, 3], [0, 3, 2]];
    tris.forEach((t, ti) => {
      const col = top.clone().multiplyScalar(0.95 + (hash32(f.c * 2 + ti + f.layer * 977) % 100) / 1000);
      L.terrain.tri(P[t[0]], P[t[1]], P[t[2]], col, [0, 1, 0], true);
    });
    walls(m, f, L.terrain);
    const fb = f.bottom * LH;
    L.terrain.quad([x, fb, z], [x + 1, fb, z], [x + 1, fb, z + 1], [x, fb, z + 1], [0, -1, 0], UNDERSIDE);
    if (f.fluid) fluidVolume(m, f, L.fluids[f.fluid]);
  }
  const clearing = m.town || m.merchantCamp;
  if (clearing) buildClearingPaths(m, clearing.paths, layers[0].terrain);
}

// Flat clearings use narrow straight ribbons along the grid, not whole-cell paving. Each run
// is a rectangle reaching `width` to either side and past both ends, so corners close up.
// These are baked into the worker's terrain mesh, so cutaways, shadows and neighbour proxies agree.
function buildClearingPaths(m, paths, builder) {
  const y = m.floors[0].top * LH + .012, color = C('#b3a58a');
  const bounded = v => Math.max(0, Math.min(N, v));
  for (const { points, width } of paths) for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const ux = (bx - ax) / len * width, uz = (bz - az) / len * width;
    const corner = (x, z, side) => [bounded(x - uz * side), y, bounded(z + ux * side)];
    builder.quad(corner(ax - ux, az - uz, 1), corner(ax - ux, az - uz, -1), corner(bx + ux, bz + uz, -1), corner(bx + ux, bz + uz, 1), [0, 1, 0], color);
  }
}
