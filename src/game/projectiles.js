// Live projectiles in the current cube: thrown by enemies at their attack's hit frame, they
// fly until they hit a player, run into the level or out of range (core/projectiles.js).
// Travel and level resets clear them. Playing together, the projectiles of the player who runs
// this cube's enemies are shown to the others there too (`mirror`): they fly the same way
// there, but only the runner decides whom they hit (game/party.js), and says where they end
// (net/session.js).
import { player } from './state.js';
import { party, alive } from './party.js';
import { insideSolid } from '../physics/collide.js';
import { launch, stepProjectile } from '../core/projectiles.js';
import { blowOf } from '../core/enemies.js';
import { hitBody, attacker } from './enemycombat.js';
import { projectileFx } from './juice.js';
import { drawProjectiles, removeProjectileViews } from '../render/projectiles.js';
import { relay } from '../net/online.js';

export let projectiles = [];
const solid = (x, y, z) => insideSolid(x, z, y);
let serial = 0;

export function launchProjectile(e, a) {
  const p = e.target?.here ? e.target : player, pr = launch(e, a.projectile, { x: p.x, y: p.y + p.h * 0.55, z: p.z });
  pr.blow = { ...blowOf(e.profile, a), by: attacker(e) };
  pr.profile = e.profile;   // the thrower's kind colours it
  pr.n = ++serial;
  projectiles.push(pr);
  projectileFx(pr, 'launch');
  relay.launch?.(pr, e);
  return pr;
}
// the runner's projectile n, thrown by e (its view here), from (x, y, z) at (vx, vy, vz)
export function mirrorProjectile(n, e, spec, x, y, z, vx, vy, vz) {
  const pr = { kind: spec.kind, spec, x, y, z, vx, vy, vz, travelled: 0, t: 0, profile: e?.profile, n, mirror: true };
  projectiles.push(pr);
  projectileFx(pr, 'launch');
}
// the runner says its projectile n ended
export function endMirrored(n, end) {
  const pr = projectiles.find(p => p.mirror && p.n === n);
  if (!pr) return;
  projectileFx(pr, end);
  removeProjectileViews([pr]);
  projectiles = projectiles.filter(p => p !== pr);
}
export function updateProjectiles(dt) {
  const targets = party().filter(alive);   // flies through a fallen player
  projectiles = projectiles.filter(pr => {
    const end = stepProjectile(pr, dt, pr.mirror ? null : targets, solid);
    if (!end) return true;
    if (end === 'hit') {
      const l = Math.hypot(pr.vx, pr.vz) || 1;
      hitBody(pr.victim, pr.blow, pr.x - pr.vx / l, pr.z - pr.vz / l, pr.vx / l, pr.vz / l);
    }
    if (!pr.mirror) relay.landed?.(pr, end);
    projectileFx(pr, end);
    removeProjectileViews([pr]);
    return false;
  });
}
export const drawAllProjectiles = (dt, off) => drawProjectiles(projectiles, dt, off);
export function clearProjectiles() { removeProjectileViews(projectiles); projectiles = []; }
