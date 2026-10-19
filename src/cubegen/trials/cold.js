// The cold snap (docs/trials.md, `cold`): the great fire (a bonfire pit) near the exit, braziers
// along the way to it (cubegen/trials/index.js finishCold spaces them by the time a slow player
// takes between their warm circles), one or two more off the way.
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

export function shapeCold(ctx) {
  const { spec, lvl0, void0 } = ctx;
  ctx.trialBuild = { kind: 'cold', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / cold snap`;
  const exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!exit) return;
  // the fire's hollow: 3 x 3, flat, four cells in from the exit's face
  const c = edgeCell(exit.dir, Math.max(3, Math.min(N - 4, exit.pos)), 4), x = c % N, z = (c / N) | 0, hollow = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) hollow.push(idx(x + dx, z + dz));
  const level = Math.max(2, Math.round(hollow.reduce((s, h) => s + lvl0[h], 0) / hollow.length));
  for (const h of hollow) { void0[h] = 0; lvl0[h] = level; ctx.keep.add(h); }
  ctx.trialKeep = new Set(hollow);
  Object.assign(ctx.trialBuild, { failed: false, fire: { c, level }, keep: hollow });
}

export const coldGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.fire.c, 0);
