import { loadEnemyModel } from './enemymodel.js';
export const wolkModel = loadEnemyModel('assets/wolk.glb', 1, { walk: 'WolkWalk', attack: 'WolkZap', death: 'WolkDeath' });
