// The cast in progress (reading a portal scroll, game/townportal.js, roomportal.js): a violet
// bar over the player's own bars. Lives in the scene, not a cube, like the portal charge bar.
import { scene, camera } from './scene.js';
import { makeBar } from './bars.js';
import { player, state } from '../game/state.js';
import { CHAR_H } from '../core/constants.js';

const bar = makeBar({ w: 0.8, h: 0.08, color: 0xb98cff, onTop: true });
bar.group.visible = false;
scene.add(bar.group);

// after the camera moved, so the bar faces it this frame
export function updateCastBar() {
  const c = state.cast;
  bar.group.visible = !!c && !state.transitioning;
  if (!bar.group.visible) return;
  bar.group.position.set(player.x, player.visY + CHAR_H + 0.85, player.z);
  bar.group.quaternion.copy(camera.quaternion);
  bar.set(c.t / c.duration);
}
