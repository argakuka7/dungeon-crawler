// The timed gate (docs/trials.md, `timedgate`): the crumbling floor's room (cubegen/trials/collapse.js)
// with a floor that holds: a winding causeway over a basin of the depth's fluid, walled in, with
// one-cell gaps to jump and a dead end or two, from the entry's apron to the exit's. The lever stands
// in the middle of the entry's apron; the gate is the exit's seal. Pulled, the run along the
// causeway to the exit has to beat the gate (cubegen/trials/index.js finishTimed): learn the way
// first, then run it, and a slip is a drowning.
import { shapeCollapse, collapseRoute } from './collapse.js';

export function shapeTimed(ctx) {
  shapeCollapse(ctx);
  ctx.trialBuild.kind = 'timedgate';
  ctx.stats.mode = `${ctx.spec.kind} / timed gate`;
}

// nothing built: the causeway (and its gaps, jumped) is the only way
export const timedRoute = collapseRoute;

// the goal of the way in: the lever's floor, in the middle of the entry's apron
export const timedGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.entryCentre, 0);
