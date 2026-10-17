// Cube-local glass boxes move and fade with the full cube and its proxies. Side panes can
// disappear independently; the outline still shows that these are separate simulation spaces.
import * as THREE from 'three';
import { N, CUBE_H, BASE } from '../core/constants.js';
import { dither } from './fade.js';

const box = new THREE.BoxGeometry(N, CUBE_H, N), outline = new THREE.EdgesGeometry(box);
// The panes lie in the planes of the cube's outer walls, whose insides show through a cut:
// pushed back a little in depth, a pane always loses there instead of flickering over them.
const BEHIND = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 };
// BoxGeometry's faces are +x, -x, +y, -y, +z, -z. Keep one shared geometry per side.
const sides = [0, 1, 4, 5].map(face => {
  const geo = box.clone();
  geo.setIndex(Array.from(box.index.array.slice(face * 6, face * 6 + 6)));
  geo.clearGroups();
  return geo;
});

export function setGlassFaces(group, open = []) {
  group.userData.panes.forEach((pane, dir) => { pane.visible = !open[dir]; });
}

export function makeGlass(strength = 1, open = []) {
  const g = new THREE.Group();
  const edges = new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: 0x8fb3d9, transparent: true, opacity: 0.35 * strength }));
  edges.userData.sharedGeo = true;
  const material = new THREE.MeshBasicMaterial({ color: 0x6d8db5, transparent: true, opacity: 0.05 * strength, side: THREE.BackSide, depthWrite: false, ...BEHIND });
  g.userData.panes = sides.map(geo => {
    const pane = new THREE.Mesh(geo, material);
    pane.userData.sharedGeo = true;
    return pane;
  });
  g.add(edges, ...g.userData.panes);
  g.position.set(N / 2, CUBE_H / 2 - BASE, N / 2);
  setGlassFaces(g, open);
  return g;
}

// The proxies' glass boxes (render/neighbors.js): every proxy's panes in one draw and every
// outline in another. A proxy holds a stand-in that setGlassFaces treats like a real box (its
// first child the outline, userData.panes the side panes); nothing of it is in the scene.
export function glassState(open = []) {
  const g = new THREE.Group();
  g.add(new THREE.Object3D());
  g.userData.panes = [0, 1, 2, 3].map(() => { const pane = new THREE.Object3D(); g.add(pane); return pane; });
  setGlassFaces(g, open);
  return g;
}

const CENTER = new THREE.Vector3(N / 2, CUBE_H / 2 - BASE, N / 2);

// per instance: aOffset (the box centre), aFade (fade, inverted, range fade: render/fade.js),
// aPanes (which side panes show); a hidden pane collapses to a point
function instancedGlass(mat, panes) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec3 aOffset;\nattribute vec4 aFade;\nflat varying vec4 vFade;\n'
      + (panes ? 'attribute float aSide;\nattribute vec4 aPanes;\n' : '')
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vFade = aFade;
        ${panes ? 'if (aPanes[int(aSide)] < 0.5) transformed = vec3(0.0);' : ''}
        transformed += aOffset;`);
    sh.fragmentShader = 'flat varying vec4 vFade;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>' + dither('vFade.x', 'vFade.y', 'vFade.z'));
  };
  mat.customProgramCacheKey = () => panes ? 'glass-panes' : 'glass-outline';
  return mat;
}

export function glassBatch(strength) {
  const pos = [], side = [], p = box.attributes.position;
  sides.forEach((geo, s) => { for (const i of geo.index.array) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); side.push(s); } });
  const paneGeo = new THREE.InstancedBufferGeometry(), lineGeo = new THREE.InstancedBufferGeometry();
  paneGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  paneGeo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  lineGeo.setAttribute('position', outline.attributes.position);
  const panes = new THREE.Mesh(paneGeo, instancedGlass(new THREE.MeshBasicMaterial({ color: 0x6d8db5, transparent: true,
    opacity: 0.05 * strength, side: THREE.BackSide, depthWrite: false, ...BEHIND }), true));
  const edges = new THREE.LineSegments(lineGeo, instancedGlass(new THREE.LineBasicMaterial({ color: 0x8fb3d9, transparent: true,
    opacity: 0.35 * strength }), false));
  for (const o of [panes, edges]) { o.frustumCulled = false; o.visible = false; }
  let capacity = 0, offset, fade, shown;
  const grow = n => {
    capacity = Math.max(n, capacity * 2, 64);
    offset = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    fade = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    shown = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    for (const g of [paneGeo, lineGeo]) { g.setAttribute('aOffset', offset); g.setAttribute('aFade', fade); }
    paneGeo.setAttribute('aPanes', shown);
  };
  grow(64);
  return {
    objects: [panes, edges],
    // list: [{ position (the proxy's), fade: [fade, inverted, range], state (glassState) }]
    update(list) {
      if (list.length > capacity) grow(list.length);
      list.forEach((g, i) => {
        offset.setXYZ(i, g.position.x + CENTER.x, g.position.y + CENTER.y, g.position.z + CENTER.z);
        fade.setXYZW(i, g.fade[0], g.fade[1], g.fade[2], 0);
        const [a, b, c, d] = g.state.userData.panes.map(pane => pane.visible ? 1 : 0);
        shown.setXYZW(i, a, b, c, d);
      });
      for (const a of [offset, fade, shown]) { a.clearUpdateRanges(); a.addUpdateRange(0, list.length * a.itemSize); a.needsUpdate = true; }
      paneGeo.instanceCount = lineGeo.instanceCount = list.length;
      panes.visible = edges.visible = list.length > 0;
    },
  };
}
