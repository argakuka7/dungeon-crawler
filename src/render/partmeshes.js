// The active cube's meshes, one per part of its geometry (render/parts.js), all clipped by the
// cutaway around the player; solids draw their insides as section caps. The proxies draw the
// same parts with the same looks, batched (render/neighbors.js).
import * as THREE from 'three';
import { LAVA } from '../core/constants.js';
import { PARTS } from './parts.js';
import { partMaterial, swayMaterial, fluidLook } from './materials.js';
import { cutMaterial, capTwin } from './section.js';
import { wetMaterial } from './wet.js';

// one part's arrays as geometry, in units of the cube's `scale` (the mesh or instance scales it)
export function partGeometry(p) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 4));
  g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 4, true));
  if (p.col) g.setAttribute('color', new THREE.BufferAttribute(p.col, 4, true));
  if (p.uv) g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
  if (p.pal) g.setAttribute('pal', new THREE.BufferAttribute(p.pal, 4));   // (fluids: their palettes, render/fluidpal.js)
  if (p.shore) g.setAttribute('shore', new THREE.BufferAttribute(p.shore, 4));   // (fluids: the ground under them, render/shore.js)
  g.setIndex(new THREE.BufferAttribute(p.index, 1));
  return g;
}

// How each kind of part sits among the transparent things: fluid surfaces, then falls over them
// (the proxies draw theirs first, render/neighbors.js).
export const PART_ORDER = { solid: 0, fluid: 2, fall: 3 };

// geo: the cube's parts (cubegeo.js buildCubeParts); returns the fluid surface meshes (animated
// every frame); shadowless: the solids ('terrain' | 'stone' | 'wood') that cast no shadow
// (inside houses the walls, which get cut away); water: the cube's (render/wet.js waterUniforms:
// what its fluids meet, the structures wet where they have just been)
export function partMeshes(geo, group, shadowless = [], water = null) {
  const fluidMeshes = [];
  for (const part of PARTS) {
    const arrays = geo.parts[part.name];
    if (!arrays) continue;
    const cut = cutMaterial(partMaterial(part, 'full'), part.cap || false);
    // (the terrain is wet by bands in the fluids' meshes, render/floors.js)
    const material = part.kind === 'solid' ? (water && part.name !== 'terrain' ? wetMaterial(cut, water) : cut) : fluidLook(cut, part, water);
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
