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
import { planHeights, planSetPiece, planSlots, indexHeights, near } from './heights.js';
import { AREA_SIZE, templateCells, planArea, indexAreas } from './areas.js';

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
// template: { kind, at }: a large area (areas.js) whose cells, in their fixed order and any way
// round, the route takes from index `at` on
// learn: world.html#backtracking #route-code (see learn/README.md)
function route(candidates, prefix, length, goal, R, template = null) {
  const allowed = new Set(candidates.map(id)), used = new Set(prefix.map(id));
  const priority = new Map(candidates.map(c => [id(c), R()])), out = [...prefix];
  function visit() {
    const c = out.at(-1);
    if (out.length === length) return goal(c);
    if (template && out.length === template.at) {
      for (const f of AXES) for (const l of AXES.filter(([x, z]) => x * f[0] + z * f[1] === 0)) {
        const cells = templateCells(template.kind, [c[0] + f[0], c[1] + f[1]], f, l);
        if (!cells.every(n => allowed.has(id(n)) && !used.has(id(n)))) continue;
        for (const n of cells) { out.push(n); used.add(id(n)); }
        if (visit()) return true;
        for (const n of cells) { out.pop(); used.delete(id(n)); }
      }
      return false;
    }
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

// the side guardians' places on a route of `length` rooms: evenly spaced, each moved to the
// nearest room that is not part of the large area nor the room right after it (`skip`), and
// where it can, not right next to another guardian (as the even spacing never is)
function guardianIndices(length, count, first, skip) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const want = first + Math.floor((length - 2 - first) * (i + 1) / (count + 1));
    const ok = (x, apart) => x >= first && x <= length - (apart ? 3 : 2) && !skip.has(x) && !out.includes(x)
      && (!apart || out.every(o => Math.abs(o - x) > 1));
    for (const apart of [true, false]) {
      let at;
      for (let j = 0; j < length && at === undefined; j++) at = [want + j, want - j].find(x => ok(x, apart));
      if (at !== undefined) { out.push(at); break; }
    }
  }
  return out;
}

