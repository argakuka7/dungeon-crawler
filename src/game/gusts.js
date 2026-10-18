// The Wolla's storm (core/gusts.js), read off each enemy's attack clock: its storm cloud
// thunders at the attack's `thunder` times, and from the hit frame on it blows for the gust's
// time. A body in the gust with a clear line to the mouth is hit once per blow: hurt, and
// pushed back (blowOf's `push`, carried out by physics/move.js; a friend's body gets it sent
// over). Only the game that runs the enemies hurts anyone (`hurt`); shown another player's
// enemies, the storm is seen and heard here all the same, from the clock the runner sends.
// A stagger or death ends the attack and with it the storm. Gusto's vortex is a gust too (kind
// 'vortex'): no storm cloud, but it breathes in from the gust's `inhale` time to the blow.
import { player } from './state.js';
import { party, alive } from './party.js';
import { attackOf, blowOf } from '../core/enemies.js';
import { muzzleAt } from '../core/beams.js';
import { inGust, gustDir } from '../core/gusts.js';
import { hitBody, attacker } from './enemycombat.js';
import { clearLine } from '../physics/enemynav.js';
import { stormFx } from './juice.js';

export function updateGusts(list, dt, hurt = true) {
  for (const e of list) {
    const a = e.mode === 'attack' ? attackOf(e) : null, g = a?.gust;
    if (!g) { e.storm = null; continue; }
    if (e.storm?.attacks !== e.attacks) e.storm = { attacks: e.attacks, t: e.t - dt, hit: new Set() };
    const s = e.storm, t0 = s.t, t = s.t = e.t;
    g.thunder.forEach((at, i) => { if (t0 < at && t >= at) stormFx(e, g, 'thunder', i); });
    if (g.inhale !== undefined && t >= g.inhale && t < a.hitAt) stormFx(e, g, 'inhale', dt);
    if (t0 < a.hitAt && t >= a.hitAt) stormFx(e, g, 'blow');
    if (t < a.hitAt || t >= a.hitAt + g.time) continue;
    stormFx(e, g, 'gust', dt);
    if (hurt) blow(e, a, g, s.hit);
  }
}
function blow(e, a, g, hit) {
  const o = muzzleAt(e, g.muzzle);
  for (const p of party()) {
    if (hit.has(p) || !alive(p) || (p !== player && !p.here) || !inGust(e, g, p)) continue;
    if (!clearLine(o.x, o.y, o.z, p.x, p.y + p.h * 0.55, p.z)) continue;
    hit.add(p);
    const [nx, nz] = gustDir(e, g, p);
    hitBody(p, { ...blowOf(e.profile, a), by: attacker(e) }, o.x, o.z, nx, nz);
  }
}
