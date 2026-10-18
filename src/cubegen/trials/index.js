// A trial room's shape and parts (docs/trials.md), built from spec.trial (world/trials.js) into
// map.trial. The stages, in the generator's order (cubegen/index.js):
//   shapeTrial    the room's big shape (the archetype 'trial'), one module per kind
//   routeTrial    after the route: the way to the trial's goal from the entry (and on to the
//                 exit) is searched and kept, so what it needs gets built
//   finishTrial   at the end, with the final slopes and fences: the goal must be reachable from
//                 the entry and lead on to the exit, and the kind's own check must pass (the
//                 timing of an event, cubegen/trials/timing.js); else the attempt is retried
import { N } from '../../core/constants.js';
import { floorY } from '../../core/surfaces.js';
import { search, take } from '../route.js';
import { reachFrom, reachTo } from '../reach.js';
import { shapeFlood, floodGoal } from './flood.js';

const KINDS = {
  flood: { shape: shapeFlood, goal: floodGoal },
};

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
  if (!entry || !goal) return false;
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
    from: spec.trial.from, fromDir: spec.trial.fromDir, entry: spec.trial.entry, exit: spec.trial.exit,
    path: pathPoints(ctx, t.up), pathFloors: pathFloors.map(f => f.id), entryFloor: entry.id, goalFloor: goal.id };
  if (t.kind === 'flood') {
    const s = t.summit, f = goal;
    // the summit is the highest ground (but for the rock walls round a cave or a canyon)
    const inside = g => Math.min(g.x, g.z, N - 1 - g.x, N - 1 - g.z) >= 2;
    if (ctx.floors.some(g => !g.fluid && inside(g) && g.top > s.level)) return null;
    Object.assign(out, { summit: { c: s.c, level: s.level, x: s.x + 0.5, z: s.z + 0.5, cells: s.cells }, lo: t.lo,
      button: { x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 } });
  }
  return { trial: out, reservations: t.keep.map(c => ({ c, layer: 0 })) };
}
