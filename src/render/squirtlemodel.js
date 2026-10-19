import { loadEnemyModel } from './enemymodel.js';
export const squirtleModel = loadEnemyModel('assets/squirtle.glb', 1, { walk: 'SquirtleSway', attack: 'SquirtleSpit', death: 'SquirtleDeath', props: ['SquirtleDrop'] });
