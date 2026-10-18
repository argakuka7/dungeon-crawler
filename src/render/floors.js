// Terrain geometry for every floor: smooth top, cliff walls, slab underside, fluid volume.
import { N, LH, DIRS, OPP, DIRV, EDGE_CORNERS, edgePts } from '../core/constants.js';
import { idx, inb, hash32 } from '../core/util.js';
import { C, gradient, TOP_STOPS, UNDERSIDE, SOFT, fluidBed, fluidBank } from './palette.js';
import { cliffWall } from './walls.js';
import { buildInteriorFloors } from './interior.js';

const shade = (x, z) => ((x + z) & 1 ? 1.0 : 0.95) * (0.97 + (hash32(x * 31 + z * 977) % 100) / 1600);

function topColor(m, f) {
  const cs = f.cs;
  if (f.fluid) return fluidBed(f.fluid);
  if (f.soft) return SOFT.clone().multiplyScalar(shade(f.x, f.z));   // a plunge's landing
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

// fluid box from the bed up to the surface; faces hidden where a neighbour covers them
function fluidVolume(m, f, b) {
  const x = f.x, z = f.z, sy = f.surf * LH - 0.06, by = f.top * LH;
  const hidden = d => {
    const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    if (!inb(nx, nz)) return false;
    const [na, nb] = EDGE_CORNERS[OPP[d]];
    return m.cols[idx(nx, nz)].some(g => g.crust ? false : g.fluid ? g.surf >= f.surf && g.top * LH <= sy
      : g.bottom * LH <= by + 0.01 && Math.min(g.cs[na], g.cs[nb]) >= sy);
  };
  b.box(x, by, z, x + 1, sy, z + 1, C('#ffffff'), C('#ffffff'), {
    ny: true, px: hidden(0), nx: hidden(1), pz: hidden(2), nz: hidden(3),
  });
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
