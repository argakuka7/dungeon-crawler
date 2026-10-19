// The puzzle solvers (docs/trials.md "Puzzles"): every puzzle is made together with its solution
// and checked by one of these before the cube is handed out. Pure, no generator state: the tests
// and the game's /trial solve use them too.
import { slideStop, traceBeam, beamDone, pressBrazier, allLit, pushTarget } from '../../core/trials.js';

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

// The fewest flips from `start` (bits) to a state that solves it (the receiver lit through every
// lens): { flips, solution, traps } over every state (2^M, M at most 12); traps: the states that
// light the receiver but miss a lens (a wrong way that looks right)
export function solveMirror(F, start) {
  const M = F.mirrors.length, s0 = start.reduce((a, b, i) => a | (b << i), 0);
  let best = Infinity, solution = null, traps = 0;
  for (let s = 0; s < 1 << M; s++) {
    const bits = Array.from({ length: M }, (_, i) => (s >> i) & 1), beam = traceBeam(F, bits);
    if (!beam.lit) continue;
    if (!beamDone(F, beam)) { traps++; continue; }
    const f = popcount(s ^ s0);
    if (f < best) { best = f; solution = bits; }
  }
  return { flips: best, solution, traps };
}

// A mirror field of w x h: a beam's way from an emitter with `turns` turns (a mirror at each), the
// receiver where it leaves, `lenses` lenses on its straight stretches; decoy mirrors and rocks off
// it; the start scrambled so the fewest flips are in `band`. With lenses, kept only where some
// other setting lights the receiver but misses a lens (a trap: following the beam to the receiver is
// not enough), the field with the most of them. null: none found in `tries`.
export function makeMirror(R, w, h, band, turns, lenses = 0, tries = 400) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  let best = null;
  for (let n = 0; n < tries && !(best && n > tries / 4); n++) {
    const side = ri(0, 3), along = side < 2 ? h : w, t = ri(0, along - 1), dir = side ^ 1;
    let [x, z] = [[w - 1, t], [0, t], [t, h - 1], [t, 0]][side], d = dir;
    const emitter = { x, z, dir }, path = new Set([`${x},${z}`]), straight = [], mirrors = [], solution = [];
    let ok = true, k = 0;
    for (let turn = 0; turn <= turns && ok; turn++) {
      // run straight on 1..4 cells (the last stretch: to the edge)
      const run = turn === turns ? Infinity : ri(1, 4);
      for (let s = 0; s < run; s++) {
        const nx = x + SD[d][0], nz = z + SD[d][1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) { if (turn < turns) ok = false; break; }
        if (path.has(`${nx},${nz}`)) { ok = false; break; }
        x = nx; z = nz; path.add(`${x},${z}`); straight.push([x, z]);
      }
      if (!ok || turn === turns) break;
      // turn here: a mirror
      if (mirrors.some(([mx, mz]) => mx === x && mz === z) || (x === emitter.x && z === emitter.z)) { ok = false; break; }
      straight.pop();
      const nd = R() < 0.5 ? [2, 3, 0, 1][d] : [3, 2, 1, 0][d];   // left or right
      mirrors.push([x, z]); solution.push(SLASH[d] === nd ? 0 : 1); d = nd; k++;
    }
    if (!ok || k !== turns) continue;
    const receiver = { x, z, side: d };
    if (x === emitter.x && z === emitter.z) continue;
    // the lenses: on the way's straight stretches, after its first turn, not on the emitter's cell
    const onWay = straight.filter(([sx, sz], i) => i > 1 && !(sx === emitter.x && sz === emitter.z) && !(sx === x && sz === z));
    if (onWay.length < lenses) continue;
    for (let i = onWay.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [onWay[i], onWay[j]] = [onWay[j], onWay[i]]; }
    const lensCells = onWay.slice(0, lenses);
    // decoys and rocks, off the way
    const free = [];
    for (let fz = 0; fz < h; fz++) for (let fx = 0; fx < w; fx++) if (!path.has(`${fx},${fz}`)) free.push([fx, fz]);
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    const decoys = Math.min(free.length, lenses ? ri(4, 6) : ri(2, 4)), rocks = Math.min(free.length - decoys, ri(1, 3));
    for (let i = 0; i < decoys; i++) { mirrors.push(free[i]); solution.push(R() < 0.5 ? 1 : 0); }
    const blockers = free.slice(decoys, decoys + rocks);
    const F = { w, h, mirrors, blockers, lenses: lensCells, emitter, receiver };
    if (!beamDone(F, traceBeam(F, solution)) || mirrors.length > 12) continue;
    // scramble: flip at random until the fewest flips back are in the band
    for (let m = 0; m < 30; m++) {
      const start = solution.map((b, i) => (R() < (i < k ? 0.7 : 0.5) ? b ^ 1 : b));   // (the way's mirrors mostly wrong)
      if (traceBeam(F, start).lit) continue;
      const s = solveMirror(F, start);
      if (s.flips < band[0] || s.flips > band[1]) continue;
      if (lenses && !s.traps) break;
      if (!lenses) return { field: F, start, solution: s };
      if (!best || s.traps > best.solution.traps) best = { field: F, start, solution: s };
      break;
    }
  }
  return best;
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

