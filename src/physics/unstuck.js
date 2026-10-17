// Getting the body out of the world's solid matter. The controller (physics/move.js,
// canmove.js) never walks it into a wall, but a knockback, a gust, a ragdoll coming to rest or
// a smoothed corner can still leave it wedged: something solid through its middle, or no way
// to move even a little in any direction. After WEDGED_TIME of that it is put on the nearest
// spot where it stands freely, preferring floors that still lead out of the cube (map.safe);
// failing that, back at the last safe spot. No countdown and no message: it should never
// happen, so when it does it should just go away.
import { STEP } from '../core/constants.js';
import { player, state, setStatus } from '../game/state.js';
import { groundAt, blockedAt, solidTop } from './collide.js';
import { canMove } from './canmove.js';
import { supportedPoint, respawnPoint } from './respawn.js';

export const WEDGED_TIME = 0.3;   // s wedged before the body is moved
const CORE = 0.45;     // the body's middle: a low ceiling over the head is no wall through it
const PROBE = 0.06;    // how far it must be able to move, one way at least
const REACH = 2, RING = 0.25;   // how far around to look for a free spot, in rings this far apart
const UP = 1.5;        // how far above (onto what it is stuck in) or below a free spot may be
let wedged = 0;

// is the body wedged where it is now? (its middle in something solid, or boxed in all round)
export function embedded() {
  const p = player;
  if (blockedAt(p.x, p.z, p.y, STEP, false, CORE)) return true;
  return [[PROBE, 0, 'x', 1], [-PROBE, 0, 'x', -1], [0, PROBE, 'z', 1], [0, -PROBE, 'z', -1]]
    .every(([dx, dz, axis, sign]) => !canMove(p.x + dx, p.z + dz, axis, sign));
}

// the body standing at (x, y, z) instead, for fn (canMove reads the player)
function standingAt(x, y, z, fn) {
  const p = player, keep = { x: p.x, y: p.y, z: p.z, support: p.support, grounded: p.grounded, swimming: p.swimming };
  Object.assign(p, { x, y, z, support: groundAt(x, z, y + 0.05, 0).s, grounded: true, swimming: false });
  try { return fn(); } finally { Object.assign(p, keep); }
}

// a spot the body stands freely on at the top of whatever is at or a step below y there
// (null: none); safe: it leads out of the cube (structures count as such)
function freeAt(x, y, z) {
  const s = supportedPoint(x, y, z);
  if (!s || Math.abs(s.y - player.y) > UP || standingAt(s.x, s.y, s.z, embedded)) return null;
  const f = groundAt(s.x, s.z, s.y + 0.05, 0).s, m = state.map;
  return { ...s, safe: !f || !!f.kind || !m.safe || !!m.safe[f.id] };
}

// the nearest free spot around the body: on its level (or a step up), or on top of what it
// is stuck in; one that leads out first (unsafe: the nearest one that does not, if any)
function nearbySpot() {
  const p = player;
  let best = null, bd = Infinity, unsafe = null, ud = Infinity;
  for (let r = RING; r <= REACH + 1e-6 && !best; r += RING) {
    const n = Math.max(8, Math.round(2 * Math.PI * r / RING));
    for (let k = 0; k < n; k++) {
      const a = k / n * 2 * Math.PI, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      const over = solidTop(x, z, p.y + CORE);
      for (const y of over ? [p.y + STEP, over.h] : [p.y + STEP]) {
        const s = freeAt(x, y, z);
        if (!s) continue;
        const d = r * r + (1.5 * (s.y - p.y)) ** 2;
        if (s.safe && d < bd) { best = s; bd = d; }
        if (!s.safe && d < ud) { unsafe = s; ud = d; }
      }
    }
  }
  return { best, unsafe };
}

// where a wedged body goes
export function freeSpot() {
  const { best, unsafe } = nearbySpot();
  if (best) return best;
  const back = respawnPoint(player.safe);
  if (!standingAt(back.x, back.y, back.z, embedded)) return back;
  return unsafe || respawnPoint({ x: player.x, y: player.y, z: player.z });
}

// every simulation step the player moves on its own (not on a ladder, in a ragdoll or
// between cubes): true when it was moved out of something this step
export function unstick(dt) {
  const falling = !player.grounded && Math.abs(player.vy) > 1;   // rising or falling: not stuck (yet)
  if (falling || state.fallFrom || player.hp <= 0 || !embedded()) { wedged = 0; return false; }
  if ((wedged += dt) < WEDGED_TIME) return false;
  wedged = 0;
  const s = freeSpot(), g = groundAt(s.x, s.z, s.y + 0.05, 0);
  Object.assign(player, { x: s.x, y: s.y, z: s.z, visY: s.y, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false,
    support: g.s, airTime: 0 });
  setStatus('Unstuck');
  return true;
}
