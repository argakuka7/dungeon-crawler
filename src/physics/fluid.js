// Fluid contact uses the exposed landing surface, not just the column's fluid.
// Every fluid is fatal on entry: water drowns, lava burns, acid dissolves.
// A trial's rising fluid (core/trials.js, game/trials.js) stands over the whole cube at one
// level: under it everything is in it, any floor or structure.
import { LH } from '../core/constants.js';

let trial = null;   // { y (its surface), fluid } or null
export const setTrialFluid = f => { trial = f; };
export const trialFluid = () => trial;

// the fluid the body is submerged in (0 when dry or above the surface)
export function inFluid(gr, y) {
  const f = gr.s;
  if (f && !f.kind && f.fluid && y < f.surf * LH) return f.fluid;
  return !!trial && y < trial.y ? trial.fluid : 0;
}

// the surface of the fluid at the ground gr (for the splash, the body sinking)
export const fluidSurface = gr => Math.max(gr.s && !gr.s.kind && gr.s.fluid ? gr.s.surf * LH : -Infinity, trial ? trial.y : -Infinity);

// is the ground at height h under the trial's fluid? (walking stops at its edge)
export const underTrialFluid = h => !!trial && h < trial.y - 0.02;
