// What a cube needs drawn before it is shown: the prop sets it shows and its enemies' models,
// loaded on the way in (world/client.js `prepare`: travel waits for it like for the cube's
// map). Asking for the cubes around (prefetch) loads theirs ahead too. A failed load does not
// hold the cube up: what is missing is logged and tried again the next time.
import { propSetsOf } from './propplace.js';
import { loadPropSets } from './props.js';
import { loadSpecies } from './enemies.js';
import { speciesIn } from '../core/spawns.js';
import { themeOf } from '../themes/depth.js';

export const cubeAssets = c => Promise.all([loadPropSets(propSetsOf(c.map, themeOf(c.map))), loadSpecies(speciesIn(c.map))]);
