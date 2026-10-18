// The ice slide (docs/trials.md, `slide`): a deck (cubegen/trials/deck.js) whose field is ice with
// rocks on it. You come onto the ice through the gap in the rim on the side facing the way in; the
// goal plate lies at the rim on another side, behind its closed gate. On the ice you slide
// (core/trials.js slideStop, game/trials.js); made with its solution (cubegen/trials/solve.js).
// In a room of its own, or on a sunken room's platform (smaller, cubegen/trials/sunken.js).
import { N } from '../../core/constants.js';
import { placeDeck, openGap, deckRoute, RIM } from './deck.js';
import { makeSlide } from './solve.js';

// a slide puzzle: { size, band (fewest slides: [lo, hi]), decoys, towards, within } -> the built
// puzzle { kind, deck, field, solution, entryGap, goalGap, goalCell } or null
export function buildSlide(ctx, { size, band, decoys = 3, towards, within = null, entrySide = null, goalSides = null }) {
  const deck = placeDeck(ctx, size, size, towards, within);
  if (!deck) return null;
  const side = entrySide ?? deck.side(towards);
  const made = makeSlide(ctx.R, size, size, band, side, (goalSides ?? [0, 1, 2, 3]).filter(s => s !== side), 600, decoys);
  if (!made) return null;
  const F = made.field;
  F.rock.forEach((r, i) => { if (r) ctx.lvl0[deck.cell(i % size, (i / size) | 0)] = deck.level + RIM; });
  const entryGap = openGap(ctx, deck, F.entry.x, F.entry.z, F.entry.side), goalGap = openGap(ctx, deck, F.goal.x, F.goal.z, F.goal.side);
  // nothing built across the ground in front of the gaps either (a stair's rail would shut them)
  for (const [gap, side] of [[entryGap, F.entry.side], [goalGap, F.goal.side]]) ctx.noBuild.add(gap + [1, -1, 0, 0][side] + [0, 0, N, -N][side]);
  return { kind: 'slide', deck, field: F, solution: made.solution, entryGap, goalGap, goalCell: deck.cell(F.goal.x, F.goal.z) };
}

// the slide's own room: one puzzle, 6x6 (7x7 from depth 10), facing the way in
export function shapeSlide(ctx) {
  const { spec } = ctx, depth = spec.depth;
  ctx.trialBuild = { kind: 'slide', failed: true, keep: [] };
  ctx.stats.mode = spec.kind + ' / ice slide';
  const entry = spec.portals.find(p => p.dir === spec.trial.entry);
  const towards = entry ? [[N - 1, entry.pos], [0, entry.pos], [entry.pos, N - 1], [entry.pos, 0]][entry.dir] : [N / 2, N / 2];
  const puzzle = buildSlide(ctx, { size: depth >= 10 ? 7 : 6, band: depth >= 10 ? [6, 9] : [4, 6], towards });
  if (!puzzle) return;
  Object.assign(ctx.trialBuild, { failed: false, puzzles: [puzzle], keep: [...ctx.trialKeep] });
}

export const slideRoute = deckRoute;
// the goal: the plate of the room's (first) puzzle
export const puzzleGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.puzzles[0].goalCell, 0);
export { RIM };
