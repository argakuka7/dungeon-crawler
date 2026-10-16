// Ways out: every floor the character can get to from a portal must lead back to the exit. A pit you can drop into but not climb out of gets a
// route of its own (ladders, stairs, bridges) to the nearest floor that does lead on. Escapes
// that do not fit are dropped again by placement; falls are still moved by game/fall.js.
import { DIRS } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { graph, reachFrom, reachTo } from './reach.js';
import { search, take } from './route.js';

const MAX = 12;          // escape routes per cube
const ACCESS = 8;        // ways onto cut-off platforms per cube
// floors a cut-off platform needs to be worth a way up: floating platforms (upper layers)
// look like places to go; on the ground most are scenery (mesa tops, crater rims)
const ACCESS_MIN = 8, ACCESS_MIN_GROUND = 40;
const TWO_WAY = mv => mv.kind !== 'drop' && mv.kind !== 'jump';

// floor ids the character can get to from the portals (a fall in from the cube above does not
// leave you here: game/fall.js puts you back where the fall started)
export const reachable = (ctx, real) => reachFrom(ctx, ctx.portalFloors, real);

// Platforms and plateaus nothing leads onto: the bigger ones get a way up (searched from the
// platform down to where the character can go, over moves that work both ways). Their way
// back out is left to addEscapes.
export function addAccess(ctx) {
  const { hub, floors, jitter, have } = ctx;
  if (!hub) return;
  ctx.bigLadders = true;
  const stand = f => f && !f.fluid && !f.prot && !f.siteBlocked && !f.landing && !ctx.border(f);   // never onto the cube's rim
  const failed = new Set();
  for (let n = 0; n < ACCESS; n++) {
    const seen = reachable(ctx, false), adj = graph(ctx, false), und = new Map();
    const link = (a, b) => { let s = und.get(a); if (!s) und.set(a, s = []); s.push(b); };
    for (const [a, bs] of adj) for (const b of bs) { link(a, b.id); link(b.id, a); }
    // the biggest platform nobody reaches yet
    let best = null;
    const done = new Set();
    for (const f of floors) {
      if (!stand(f) || seen.has(f.id) || done.has(f.id) || failed.has(f.id)) continue;
      const comp = [f], set = new Set([f.id]);
      const grow = g => { if (!set.has(g.id) && stand(g) && !seen.has(g.id)) { set.add(g.id); comp.push(g); } };
      for (let i = 0; i < comp.length; i++) {
        const g = comp[i];
        for (const id of und.get(g.id) || []) grow(floors[id]);
        // steps of up to two levels mostly turn into slopes when smoothing: one platform
        for (const [dx, dz] of DIRS) if (inb(g.x + dx, g.z + dz))
          for (const h of ctx.cols[idx(g.x + dx, g.z + dz)]) if (Math.abs(h.top - g.top) <= 2) grow(h);
      }
      comp.forEach(g => done.add(g.id));
      const floating = comp.filter(g => g.layer > 0).length;
      if ((floating >= ACCESS_MIN || comp.length >= ACCESS_MIN_GROUND) && (!best || comp.length > best.length)) best = comp;
    }
    if (!best) break;
    // from its lowest floor: the shortest climb
    const from = best.reduce((a, b) => b.top < a.top ? b : a);
    const seg = search(ctx, from, f => seen.has(f.id), jitter, have, TWO_WAY);
    if (!take(ctx, seg)) { best.forEach(g => failed.add(g.id)); continue; }
    ctx.stats.access = (ctx.stats.access || 0) + 1;
  }
  ctx.bigLadders = false;
}

export function addEscapes(ctx) {
  const { hub, floors, jitter, have } = ctx;
  if (!hub) return;
  ctx.bigLadders = true;
  const failed = new Set();
  for (let n = 0; n < MAX; n++) {
    const safe = reachTo(ctx, hub, false), seen = reachable(ctx, false);
    // the deepest trapped floor first: pits drain downwards, so it is usually the one the rest
    // of its trap ends up in, and its way out frees them too
    let from = null;
    for (const id of seen) {
      const f = floors[id];
      if (!f || f.fluid || f.prot || f.siteBlocked || safe.has(id) || failed.has(id)) continue;
      if (!from || f.top < from.top) from = f;
    }
    if (!from) break;
    const seg = search(ctx, from, f => safe.has(f.id), jitter, have);
    if (!take(ctx, seg)) { failed.add(from.id); continue; }
    ctx.stats.escapes = (ctx.stats.escapes || 0) + 1;
  }
  ctx.bigLadders = false;
}
