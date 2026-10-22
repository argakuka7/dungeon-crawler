// Twisters (the Tornado's, core/enemies.js TORNADO) as pure rules; game/twisters.js runs them
// against the live level and the bodies, render/twisters.js draws them.
//
// A twister spins up over a hand of its enemy (spec.hands[i], model space as for a muzzle). Let
// go, it drops to the floor below the hand and runs out over it at spec.speed. The two of a pair
// curve in from either side (bowing out by spec.bend of the way) to cross on the line ahead of the
// enemy, `at` cells ahead (where its target stood as it let go), and run on the way they came in,
// spec.range in all. Each wobbles a little about its way, and so does the twister staying behind
// where a Tornado hopped off (spec.stay: it does not move, it spins there that long).
// One that touches a body (within spec.radius of its middle, its body's radius included, and from
// a little under its foot to spec.height over it) catches it (game/twisters.js): the body is lifted
// spec.lift cells and spun round for spec.spin s (twirlAt), then flung down.
import { muzzleAt } from './beams.js';

const WOBBLE = 0.07;   // cells either side of its way
// the floor point below hand i of enemy e, and the way from there to `at` cells ahead of it
export function launchTwister(e, spec, i, at, seed = 0) {
  const s = muzzleAt(e, spec.hands[i]), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  const tx = e.x + fx * at, tz = e.z + fz * at, dx = tx - s.x, dz = tz - s.z, l = Math.hypot(dx, dz) || 1;
  // (bowing out to the hand's side of the line ahead)
  const side = Math.sign((s.x - e.x) * fz - (s.z - e.z) * fx) || (i ? -1 : 1);
  const nx = dz / l * side, nz = -dx / l * side, b = spec.bend * l;
  const cx = (s.x + tx) / 2 + nx * b, cz = (s.z + tz) / 2 + nz * b;
  const tw = { x0: s.x, z0: s.z, cx, cz, tx, tz, len: 0, d: 0, t: 0, seed, x: s.x, z: s.z };
  let px = s.x, pz = s.z;
  for (let k = 1; k <= 16; k++) { const [x, z] = bezier(tw, k / 16); tw.len += Math.hypot(x - px, z - pz); px = x; pz = z; }
  return tw;
}
// a twister that stays where it is (a hop's): no way, it only wobbles
export const stayTwister = (x, z, seed = 0) => ({ x0: x, z0: z, cx: x, cz: z, tx: x, tz: z, len: 0, d: 0, t: 0, seed, x, z });
function bezier(tw, u) {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  return [a * tw.x0 + b * tw.cx + c * tw.tx, a * tw.z0 + b * tw.cz + c * tw.tz];
}
// where it is `d` cells along its way (on past the crossing, the way it came in), `t` s after it
// was let go: [x, z]
export function twisterAt(tw, d, t) {
  let x, z, ux, uz;
  if (tw.len > 0 && d < tw.len) {
    const u = d / tw.len;
    [x, z] = bezier(tw, u);
    ux = 2 * ((1 - u) * (tw.cx - tw.x0) + u * (tw.tx - tw.cx)); uz = 2 * ((1 - u) * (tw.cz - tw.z0) + u * (tw.tz - tw.cz));
  } else {
    ux = tw.tx - tw.cx; uz = tw.tz - tw.cz;
    const l = Math.hypot(ux, uz) || 1, past = Math.max(0, d - tw.len);
    x = tw.tx + ux / l * past; z = tw.tz + uz / l * past;
  }
  const l = Math.hypot(ux, uz), w = WOBBLE * Math.sin(t * 6.3 + tw.seed) + WOBBLE * 0.5 * Math.sin(t * 2.9 + 2 * tw.seed);
  return l > 1e-6 ? [x - uz / l * w, z + ux / l * w] : [x + w, z + WOBBLE * Math.cos(t * 5.1 + tw.seed)];
}
// on along its way by dt (a staying one only wobbles); returns false once it has run its range
export function stepTwister(tw, spec, dt) {
  tw.t += dt;
  if (!spec.stay) tw.d += spec.speed * dt;
  [tw.x, tw.z] = twisterAt(tw, tw.d, tw.t);
  return spec.stay ? tw.t < spec.stay : tw.d < spec.range;
}
// does twister tw (standing on the floor at tw.y) catch body p (a vertical capsule: x, y, z, r, h)?
export function catches(tw, spec, p) {
  return Math.hypot(p.x - tw.x, p.z - tw.z) < spec.radius + p.r && p.y < tw.y + spec.height && p.y + p.h > tw.y - 0.25;
}
// A body caught `t` s ago: how far it is lifted (cells), how far round it has been spun (rad) and
// how far off the twister's middle it is swung (cells). Up fast, then it hangs there, spinning
// faster and faster, and swings out a little before it is flung.
export function twirlAt(spec, t) {
  const u = Math.max(0, Math.min(1, t / spec.spin)), up = Math.min(1, u / 0.55);
  return { up: spec.lift * up * up * (3 - 2 * up), angle: Math.PI * 2 * (1.5 * u + 2 * u * u), swing: 0.08 + 0.14 * u * u };
}
