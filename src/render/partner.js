// The other players when playing together (src/net/session.js): each a figure like the
// villagers (render/figure.js), tinted in their colour (net/online.js PLAYER_COLORS), posed
// bone by bone as their game posed its character,
// holding their weapon, wearing what they wear, with a silhouette where terrain hides them, a
// small light, and their name, level and health over the head. capturePose() is the other
// half: our own character's pose, to send.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHAR_H } from '../core/constants.js';
import { ITEMS } from '../core/items.js';
import { BONES, Q, packPose } from '../net/protocol.js';
import { lerpAngle } from '../net/sync.js';
import { scene, camera } from './scene.js';
import { character, mountWeapon } from './character.js';
import { rig, createFigure, loadThing, thingLoaded, wear, takeOff } from './figure.js';
import { trackLight, untrackLight } from './lightpool.js';
import { makeBar, makeLevelLabel, makeNote } from './bars.js';
import { playerColor } from '../net/online.js';

// a player's colour, lighter (towards white by `k`)
const shade = (slot, k) => new THREE.Color(playerColor(slot)).lerp(new THREE.Color(0xffffff), k);
// the clay of player `slot`'s hero: theirs here, ours on our own hero (render/character.js
// tintCharacter), so everyone looks the same on every screen
export const playerTint = slot => '#' + shade(slot, 0.45).getHexString();
const SNAP = 2;   // cells: a jump further than this between two messages is not blended

// our own character as a pose (protocol.js packPose), null before it loaded
export function capturePose() {
  if (!character.ready) return null;
  const g = character.group, b = character.bones, quats = [];
  for (const n of BONES) quats.push(...b[n].quaternion.toArray());
  return packPose(g.position.toArray(), g.rotation.y, b.hips.position.toArray(), quats);
}

// what our character holds and wears, for the other side to show
export function capturedLook() {
  return { armed: !!character.sword?.visible,
    worn: Object.values(character.worn ?? {}).map(w => w.id) };
}

// slot -> { f, group, ghost, light, tag, bars, hp, label, note, name, weapon: { url, object, want }, worn }
const figs = new Map();

function build(slot, name) {
  const f = createFigure(playerTint(slot)), group = f.group;
  let mesh = null;
  f.model.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  // silhouette where terrain hides them, like our own (render/character.js)
  const ghost = new THREE.SkinnedMesh(mesh.geometry, new THREE.MeshBasicMaterial({
    color: shade(slot, 0.5), transparent: true, opacity: 0.4, depthFunc: THREE.GreaterDepth, depthWrite: false }));
  ghost.bind(mesh.skeleton, mesh.bindMatrix);
  ghost.renderOrder = 999; ghost.boundingSphere = mesh.boundingSphere;   // culled with the body
  ghost.userData.sharedGeo = true;
  mesh.parent.add(ghost);
  mesh.material.transparent = true;
  mesh.material.forceSinglePass = true;   // a solid body (render/character.js)
  mesh.renderOrder = 1000;
  const light = new THREE.PointLight(shade(slot, 0.65), 0.8, 3, 2);
  light.position.y = 0.9;
  trackLight(light, group, group, 2);   // a pool light source, not in the scene (render/lightpool.js)
  // name, level and health, over the world like our own (render/playerbar.js)
  const tag = new THREE.Group(), bars = new THREE.Group(), hp = makeBar({ color: shade(slot, 0).getHex(), onTop: true });
  const label = makeLevelLabel(1, { onTop: true, color: '#' + shade(slot, 0.7).getHexString(), title: name });
  label.position.y = 0.16;
  const note = makeNote();
  note.position.y = 0.36;
  bars.add(hp.group);
  tag.add(bars, label, note);
  scene.add(group, tag);
  group.visible = tag.visible = false;
  return { f, group, ghost, light, tag, bars, hp, label, note, name, weapon: { url: null, object: null, want: null }, worn: '' };
}

// player `slot` went (undefined: all of them)
export function removePartner(slot) {
  if (slot === undefined) { for (const s of [...figs.keys()]) removePartner(s); return; }
  const fig = figs.get(slot);
  if (!fig) return;
  fig.group.removeFromParent(); fig.tag.removeFromParent();
  untrackLight(fig.light);
  figs.delete(slot);
}

