// Enemies burning and poisoned (core/status.js), from the player's fire and toxic flasks
// (game/throws.js) and enchanted weapons (game/enchants.js): the damage ticks away in whole
// points without staggering them; a tick that kills counts like any kill (game/enemies.js awards
// it). Enchanted weapons also chill enemies (slowed: game/enemyai.js stepEnemies) and zap them
// (stunned for a moment). Death ends a status.
import { damageEnemy } from '../core/combat.js';
import { STATUSES, afflict, enemyTick, statusOver, immuneTo, zappable } from '../core/status.js';
import { chillFrom, chillStep } from '../core/projectiles.js';
import { statusHurtFx } from './juice.js';
import { relay } from '../net/online.js';
import { absent } from '../core/enemies.js';

// the statuses afflictEnemy sets
export const AFFLICTIONS = [...STATUSES, 'chilled', 'zapped'];
// set enemy e burning or poisoned (status: 'burning' | 'toxic') by `spec` ({ time, damage,
// ticks }), chilled ({ time, slow }) or zapped ({ time }); false when it is dead or it does not
// take it (fire, a boss's stun). Ours on enemies another player runs go to that player too
// (net/online.js relay).
export function afflictEnemy(e, status, spec) {
  if (!spec || absent(e) || immuneTo(e, status)) return false;
  if (status === 'chilled') e.chilled = chillFrom(spec);
  else if (status === 'zapped') {
    if (!zappable(e)) return false;
    e.zapped = spec.time; e.stun = Math.max(e.stun || 0, spec.time); e.speed = 0;
  } else e[status] = afflict(spec);
  e.lastHit = null;   // ours (the session says when it was a friend's)
  relay.afflict?.(e, status, spec);
  return true;
}
export function updateEnemyStatuses(list, dt) {
  for (const e of list) {
    if (e.chilled && (e.mode === 'dead' || !chillStep(e.chilled, dt))) e.chilled = null;
    if (e.zapped > 0) e.zapped = e.mode === 'dead' ? 0 : Math.max(0, e.zapped - dt);
  }
  for (const e of list) for (const status of STATUSES) {
    const d = e[status];
    if (!d) continue;
    if (e.mode === 'dead') { e[status] = null; continue; }
    const n = enemyTick(d, dt);
    if (n > 0) {
      const before = e.hp;
      damageEnemy(e, n, false);
      statusHurtFx(e, before - e.hp, status, !e.hp);
    }
    if (statusOver(d)) e[status] = null;
  }
}
