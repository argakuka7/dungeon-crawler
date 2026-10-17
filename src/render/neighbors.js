// Render-only discovered cubes: merged terrain/wood and fluids and the cube's landmarks (the only
// props shown), no simulation, lights or shadows. Geometry is cached; materials remain cube-local
// for travel fades.
import * as THREE from 'three';
import { N, CUBE_H, BASE, FLUIDS } from '../core/constants.js';
import { VIEW_DISTANCE, distanceFade } from '../core/viewdistance.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, camera } from './scene.js';
import { toGeometry } from './builder.js';
import { makeFadable, setFade, setRangeFade } from './fade.js';
import { makeGlass, setGlassFaces } from './glass.js';
import { inject } from './cutshader.js';
import { props } from '../core/propcatalog.js';

let current = [];   // [{ key, group, cull, base, glass, geometry }]
const live = new Set(), cache = new Map();   // cache keyed by worker geometry identity
const MAX_CACHE = 64, MAX_BYTES = 32 * 1024 * 1024;
let cacheBytes = 0;
const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
const bounds = new THREE.Box3(), point = new THREE.Vector3(), center = new THREE.Vector3();
const reveal = { value: 1 }, revealFloor = { value: -1e3 };

function trimCache() {
  for (const [source, entry] of cache) {
    if (cache.size <= MAX_CACHE && cacheBytes <= MAX_BYTES) break;
    if (entry.refs) continue;   // visible/travelling cubes are pinned
    entry.solid?.dispose(); entry.fluid?.dispose();
    cacheBytes -= entry.bytes; cache.delete(source);
  }
}

function geometryFor(geo) {
  let entry = cache.get(geo);
  if (entry) { cache.delete(geo); cache.set(geo, entry); entry.refs++; return entry; }
  const solids = [], fluids = [];
  for (const L of geo) {
    for (const a of [L.terrain, L.stone, L.wood]) if (a) solids.push(toGeometry(a));
    for (const t of FLUIDS) if (L.fluids[t]) {
      const f = toGeometry(L.fluids[t]); f.deleteAttribute('color'); fluids.push(f);
    }
  }
  const solid = solids.length ? mergeGeometries(solids) : null;
  const fluid = fluids.length ? mergeGeometries(fluids) : null;
  solids.forEach(s => s.dispose()); fluids.forEach(f => f.dispose());
  const box = new THREE.Box3(new THREE.Vector3(0, -BASE, 0), new THREE.Vector3(N, CUBE_H - BASE, N));
  let bytes = 0;
  for (const g of [solid, fluid]) if (g) {
    g.computeBoundingBox(); g.computeBoundingSphere(); box.union(g.boundingBox);
    for (const a of Object.values(g.attributes)) bytes += a.array.byteLength;
    if (g.index) bytes += g.index.array.byteLength;
  }
  entry = { solid, fluid, bounds: box, bytes, refs: 1 };
  cache.set(geo, entry); cacheBytes += bytes; trimCache();
  return entry;
}

// Foreground proxies reveal the player even when no active-cube terrain needs cutting.
// Unlike cave walls, this uses only screen region/view depth, never cube-local wall tests.
// Like real terrain they are only cut above a height: the active cut, or just over the
// player's feet when there is none (nothing lower can hide the player).
function proxyMaterial(mat) {
  inject(mat, fs => fs.replace('#include <clipping_planes_fragment>',
    'if (uProxyReveal > 0.5 && vCutW.y > (uCutY < 999.0 ? uCutY : uProxyFloor) && cutRegion(false) > 0.5) discard;\n#include <clipping_planes_fragment>'), 'proxy-reveal');
  const compile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    compile.call(mat, sh, r);
    sh.uniforms.uProxyReveal = reveal; sh.uniforms.uProxyFloor = revealFloor;
    sh.fragmentShader = 'uniform float uProxyReveal, uProxyFloor;\n' + sh.fragmentShader;
  };
  return mat;
}

