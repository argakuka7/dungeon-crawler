import { state } from './state.js';
import { WOLK, makeEnemy } from '../core/enemies.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';

export let wolks = [];
export function resetWolks() {
  removeEnemyViews(wolks);
  wolks = enemySpots(state.map, WOLK).filter(spot => !state.run.defeated.has(spot.id)).map((spot, i) => makeEnemy(spot, spot.kind ?? WOLK, i));
}
export function updateWolks(dt) {
  stepEnemies(wolks, dt);
  wolks = wolks.filter(e => e.mode !== 'dead' || e.deadT < e.profile.corpseTime || (removeEnemyViews([e]), false));
}
export function detachWolks() { const list = wolks; wolks = []; return list; }
