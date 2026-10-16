import { loadEnemyModel } from './enemymodel.js';
export const wollaModel = loadEnemyModel('assets/wolla.glb', 1, { walk: 'WollaGlide', attack: 'WollaBlow', death: 'WollaDeath' });
