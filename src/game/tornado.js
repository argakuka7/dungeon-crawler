import { state } from './state.js';
import { TORNADO, makeEnemy } from '../core/enemies.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';

// the Tornados of a cube's roster (their rides are the shared AI's, their twisters game/twisters.js)
export let tornados = [];
export function resetTornados() {
  removeEnemyViews(tornados);
  tornados = enemySpots(state.map, TORNADO).filter(spot => !state.run.defeated.has(spot.id)).map((spot, i) => makeEnemy(spot, spot.kind ?? TORNADO, i));
}
export function updateTornados(dt) {
  stepEnemies(tornados, dt);
  tornados = tornados.filter(e => e.mode !== 'dead' || e.deadT < e.profile.corpseTime || (removeEnemyViews([e]), false));
}
export function detachTornados() { const list = tornados; tornados = []; return list; }
