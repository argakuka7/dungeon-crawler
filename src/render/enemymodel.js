// Load prefab clips once; each instance owns its skeleton, not the source's bones.
//
// An enemy's body is one skinned mesh drawn with one material: the glTF's primitives (one per
// material) are merged at load, every vertex keeping the index of its part (the material it
// had). A parts material looks up each part's colour, glow and finish in small uniform arrays,
// so an instance is one draw per pass (body, silhouette, shadow) however many materials the
// model has, and every enemy shares one shader program. Parts keep their material names: kinds
// recolour (recolor.js), hide and polish them by name.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cloneSkinned, cullBySphere } from './skinned.js';
import { kindColors } from './recolor.js';

const MAX_PARTS = 12;

// names.attack is one clip name, or { [attack.clip]: clip name } for several attacks.
// names.props: standalone nodes (projectiles) taken out of the model into model.props.
export function loadEnemyModel(url, scale, names) {
  const model = { ready: false, scale };
  const attackNames = typeof names.attack === 'string' ? { attack: names.attack } : names.attack;
  new GLTFLoader().load(url, gltf => {
    const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
    if ([names.walk, names.fast, names.death, ...Object.values(attackNames)].some(n => n && !clips[n])) {
      model.error = 'Missing enemy animation in ' + url; console.error(model.error); return;
    }
    const extras = n => gltf.parser.json.animations.find(a => a.name === n)?.extras || {};
    const props = Object.fromEntries((names.props || []).map(n => [n, gltf.scene.getObjectByName(n)]));
    if (Object.values(props).some(o => !o)) { model.error = 'Missing enemy prop in ' + url; console.error(model.error); return; }
    for (const o of Object.values(props)) o.removeFromParent();
    let body;
    try { body = mergeParts(gltf.scene); } catch (e) { model.error = `${url}: ${e.message}`; console.error(model.error); return; }
    body.mesh.castShadow = true;
    cullBySphere(body.mesh);
    Object.assign(model, {
      ready: true, source: gltf.scene, props, parts: body.parts, side: body.side, geometries: new Map([['', body.mesh.geometry]]),
      walk: clips[names.walk], fast: names.fast ? clips[names.fast] : null,
      attacks: Object.fromEntries(Object.entries(attackNames).map(([k, n]) => [k, clips[n]])), death: clips[names.death],
      walkSpeed: (extras(names.walk).speed || 1) * scale,
      fastSpeed: names.fast ? extras(names.fast).speed * scale : 0,
    });
  }, undefined, error => { model.error = String(error); console.error('Enemy failed to load:', url, error); });
  return model;
}

// the model's skinned primitives -> one skinned mesh with a `part` attribute (in place);
// parts: what each material was ({ name, color, emissive, strength, roughness, metalness })
function mergeParts(scene) {
  const meshes = [];
  scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const first = meshes[0];
  if (!first?.isSkinnedMesh) throw new Error('no skinned body');
  if (meshes.length > MAX_PARTS) throw new Error(`more than ${MAX_PARTS} parts`);
  for (const m of meshes) {
    if (!m.isSkinnedMesh || m.skeleton !== first.skeleton || m.parent !== first.parent || !m.position.equals(first.position)
      || !m.quaternion.equals(first.quaternion) || !m.scale.equals(first.scale) || Array.isArray(m.material)) throw new Error('body parts must be skinned primitives of one node');
  }
  const parts = meshes.map(({ material: m }) => ({ name: m.name, color: m.color.clone(), emissive: m.emissive.clone(),
    strength: m.emissiveIntensity, roughness: m.roughness, metalness: m.metalness }));
  const geometry = mergeGeometries(meshes.map((m, i) => {
    const g = m.geometry.clone();
    g.setAttribute('part', new THREE.BufferAttribute(new Uint8Array(g.attributes.position.count).fill(i), 1));
    return g;
  }));
  if (!geometry) throw new Error('body parts could not be merged');
  const mesh = new THREE.SkinnedMesh(geometry, first.material);
  mesh.name = first.parent.name;
  mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
  mesh.bind(first.skeleton, first.bindMatrix);
  first.parent.add(mesh);
  meshes.forEach(m => m.removeFromParent());
  return { mesh, parts, side: first.material.side };
}

