// The static geometry of a cube (terrain, structures, fluid volumes) as plain typed arrays per
// layer, and packed into the parts it is drawn from (render/parts.js). Runs in the world worker;
// the main thread only wraps the parts into meshes, for the active cube as well as for the
// low-detail neighbours.
import { N, BASE, FLUIDS } from '../core/constants.js';
import { packParts } from './parts.js';
import { GeoBuilder } from './builder.js';
import { BEDROCK, usePalette } from './palette.js';
import { themeOf } from '../themes/depth.js';
import { buildFloors } from './floors.js';
import { buildStructures } from './structures.js';
import { buildInteriorWalls } from './interior.js';

export function buildCubeGeometry(m) {
  usePalette(themeOf(m));
  const layers = Array.from({ length: m.K }, () => ({
    terrain: new GeoBuilder(), stone: new GeoBuilder(), wood: new GeoBuilder(), flags: new GeoBuilder({ sway: true }),
    fluids: Object.fromEntries(FLUIDS.map(t => [t, new GeoBuilder()])),
  }));
  // bedrock under every column that is not open to the depth below
  // (inside houses the floors reach down themselves, render/interior.js)
  const solid = (x, z) => !m.interior && x >= 0 && z >= 0 && x < N && z < N && m.cols[z * N + x].some(f => f.layer === 0 || f.merged && f.bottom === 0);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (solid(x, z))
    layers[0].terrain.box(x, -BASE, z, x + 1, 0, z + 1, BEDROCK[0], BEDROCK[1],
      { py: true, px: solid(x + 1, z), nx: solid(x - 1, z), pz: solid(x, z + 1), nz: solid(x, z - 1) });
  buildFloors(m, layers);
  buildStructures(m, layers);
  if (m.interior) buildInteriorWalls(m, layers);
  const arr = b => b.pos.length ? b.arrays() : null;
  return layers.map(L => ({
    terrain: arr(L.terrain), stone: arr(L.stone), wood: arr(L.wood), flags: arr(L.flags),
    fluids: Object.fromEntries(FLUIDS.map(t => [t, arr(L.fluids[t])])),
  }));
}

// what the main thread gets: the cube's parts (render/parts.js packParts)
export const buildCubeParts = m => packParts(buildCubeGeometry(m), m);
