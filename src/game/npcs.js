// Who stands about in the cube we are in, besides the villagers of the clearings: the people
// living at the seats and camps (core/npcs.js residentsOf). The quests will add the ones they put
// on spots (somebody lost, somebody waiting). game/flow.js sets them on the map as it is entered
// (map.npcs); render/world.js draws them like the villagers and makes them colliders.
import { residentsOf } from '../core/npcs.js';
import { state } from './state.js';

export const npcsIn = map => map?.interior ? [] : residentsOf(map?.spots ?? []);
// everybody one can talk to here: the villagers and the NPCs
export const peopleHere = () => [...(state.map?.villagers ?? []), ...(state.map?.npcs ?? [])];
