// Flip's box as drawn in the active cube (game/flipworld.js turns it, cubegen/fliparena.js builds
// it): its meshes (render/flipgeo.js, one for each side of the box and one for the island, and the
// portals' markers) hang in a pivot at the middle of the box, so the whole box turns about it. The
// side overhead is not drawn (it would hide everything from the camera), and the island is
// see-through while it is not the floor. Over each hole in the walls a pane of ice, shown while the hole's
// side is down and the hole shut: it cracks (flickers), then bursts and is gone. Black holes:
// a ball of night ringed by a light blue swirl that grows as it opens, light and dust spiralling
// into it; one the player comes out of opens and closes again. The vortex onto the island and
// the landings are particles.
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { glow, soft, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { S, MID, FACES, GROUP, FLIP_FIGHT } from '../core/flip.js';
import { buildFlipGeometry } from './flipgeo.js';
import { GeoBuilder } from './builder.js';
import { packParts } from './parts.js';
import { partMeshes } from './partmeshes.js';
import { usePalette } from './palette.js';
import { themeOf } from '../themes/depth.js';
import { buildProps } from './props.js';
import { adoptFade } from './fade.js';
import { ownShadowDepth } from './skinned.js';
import { LH } from '../core/constants.js';
import { sfx } from '../audio/sfx.js';
import { player } from '../game/state.js';

const AXES = { x: new THREE.Vector3(1, 0, 0), z: new THREE.Vector3(0, 0, 1) };
const m4 = new THREE.Matrix4(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), down = new THREE.Vector3();
const quatOf = (O, q) => q.setFromRotationMatrix(m4.set(O[0], O[1], O[2], 0, O[3], O[4], O[5], 0, O[6], O[7], O[8], 0, 0, 0, 0, 1));

// The pivot the box's meshes go into (render/world.js buildWorld): its inner group is in the box's
// own frame. Also the panes over the holes.
export function flipPivot(group, m) {
  const pivot = new THREE.Group(), inner = new THREE.Group();
  pivot.position.set(MID, MID, MID); inner.position.set(-MID, -MID, -MID);
  pivot.add(inner); group.add(pivot);
  // each side of the box (and the island) a mesh of its own, drawn like the cube's terrain
  usePalette(themeOf(m));
  const sides = Object.keys(GROUP).map(name => {
    const side = new THREE.Group();
    side.userData.side = name;
    if (name !== 'island') fillSide(side, m);
    inner.add(side);
    return side;
  });
  // the island: see-through while it is not the floor; its clutter only while it is (about to be)
  const island = sides.find(o => o.userData.side === 'island'), islandProps = new THREE.Group();
  sideMeshes(island, m, GROUP.island);
  for (const o of island.children) if (!o.userData.cap) o.material.transparent = true;
  island.add(islandProps);
  buildProps((m.flip.clutter ?? []).filter(c => c.side === 'island'), islandProps);
  const covers = new Map();
  const mat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x4fb0e8, emissiveIntensity: 0.35, roughness: 0.15,
    metalness: 0.1, transparent: true, opacity: 0.72 });
  for (const h of m.flip.holes) {
    const n = FACES[h.face], g = new THREE.Group();
    for (const i of h.cells) {
      const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S));
      // a thin pane on the inner face of the wall's cell (where its floor would be, turned)
      const t = 0.12, box = new THREE.Mesh(new THREE.BoxGeometry(n[0] ? t : 1, n[1] ? t : 1, n[2] ? t : 1), mat);
      box.position.set(x + 0.5 - n[0] * (0.5 - t / 2), y + 0.5 - n[1] * (0.5 - t / 2), z + 0.5 - n[2] * (0.5 - t / 2));
      g.add(box);
    }
    g.visible = false; g.userData.cover = true;
    inner.add(g);
    covers.set(h.id, { group: g, face: h.face, cells: h.cells });
  }
  return { pivot, inner, covers, sides: sides.filter(o => o !== island), island, islandProps, mat, stage: 0, m, pieces: [], broken: null };
}
// a side's cells (those has(i) says are there) as meshes drawn like the cube's terrain, into group
function sideMeshes(group, m, g, has = null) {
  const layers = [{ terrain: new GeoBuilder(), stone: new GeoBuilder(), wood: new GeoBuilder(), flags: new GeoBuilder({ sway: true }), fluids: {} }];
  buildFlipGeometry(m, layers, g, has);
  if (layers[0].terrain.pos.length) partMeshes(packParts([{ terrain: layers[0].terrain.arrays(), fluids: {} }], m), group);
}
// a side of the box (not the island): its cells and the clutter on them
function fillSide(side, m, has = null) {
  const name = side.userData.side;
  sideMeshes(side, m, GROUP[name], has);
  buildProps((m.flip.clutter ?? []).filter(c => c.side === name && (!has || has(c.on))), side);
}
function emptySide(side) {
  for (const o of [...side.children]) {
    side.remove(o);
    o.traverse(x => { if (!x.userData.sharedGeo) x.geometry?.dispose(); if (x.material) [].concat(x.material).forEach(mm => mm.dispose()); });
  }
}

