// Decoration props (assets/props/, clutter/, themes/, the town's and the treasure chest; one
// file per library and prop set, tools/prop-metadata.mjs PROP_FILES): instanced meshes per
// cube. The catalog (core/propcatalog.js) knows every prop from the start; a set's geometry is
// loaded when a cube shows it (loadPropSets, before the cube is entered: render/cubeassets.js).
// Materials are cloned per cube (cubes fade and get cut on their own); props with `sway` move
// in the wind; glowing props add light sources.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cutMaterial } from './section.js';
import { buildChests } from './chests.js';
import { loadGLB } from './gltf.js';
import { PROP_FILES } from '../core/propmetadata.js';

import { props } from '../core/propcatalog.js';
export { props } from '../core/propcatalog.js';

const wind = { value: 0 };
export const tickProps = t => { wind.value = t; };

// a loaded library: its props' parts (and an animated prop's node tree and clips) into their catalog entries
export function registerProps(gltf) {
  gltf.scene.updateMatrixWorld(true);
  for (const o of gltf.scene.children) {
    // a prop is one mesh, or a group of meshes when it has a glowing material as well
    const parts = (o.isMesh ? [o] : o.children.filter(c => c.isMesh)).map(c => ({ geometry: c.geometry, material: c.material }));
    if (!parts.length) continue;
    const p = props.byName.get(o.name);
    if (!p) { console.warn('prop without metadata (tools/prop-metadata.mjs):', o.name); continue; }
    p.parts = parts;
    // an animated prop (the treasure chest) keeps its whole node tree and clips (render/chests.js)
    if (o.userData.clips) Object.assign(p, { template: o, clips: gltf.animations });
  }
}

// set -> Promise (resolves when its geometry is in the catalog, or failed to load: logged, tried again next time)
const loading = new Map(), loaded = new Set(), onLoaded = [];
export const propSetLoaded = set => loaded.has(set) || !PROP_FILES[set];
// fn(set) whenever a set's geometry arrives
export const onPropSet = fn => { onLoaded.push(fn); };
export function loadPropSets(sets) {
  return Promise.all(sets.filter(set => !propSetLoaded(set)).map(set => {
    if (!loading.has(set)) loading.set(set, Promise.all(PROP_FILES[set].map(f => loadGLB('assets/' + f))).then(libraries => {
      libraries.forEach(registerProps);
      loaded.add(set);
      for (const fn of onLoaded) fn(set);
    }, e => { loading.delete(set); console.error('prop set failed to load:', set, e); }));
    return loading.get(set);
  }));
}

// sway: bend with the wind, more the further from the attachment point; per-instance phase
function swayMaterial(mat, sway) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uWind = wind; sh.uniforms.uSway = { value: sway };
    sh.vertexShader = 'uniform float uWind, uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = 0.0;
      #ifdef USE_INSTANCING
        ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 1.7;
      #endif
      float bend = abs(position.y) * uSway * 0.07;
      transformed.x += sin(uWind * 1.9 + ph) * bend;
      transformed.z += cos(uWind * 1.4 + ph * 1.3) * bend * 0.7;`);
  };
  mat.customProgramCacheKey = () => key + '|sway';
  return mat;
}

const qt = new THREE.Quaternion(), tilt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), size = new THREE.Vector3();
// where a placed prop { x, y, z, yaw, s, normal } stands, in its cube (also the proxies' landmarks)
export function propMatrix(q, target = new THREE.Matrix4()) {
  qt.setFromAxisAngle(up, q.yaw);
  if (q.normal) qt.premultiply(tilt.setFromUnitVectors(up, new THREE.Vector3(...q.normal).normalize()));
  return target.compose(at.set(q.x, q.y, q.z), qt, size.setScalar(q.s ?? 1));
}

// A prop's parts as one plain geometry for the proxies' batch (render/neighbors.js): position,
// normal, color (vertex colour times the part's colour) and glow (its emissive light times
// `glow`), so glowing windows and braziers still glow in the surroundings.
export function propBatchGeometry(p, glow) {
  const parts = p.parts.map(({ geometry, material }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(), n = g.attributes.position.count;
    const base = material.color || new THREE.Color(1, 1, 1);
    const light = (material.emissive || new THREE.Color(0, 0, 0)).clone().multiplyScalar((material.emissiveIntensity ?? 1) * glow);
    const src = g.attributes.color, color = new Float32Array(n * 3), lit = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      color[i * 3] = (src ? src.getX(i) : 1) * base.r; color[i * 3 + 1] = (src ? src.getY(i) : 1) * base.g; color[i * 3 + 2] = (src ? src.getZ(i) : 1) * base.b;
      lit[i * 3] = light.r; lit[i * 3 + 1] = light.g; lit[i * 3 + 2] = light.b;
    }
    const vec3 = a => { const v = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v[i * 3] = a.getX(i); v[i * 3 + 1] = a.getY(i); v[i * 3 + 2] = a.getZ(i); } return v; };
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(vec3(g.attributes.position), 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(vec3(g.attributes.normal), 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    out.setAttribute('glow', new THREE.Float32BufferAttribute(lit, 3));
    g.dispose();
    return out;
  });
  const merged = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  merged.setIndex([...Array(merged.attributes.position.count).keys()]);
  return merged;
}

// placed: [{ name, x, y, z, yaw, s, tint }] -> instanced meshes (and light sources) in group
export function buildProps(placed, group) {
  const byName = new Map();
  for (const q of placed) { if (!byName.has(q.name)) byName.set(q.name, []); byName.get(q.name).push(q); }
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let lights = 0;
  for (const [name, list] of byName) {
    const p = props.byName.get(name);
    if (p?.template) { buildChests(p, list, group); continue; }
    if (!p?.parts) continue;
    for (const part of p.parts) {
      const c = cutMaterial(part.material.clone(), false, true);
      const mesh = new THREE.InstancedMesh(part.geometry, p.sway ? swayMaterial(c, p.sway) : c, list.length);
      mesh.name = p.name;
      mesh.userData.sharedGeo = true;   // the catalog owns the geometry
      list.forEach((q, i) => {
        mesh.setMatrixAt(i, propMatrix(q, m4));
        mesh.setColorAt(i, col.set(q.tint || '#ffffff'));
      });
      // glowing parts (windows, lantern glass) are light, not matter: no shadow
      mesh.castShadow = (p.blocking || p.height > 0.8) && !part.material.name.endsWith('_glow');
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // a few glowing props light their surroundings (the light pool picks the nearest)
    if (p.light && !p.cover) for (const q of list) {
      if (lights >= 6) break;
      if (q.unlit) continue;   // e.g. daytime lamp posts in the town clearings
      const l = new THREE.PointLight(p.light, p.intensity * 2, 4, 2);
      l.position.set(q.x, q.y + (p.attach === 'ceiling' ? -0.4 : 0.5), q.z);
      group.add(l); lights++;
    }
  }
}
