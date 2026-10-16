// A copy of a skinned glTF scene that owns its skeleton: the copy's meshes are bound to the
// copy's bones, not the source's. Geometry and materials stay shared with the source.
// Meshes that share a skeleton in the source (one glTF skin, several primitives) share one in
// the copy too: three.js computes and uploads a skeleton's bone matrices once per frame.
import * as THREE from 'three';

export function cloneSkinned(source) {
  const copy = source.clone(true), bones = {};
  copy.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const meshes = [];
  source.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const skeletons = new Map();   // the source's skeleton -> the copy's
  let i = 0;
  copy.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const original = meshes[i++].skeleton;
    let skeleton = skeletons.get(original);
    if (!skeleton) skeletons.set(original, skeleton = new THREE.Skeleton(original.bones.map(b => bones[b.name]), original.boneInverses));
    o.bind(skeleton, o.bindMatrix);
  });
  return copy;
}

// Let three.js cull a skinned mesh against the view (and the sun's shadow frustum): a sphere
// around its rest pose, `pad` times as large, so poses that reach out stay inside. Clones copy it.
// (A skinned mesh's own computeBoundingSphere poses every vertex once and keeps that pose.)
export function cullBySphere(mesh, pad = 1.5) {
  const g = mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  mesh.boundingSphere = g.boundingSphere.clone();
  mesh.boundingSphere.radius *= pad;
  mesh.frustumCulled = true;
}
