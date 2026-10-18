// A trial room's shape and parts (docs/trials.md), built from spec.trial (world/trials.js) into
// map.trial. The stages, in the generator's order (cubegen/index.js):
//   shapeTrial    the room's big shape (the archetype 'trial'), one module per kind
//   trialCosts    before the route search: what the kind makes its ways cost
//   routeTrial    after the route: the way to the trial's goal from the entry (and on to the
//                 exit) is searched and kept, so what it needs gets built
//   finishTrial   at the end, with the final slopes and fences: the goal must be reachable from
//                 the entry and lead on to the exit, and the kind's own check must pass (the
//                 timing of an event, cubegen/trials/timing.js); else the attempt is retried
import { N, LH } from '../../core/constants.js';
import { floorY } from '../../core/surfaces.js';
import { search, take } from '../route.js';
import { reachFrom, reachTo, graph } from '../reach.js';
import { shapeFlood, floodGoal, floodRoute } from './flood.js';
import { shapeCollapse, collapseGoal, collapseRoute } from './collapse.js';
import { arrivals, pathOf, checkDeadlines, floorLevel } from './timing.js';
import { ARM_TIME, SLACK, fitFlood, floodTime, FLOOD, WAVE, crumbleTime } from '../../core/trials.js';

const KINDS = {
  flood: { shape: shapeFlood, goal: floodGoal, costs: floodRoute, finish: finishFlood },
  collapse: { shape: shapeCollapse, goal: collapseGoal, costs: collapseRoute, finish: finishCollapse },
};

// before the route search: what the kind makes its ways cost (cubegen/index.js)
export function trialCosts(ctx) { if (ctx.spec.trial) KINDS[ctx.spec.trial.kind].costs?.(ctx); }

export function shapeTrial(ctx) {
  const kind = KINDS[ctx.spec.trial.kind];
  if (!kind) throw new Error(`no generator for the trial ${ctx.spec.trial.kind}`);
  kind.shape(ctx);
}

// the entry's floor: the portal the room is entered by (spec.trial.entry)
const entryFloor = ctx => ctx.portalFloors[ctx.portals.findIndex(p => p.dir === ctx.spec.trial.entry)] ?? null;

// the way from the entry to the goal, and on from it to the exit, taken into the route
export function routeTrial(ctx) {
  if (!ctx.spec.trial) return true;
  const t = ctx.trialBuild, entry = entryFloor(ctx), goal = KINDS[ctx.spec.trial.kind].goal(ctx);
  if (!entry || !goal || t.failed) return false;
  const up = search(ctx, entry, goal, ctx.jitter, ctx.have), on = ctx.hub && search(ctx, goal, ctx.hub, ctx.jitter, ctx.have);
  if (!up || (ctx.hub && !on)) return false;
  take(ctx, up); if (on) take(ctx, on);
  ctx.reqMoves = ctx.moves.length;
  Object.assign(t, { entry, goal, up });
  return true;
}

// map.trial, or null (the attempt fails): pathPoints turns moves into a polyline (cubegen/index.js)
export function finishTrial(ctx, pathPoints) {
  const spec = ctx.spec;
  if (!spec.trial) return { trial: null };
  const t = ctx.trialBuild, { entry, goal } = t;
  // the goal is reached from the entry (and every other portal) and leads on to the exit, with the
  // final slopes and fences
  const toGoal = reachTo(ctx, goal, true);
  if (!reachFrom(ctx, [entry], true).has(goal.id) || ctx.portalFloors.some(f => !toGoal.has(f.id))) return null;
  if (ctx.hub && !reachTo(ctx, ctx.hub, true).has(goal.id)) return null;
  const pathFloors = [...new Set(t.up.flatMap(m => [m.from, m.to]))].filter(f => !f.landing);
  // nobody spawns on the trial's own ground or the way to its goal
  for (const c of t.keep) for (const f of ctx.cols[c]) f.noSpawn = true;
  for (const f of pathFloors) f.noSpawn = true;
  const out = { id: spec.trial.id, key: spec.trial.key, kind: spec.trial.kind, role: spec.trial.role, gate: spec.trial.gate,
    from: spec.trial.from, fromDir: spec.trial.fromDir, entry: spec.trial.entry, exit: spec.trial.exit, fluid: spec.fluid,
    path: pathPoints(ctx, t.up), pathFloors: pathFloors.map(f => f.id), entryFloor: entry.id, goalFloor: goal.id, parts: [] };
  const own = KINDS[t.kind].finish(ctx, t, out);
  if (!own) return null;
  Object.assign(out, own);
  // enemies keep off the checked path and its 2-cell band
  if (out.check?.path) {
    const band = out.check.path.map(p => [Math.floor(p.x), Math.floor(p.z)]);
    for (const g of ctx.floors) if (band.some(([x, z]) => Math.max(Math.abs(g.x - x), Math.abs(g.z - z)) <= 2)) g.noSpawn = true;
  }
  // no props on the trial's own ground, nor any in the way of the checked path
  const reservations = t.keep.map(c => ({ c, layer: 0 }));
  for (const p of out.check?.path || []) {
    const f = ctx.cols[Math.floor(p.z) * N + Math.floor(p.x)].find(g => Math.abs(g.top * LH - p.y) < 0.01);
    if (f) reservations.push({ c: f.c, layer: f.layer });
  }
  return { trial: out, reservations };
}

// the checked path as plain points: where, when a slow player arrives, when it is lost (null: never)
const checkPath = (path, arr, deadline) => path.map(n => ({ x: n.x + 0.5, y: n.top * LH, z: n.z + 0.5,
  t: Math.round(arr.time.get(n.id) * 100) / 100, dl: deadline(n) }));

