import { state } from './state.js';
import { WOLLA, makeEnemy } from '../core/enemies.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';

export let wollas = [];
export function resetWollas() {
  removeEnemyViews(wollas);
  wollas = enemySpots(state.map, WOLLA).filter(spot => !state.run.defeated.has(spot.id)).map((spot, i) => makeEnemy(spot, spot.kind ?? WOLLA, i));
}
export function updateWollas(dt) {
  stepEnemies(wollas, dt);
  wollas = wollas.filter(e => e.mode !== 'dead' || e.deadT < e.profile.corpseTime || (removeEnemyViews([e]), false));
}
export function detachWollas() { const list = wollas; wollas = []; return list; }
