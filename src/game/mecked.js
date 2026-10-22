import { state } from './state.js';
import { MECKED, makeEnemy } from '../core/enemies.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';

// the Meckeds of a cube's roster (their bites are the shared AI's, their grab game/grab.js)
export let meckeds = [];
export function resetMeckeds() {
  removeEnemyViews(meckeds);
  meckeds = enemySpots(state.map, MECKED).filter(spot => !state.run.defeated.has(spot.id)).map((spot, i) => makeEnemy(spot, spot.kind ?? MECKED, i));
}
export function updateMeckeds(dt) {
  stepEnemies(meckeds, dt);
  meckeds = meckeds.filter(e => e.mode !== 'dead' || e.deadT < e.profile.corpseTime || (removeEnemyViews([e]), false));
}
export function detachMeckeds() { const list = meckeds; meckeds = []; return list; }
