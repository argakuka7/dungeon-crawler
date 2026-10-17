// Falls between a cube and the one below it. A pool in the upper cube spills over the edge of
// its void, out through the bottom; the stream comes in through the top of the cube below
// into a pool at the same spot. The (shared) vertical face decides it from world data only
// (void field, layout, the face's own random stream), so either cube can be generated first.
//   fall: { x, z, d, type }: (x, z) the void cell it pours down, d the flow direction into it
import { N, DIRS, WATER, LAVA, ACID } from '../core/constants.js';
import { parse, step, faceKey } from './coords.js';
import { voidAllowed, isVoid } from './voids.js';

const CHANCE = 0.45;

// where a vertical portal on face fk sits (same stream as faces.js verticalFace)
const portalAt = (world, fk) => { const R = world.wfc.rng(fk, 0xd0e); return [4 + Math.floor(R() * 8), 4 + Math.floor(R() * 8)]; };

// the fall from cube `up` into the one below it, or null (memoised: it depends on the fall
// into `up` from above, which has to stay clear of it)
export function cascade(world, up) {
  const memo = world.cascades ||= new Map();
  if (!memo.has(up)) memo.set(up, decide(world, up));
  return memo.get(up);
}

function decide(world, up) {
  const [X, Y, Z] = parse(up), d = -Y, R = world.wfc.rng(faceKey(up, 4), 0xfa11);
  if (Y > 0 || !world.layout(d).exists.has(up) || !voidAllowed(world, up) || R() > CHANCE) return null;
  const low = step(up, 4), avoid = [], inflow = Y < 0 && cascade(world, step(up, 5));
  if (world.layout(d + 1).spanCells?.has(low)) return null;   // nothing pours across a span's bridge
  if (world.layout(d + 1).areaCells?.has(low) || world.layout(d + 1).peak === low) return null;   // nor onto a ramp or a peak
  if (inflow) avoid.push([inflow.x, inflow.z]);   // its catch pool
  if (world.layout(d).down === up) avoid.push(portalAt(world, faceKey(up, 4)));    // the well here = the ring below
  if (world.layout(d).up === up) avoid.push(portalAt(world, faceKey(up, 5)));      // the ring here
  if (world.layout(d + 1).down === low) avoid.push(portalAt(world, faceKey(low, 4)));   // the well below
  const theme = world.layout(d).theme, open = (x, z) => isVoid(world.noise, X * N + x + 0.5, Z * N + z + 0.5, d, theme.void);
  const cands = [];
  for (let z = 4; z <= 11; z++) for (let x = 4; x <= 11; x++) {
    if (!open(x, z) || avoid.some(([ax, az]) => Math.max(Math.abs(ax - x), Math.abs(az - z)) < 5)) continue;
    DIRS.forEach(([dx, dz], dir) => { if (!open(x - dx, z - dz)) cands.push({ x, z, d: dir }); });
  }
  if (!cands.length) return null;
  return { ...cands[Math.floor(R() * cands.length)], type: fallFluid(theme, R) };
}

// the fluid of a fall in theme t: mostly the river fluid, else from the theme's mix
export function fallFluid(t, R) {
  const [w, l, a] = t.fluids, r = R() * (w + l + a);
  return R() < 0.6 ? t.river : r < w ? WATER : r < w + l ? LAVA : ACID;
}
