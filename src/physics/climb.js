// Climbing ladders. A ladder stands in the lower floor's cell against the wall of the higher
// column (map.ladders). You get on by pushing into the wall at its foot, or by walking over the
// edge right above it; on the ladder, pushing towards the wall climbs, pulling away climbs down,
// jumping lets go. At the top you step onto the upper floor, at the foot back onto the ground.
import { DIRS, CHAR_R, CLIMB_SPEED } from '../core/constants.js';
import { groundAt } from './collide.js';
import { player, state } from '../game/state.js';

const SPEED = CLIMB_SPEED, REACH = 0.36;   // climbing speed; how far to the side of the ladder you can grab it

// wall point W (centre of the ladder on the wall), n = normal out of the wall (into the lower cell)
const frame = l => {
  const [dx, dz] = DIRS[l.d];
  return { wx: l.x + 0.5 + dx * 0.5, wz: l.z + 0.5 + dz * 0.5, nx: -dx, nz: -dz };
};

// try to get onto a ladder (input dx, dz)
function grab(dx, dz) {
  const p = player;
  if (!p.grounded || p.swimming || p.stun > 0) return null;
  for (const l of state.map.ladders || []) {
    const { wx, wz, nx, nz } = frame(l);
    const out = (p.x - wx) * nx + (p.z - wz) * nz, side = (p.x - wx) * -nz + (p.z - wz) * nx;
    if (Math.abs(side) > REACH) continue;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return null;
    const push = -(dx * nx + dz * nz) / len;   // direction of the input: towards the wall?
    if (push > 0.5 && out > 0 && out < CHAR_R + 0.14 && Math.abs(p.y - l.y0) < 0.35) return { l, side, y: p.y };
    if (push < -0.5 && out < 0 && out > -0.4 && Math.abs(p.y - l.y1) < 0.3) return { l, side, y: l.y1 - 0.25 };
  }
  return null;
}

export function climb(dt, dx, dz, jump) {
  const p = player;
  if (!p.climb) {
    const g = grab(dx, dz);
    if (!g) return false;
    p.climb = { l: g.l, side: Math.max(-0.15, Math.min(0.15, g.side)) };
    p.y = g.y;
  }
  const { l, side } = p.climb, { wx, wz, nx, nz } = frame(l);
  const up = -(dx * nx + dz * nz);
  p.climbV = Math.abs(up) > 0.3 ? Math.sign(up) * SPEED : 0;
  p.y += p.climbV * dt;
  // stay on the ladder line, facing the wall
  p.x = wx + nx * (CHAR_R + 0.04) - nz * side; p.z = wz + nz * (CHAR_R + 0.04) + nx * side;
  Object.assign(p, { vx: 0, vz: 0, vy: 0, grounded: true, airTime: 0 });
  if (jump) {   // let go, pushing off the wall
    Object.assign(p, { climb: null, vx: nx * 2.5, vz: nz * 2.5, vy: 2.5, grounded: false });
    return true;
  }
  if (p.y >= l.y1) {   // over the top: onto the upper floor
    p.x = wx - nx * 0.35 - nz * side; p.z = wz - nz * 0.35 + nx * side; p.y = l.y1;
    p.climb = null;
  } else if (p.y <= l.y0 && p.climbV < 0) {   // down at the foot
    p.y = l.y0; p.climb = null;
  }
  if (!p.climb) {   // stand on whatever is there (the floor may rise a little past its edge)
    const g = groundAt(p.x, p.z, p.y + 0.6, 0);
    if (isFinite(g.h)) { p.y = g.h; p.support = g.s; }
  }
  return true;
}
