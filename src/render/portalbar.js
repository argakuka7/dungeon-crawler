// The charge of the vertical portal the player stands in (0.75s down, 1.5s up), a
// white bar floating over the portal like the health bars. Lives in the scene, not the cube, so
// cube fading never touches its shared materials.
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { makeBar } from './bars.js';
import { state } from '../game/state.js';
import { portalChargeDuration } from '../game/portals.js';
import { uiScale } from '../game/uiscale.js';

const bar = makeBar({ w: 0.8, h: 0.08, color: 0xffffff, onTop: true });
const pos = new THREE.Vector3();
bar.group.visible = false;
scene.add(bar.group);

// after the camera moved, so the bar faces it this frame
export function updatePortalBar() {
  const c = state.portalCharge;
  const fx = c && !state.transitioning && c.key === state.cubeKey && state.world?.portalFx.find(f => f.obj.userData.portal.id === c.id);
  bar.group.visible = !!fx;
  if (!fx) return;
  fx.obj.getWorldPosition(pos);
  bar.group.position.set(pos.x, pos.y + 1.95, pos.z);   // above the well or hovering ring
  bar.group.quaternion.copy(camera.quaternion);
  bar.resize(uiScale());   // (the UI scale, game/uiscale.js)
  bar.set(c.t / portalChargeDuration(fx.obj.userData.portal.kind));
}
