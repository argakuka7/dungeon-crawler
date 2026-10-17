// Falls across a side face: a stream on an upper layer of one cube runs to the face, crosses
// it on a short lip of the same layer in the neighbour (slabs may touch a face here, as at
// upper-layer portal pads) and falls off the lip's inner edge into a pool there.
//   spout: { pos, layer, from (the source cube), type }
import { N } from '../core/constants.js';
import { parse, step } from './coords.js';
import { VOID } from './profile.js';
import { fallFluid, cascade } from './cascades.js';
import { edgeCell } from '../cubegen/portals.js';

const CHANCE = 0.3, DROP = 7;   // the ground under the lip lies at least DROP levels lower

// f: the face being decided (profile, river, portal); base: the layer levels
export function spout(world, fk, f, base) {
  const R = world.wfc.rng(fk, 0x5b07), [a, d] = fk.split('/'), b = step(a, +d);
  const L = world.layout(-parse(a)[1]);
  if (R() > CHANCE || !L.exists.has(a) || !L.exists.has(b)) return null;
  const maxL = Math.min(world.wfc.tiles.get(a).K, world.wfc.tiles.get(b).K) - 1;
  if (maxL < 1) return null;
  const layer = 1 + Math.floor(R() * maxL), from = R() < 0.5 ? a : b, cands = [];
  // falls through the void in either cube (world/cascades.js) keep their shafts
  const shafts = [[a, +d], [b, +d ^ 1]].flatMap(([k, fd]) => [cascade(world, k), cascade(world, step(k, 5))].filter(Boolean).map(c => [c, fd]));
  const nearFall = pos => shafts.some(([c, fd]) => {
    for (let j = 0; j <= 5; j++) for (let t = pos - 2; t <= pos + 2; t++) {
      const e = edgeCell(fd, Math.max(0, Math.min(N - 1, t)), j);
      if (Math.max(Math.abs(e % N - c.x), Math.abs(((e / N) | 0) - c.z)) <= 2) return true;
    }
    return false;
  });
  for (let pos = 3; pos <= N - 4; pos++) {
    if (nearFall(pos)) continue;
    if (f.portal && Math.abs(pos - f.portal.pos) < 5) continue;
    if (f.river && pos >= f.river.pos - 3 && pos <= f.river.pos + f.river.w + 2) continue;
    let low = true;
    for (let t = pos - 1; t <= pos + 1; t++) if (f.profile[t] !== VOID && f.profile[t] > base[layer] - DROP) low = false;
    if (low) cands.push(pos);
  }
  if (!cands.length) return null;
  return { pos: cands[Math.floor(R() * cands.length)], layer, from, type: fallFluid(L.theme, R) };
}
