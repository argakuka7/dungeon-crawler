// Items as their 3D models in the DOM (the inventory, game/inventory.js; the quick bar,
// game/quickbar.js; and wherever else an item shows: the potions at work, the touch buttons,
// the chat's suggestions, the heroes in the main menu), drawn by a small renderer of its own,
// away from the game's canvas. There are no icon images: every picture is its model's.
//   itemPicture(id)   a picture of the item's model, seen as in blender/items.py's previews,
//                     rendered once when first asked for and kept (until then: an empty image)
//   pictureImg(id)    an <img> of it for HTML, which shows the picture as soon as it is there
//   drawLiveViews     every frame the inventory is open, the views that move, each a <canvas>:
//                     [data-live-item="id"] the item turning (the selected one),
//                     [data-live-hero] the hero as it stands, with the weapon (or the flask) in
//                     its hand and what it wears
// The WebGL canvas is never shown: each picture is copied out of it right after it is drawn.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { ITEMS } from '../core/items.js';
import { rig, createFigure, poseFigure, wear, takeOff, thingLoaded, loadThing, animateWorn } from './figure.js';
import { character, mountWeapon } from './character.js';

const PICTURE = 192;         // px, square: a bag slot (~80 CSS px) on a screen of pixel ratio 2
const SPIN = 0.9;            // rad/s a live item turns
const SWAY = 0.3, SWAY_SPEED = 0.35, FACING = -0.3;   // the hero turns a little to and fro (rad, rad/s) around a three-quarter view
// world units that stay in view around the hero: up and down from its middle (the figure ~1.1,
// a staff over its head), and to each side (a staff or bow held out, turning to and fro)
const HERO_HALF_HEIGHT = 0.8, HERO_HALF_WIDTH = 0.55, HERO_MIDDLE = 0.58, HERO_FOV = 24;
const VIEW = new THREE.Vector3(2, 3, 5).normalize();   // the camera direction of blender/items.py render_previews

let renderer = null;
function gl(w, h) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1);
  }
  // it only grows: each view uses its bottom-left corner
  const s = renderer.getSize(new THREE.Vector2());
  if (s.x < w || s.y < h) renderer.setSize(Math.max(s.x, w, PICTURE), Math.max(s.y, h, PICTURE), false);
  return renderer;
}
// draw scene through cam into the 2D canvas `out` (its whole size)
function paint(out, scene, cam) {
  const w = out.width, h = out.height, r = gl(w, h), H = r.domElement.height;
  r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.setScissorTest(true);
  r.clear();
  r.render(scene, cam);
  const ctx = out.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(r.domElement, 0, H - h, w, h, 0, 0, w, h);   // (in the same task: no preserveDrawingBuffer needed)
}

const scenes = new Map();   // url -> Promise<the GLB's scene | null>
const load = url => {
  if (!scenes.has(url)) scenes.set(url, loadGLB(url).then(g => g.scene)
    .catch(e => { console.error('item model failed to load', url, e); return null; }));
  return scenes.get(url);
};
// what a picture shows: an item's model, or (a tool, which never lies on the floor) its
// `picture` (core/items.js); also the treasure chest (game/action.js)
const OTHERS = { treasure_chest: 'assets/items/treasure_chest.glb' };
const modelUrl = id => ITEMS[id] ? ITEMS[id].model ?? ITEMS[id].picture : OTHERS[id];

// itemId -> { group (centred on its box), half (half the height of a square view that fits it,
// turning too) }; null while loading, false when it cannot be shown
const protos = new Map(), pictures = new Map(), listeners = [];
function proto(itemId) {
  if (protos.has(itemId)) return protos.get(itemId);
  const url = modelUrl(itemId);
  protos.set(itemId, url ? null : false);
  if (url) load(url).then(root => {
    if (!root) { protos.set(itemId, false); return; }
    const model = root.clone(true);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const group = new THREE.Group();
    group.add(model);
    protos.set(itemId, { group, half: 0.6 * Math.max(size.y, Math.hypot(size.x, size.z)) });
    snapshot(itemId);
  });
  return protos.get(itemId);
}

// the items' stage: lit like blender/items.py's previews, from the front left, the right and behind
const stage = new THREE.Scene(), itemCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
itemCam.position.copy(VIEW).multiplyScalar(8);
itemCam.lookAt(0, 0, 0);
{
  const light = (color, power, x, y, z) => { const l = new THREE.DirectionalLight(color, power); l.position.set(x, y, z); return l; };
  stage.add(new THREE.HemisphereLight(0xe8eeff, 0x4a4436, 1.5),
    light(0xfff2e0, 2.2, -3, 10, 5), light(0xe0ecff, 0.9, 7, 8, 1), light(0xcfe0ff, 1.4, 0, 9, -6));
}
// item m into canvas `out`, turned by `yaw`
function paintItem(out, m, yaw) {
  const a = out.width / out.height;
  Object.assign(itemCam, a >= 1 ? { left: -m.half * a, right: m.half * a, top: m.half, bottom: -m.half }
    : { left: -m.half, right: m.half, top: m.half / a, bottom: -m.half / a });
  itemCam.updateProjectionMatrix();
  m.group.rotation.y = yaw;
  stage.add(m.group);
  paint(out, stage, itemCam);
  stage.remove(m.group);
}

