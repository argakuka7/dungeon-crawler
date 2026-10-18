import { loadEnemyModel } from './enemymodel.js';
export const gustoModel = loadEnemyModel('assets/gusto.glb', 1, {
  walk: 'GustoFloat', attack: { grab: 'GustoGrab', summon: 'GustoSummon', blow: 'GustoBlow' }, death: 'GustoDeath',
});
