// Where the character can get to on its own: walk on level ground and slopes, jump up a
// level, drop down any cliff (unless a fence is in the way), swim and climb out of water,
// plus the structures on the route (both ways) and the route's own moves. `real` uses the
// final slopes and fences; before smoothing only level ground and one-level steps count.
import { N, LH, WATER, DIRS, CHAR_H } from '../core/constants.js';
import { idx, inb, edgeKey } from '../core/util.js';

const ONE_WAY = new Set(['walk', 'drop', 'jump']);
const level = f => f.fluid ? f.surf : f.top;

// smoothing can pull a corner up into the room under the floor above: too low to stand
export const isCramped = (ctx, f) => { const a = !f.landing && ctx.nextAbove(f); return !!a && Math.max(...f.cs) + CHAR_H + 0.02 > a.bottom * LH; };

export function graph(ctx, real) {
  const { cols, floors, headOK, moves, fences } = ctx, adj = new Map();
  const memo = new Map(), cramped = f => real && (memo.get(f) ?? memo.set(f, isCramped(ctx, f)).get(f));
  const stand = f => !f.siteBlocked && (!f.fluid || f.fluid === WATER) && !cramped(f);
  const add = (a, b) => { if (cramped(a) || cramped(b)) return; let s = adj.get(a.id); if (!s) adj.set(a.id, s = []); s.push(b); };
  const fenced = (f, n, h) => real && (fences.get(edgeKey(f.x, f.z, n % N, (n / N) | 0)) || []).some(e => e.ymin < h + 0.6 && e.ymax > h - 0.6);
  for (const f of floors) {
    if (!stand(f)) continue;
    const h = level(f);
    for (let d = 0; d < 4; d++) {
      const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
      if (!inb(nx, nz)) continue;
      const n = idx(nx, nz);
      // the highest floor at or below our level, and the first one above it
      let below = null, above = null;
      for (const g of cols[n]) if (level(g) <= h) below = g; else if (!above) above = g;
      if (above && above.bottom < h + 2) {   // in the way: step / jump / climb out onto it, or nothing
        const up = level(above) - h;
        if (stand(above) && headOK(above, h) && headOK(f, level(above)) && (up <= (f.fluid ? 2 : 1) || (real && f.link[d] === above))) add(f, above);
        continue;
      }
      if (!below || !stand(below)) continue;
      if (level(below) === h || (real && f.link[d] === below)) { if (headOK(below, h)) add(f, below); }
      else if (headOK(below, h + 1) && !fenced(f, n, h * LH)) add(f, below);   // drop
    }
  }
  // route walks become slopes when smoothing (smooth.js): both ways, before it as well
  for (const m of moves) { add(m.from, m.to); if (!ONE_WAY.has(m.kind) || (!real && m.kind === 'walk')) add(m.to, m.from); }
  return adj;
}

// ids of every node that can reach floor `goal` (null: everything counts)
// learn: world.html#inspector (see learn/README.md)
export function reachTo(ctx, goal, real) {
  if (!goal) return null;
  const adj = graph(ctx, real), rev = new Map();
  for (const [a, bs] of adj) for (const b of bs) { let s = rev.get(b.id); if (!s) rev.set(b.id, s = []); s.push(a); }
  const seen = new Set([goal.id]), stack = [goal.id];
  while (stack.length) for (const a of rev.get(stack.pop()) || []) if (!seen.has(a)) { seen.add(a); stack.push(a); }
  return seen;
}

// ids of every floor the character can get to from `starts`
export function reachFrom(ctx, starts, real) {
  const adj = graph(ctx, real), seen = new Set(starts.map(f => f.id)), stack = [...seen];
  while (stack.length) for (const b of adj.get(stack.pop()) || []) if (!seen.has(b.id)) { seen.add(b.id); stack.push(b.id); }
  return seen;
}
