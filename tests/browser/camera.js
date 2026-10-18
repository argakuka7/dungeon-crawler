// Browser checks for the two views (docs/camera.md): the camera key (tap, hold, the mouse
// turning the view, the overview settling on a side), the close view's cutaway and walls, its
// arm out of the solids and the player's bar at the bottom of the screen. In a cave of the
// current world (a horde's: /horde 7). The setting comes back afterwards. From the console:
//   await (await import('./tests/browser/camera.js')).runCameraChecks()
import * as THREE from 'three';
import { player, state, view } from '../../src/game/state.js';
import { cameraMode, setCameraMode } from '../../src/game/settings.js';
import { settleCamera, closeView, closeArm, updateCamera } from '../../src/game/camera.js';
import { updateCut } from '../../src/game/cut.js';
import { insideSolid } from '../../src/physics/collide.js';
import { camera } from '../../src/render/scene.js';
import { U } from '../../src/render/cutshader.js';
import { snapYaw, closeDistance } from '../../src/core/view.js';
import { goHorde } from '../../src/game/dev.js';
import '../../src/game/input.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const down = code => { const e = new KeyboardEvent('keydown', { code, key: code, cancelable: true }); dispatchEvent(e); return e; };
const up = code => dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
const move = (dx, dy) => dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: dx, movementY: dy }));
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

export async function runCameraChecks() {
  const mode = cameraMode(), yaw = view.yawTarget, pitch = view.pitch, results = [];
  try {
    if (!state.map?.walled) await goHorde(7);
    check(state.map?.walled, 'Needs a cave');
    await delay(500);

    // the keys
    setCameraMode('overview'); settleCamera();
    const tap = down('Tab'); await delay(40); up('Tab');
    check(tap.defaultPrevented && cameraMode() === 'close', 'A tap on Tab switches to the close view (and the focus stays)');
    down('KeyC'); await delay(40); up('KeyC');
    check(cameraMode() === 'overview', 'A tap on C switches back');
    down('Tab'); await delay(400); up('Tab');
    check(cameraMode() === 'overview', 'A long hold does not switch');
    down('Tab'); dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', repeat: true })); await delay(40); up('Tab');
    check(cameraMode() === 'close', 'Key repeats do not count as presses');
    results.push('tap switches, hold and repeats do not');

    // turning with the mouse: the close view freely, also up and down
    settleCamera();
    const y0 = view.yaw, p0 = view.pitch;
    down('Tab');
    for (let i = 0; i < 5; i++) move(10, 4);
    check(view.orbiting && document.body.classList.contains('orbiting'), 'Holding and moving the mouse turns the view, the cursor hides');
    check(view.yaw < y0 && view.pitch > p0, 'Right and down: the view turns right and looks down more');
    up('Tab');
    check(cameraMode() === 'close' && !view.orbiting && !document.body.classList.contains('orbiting'), 'Letting go after turning does not switch');
    // ... the overview settles on the nearest side
    setCameraMode('overview'); settleCamera();
    down('Tab'); move(30, 0); move(30, 0); up('Tab');
    check(near(view.yawTarget, snapYaw(view.yawTarget)), 'The overview settles on one of its four sides');
    down('Tab'); move(30, 0); dispatchEvent(new Event('blur'));
    check(!view.orbiting && cameraMode() === 'overview', 'Losing the window ends the turning without switching');
    results.push('the mouse turns the view; the overview settles on a side');

    // the close view: no cutaway, the cave walls stay up, the neighbours' reveal is off
    view.yaw = view.yawTarget = snapYaw(view.yawTarget); view.pitch = pitch;
    updateCut(0);
    check(U.uFront.value.x + U.uFront.value.y + U.uFront.value.z + U.uFront.value.w > 0, 'In a cave the overview lowers the walls on its side');
    setCameraMode('close'); settleCamera(); updateCut(0);
    check(closeView() && U.uCutY.value >= 999 && U.uFront.value.x + U.uFront.value.y + U.uFront.value.z + U.uFront.value.w === 0, 'The close view cuts nothing');
    check(near(camera.fov, 60), 'The close view has the wide lens');
    results.push('close view: no cut, walls up, wide lens');

    // its arm: never in a solid, all around the hero, as long as the zoom says where it is free
    let shortest = Infinity;
    for (let k = 0; k < 16; k++) {
      view.yaw = view.yawTarget = k * Math.PI / 8;
      settleCamera();
      const c = camera.position;
      check(!insideSolid(c.x, c.z, c.y) || c.x < 0 || c.z < 0 || c.x >= 16 || c.z >= 16, `The camera is in a solid at yaw ${k}/16`);
      check(closeArm() <= closeDistance(view.zoom) + 1e-6, 'The arm is never longer than the zoom says');
      shortest = Math.min(shortest, closeArm());
    }
    results.push(`arm out of the solids all around (shortest ${shortest.toFixed(2)})`);

    // the player's bar at the bottom of the screen
    updateCamera(0);
    const { updatePlayerBar } = await import('../../src/render/playerbar.js');
    updatePlayerBar(true);
    const bar = new THREE.Vector3(); let found = null;
    for (const o of (await import('../../src/render/scene.js')).scene.children) {
      if (o.isGroup && o.visible && o.children.length === 3 && Math.abs(o.scale.x - 1) > 1e-3) found = o;
    }
    check(found, 'The player bar is drawn in the close view');
    bar.copy(found.position).project(camera);
    check(bar.y < -0.6 && Math.abs(bar.x) < 0.05, 'The player bar sits at the bottom middle of the screen');
    results.push('player bar at the bottom of the screen');
    return results;
  } finally {
    view.yawTarget = yaw; view.pitch = pitch;
    setCameraMode(mode); settleCamera();
  }
}
