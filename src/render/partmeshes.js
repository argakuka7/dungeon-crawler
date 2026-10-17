// The active cube's meshes, one per part of its geometry (render/parts.js), all clipped by the
// cutaway around the player; solids draw their insides as section caps. The proxies draw the
// same parts with the same looks, batched (render/neighbors.js).
import * as THREE from 'three';
import { LAVA } from '../core/constants.js';
import { PARTS } from './parts.js';
import { partMaterial, swayMaterial } from './materials.js';
import { cutMaterial, capTwin } from './section.js';

// one part's arrays as geometry, in units of the cube's `scale` (the mesh or instance scales it)
export function partGeometry(p) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 4));
  g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 4, true));
  if (p.col) g.setAttribute('color', new THREE.BufferAttribute(p.col, 4, true));
  if (p.uv) g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
  g.setIndex(new THREE.BufferAttribute(p.index, 1));
  return g;
}

// How each kind of part sits among the transparent things: fluid surfaces, then falls over them
// (the proxies draw theirs first, render/neighbors.js).
export const PART_ORDER = { solid: 0, fluid: 2, fall: 3 };

// geo: the cube's parts (cubegeo.js buildCubeParts); returns the fluid surface meshes (animated
// every frame); shadowless: the solids ('terrain' | 'stone' | 'wood') that cast no shadow
// (inside houses the walls, which get cut away)
export function partMeshes(geo, group, shadowless = []) {
  const fluidMeshes = [];
  for (const part of PARTS) {
    const arrays = geo.parts[part.name];
    if (!arrays) continue;
    const material = cutMaterial(partMaterial(part, 'full'), part.cap || false);
    const sway = m => part.sway ? swayMaterial(m, geo.scale) : m;
    const mesh = new THREE.Mesh(partGeometry(arrays), sway(material));
    mesh.scale.setScalar(geo.scale);
    mesh.renderOrder = PART_ORDER[part.kind];
    if (part.cap) group.add(capTwin(mesh, part.cap, sway));
    if (part.kind === 'solid') { mesh.castShadow = !shadowless.includes(part.name); mesh.receiveShadow = true; }
    if (part.kind === 'fluid') {
      mesh.receiveShadow = part.fluid !== LAVA;
      mesh.userData.fluid = part.fluid;
      fluidMeshes.push(mesh);
    }
    group.add(mesh);
  }
  return fluidMeshes;
}
