// What the cutaway and the lowering of cave and canyon walls remove is drawn again as faint
// glass: every cut solid (terrain, structures, props) gets a twin sharing its geometry with a
// glass material that only draws where it was cut away. Twins render after everything opaque
// and write no depth, so the character and the section caps show through. One glass material
// per cube (fading patches it per cube). The proxies' walls beside lowered walls get the same
// glass (neighbors.js).
// Twins draw nothing while nothing is cut, yet would cost as much as the solids themselves
// (every vertex, every covered pixel's region test), so they live on a layer of their own
// that the camera only sees while a cut is on or walls are down (showGhosts, from section.js).
import * as THREE from 'three';
import { inject, CUT_KINDS } from './cutshader.js';
import { camera } from './scene.js';

export const LAYER = 1;
export const showGhosts = on => { if (on) camera.layers.enable(LAYER); else camera.layers.disable(LAYER); };

// the glass (the proxies' too, neighbors.js): a little more opaque where the surface turns away
// (outlines the shapes)
export const glassLook = () => new THREE.MeshStandardMaterial({ color: 0xdcecff, transparent: true, opacity: 0.08, roughness: 0.2, metalness: 0, depthWrite: false });
export const glassRim = fs => fs.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.a = mix(0.1, 0.4, rim * rim);`);

function glassMaterial() {
  // walls cut down inside houses leave no glass
  return inject(glassLook(), fs => glassRim(fs
    .replace('#include <clipping_planes_fragment>', 'if (cutRegion(true) < 0.5 && !(uWallGlass > 0.5 && frontWall())) discard;\n#include <clipping_planes_fragment>')),
  'cut-glass', CUT_KINDS.stone);
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