// where a large area of `size` rooms may start on a route of `length` rooms: never the first room,
// the room after it never the last (the descent), and room for two side guardians outside it, apart
function areaStarts(length, size, first) {
  const out = [];
  for (let at = 1; at + size <= length - 2; at++) {
    const g = guardianIndices(length, 2, first, new Set(Array.from({ length: size + 1 }, (_, j) => at + j)));
    if (g.length === 2 && Math.abs(g[0] - g[1]) > 1 && Math.max(...g) <= length - 3) out.push(at);
  }
  return out;
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
  const lengthAt = i => MIN_ROUTE_ROOMS + (desired - MIN_ROUTE_ROOMS + i) % (max - MIN_ROUTE_ROOMS + 1);
  // the depth's large area (areas.js) is built into the route, on a stream of its own (a depth
  // without one keeps its route); where it does not fit the depth may get a tableland instead
  const slots = planSlots(seed, d, theme);
  let spine = null, area = null;
  if (AREA_SIZE[slots.big]) {
    const TR = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x7f4a7c15) ^ 0xa4ea)), size = AREA_SIZE[slots.big];
    for (let i = 0; i <= max - MIN_ROUTE_ROOMS && !spine; i++) {
      const length = lengthAt(i), starts = areaStarts(length, size, 2);
      for (let j = starts.length - 1; j > 0; j--) { const k = Math.floor(TR() * (j + 1)); [starts[j], starts[k]] = [starts[k], starts[j]]; }
      for (const at of starts) {
        spine = route(candidates, prefix, length, goal, TR, { kind: slots.big, at });
        if (spine) { area = { kind: slots.big, at, size }; break; }
      }
    }
  }
  for (let i = 0; i <= max - MIN_ROUTE_ROOMS && !spine; i++) spine = route(candidates, prefix, lengthAt(i), goal, R);
  if (!spine) throw new Error(`No bounded route at depth ${d}`);
  const start = spine[0], end = spine.at(-1), cells = [...spine], portals = new Set();
  const link = (a, b) => portals.add(faceKey(K(a), direction(a, b)));
  const exit = new Map(), routeIndex = new Map(), distance = new Map();
  spine.forEach((c, i) => {
    routeIndex.set(K(c), i); distance.set(K(c), 0);
    if (i + 1 < spine.length) { link(c, spine[i + 1]); exit.set(K(c), direction(c, spine[i + 1])); }
  });
  if (d < MAX_DEPTH) exit.set(K(end), 4);
  // the area's rooms (and the room after it, which it comes into high up) are never guarded
  const areaRooms = area ? spine.slice(area.at, area.at + area.size) : [];
  const inArea = c => areaRooms.some(a => id(a) === id(c)), nearArea = c => near(c, areaRooms);
  const guardians = new Map(), gateFaces = new Map();
  if (d < MAX_DEPTH) {
    guardians.set(K(end), { role: 'descent', exit: 4, bossPlaceholder: true });
    const count = 1 + Math.floor(R() * 2), first = d === 0 ? 3 : 2;
    const skip = new Set(area ? Array.from({ length: area.size + 1 }, (_, j) => area.at + j) : []);
    for (const index of guardianIndices(spine.length, count, first, skip)) {
      const k = K(spine[index]), dir = exit.get(k);
      guardians.set(k, { role: 'side', exit: dir, bossPlaceholder: false });
      gateFaces.set(faceKey(k, dir), k);
    }
  }
  const hordes = planHordes(seed, d, spine.map(K), guardians, k => areaRooms.some(a => K(a) === k));
  // One-room branches only, never attached to arenas or the safe surface prefix.
  // No loops: all sideways guardians are articulation points on the required route.
  const used = new Set(cells.map(id)), allowed = new Set(candidates.map(id));
  const branchBudget = Math.min(4, MAX_ROUTE_ROOMS - cells.length);
  // gorge spans (spans.js): on the route, and maybe a lonely island branch over a bridge
  const free = c => !used.has(id(c)) && !(d === 0 && cheb(c) <= 1);
  const spanPlan = planSpans(seed, d, theme.spans, spine, K, k => guardians.has(k) || hordes.has(k)
    || nearArea(k.split(',').map(Number).filter((_, i) => i !== 1)), free, branchBudget, area?.kind === 'hairpin' ? 1 : 0);
  // the large area: a hairpin's two spans go in with the others
  const areaPlan = area ? planArea(seed, d, theme, area.kind, spine, area.at, K, free) : null;
  if (areaPlan?.kind === 'hairpin') for (const span of areaPlan.spans) {
    spanPlan.spans.push(span);
    spanPlan.cells.set(span.keys[1], { span, i: 0, role: 'gorge' });
    if (span.sky) for (const c of areaPlan.beside) spanPlan.apart.add(K(c));
  }
  const nearSpan = c => [c, ...nb(c)].some(n => spanPlan.apart.has(K(n)));
  // big height differences (heights.js): a tableland on the route, away from spans, guardians,
  // the horde and the ends of the route
  const spanned = [...spanPlan.cells.keys()].map(k => { const [x, , z] = k.split(',').map(Number); return [x, z]; });
  const heightPlan = planHeights(seed, d, theme, spine, K, c => guardians.has(K(c)) || hordes.has(K(c)) || near(c, spanned)
    || id(c) === id(spine[0]) || id(c) === id(spine.at(-1)), slots.big === 'tableland' || (!!slots.big && !area));
  const plateaus = [...heightPlan.cells].filter(([, h]) => h.role === 'plateau').map(([k]) => { const [x, , z] = k.split(',').map(Number); return [x, z]; });
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
    if (guardians.has(K(c)) || spanPlan.cells.has(K(c)) || heightPlan.cells.has(K(c)) || inArea(c)) continue;
    const options = nb(c).filter(n => allowed.has(id(n)) && !used.has(id(n)) && !nearSpan(n) && !near(n, plateaus) && !nearArea(n));
    if (!options.length || R() < .4) continue;
    const n = options[Math.floor(R() * options.length)];
    cells.push(n); used.add(id(n)); link(c, n); exit.set(K(n), direction(n, c));
    routeIndex.set(K(n), routeIndex.get(K(c))); distance.set(K(n), 1);
  }
  const layout = { depth: d, theme, cells, start, end, spine: spine.length, route: spine.map(K), routeIndex,
    exists: new Set(cells.map(K)), portals, exit, guardians, gateFaces, hordes,
    up: d ? K(start) : null, down: d < MAX_DEPTH ? K(end) : null, guardian: guardianDepth(seed, d) };
  indexSpans(layout, spanPlan.spans, spanPlan.cells);
  indexHeights(layout, heightPlan);
  indexAreas(layout, areaPlan ? [areaPlan] : []);
  const sites = planSites(seed, layout, distance);
  layout.sitePlans = sites.plans; layout.roles = sites.roles;
  Object.assign(layout, planSetPiece(layout, slots));
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
