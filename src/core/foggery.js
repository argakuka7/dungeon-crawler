// Foggery's fight as rules, his tower and the floating platforms round its top (game/foggery.js
// runs the fight, game/movers.js the platforms; cubegen/towerarena.js builds the tower; his
// profiles are core/enemies.js FOGGERY and FOGGERY_BALL). docs/bosses.md tells the whole fight.
//
// His arena is a caldera full of lava with a great round tower in the middle. You come in on a
// stone bridge over the lava; a ramp winds up round the tower from the ground to its top, and
// the bridge joins it on a flat stretch. Once the lava has risen to its highest, stone platforms
// rise out of it round the top, in a ring of slots two by two cells each, and slide from slot to
// slot like a sliding puzzle (game/movers.js).
//
// Phase 1 (full health to two thirds): when the fight starts the lava rises from its rest to just
// under the top of the tower over `lava.rise` s, and he walks up the ramp (`climb`) to the top,
// throwing his eyes (one at a time; each grows back) and calling up Fire-faces (a summon fills up
// to `minions[0]`). No blow takes him below two thirds before he is on top: once there, he curls
// up into a ball with a shield (`morphTime`, nothing hurting him). Phase 2: two Fire-cats guard
// him; while one lives the shield holds and nothing hurts him; once both are dead it is down, and
// `catsAgain` s later he calls two new ones. He spits fireballs and makes fire geysers burst out
// of the floor. At a third of his health (phase 3) the lava rises over the top of the tower
// (`lava.flood` s): only the platforms are safe. He floats over the drowned top, circling, throws
// volleys of fireballs, still calls his cats and makes geysers burst through the platforms.
// His death drains the lava away for good and takes his minions along.
// Falling into his lava costs a quarter of one's health, and magic takes one back to safe ground
// (game/foggery.js lavaRescue).
import { mulberry32 } from './util.js';

export const FOGGERY_FIGHT = Object.freeze({
  splits: [2 / 3, 1 / 3],     // the shares of his health phase 2 and phase 3 start at
  morphTime: 2.4,             // s he curls up into his ball, nothing hurting him
  floodTime: 2,               // s he rises up at a third of his health, nothing hurting him
  wake: 2.4,                  // cells: a player this close to him wakes him (or a hit)
  hurry: 2.2,                 // how much faster he climbs at two thirds of his health, not yet on top
  eyes: { grow: 2.5 },        // s an eye he threw takes to grow back
  lava: { rise: 60, flood: 6, drain: 7 },   // s the lava takes to rise, to flood the top, to drain away
  minions: [3, 2, 2],         // the most Fire-faces (phase 1) / Fire-cats (2, 3) at once
  summonCool: 10,             // s from one summon of Fire-faces to the next
  firstSummon: 4,             // s into the fight before his first summon
  catsAgain: 8,               // s after both cats are dead before he calls new ones
  geyser: { first: 2, every: [7, 10] },   // s into phase 2 before the first geysers, then between them
  orbit: { r: 3.6, speed: 0.22, lift: 0.4 },   // phase 3: how far from the middle he circles (cells), how fast (rad/s), how high over the platforms
  rescue: 0.25,               // what falling into his lava costs, of one's most health
  leave: 0.5,                 // s a minion he takes along lingers, gone, before it is let go
});
const ALL = ['eyeL', 'eyeR', 'summon', 'spit', 'volley', 'geyser', 'cats'];

// the health phase `phase` + 1 starts at (no blow takes him below it before)
export const splitHp = (maxHp, phase) => Math.ceil(maxHp * FOGGERY_FIGHT.splits[phase - 1]);
// how many minions a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, FOGGERY_FIGHT.minions[phase - 1] - alive);
// The attacks he may not start now (names). Phase 1: the eye throws (each only while he has that
// eye) and the summon of Fire-faces when due. Phases 2 and 3: only the cats while they are due;
// else the fireball (phase 2) or the volley (phase 3) and the geysers when due.
export function barred({ phase, eyes = [1, 1], summonDue = false, catsDue = false, geyserDue = false }) {
  if (phase === 1) return new Set(ALL.filter(n => !(n === 'eyeL' && eyes[0] >= 1) && !(n === 'eyeR' && eyes[1] >= 1) && !(n === 'summon' && summonDue)));
  if (catsDue) return new Set(ALL.filter(n => n !== 'cats'));
  return new Set(ALL.filter(n => !(n === 'spit' && phase === 2) && !(n === 'volley' && phase === 3) && !(n === 'geyser' && geyserDue)));
}

