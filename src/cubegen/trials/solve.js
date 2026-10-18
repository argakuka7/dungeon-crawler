// The puzzle solvers (docs/trials.md "Puzzles"): every puzzle is made together with its solution
// and checked by one of these before the cube is handed out. Pure, no generator state: the tests
// and the game's /trial solve use them too.
import { slideStop, traceBeam, pressBrazier, allLit, tileOpen, channelFlow } from '../../core/trials.js';

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

// --- mirror ----------------------------------------------------------------------------------------

const SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SLASH = [3, 2, 1, 0];
const popcount = x => { let n = 0; for (; x; x &= x - 1) n++; return n; };

// The fewest flips from `start` (bits) to a state that lights the receiver: { flips, solution }
// over every state (2^M, M at most 10)
export function solveMirror(F, start) {
  const M = F.mirrors.length, s0 = start.reduce((a, b, i) => a | (b << i), 0);
  let best = Infinity, solution = null;
  for (let s = 0; s < 1 << M; s++) {
    const bits = Array.from({ length: M }, (_, i) => (s >> i) & 1);
    if (!traceBeam(F, bits).lit) continue;
    const f = popcount(s ^ s0);
    if (f < best) { best = f; solution = bits; }
  }
  return { flips: best, solution };
}

// A mirror field of w x h: a beam's way from an emitter with `turns` turns (a mirror at each), the
// receiver where it leaves; 2-4 decoy mirrors and 1-3 rocks off it; the start scrambled so the
// fewest flips are in `band`. null: none found in `tries`.
export function makeMirror(R, w, h, band, turns, tries = 400) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  for (let n = 0; n < tries; n++) {
    const side = ri(0, 3), along = side < 2 ? h : w, t = ri(0, along - 1), dir = side ^ 1;
    let [x, z] = [[w - 1, t], [0, t], [t, h - 1], [t, 0]][side], d = dir;
    const emitter = { x, z, dir }, path = new Set([`${x},${z}`]), mirrors = [], solution = [];
    let ok = true, k = 0;
    for (let turn = 0; turn <= turns && ok; turn++) {
      // run straight on 1..4 cells (the last stretch: to the edge)
      const run = turn === turns ? Infinity : ri(1, 4);
      for (let s = 0; s < run; s++) {
        const nx = x + SD[d][0], nz = z + SD[d][1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) { if (turn < turns) ok = false; break; }
        if (path.has(`${nx},${nz}`)) { ok = false; break; }
        x = nx; z = nz; path.add(`${x},${z}`);
      }
      if (!ok || turn === turns) break;
      // turn here: a mirror
      if (mirrors.some(([mx, mz]) => mx === x && mz === z) || (x === emitter.x && z === emitter.z)) { ok = false; break; }
      const nd = R() < 0.5 ? [2, 3, 0, 1][d] : [3, 2, 1, 0][d];   // left or right
      mirrors.push([x, z]); solution.push(SLASH[d] === nd ? 0 : 1); d = nd; k++;
    }
    if (!ok || k !== turns) continue;
    const receiver = { x, z, side: d };
    if (x === emitter.x && z === emitter.z) continue;
    // decoys and rocks, off the way
    const free = [];
    for (let fz = 0; fz < h; fz++) for (let fx = 0; fx < w; fx++) if (!path.has(`${fx},${fz}`)) free.push([fx, fz]);
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    const decoys = Math.min(free.length, ri(2, 4)), rocks = Math.min(free.length - decoys, ri(1, 3));
    for (let i = 0; i < decoys; i++) { mirrors.push(free[i]); solution.push(R() < 0.5 ? 1 : 0); }
    const blockers = free.slice(decoys, decoys + rocks);
    const F = { w, h, mirrors, blockers, emitter, receiver };
    if (!traceBeam(F, solution).lit || mirrors.length > 10) continue;
    // scramble: flip at random until the fewest flips back are in the band
    for (let m = 0; m < 30; m++) {
      const start = solution.map(b => (R() < 0.5 ? b ^ 1 : b));
      if (traceBeam(F, start).lit) continue;
      const s = solveMirror(F, start);
      if (s.flips >= band[0] && s.flips <= band[1]) return { field: F, start, solution: s };
    }
  }
  return null;
}

