// Beams (the Spicy's laser, the Wolk's lightning) as pure rules; game/beams.js runs them against
// the live level and the player, render/beams.js draws them.
//
// A beam shines from the muzzle (model space: x, up, forward) of enemy e towards an aim point.
// The aim starts on the target and follows it at spec.track cells/s, so a player who keeps
// moving across the beam gets out of it. The beam runs on through the aim point until the
// level or the target's body stops it, or for spec.range. After spec.time it bursts: a target within spec.radius
// of the beam (body radius included) is hit.
// A bolt (spec.aim 'feet') aims at the target's feet and runs no further than just past the aim:
// it strikes the floor there. With spec.lock its aim holds still for the last `lock` s.

// where the muzzle of enemy e is in the world
export function muzzleAt(e, muzzle) {
  const [mx, my, mz] = muzzle, s = Math.sin(e.yaw), c = Math.cos(e.yaw);
  return { x: e.x + mx * c + mz * s, y: e.y + my, z: e.z - mx * s + mz * c };
}
// a beam from enemy e, aimed at target ({ x, y, z }); its end is where it would run out
export function startBeam(e, spec, target) {
  const o = muzzleAt(e, spec.muzzle), b = { kind: spec.kind, spec, t: 0, ...o, ax: target.x, ay: target.y, az: target.z };
  return runTo(b, spec.range);
}
// the aim moves towards target at spec.track cells/s
export function aimBeam(b, target, dt) {
  const dx = target.x - b.ax, dy = target.y - b.ay, dz = target.z - b.az, d = Math.hypot(dx, dy, dz), step = b.spec.track * dt;
  if (d <= step) { b.ax = target.x; b.ay = target.y; b.az = target.z; return; }
  b.ax += dx / d * step; b.ay += dy / d * step; b.az += dz / d * step;
}
// does the aim still follow the target?
export const aiming = b => !b.spec.lock || b.t < b.spec.time - b.spec.lock;
// the point on body p ({ x, y, z, h }) a beam of `spec` aims at: the chest, or a bolt's the feet
export const aimPoint = (p, spec) => spec.aim === 'feet' ? { x: p.x, y: p.y + 0.05, z: p.z } : { x: p.x, y: p.y + p.h * 0.55, z: p.z };
// how far the beam may run: its range, a bolt's only just past its aim
function reachOf(b) {
  if (b.spec.aim !== 'feet') return b.spec.range;
  return Math.min(b.spec.range, Math.hypot(b.ax - b.x, b.ay - b.y, b.az - b.z) + 0.3);
}
// the beam's direction (unit) from its origin through the aim
export function beamDir(b) {
  const dx = b.ax - b.x, dy = b.ay - b.y, dz = b.az - b.z, l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}
function runTo(b, length) {
  const [ux, uy, uz] = beamDir(b);
  b.ex = b.x + ux * length; b.ey = b.y + uy * length; b.ez = b.z + uz * length; b.length = length;
  return b;
}
// Where the beam ends: the first point (in `step`s) along it that solid(x, y, z) says is inside
// the level, or inside the body p (a vertical capsule; null for none), else its range.
export function castBeam(b, solid, p = null, step = 0.05) {
  const [ux, uy, uz] = beamDir(b), range = reachOf(b), n = Math.ceil(range / step);
  for (let i = 1; i <= n; i++) {
    const l = Math.min(range, i * step), x = b.x + ux * l, y = b.y + uy * l, z = b.z + uz * l;
    if (p && inside(p, x, y, z)) return runTo(b, l);
    if (solid(x, y, z)) return runTo(b, Math.max(0, l - step / 2));
  }
  return runTo(b, range);
}
const inside = (p, x, y, z) => {
  const cy = Math.max(p.y + p.r, Math.min(p.y + p.h - p.r, y));
  return Math.hypot(x - p.x, y - cy, z - p.z) < p.r;
};
// the closest the beam (origin to end) comes to the body p (a vertical capsule of radius r,
// height h): sampled along the body's axis
export function beamDistance(b, p) {
  const vx = b.ex - b.x, vy = b.ey - b.y, vz = b.ez - b.z, l2 = vx * vx + vy * vy + vz * vz || 1;
  let best = Infinity;
  for (let i = 0; i <= 6; i++) {
    const px = p.x, py = p.y + p.r + (p.h - 2 * p.r) * i / 6, pz = p.z;
    const k = Math.max(0, Math.min(1, ((px - b.x) * vx + (py - b.y) * vy + (pz - b.z) * vz) / l2));
    best = Math.min(best, Math.hypot(px - b.x - vx * k, py - b.y - vy * k, pz - b.z - vz * k));
  }
  return best - p.r;
}
export const beamHits = (b, p) => beamDistance(b, p) < b.spec.radius;
