// Treasure chests (assets/items/treasure_chest.glb): an empty planked box with its lid on a
// hinge, and the lid's Open and Close clips. A reward site's chest is placed like any prop
// (cubegen/sites.js), but each one is its own object rather than an instance, so its lid can
// move. Opening one (game/chests.js) plays Open; cubes built later show it open right away
// (render/world.js). The loot spills out in front (game/loot.js); the model's
// `contents_gltf` extra marks its floor, for putting things inside later.
import * as THREE from 'three';
import { cutMaterial } from './section.js';

export const CHEST = 'treasure_chest';
// the placement of a chest as it stands once opened
export const openedChest = q => q.name === CHEST ? { ...q, open: true } : q;

const playing = new Set();   // mixers with a clip running

// p: the chest's catalog entry (render/props.js keeps its glTF root and clips); list: its
// placements in this cube. The chests share their materials, cloned per cube like other props.
export function buildChests(p, list, group) {
  const materials = new Map();
  const material = m => materials.get(m) ?? materials.set(m, cutMaterial(m.clone(), 'self', true)).get(m);
  for (const q of list) {
    const chest = p.template.clone();
    chest.traverse(o => {
      if (!o.isMesh) return;
      o.material = material(o.material);
      o.userData.sharedGeo = true;   // the catalog owns the geometry
      o.castShadow = o.receiveShadow = true;
    });
    chest.position.set(q.x, q.y, q.z);
    chest.rotation.y = q.yaw;
    chest.scale.setScalar(q.s);
    chest.userData.chest = { site: q.site, mixer: new THREE.AnimationMixer(chest), clips: p.clips };
    chest.userData.chest.mixer.addEventListener('finished', e => playing.delete(e.target));
    if (q.open) play(chest, 'Open', true);
    group.add(chest);
  }
}

// clip: 'Open' | 'Close'; instant: jump to its last frame. The clip's length in seconds.
function play(chest, clip, instant = false) {
  const { mixer, clips } = chest.userData.chest;
  const c = THREE.AnimationClip.findByName(clips, clip);
  if (!c) return 0;
  mixer.stopAllAction();
  const action = mixer.clipAction(c);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  if (instant) mixer.update(c.duration);
  else playing.add(mixer);
  return instant ? 0 : c.duration;
}

export const chestAt = (world, siteId) => world?.group.children.find(o => o.userData.chest?.site === siteId) ?? null;
// how long until the clip has played out (0: no such chest)
export function animateChest(world, siteId, clip) {
  const chest = chestAt(world, siteId);
  return chest ? play(chest, clip) : 0;
}
export const showChestOpen = (world, siteId) => animateChest(world, siteId, 'Open');

// render/world.js animateWorld, every frame
export function tickChests(dt) {
  for (const mixer of playing) mixer.update(dt);
}
