// The touch controls' numbers (game/touch.js): a thumb stick's push as a direction and a
// strength, a screen direction on the floor, how far an aimed flask goes, and how far two
// fingers must pinch or twist for a step of zoom or a quarter turn of the view.
export const DEAD_ZONE = 0.18;            // share of the stick's radius that does nothing
export const WALK_BELOW = 0.5;            // pushed less than this (of the way past the dead zone): walk
export const PINCH_STEP = 1.25;           // the fingers this much further apart (or closer): one zoom step
export const TWIST_STEP = Math.PI * 35 / 180;   // the fingers turned this far: a quarter turn

// the thumb (dx, dy) px from the stick's middle (screen: y down), the stick r px wide:
// { x, y } the direction (y up, unit length) and m how far pushed past the dead zone (0-1)
export function stickVector(dx, dy, r, dead = DEAD_ZONE) {
  const d = Math.hypot(dx, dy);
  if (d <= dead * r || d === 0) return { x: 0, y: 0, m: 0 };
  return { x: dx / d, y: -dy / d, m: Math.min(1, (d - dead * r) / (r - dead * r)) };
}

// a direction on the screen (x right, y up) on the floor as the camera at yaw sees it: [dx, dz]
// (the movement keys turn the same way, game/input.js)
export function screenToWorld(x, y, yaw) {
  return [Math.cos(yaw) * x - Math.sin(yaw) * y, -Math.sin(yaw) * x - Math.cos(yaw) * y];
}

// how far an aimed throw goes: a nudge throws close by, the stick's edge as far as it can
export const aimReach = (m, range) => range * (0.15 + 0.85 * Math.min(1, Math.max(0, m)));

// two fingers ratio times as far apart as when last stepped: -1 zooms in, 1 out, 0 not yet
export const pinchStep = ratio => ratio >= PINCH_STEP ? -1 : ratio <= 1 / PINCH_STEP ? 1 : 0;
// the line between them turned by `angle` (screen, clockwise positive): 1, -1, or 0 not yet
export function twistStep(angle) {
  const a = Math.atan2(Math.sin(angle), Math.cos(angle));
  return a >= TWIST_STEP ? 1 : a <= -TWIST_STEP ? -1 : 0;
}
