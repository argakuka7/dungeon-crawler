// The tidal hills' water (cubegen/guardian.js map.tide, Squarlo's arena): it stands at its rest
// level in the low flats, and Squarlo raises it (game/squarlo.js: his `tide`, 0 at rest .. 1 at
// high tide, sent to friends with his row, net/protocol.js). Every frame its level goes to the
// physics (physics/fluid.js setTide: what drowns, what is waded through) and is drawn
// (render/trials.js: the trial's rising water, in the tide's box). Enemies it goes over drown,
// but those that swim float in it.
import { LH, WATER } from '../core/constants.js';
import { tideLevel } from '../core/squarlo.js';
import { setTide, standingAt, enemyUnder } from '../physics/fluid.js';
import { setTrialWater } from '../render/trials.js';
import { state } from './state.js';

// how fast a shown level follows the boss's (levels/s): it moves smoothly between rows
const FOLLOW = 1.2;
let shown = null;
export function updateTide(list, dt) {
  const t = state.map?.tide;
  if (!t) {
    if (shown !== null) { shown = null; state.tide = null; setTide(null); setTrialWater(state.world, null, null); }
    return;
  }
  const k = list.reduce((m, e) => e.tide > m ? e.tide : m, 0), want = tideLevel(t, k);
  shown = shown === null ? want : shown + Math.max(-FOLLOW * dt, Math.min(FOLLOW * dt, want - shown));
  state.tide = shown;
  setTide({ y: shown * LH, fluid: t.fluid, box: t.box });
  setTrialWater(state.world, shown * LH, 'running');
}
export const resetTide = () => { shown = null; };

// enemies a standing fluid goes over drown (no reward: the water took them)
export function drownEnemies(list) {
  for (const e of list) {
    if (e.mode === 'dead' || e.hp <= 0 || !enemyUnder(e)) continue;
    e.noReward = true; e.hp = 0; e.mode = 'dead'; e.deadT = 0; e.path = null; e.speed = 0;
  }
}
// those that swim float in deep water (their body half under; `swimming`), wherever they move
export function floatSwimmers(list) {
  for (const e of list) {
    if (!e.profile.swims || e.mode === 'dead') continue;
    const s = standingAt(e.x, e.z), half = e.profile.bodyHeight * 0.5;
    e.swimming = !!s && s.fluid === WATER && s.y - e.y > half;
    if (e.swimming) e.y = s.y - half;
  }
}
