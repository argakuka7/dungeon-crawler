// Gusts (the Wolla's storm) as pure rules; game/gusts.js runs them against the live level and
// the bodies, physics/move.js carries out the push.
//
// A gust blows from the mouth (spec.muzzle, model space: x, up, forward) of enemy e along its
// heading. A body (a vertical capsule: x, y, z, r, h) is in it while it is no more than
// spec.range ahead of the mouth, within spec.width + spec.spread × (how far ahead) either side
// of the gust's line (its radius included), and the mouth is level with it give or take
// RISE. One blown `down` from high up (Squarlo's water cannon) comes down onto the floor ahead:
// it catches a body from spec.near ahead on, anywhere under the mouth and no further below the
// enemy's feet than RISE.
import { muzzleAt } from './beams.js';

export const RISE = 0.6;   // cells above its head or below its feet the gust still catches a body
export function inGust(e, spec, p) {
  const o = muzzleAt(e, spec.muzzle), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  const dx = p.x - o.x, dz = p.z - o.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
  if (ahead < (spec.near ?? 0) - p.r || ahead > spec.range + p.r) return false;
  if (side > spec.width + spec.spread * Math.max(0, ahead) + p.r) return false;
  if (spec.down) return p.y < o.y && p.y > e.y - RISE;
  return o.y > p.y - RISE && o.y < p.y + p.h + RISE;
}
// which way it blows a body it caught (unit [x, z]): along the gust, turned a little outwards
export function gustDir(e, spec, p) {
  const o = muzzleAt(e, spec.muzzle), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  const dx = p.x - o.x, dz = p.z - o.z, l = Math.hypot(dx, dz) || 1;
  const x = fx * 0.7 + dx / l * 0.3, z = fz * 0.7 + dz / l * 0.3, n = Math.hypot(x, z) || 1;
  return [x / n, z / n];
}
// A push under way ({ vx, vz, t, time }: its velocity at the start, the time left and its
// length): how far it carries the body this step. It dies away linearly; t counts down.
export function pushStep(push, dt) {
  const step = Math.min(dt, Math.max(0, push.t)), k0 = push.t / push.time, k1 = (push.t - step) / push.time;
  push.t -= dt;
  const d = (k0 + k1) / 2 * step;   // the fading speed's share, integrated over the step
  return [push.vx * d, push.vz * d];
}
// how far a push carries a body in all, on open ground
export const pushDistance = push => push.speed * push.time / 2;
// how much of its own steering a body has left under a push (0: none at its start)
export const pushControl = push => 1 - 0.85 * Math.max(0, Math.min(1, push.t / push.time));
