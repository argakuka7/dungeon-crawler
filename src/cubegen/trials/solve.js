// The puzzle solvers (docs/trials.md "Puzzles"): every puzzle is made together with its solution
// and checked by one of these before the cube is handed out. Pure, no generator state: the tests
// and the game's /trial solve use them too.
import { slideStop } from '../../core/trials.js';

// --- slide ---------------------------------------------------------------------------------------

// Where you come to rest first: walking in through the entry gap you push inwards, so you slide
// straight on from the entry cell
export const slideStart = F => slideStop(F, F.entry.x, F.entry.z, F.entry.side ^ 1);

// Every stop reachable from the start (sliding off through the entry gap and in again counts as
// being back at the start): { dist: Map('x,z' -> slides from the start), prev (for the way),
// edges: Map('x,z' -> ['x,z', ...] by direction), start }
export function slideGraph(F) {
  const key = (x, z) => `${x},${z}`, s0 = slideStart(F), start = key(...s0);
  const dist = new Map([[start, 0]]), prev = new Map(), edges = new Map(), queue = [s0];
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i], k = key(x, z), out = [];
    for (let d = 0; d < 4; d++) {
      const s = slideStop(F, x, z, d);
      const n = s === 'out' ? start : key(...s);
      out.push(n);
      if (!dist.has(n)) { dist.set(n, dist.get(k) + 1); prev.set(n, [k, d]); queue.push(s === 'out' ? s0 : s); }
    }
    edges.set(k, out);
  }
  return { dist, prev, edges, start };
}

// The puzzle's facts: the fewest slides to the goal from the start (Infinity: none; 0: you slide in
// onto it), the way (directions), whether every stop leads back to the start (no trap), and how
// many stops lead nowhere useful (on no shortest way to the goal)
export function solveSlide(F) {
  const { dist, prev, edges, start } = slideGraph(F), goal = `${F.goal.x},${F.goal.z}`;
  const slides = dist.get(goal) ?? Infinity, way = [];
  for (let k = goal; prev.has(k); k = prev.get(k)[0]) way.unshift(prev.get(k)[1]);
  // back to the entry from every stop (over the edges the other way round)
  const rev = new Map();
  for (const [a, bs] of edges) for (const b of bs) { if (!rev.has(b)) rev.set(b, []); rev.get(b).push(a); }
  const back = new Set([start]), stack = [start];
  while (stack.length) for (const a of rev.get(stack.pop()) || []) if (!back.has(a)) { back.add(a); stack.push(a); }
  const trapped = [...dist.keys()].filter(k => !back.has(k));
  // the stops on some shortest way: their distance from the entry plus to the goal is the least
  const toGoal = new Map([[goal, 0]]), q2 = [goal];
  for (let i = 0; i < q2.length; i++) for (const a of rev.get(q2[i]) || []) if (!toGoal.has(a)) { toGoal.set(a, toGoal.get(q2[i]) + 1); q2.push(a); }
  const onWay = [...dist.keys()].filter(k => dist.get(k) + (toGoal.get(k) ?? Infinity) === slides);
  const decoys = dist.size - onWay.length;
  return { slides, way, stops: dist.size, trapped: trapped.length, decoys };
}

// the band of slides a depth's slide puzzle asks for
export const slideBand = depth => depth >= 10 ? [6, 9] : [4, 6];

// Make a slide field of w x h: rocks at random (12-20%), the entry on side `entrySide` at a random
// place, the goal on another side; kept when its fewest slides are in `band` ([lo, hi]; a number:
// the depth's band), at least `decoys` stops lead nowhere useful and nothing traps you. null: none
// found in `tries`.
export function makeSlide(R, w, h, band, entrySide, goalSides, tries = 600, decoys = 3) {
  const [lo, hi] = Array.isArray(band) ? band : slideBand(band);
  const along = side => side < 2 ? h : w;
  const edgeCell = (side, t) => [[w - 1, t], [0, t], [t, h - 1], [t, 0]][side];
  for (let n = 0; n < tries; n++) {
    const goalSide = goalSides[Math.floor(R() * goalSides.length)];
    const [ex, ez] = edgeCell(entrySide, 1 + Math.floor(R() * (along(entrySide) - 2)));
    const [gx, gz] = edgeCell(goalSide, 1 + Math.floor(R() * (along(goalSide) - 2)));
    if (ex === gx && ez === gz) continue;
    const density = 0.12 + R() * 0.08, rock = Array.from({ length: w * h }, () => R() < density ? 1 : 0);
    rock[ez * w + ex] = 0; rock[gz * w + gx] = 0;
    const F = { w, h, rock, entry: { x: ex, z: ez, side: entrySide }, goal: { x: gx, z: gz, side: goalSide } };
    if (`${slideStart(F)}` === `${ex},${ez}`) continue;   // (a rock right inside the gap: no way in)
    const s = solveSlide(F);
    if (s.slides < lo || s.slides > hi || s.trapped || s.decoys < decoys) continue;
    return { field: F, solution: s };
  }
  return null;
}