function snapshot(itemId) {
  const m = protos.get(itemId), out = document.createElement('canvas');
  out.width = out.height = PICTURE;
  paintItem(out, m, 0);
  pictures.set(itemId, out.toDataURL('image/png'));
  for (const fn of listeners) fn(itemId);
}
const EMPTY = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
// the picture of item `itemId` (a URL): its model's once rendered, an empty image until then
export function itemPicture(itemId) {
  if (!pictures.has(itemId)) proto(itemId);
  return pictures.get(itemId) ?? EMPTY;
}
// the model of itemId can be drawn (live too)
export const itemModelReady = itemId => pictures.has(itemId);
// fn(itemId) whenever another item's picture is ready (to show it instead of the empty image)
export const onItemPictures = fn => { listeners.push(fn); };
// an <img> showing item `itemId`'s picture, now or once it is rendered (an img given the
// attribute data-item-picture by other means gets it too)
export const pictureImg = (itemId, alt = '') => `<img data-item-picture="${itemId}" src="${itemPicture(itemId)}" alt="${alt}">`;
onItemPictures(id => {
  for (const img of document.querySelectorAll(`img[data-item-picture="${id}"]`)) img.src = pictures.get(id);
});

// the hero's stage, lit like the main menu's portrait (render/portrait.js)
const heroStage = new THREE.Scene(), heroCam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
{
  const key = new THREE.DirectionalLight(0xfff0d8, 2), rim = new THREE.DirectionalLight(0x9fc4ff, 1.8);
  key.position.set(2, 3, 3); rim.position.set(-2.5, 1.5, -3);
  heroStage.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3326, 1.2), key, rim);
}
// { f (render/figure.js), tint, url (the weapon wanted), weapon (its model, mounted), kind, worn }
let hero = null;
const weapons = new Map();   // url -> the hand's own copy (shares geometry and materials with the item's)
function heroWeapon(url) {
  if (!weapons.has(url)) weapons.set(url, load(url).then(root => root && root.clone(true)));
  return weapons.get(url);
}
// the hero as the player's character looks (render/character.js): its colour, what it wears,
// and itemId (a weapon, or a flask readied to throw) in its hand
function dressHero(itemId) {
  if (!rig.ready) return null;
  const tint = character.tint ?? null;
  if (hero && hero.tint !== tint) { hero.f.group.removeFromParent(); hero = null; }
  if (!hero) {
    hero = { f: createFigure(tint), tint, url: null, weapon: null, kind: null, worn: '' };
    heroStage.add(hero.f.group);
  }
  const url = itemId ? modelUrl(itemId) : null;
  if (hero.url !== url) {
    const h = hero;
    h.url = url;
    h.weapon?.removeFromParent(); h.weapon = null; h.kind = null;
    pose(h);
    if (url) heroWeapon(url).then(model => {
      if (hero !== h || h.url !== url || !model) return;
      h.kind = mountWeapon(h.f.bones, model)?.userData.weapon ?? null;
      h.weapon = model;
      pose(h);
    });
  }
  // what the character wears (only headwear for now, game/equipment.js devWear)
  const ids = Object.values(character.worn ?? {}).map(w => w.id), key = ids.join(',');
  if (hero.worn !== key) {
    for (const slot of Object.keys(hero.f.worn)) if (!ids.includes(hero.f.worn[slot].id)) takeOff(hero.f, slot);
    let all = true;
    for (const id of ids) {
      if (hero.f.worn[ITEMS[id].slot]?.id === id) continue;
      if (thingLoaded(id)) wear(hero.f, id);
      else { all = false; loadThing(id).catch(e => console.error('outfit failed to load', e)); }
    }
    if (all) { hero.worn = key; pose(hero); }   // (else again once loaded)
  }
  return hero;
}
// standing; the arm that carries a bow, crossbow or staff in its Hold pose (render/animator.js)
function pose(h) {
  poseFigure(h.f);
  for (const [bone, q] of character.holds?.[h.kind] ?? []) h.f.nodes[bone.name]?.quaternion.copy(q);
}

// a live canvas as big as it is shown (null: not shown)
function fit(c) {
  const k = Math.min(devicePixelRatio, 2), w = Math.round(c.clientWidth * k), h = Math.round(c.clientHeight * k);
  if (w < 2 || h < 2) return null;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

// main.js, every frame the inventory is open: the live views inside `root`; `hand`: the item id
// in the hero's hand (or null); time: s, for the turning
export function drawLiveViews(root, hand, time) {
  for (const c of root.querySelectorAll('canvas[data-live-item]')) {
    const m = protos.get(c.dataset.liveItem);
    if (m && fit(c)) paintItem(c, m, time * SPIN);
  }
  for (const c of root.querySelectorAll('canvas[data-live-hero]')) {
    const f = dressHero(hand);
    if (!f || !fit(c)) continue;
    f.f.group.rotation.y = FACING + Math.sin(time * SWAY_SPEED) * SWAY;
    animateWorn(f.f, time);
    heroCam.aspect = c.width / c.height;
    heroCam.fov = HERO_FOV;
    heroCam.updateProjectionMatrix();
    // far enough that the hero fits both ways, however narrow or wide the box
    const t = Math.tan(HERO_FOV * Math.PI / 360), d = Math.max(HERO_HALF_HEIGHT / t, HERO_HALF_WIDTH / (t * heroCam.aspect));
    heroCam.position.set(0, HERO_MIDDLE + 0.12, d);
    heroCam.lookAt(0, HERO_MIDDLE, 0);
    paint(c, heroStage, heroCam);
  }
}
