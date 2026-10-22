import { loadEnemyModel } from './enemymodel.js';
export const meckedModel = loadEnemyModel('assets/mecked.glb', 1, { walk: 'MeckedWalk', attack: { bite: 'MeckedBite', grab: 'MeckedGrab' }, death: 'MeckedDeath' });
