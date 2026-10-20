// The chosen hero in the main menu (game/menu.js): the player's own figure, with the weapon in
// its hand, standing in a little scene of its own and drawn over the cube behind the menu, into
// a box the menu gives (heroBox). Only one figure is ever made (render/character.js): while the
// menu shows the hero, the figure moves into this scene, and back into the world's after.
//
// The hero stays parked far away where the showcase put it (game/showcase.js): the camera and
// the lights here go where the figure is.
import * as THREE from 'three';
import { renderer, scene } from './scene.js';
import { character } from './character.js';

const HEIGHT = 1.55;   // world units in view, top to bottom: the figure (~1.1) with room for a staff or bow
const portrait = new THREE.Scene();
portrait.fog = scene.fog;   // the same fog (far away): the figure's materials need no other shaders
const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3326, 1.1);
const key = new THREE.DirectionalLight(0xfff0d8, 2), rim = new THREE.DirectionalLight(0x9fc4ff, 1.8);
// (the hero's own light stays in the world, render/character.js: one of its own here)
// (over the hero and towards the camera, like the world's: in the body it lights nothing of it)
const own = new THREE.PointLight(0xffd9a0, 2.1, 4.5, 2);
portrait.add(hemi, key, key.target, rim, rim.target, own);
const centre = new THREE.Vector3(), size = new THREE.Vector2();

// wanted: the menu shows a hero; on: the figure is here (once it is loaded)
let wanted = false, on = false;
export function showPortrait(show) { wanted = show; attach(); }
function attach() {
  if (!character.ready || wanted === on) return;
  on = wanted;
  (on ? portrait : scene).add(character.group);
  character.group.visible = on;
}
export const portraitShown = () => on;

// main.js menuFrame, after the world is drawn: the figure into `box` (CSS pixels of the window:
// left, top, width, height); null: not now
export function drawPortrait(box) {
  attach();
  if (!on || !box || box.width < 8 || box.height < 8) return;
  const g = character.group.position;
  centre.set(g.x, g.y + HEIGHT * 0.42, g.z);
  cam.aspect = box.width / box.height;
  cam.updateProjectionMatrix();
  const d = HEIGHT / 2 / Math.tan(cam.fov * Math.PI / 360);
  cam.position.set(centre.x, centre.y + 0.15, centre.z + d);
  cam.lookAt(centre);
  key.position.set(centre.x + 2, centre.y + 3, centre.z + 3); key.target.position.copy(centre);
  rim.position.set(centre.x - 2.5, centre.y + 1.5, centre.z - 3); rim.target.position.copy(centre);
  own.position.set(g.x, g.y + 2.3, g.z + 0.55);   // (the camera looks along -z)

  renderer.getSize(size);
  const y = size.y - box.top - box.height, auto = renderer.autoClear;
  renderer.setScissorTest(true);
  renderer.setViewport(box.left, y, box.width, box.height);
  renderer.setScissor(box.left, y, box.width, box.height);
  renderer.autoClear = false;
  renderer.clearDepth();   // (the world stays: the figure stands in front of it)
  renderer.render(portrait, cam);
  renderer.autoClear = auto;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, size.x, size.y);
}
