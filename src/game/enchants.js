// What an enchanted weapon's hit does besides its damage (core/gear/enchants.js): Toasty sets
// the enemy burning (unless it burns already), Icky adds to its poison, Nippy chills it, Zappy
// now and then stuns it. Shiny's coins come when it dies (game/loot.js dropLoot). Called for our
// own blade hits and shots (game/sword.js, game/shots.js) after the hit landed; the statuses go
// to the player running the enemy when it is another's (game/statuses.js afflictEnemy).
import { afflictEnemy } from './statuses.js';
import { bigFoe } from '../core/status.js';
import { absent } from '../core/enemies.js';
import { TOASTY_TIME, ICKY_TIME, NIPPY_TIME, ZAPPY_TIME, BIG_SHARE } from '../core/gear/enchants.js';
import { enemyZappedFx } from './juice.js';

// the zap's roll in 0..1 (browser checks can pin it)
export const enchantRolls = { zap: () => Math.random() };
// what is left to tick of a burn or poison d (one shown from another's game: nothing we know of)
const left = d => d?.ticks ? d.damage * (d.ticks - d.done) / d.ticks : 0;

// enemy e took `hit` ({ damage, crit }) from a weapon of `stats` (combatStats, or a shot's copy)
export function enchantHit(e, hit, stats) {
  const en = stats?.enchant;
  if (!en || !hit || absent(e)) return;
  const v = en.value / 100, big = bigFoe(e) ? BIG_SHARE : 1;
  if (en.id === 'toasty' && !e.burning)
    afflictEnemy(e, 'burning', { time: TOASTY_TIME, ticks: 2 * TOASTY_TIME, damage: Math.max(1, Math.round(hit.damage * v)) });
  else if (en.id === 'icky')
    afflictEnemy(e, 'toxic', { time: ICKY_TIME, ticks: 2 * ICKY_TIME, damage: Math.max(1, Math.round(left(e.toxic) + hit.damage * v)) });
  else if (en.id === 'nippy') afflictEnemy(e, 'chilled', { time: NIPPY_TIME, slow: 1 - v * big });
  else if (en.id === 'zappy' && enchantRolls.zap() < v && afflictEnemy(e, 'zapped', { time: ZAPPY_TIME * big })) enemyZappedFx(e);
}
