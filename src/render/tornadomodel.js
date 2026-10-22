import { loadEnemyModel } from './enemymodel.js';
export const tornadoModel = loadEnemyModel('assets/tornado.glb', 1, { walk: 'TornadoWalk', attack: { cast: 'TornadoCast', hop: 'TornadoHop', slam: 'TornadoSlam' },
  death: 'TornadoDeath', props: ['TornadoTwister'] });
