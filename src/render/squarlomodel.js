import { loadEnemyModel } from './enemymodel.js';
export const squarloModel = loadEnemyModel('assets/squarlo.glb', 1, {
  walk: 'SquarloRun', attack: { blow: 'SquarloBlow', cast: 'SquarloCast', summon: 'SquarloSummon', rest: 'SquarloRest', stomp: 'SquarloStomp',
    jump: 'SquarloJump', kick: 'SquarloKick', cannon: 'SquarloCannon' },
  death: 'SquarloDeath', gaits: { swim: 'SquarloSwim', stride: 'SquarloStride' },
});
