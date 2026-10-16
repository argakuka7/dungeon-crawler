// Serializable circle / box colliders, shared by generation and runtime queries.
import { N } from './constants.js';

export function containsXZ(b, x, z, margin = 0) {
  return b.shape === 'box'
    ? x >= b.x0 - margin && x <= b.x1 + margin && z >= b.z0 - margin && z <= b.z1 + margin
    : Math.hypot(x - b.x, z - b.z) <= b.r + margin;
}

export function indexBlockers(list) {
  const cells = Array.from({ length: N * N }, () => []);
  for (const b of list) {
    const [x0, z0, x1, z1] = b.shape === 'box' ? [b.x0, b.z0, b.x1, b.z1]
      : [b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r];
    for (let z = Math.max(0, Math.floor(z0)); z <= Math.min(N - 1, Math.floor(z1)); z++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(N - 1, Math.floor(x1)); x++) cells[z * N + x].push(b);
  }
  return cells;
}

// the cells (1 x 1, over the occluders' own extent, which may overhang the cube) each occluder
// touches; built once per list of occluders
const occluderGrids = new WeakMap();
function occluderGrid(list) {
  let g = occluderGrids.get(list);
  if (g) return g;
  const extent = b => b.shape === 'box' ? [b.x0, b.z0, b.x1, b.z1]
    : b.shape === 'ellipsoid' ? [b.x - b.rx, b.z - b.rz, b.x + b.rx, b.z + b.rz] : [b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r];
  const boxes = list.map(extent);
  const x0 = Math.floor(Math.min(0, ...boxes.map(e => e[0]))), z0 = Math.floor(Math.min(0, ...boxes.map(e => e[1])));
  const w = Math.ceil(Math.max(N, ...boxes.map(e => e[2]))) - x0 + 1, h = Math.ceil(Math.max(N, ...boxes.map(e => e[3]))) - z0 + 1;
  const cells = Array.from({ length: w * h }, () => []);
  list.forEach((b, i) => {
    const [ax, az, bx, bz] = boxes[i];
    for (let z = Math.floor(az) - z0; z <= Math.floor(bz) - z0; z++)
      for (let x = Math.floor(ax) - x0; x <= Math.floor(bx) - x0; x++) cells[z * w + x].push(b);
  });
  g = { x0, z0, w, h, cells };
  occluderGrids.set(list, g);
  return g;
}

// Occlusion volumes are independent of body collision: foliage can hide the player
// while remaining walkable underneath. Used by the cutaway ray probes (many points a frame:
// only the occluders in the point's cell are tested).
export function viewBlockedAt(map, x, y, z) {
  if (!map.occluders?.length) return false;
  const g = occluderGrid(map.occluders), cx = Math.floor(x) - g.x0, cz = Math.floor(z) - g.z0;
  if (cx < 0 || cz < 0 || cx >= g.w || cz >= g.h) return false;
  for (const b of g.cells[cz * g.w + cx]) {
    if (b.shape === 'ellipsoid') {
      if (((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2 + ((z - b.z) / b.rz) ** 2 <= 1) return true;
    } else if (y >= b.bottom && y <= b.top && containsXZ(b, x, z)) return true;
  }
  return false;
}
