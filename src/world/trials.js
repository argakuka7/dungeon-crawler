// Trials (docs/trials.md), planned with the layout from the seed alone, on their own random stream,
// like the guardians and the hordes: so the plan never depends on the order the world is explored in.
//
// Per depth from 1 to 19 (none in the town or the core):
//   the event slot   by chance (EVENT_CHANCE), at most one, on the route
//   puzzle slots     one by chance PUZZLE_CHANCES[0], a second by PUZZLE_CHANCES[1]; a puzzle
//                    prefers a branch room (its gate is the door of a vault round the branch's
//                    reward site), else it goes on the route (its gate before the exit)
// The kind is drawn by weight among those whose depths and themes fit (core/trials.js).
//
// A trial room is never a guardian's, the horde's, a span's, a height piece's, in or beside the
// large area, a set piece, an annex (or its parent), the depth's entrance or descent, next to
// another trial or next to a cube the WFC pins (its faces are pinned flat, LLLL). Nothing falls
// into it (world/voids.js, world/heights.js shaftOf). The room before (`from`) is an ordinary room.
//
//   trial: { id, key, kind, role: 'route' | 'branch', from (the room before), fromDir (the way
//            from it into the trial room), exit (the trial room's exit face; null in a branch),
//            gate ('trial:<key>'), stages (sunken: its stage puzzles), K (layers) }
import { mulberry32, hash32 } from '../core/util.js';
import { MAX_DEPTH } from '../themes/depth.js';
import { TRIALS, TRIAL_KINDS, trialGate, trialFits, trialWeight, parseForce, isEvent, isPuzzle } from '../core/trials.js';
import { faceKey, hashKey } from './coords.js';
import { N } from '../core/constants.js';

// Where the portal on side face d of trial room k stands along the face: a trial room's faces are
// flat (LLLL, no river) and nothing else moves their portals, so it is the face's own first draw
// (world/faces.js sideFace), known now already
export const portalPos = (seed, k, d) => 3 + Math.floor(mulberry32(hash32(seed ^ hashKey(faceKey(k, d)) ^ 0x51de))() * 10);
// a kind's room needs room between its two portals: the collapse's aprons in front of them
// (cubegen/trials/collapse.js) must stand well apart where the way turns
function roomFits(kind, seed, k, entry, exit) {
  if (kind !== 'collapse' || exit == null || (entry ^ 1) === exit || entry === (exit ^ 1)) return true;
  const at = d => { const t = portalPos(seed, k, d); return [[N - 4, t], [3, t], [t, N - 4], [t, 3]][d]; };
  const [a, b] = [at(entry), at(exit)];
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) >= 7;
}

// the chances of the slots (docs/trials.md "Planning"); 0 until the kinds are on (step by step)
export const EVENT_CHANCE = 0.45;
export const PUZZLE_CHANCES = [0.6, 0.25];

const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const direction = (a, b) => AXES.findIndex(([x, z]) => a[0] + x === b[0] && a[1] + z === b[1]);
const nb = ([x, z]) => AXES.map(([dx, dz]) => [x + dx, z + dz]);

function weighted(list, r) {
  const sum = list.reduce((s, [, w]) => s + w, 0);
  let x = r * sum;
  for (const [k, w] of list) if ((x -= w) < 0) return k;
  return list.at(-1)?.[0] ?? null;
}

// the kinds of a family that fit depth d (by weight), the forced one alone if it is of the family
function kindsFor(family, d, theme, force) {
  if (force) return TRIALS[force.kind].family === family ? [[force.kind, 1]] : [];
  return TRIAL_KINDS.filter(k => TRIALS[k].family === family && trialFits(k, d, theme)).map(k => [k, trialWeight(k, theme)]);
}

// sunken's stage puzzles: 2 (depths 2-9) or 3 (10-19), any built puzzle kind but runes and
// timedgate, by the theme's weights, no kind twice
export function sunkenStages(d, theme, R, force = null) {
  const n = d >= 10 ? 3 : 2;
  if (force?.stages?.length) return force.stages.slice(0, 3);
  const pool = TRIAL_KINDS.filter(k => isPuzzle(k) && TRIALS[k].built && k !== 'runes' && k !== 'timedgate');
  let list = pool.filter(k => trialFits(k, d, theme)).map(k => [k, trialWeight(k, theme)]);
  if (list.length < n) list = pool.map(k => [k, trialWeight(k, theme)]);
  const out = [];
  while (out.length < n && list.length) {
    const k = weighted(list, R());
    out.push(k); list = list.filter(([x]) => x !== k);
  }
  while (out.length < n) out.push(out[out.length % Math.max(1, out.length)] ?? 'slide');
  return out;
}

// how many layers a trial room has (the WFC pins it): sunken and miasma two, the rest one
export const trialLayers = kind => kind === 'sunken' || kind === 'miasma' ? 2 : 1;