// the body without the parts a kind hides (profile.hide: material names; e.g. the Shraps'
// heads), cached per prefab; it shares the vertex buffers, only the index differs
function partsGeometry(prefab, hide = []) {
  const key = [...hide].sort().join('|');
  let g = prefab.geometries.get(key);
  if (g) return g;
  const full = prefab.geometries.get(''), part = full.attributes.part.array, index = full.index.array;
  const hidden = new Set(prefab.parts.flatMap((p, i) => hide.includes(p.name) ? [i] : []));
  const kept = [];
  for (let i = 0; i < index.length; i += 3) if (!hidden.has(part[index[i]])) kept.push(index[i], index[i + 1], index[i + 2]);
  g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(full.attributes)) g.setAttribute(name, a);
  g.setIndex(kept);
  g.boundingSphere = full.boundingSphere;
  prefab.geometries.set(key, g);
  return g;
}

// A material drawing each part in its own colour, glow and finish. uniforms: color (the
// diffuse colour), emissive (glow colour times strength) and finish (roughness, metalness) per
// part; material.emissiveIntensity scales every part's glow, opacity fades them all.
export function partsMaterial(side = THREE.DoubleSide) {
  const fill = make => Array.from({ length: MAX_PARTS }, make);
  const uniforms = { color: fill(() => new THREE.Color(1, 1, 1)), emissive: fill(() => new THREE.Color(0, 0, 0)),
    finish: fill(() => new THREE.Vector2(1, 0)) };
  const mat = new THREE.MeshStandardMaterial({ side, emissive: 0xffffff });
  const U = { uPartColor: { value: uniforms.color }, uPartEmissive: { value: uniforms.emissive }, uPartFinish: { value: uniforms.finish } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float part;\nflat varying int vPart;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = int(part + 0.5);');
    sh.fragmentShader = `flat varying int vPart;\nuniform vec3 uPartColor[${MAX_PARTS}], uPartEmissive[${MAX_PARTS}];\nuniform vec2 uPartFinish[${MAX_PARTS}];\n` + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= uPartColor[vPart];')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = uPartFinish[vPart].x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = uPartFinish[vPart].y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= uPartEmissive[vPart];');
  };
  mat.customProgramCacheKey = () => 'enemy-parts';
  mat.userData.parts = uniforms;
  return mat;
}

// write parts (colour, emissive, strength, roughness, metalness) into a parts material
export function paintParts(material, parts) {
  const u = material.userData.parts;
  parts.forEach((p, i) => {
    u.color[i].copy(p.color);
    u.emissive[i].copy(p.emissive).multiplyScalar(p.strength);
    u.finish[i].set(p.roughness, p.metalness);
  });
}

export function cloneEnemy(model) {
  const copy = cloneSkinned(model.source);
  copy.scale.setScalar(model.scale);
  return copy;
}

// An instance of an enemy kind (profile): its own skeleton, the body without the parts the
// kind hides, and a parts material of its own in the kind's colours. parts: the instance's own
// copy of the prefab's parts (change them and paintParts, or write material.userData.parts).
export function dressEnemy(prefab, profile) {
  const model = cloneEnemy(prefab);
  let mesh = null;
  model.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  mesh.geometry = partsGeometry(prefab, profile?.hide);
  mesh.userData.sharedGeo = true;   // the prefab owns the geometry
  const table = kindColors(profile, prefab);
  const parts = prefab.parts.map(p => {
    const to = table?.get(p.name);
    return { ...p, color: (to?.color ?? p.color).clone(), emissive: (to?.emissive ?? p.emissive).clone() };
  });
  const material = mesh.material = partsMaterial(prefab.side);
  paintParts(material, parts);
  return { model, mesh, material, parts };
}
