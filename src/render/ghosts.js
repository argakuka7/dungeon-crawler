// What the cutaway removes is drawn again as faint glass: every cut solid (terrain, structures,
// props) gets a twin sharing its geometry with a glass material that only draws inside the
// cutaway. Twins render after everything opaque and write no depth, so the character and the
// section caps show through. One glass material per cube (fading patches it per cube).
// Twins draw nothing while there is no cut, yet would cost as much as the solids themselves
// (every vertex, every covered pixel's region test), so they live on a layer of their own
// that the camera only sees while a cut is on (showGhosts, from section.js).
import * as THREE from 'three';
import { inject, CUT_KINDS } from './cutshader.js';
import { camera } from './scene.js';

const LAYER = 1;
export const showGhosts = on => { if (on) camera.layers.enable(LAYER); else camera.layers.disable(LAYER); };

function glassMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xdcecff, transparent: true, opacity: 0.08, roughness: 0.2, metalness: 0, depthWrite: false });
  return inject(mat, fs => fs
    // walls already cut down for the camera (caves, houses) leave no glass either
    .replace('#include <clipping_planes_fragment>', 'if (cutRegion(true) < 0.5 || frontWall()) discard;\n#include <clipping_planes_fragment>')
    // a little more opaque where the surface turns away (outlines the shapes)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.a = mix(0.1, 0.4, rim * rim);`), 'cut-glass', CUT_KINDS.stone);
}

export function addGhosts(group) {
  const mat = glassMaterial(), solids = [];
  group.traverse(o => { if (o.isMesh && o.material.userData?.ghost) solids.push(o); });
  for (const o of solids) {
    const g = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, mat, o.count) : new THREE.Mesh(o.geometry, mat);
    if (o.isInstancedMesh) g.instanceMatrix = o.instanceMatrix;
    g.position.copy(o.position); g.quaternion.copy(o.quaternion); g.scale.copy(o.scale);
    g.userData.sharedGeo = true;   // the solid owns the geometry
    g.renderOrder = 60;
    g.layers.set(LAYER);
    o.parent.add(g);
  }
}