// Weapons come in their own copy: the player's own models are changed for the hand they are in
// (render/held.js), so each url is loaded again here, once.
const loader = new GLTFLoader(), weapons = new Map();
function weaponModel(url) {
  if (!weapons.has(url)) weapons.set(url, loader.loadAsync(url).then(g => g.scene)
    .catch(e => { weapons.delete(url); console.error('partner weapon failed to load', e); return null; }));
  return weapons.get(url);
}
function setWeapon(fig, url) {
  const w = fig.weapon;
  if (w.want === url) return;
  w.want = url;
  if (w.object) { w.object.removeFromParent(); w.object = null; w.url = null; }
  if (!url) return;
  const f = fig;
  weaponModel(url).then(model => {
    if (figs.get(f.slot) !== f || w.want !== url || !model) return;
    model.removeFromParent();
    mountWeapon(f.f.bones, model);
    w.object = model; w.url = url;
  });
}
function setWorn(fig, ids) {
  const key = ids.join(',');
  if (fig.worn === key) return;
  for (const slot of Object.keys(fig.f.worn)) if (!ids.includes(fig.f.worn[slot].id)) takeOff(fig.f, slot);
  let all = true;
  for (const id of ids) {
    if (!ITEMS[id]?.slot || fig.f.worn[ITEMS[id].slot]?.id === id) continue;
    if (thingLoaded(id)) wear(fig.f, id);
    else { all = false; loadThing(id).catch(e => console.error('partner outfit failed to load', e)); }
  }
  if (all) fig.worn = key;   // else: again next time, once loaded
}

const qa = [], qb = [], _q = new THREE.Quaternion();
// show player `slot` between messages a and b (k of the way, src/net/sync.js Timeline.at), or
// hide them (null)
export function showPartner(slot, span, name) {
  let fig = figs.get(slot);
  if (!span) { if (fig) fig.group.visible = fig.tag.visible = false; return; }
  if (!rig.ready) return;
  if (fig && fig.name !== name) { removePartner(slot); fig = null; }
  if (!fig) { fig = build(slot, name); fig.slot = slot; figs.set(slot, fig); }
  let { a, b, k } = span;
  if (a.cube !== b.cube || Math.hypot(...a.pose.p.map((x, i) => x - b.pose.p[i])) > SNAP) { a = b; k = 0; }
  k = Math.min(1, Math.max(0, k));
  const A = a.pose, B = b.pose, mix = (x, y) => x + (y - x) * k;
  fig.group.position.set(mix(A.p[0], B.p[0]), mix(A.p[1], B.p[1]), mix(A.p[2], B.p[2]));
  fig.group.rotation.y = lerpAngle(A.yaw, B.yaw, k);
  const bones = fig.f.bones;
  bones.hips.position.set(mix(A.hips[0], B.hips[0]), mix(A.hips[1], B.hips[1]), mix(A.hips[2], B.hips[2]));
  BONES.forEach((n, i) => {
    for (let j = 0; j < 4; j++) { qa[j] = A.q[i * 4 + j] / Q; qb[j] = B.q[i * 4 + j] / Q; }
    const q = bones[n].quaternion;
    q.fromArray(qa).normalize();
    if (k > 0) q.slerp(_q.fromArray(qb).normalize(), k);
  });
  setWeapon(fig, typeof b.weapon === 'string' ? b.weapon : null);
  if (fig.weapon.object) fig.weapon.object.visible = b.armed !== false;
  setWorn(fig, Array.isArray(b.worn) ? b.worn.filter(id => typeof id === 'string') : []);
  fig.group.visible = fig.tag.visible = true;
  // the tag: over the head, facing the camera
  fig.tag.position.set(fig.group.position.x, fig.group.position.y + CHAR_H + 0.4, fig.group.position.z);
  fig.bars.quaternion.copy(camera.quaternion);
  fig.hp.set(b.hp / (b.maxHp || 1));
  fig.label.setLevel(Number.isFinite(b.level) ? b.level : 1);
}

// where player `slot` is drawn (null: not shown)
export const partnerAt = slot => { const f = figs.get(slot); return f?.group.visible ? f.group.position : null; };

// over player `slot` while they lie downed (game/downed.js): ko [helped up %, s left], or null
export function showHelp(slot, ko, name) {
  const fig = figs.get(slot);
  if (!fig) return;
  if (!ko) { fig.note.setText(null); return; }
  fig.note.setText(ko[0] > 0 ? `Helping ${name} up ${ko[0]}%` : `${name} is down! Stand next to them`, ko[0] > 0 ? '#9be05a' : '#ff9a8a');
}