// landmarks: [{ name, x, y, z, yaw }] (map.rewardSites[].landmark); their geometry is the catalog's
function proxy(geo, open, landmarks = []) {
  const geometry = geometryFor(geo), group = new THREE.Group(), cull = new THREE.Group();
  if (geometry.solid) group.add(new THREE.Mesh(geometry.solid, proxyMaterial(
    new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x5f6672 }))));
  for (const L of landmarks) for (const part of props.byName.get(L.name)?.parts || []) {
    const mesh = new THREE.Mesh(part.geometry, proxyMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x5f6672 })));
    mesh.position.set(L.x, L.y, L.z); mesh.rotation.y = L.yaw;
    group.add(mesh);
  }
  if (geometry.fluid) group.add(new THREE.Mesh(geometry.fluid, proxyMaterial(
    new THREE.MeshLambertMaterial({ color: 0x2e6aa8, transparent: true, opacity: 0.6, depthWrite: false }))));
  const glass = makeGlass(0.6, open);
  group.add(glass);
  // Culling lives on a parent: setFade() owns the child's visibility during travel.
  cull.add(group); scene.add(cull);
  makeFadable(group, 0);
  return { group, cull, glass, geometry };
}

// Reuse common cubes across refreshes and travel. Consume them from `reuse` so callers
// dispose/fade only the departing proxies. The full source/destination keep their own fades.
export function buildNeighbors(list, reuse = []) {
  return list.map(({ key, geo, dx, dz, open, landmarks }) => {
    const index = reuse.findIndex(g => g.key === key && g.source === geo);
    const g = index < 0 ? { key, source: geo, ...proxy(geo, open, landmarks), base: new THREE.Vector3() }
      : reuse.splice(index, 1)[0];
    g.continuing = index >= 0;
    g.base.set(dx * N, 0, dz * N);
    g.group.position.copy(g.base);
    setGlassFaces(g.glass, open);
    live.add(g);
    return g;
  });
}

export function disposeNeighbors(list) {
  for (const g of list) {
    scene.remove(g.cull); live.delete(g);
    const materials = new Set();
    g.group.traverse(o => { if (o.material) for (const m of [].concat(o.material)) materials.add(m); });
    materials.forEach(m => m.dispose());
    g.geometry.refs--;
  }
  trimCache();
}

export function clearNeighbors() { disposeNeighbors(current); current = []; }
export function clearNeighborCache() {
  // Call after clearing proxies on world reset. Live travel geometry is never invalidated.
  for (const [source, entry] of cache) if (!entry.refs) {
    entry.solid?.dispose(); entry.fluid?.dispose();
    cacheBytes -= entry.bytes; cache.delete(source);
  }
}
export function showNeighbors(list) {
  const old = detachNeighbors();
  current = buildNeighbors(list, old);
  disposeNeighbors(old);
}
export const showsNeighbor = key => current.some(g => g.key === key);
export function detachNeighbors() { const c = current; current = []; return c; }
export function adoptNeighbors(list) { clearNeighbors(); current = list; }

export function tickNeighbors(dt) {
  for (const { group } of current) if (group.userData.fade < 1) setFade(group, Math.min(1, group.userData.fade + dt * 2.5));
}

// After camera, look/fog and cut updates, including both old/new sets during travel.
// floor: the lowest height the player reveal may cut proxies at (see proxyMaterial)
export function cullNeighbors(x, z, revealPlayer = true, enabled = true, floor = -1e3) {
  reveal.value = revealPlayer ? 1 : 0;
  revealFloor.value = floor;
  camera.updateMatrixWorld();
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projection);
  for (const g of live) {
    if (!enabled) { g.cull.visible = false; continue; }
    bounds.copy(g.geometry.bounds).translate(g.group.position);
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x);
    const dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
    const range = distanceFade(Math.hypot(dx, dz));
    setRangeFade(g.group, range);
    // Fog is shader-only in Three.js. Skip boxes wholly beyond its opaque distance.
    bounds.getCenter(center); point.copy(center).applyMatrix4(camera.matrixWorldInverse);
    const radius = bounds.getSize(center).length() / 2;
    const fogged = scene.fog && -point.z - radius >= scene.fog.far;
    g.cull.visible = range > 0 && !fogged && frustum.intersectsBox(bounds);
  }
}

export const neighborStats = () => ({ live: live.size, visible: [...live].filter(g => g.cull.visible && g.group.visible).length,
  cached: cache.size, bytes: cacheBytes, distance: VIEW_DISTANCE });
