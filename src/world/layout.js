// Seeded, bounded routes between vertical portals. Each stratum has 7–14 rooms
// including its endpoints; small optional branches fit inside the same room budget.
// The core has no further descent. Adjacent, non-linked route sections stay sealed.
import { mulberry32, hash32 } from '../core/util.js';
import { key, faceKey } from './coords.js';
import { MAX_DEPTH, themeAt, worldThemes } from '../themes/depth.js';
import { planSites } from './sites.js';
import { planHordes } from './hordes.js';
import { planArenas } from './arenas.js';
import { planSpans, indexSpans } from './spans.js';

// learn: world.html#route (see learn/README.md)
export const MIN_ROUTE_ROOMS = 7, MAX_ROUTE_ROOMS = 14;
const RADIUS = d => d >= MAX_DEPTH ? 0 : d <= 5 ? 3 : d <= 12 ? 2 : 1;
const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cheb = ([x, z]) => Math.max(Math.abs(x), Math.abs(z));
const nb = ([x, z]) => AXES.map(([dx, dz]) => [x + dx, z + dz]);
const id = c => c.join(',');
const direction = (a, b) => AXES.findIndex(([x, z]) => a[0] + x === b[0] && a[1] + z === b[1]);

// Bounded DFS, with a stable random priority per cell. Unlike a shortest path this
// can keep the deep, small rings long enough without creating disconnected gates.
// learn: world.html#backtracking #route-code (see learn/README.md)
function route(candidates, prefix, length, goal, R) {
  const allowed = new Set(candidates.map(id)), used = new Set(prefix.map(id));
  const priority = new Map(candidates.map(c => [id(c), R()])), out = [...prefix];
  function visit() {
    const c = out.at(-1);
    if (out.length === length) return goal(c);
    const next = nb(c).filter(n => allowed.has(id(n)) && !used.has(id(n)));
    next.sort((a, b) => priority.get(id(a)) - priority.get(id(b)));
    for (const n of next) {
      out.push(n); used.add(id(n));
      if (visit()) return true;
      used.delete(id(n)); out.pop();
    }
    return false;
  }
  return visit() ? out : null;
}

export const guardianDepth = (_seed, d) => d >= 0 && d < MAX_DEPTH;