// --- crates (Sokoban) --------------------------------------------------------------------------------

// The cells the player reaches from p without pushing (walls and crates in the way)
function region(F, crates, p) {
  const seen = new Set([p]), stack = [p], block = new Set([...F.walls, ...crates]);
  while (stack.length) {
    const c = stack.pop(), x = c % F.w, z = Math.floor(c / F.w);
    for (const [dx, dz] of SD) {
      const nx = x + dx, nz = z + dz, n = nz * F.w + nx;
      if (nx < 0 || nz < 0 || nx >= F.w || nz >= F.h || seen.has(n) || block.has(n)) continue;
      seen.add(n); stack.push(n);
    }
  }
  return seen;
}

// The fewest pushes that put a crate on every plate (goal: the plates to cover, by default all),
// from crates and the player at p: { pushes (Infinity: none), way: [[crate index, dir], ...] }.
// A breadth-first search over the crates' places and where the player can get to (max states).
export function solveSokoban(F, crates, p, goal = F.plates, max = 40000) {
  const key = (cs, reg) => `${[...cs].sort((a, b) => a - b).join(',')}|${Math.min(...reg)}`;
  const start = { cs: crates.slice(), p, way: [] }, seen = new Set([key(crates, region(F, crates, p))]);
  const done = cs => goal.every(g => cs.includes(g));
  if (done(crates)) return { pushes: 0, way: [] };
  let frontier = [start];
  for (let depth = 1; frontier.length && seen.size < max; depth++) {
    const next = [];
    for (const st of frontier) {
      const reg = region(F, st.cs, st.p);
      for (let i = 0; i < st.cs.length; i++) for (let d = 0; d < 4; d++) {
        const c = st.cs[i], bx = c % F.w - SD[d][0], bz = Math.floor(c / F.w) - SD[d][1], behind = bz * F.w + bx;
        if (bx < 0 || bz < 0 || bx >= F.w || bz >= F.h || !reg.has(behind)) continue;
        const to = pushTarget(F, st.cs, c, d);
        if (to === null) continue;
        const cs = st.cs.slice(); cs[i] = to;
        const k = key(cs, region(F, cs, c));
        if (seen.has(k)) continue;
        seen.add(k);
        const way = [...st.way, [i, d]];
        if (done(cs)) return { pushes: depth, way };
        next.push({ cs, p: c, way });
      }
    }
    frontier = next;
  }
  return { pushes: Infinity, way: null };
}

