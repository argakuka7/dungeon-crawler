// The human figure (assets/character.glb, blender/character.py), shared by the player
// (render/character.js) and the villagers (render/villagers.js), and the things a figure wears
// and holds (core/items.js WEARABLES).
//
// A figure is { group, model, bones, nodes, worn }: `bones` by their Blender names ("hand.R"),
// `nodes` by their node names in the clips ("handR"), `worn` what it has on, by slot. Anything
// with `bones` and `worn` can wear things, the player's character too.
//
// A worn or held thing's model says in its extras which bone it sits on (`socket`), how
// (`mount_quat_gltf`, `mount_offset_gltf`, from the bone's root in rig units), which still clip
// holds the arm that carries it (`hold`: the character's Hold<Name> clip) and whether it floats
// over the hand (`float`, the crystal ball, which bobs and turns there).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHAR_SCALE } from '../core/constants.js';
import { ITEMS, outfitOf } from '../core/items.js';
import { cloneSkinned, cullBySphere, ownShadowDepth } from './skinned.js';

const URL = 'assets/character.glb';
const sanitize = name => THREE.PropertyBinding.sanitizeNodeName(name);

// source: an untouched copy of the rig to clone figures from; stand: the standing pose (the
// first frame of Jump) as [node name, quaternion, position?]; holds: per hold name, the arm
// bones of its clip as [node name, quaternion]
export const rig = { ready: false };

// one frame of a clip as [node name, quaternion, position | null] per bone
function frameOf(clip, i = 0) {
  const pose = new Map();
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    const at = pose.get(node) ?? pose.set(node, [node, null, null]).get(node);
    if (prop === 'quaternion') at[1] = new THREE.Quaternion().fromArray(t.values, i * 4);
    if (prop === 'position') at[2] = new THREE.Vector3().fromArray(t.values, i * 3);
  }
  return [...pose.values()].filter(p => p[1]);
}

export const rigReady = new GLTFLoader().loadAsync(URL).then(gltf => {
  const extras = name => gltf.parser.json.animations.find(a => a.name === name)?.extras || {};
  const holds = {};
  for (const clip of gltf.animations) {
    const e = extras(clip.name);
    if (!e.hold) continue;
    const arm = new Set(e.arm_bones.split(',').map(sanitize));
    holds[e.hold] = frameOf(clip).filter(([node]) => arm.has(node)).map(([node, q]) => [node, q]);
  }
  const jump = gltf.animations.find(c => c.name === 'Jump');
  // the figures' copy is taken before the player's setup changes the scene (render/character.js)
  Object.assign(rig, { ready: true, source: cloneSkinned(gltf.scene), stand: frameOf(jump), holds });
  return gltf;
});
rigReady.catch(e => console.error('character failed to load', e));

const bonesOf = model => {
  const bones = {}, nodes = {};
  model.traverse(o => { if (o.isBone) { bones[o.userData.name || o.name] = o; nodes[o.name] = o; } });
  return { bones, nodes };
};

// a new figure, its clay in `color` (default: as exported); stands in the standing pose
export function createFigure(color = null) {
  const model = cloneSkinned(rig.source);
  model.scale.setScalar(CHAR_SCALE);
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (color) o.material.color.set(color);
    o.material.forceSinglePass = true;   // solid: one pass even when transparent (render/character.js)
    o.castShadow = true;
    if (o.isSkinnedMesh) cullBySphere(o); else o.frustumCulled = false;
    o.userData.sharedGeo = true;   // the rig owns the geometry
  });
  ownShadowDepth(model);
  const group = new THREE.Group();
  group.add(model);
  const f = { group, model, ...bonesOf(model), worn: {} };
  poseFigure(f);
  return f;
}

// the standing pose, the arms that carry something in their hold pose
export function poseFigure(f) {
  for (const [node, q, p] of rig.stand) {
    const b = f.nodes[node];
    if (!b) continue;
    b.quaternion.copy(q);
    if (p) b.position.copy(p);
  }
  for (const w of Object.values(f.worn)) if (w.hold) for (const [node, q] of rig.holds[w.hold] ?? []) f.nodes[node]?.quaternion.copy(q);
}

// The worn and held things' models, loaded once (by item id); wear() needs them loaded.
const things = new Map(), loading = new Map();
export function loadThing(id) {
  const def = ITEMS[id];
  if (!def?.slot) return Promise.reject(new TypeError(`Not a wearable item: ${id}`));
  if (!loading.has(id)) loading.set(id, new GLTFLoader().loadAsync(def.model).then(g => { things.set(id, g.scene); return g.scene; })
    .catch(error => { loading.delete(id); throw error; }));
  return loading.get(id);
}
export const thingLoaded = id => things.has(id);

// Put item `id` on figure f (in its slot, replacing what was there). false: not loaded yet.
// Each copy has its own materials (a cube's fade changes them, render/fade.js).
export function wear(f, id) {
  const def = ITEMS[id], template = things.get(id);
  if (!def?.slot || !template) return false;
  takeOff(f, def.slot);
  const object = template.clone(true);
  let node = null;
  object.traverse(o => { if (!node && o.userData.socket) node = o; });
  const d = node?.userData ?? {}, glowing = [];
  object.traverse(o => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map(m => {
      m = m.clone();
      // the gem-like part (the glTF material Items_Facets) shines in the item's glow colour
      if (def.glow && /Facets/.test(m.name)) { m.emissive.set(def.glow); m.emissiveIntensity = .6; glowing.push(m); }
      return m;
    });
    if (o.material.length === 1) o.material = o.material[0];
    o.castShadow = true; o.frustumCulled = false;
    o.userData.sharedGeo = true;   // the template owns the geometry
  });
  f.bones[d.socket ?? 'hand.R'].add(object);
  object.position.fromArray(d.mount_offset_gltf ?? [0, 0, 0]);
  object.quaternion.fromArray(d.mount_quat_gltf ?? [0, 0, 0, 1]);
  f.worn[def.slot] = { id, object, hold: d.hold ?? null, float: d.float ?? 0, glowing,
    at: object.position.clone(), mount: object.quaternion.clone() };
  return true;
}

export function takeOff(f, slot) {
  const w = f.worn[slot];
  if (!w) return;
  w.object.removeFromParent();
  w.object.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => m.dispose()); });
  delete f.worn[slot];
}

// wear all of `ids` (one per slot, core/items.js outfitOf)
export function dress(f, ids) {
  for (const id of Object.values(outfitOf(ids))) wear(f, id);
}

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(), _spin = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
// floating things bob over the hand and turn slowly; glowing ones pulse. After the pose.
export function animateWorn(f, time, phase = 0) {
  for (const w of Object.values(f.worn)) {
    const t = time + phase;
    if (w.float) {
      // up in the socket bone's frame, whatever way the hand is turned
      w.object.parent.getWorldQuaternion(_q).invert();
      _up.copy(Y).applyQuaternion(_q);
      w.object.position.copy(w.at).addScaledVector(_up, Math.sin(t * 2.1) * .04);
      w.object.quaternion.copy(w.mount).multiply(_spin.setFromAxisAngle(Y, t * .8));
    }
    for (const m of w.glowing) m.emissiveIntensity = .55 + .25 * Math.sin(t * 2.7);
  }
}