// --- his tower ------------------------------------------------------------------------------
// Heights are in levels (half a cell). The tower stands in the middle of the cube (MID, MID).
// The rim round the caldera holds the lava in; the platforms float a level over the top.
export const TOWER = Object.freeze({
  mid: 8,
  ground: 1,                // the caldera's floor
  top: 20,                  // the top of the tower
  rim: [22, 24],            // the rim round the caldera (cells 1 and 14 in from each side)
  core: 2.2,                // cells: the solid core round the middle
  ring: 4.31,               // cells: the ramp round it, out to here
  pitch: 10,                // levels the ramp climbs in a turn
  junction: 0.12,           // turns of the ramp kept flat where the bridge joins it
  landing: 0.4,             // turns of the ramp at the top, flat (the top of the tower with the core)
  slab: 2,                  // levels thick: the ramp and the bridge
  pit: [2, 14],             // the caldera's cells (each way: from, past the last)
  lava: { rest: 2, high: 19, flood: 20.6, gone: -1 },   // levels: the lava at rest, under the top, over it, drained
});
export const PLATFORMS = Object.freeze({
  top: 21,                  // levels: where their tops float
  thick: 0.32,              // cells
  size: 2,                  // cells each way: a slot
  count: 13,                // platforms in the ring of 20 slots
  every: 2,                 // s between steps of the puzzle
  move: 1.2,                // s a step's slides take
  moves: 2,                 // platforms that may slide at once
  near: 2,                  // the least that touch the top of the tower
});

const TAU = Math.PI * 2;
export const wrap = a => a - Math.floor(a + 0.5);   // turns into -0.5 .. 0.5
// where along the ramp (turns from its foot) things are: the foot (0), the flat at the bridge
// (j0 .. j1), the top (t) and the end of the landing there (end); door: the bridge's level
export function rampMarks(door) {
  const T = TOWER, j0 = (door - T.ground) / T.pitch, j1 = j0 + T.junction, t = j1 + (T.top - door) / T.pitch;
  return { j0, j1, jc: (j0 + j1) / 2, t, end: t + T.landing };
}
// the ramp's height (levels) u turns from its foot
export function rampHeight(u, door) {
  const T = TOWER, m = rampMarks(door);
  if (u <= 0) return T.ground;
  if (u < m.j0) return T.ground + u * T.pitch;
  if (u < m.j1) return door;
  if (u < m.t) return door + (u - m.j1) * T.pitch;
  return T.top;
}
// The ramp turns round the middle the way `spin` says (1 or -1) and the bridge joins it on the
// side of the doorway (angle `at`, radians: atan2(dz, dx)). angle -> the turns u (from the foot)
// the ramp passes over it: one u each turn, within the ramp
export function rampTurns(angle, at, spin, door) {
  const m = rampMarks(door), d = wrap(spin * (angle - at) / TAU), out = [];
  for (let k = Math.ceil(-m.jc - d - 1e-9); m.jc + d + k <= m.end; k++) if (m.jc + d + k >= 0) out.push(m.jc + d + k);
  return out;
}
// the angle (radians) the ramp is at u turns from its foot
export const rampAngle = (u, at, spin, door) => at + spin * (u - rampMarks(door).jc) * TAU;
// the point on the middle of the ramp u turns from its foot: { x, z } (cells), y in levels
export function rampPoint(u, at, spin, door) {
  const a = rampAngle(u, at, spin, door), r = (TOWER.core + TOWER.ring) / 2;
  return { x: TOWER.mid + Math.cos(a) * r, z: TOWER.mid + Math.sin(a) * r, y: rampHeight(u, door) };
}

// --- the lava ------------------------------------------------------------------------------
// His `tide` (game/tide.js): the share k of the way from the lava's rest level to just under the
// top; more than 1 over the top, less than 0 drained (map.tide: rest and high, core/squarlo.js
// tideLevel)
export const lavaShare = level => (level - TOWER.lava.rest) / (TOWER.lava.high - TOWER.lava.rest);
export const LAVA = Object.freeze({ rest: 0, high: 1, flood: lavaShare(TOWER.lava.flood), gone: lavaShare(TOWER.lava.gone) });
// His lava: { k, from, to, t, time }: from `from` to `to` over `time` s. One step of dt.
export const newLava = () => ({ k: 0, from: 0, to: 0, t: 0, time: 0 });
export function moveLava(w, to, time) { Object.assign(w, { from: w.k, to, t: 0, time }); }
export function stepLava(w, dt) {
  w.t += dt;
  w.k = w.time > 0 ? w.from + (w.to - w.from) * Math.min(1, w.t / w.time) : w.to;
  return w.k;
}

