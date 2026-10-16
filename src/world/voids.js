// Where the ground opens onto the depth below. A cube may only have void above a cube that
// exists one depth down (falling through lands you there); how much depends on the theme.
// The void field is world-space noise, so open areas continue across cube faces.
import { N } from '../core/constants.js';
import { key, parse } from './coords.js';
import { themeAt, MAX_DEPTH } from '../themes/depth.js';
import { isClearing } from './town.js';

export function voidAllowed(world, k) {
  const [X, Y, Z] = parse(k), d = -Y;
  return !isClearing(k, world.seed) && !world.layout(d).guardians.has(k) && !world.layout(d).spanCells?.has(k)
    && d < MAX_DEPTH && themeAt(d).void > 0 && world.layout(d + 1).exists.has(key(X, Y - 1, Z));
}

// is the world-space cell centre (wx, wz) at depth d open?
export function isVoid(noise, wx, wz, d) {
  const a = themeAt(d).void;
  return a > 0 && noise(wx * 0.11 + 500 + d * 37, wz * 0.11 - 300) < 0.22 + a * 0.55;
}

// where the character may fall in from the cube above (its void field, a cell wider), or null
export function fallMask(world, k) {
  const [X, Y, Z] = parse(k), up = key(X, Y + 1, Z);
  if (Y >= 0 || !voidAllowed(world, up)) return null;
  const m = new Uint8Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!isVoid(world.noise, X * N + x + 0.5, Z * N + z + 0.5, -Y - 1)) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < N && nz < N) m[nz * N + nx] = 1;
    }
  }
  return m;
}
