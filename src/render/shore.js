// The ground under a fluid's surface, for its shores (materials.js cellMaterial): at a point of a
// surface, how high the ground under it stands (world units, not over the surface: the surface
// rises and falls) and how steep it is there (rise per unit across). The shader finds the
// waterline from them wherever the water meets sloping ground, as the tide moves it:
// (water - ground) / slope away. Where the ground meets the water in a wall instead (a bank at a
// cell's edge) its slope says nothing; the wall's foam comes from the cells round about
// (render/floors.js shores, section.js WATER_SHORE for a standing fluid).
// The same for the cube's own fluids (render/floors.js fluidVolume) and the standing ones
// (render/trials.js), so a shore looks the same whichever fluid it is. Pure: the world worker
// builds the cube's fluids with it.
import { N } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';

// the height of floor f's top at (x, z) (the cube's coordinates; in its cell or on its edge)
export const groundAt = (f, x, z) => floorY(f, x - f.x, z - f.z);

// how steep floor f's top is at (fx, fz) in its cell: its triangle's slope there (render/floors.js:
// two triangles a cell, split along one diagonal or the other)
function triangleSlope(f, fx, fz) {
  const c = f.cs;
  if (!f.split) return fx >= fz ? Math.hypot(c[1] - c[0], c[3] - c[1]) : Math.hypot(c[3] - c[2], c[2] - c[0]);
  return fx + fz <= 1 ? Math.hypot(c[1] - c[0], c[2] - c[0]) : Math.hypot(c[3] - c[2], c[3] - c[1]);
}

// How steep the ground under floor f is at (x, z): its slope averaged round the point, over f's
// triangles and those of the floors that carry its ground on without a step (a slope running on
// into the next cell), so that a point on a cell's edge has the same slope from either side and
// the shore runs on smoothly across it. m: the map (its columns).
const NUDGE = 1e-3, STEP = 0.02;
export function slopeAt(m, f, x, z) {
  const y = groundAt(f, x, z);
  let sum = 0, n = 0;
  for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const px = x + ox * NUDGE, pz = z + oz * NUDGE, cx = Math.floor(px), cz = Math.floor(pz);
    const g = cx === f.x && cz === f.z ? f : cx < 0 || cz < 0 || cx >= N || cz >= N ? null
      : m.cols[cz * N + cx].find(g => !g.crust && Math.abs(groundAt(g, px, pz) - y) < STEP);
    if (!g) continue;
    sum += triangleSlope(g, px - g.x, pz - g.z); n++;
  }
  return n ? sum / n : 0;
}