// --- the platforms -------------------------------------------------------------------------
// The slots: a ring of 2 x 2 cells round the tower's block (the caldera's 12 x 12 cells cut into
// 6 x 6 slots; the middle 4 x 4 is the tower's). slot -> { i, j (slot grid), x, z (its first cell) }
export const SLOTS = (() => {
  const out = [];
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) if (i === 0 || j === 0 || i === 5 || j === 5)
    out.push({ i, j, x: TOWER.pit[0] + i * PLATFORMS.size, z: TOWER.pit[0] + j * PLATFORMS.size });
  return out;
})();
// the slots next to each (along the grid)
export const SLOT_NEXT = SLOTS.map(a => SLOTS.flatMap((b, k) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1 ? [k] : []));

// One step of the puzzle: up to `moves` platforms slide into an empty slot next to theirs (not
// back where they just came from), and the platforms touching the top of the tower stay at least
// `near`. occ: slot -> platform (or -1); last: platform -> the slot it left on its last slide;
// touch: the slots touching the top; R: random numbers. -> [{ p, from, to }]
// (when no platform can slide but back where it came from, one may: the puzzle never stops)
export function puzzleMoves(occ, last, touch, R, back = false) {
  const P = PLATFORMS, cand = [];
  for (let a = 0; a < SLOTS.length; a++) if (occ[a] >= 0) for (const b of SLOT_NEXT[a]) if (occ[b] < 0 && (back || last[occ[a]] !== b)) cand.push([a, b]);
  const moves = [], used = new Set();
  let near = touch.filter(s => occ[s] >= 0).length;
  while (cand.length && moves.length < P.moves) {
    const [a, b] = cand.splice(Math.floor(R() * cand.length), 1)[0];
    if (used.has(a) || used.has(b)) continue;
    const change = (touch.includes(b) ? 1 : 0) - (touch.includes(a) ? 1 : 0);
    if (near + change < P.near) continue;
    near += change; used.add(a); used.add(b);
    moves.push({ p: occ[a], from: a, to: b });
  }
  return moves.length || back ? moves : puzzleMoves(occ, last, touch, R, true);
}
// the platforms' first slots (count of them, at least `near` touching the top)
export function puzzleStart(touch, R) {
  const order = SLOTS.map((_, k) => [k, R()]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const near = order.filter(k => touch.includes(k)).slice(0, PLATFORMS.near), rest = order.filter(k => !near.includes(k));
  return [...near, ...rest].slice(0, PLATFORMS.count).sort((a, b) => a - b);
}
const ease = u => u * u * (3 - 2 * u);
// The puzzle at time t (s): { occ, moves (this step's), u (how far they are) }, replayed from the
// start (`movers`: the map's, cubegen/towerarena.js) and cached in `cache` (an object kept by the
// caller) for the next call. Every game that knows t sees the same.
export function puzzleAt(movers, t, cache) {
  const P = PLATFORMS, n = Math.max(0, Math.floor(t / P.every));
  if (!cache.occ || cache.n > n || cache.movers !== movers) {
    cache.movers = movers; cache.n = 0;
    cache.occ = new Int8Array(SLOTS.length).fill(-1);
    movers.start.forEach((s, p) => { cache.occ[s] = p; });
    cache.last = new Array(movers.start.length).fill(-1);
    cache.moves = null;
  }
  const stepMoves = k => puzzleMoves(cache.occ, cache.last, movers.touch, mulberry32(movers.seed ^ Math.imul(k + 1, 0x9e3779b1)));
  if (!cache.moves) cache.moves = stepMoves(cache.n);
  while (cache.n < n) {
    for (const m of cache.moves) { cache.occ[m.from] = -1; cache.occ[m.to] = m.p; cache.last[m.p] = m.from; }
    cache.n++;
    cache.moves = stepMoves(cache.n);
  }
  return { occ: cache.occ, moves: cache.moves, u: ease(Math.min(1, Math.max(0, (t - n * P.every) / P.move))) };
}
// Where each platform is at time t: [{ p, x, z }] (its first corner, cells)
export function platformsAt(movers, t, cache) {
  const { occ, moves, u } = puzzleAt(movers, t, cache), out = [];
  for (let s = 0; s < SLOTS.length; s++) if (occ[s] >= 0) {
    const m = moves.find(m => m.from === s), a = SLOTS[s], b = m ? SLOTS[m.to] : a;
    out.push({ p: occ[s], x: a.x + (b.x - a.x) * (m ? u : 0), z: a.z + (b.z - a.z) * (m ? u : 0) });
  }
  return out.sort((a, b) => a.p - b.p);
}
