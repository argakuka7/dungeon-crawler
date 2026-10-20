// Lock-on in the close view (docs/camera.md, game/lockon.js): which enemy the right mouse
// button locks on to, which one a flick of the mouse moves the lock to, and the camera yaw that
// keeps the locked one in view past the hero. Pure numbers; enemies are anything with x and z.
// Yaws as everywhere: 0 looks along +z, a direction (dx, dz) is atan2(dx, dz); seen along a yaw,
// what is to the right has a smaller angle.

export const LOCK_RANGE = 14;   // units: farther enemies are not locked on to
export const LOCK_DROP = 20;    // units: a locked enemy farther away than this is let go
export const LOCK_CONE = 1.0;   // rad either side of where the view looks: enemies outside are not picked
export const LOCK_BLIND = 1.5;  // s a locked enemy may be out of sight before it is let go
export const LOCK_TURN = 10;    // 1/s: how quickly the camera swings round to keep it in view
export const FLICK_PX = 90;     // px of sideways mouse movement (quickly) that move the lock on

export const wrapAngle = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
// the angle of (x, z) seen from `from` looking along `yaw` (0: straight ahead, < 0: right)
const angleOf = (from, yaw, e) => wrapAngle(Math.atan2(e.x - from.x, e.z - from.z) - yaw);
const distance = (from, e) => Math.hypot(e.x - from.x, e.z - from.z);

// the yaw the close camera stands at (seen from the hero at (px, pz)) to look past it at (tx, tz)
export const lockYaw = (px, pz, tx, tz) => Math.atan2(px - tx, pz - tz);

// the enemy of `list` to lock on to from `from` looking along `yaw`: within LOCK_RANGE and the
// cone, the one nearest the middle of the view (how far away counts a little); null: none
export function pickLock(from, yaw, list) {
  let best = null, bestScore = Infinity;
  for (const e of list) {
    const d = distance(from, e);
    if (d > LOCK_RANGE) continue;
    const off = d < 0.3 ? 0 : Math.abs(angleOf(from, yaw, e));
    if (off > LOCK_CONE) continue;
    const score = off + 0.5 * d / LOCK_RANGE;
    if (score < bestScore) { best = e; bestScore = score; }
  }
  return best;
}

// a flick to the right (side 1) or the left (-1): the enemy of `list` next to `current` on that
// side, seen from `from`, within LOCK_RANGE and a quarter turn; null: there is none
export function nextLock(from, current, list, side) {
  const yaw = Math.atan2(current.x - from.x, current.z - from.z);
  let best = null, bestOff = Infinity;
  for (const e of list) {
    if (e === current || distance(from, e) > LOCK_RANGE) continue;
    const a = angleOf(from, yaw, e), off = -a * side;   // > 0: on the asked side
    if (off > 1e-3 && off < Math.PI / 2 && off < bestOff) { best = e; bestOff = off; }
  }
  return best;
}