// --- braziers ---------------------------------------------------------------------------------------

// the braziers of a pattern on a field of `size` (cells [x, z]) and what each is linked to
export function brazierPattern(kind, size) {
  const c = (size - 1) / 2, s = Math.max(1, Math.floor(c)), at = [], links = [];
  if (kind === 'grid') {
    for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) at.push([c + (x - 1) * s, c + (z - 1) * s]);
    for (let i = 0; i < 9; i++) links.push([i - 3, i + 3, i % 3 ? i - 1 : -1, i % 3 < 2 ? i + 1 : -1].filter(j => j >= 0 && j < 9));
  } else if (kind === 'ring') {
    const ring = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
    for (const [x, z] of ring) at.push([c + x * s, c + z * s]);
    for (let i = 0; i < 8; i++) links.push([(i + 1) % 8, (i + 7) % 8]);
  } else {   // star: the middle and its spokes, each spoke with the middle and the spokes beside it
    const spokes = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]].slice(0, size >= 5 ? 8 : 4);
    at.push([c, c]);
    for (const [x, z] of spokes) at.push([c + x * s, c + z * s]);
    const n = spokes.length;
    links.push(spokes.map((_, i) => i + 1));
    for (let i = 0; i < n; i++) links.push([0, ...(n === 8 ? [] : [1 + (i + 1) % n, 1 + (i + n - 1) % n])]);
  }
  return { at, links };
}

// The fewest presses that light every brazier from `bits` (GF(2): each press flips itself and its
// links; the presses that do nothing together, the null space, tried for the fewest): { presses, which }
export function solveBraziers(links, bits) {
  const n = bits.length, rows = [];
  // row i: which presses flip brazier i, and whether it has to change
  for (let i = 0; i < n; i++) { let r = 0; for (let j = 0; j < n; j++) if (j === i || links[j].includes(i)) r |= 1 << j; rows.push({ r, b: bits[i] ? 0 : 1 }); }
  const pivots = [];
  let rank = 0;
  for (let col = 0; col < n && rank < n; col++) {
    const p = rows.findIndex((row, i) => i >= rank && (row.r >> col) & 1);
    if (p < 0) continue;
    [rows[rank], rows[p]] = [rows[p], rows[rank]];
    for (let i = 0; i < n; i++) if (i !== rank && (rows[i].r >> col) & 1) { rows[i].r ^= rows[rank].r; rows[i].b ^= rows[rank].b; }
    pivots.push(col); rank++;
  }
  if (rows.slice(rank).some(row => row.b)) return { presses: Infinity, which: null };
  const freeCols = [...Array(n).keys()].filter(c => !pivots.includes(c));
  let best = Infinity, which = null;
  for (let m = 0; m < 1 << freeCols.length; m++) {
    let x = 0;
    freeCols.forEach((c, i) => { if ((m >> i) & 1) x |= 1 << c; });
    pivots.forEach((c, i) => { let v = rows[i].b; for (const f of freeCols) if ((x >> f) & 1 && (rows[i].r >> f) & 1) v ^= 1; if (v) x |= 1 << c; });
    const p = popcount(x);
    if (p < best) { best = p; which = [...Array(n).keys()].filter(j => (x >> j) & 1); }
  }
  return { presses: best, which };
}

// Lights out on a pattern: all lit, then `band` presses at random; kept when the fewest presses
// back are in the band and it is not solved at the start
export function makeBraziers(R, size, band, tries = 200, patterns = null) {
  for (let n = 0; n < tries; n++) {
    const kinds = patterns ?? ['grid', 'ring', 'star'], kind = kinds[Math.floor(R() * kinds.length)];
    const { at, links } = brazierPattern(kind, size), bits = at.map(() => 1);
    const k = band[0] + Math.floor(R() * (band[1] - band[0] + 1));
    for (let i = 0; i < k; i++) pressBrazier(bits, links, Math.floor(R() * at.length));
    if (allLit(bits)) continue;
    const s = solveBraziers(links, bits);
    if (s.presses >= band[0] && s.presses <= band[1]) return { pattern: kind, at, links, start: bits, solution: s };
  }
  return null;
}

