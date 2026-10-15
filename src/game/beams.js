// Live beams in the current cube (core/beams.js): the Spicy's laser. One shines from its
// enemy's eyes from the attack's fire time (core/enemies.js fireAt) and bursts at the hit frame;
// the aim follows the player it goes after (game/party.js) meanwhile, and the beam follows its
// enemy's turning. A stagger or death of the enemy puts it out. Travel and level resets clear
// them. Playing together, the guest is shown the host's beams as they shine (mirrorBeam).
import { player } from './state.js';
import { alive } from './party.js';
import { insideSolid } from '../physics/collide.js';
import { startBeam, aimBeam, castBeam, muzzleAt, beamHits } from '../core/beams.js';
import { blowOf, attackOf } from '../core/enemies.js';
import { hitBody } from './enemycombat.js';
import { beamFx } from './juice.js';
import { drawBeams, removeBeamViews } from '../render/beams.js';

export let beams = [];
const solid = (x, y, z) => insideSolid(x, z, y);
const chest = p => ({ x: p.x, y: p.y + p.h * 0.55, z: p.z });
// whom enemy e's beam is after; a fallen player is not followed or hit
const target = e => { const p = e.target?.here ? e.target : player; return alive(p) ? p : null; };

export function fireBeam(e, a) {
  const p = target(e), b = castBeam(startBeam(e, a.beam, chest(p ?? player)), solid, p);
  Object.assign(b, { enemy: e, attack: e.attacks, blow: blowOf(e.profile, a), profile: e.profile });
  e.beam = b;
  beams.push(b);
  beamFx(b, 'start');
  return b;
}
function end(b, what) {
  beamFx(b, what);
  removeBeamViews([b]);
  if (b.enemy.beam === b) b.enemy.beam = null;
  return false;
}
export function updateBeams(dt) {
  beams = beams.filter(b => {
    const e = b.enemy, p = target(e);
    if (b.mirror) return true;   // the host moves it (mirrorBeam)
    if (e.mode !== 'attack' || e.attacks !== b.attack) return end(b, 'fizzle');
    b.t += dt;
    Object.assign(b, muzzleAt(e, b.spec.muzzle));
    if (p) aimBeam(b, chest(p), dt);
    castBeam(b, solid, p);
    if (b.t < b.spec.time) return true;
    if (p && beamHits(b, p)) {
      const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
      hitBody(p, b.blow, b.x, b.z, dx / l, dz / l);
    }
    return end(b, 'burst');
  });
}
// The host's beam of enemy e as it shines there now: [t, ex, ey, ez] (where it ends), or null
// once it is gone: it burst if it had shone its time, else it was put out.
export function mirrorBeam(e, data) {
  let b = e.beam;
  if (!data) {
    if (b?.mirror) { beams = beams.filter(x => x !== b); end(b, b.t >= b.spec.time - 0.1 ? 'burst' : 'fizzle'); }
    return;
  }
  const spec = attackOf(e).beam;
  if (!spec) return;
  if (!b?.mirror) {
    b = e.beam = { kind: spec.kind, spec, enemy: e, profile: e.profile, mirror: true, t: 0, length: 0 };
    beams.push(b);
    Object.assign(b, muzzleAt(e, spec.muzzle));
    beamFx(b, 'start');
  }
  const [t, ex, ey, ez] = data;
  Object.assign(b, muzzleAt(e, spec.muzzle), { t, ex, ey, ez });
  b.length = Math.hypot(ex - b.x, ey - b.y, ez - b.z);
}
export const drawAllBeams = (dt, off) => drawBeams(beams, dt, off);
export function clearBeams() {
  removeBeamViews(beams);
  for (const b of beams) if (b.enemy.beam === b) b.enemy.beam = null;
  beams = [];
}
