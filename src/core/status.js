// Statuses that hurt over time, on the player (game/enemycombat.js) and on enemies
// (game/statuses.js): `burning` (a Fire-face's fireball, a fire flask) and `toxic` (venomous
// bites, acid, a toxic flask). Both are damage over time with the shape core/projectiles.js
// ignite makes: `{ time, damage, ticks }` dealt in equal ticks over `time`. Catching it again
// restarts it, so lingering sources (a burning patch, a poison cloud) only catch what is not
// already affected. While poisoned the player does not regenerate (core/progression.js).
import { ignite, burnStep, burntOut, chillFactor } from './projectiles.js';

export const STATUSES = ['burning', 'toxic'];
// a status of `spec` ({ time, damage, ticks }); reason: what the player is told when it kills
export const afflict = (spec, reason = '') => ignite(spec, reason);
// advance status d by dt: the damage due in this step
export const statusStep = burnStep;
export const statusOver = burntOut;
// an enemy's tick of damage: whole points (at least one), the remainder carried to the next
export function enemyTick(d, dt) {
  const due = statusStep(d, dt) + (d.carry ?? 0), whole = Math.floor(due);
  d.carry = due - whole;
  return whole;
}
// fire does not hurt the fiery kinds (their profile says `fireproof`)
export const immuneTo = (e, status) => status === 'burning' && !!e.profile?.fireproof;
// The poison a venomous blow leaves: kinds with `toxin` ({ time, ticks, share }) poison for
// `share` of the blow's damage on top, over `time` s.
export const toxinOf = (spec, damage) => spec ? { time: spec.time, ticks: spec.ticks, damage: Math.max(1, Math.round(damage * spec.share)) } : null;
// acid falls poison too (physics/hazards.js), for a share of the maximum health
export const ACID_TOXIN = { time: 4, ticks: 4, share: 0.12 };

// What enchanted weapons do to enemies besides burning and poisoning them (core/gear/enchants.js,
// game/enchants.js): `chilled` ({ time, slow, t }, core/projectiles.js chillFrom) slows all it does
// (moving, winding up, striking) by `slow`, thawing at the end like the player's chill; `zapped`
// (s left) holds it still: it is stunned (`stun`) that long. Guardians and bosses take half of a
// slow; bosses are not stunned, nor is anything that cannot be staggered.
export const bigFoe = e => !!(e.guardian || e.boss);
export const enemySlow = e => e.chilled?.time ? chillFactor(e.chilled) : 1;
export const zappable = e => !e.boss && !e.profile?.steadfast;