// Walls broken open (game/flipworld.js): the cells `removed` (a Set) go from their sides, which are
// drawn again without them, and fly off in a few big pieces, outward (`out`: the box-frame way out
// of each side, by group) and falling (`fall`: the box-frame way down), fading. world: the cube's.
export function breakWalls(world, removed, out, fall) {
  const v = world?.flip;
  if (!v) return;
  // (pieces still on their way back: in place at once)
  const flying = v.pieces;
  v.pieces = [];
  for (const p of flying) dropPiece(v, p);
  const m = v.m, solid = m.flip.solid, has = i => !removed.has(i);
  for (const side of v.sides) {
    const g = GROUP[side.userData.side];
    if (![...removed].some(i => solid[i] === g)) continue;
    emptySide(side); fillSide(side, m, has);
    adoptFade(world.group, side); ownShadowDepth(side);
  }
  v.broken = removed; v.out = out; v.fall = fall;
  for (const cells of chunksOf(m, removed)) launch(world, v, cells, false);
  sfx('stomp', { at: player, pitch: 0.7 }); sfx('shed', { at: player, pitch: 0.6 });
}
// the cells of a side in chunks of about five cells each way (the big pieces)
function chunksOf(m, cells) {
  const solid = m.flip.solid, chunks = new Map();
  for (const i of cells) {
    const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S)), key = `${solid[i]}:${Math.floor(x / 5)},${Math.floor(y / 5)},${Math.floor(z / 5)}`;
    if (!chunks.has(key)) chunks.set(key, new Set());
    chunks.get(key).add(i);
  }
  return [...chunks.values()];
}
// A piece: flying off (out of its side and falling, spinning, fading), or back in (`back`: from
// as far out to where it belongs, turning back into place, growing solid)
const PIECE_TIME = 1.6, BACK_TIME = 1.1;
function launch(world, v, cells, back) {
  const m = v.m, g = m.flip.solid[cells.values().next().value], group = new THREE.Group(), o = v.out?.[g] ?? [0, 0, 0];
  sideMeshes(group, m, g, i => cells.has(i));
  group.traverse(x => { if (x.material && !x.userData.cap) { x.material.transparent = true; x.castShadow = false; } else if (x.userData.cap) x.visible = false; });
  let cx = 0, cy = 0, cz = 0;
  for (const i of cells) { cx += i % S + 0.5; cz += Math.floor(i / S) % S + 0.5; cy += Math.floor(i / (S * S)) + 0.5; }
  const n = cells.size, pivot = new THREE.Group();
  pivot.position.set(cx / n, cy / n, cz / n); group.position.set(-cx / n, -cy / n, -cz / n);
  pivot.add(group); pivot.userData.piece = true; v.inner.add(pivot); adoptFade(world.group, pivot);
  const speed = 3 + Math.random() * 2.5, fall = v.fall ?? [0, -1, 0];
  const p = { obj: pivot, t: 0, back, home: pivot.position.clone(), v: o.map((a, k) => a * speed + (Math.random() - 0.5) * 1.2 - fall[k] * 1.5), fall,
    spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), rate: (Math.random() - 0.5) * 2 };
  if (back) { p.from = new THREE.Vector3(o[0] * 6 - fall[0] * 3, o[1] * 6 - fall[1] * 3, o[2] * 6 - fall[2] * 3); p.turn = (Math.random() - 0.5) * 1.5; }
  v.pieces.push(p);
  // dust where it breaks off (or comes back to: in the world, the box turned)
  v.pivot.updateMatrixWorld(true);
  const at = pivot.getWorldPosition(new THREE.Vector3());
  for (let k = 0; k < 14; k++) emit(soft, at.x + rand(-2, 2), at.y + rand(-2, 2), at.z + rand(-2, 2), { v: [rand(-1, 1), rand(-0.5, 1), rand(-1, 1)],
    life: rand(0.8, 1.4), size: rand(0.5, 0.9), grow: 1.4, color: '#c9ced6', alpha: 0.4, drag: 1.5 });
  return p;
}
// The walls whole again (before a turn): the pieces fly back together (animate), and once they are
// all in place the sides are drawn whole; else at once.
export function restoreWalls(world, animate = false) {
  const v = world?.flip;
  if (!v?.broken) return;
  const broken = v.broken;
  v.broken = null;
  const flying = v.pieces;
  v.pieces = [];
  for (const p of flying) dropPiece(v, p);
  const whole = () => {
    const solid = v.m.flip.solid;
    for (const side of v.sides) {
      const g = GROUP[side.userData.side];
      if (![...broken].some(i => solid[i] === g)) continue;
      emptySide(side); fillSide(side, v.m);
      adoptFade(world.group, side); ownShadowDepth(side);
    }
  };
  if (!animate) { whole(); return; }
  const pieces = chunksOf(v.m, broken).map(cells => launch(world, v, cells, true));
  let left = pieces.length;
  for (const p of pieces) p.done = () => { if (--left === 0) whole(); };
  sfx('stomp', { at: player, pitch: 0.55, volume: 0.7 });
}
function dropPiece(v, p) { v.inner.remove(p.obj); emptySide(p.obj); p.done?.(); }
function tickPieces(v, dt) {
  if (!v.pieces.length) return;
  v.pieces = v.pieces.filter(p => {
    p.t += dt;
    let fade;
    if (p.back) {   // flying back into place
      const k = Math.min(1, p.t / BACK_TIME), e = 1 - (1 - k) ** 3;
      p.obj.position.copy(p.home).addScaledVector(p.from, 1 - e);
      p.obj.quaternion.setFromAxisAngle(p.spin, p.turn * (1 - e));
      fade = Math.min(1, k * 2.5);
    } else {
      for (let k = 0; k < 3; k++) p.v[k] += p.fall[k] * 14 * dt;
      p.obj.position.x += p.v[0] * dt; p.obj.position.y += p.v[1] * dt; p.obj.position.z += p.v[2] * dt;
      p.obj.rotateOnAxis(p.spin, p.rate * dt);
      fade = Math.max(0, 1 - Math.max(0, p.t - 0.6) / (PIECE_TIME - 0.6));
    }
    p.obj.traverse(x => { if (x.material && !x.userData.cap) x.material.opacity = fade; });
    if (p.t < (p.back ? BACK_TIME : PIECE_TIME)) return true;
    dropPiece(v, p);
    return false;
  });
}
// The box turned by O, and on by angle a about the axis (a turn under way)
export function turnBox(world, O, axis = null, a = 0) {
  const v = world?.flip;
  if (!v) return;
  quatOf(O, q1);
  if (axis) q1.premultiply(q2.setFromAxisAngle(AXES[axis], a));
  v.pivot.quaternion.copy(q1);
  // the portals' markers (the doorway, the well) only the right way up: turned they hang in a wall
  const upright = down.set(0, -1, 0).applyQuaternion(q1).y < -0.99;
  for (const o of v.inner.children) {
    if (o.userData.side || o.userData.cover || o.userData.piece) continue;
    if (!upright && o.visible) { o.visible = false; o.userData.flipHid = true; }
    else if (upright && o.userData.flipHid) { o.visible = true; o.userData.flipHid = false; }
  }
  // the side overhead: not drawn
  for (const o of v.sides) o.visible = down.set(...FACES[o.userData.side]).applyQuaternion(q1).y < 0.6;
  // the island: solid as it comes to be the floor (the box's top down), see-through otherwise
  const k = Math.min(1, Math.max(0, (-down.set(0, 1, 0).applyQuaternion(q1).y - 0.2) / 0.7)), solid = k > 0.95;
  v.islandProps.visible = k > 0.5;
  for (const o of v.island.children) {
    if (o === v.islandProps) continue;
    if (o.userData.cap) { o.visible = solid; continue; }   // (its section caps only once it is solid)
    o.material.opacity = 0.28 + 0.72 * k; o.material.depthWrite = solid;
  }
}
// The panes over the holes of the side down: stage 0 none, 1 shut, 2 cracking, 3 gone (burst)
export function showCovers(world, face, stage) {
  const v = world?.flip;
  if (!v) return;
  v.stage = stage;
  for (const c of v.covers.values()) c.group.visible = !!face && c.face === face && (stage === 1 || stage === 2);
  v.mat.opacity = 0.72; v.mat.emissiveIntensity = 0.35;
}
let lastTime = null;
export function tickFlipView(world, time) {
  const v = world?.flip;
  if (!v) return;
  const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
  lastTime = time;
  tickPieces(v, dt);
  if (v.stage !== 2) return;
  const k = 0.5 + 0.5 * Math.sin(time * 30) * Math.sin(time * 13);
  v.mat.emissiveIntensity = 0.35 + 1.2 * k; v.mat.opacity = 0.5 + 0.3 * k;
}