// The plan of depth d, part one (before the branches): the event slot on the route.
//   ctx: { seed, d, theme, force (?trial=), spine (the route's cells), K (cell -> key),
//          blocked(cell) (no trial there: guardians, hordes, spans, heights, the area),
//          pinned(cell) (the WFC pins it: no trial room may touch it) }
// Returns the plan, to be finished by planPuzzles once the branches are in.
export function planTrials({ seed, d, theme, force: f, spine, K, blocked, pinned, guarded }) {
  const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x7a1a15) ^ 0x7e1a)), force = parseForce(f);
  const plan = { R, force, list: [], cells: new Map(), d, theme, seed };
  if (d < 1 || d >= MAX_DEPTH) return plan;
  const roll = R(), kindRoll = R(), roomRoll = R();
  const events = kindsFor('event', d, theme, force);
  if (!events.length || !(force ? isEvent(force.kind) : roll < EVENT_CHANCE)) return plan;
  const kind = weighted(events, kindRoll);
  const rooms = routeRooms(plan, spine, K, blocked, pinned, guarded).filter(i => roomFits(kind, seed, K(spine[i]), direction(spine[i], spine[i - 1]), direction(spine[i], spine[i + 1])));
  if (!rooms.length) return plan;
  const i = rooms[Math.floor(roomRoll * rooms.length)];
  add(plan, { kind, role: 'route', key: K(spine[i]), from: K(spine[i - 1]), fromDir: direction(spine[i - 1], spine[i]),
    exit: direction(spine[i], spine[i + 1]) }, spine[i], d, theme);
  return plan;
}

// the route rooms (indices) a trial may take: index 2 to length - 2, the room and the one before
// it ordinary, the one after it no guardian's (the trial's gate would shut its way in too), nothing
// pinned beside it, no trial next to it
function routeRooms(plan, spine, K, blocked, pinned, guarded = () => false) {
  const out = [];
  for (let i = 2; i <= spine.length - 2; i++) {
    const c = spine[i];
    if (blocked(c) || blocked(spine[i - 1]) || guarded(spine[i + 1]) || nb(c).some(pinned) || pinned(c)) continue;
    if ([c, ...nb(c)].some(n => plan.cells.has(K(n)))) continue;
    out.push(i);
  }
  return out;
}

function add(plan, t, cell, d, theme) {
  const entry = { id: `${plan.seed}:${t.key}:trial`, ...t, gate: trialGate(t.key), cell, depth: d, K: trialLayers(t.kind) };
  if (t.kind === 'sunken') entry.stages = sunkenStages(d, theme, plan.R, plan.force);
  plan.list.push(entry); plan.cells.set(t.key, entry);
  return entry;
}

// Part two (after the branches and the annex): the puzzle slots.
//   ctx: { spine, K, blocked, pinned, branches: [{ cell, parent }] (one-room branches, not
//          islands nor the annex), busy(key) (a room no puzzle may take: the annex's parent) }
export function planPuzzles(plan, { spine, K, blocked, pinned, guarded, branches, busy = () => false }) {
  const { R, force, d, theme } = plan;
  if (d < 1 || d >= MAX_DEPTH) return plan;
  const puzzles = kindsFor('puzzle', d, theme, force);
  const near = c => [c, ...nb(c)].some(n => plan.cells.has(K(n)));
  for (const [slot, chance] of PUZZLE_CHANCES.entries()) {
    const roll = R(), kindRoll = R(), roomRoll = R();
    if (!puzzles.length || !(force ? isPuzzle(force.kind) : roll < chance)) continue;
    const kind = weighted(puzzles, kindRoll);
    // a forced puzzle: the first slot in a branch, the second on the route (both get tried)
    const vaults = force && slot === 1 ? [] : branches.filter(b => !blocked(b.cell) && !pinned(b.cell) && !nb(b.cell).some(pinned)
      && !near(b.cell) && !near(b.parent) && !busy(K(b.cell)) && !busy(K(b.parent)));
    if (vaults.length) {
      const b = vaults[Math.floor(roomRoll * vaults.length)];
      add(plan, { kind, role: 'branch', key: K(b.cell), from: K(b.parent), fromDir: direction(b.parent, b.cell), exit: null }, b.cell, d, theme);
      continue;
    }
    const rooms = routeRooms(plan, spine, K, c => blocked(c) || busy(K(c)), pinned, guarded);
    if (!rooms.length) continue;
    const i = rooms[Math.floor(roomRoll * rooms.length)];
    add(plan, { kind, role: 'route', key: K(spine[i]), from: K(spine[i - 1]), fromDir: direction(spine[i - 1], spine[i]),
      exit: direction(spine[i], spine[i + 1]) }, spine[i], d, theme);
  }
  return plan;
}

// the layout's lookup tables (world/layout.js)
export function indexTrials(layout, plan) {
  layout.trials = plan.list;
  layout.trialCells = plan.cells;
  return layout;
}

// the sockets and layers the WFC pins trial rooms to: flat all round (no river crosses them)
export function trialPins(layout) {
  const pins = new Map();
  for (const t of layout.trials || []) pins.set(t.key, { sock: ['L', 'L', 'L', 'L'], K: t.K });
  return pins;
}

// the kind of trial behind each side face of cube k (for the warning on its portals), or null
export function trialFaces(layout, k) {
  return [0, 1, 2, 3].map(dir => {
    const t = (layout.trials || []).find(x => x.from === k && x.fromDir === dir);
    return t ? t.kind : null;
  });
}
