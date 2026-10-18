// The ice slide's room (docs/trials.md, `slide`): a deck (cubegen/trials/deck.js) whose field is
// ice with rocks on it. You come onto the ice through the gap in the rim on the side facing the
// way in; the goal plate lies at the rim on another side, behind its closed gate. On the ice you
// slide (core/trials.js slideStop, game/trials.js); made with its solution (cubegen/trials/solve.js).
import { N } from '../../core/constants.js';
import { placeDeck, openGap, deckRoute, RIM } from './deck.js';
import { makeSlide } from './solve.js';

export function shapeSlide(ctx) {
  const { spec, R } = ctx, depth = spec.depth, size = depth >= 10 ? 7 : 6;
  ctx.trialBuild = { kind: 'slide', failed: true, keep: [] };
  ctx.stats.mode = spec.kind + ' / ice slide';
  const entry = spec.portals.find(p => p.dir === spec.trial.entry);
  const towards = entry ? [[N - 1, entry.pos], [0, entry.pos], [entry.pos, N - 1], [entry.pos, 0]][entry.dir] : [N / 2, N / 2];
  const deck = placeDeck(ctx, size, size, towards);
  if (!deck) return;
  const side = deck.side(towards), made = makeSlide(R, size, size, depth, side, [0, 1, 2, 3].filter(s => s !== side));
  if (!made) return;
  const F = made.field;
  F.rock.forEach((r, i) => { if (r) ctx.lvl0[deck.cell(i % size, (i / size) | 0)] = deck.level + RIM; });
  const entryGap = openGap(ctx, deck, F.entry.x, F.entry.z, F.entry.side), goalGap = openGap(ctx, deck, F.goal.x, F.goal.z, F.goal.side);
  Object.assign(ctx.trialBuild, { failed: false, deck, field: F, solution: made.solution, entryGap, goalGap,
    goalCell: deck.cell(F.goal.x, F.goal.z), keep: [...ctx.trialKeep] });
}

export const slideRoute = deckRoute;
export const slideGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.goalCell, 0);
