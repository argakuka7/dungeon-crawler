// Render-only discovery and distance budget. A cube shows once visited, or once sighted (the
// far side of a gorge span, seen from across it: game/flow.js sightSpans); sighting is not a
// visit, so it never opens faces or shows on the minimap. Cubes are selected conservatively for any
// player position inside the active cube; the renderer tests their actual bounds each frame.
import { N } from './constants.js';
import { key, parse } from '../world/coords.js';

export const VIEW_DISTANCE = 3 * N;
export const VIEW_FADE = N / 2;

export function discoveredCubes(cubes, active, distance = VIEW_DISTANCE) {
  const [x, y, z] = parse(active), radius = Math.ceil(distance / N) + 1, list = [];
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    if (!dx && !dz) continue;
    // Minimum distance between the two cube footprints, not their centers.
    const gapX = Math.max(0, Math.abs(dx) - 1) * N, gapZ = Math.max(0, Math.abs(dz) - 1) * N;
    if (Math.hypot(gapX, gapZ) >= distance) continue;
    const c = cubes.get(key(x + dx, y, z + dz));
    if (c?.visits || c?.sighted) list.push({ key: c.key, geo: c.geo, dx, dz });
  }
  return list;
}

export function distanceFade(distance, limit = VIEW_DISTANCE, band = VIEW_FADE) {
  const t = Math.max(0, Math.min(1, (limit - distance) / band));
  return t * t * (3 - 2 * t);
}
