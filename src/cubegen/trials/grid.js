// The puzzles laid out on a grid you walk onto (docs/trials.md): `mirror` (turn mirrors till the
// beam hits the receiver), `braziers` (lights out), `runes` (press the stones in order) and
// `crates` (push crates onto plates, in a rim). A deck (cubegen/trials/deck.js), its parts on the
// field's cells; made with its solution (cubegen/trials/solve.js). In a room of its own, or on a
// sunken room's platform (a 3 x 3 field).
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { placeDeck, openGap, RIM } from './deck.js';
import { runeOrder } from '../../core/trials.js';

// the rune stones: round the edge of a size x size field, evenly spaced
function makeRunes(id, depth, size) {
  const { glyphs, order } = runeOrder(id, depth), ring = [];
  for (let x = 0; x < size; x++) ring.push([x, 0]);
  for (let z = 1; z < size; z++) ring.push([size - 1, z]);
  for (let x = size - 2; x >= 0; x--) ring.push([x, size - 1]);
  for (let z = size - 2; z > 0; z--) ring.push([0, z]);
  const stones = glyphs.map((g, i) => ring[Math.round(i * ring.length / glyphs.length)]);
  return { field: { glyphs, order, stones } };
}
import { makeMirror, makeBraziers, makeCrates } from './solve.js';

// a field's size and how hard it is: in a room of its own by depth, on a platform small
export function gridSize(kind, depth, small) {
  if (small) return { mirror: { size: 3, band: [2, 3], turns: 2 }, braziers: { size: 3, band: [3, 4] },
    crates: { size: 4, band: [3, 8], crates: 2 } }[kind];
  const deep = depth >= 10;
  return { mirror: { size: deep ? 7 : 6, band: deep ? [4, 6] : [3, 4], turns: deep ? 5 : 3 },
    braziers: { size: 5, band: deep ? [4, 6] : [3, 4] },
    crates: { size: deep ? 7 : 6, band: deep ? [8, 16] : [4, 10], crates: deep ? 3 : 2 }, runes: { size: 5 } }[kind];
}
// the kinds walled in by a rim, their one way in a gap in it (the crates' rubble keeps you to pushing)
const WALLED = new Set(['crates']);

// the cell beside field cell (x, z) on side `side`, as world coordinates of its middle
const beside = (deck, x, z, side) => [deck.x0 + x + [1, -1, 0, 0][side] + 0.5, deck.z0 + z + [0, 0, 1, -1][side] + 0.5];

// a grid puzzle: { size, band, turns?, towards, within } -> { kind, deck, made } or null
export function buildGrid(ctx, kind, { size, band, turns, crates, towards, within = null, entrySide = null }) {
  const deck = placeDeck(ctx, size, size, towards, within, WALLED.has(kind));
  if (!deck) return null;
  const side = entrySide ?? deck.side(towards);
  const made = kind === 'mirror' ? makeMirror(ctx.R, size, size, band, turns ?? 3)
    : kind === 'braziers' ? makeBraziers(ctx.R, size, band, 200, size < 5 ? ['ring'] : null)
      : kind === 'crates' ? makeCrates(ctx.R, size, size, band, crates ?? 2, side)
        : kind === 'runes' ? makeRunes(ctx.spec.trial.id, ctx.spec.depth, size) : null;
  if (!made) return null;
  // a mirror field's rocks: stone columns the beam (and anyone) stops at
  if (kind === 'mirror') for (const [x, z] of made.field.blockers) ctx.lvl0[deck.cell(x, z)] = deck.level + RIM;
  if (!WALLED.has(kind)) return { kind, deck, made, towards };
  // the crates' rubble, up out of reach; the way in a gap in the rim (and nothing built across the
  // ground in front of it)
  const F = made.field;
  for (const c of F.walls) ctx.lvl0[deck.cell(c % F.w, Math.floor(c / F.w))] = deck.level + RIM;
  const gap = openGap(ctx, deck, F.entry.x, F.entry.z, F.entry.side), out = gap + [1, -1, 0, 0][F.entry.side] + [0, 0, N, -N][F.entry.side];
  ctx.noBuild.add(out);
  return { kind, deck, made, entryGap: gap, approach: out };
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
  if (kind === 'runes') {   // the stones round the field's edge, evenly; the order from the trial's id
    const F = made.field;
    F.stones.forEach(([x, z], i) => { const [px, pz2] = at(x, z); parts.push({ id: `${id}:r${i}`, type: 'runestone', x: px, y, z: pz2, i, glyph: F.glyphs[i] }); });
    start[`${id}:n`] = 0;
    return { parts, start, field: F, check: { presses: F.order.length } };
  }
  if (WALLED.has(kind)) {
    const F = made.field, cellAt = c => at(c % F.w, Math.floor(c / F.w));
    F.plates.forEach((c, i) => { const [px, pz2] = cellAt(c); parts.push({ id: `${id}:plate${i}`, type: 'plate', x: px, y, z: pz2, i, cell: c }); });
    made.start.forEach((c, i) => { const [px, pz2] = cellAt(c), p = { id: `${id}:c${i}`, type: 'crate', x: px, y, z: pz2, i }; parts.push(p); start[p.id] = c; });
    // the reset lever: in front of the gap, a little to the side
    const g = pz.approach, side = F.entry.side, along = side < 2 ? [0, 0.32] : [0.32, 0];
    parts.push({ id: `${id}:reset`, type: 'reset', x: g % N + 0.5 + along[0], y, z: Math.floor(g / N) + 0.5 + along[1], yaw: [Math.PI / 2, -Math.PI / 2, 0, Math.PI][side] });
    return { parts, start, field: F, entryGap: pz.entryGap, check: { pushes: made.solution.pushes, solution: made.solution.way } };
  }
  return null;
}

// a cell of the field the route goes to (not a mirror field's rock)
export function gridGoal(pz) {
  if (WALLED.has(pz.kind)) return pz.deck.cell(pz.made.field.plates[0] % pz.deck.w, Math.floor(pz.made.field.plates[0] / pz.deck.w));
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
