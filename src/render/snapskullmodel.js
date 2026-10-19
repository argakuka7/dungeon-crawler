import { loadEnemyModel } from './enemymodel.js';
export const snapSkullModel = loadEnemyModel('assets/snapskull.glb', 1, { walk: 'SnapHop', attack: 'SnapBite', death: 'SnapDeath' });
