// The puzzles laid out on a grid you walk onto (docs/trials.md): `mirror` (turn mirrors till the
// beam hits the receiver), `braziers` (lights out) and `channels` (turn channel tiles till the water
// drives the wheel). A deck without a rim (cubegen/trials/deck.js), its parts on the field's cells;
// made with its solution (cubegen/trials/solve.js). In a room of its own, or on a sunken room's
// platform (a 3 x 3 field).
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { placeDeck, RIM } from './deck.js';
import { makeMirror, makeBraziers, makeChannels } from './solve.js';

// a field's size and how hard it is: in a room of its own by depth, on a platform small
export function gridSize(kind, depth, small) {
  if (small) return { mirror: { size: 3, band: [2, 3], turns: 2 }, braziers: { size: 3, band: [3, 4] }, channels: { size: 3, band: [3, 6] } }[kind];
  const deep = depth >= 10;
  return { mirror: { size: deep ? 7 : 6, band: deep ? [4, 6] : [3, 4], turns: deep ? 5 : 3 },
    braziers: { size: 5, band: deep ? [4, 6] : [3, 4] }, channels: { size: deep ? 6 : 5, band: deep ? [6, 12] : [4, 8] } }[kind];
}

// the cell beside field cell (x, z) on side `side`, as world coordinates of its middle
const beside = (deck, x, z, side) => [deck.x0 + x + [1, -1, 0, 0][side] + 0.5, deck.z0 + z + [0, 0, 1, -1][side] + 0.5];

// a grid puzzle: { size, band, turns?, towards, within } -> { kind, deck, made } or null
export function buildGrid(ctx, kind, { size, band, turns, towards, within = null }) {
  const deck = placeDeck(ctx, size, size, towards, within, false);
  if (!deck) return null;
  const made = kind === 'mirror' ? makeMirror(ctx.R, size, size, band, turns ?? 3)
    : kind === 'braziers' ? makeBraziers(ctx.R, size, band, 200, size < 5 ? ['ring'] : null)
      : makeChannels(ctx.R, size, size, band);
  if (!made) return null;
  // a mirror field's rocks: stone columns the beam (and anyone) stops at
  if (kind === 'mirror') for (const [x, z] of made.field.blockers) ctx.lvl0[deck.cell(x, z)] = deck.level + RIM;
  return { kind, deck, made };
}

// the puzzle's parts and start (part id -> its bit), its field as plain data
export function gridRecord(pz, id) {
  const { kind, deck, made } = pz, y = deck.level * 0.5, at = (x, z) => [deck.x0 + x + 0.5, deck.z0 + z + 0.5];
  const parts = [], start = {};
  if (kind === 'mirror') {
    const F = made.field;
    F.mirrors.forEach(([x, z], i) => { const [px, pz2] = at(x, z), p = { id: `${id}:m${i}`, type: 'mirror', x: px, y, z: pz2, i }; parts.push(p); start[p.id] = made.start[i]; });
    const [ex, ez] = beside(deck, F.emitter.x, F.emitter.z, F.emitter.dir ^ 1), [rx, rz] = beside(deck, F.receiver.x, F.receiver.z, F.receiver.side);
    parts.push({ id: `${id}:emitter`, type: 'emitter', x: ex, y, z: ez, dir: F.emitter.dir }, { id: `${id}:receiver`, type: 'receiver', x: rx, y, z: rz, side: F.receiver.side });
    return { parts, start, field: F, check: { flips: made.solution.flips, solution: made.solution.solution } };
  }
  if (kind === 'braziers') {
    made.at.forEach(([x, z], i) => { const [px, pz2] = at(x, z), p = { id: `${id}:b${i}`, type: 'brazier', x: px, y, z: pz2, i }; parts.push(p); start[p.id] = made.start[i]; });
    return { parts, start, field: { pattern: made.pattern, at: made.at, links: made.links }, check: { presses: made.solution.presses, solution: made.solution.which } };
  }
  const F = made.field;
  F.tiles.forEach((t, i) => { const [px, pz2] = at(t.x, t.z), p = { id: `${id}:t${i}`, type: 'tile', x: px, y, z: pz2, i, shape: t.shape }; parts.push(p); start[p.id] = made.start[i]; });
  const [sx, sz] = beside(deck, F.spout.x, F.spout.z, F.spout.side), [wx, wz] = beside(deck, F.wheel.x, F.wheel.z, F.wheel.side);
  parts.push({ id: `${id}:spout`, type: 'spout', x: sx, y, z: sz, side: F.spout.side }, { id: `${id}:wheel`, type: 'wheel', x: wx, y, z: wz, side: F.wheel.side });
  return { parts, start, field: F, check: { turns: made.solution.turns, solution: made.solution.turnsOf } };
}

// a cell of the field the route goes to (not a mirror field's rock)
export function gridGoal(pz) {
  const rocks = new Set((pz.made.field?.blockers || []).map(b => `${b}`));
  for (let z = 0; z < pz.deck.h; z++) for (let x = 0; x < pz.deck.w; x++) if (!rocks.has(`${x},${z}`)) return pz.deck.cell(x, z);
  return pz.deck.cell(0, 0);
}

// a grid puzzle's own room: one puzzle, facing the way in
export function shapeGrid(ctx) {
  const { spec } = ctx, kind = spec.trial.kind;
  ctx.trialBuild = { kind, failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / ${kind}`;
  const entry = spec.portals.find(p => p.dir === spec.trial.entry);
  const towards = entry ? [[N - 1, entry.pos], [0, entry.pos], [entry.pos, N - 1], [entry.pos, 0]][entry.dir] : [N / 2, N / 2];
  const pz = buildGrid(ctx, kind, { ...gridSize(kind, spec.depth, false), towards });
  if (!pz) return;
  pz.goalCell = gridGoal(pz);
  Object.assign(ctx.trialBuild, { failed: false, puzzles: [pz], keep: [...ctx.trialKeep] });
}
