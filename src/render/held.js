// What the weapon in hand does while you attack with it, on top of the player's clips:
//   bow:      its string is drawn by the right fist from the moment that takes it until the
//             arrow goes; a nocked arrow lies on the bow meanwhile
//   crossbow: the string sits in the nut and a bolt lies on top while it is loaded
//             (core/combat.js crossbowLoaded); after a shot the string is forward and the
//             groove empty until the reload
//   staff:    its stone glows in the spell's colour, brighter as the spell gathers
// The strings are drawn here (the GLB's own string part, as found, is hidden). Item extras
// (blender/items.py) say where the strings run.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { clamp } from '../core/util.js';
import { ITEMS } from '../core/items.js';
import { crossbowLoaded, swingClipTime, swingClipFrom, SHOOT_CLIP } from '../core/combat.js';
import { glow, emit, rand } from './particles.js';

const stringMaterial = new THREE.MeshStandardMaterial({ color: 0xefe6c8, roughness: 0.8 });
const stringGeometry = new THREE.CylinderGeometry(0.009, 0.009, 1, 4, 1).translate(0, 0.5, 0);
let arrowModel = null;
loadGLB('assets/items/weapon_arrow.glb').then(g => { arrowModel = g.scene; })
  .catch(e => console.error('arrow model failed to load', e));

const Y = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const vec = a => new THREE.Vector3(...a);

// a string segment from a to b (the item's space)
function segment(mesh, a, b) {
  _d.subVectors(b, a);
  const l = _d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(Y, _d.divideScalar(l || 1));
  mesh.scale.set(1, l || 1e-4, 1);
}

// the held weapon's details, made once per weapon model; `item`: the GLB node with the extras
export function prepareHeld(weapon, item) {
  if (weapon.userData.held) return weapon.userData.held;
  const d = item?.userData ?? {}, h = { kind: d.weapon ?? 'sword', item, glow: 0 };
  const part = suffix => item?.children.find(c => c.name.endsWith(suffix));
  if (h.kind === 'bow' || h.kind === 'crossbow') {
    const own = part('_string');
    if (own) own.visible = false;
    h.tips = [vec(d.string_tip_gltf), vec(d.string_tip_gltf)];
    if (h.kind === 'bow') h.tips[1].y *= -1; else h.tips[1].x *= -1;
    h.rest = vec(h.kind === 'bow' ? d.nock_gltf : d.string_rest_gltf);
    h.latch = h.kind === 'crossbow' ? vec(d.string_latch_gltf) : null;
    h.strings = h.tips.map(() => new THREE.Mesh(stringGeometry, stringMaterial));
    for (const s of h.strings) { s.castShadow = true; item.add(s); }
    h.nock = h.rest.clone();
  }
  if (h.kind === 'crossbow') h.bolt = part('_bolt');
  if (h.kind === 'staff') {
    h.color = new THREE.Color(ITEMS[item.name]?.weapon?.color ?? '#c48cff');
    h.head = vec(d.head_gltf ?? [0, 1.2, 0]);
    h.stones = [];
    item?.traverse(o => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map(m => {
        if (!/Facets/.test(m.name)) return m;
        m = m.clone(); h.stones.push(m);
        return m;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
  }
  weapon.userData.held = h;
  return h;
}

// pose the details for player p (its attack in p.sword) with the fists where the animator put
// them; `hands`: { L, R } bones
export function updateHeld(h, p, hands, dt) {
  if (!h) return;
  const s = p.sword, mine = s.stats?.kind === h.kind;
  if (h.kind === 'bow') {
    const clip = mine && s.active ? swingClipTime(s.stats, s.t, swingClipFrom(s)) : 0;
    // drawn from when the right fist takes the string until the arrow goes
    const drawn = mine && s.active && !s.fired && clip >= SHOOT_CLIP.redraw * 0.9;
    if (drawn) h.item.worldToLocal(hands.R.getWorldPosition(h.nock));
    else h.nock.lerp(h.rest, Math.min(1, dt * 40));   // snaps back, quivering a moment
    if (drawn && !h.arrow && arrowModel) { h.arrow = arrowModel.clone(); h.item.add(h.arrow); }
    if (h.arrow) {
      h.arrow.visible = drawn;
      // nock on the string, resting on the bow hand just above the grip
      h.arrow.position.copy(h.nock);
      h.arrow.quaternion.setFromUnitVectors(Y, _a.set(0, 0.035, 0).sub(h.nock).normalize());
    }
  }
  if (h.kind === 'crossbow') {
    const loaded = crossbowLoaded(p);
    if (h.bolt) h.bolt.visible = loaded;
    h.nock.copy(loaded ? h.latch : h.rest);
  }
  if (h.strings) for (let i = 0; i < 2; i++) segment(h.strings[i], h.tips[i], h.nock);
  if (h.kind === 'staff') {
    // gathering until the spell goes, then fading
    const gather = mine && s.active && !s.fired ? clamp(s.t / s.stats.activeStart, 0, 1) : 0;
    h.glow = gather > h.glow ? gather : Math.max(gather, h.glow - dt * 4);
    for (const m of h.stones) { m.emissive?.copy(h.color); m.emissiveIntensity = 0.25 + 1.6 * h.glow; }
    if (gather > 0.3 && Math.random() < dt * 40) {
      h.item.localToWorld(_b.copy(h.head));
      emit(glow, _b.x + rand(-0.04, 0.04), _b.y + rand(-0.04, 0.04), _b.z + rand(-0.04, 0.04), {
        v: [rand(-0.3, 0.3), rand(0.1, 0.5), rand(-0.3, 0.3)], life: rand(0.2, 0.35), size: rand(0.05, 0.1),
        color: '#' + h.color.getHexString(), drag: 3 });
    }
  }
}
