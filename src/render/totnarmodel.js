import { loadEnemyModel } from './enemymodel.js';
export const totnarModel = loadEnemyModel('assets/totnar.glb', 1, {
  walk: 'TotnarDrift', attack: { throw: 'TotnarThrow', gloom: 'TotnarGloom', summon: 'TotnarSummon', roll: 'TotnarRoll', storm: 'TotnarStorm' },
  death: 'TotnarDeath', props: ['TotnarSkull'],
});
