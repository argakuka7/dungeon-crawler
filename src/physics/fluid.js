// Fluid contact uses the exposed landing surface, not just the column's fluid.
// Every fluid is fatal on entry: water drowns, lava burns, acid dissolves.
// A trial's rising fluid (core/trials.js, game/trials.js) stands over the whole cube at one
// level: under it everything is in it, any floor or structure. (cells: over those cells only, the
// sinking stones' pit)
import { LH } from '../core/constants.js';

let trial = null;   // { y (its surface), fluid, cells?: Set } or null
const over = gr => !!trial && (!trial.cells || trial.cells.has(gr.i));
export const setTrialFluid = f => { trial = f; };
export const trialFluid = () => trial;

// the fluid the body is submerged in (0 when dry or above the surface)
export function inFluid(gr, y) {
  const f = gr.s;
  if (f && !f.kind && f.fluid && y < f.surf * LH) return f.fluid;
  return over(gr) && y < trial.y ? trial.fluid : 0;
}

// the surface of the fluid at the ground gr (for the splash, the body sinking)
export const fluidSurface = gr => Math.max(gr.s && !gr.s.kind && gr.s.fluid ? gr.s.surf * LH : -Infinity, over(gr) ? trial.y : -Infinity);

// is the ground at height h under the trial's fluid? (walking stops at its edge)
export const underTrialFluid = (h, i = -1) => !!trial && (!trial.cells || trial.cells.has(i)) && h < trial.y - 0.02;
