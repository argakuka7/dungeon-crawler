// The player's health, experience and level, floating over the character like the enemies'
// bars. Drawn over the world (no depth test) so terrain never hides them.
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { character } from './character.js';
import { makeBar, makeLevelLabel, makeNote } from './bars.js';
import { helperName } from '../game/downed.js';
import { REVIVE_TIME, BLEED_OUT } from '../core/downed.js';
import { player } from '../game/state.js';
import { xpProgress } from '../core/progression.js';
import { CHAR_H } from '../core/constants.js';

const group = new THREE.Group();
const hp = makeBar({ color: 0xe0584c, onTop: true });
const xp = makeBar({ w: 0.66, h: 0.04, color: 0x83b887, onTop: true });
const label = makeLevelLabel(player.level, { onTop: true });
hp.group.position.y = 0.04; xp.group.position.y = -0.04;
const bars = new THREE.Group();
bars.add(hp.group, xp.group);
label.position.y = 0.2;
// lying downed, playing together (game/downed.js): who can help and how long is left
const note = makeNote();
note.position.y = 0.42;
group.add(bars, label, note);
group.visible = false;
scene.add(group);

// In the close view (game/camera.js) over the hero they would cover the middle of the screen:
// they sit at the bottom instead, over the quick bar, a step in front of the camera.
const SCREEN_Y = -0.71, AHEAD = 1, SIZE = 0.42;   // height on screen (-1..1), units, per screen height
const fwd = new THREE.Vector3(), up = new THREE.Vector3();
function onScreen() {
  const h = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * AHEAD;
  camera.getWorldDirection(fwd);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  group.position.copy(camera.position).addScaledVector(fwd, AHEAD).addScaledVector(up, SCREEN_Y * h);
  group.scale.setScalar(h * SIZE);
}

// after the camera moved, so the bars face it this frame; close: the close view
export function updatePlayerBar(close = false) {
  group.visible = character.ready && character.group.visible;   // (not in the main menu)
  if (!group.visible) return;
  if (close) onScreen();
  else { group.position.set(player.x, player.visY + CHAR_H + 0.4, player.z); group.scale.setScalar(1); }
  bars.quaternion.copy(camera.quaternion);
  hp.set(player.hp / player.maxHp);
  const p = xpProgress(player);
  xp.set(p.current / p.required);
  label.setLevel(player.level);
  const d = player.down;
  note.setText(!d ? null : d.revive > 0 ? `${d.by ?? 'A friend'} is helping you up ${Math.round(100 * d.revive / REVIVE_TIME)}%`
    : `Down! ${helperName()} can help you up · ${Math.ceil(BLEED_OUT - d.t)}s · R: give up`, d?.revive > 0 ? '#9be05a' : '#ff9a8a');
}
