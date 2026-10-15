// Who the enemies can go after: the player, and when playing together (src/net/session.js, on
// the host) the friend while they are in this cube. A friend is a stand-in body with the
// fields the enemies read (x, y, z, vx, vz, r, h, hp, ragdoll, grounded, swimming, support) and
// `remote: true`; a blow that lands on it is sent over (hurt) instead of hitting our player.
import { player } from './state.js';

let others = [];
export const setOthers = list => { others = list; };
export const party = () => others.length ? [player, ...others] : [player];

// can enemies hurt body b now (on their feet, alive)?
export const alive = b => !!b && b.hp > 0 && !b.ragdoll;

// how far body b is from (x, y, z) for choosing whom to go after: a floor apart counts double
export const reach = (b, x, y, z) => Math.hypot(b.x - x, b.z - z) + Math.abs(b.y - y);

// The body enemy e goes after. It keeps the one it has while that one can be hurt and the
// other is not clearly nearer (SWITCH cells), so two players side by side do not make it
// dither; it never turns away in the middle of an attack.
export const SWITCH = 2;
export function chooseTarget(e, bodies = party()) {
  const cur = bodies.includes(e.target) ? e.target : null;
  if (bodies.length === 1) return bodies[0];
  if (cur && e.mode === 'attack') return cur;
  let best = null, bd = Infinity;
  for (const b of bodies) {
    if (!alive(b)) continue;
    const d = reach(b, e.x, e.y, e.z);
    if (d < bd) { best = b; bd = d; }
  }
  if (!best) return cur ?? bodies[0];
  if (cur && alive(cur) && reach(cur, e.x, e.y, e.z) <= bd + SWITCH) return cur;
  return best;
}

// the living body nearest to (x, z) (a guardian's arena, a horde's patch), else the player
export function nearestTo(x, z, bodies = party()) {
  let best = null, bd = Infinity;
  for (const b of bodies) {
    const d = Math.hypot(b.x - x, b.z - z);
    if (alive(b) && d < bd) { best = b; bd = d; }
  }
  return best ?? player;
}