// learn: world.html#backtracking #route (see learn/README.md)
function build(seed, d, above, theme) {
  const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x9e3779b1))), Y = -d, r = RADIUS(d);
  const K = c => key(c[0], Y, c[1]);
  const candidates = [];
  let prefix;
  if (d === 0) {
    const a = AXES[seed % 4];
    // Preserve the authored town -> camp -> countryside road before it bends.
    prefix = Array.from({ length: 4 }, (_, i) => [a[0] * i, a[1] * i]);
    for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++)
      if (cheb([x, z]) >= 2) candidates.push([x, z]);
  } else {
    prefix = [above.end];
    for (let z = -r - 1; z <= r + 1; z++) for (let x = -r - 1; x <= r + 1; x++)
      if (d === MAX_DEPTH || cheb([x, z]) === r || cheb([x, z]) === r + 1) candidates.push([x, z]);
  }
  const goal = c => d === MAX_DEPTH ? id(c) === '0,0' : cheb(c) === (d ? r : 3);
  const max = d === MAX_DEPTH ? 9 : MAX_ROUTE_ROOMS;
  const desired = MIN_ROUTE_ROOMS + Math.floor(R() * (max - MIN_ROUTE_ROOMS + 1));
  let spine;
  for (let i = 0; i <= max - MIN_ROUTE_ROOMS; i++) {
    const length = MIN_ROUTE_ROOMS + (desired - MIN_ROUTE_ROOMS + i) % (max - MIN_ROUTE_ROOMS + 1);
    spine = route(candidates, prefix, length, goal, R);
    if (spine) break;
  }
  if (!spine) throw new Error(`No bounded route at depth ${d}`);
  const start = spine[0], end = spine.at(-1), cells = [...spine], portals = new Set();
  const link = (a, b) => portals.add(faceKey(K(a), direction(a, b)));
  const exit = new Map(), routeIndex = new Map(), distance = new Map();
  spine.forEach((c, i) => {
    routeIndex.set(K(c), i); distance.set(K(c), 0);
    if (i + 1 < spine.length) { link(c, spine[i + 1]); exit.set(K(c), direction(c, spine[i + 1])); }
  });
  if (d < MAX_DEPTH) exit.set(K(end), 4);
  const guardians = new Map(), gateFaces = new Map();
  if (d < MAX_DEPTH) {
    guardians.set(K(end), { role: 'descent', exit: 4, bossPlaceholder: true });
    const count = 1 + Math.floor(R() * 2), first = d === 0 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const index = first + Math.floor((spine.length - 2 - first) * (i + 1) / (count + 1));
      const k = K(spine[index]), dir = exit.get(k);
      guardians.set(k, { role: 'side', exit: dir, bossPlaceholder: false });
      gateFaces.set(faceKey(k, dir), k);
    }
  }
  const hordes = planHordes(seed, d, spine.map(K), guardians);
  // One-room branches only, never attached to arenas or the safe surface prefix.
  // No loops: all sideways guardians are articulation points on the required route.
  const used = new Set(cells.map(id)), allowed = new Set(candidates.map(id));
  const branchBudget = Math.min(4, MAX_ROUTE_ROOMS - cells.length);
  // gorge spans (spans.js): on the route, and maybe a lonely island branch over a bridge
  const spanPlan = planSpans(seed, d, theme.spans, spine, K, k => guardians.has(k) || hordes.has(k),
    c => !used.has(id(c)) && !(d === 0 && cheb(c) <= 1), branchBudget);
  const nearSpan = c => [c, ...nb(c)].some(n => spanPlan.apart.has(K(n)));
  for (const span of spanPlan.spans) if (span.island) {
    const line = span.keys.map(k => { const [x, , z] = k.split(',').map(Number); return [x, z]; });
    for (let j = 1; j < line.length; j++) {
      const c = line[j];
      cells.push(c); used.add(id(c)); link(line[j - 1], c); exit.set(K(c), direction(c, line[j - 1]));
      routeIndex.set(K(c), routeIndex.get(K(line[0]))); distance.set(K(c), j);
    }
  }
  for (const c of spine.slice(2, -1)) {
    if (cells.length >= spine.length + branchBudget) break;
    if (guardians.has(K(c)) || spanPlan.cells.has(K(c))) continue;
    const options = nb(c).filter(n => allowed.has(id(n)) && !used.has(id(n)) && !nearSpan(n));
    if (!options.length || R() < .4) continue;
    const n = options[Math.floor(R() * options.length)];
    cells.push(n); used.add(id(n)); link(c, n); exit.set(K(n), direction(n, c));
    routeIndex.set(K(n), routeIndex.get(K(c))); distance.set(K(n), 1);
  }
  const layout = { depth: d, theme, cells, start, end, spine: spine.length, route: spine.map(K), routeIndex,
    exists: new Set(cells.map(K)), portals, exit, guardians, gateFaces, hordes,
    up: d ? K(start) : null, down: d < MAX_DEPTH ? K(end) : null, guardian: guardianDepth(seed, d) };
  indexSpans(layout, spanPlan.spans, spanPlan.cells);
  const sites = planSites(seed, layout, distance);
  layout.sitePlans = sites.plans; layout.roles = sites.roles;
  for (const [k, g] of guardians) layout.roles.set(k, `${g.role}-guardian`);
  layout.populationScale = new Map();
  for (const k of hordes.keys()) {
    const i = layout.route.indexOf(k), before = layout.route[i - 1];
    if (i > (d === 0 ? 4 : 2) && !guardians.has(before)) layout.populationScale.set(before, .5);
  }
  // a gorge is mostly air and valley floor: fewer enemies down there
  for (const [k, s] of spanPlan.cells) if (s.role === 'gorge') { layout.roles.set(k, 'span'); layout.populationScale.set(k, .5); }
  return layout;
}

// themes: the world's theme picks (themes/depth.js worldThemes). A depth's theme (layout.theme)
// decides its gorge spans (and with them where the branches may go) and what its reward sites are
// like; the route, its guardians and hordes depend on the seed alone.
export function makeLayouts(seed, themes = worldThemes(seed)) {
  const cache = [];
  const get = d => cache[d] || (cache[d] = planArenas(seed, build(seed, d, d ? get(d - 1) : null, themeAt(d, themes))));
  get.themes = themes;
  return get;
}
