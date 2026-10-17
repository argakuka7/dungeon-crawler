// The player's footsteps: a step whenever the walk / run cycle passes a foot's touchdown
// (measured from the clips, render/character.js), on the surface underfoot (core/footing.js),
// and a heavier one on landing. On a ladder each hand and foot knocks on its rung (or scuffs in
// its hold, rustles its vines ...) as the climb cycle (up or down) passes its grip. The sounds are audio/footsteps.js.
import { player, state } from './state.js';
import { character } from '../render/character.js';
import { blend, W } from '../render/blendtree.js';
import { footstep } from '../audio/footsteps.js';
import { surfaceAt } from '../core/footing.js';
import { themeOf } from '../themes/depth.js';
import { LADDER_STYLES } from '../themes/builds.js';

let prev = null, prevClimb = null, landCount = 0, surface = null;

const ahead = (from, to) => ((to - from) % 1 + 1) % 1;   // how far forwards round the cycle
const mixPhase = (a, b, t) => (a + (((b - a) % 1 + 1.5) % 1 - 0.5) * t + 1) % 1;

// While travelling the support still belongs to the cube we left: keep its surface
function underfoot() {
  if (!state.transitioning) surface = surfaceAt(player.support, state.map, themeOf(state.map).props, player.x, player.z);
  return surface;
}

// the rungs: a contact sounds when the cycle passes it, whichever way it runs
function climbing() {
  const last = prevClimb, now = blend.climb;
  prevClimb = player.climb && blend.mode === 'climb' ? now : null;
  if (prevClimb === null) return;
  const sound = LADDER_STYLES[player.climb.l.style]?.sound ?? 'ladder';   // wood, rope, vine, iron or rock
  if (last === null) { footstep(sound, 'walk', { volume: 0.8 }); return; }   // the grab
  const fwd = ahead(last, now), back = ahead(now, last), up = fwd <= back;
  const span = up ? fwd : back, from = up ? last : now;
  if (span <= 0 || span > 0.5) return;
  // the clip moves a hand and the other foot together: one knock, heavier with a foot in it
  const { hand, foot } = character.footfalls.climb, passed = list => list.some(c => { const at = ahead(from, c); return at > 0 && at <= span; });
  if (passed(foot)) footstep(sound, 'run', { volume: 0.9 });
  else if (passed(hand)) footstep(sound, 'walk', { volume: 0.7 });
}

export function updateFootsteps() {
  const p = player;
  if (!character.ready || !state.map) return;
  climbing();
  if (p.landCount !== landCount) {
    landCount = p.landCount;
    const s = !p.swimming && underfoot();
    if (s) footstep(s, p.landImpact > 3 ? 'land' : 'walk', { volume: Math.min(1, 0.4 + p.landImpact / 10) });
  }
  const last = prev, moving = W.walk + W.run;
  prev = blend.phase;
  if (last === null || blend.mode !== 'loco' || !p.grounded || p.swimming || p.climb || p.ragdoll || moving < 0.3) return;
  const moved = ahead(last, blend.phase);
  if (moved <= 0 || moved > 0.5) return;
  const { walk, run } = character.footfalls;
  for (let i = 0; i < 2; i++) {
    const at = ahead(last, mixPhase(walk[i], run[i], blend.run));
    if (at <= 0 || at > moved) continue;
    const s = underfoot();
    if (s) footstep(s, blend.run > 0.5 ? 'run' : 'walk', { volume: 0.5 + 0.5 * Math.min(1, moving) });
  }
}