// the panes burst: shards and a crack (floors: the holes' floors, as the box stands now)
export function holesOpenFx(floors) {
  sfx('glass', { at: player, pitch: 0.7 });
  for (const f of floors) {
    const x = f.x + 0.5, y = f.top * LH, z = f.z + 0.5;
    if (Math.hypot(x - player.x, z - player.z) > 18) continue;
    for (let i = 0; i < 8; i++)
      emit(glow, x + rand(-0.45, 0.45), y + 0.05, z + rand(-0.45, 0.45), { v: [rand(-1, 1), rand(0.5, 2.5), rand(-1, 1)], life: rand(0.4, 0.8),
        size: rand(0.05, 0.1), color: i % 2 ? '#e8f8ff' : '#8fd8ff', gravity: 8, drag: 1 });
  }
}
// landing after a turn: dust and a thump
export function landFx(p) {
  for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1, 2.6);
    emit(soft, p.x, p.y + 0.1, p.z, { v: [Math.cos(a) * s, rand(0.2, 1), Math.sin(a) * s], life: rand(0.5, 0.9), size: rand(0.25, 0.4),
      grow: 1.2, color: '#d8e6ee', alpha: 0.45, drag: 2.5 });
  }
}
// held in Flip's tractor beam: light swirling round the player, rising
export function beamFx(p, dt) {
  const n = Math.floor(70 * dt + Math.random()), t = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const a = t * 5 + i * 2.1 + rand(0, 0.5), r = rand(0.35, 0.7);
    emit(glow, p.x + Math.cos(a) * r, p.y + rand(0, 1), p.z + Math.sin(a) * r, { v: [-Math.sin(a) * 2, rand(0.5, 1.5), Math.cos(a) * 2],
      life: rand(0.25, 0.45), size: rand(0.05, 0.1), color: i % 3 ? '#9fe0ff' : '#ffffff', drag: 1.5 });
  }
}
// The beam itself: a shaft of light blue light from his rings to the player (boss: null puts it out)
let tractor = null;
const yAxis = new THREE.Vector3(0, 1, 0), a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
export function drawTractor(boss, p = null) {
  if (!boss || !p) { if (tractor) tractor.visible = false; return; }
  if (!tractor) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    tractor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.45, 1, 16, 1, true), mat);
    tractor.renderOrder = 5;
    scene.add(tractor);
  }
  a3.set(boss.x, boss.y + 1.3, boss.z); b3.set(p.x, p.y + 0.5, p.z);
  const len = a3.distanceTo(b3);
  tractor.visible = len > 0.3;
  tractor.position.copy(a3).add(b3).multiplyScalar(0.5);
  tractor.quaternion.setFromUnitVectors(yAxis, b3.clone().sub(a3).normalize());
  tractor.scale.set(1, len, 1);
  tractor.material.opacity = 0.28 + 0.1 * Math.sin(performance.now() / 60);
  // sparkles streaming along it
  if (Math.random() < 0.8) { const k = Math.random(); emit(glow, a3.x + (b3.x - a3.x) * k, a3.y + (b3.y - a3.y) * k, a3.z + (b3.z - a3.z) * k,
    { v: [(b3.x - a3.x) * 0.6, (b3.y - a3.y) * 0.6, (b3.z - a3.z) * 0.6], life: 0.3, size: rand(0.05, 0.1), color: '#e8f8ff', drag: 1 }); }
}

