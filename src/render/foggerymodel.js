import { loadEnemyModel } from './enemymodel.js';
export const foggeryModel = loadEnemyModel('assets/foggery.glb', 1, {
  walk: 'FoggeryWalk', attack: { eyeL: 'FoggeryEyeL', eyeR: 'FoggeryEyeR', summon: 'FoggerySummon', spit: 'FoggerySpit',
    geyser: 'FoggeryGeyser', cats: 'FoggeryCats' },
  death: 'FoggeryDeath', gaits: { float: 'FoggeryFloat' }, props: ['FoggeryEye'],
});
