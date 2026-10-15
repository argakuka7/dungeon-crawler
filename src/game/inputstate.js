// Shared input memory lets the modal clear held/queued input without an input/UI cycle.
// stick, attackHeld, aim: the touch controls (game/touch.js): the left stick's push (core/
// stick.js stickVector), the action button held, and the action button as a stick aiming a
// flask (active while a thumb aims with it).
import { player } from './state.js';
export const controls = {
  keys: new Set(), jumpPressed: false,
  stick: { x: 0, y: 0, m: 0 }, attackHeld: false, aim: { active: false, x: 0, y: 0, m: 0 },
};
export function clearInput() {
  controls.keys.clear(); controls.jumpPressed = false;
  Object.assign(controls.stick, { x: 0, y: 0, m: 0 }); controls.attackHeld = false;
  Object.assign(controls.aim, { active: false, x: 0, y: 0, m: 0 });
  player.sword.requested = false; player.autoDir = null;
}