// --- channels ---------------------------------------------------------------------------------------

// how many quarter turns tile shape `shape` needs from r to open towards every side in `need`
export function turnsTo(shape, r, need) {
  for (let k = 0; k < 4; k++) { const o = tileOpen(shape, r + k); if (need.every(d => o.includes(d))) return k; }
  return Infinity;
}

// Rotating channels on w x h: a way of tiles from the spout to the wheel (a random walk that
// avoids itself), its tiles shaped by where the water goes in and out (now and then a tee: a
// branch), the rest at random; every tile turned at random. Kept when its way needs `band`
// quarter turns (by construction) and the wheel is dry at the start.
export function makeChannels(R, w, h, band, tries = 400) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const edge = (side, t) => [[w - 1, t], [0, t], [t, h - 1], [t, 0]][side];
  for (let n = 0; n < tries; n++) {
    const sSide = ri(0, 3), wSide = [0, 1, 2, 3].filter(s => s !== sSide)[ri(0, 2)];
    const [sx, sz] = edge(sSide, ri(0, (sSide < 2 ? h : w) - 1)), [wx, wz] = edge(wSide, ri(0, (wSide < 2 ? h : w) - 1));
    // the way: a walk from the spout's cell to the wheel's that never meets itself
    const path = [[sx, sz]], seen = new Set([`${sx},${sz}`]);
    const walk = () => {
      const [x, z] = path.at(-1);
      if (x === wx && z === wz) return true;
      if (path.length > w * h * 0.7) return false;
      const dirs = [0, 1, 2, 3].sort(() => R() - 0.5);
      for (const d of dirs) {
        const nx = x + SD[d][0], nz = z + SD[d][1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h || seen.has(`${nx},${nz}`)) continue;
        path.push([nx, nz]); seen.add(`${nx},${nz}`);
        if (walk()) return true;
        path.pop(); seen.delete(`${nx},${nz}`);
      }
      return false;
    };
    if (!walk() || path.length < 3) continue;
    const dirOf = (a, b) => SD.findIndex(([dx, dz]) => a[0] + dx === b[0] && a[1] + dz === b[1]);
    const tiles = [], need = [], solved = [];
    const onWay = new Map(path.map((c, i) => [`${c}`, i]));
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const i = onWay.get(`${x},${z}`);
      if (i === undefined) { const shape = ['I', 'L', 'T'][ri(0, 2)]; tiles.push({ x, z, shape }); need.push(null); solved.push(ri(0, 3)); continue; }
      const into = i === 0 ? sSide : dirOf(path[i - 1], path[i]) ^ 1, out = i === path.length - 1 ? wSide : dirOf(path[i], path[i + 1]);
      const shape = (into ^ 1) === out ? (R() < 0.2 ? 'T' : 'I') : R() < 0.2 ? 'T' : 'L';
      const want = [into, out], r = turnsTo(shape, 0, want);
      tiles.push({ x, z, shape }); need.push(want); solved.push(r);
    }
    const F = { w, h, tiles, spout: { x: sx, z: sz, side: sSide }, wheel: { x: wx, z: wz, side: wSide } };
    if (!channelFlow(F, solved).wheel) continue;
    for (let m = 0; m < 30; m++) {
      const start = solved.map(() => ri(0, 3));
      if (start.filter((r, i) => r !== solved[i]).length < tiles.length / 2 || channelFlow(F, start).wheel) continue;
      const turns = need.reduce((s, want, i) => s + (want ? turnsTo(tiles[i].shape, start[i], want) : 0), 0);
      if (turns >= band[0] && turns <= band[1]) return { field: F, start, solution: { turns, turnsOf: start.map((r, i) => need[i] ? turnsTo(tiles[i].shape, r, need[i]) : 0) } };
    }
  }
  return null;
}
