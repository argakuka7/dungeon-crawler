// The render resolution follows the frame rate (core/resolution.js): main.js hands over when each
// frame began, after it rendered. ?res=<pixel ratio> pins it (1: CSS pixels), e.g. to compare.
import { renderer } from './scene.js';
import { resolutionController } from '../core/resolution.js';

const pinned = Number(new URLSearchParams(location.search).get('res'));
const control = pinned > 0 ? null : resolutionController(Math.min(devicePixelRatio, 2));
let last = 0;

function apply(ratio) {
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
}
if (pinned > 0) apply(pinned);

// start: performance.now() when the frame began (it has rendered by now)
export function tickResolution(start) {
  const interval = last ? start - last : 0;
  last = start;
  const ratio = control?.tick(interval, performance.now() - start);
  if (ratio) apply(ratio);
}
