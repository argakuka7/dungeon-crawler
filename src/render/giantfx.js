// What a giant (Squarlo grown, game/squarlo.js) does to the world, drawn: the shockwave of a stomp
// or a landing (game/quakes.js) and his water cannon's jet (game/gusts.js, a gust of kind
// 'cannon').
// A shockwave is a ring of churned-up dust running out over the floor from where he struck, its
// front a bright edge that fades as it spends itself, throwing dust and grit up as it goes.
// The water cannon is a thick, wobbling jet arching from his hands down onto the floor ahead,
// a pale core in a sheath of spray, where it lands a fan of spray thrown up; it is drawn while
// the gust blows (cannonJet every frame) and fades as soon as it stops.
import * as THREE from 'three';
import { scene } from './scene.js';
import { soft, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';

const ring = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), band = new THREE.RingGeometry(0.55, 1, 64).rotateX(-Math.PI / 2);
const DUST = ['#d9cfbb', '#c4b89c', '#efe8d8'], SPRAY = ['#f2fcff', '#bfeeff', '#8fd8f0'];

// --- shockwaves -----------------------------------------------------------------------------
function makeWave() {
  const plain = { transparent: true, depthWrite: false, side: THREE.DoubleSide };
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#fffaf0', opacity: 0.8, ...plain });
  const dustMat = new THREE.MeshBasicMaterial({ color: '#cbbf9f', opacity: 0.45, ...plain });
  const edge = new THREE.Mesh(ring, edgeMat), dust = new THREE.Mesh(band, dustMat);
  edge.renderOrder = dust.renderOrder = 2;
  const group = new THREE.Group();
  group.add(dust, edge); scene.add(group);
  return { group, edge, dust, owned: [edgeMat, dustMat] };
}
// w: { x, y, z, view }, r: its radius now, k: how far it has run (0..1)
export function drawWave(w, r, k, dt, off) {
  const v = w.view ??= makeWave(), fade = 1 - k;
  r = Math.max(0.05, r);
  v.group.position.set(w.x + off.x, w.y + off.y + 0.04, w.z + off.z);
  v.edge.scale.setScalar(r);
  v.dust.scale.setScalar(Math.max(0.05, r));
  v.owned[0].opacity = 0.85 * fade;
  v.owned[1].opacity = 0.4 * fade * fade;
  // dust and grit thrown up along the front
  for (let n = Math.floor(r * 22 * fade * dt + Math.random()); n > 0; n--) {
    const a = rand(0, Math.PI * 2), x = w.x + off.x + Math.cos(a) * r, z = w.z + off.z + Math.sin(a) * r;
    emit(soft, x, w.y + off.y + 0.08, z, { v: [Math.cos(a) * rand(1, 2.5), rand(0.6, 2), Math.sin(a) * rand(1, 2.5)], life: rand(0.4, 0.7),
      size: rand(0.18, 0.34), grow: 1.4, color: DUST[n % 3], alpha: 0.55 * fade, drag: 2.5, gravity: 1.5 });
  }
}
export function removeWave(w) {
  if (!w.view) return;
  scene.remove(w.view.group);
  w.view.owned.forEach(m => m.dispose());
  w.view = null;
}

// --- the water cannon -----------------------------------------------------------------------
const tube = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);   // +Y, 0 to 1
const SEGMENTS = 12, jets = new Map();   // enemy -> its jet's view
const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
function makeJet() {
  const plain = { transparent: true, depthWrite: false };
  const coreMat = new THREE.MeshBasicMaterial({ color: '#e8fbff', opacity: 0.9, ...plain });
  const sheathMat = new THREE.MeshBasicMaterial({ color: '#7fd4f0', opacity: 0.35, ...plain });
  const group = new THREE.Group(), parts = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const core = new THREE.Mesh(tube, coreMat), sheath = new THREE.Mesh(tube, sheathMat);
    core.frustumCulled = sheath.frustumCulled = false;
    group.add(core, sheath); parts.push({ core, sheath });
  }
  const light = new THREE.PointLight('#bff0ff', 0, 5, 2);
  scene.add(group); trackLight(light, group);
  return { group, parts, light, owned: [coreMat, sheathMat], k: 0, on: false, at: new THREE.Vector3() };
}
// The jet of enemy e this frame: from its hands o ({ x, y, z }) along (fx, fz), arching down onto
// the floor at `floor` (y) `land` cells ahead; `size` scales its thickness. Returns where it lands.
export function cannonJet(e, o, fx, fz, floor, land, size, t) {
  let v = jets.get(e);
  if (!v) jets.set(e, v = makeJet());
  v.on = true;
  // the arch: level out of the hands, then curving down onto the floor (a parabola)
  const drop = o.y - floor, point = (u, out) => out.set(o.x + fx * land * u, o.y - drop * u * u, o.z + fz * land * u);
  const thick = 0.13 * size;
  v.parts.forEach((p, i) => {
    point(i / SEGMENTS, from); point((i + 1) / SEGMENTS, to);
    const wobble = 1 + 0.18 * Math.sin(t * 31 + i * 1.7) * Math.sin(t * 17 + i);
    dir.subVectors(to, from);
    const len = dir.length();
    for (const [m, r] of [[p.core, thick * 0.55 * wobble], [p.sheath, thick * (1.1 + 0.25 * i / SEGMENTS) * wobble]]) {
      m.position.copy(from);
      m.quaternion.setFromUnitVectors(up, dir.clone().divideScalar(len || 1));
      m.scale.set(r, len * 1.04, r);
    }
  });
  point(1, v.at);
  return v.at;
}
// every frame after the gusts: jets blown this frame show (fading in), the others fade out and go
export function drawJets(dt) {
  for (const [e, v] of jets) {
    v.k = v.on ? Math.min(1, v.k + dt * 12) : v.k - dt * 6;
    v.on = false;
    if (v.k <= 0) { removeJet(e, v); continue; }
    v.owned[0].opacity = 0.9 * v.k; v.owned[1].opacity = 0.35 * v.k;
    v.light.intensity = 2 * v.k;
    v.light.position.copy(v.at); v.light.position.y += 0.5;
    v.group.visible = true;
  }
}
function removeJet(e, v) {
  scene.remove(v.group); untrackLight(v.light);
  v.owned.forEach(m => m.dispose());
  jets.delete(e);
}
export function clearJets() { for (const [e, v] of jets) removeJet(e, v); }
// spray thrown up where it lands (at), along (fx, fz)
export function jetSplash(at, fx, fz, dt, size) {
  for (let n = Math.floor(70 * dt + Math.random()); n > 0; n--) {
    const a = rand(-1.1, 1.1), s = rand(1.5, 4), cx = fx * Math.cos(a) - fz * Math.sin(a), cz = fz * Math.cos(a) + fx * Math.sin(a);
    emit(soft, at.x + rand(-0.3, 0.3), at.y + 0.1, at.z + rand(-0.3, 0.3), { v: [cx * s, rand(1.5, 4.5), cz * s], life: rand(0.4, 0.75),
      size: rand(0.08, 0.16) * size, color: SPRAY[n % 3], alpha: 0.85, gravity: 9, drag: 0.6 });
  }
}
