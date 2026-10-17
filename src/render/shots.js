// The player's shots in flight (core/shots.js): arrows and bolts are the item models
// (assets/items/weapon_arrow.glb, weapon_bolt.glb), head first along the flight; a spell is a
// glowing orb in its staff's colour with a light and a sparkling trail. They are drawn from
// the weapon at first and catch up with their true line (shotView).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHAR_SCALE } from '../core/constants.js';
import { shotView } from '../core/shots.js';
import { scene } from './scene.js';
import { glow, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';

const MODELS = { arrow: 'assets/items/weapon_arrow.glb', bolt: 'assets/items/weapon_bolt.glb' };
const LENGTH = { arrow: 0.86, bolt: 0.56 };   // nock to head, rig units
const protos = {};
const loader = new GLTFLoader();
for (const [kind, url] of Object.entries(MODELS))
  protos[kind] = loader.loadAsync(url).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.sharedGeo = true; } });
    return g.scene;
  }).catch(e => { console.error('shot model failed to load', url, e); return null; });
const ready = {};
for (const kind in protos) protos[kind].then(m => { ready[kind] = m; });

const orbGeometry = new THREE.IcosahedronGeometry(0.075, 1), haloGeometry = new THREE.IcosahedronGeometry(0.13, 1);
const ahead = new THREE.Vector3();

function makeView(shot) {
  const group = new THREE.Group(), v = { group, light: null, owned: [], kind: shot.kind };
  if (shot.kind === 'spell') {
    const color = new THREE.Color(shot.stats.color ?? '#c48cff');
    const core = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').lerp(color, 0.35) });
    const halo = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    group.add(new THREE.Mesh(orbGeometry, core), new THREE.Mesh(haloGeometry, halo));
    v.owned.push(core, halo);
    v.light = new THREE.PointLight(color, 2.2, 3, 2);
    trackLight(v.light, group, group, 2);   // a pool light source, not in the scene (render/lightpool.js)
    v.trail = [shot.stats.color ?? '#c48cff', '#ffffff'];
  } else {
    // the model's +Y (nock to head) along the group's +Z (the flight), its head on the shot
    const src = ready[shot.kind];
    if (src) {
      const m = src.clone();
      m.rotation.x = Math.PI / 2;
      m.scale.setScalar(CHAR_SCALE);
      m.position.z = -LENGTH[shot.kind] * CHAR_SCALE;
      group.add(m);
    }
  }
  scene.add(group);
  return v;
}

export function drawShots(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const shot of list) {
    const v = shot.view || (shot.view = makeView(shot)), g = v.group, [x, y, z] = shotView(shot);
    g.position.set(x + off.x, y + off.y, z + off.z);
    g.lookAt(ahead.set(shot.vx, shot.vy, shot.vz).add(g.position));
    if (shot.kind !== 'spell') continue;
    g.scale.setScalar(1 + 0.12 * Math.sin(shot.t * 37));
    v.light.intensity = 2.2 * (0.85 + 0.15 * Math.sin(shot.t * 23));
    const n = Math.floor(70 * dt + Math.random());
    for (let i = 0; i < n; i++)
      emit(glow, g.position.x + rand(-0.05, 0.05), g.position.y + rand(-0.05, 0.05), g.position.z + rand(-0.05, 0.05), {
        v: [-shot.vx * 0.1 + rand(-0.3, 0.3), rand(-0.1, 0.4), -shot.vz * 0.1 + rand(-0.3, 0.3)], life: rand(0.2, 0.4),
        size: rand(0.05, 0.11), color: v.trail[i % 2], drag: 2 });
  }
}
export function removeShotViews(list) {
  for (const shot of list) if (shot.view) {
    scene.remove(shot.view.group);
    if (shot.view.light) untrackLight(shot.view.light);
    shot.view.owned.forEach(m => m.dispose());
    shot.view = null;
  }
}
// the models, loaded (browser checks wait for them)
export const shotModelsReady = () => Promise.all(Object.values(protos));
