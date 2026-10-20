import { loadEnemyModel } from './enemymodel.js';
export const flipModel = loadEnemyModel('assets/flip.glb', 1, {
  walk: 'FlipHover', attack: { throw: 'FlipThrow', flip: 'FlipFlip', hole: 'FlipHole', summon: 'FlipSummon' },
  death: 'FlipDeath', props: ['FlipBall'],
});
