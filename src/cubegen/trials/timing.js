// The timing check of the timed events (docs/trials.md "Timing check"): against a slow player,
// not a perfect one. A Dijkstra over the cube's real reach graph (cubegen/reach.js, after the
// smoothing and the fences, with the structures) gives every floor its earliest arrival, each
// move costing its real duration: walking at WALK_SPEED (or RUN_SPEED), ramps and stairs by their
// length, ladders at the climb speed, a jump or a drop 0.6 s.
//   deadlines  the hazard gives each floor the time it stops being safe: the path must leave
//              every floor with arrival x SLACK + ARM_TIME <= deadline, and end on a floor with
//              none
import { N, LH, WALK_SPEED, CLIMB_SPEED, CHAR_H } from '../../core/constants.js';
import { Heap } from '../../core/heap.js';
import { ARM_TIME, SLACK } from '../../core/trials.js';
import { graph } from '../reach.js';
import { floorWalkable } from '../../physics/floornav.js';

export const JUMP_TIME = 0.6, USE_TIME = 1;
const level = f => f.fluid ? f.surf : f.top;
const lowest = f => f.cs ? Math.min(...f.cs) / LH : f.top;   // the floor's lowest corner (levels)

// how long the move from a to b takes (s), at `speed`: a route move's own, or a step to a neighbour
function duration(a, b, move, speed) {
  if (move) {
    const k = move.cells.length, rise = Math.abs(b.top - a.top) * LH;
    if (move.kind === 'ladder') return rise / CLIMB_SPEED + JUMP_TIME;
    if (move.kind === 'jump') return JUMP_TIME + (move.gap || 1) / speed;
    if (move.kind === 'drop') return JUMP_TIME;
    return Math.hypot(k + 1, rise) / speed;   // walk, stair, bridge, walkway
  }
  const dh = level(b) - level(a), d = Math.abs(a.x - b.x) + Math.abs(a.z - b.z) || 1;
  const linked = a.link?.some(l => l === b);
  if (linked || Math.abs(dh) < 1) return Math.hypot(d, dh * LH) / speed;
  return d / speed + JUMP_TIME;   // a jump up, or a drop
}

// earliest arrival (s) at every node from `start`, at `speed`: { time: Map(id -> s), prev, node }
export function arrivals(ctx, start, speed = WALK_SPEED) {
  const adj = graph(ctx, true), moves = new Map();
  for (const m of ctx.moves) {
    moves.set(m.from.id + '>' + m.to.id, m);
    if (!['walk', 'drop', 'jump'].includes(m.kind) && !moves.has(m.to.id + '>' + m.from.id)) moves.set(m.to.id + '>' + m.from.id, m);
  }
  // (the reach graph knows floors only: a stair or bridge crossing a column over its floor leaves
  // no room to walk there; on a route move the structure is the way)
  const room = new Map(), fits = f => f.landing || (room.get(f.id) ?? room.set(f.id, floorWalkable(ctx, f, CHAR_H, true)).get(f.id));
  const time = new Map([[start.id, 0]]), prev = new Map(), node = new Map([[start.id, start]]), done = new Set(), open = new Heap();
  open.push(0, start);
  while (open.size) {
    const a = open.pop();
    if (done.has(a.id)) continue;
    done.add(a.id);
    for (const b of adj.get(a.id) || []) {
      const move = moves.get(a.id + '>' + b.id);
      if (!move && !fits(b)) continue;
      const t = time.get(a.id) + duration(a, b, move, speed);
      if (t < (time.get(b.id) ?? Infinity)) { time.set(b.id, t); prev.set(b.id, a); node.set(b.id, b); open.push(t, b); }
    }
  }
  return { time, prev, node };
}

// the fastest path from the start to `goal` (nodes, the start first), or null
export function pathOf(arr, goal) {
  if (!arr.time.has(goal.id)) return null;
  const out = [goal];
  for (let n = goal; arr.prev.has(n.id); n = arr.prev.get(n.id)) out.unshift(arr.prev.get(n.id));
  return out;
}

// Deadlines: along `path`, every node is left (the next one reached) with arrival x SLACK + ARM_TIME
// at or before its deadline (deadline(node): s on the trial's clock, null for none); the last node
// has none. { ok, slack (the least margin, s), leave: [s, ...] (when each node is left), fail }
export function checkDeadlines(path, arr, deadline) {
  let slack = Infinity, fail = null;
  const leave = path.map((n, i) => i + 1 < path.length ? arr.time.get(path[i + 1].id) : Infinity);
  path.forEach((n, i) => {
    const dl = deadline(n);
    if (dl == null) return;
    if (i === path.length - 1) { fail ??= { node: n.id, why: 'ends on a floor with a deadline' }; slack = -Infinity; return; }
    const margin = dl - (leave[i] * SLACK + ARM_TIME);
    if (margin < slack) slack = margin;
    if (margin < 0) fail ??= { node: n.id, why: `left at ${leave[i].toFixed(1)} s, gone at ${dl.toFixed(1)} s` };
  });
  return { ok: !fail, slack, leave, fail };
}

// the level a node's floor is lost at (the water over its lowest corner)
export const floorLevel = n => n.landing ? n.top : lowest(n);
export const cellOf = n => n.z * N + n.x;
