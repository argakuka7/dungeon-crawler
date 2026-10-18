// The render resolution follows the frame rate (core/resolution.js): main.js hands over when each
// frame began, after it rendered. The anti-aliasing goes down first (render/msaa.js).
// ?res=<pixel ratio> pins both (1: CSS pixels, MSAA as set), e.g. to compare.
import { requestFit } from './scene.js';
import { msaaSteps, setMsaaDrop } from './msaa.js';
import { resolutionController } from '../core/resolution.js';

const pinned = Number(new URLSearchParams(location.search).get('res'));
const control = pinned > 0 ? null : resolutionController(Math.min(devicePixelRatio, 2));
let last = 0;

// the canvas takes the new ratio right before the next frame is drawn (scene.js fitView): resized
// now, after this frame was drawn, it would show empty for a frame
const apply = ratio => requestFit(ratio);
if (pinned > 0) apply(pinned);

// start: performance.now() when the frame began (it has rendered by now); fps: the frame rate
// cap (0: none), frames are not too slow for coming at the rate asked for
export function tickResolution(start, fps = 0) {
  const interval = last ? start - last : 0;
  last = start;
  if (!control) return;
  const ratio = control.tick(interval, performance.now() - start, fps ? 1000 / fps : 0, msaaSteps());
  if (ratio) apply(ratio);
  setMsaaDrop(control.drop);
}
