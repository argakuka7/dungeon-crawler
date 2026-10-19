import { state } from './state.js';
import { SQUIRTLE, makeEnemy } from '../core/enemies.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';

// the Squirtles of a cube's roster (their burrowing is the shared AI's, game/enemyai.js)
export let squirtles = [];
export function resetSquirtles() {
  removeEnemyViews(squirtles);
  squirtles = enemySpots(state.map, SQUIRTLE).filter(spot => !state.run.defeated.has(spot.id)).map((spot, i) => makeEnemy(spot, spot.kind ?? SQUIRTLE, i));
}
export function updateSquirtles(dt) {
  stepEnemies(squirtles, dt);
  squirtles = squirtles.filter(e => e.mode !== 'dead' || e.deadT < e.profile.corpseTime || (removeEnemyViews([e]), false));
}
export function detachSquirtles() { const list = squirtles; squirtles = []; return list; }
