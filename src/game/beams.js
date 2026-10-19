// Live beams in the current cube (core/beams.js): the Spicy's laser, the Wolk's lightning and
// Totnar's storm. One shines from its enemy's eyes (the laser) or gathers under its target's feet
// (the lightning) from the attack's fire time (core/enemies.js fireAt) and bursts at the hit frame;
// the aim follows the player it goes after (game/party.js) meanwhile, until a bolt's aim holds
// still, and the beam follows its enemy's turning. A storm (`bolts` > 1) strikes several bolts
// at once: the enemy's `beam` at the player, its `bolts` beside them (each keeping its offset
// from the player); a bolt out of the sky (`sky`) comes straight down onto its spot. A stagger
// or death of the enemy puts them out. Travel and level resets clear them. Playing together, the
// others in a cube are shown the beams of the player who runs its enemies as they shine
// (mirrorBeam).
import { player } from './state.js';
import { alive } from './party.js';
import { insideSolid } from '../physics/collide.js';
import { startBeam, aimBeam, castBeam, originOf, beamHits, aiming, aimPoint, boltOffsets } from '../core/beams.js';
import { blowOf, attackOf } from '../core/enemies.js';
import { hitBody, attacker } from './enemycombat.js';
import { beamFx } from './juice.js';
import { drawBeams, removeBeamViews, clearStrikes } from '../render/beams.js';

export let beams = [];
const solid = (x, y, z) => insideSolid(x, z, y);
// whom enemy e's beam is after; a fallen player is not followed or hit
const target = e => { const p = e.target?.here ? e.target : player; return alive(p) ? p : null; };

export function fireBeam(e, a) {
  const p = target(e), spec = a.beam, blow = { ...blowOf(e.profile, a), by: attacker(e) };
  const one = (offset, quiet) => {
    // (one beside the player passes them by: only the one at them stops at their body)
    const b = castBeam(startBeam(e, spec, aimPoint(p ?? player, spec, offset)), solid, offset ? null : p);
    Object.assign(b, { enemy: e, attack: e.attacks, blow, profile: e.profile, offset, quiet });
    beams.push(b);
    beamFx(b, 'start');
    return b;
  };
  e.beam = one(null, false);
  e.bolts = spec.bolts > 1 ? boltOffsets(spec).map(o => one(o, true)) : null;
  return e.beam;
}
function end(b, what) {
  beamFx(b, what);
  removeBeamViews([b]);
  const e = b.enemy;
  if (e.beam === b) e.beam = null;
  if (e.bolts?.includes(b)) e.bolts = e.bolts.filter(x => x !== b);
  return false;
}
export function updateBeams(dt) {
  beams = beams.filter(b => {
    const e = b.enemy, p = target(e);
    if (b.mirror) return true;   // the runner moves it (mirrorBeam)
    if (e.mode !== 'attack' || e.attacks !== b.attack) return end(b, 'fizzle');
    b.t += dt;
    if (p && aiming(b)) aimBeam(b, aimPoint(p, b.spec, b.offset), dt);
    Object.assign(b, originOf(e, b.spec, { x: b.ax, y: b.ay, z: b.az }));
    castBeam(b, solid, b.offset ? null : p);
    if (b.t < b.spec.time) return true;
    if (p && beamHits(b, p)) {
      const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
      hitBody(p, b.blow, b.x, b.z, dx / l, dz / l);
    }
    return end(b, 'burst');
  });
}
// The runner's beam of enemy e as it shines there now: [t, ex, ey, ez] (where it ends), or null
// once it is gone: it burst if it had shone its time, else it was put out. side: the same for
// the other bolts of a storm (a list, or null).
export function mirrorBeam(e, data, side = null) {
  e.beam = mirrorOne(e, e.beam, data, false);
  const was = e.bolts ?? [], list = Array.isArray(side) ? side.filter(d => Array.isArray(d) && d.length === 4) : [];
  e.bolts = list.length || was.length ? list.map((d, i) => mirrorOne(e, was[i], d, true)) : null;
  for (const b of was.slice(list.length)) mirrorOne(e, b, null, true);
}
function mirrorOne(e, b, data, quiet) {
  if (!data) {
    if (b?.mirror) { beams = beams.filter(x => x !== b); end(b, b.t >= b.spec.time - 0.1 ? 'burst' : 'fizzle'); }
    return null;
  }
  const spec = attackOf(e).beam;
  if (!spec) return null;
  const [t, ex, ey, ez] = data, at = { x: ex, y: ey, z: ez };
  if (!b?.mirror) {
    b = { kind: spec.kind, spec, enemy: e, profile: e.profile, mirror: true, t: 0, length: 0, quiet };
    beams.push(b);
    Object.assign(b, originOf(e, spec, at));
    beamFx(b, 'start');
  }
  Object.assign(b, originOf(e, spec, at), { t, ex, ey, ez });
  b.length = Math.hypot(ex - b.x, ey - b.y, ez - b.z);
  return b;
}
export const drawAllBeams = (dt, off) => drawBeams(beams, dt, off);
export function clearBeams() {
  removeBeamViews(beams); clearStrikes();
  for (const b of beams) { b.enemy.beam = null; b.enemy.bolts = null; }
  beams = [];
}
