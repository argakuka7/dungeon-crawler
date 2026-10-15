// Enemies burning and poisoned (core/status.js), from the player's fire and toxic flasks
// (game/throws.js): the damage ticks away in whole points without staggering them; a tick that
// kills counts like any kill (game/enemies.js awards it). Death ends a status.
import { damageEnemy } from '../core/combat.js';
import { STATUSES, afflict, enemyTick, statusOver, immuneTo } from '../core/status.js';
import { statusHurtFx } from './juice.js';
import { relay } from '../net/online.js';

// set enemy e burning or poisoned (status: 'burning' | 'toxic') by `spec`; false when it is
// dead or fire does not hurt it. The guest's go to the host too (net/online.js relay).
export function afflictEnemy(e, status, spec) {
  if (!spec || e.mode === 'dead' || immuneTo(e, status)) return false;
  e[status] = afflict(spec);
  relay.afflict?.(e, status, spec);
  return true;
}
export function updateEnemyStatuses(list, dt) {
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
