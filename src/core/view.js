// The two views (docs/camera.md): the overview, high over the cube, and the close view behind
// the hero. Pure numbers and the camera key's tap / hold decision, for game/camera.js and
// game/camerakey.js.
import { DEFAULT_ZOOM } from './zoom.js';

export const OVERVIEW_FOV = 28, CLOSE_FOV = 60;   // vertical field of view (degrees)
export const BLEND_TIME = 0.4;                    // s from one view to the other

// The overview looks from one of four sides, diagonally over the cube (the yaw the game starts
// with, and what Q / E turn it by); after the mouse turned it, it settles on the nearest one.
export const SIDE0 = -Math.PI / 4;
export const snapYaw = yaw => SIDE0 + Math.round((yaw - SIDE0) / (Math.PI / 2)) * Math.PI / 2;

// The close view: the camera on an arm from a point at the hero's shoulders, `pitch` over the
// level (rad, looking down; less looks up), as long as the zoom says (the same five presets:
// about 1.5 to 4 units) and shorter where something is in the way (game/camera.js).
export const ANCHOR = 1.2;          // the arm's pivot over the feet
export const AHEAD = 2;             // the camera looks at a point this far past the pivot
export const PITCH = 0.24, PITCH_MIN = -0.1, PITCH_MAX = 0.85;
export const clampPitch = p => Math.min(PITCH_MAX, Math.max(PITCH_MIN, p));
export const closeDistance = zoom => 3 * (zoom / DEFAULT_ZOOM) ** 1.6;

// The camera key: a tap switches the view, holding it while the mouse moves turns the view.
// A press is a tap when it is let go within TAP_MS and the mouse did not turn the view; the
// mouse turns it once it moved ORBIT_PX while the key is down (no need to wait).
export const TAP_MS = 250, ORBIT_PX = 4;
export const YAW_PER_PX = 0.008, PITCH_PER_PX = 0.005;
export const keyPress = t => ({ t0: t, moved: 0, orbiting: false });
// true once the movement turns the view
export function keyMove(k, dx, dy) {
  k.moved += Math.abs(dx) + Math.abs(dy);
  if (k.moved >= ORBIT_PX) k.orbiting = true;
  return k.orbiting;
}
// what letting go does: 'toggle' (switch the view), 'orbited' (the view was turned) or null
export const keyRelease = (k, t) => (k.orbiting ? 'orbited' : t - k.t0 < TAP_MS ? 'toggle' : null);
