// Live beams in the current cube (core/beams.js): the Spicy's laser and the Wolk's lightning.
// One shines from its enemy's eyes (the laser) or gathers under its target's feet (the
// lightning) from the attack's fire time (core/enemies.js fireAt) and bursts at the hit frame;
// the aim follows the player it goes after (game/party.js) meanwhile, until a bolt's aim holds
// still, and the beam follows its enemy's turning. A stagger or death of the enemy puts it out.
// Travel and level resets clear them. Playing together, the others in a cube are shown the
// beams of the player who runs its enemies as they shine (mirrorBeam).
import { player } from './state.js';
import { alive } from './party.js';
import { insideSolid } from '../physics/collide.js';
import { startBeam, aimBeam, castBeam, muzzleAt, beamHits, aiming, aimPoint } from '../core/beams.js';
import { blowOf, attackOf } from '../core/enemies.js';
import { hitBody, attacker } from './enemycombat.js';
import { beamFx } from './juice.js';
import { drawBeams, removeBeamViews, clearStrikes } from '../render/beams.js';

export let beams = [];
const solid = (x, y, z) => insideSolid(x, z, y);
// whom enemy e's beam is after; a fallen player is not followed or hit
const target = e => { const p = e.target?.here ? e.target : player; return alive(p) ? p : null; };

export function fireBeam(e, a) {
  const p = target(e), b = castBeam(startBeam(e, a.beam, aimPoint(p ?? player, a.beam)), solid, p);
  Object.assign(b, { enemy: e, attack: e.attacks, blow: { ...blowOf(e.profile, a), by: attacker(e) }, profile: e.profile });
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
    if (b.mirror) return true;   // the runner moves it (mirrorBeam)
    if (e.mode !== 'attack' || e.attacks !== b.attack) return end(b, 'fizzle');
    b.t += dt;
    Object.assign(b, muzzleAt(e, b.spec.muzzle));
    if (p && aiming(b)) aimBeam(b, aimPoint(p, b.spec), dt);
    castBeam(b, solid, p);
    if (b.t < b.spec.time) return true;
    if (p && beamHits(b, p)) {
      const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
      hitBody(p, b.blow, b.x, b.z, dx / l, dz / l);
    }
    return end(b, 'burst');
  });
}
// The runner's beam of enemy e as it shines there now: [t, ex, ey, ez] (where it ends), or null
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
  removeBeamViews(beams); clearStrikes();
  for (const b of beams) if (b.enemy.beam === b) b.enemy.beam = null;
  beams = [];
}