// Every state the crates can be pulled into from the crates on the plates: the pull search (a
// pull is a push backwards, so a state's depth is its fewest pushes onto the plates). A state is
// the crates' cells (sorted) and the player's region (its least cell); `link` leads each one back a
// push towards the plates: { from (the crate's cell), d (the push), up (the state it gives) }.
//   -> { list: [{ cs, p, depth, link }], max } (cut off at `max` states)
export function pullSearch(F, max = 200000) {
  const { w, h } = F, cells = w * h, wall = new Uint8Array(cells), mark = new Uint8Array(cells);
  for (const c of F.walls) wall[c] = 1;
  let stamp = 0;
  const seen = new Uint16Array(cells);
  // the player's region from p among crates `cs`: its least cell (the cells marked with `stamp`)
  const fill = (cs, p) => {
    if (++stamp === 65536) { seen.fill(0); stamp = 1; }
    for (const c of cs) mark[c] = 1;
    let least = p, stack = [p];
    seen[p] = stamp;
    while (stack.length) {
      const c = stack.pop(), x = c % w, z = (c / w) | 0;
      if (c < least) least = c;
      for (const [dx, dz] of SD) {
        const nx = x + dx, nz = z + dz, n = nz * w + nx;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h || seen[n] === stamp || wall[n] || mark[n]) continue;
        seen[n] = stamp; stack.push(n);
      }
    }
    for (const c of cs) mark[c] = 0;
    return least;
  };
  const keyOf = (cs, least) => cs.reduce((k, c) => k * 128 + c, 0) * 128 + least;
  const list = [], index = new Map();
  const add = (cs, p, depth, link) => {
    const least = fill(cs, p), k = keyOf(cs, least);
    if (index.has(k)) return;
    index.set(k, list.length); list.push({ cs, p, depth, link });
  };
  // the plates covered, the player in any region round them
  const goal = [...F.plates].sort((a, b) => a - b);
  for (let c = 0; c < cells; c++) if (!wall[c] && !goal.includes(c)) add(goal, c, 0, null);
  const reg = new Uint8Array(cells);
  for (let q = 0; q < list.length && list.length < max; q++) {
    const st = list[q];
    fill(st.cs, st.p);
    for (let c = 0; c < cells; c++) reg[c] = seen[c] === stamp ? 1 : 0;
    for (let i = 0; i < st.cs.length; i++) for (let d = 0; d < 4; d++) {
      // the player beside the crate on side d steps on away from it, the crate following
      const c = st.cs[i], x = c % w + SD[d][0], z = ((c / w) | 0) + SD[d][1], x2 = x + SD[d][0], z2 = z + SD[d][1];
      if (x2 < 0 || z2 < 0 || x2 >= w || z2 >= h) continue;
      const s = z * w + x, b = z2 * w + x2;
      if (!reg[s] || wall[b] || st.cs.includes(b)) continue;
      const cs = st.cs.slice(); cs[i] = s; cs.sort((a, b2) => a - b2);
      add(cs, b, st.depth + 1, { from: s, d: d ^ 1, up: q });
    }
  }
  // the region of state i, as a test for a cell
  const regionOf = i => { fill(list[i].cs, list[i].p); const here = stamp; return c => seen[c] === here; };
  return { list, regionOf };
}

// Crates on plates on w x h: rubble walls inside, n plates, as many crates. Made backwards: the pull
// search from the crates on the plates; the start a state that is as far from them as the band
// allows (the far end of it, by chance among the farthest), the player coming in at the entry, no
// crate on a plate or the entry, and more than one crate moved in turns (switches: how often the
// way goes over from one crate to another, at least n). Its way is the pull search's, read forwards.
//   -> { field, start: [cells], solution: { pushes, way: [[crate index, dir], ...], switches } } or null
export function makeCrates(R, w, h, band, n, entrySide, tries = 60) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), cells = w * h;
  for (let k = 0; k < tries; k++) {
    const t = ri(1, (entrySide < 2 ? h : w) - 2), [ex, ez] = [[w - 1, t], [0, t], [t, h - 1], [t, 0]][entrySide], entry = ez * w + ex;
    const walls = [], share = 0.1 + R() * 0.08;
    for (let c = 0; c < cells; c++) if (c !== entry && R() < share) walls.push(c);
    const F = { w, h, walls, plates: [], entry: { x: ex, z: ez, side: entrySide } };
    if (region(F, [], entry).size !== cells - walls.length) continue;   // (every floor cell joined up)
    // the plates: not on the entry nor beside it, not in a corner (a crate there is pushed in last)
    const free = [...region(F, [], entry)].filter(c => Math.abs(c % w - ex) + Math.abs(Math.floor(c / w) - ez) > 1);
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    F.plates = free.slice(0, n);
    const { list, regionOf } = pullSearch(F);
    // the starts that fit, the farthest first
    const fits = [];
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.depth < band[0] || st.depth > band[1] || st.cs.some(c => F.plates.includes(c) || c === entry)) continue;
      fits.push(i);
    }
    fits.sort((a, b) => list[b].depth - list[a].depth || R() - 0.5);
    for (const i of fits.slice(0, 400)) {
      if (list[i].depth < list[fits[0]].depth - 2) break;
      if (!regionOf(i)(entry)) continue;
      // the way: each state's link, read forwards (which crate: by where it stands)
      const start = list[i].cs.slice();
      for (let a = start.length - 1; a > 0; a--) { const b = Math.floor(R() * (a + 1)); [start[a], start[b]] = [start[b], start[a]]; }
      const at = start.slice(), way = [];
      for (let q = i; list[q].link; q = list[q].link.up) {
        const { from, d } = list[q].link, j = at.indexOf(from);
        way.push([j, d]); at[j] = from + SD[d][0] + SD[d][1] * w;
      }
      const switches = way.filter((m, j) => j && m[0] !== way[j - 1][0]).length;
      if (switches < n) continue;
      return { field: F, start, solution: { pushes: way.length, way, switches } };
    }
  }
  return null;
}