// --- flood -------------------------------------------------------------------------------------------

function finishFlood(ctx, t, out) {
  const s = t.summit, f = t.goal;
  // the summit is the highest ground (but for the rock walls round a cave or a canyon)
  const inside = g => Math.min(g.x, g.z, N - 1 - g.x, N - 1 - g.z) >= 2;
  if (ctx.floors.some(g => !g.fluid && inside(g) && g.top > s.level)) return null;
  const timed = fitFloodRoom(ctx, t.entry, f, s.level);
  if (!timed) return null;
  const button = { x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 };
  return { summit: { c: s.c, level: s.level, x: s.x + 0.5, z: s.z + 0.5, cells: s.cells }, lo: t.lo,
    button, parts: [{ id: 'button', type: 'button', ...button }], ...timed };
}

// The flood's timeline, fitted to the fastest way up for a slow player, then checked on its own:
// { timeline, check: { path: [{ x, y, z, t (arrival), dl (deadline) }], slack } }, or null
function fitFloodRoom(ctx, entry, goal, summit) {
  const arr = arrivals(ctx, entry), path = pathOf(arr, goal);
  if (!path) return null;
  const ground = ctx.floors.filter(f => !f.fluid && f.layer === 0);
  const from = Math.min(...ground.map(f => f.top)) - 1, to = summit - 2;
  // each pulse no earlier than a slow player has left every floor of the path it floods
  const needs = [];
  path.forEach((n, i) => {
    const h = floorLevel(n);
    if (i + 1 >= path.length || h >= to) return;
    const j = Math.max(0, Math.floor((h - from) / FLOOD.step)), need = arr.time.get(path[i + 1].id) * SLACK + ARM_TIME;
    needs[j] = Math.max(needs[j] ?? 0, need);
  });
  const timeline = fitFlood(from, to, needs);
  if (!timeline) return null;
  const deadline = n => floorLevel(n) >= to ? null : floodTime(timeline, floorLevel(n));
  const check = checkDeadlines(path, arr, deadline);
  if (!check.ok) return null;
  return { timeline, check: { slack: Math.round(check.slack * 100) / 100, path: checkPath(path, arr, deadline) } };
}

// --- collapse ----------------------------------------------------------------------------------------

// Every crust cell's distance from the entry apron over the crust (a gap jumped counts two cells),
// the wave fitted to a slow player (its delay: as little as keeps every crust cell of the fastest
// way to the exit apron standing until it is left), then checked on its own. Each dead end must be
// one: nothing but the crust it leaves leads off it.
function finishCollapse(ctx, t, out) {
  const crust = t.crust, apron = new Set(t.entryApron), exitApron = new Set(t.exitApron);
  const dist = new Map(t.entryApron.map(c => [c, 0])), queue = [...t.entryApron];
  const walkable = c => crust.has(c) || apron.has(c) || exitApron.has(c);
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], x = c % N, z = (c / N) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const k of [1, 2]) {
      const nx = x + dx * k, nz = z + dz * k;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const n = nz * N + nx;
      if (k === 2 && walkable(nz * N + nx - dx - dz * N)) continue;   // (only over a gap)
      if (!walkable(n) || dist.has(n)) continue;
      dist.set(n, dist.get(c) + k); queue.push(n);
    }
  }
  if ([...crust.keys()].some(c => !dist.has(c)) || t.exitApron.some(c => !dist.has(c))) return null;
  const floorOf = c => ctx.cols[c].find(f => f.layer === 0 && !f.fluid);
  const arr = arrivals(ctx, t.entry), path = pathOf(arr, t.goal);
  if (!path) return null;
  const onCrust = n => !n.landing && crust.has(n.c) && floorOf(n.c) === n;
  // the delay that lets a slow player off every crust cell of the way before it goes
  let delay = 0;
  path.forEach((n, i) => {
    if (i + 1 >= path.length || !onCrust(n)) return;
    delay = Math.max(delay, arr.time.get(path[i + 1].id) * SLACK + ARM_TIME - crumbleTime({ speed: WAVE.speed, delay: 0 }, dist.get(n.c)));
  });
  delay = Math.ceil((delay + WAVE.margin) * 10) / 10;
  if (delay > WAVE.most) return null;
  const wave = { speed: WAVE.speed, delay };
  const deadline = n => onCrust(n) ? crumbleTime(wave, dist.get(n.c)) : null;
  const check = checkDeadlines(path, arr, deadline);
  if (!check.ok) return null;
  // the crust floors: what crumbles, and when
  const cells = [];
  for (const [c, info] of crust) {
    const f = floorOf(c);
    if (!f) return null;
    f.crust = true; f.noSpawn = true;
    cells.push({ c, f: f.id, d: dist.get(c), branch: info.branch });
  }
  // each dead end is one: from its floors nothing leads anywhere but onto the crust (and the
  // crust of the way leads into it only where it leaves)
  const adj = graph(ctx, true);
  for (const q of cells) if (q.branch)
    for (const g of adj.get(q.f) || []) if (!g.crust && !g.fluid) return null;
  const centre = ctx.floors[t.goal.id];
  return { wave, crust: cells, entryApron: t.entryApron, exitApron: t.exitApron, gaps: t.gaps.length, branches: t.branches,
    keystone: { x: centre.x + 0.5, y: floorY(centre, 0.5, 0.5), z: centre.z + 0.5 },
    check: { slack: Math.round(check.slack * 100) / 100, path: checkPath(path, arr, deadline) } };
}