// --- black holes ---------------------------------------------------------------------------------
const views = new Map();   // hole (or exit) -> its view
const NIGHT = new THREE.MeshBasicMaterial({ color: 0x020206 });
function holeView() {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), NIGHT);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.05, 48, 1), ringMat);
  ring.rotation.x = -Math.PI / 2;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48, 1), ringMat.clone());
  halo.material.color.set(0xffffff);
  group.add(ball, ring, halo);
  const light = new THREE.PointLight(0x7fd0ff, 0, 5, 2);
  light.position.y = 0.4;
  scene.add(group); trackLight(light, group, group, 2);
  return { group, ball, ring, halo, light };
}
function dropView(key) {
  const v = views.get(key);
  if (!v) return;
  scene.remove(v.group); untrackLight(v.light);
  v.ball.geometry.dispose(); v.ring.geometry.dispose(); v.halo.geometry.dispose(); v.ring.material.dispose(); v.halo.material.dispose();
  views.delete(key);
}
// holes: the boss's ({ id, x, y, z, t, life, gone }); exits: where a swallowed player came out ({ x, y, z, t })
export function drawBlackHoles(holes, exits, dt) {
  const H = FLIP_FIGHT.hole, live = new Set();
  const draw = (key, h, size, spin) => {
    live.add(key);
    let v = views.get(key);
    if (!v) { v = holeView(); views.set(key, v); sfx('blackhole', { at: h }); }
    const s = Math.max(0.01, size);
    v.group.position.set(h.x, h.y + 0.55 * s, h.z);
    v.ball.scale.setScalar(s); v.halo.scale.setScalar(s); v.halo.quaternion.copy(camera.quaternion);   // (facing the camera)
    v.ring.scale.setScalar(s * (1 + 0.08 * Math.sin(spin * 3)));
    v.ring.rotation.z = spin;
    v.light.intensity = 3 * s;
    // light and dust spiralling in
    if (Math.hypot(h.x - player.x, h.z - player.z) < 20) for (let n = Math.floor(60 * dt * s + Math.random()); n > 0; n--) {
      const a = rand(0, Math.PI * 2), r = rand(1.2, 3) * s, life = rand(0.4, 0.7);
      const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r, y = h.y + rand(0, 1.2) * s;
      emit(glow, x, y, z, { v: [(h.x - x) / life - Math.sin(a) * 2, (h.y + 0.5 * s - y) / life, (h.z - z) / life + Math.cos(a) * 2], life,
        size: rand(0.05, 0.1), color: n % 3 ? '#8fdcff' : '#d8f4ff', drag: 0 });
    }
  };
  const t = performance.now() / 1000;
  for (const h of holes) {
    const open = Math.min(1, h.t / H.open), close = h.gone ? 0 : Math.min(1, Math.max(0, (h.life - h.t) / 0.5));
    if (h.gone) continue;
    draw(h, h, open * close, t * 2.5);
  }
  for (const x of exits) draw(x, x, Math.sin(Math.PI * Math.min(1, x.t / H.emerge)) * 0.9, -t * 3);
  for (const key of [...views.keys()]) if (!live.has(key)) dropView(key);
}
export function clearBlackHoles() { for (const key of [...views.keys()]) dropView(key); }
