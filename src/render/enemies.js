// Physics owns attack/death timers. Animation is sampled from those same timers,
// so loading late, interrupting a swing or sliding a cube cannot desynchronise hits.
// Hovering species run their idle loop on time. Fire and the Triangle's glow live here
// too (GLOW): a light that follows the body, flames (bones named flame*) that keep
// flickering over whatever clip plays, an emissive pulse and drifting embers.
// An enemy kind (core/enemies.js) is drawn with its species' model, recoloured
// (recolor.js), stripped of the parts it hides and scaled by its size; its `light` and `sparks`
// replace the glow's colours, and its `fx` names a glow of its own. The body is one mesh with
// one material that colours each part (material) on its own (enemymodel.js): the hit flash,
// hover tint and gloom write the parts' colours, the glow pulse and the death fade the material.
// Wheels (bones named wheel.*, a species with a `wheel` radius) spin by the distance the body
// rolls along its heading, whatever clip plays, and spin down once it is dead.
// Waves (bones named wave0, wave1, ..., a species with `waves`: the Wolla's rings) turn about
// their own axes, every other one the other way, so the crests run round the body; they whirl
// faster while it gathers its storm and blows, and still once it is dead. Its storm cloud's
// lightning (the attack's `thunder` times) flashes a light, and it leaves a wet trail
// (trails.js).
// A kind's `finish` ({ parts, roughness, metalness, sheen, glints }: the Wolk's silver descent
// guardian) polishes the materials of those parts: smoother, a little metallic, with a faint sheen
// of their own colour (the scene has no environment to mirror, so they stay mostly diffuse),
// and white glints twinkle on its body `glints` times a second.
// Gloom (a species with `gloom`: the Wolk): the materials of its `gloom.parts` darken towards
// `gloom.color` while it gathers its lightning, flicker with it inside and flash at the strike,
// then lighten again, and as it dies.
// Tentacles (bones named tentacle<i>_<j>, a species that `flail`s: Gusto) shake like crazy on
// top of whatever clip plays, each its own way, the tips most; they calm down as it dies. Its
// eyes flare while it winds up an attack (`flare` in GLOW).
// Clouds: a boss's proxy that is felled, and a body that goes away (mode 'gone') or comes back,
// jumps across the level or first turns up as a proxy or a summoned minion, does so in a puff
// of cloud (game/gusto.js). While it splits (mode 'split') it shudders, steaming.
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { spiderModel } from './spidermodel.js';
import { stunderModel } from './stundermodel.js';
import { snakeModel } from './snakemodel.js';
import { octonautModel } from './octonautmodel.js';
import { fireFaceModel } from './firefacemodel.js';
import { triangleModel } from './trianglemodel.js';
import { fireCatModel } from './firecatmodel.js';
import { shrapsModel } from './shrapsmodel.js';
import { spicyModel } from './spicymodel.js';
import { wollaModel } from './wollamodel.js';
import { wolkModel } from './wolkmodel.js';
import { gustoModel } from './gustomodel.js';
import { sfx } from '../audio/sfx.js';
import { trackLight, untrackLight } from './lightpool.js';
import { glow, soft, emit, rand } from './particles.js';
import { wetTrail, removeTrail } from './trails.js';
import { dressEnemy, paintParts } from './enemymodel.js';
import { attackOf, makeEnemy, ENEMY_KINDS } from '../core/enemies.js';
import { toLinear } from '../core/oklch.js';
import { guardianColor, guardianTitle } from '../core/guardians.js';
import { player } from '../game/state.js';
import { makeBar, makeLevelLabel, makeAlertMark } from './bars.js';

const prefabs = { spider: spiderModel, stunder: stunderModel, snake: snakeModel, octonaut: octonautModel,
  fireface: fireFaceModel, triangle: triangleModel, firecat: fireCatModel, shraps: shrapsModel, spicy: spicyModel, wolla: wollaModel, wolk: wolkModel, gusto: gustoModel };
// the models of these species (core/spawns.js speciesIn), loaded once
export const loadSpecies = species => Promise.all(species.map(s => prefabs[s]?.load()));
// light: [color, intensity, distance, height]; pulse: emissive / light swing with the
// clip's beat (twice per hover loop); embers: per second, rising from `from` (a bone, or
// a height above the body); flicker: extra flame motion
const GLOW = {
  fireface: { light: [0xff6a20, 4, 4.5, 0.75], flicker: 1, embers: { rate: 7, from: 0.95, spread: 0.25 } },
  triangle: { light: [0xa45cff, 2.6, 3.5, 0.85], pulse: 0.7 },
  firecat: { light: [0xff7a2a, 1.6, 2.6, 0.75], flicker: 1, embers: { rate: 5, from: 'flame_tail', spread: 0.06 } },
  fireshraps: { light: [0xff6a20, 2.4, 3.5, 1.35], flicker: 1, embers: { rate: 6, from: 'flame0_a', spread: 0.15 } },
  gusto: { light: [0xff3020, 1.8, 3.5, 1.75], flare: 1.6 },
};
const EMBERS = ['#ffd25a', '#ff8a2a', '#ff5a14'];
const GHOST = 0xff6a5a, GHOST_OPACITY = 0.4;
const tmp = new THREE.Vector3(), wobble = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0);
let clock = 0;
const white = new THREE.Color(0xffffff), hover = new THREE.Color(0xffd9a0), inverseYaw = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const spin = new THREE.Quaternion(), from = new THREE.Vector3(), to = new THREE.Vector3();
// the wheel bones and the axle each spins about, in its own frame (found in the rest pose)
function findWheels(model) {
  const bones = ['wheel.L', 'wheel.R'].map(n => model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n)));
  if (bones.some(b => !b)) return null;
  model.updateMatrixWorld(true);
  bones[0].getWorldPosition(from); bones[1].getWorldPosition(to);
  const axle = from.sub(to).normalize();   // left to right: model +x, the way a forward roll turns
  return bones.map(bone => ({ bone, axis: axle.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()) }));
}
function spinWheels(v, e, dt) {
  if (!v.wheels) return;
  if (e.mode === 'dead') v.spin *= Math.exp(-dt * 1.2);
  else if (dt > 1e-4 && v.rolled) {
    const d = (e.x - v.rolled.x) * Math.sin(e.yaw) + (e.z - v.rolled.z) * Math.cos(e.yaw);
    v.spin = Math.abs(d) < 0.5 ? d / dt / (e.profile.wheel || 0.15) : 0;   // a jump (a slid cube) is not a roll
  }
  v.rolled = { x: e.x, z: e.z };
  v.roll = (v.roll + v.spin * dt) % (2 * Math.PI);
  for (const w of v.wheels) w.bone.quaternion.multiply(spin.setFromAxisAngle(w.axis, v.roll));
}
// the wave bones (wave0, wave1, ...) and the axis each turns about, in its own frame: the
// body's up in the rest pose
function findWaves(model) {
  const bones = [];
  for (let b; (b = model.getObjectByName('wave' + bones.length));) bones.push(b);
  if (!bones.length) return null;
  model.updateMatrixWorld(true);
  return bones.map((bone, i) => ({ bone, angle: 0, dir: i % 2 ? -1 : 1, rate: 1 + 0.12 * i,
    axis: up.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()) }));
}
// how much faster the waves run: gathering the storm, then blowing it, then calming down
function whirl(e) {
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (!a?.gust) return e.mode === 'dead' ? 0 : 1;
  const blow = a.hitAt, end = blow + a.gust.time;
  if (e.t < blow) return 1 + 2 * Math.min(1, e.t / blow);
  return e.t < end ? 5 : 1 + 4 * Math.exp(-(e.t - end) * 4);
}
function turnWaves(v, e, dt) {
  if (!v.waves) return;
  const speed = e.profile.waves ?? 1;
  v.whirl += (whirl(e) - v.whirl) * Math.min(1, dt * (e.mode === 'dead' ? 1.5 : 6));
  for (const w of v.waves) {
    w.angle = (w.angle + w.dir * w.rate * speed * v.whirl * dt) % (2 * Math.PI);
    w.bone.quaternion.multiply(spin.setFromAxisAngle(w.axis, w.angle));
  }
}
// The storm cloud's lightning: a light that flares at each of the attack's thunder times and
// dies away, shining only while it flares.
function thunder(v, e) {
  const g = e.mode === 'attack' ? attackOf(e).gust : null;
  let k = 0;
  if (g) for (const at of g.thunder) if (e.t >= at) k = Math.max(k, Math.exp(-(e.t - at) * 9) * (0.7 + 0.3 * Math.sin(e.t * 83)));
  if (k > 0.03 && !v.flash) {
    v.flash = new THREE.PointLight(0xfff0b0, 0, 5 * v.size, 2); v.flash.position.y = 1.45 * v.size;
    trackLight(v.flash, v.group);
  }
  if (!v.flash) return;
  v.flash.intensity = 8 * k;
  if (k <= 0.03) { untrackLight(v.flash); v.flash = null; }
}
// how dark its cloud is (0..1): darkening up to just before the strike, dark through it, then
// lightening again until the attack is over
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function gloomOf(e) {
  if (e.mode !== 'attack') return 0;
  const a = attackOf(e), hit = a.hitAt, end = a.attackTime ?? e.profile.attackTime;
  return e.t < hit + 0.15 ? ease(e.t / (hit - 0.2)) : 1 - ease((e.t - hit - 0.15) / (end - hit - 0.15));
}
// lightning inside the cloud while it gathers (sparse flickers, more as the strike nears), and
// the flash of the strike itself
function glimmer(e, v) {
  if (e.mode !== 'attack') return 0;
  const hit = attackOf(e).hitAt;
  if (e.t >= hit) return Math.exp(-(e.t - hit) * 10);
  const n = Math.sin(e.t * 53 + v.seed) * Math.sin(e.t * 31 + 2 * v.seed);
  return n > 0.82 - 0.25 * e.t / hit ? 0.5 : 0;
}
const tint = new THREE.Color(), spark = new THREE.Color(0xf2f6ff);
// the colour each material shows before the hit flash and the hover tint
function baseColor(v, m) {
  if (!m.gloom || v.gloom < 0.001 && v.glimmer < 0.001) return m.color;
  return tint.copy(m.color).lerp(v.gloomColor, v.gloom).lerp(spark, v.glimmer * 0.6);
}
function gloomStep(v, e, dt) {
  if (!v.gloomColor) return;
  const dead = e.mode === 'dead';
  v.gloom += ((dead ? 0 : gloomOf(e)) - v.gloom) * Math.min(1, dt * (dead ? 2.5 : 10));
  v.glimmer = dead ? 0 : glimmer(e, v);
}
function polish(part, { roughness = 0.2, metalness = 0.5, sheen = 0 }) {
  part.roughness = roughness; part.metalness = metalness;
  if (sheen) part.emissive.copy(part.color).multiplyScalar(sheen);
}
function glints(v, e, dt) {
  const rate = e.profile.finish?.glints;
  if (!rate || Math.hypot(e.x - player.x, e.z - player.z) > 12) return;
  const s = Math.sin(v.yaw), c = Math.cos(v.yaw), h = e.profile.height, w = e.profile.radius;
  for (let i = Math.floor(rate * dt + Math.random()); i > 0; i--) {
    const lx = rand(-1, 1) * w, lz = rand(-0.5, 0.5) * w, p = v.group.position;
    emit(glow, p.x + lx * c + lz * s, p.y + rand(0.7, 0.95) * h, p.z - lx * s + lz * c,
      { life: rand(0.18, 0.3), size: rand(0.08, 0.13), grow: -0.6, color: '#ffffff', alpha: 0.95 });
  }
}
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// the tentacles' own frantic shaking, on top of the clip (life: 1 alive, down to 0 dead)
const flailAxis = new THREE.Vector3(1, 0, 0), flailAxis2 = new THREE.Vector3(0, 0, 1);
function flail(v, e, life) {
  if (!v.tentacles.length || life <= 0) return;
  const t = clock + v.seed, k = (e.profile.flail ?? 1) * life * (e.mode === 'split' ? 1.8 : 1);
  for (const { bone, i, j } of v.tentacles) {
    const amp = k * (0.2 + 0.14 * j);
    const a = amp * (Math.sin(t * (11 + i * 1.3) + i * 2.1 + j * 0.9) + 0.5 * Math.sin(t * (23 + i * 0.7) + i));
    const b = amp * (Math.sin(t * (13 + i * 0.9) + i * 1.3 + j * 1.4) + 0.4 * Math.sin(t * (29 - i) + 2 * i));
    bone.quaternion.multiply(wobble.setFromAxisAngle(flailAxis, a)).multiply(wobble.setFromAxisAngle(flailAxis2, b));
  }
}
// a puff of cloud where e is (a proxy felled, a body gone or come back)
const PUFF = { colors: ['#ffffff', '#e8edf5', '#cdd3de'], size: 1 }, MINION_PUFF = { colors: ['#e0f6ff', '#9fdcff', '#ffffff'], size: 0.5 };
function poof(e, look = PUFF, x = e.x, z = e.z) {
  const s = look.size, h = e.profile.height * 0.5, y = e.y + h, c = look.colors;
  if (Math.hypot(x - player.x, z - player.z) > 18) return;
  emit(glow, x, y, z, { life: 0.25, size: 1.4 * s, grow: 1.5, color: '#ffffff', alpha: 0.6 });
  for (let i = 0; i < 26 * s + 6; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.3, 1) * s, up = rand(-0.4, 1);
    emit(soft, x + Math.cos(a) * r * 0.4, y + up * h * 0.6, z + Math.sin(a) * r * 0.4, { v: [Math.cos(a) * rand(1, 2.6) * s, rand(0.2, 1.6), Math.sin(a) * rand(1, 2.6) * s],
      life: rand(0.5, 0.9), size: rand(0.25, 0.45) * s, grow: 1.4, color: c[i % c.length], alpha: 0.75, drag: 2.2 });
  }
  for (let i = 0; i < 10 * s + 4; i++)
    emit(glow, x, y, z, { v: [rand(-2.5, 2.5) * s, rand(-0.5, 2.5), rand(-2.5, 2.5) * s], life: rand(0.25, 0.5), size: rand(0.05, 0.09),
      color: i % 2 ? '#ffffff' : c[1], gravity: 3, drag: 2 });
  sfx('poof', { at: { x, y, z }, pitch: s < 1 ? 1.5 : 1 });
}
// what changed since the last frame that shows as a cloud: gone, back, or a jump (not a cube's slide:
// positions are the cube's own)
function clouds(v, e) {
  const w = v.was, gone = e.mode === 'gone';
  if (gone !== (w.mode === 'gone') && w.mode !== 'dead') poof(e, e.summoned ? MINION_PUFF : PUFF, gone ? w.x : e.x, gone ? w.z : e.z);
  else if (!gone && Math.hypot(e.x - w.x, e.z - w.z) > 1.5) { poof(e, PUFF, w.x, w.z); poof(e); }
  w.mode = e.mode; w.x = e.x; w.z = e.z;
}
// splitting: shaking, steaming
function shudder(v, e, dt) {
  const k = 0.06 * v.size;
  v.group.position.x += rand(-k, k); v.group.position.z += rand(-k, k);
  if (Math.random() < dt * 30) emit(soft, e.x + rand(-0.6, 0.6), e.y + rand(0.8, 2.2), e.z + rand(-0.6, 0.6),
    { v: [rand(-0.4, 0.4), rand(0.4, 1.2), rand(-0.4, 0.4)], life: rand(0.5, 0.8), size: rand(0.2, 0.35), grow: 1.4, color: '#eef2f8', alpha: 0.5, drag: 1 });
}

function makeView(e, prefab) {
  const group = new THREE.Group(), { model, mesh, material, parts } = dressEnemy(prefab, e.profile), size = e.profile.size ?? 1;
  model.scale.multiplyScalar(size);
  group.add(model); scene.add(group);
  material.transparent = true;   // fades out once dead
  const gloom = e.profile.gloom;
  const named = roles => new Set((roles ?? []).flatMap(role => e.profile.parts?.[role] ?? [role]));
  const gloomy = named(gloom?.parts), finish = e.profile.finish, polished = named(finish?.parts);
  for (const p of parts) {
    if (polished.has(p.name)) polish(p, finish);
    p.gloom = gloomy.has(p.name);
  }
  paintParts(material, parts);
  // silhouette shown where the body is hidden behind terrain (like the player's); drawn
  // before the body, so it never shows the body's own back parts through its front
  const ghost = new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: GHOST_OPACITY,
    depthFunc: THREE.GreaterDepth, depthWrite: false });
  const silhouette = new THREE.SkinnedMesh(mesh.geometry, ghost);
  silhouette.bind(mesh.skeleton, mesh.bindMatrix);
  silhouette.renderOrder = -1; silhouette.boundingSphere = mesh.boundingSphere;
  silhouette.userData.sharedGeo = true;
  mesh.add(silhouette);   // same world transform as the body
  // actions: walk, fast?, death and one per attack clip (keyed like attack.clip, else 'attack')
  const mixer = new THREE.AnimationMixer(model), actions = {}, weights = {};
  const clips = { walk: prefab.walk, fast: prefab.fast, death: prefab.death, ...prefab.attacks };
  for (const [name, clip] of Object.entries(clips)) if (clip) {
    const a = mixer.clipAction(clip);
    if (name !== 'walk' && name !== 'fast') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.play(); a.timeScale = 0; a.setEffectiveWeight(name === 'walk' ? 1 : 0); actions[name] = a;
    weights[name] = name === 'walk' ? 1 : 0;
  }
  const color = guardianColor(e.guardianRole);
  const hpBar = makeBar(e.guardian ? { color, w: e.guardianRole === 'descent' ? 1.2 : .9 } : {}), bar = hpBar.group;
  bar.position.y = e.profile.height + 0.12; group.add(bar);
  const label = makeLevelLabel(e.level, e.guardian ? { color, title: guardianTitle(e.guardianRole, e.boss && e.profile.label) } : {});
  label.position.y = e.profile.height + .33; group.add(label);
  const mark = makeAlertMark(); mark.position.y = e.profile.height + .62; group.add(mark);
  const fx = GLOW[e.profile.fx ?? e.profile.species] ?? (e.guardian ? { light: [color, 2, 3, .5], pulse: .35 } : null), flames = [];
  model.traverse(o => { if (o.isBone && /^flame/.test(o.name)) flames.push(o); });
  let light = null;
  if (fx?.light) {
    const [color, intensity, distance, y] = fx.light;
    light = new THREE.PointLight(e.profile.light ?? color, intensity, distance * size, 2); light.position.y = y * size;
    trackLight(light, group);
  }
  const embers = typeof fx?.embers?.from === 'string' ? model.getObjectByName(fx.embers.from) : null;
  const tentacles = [];
  if (e.profile.flail) model.traverse(o => { const m = o.isBone && /^tentacle(\d+)_(\d+)$/.exec(o.name); if (m) tentacles.push({ bone: o, i: +m[1], j: +m[2] }); });
  if (e.proxy || e.summoned) poof(e, e.summoned ? MINION_PUFF : PUFF);   // it turns up
  return { tentacles, was: { mode: e.mode, x: e.x, z: e.z }, group, model, mixer, actions, prefab, material, parts, colors: material.userData.parts.color, ghost, bar, hpBar, label, mark, markT: 0, yaw: e.yaw, phase: e.phase,
    attacks: -1, dead: false, weights, fx, flames, light, embers, size, wheels: findWheels(model), roll: 0, spin: 0, rolled: null, waves: findWaves(model), whirl: 1, flash: null, trail: null, sparks: e.profile.sparks ?? EMBERS, seed: Math.random() * 100,
    gloomColor: gloom ? new THREE.Color(...toLinear(gloom.color)) : null, gloom: 0, glimmer: 0 };
}
// the hover clip's beat (matches blender/triangle.py): sharp, twice per loop
const beat = phase => (0.5 + 0.5 * Math.cos(2 * Math.PI * 2 * phase)) ** 6;
function glowFx(v, e, dt, life) {
  const fx = v.fx, t = clock + v.seed;
  if (!fx) return;
  if (fx.flicker && life > 0) v.flames.forEach((b, i) => {   // on top of the clip's own flicker
    b.scale.multiplyScalar(1 + 0.1 * Math.sin(t * 13 + i * 2.1) * Math.sin(t * 5.3 + i));
    b.quaternion.multiply(wobble.setFromAxisAngle(axis, 0.12 * Math.sin(t * 9 + i * 1.7)));
  });
  const swing = fx.pulse ? 1 + fx.pulse * (beat(v.phase) - 0.3) : 0.82 + 0.18 * Math.sin(t * 23) * Math.sin(t * 7.1);
  if (v.light) v.light.intensity = fx.light[1] * swing * life;
  if (fx.pulse) v.material.emissiveIntensity = (0.6 + 0.4 * life) * swing;   // every part's glow (times its own strength)
  if (fx.flare) {   // eyes flaring up to the strike
    const a = e.mode === 'attack' ? attackOf(e) : null, up = a ? Math.min(1, e.t / Math.max(0.1, a.hitAt)) : 0;
    v.material.emissiveIntensity = life * (1 + fx.flare * up * up);
    if (v.light) v.light.intensity *= 1 + fx.flare * up * up;
  }
  if (fx.embers && life > 0.3 && Math.hypot(e.x - player.x, e.z - player.z) < 12)
    for (let i = Math.floor(fx.embers.rate * dt * life + Math.random()); i > 0; i--) {
      const s = fx.embers.spread;
      if (v.embers) v.embers.getWorldPosition(tmp); else tmp.set(v.group.position.x, v.group.position.y + fx.embers.from * v.size, v.group.position.z);
      emit(glow, tmp.x + rand(-s, s), tmp.y + rand(0, s), tmp.z + rand(-s, s), { v: [rand(-0.2, 0.2), rand(0.6, 1.3), rand(-0.2, 0.2)],
        spread: 0.2, life: rand(0.5, 0.9), size: rand(0.04, 0.07), color: v.sparks[i % v.sparks.length], gravity: -0.3, drag: 0.8 });
    }
}
function dying(v, e, dt, off) {
  if (e.proxy) {   // up in a cloud, nothing left
    if (!v.dead) { v.dead = true; if (v.was.mode !== 'gone') poof(e); }
    v.group.visible = false;
    return;
  }
  if (!v.dead) {
    v.dead = true;
    for (const a of Object.values(v.actions)) a.setEffectiveWeight(0);
    v.actions.death.reset().play().setEffectiveWeight(1);
    v.actions.death.timeScale = 0;
  }
  v.actions.death.time = Math.min(e.deadT, v.actions.death.getClip().duration);
  const fade = Math.max(0, 1 - Math.max(0, e.deadT - e.profile.deathTime - 0.5) / 0.8);
  gloomStep(v, e, dt);
  v.material.opacity = fade;
  v.parts.forEach((p, i) => { if (p.gloom) v.colors[i].copy(baseColor(v, p)); });
  v.ghost.opacity = GHOST_OPACITY * fade;
  v.bar.visible = false; v.label.visible = false; v.mark.visible = false;
  v.group.visible = fade > 0;
  v.mixer.update(0);
  spinWheels(v, e, dt); turnWaves(v, e, dt); thunder(v, e); wetTrail(v, e, dt, off);
  flail(v, e, Math.max(0, 1 - e.deadT / (e.profile.deathTime * 0.5)));
  glowFx(v, e, 0, Math.max(0, 1 - e.deadT / e.profile.deathTime) * fade);   // the glow dies with it
}
export function animateEnemies(list, dt, off = { x: 0, y: 0, z: 0 }) {
  clock += dt;
  for (const e of list) {
    const prefab = prefabs[e.profile.species];
    if (!prefab?.ready) { prefab?.load(); continue; }   // not loaded before (a friend's, a dev spawn): shown once it is
    const v = e.view || (e.view = makeView(e, prefab)), A = v.actions;
    // A ram commits to its direction before contact; visuals must match the hit cone.
    v.yaw = e.mode === 'attack' ? e.yaw : angleTo(v.yaw, e.yaw, Math.min(1, dt * 14));
    v.group.position.set(e.x + off.x, e.y + off.y, e.z + off.z);
    v.group.rotation.y = v.yaw;
    if (e.mode === 'dead') { dying(v, e, dt, off); continue; }
    clouds(v, e);
    v.group.visible = e.mode !== 'gone';
    if (e.mode === 'gone') { if (v.light) v.light.intensity = 0; continue; }
    if (e.mode === 'split') shudder(v, e, dt);
    const attack = e.mode === 'attack', strike = A[attackOf(e).clip ?? 'attack'];
    if (attack && v.attacks !== e.attacks) {
      v.attacks = e.attacks; strike.reset().play(); strike.timeScale = 0;
    }
    // a bigger body takes longer strides
    const walkSpeed = prefab.walkSpeed * v.size, fastSpeed = prefab.fastSpeed * v.size;
    const fast = A.fast ? THREE.MathUtils.clamp((e.speed - walkSpeed) / (fastSpeed - walkSpeed), 0, 1) : 0;
    const stride = walkSpeed * A.walk.getClip().duration * (1 - fast)
      + (A.fast ? fastSpeed * A.fast.getClip().duration * fast : 0);
    if (e.profile.hover) v.phase = (v.phase + dt / A.walk.getClip().duration) % 1;   // keeps hovering
    else if (!attack && e.speed > 0.01) v.phase = (v.phase + dt * e.speed / stride) % 1;
    else if (!attack) v.phase = 0; // idle on both planted feet, not frozen mid-step
    A.walk.time = v.phase * A.walk.getClip().duration;
    if (A.fast) A.fast.time = v.phase * A.fast.getClip().duration;
    if (attack) strike.time = Math.min(e.t, strike.getClip().duration);
    for (const name in A) {
      const target = name === 'walk' ? (attack ? 0 : 1 - fast) : name === 'fast' ? (attack ? 0 : fast) : +(attack && A[name] === strike);
      v.weights[name] += (target - v.weights[name]) * Math.min(1, dt * 18);
      A[name].setEffectiveWeight(v.weights[name]);
    }
    const flash = Math.min(0.6, e.hurtT / 0.22 * 0.6);
    gloomStep(v, e, dt);
    v.parts.forEach((p, i) => v.colors[i].copy(baseColor(v, p)).lerp(flash > 0.1 || !e.hovered ? white : hover, Math.max(flash, e.hovered ? 0.22 : 0)));
    v.bar.visible = !!e.guardian || !!e.hovered || !e.hordeId && e.hp < e.profile.hp;
    v.label.visible = v.bar.visible || !e.hordeId && Math.hypot(e.x - player.x, e.z - player.z) < e.profile.aggro + 1;
    inverseYaw.setFromAxisAngle(up, -v.yaw);
    v.bar.quaternion.copy(inverseYaw).multiply(camera.quaternion);
    v.hpBar.set(e.hp / e.profile.hp);
    // "!" while it reacts to noticing you: pops up, then shrinks away once it gives chase
    v.markT = e.mode === 'alert' ? Math.min(v.markT + dt * 8, 1) : Math.max(v.markT - dt * 2, 0);
    v.mark.visible = v.markT > 0;
    v.mark.scale.setScalar(0.5 * (e.mode === 'alert' ? 1 + 0.35 * Math.sin(Math.PI * v.markT) : v.markT));
    v.mixer.update(0);
    spinWheels(v, e, dt); turnWaves(v, e, dt); thunder(v, e); wetTrail(v, e, dt, off); flail(v, e, 1);
    glowFx(v, e, dt, 1); glints(v, e, dt);
  }
}
// An enemy of each of these kinds made once off-screen, for the shaders it is drawn with
// (render/warmup.js, render/cubeassets.js): its body, silhouette, bar, label and the puddle a
// wet one leaves. Each kind once (the programs stay), and only kinds whose model is in.
// -> { objects to compile, dispose() }
const warmed = new Set(), ORIGIN = { x: 0, y: 0, z: 0 };
export function enemyWarmup(kinds) {
  const list = [];
  for (const k of kinds) {
    const kind = ENEMY_KINDS[k], prefab = kind && prefabs[kind.species];
    if (warmed.has(k) || !prefab?.ready) continue;
    warmed.add(k);
    const e = makeEnemy({ id: 'warm:' + k, x: 0, y: 0, z: 0, yaw: 0, level: 1,
      ...(kind.guardian && { guardian: true, guardianRole: kind.guardianRole, boss: kind.boss }) }, kind);
    const v = e.view = makeView(e, prefab);
    scene.remove(v.group);
    if (v.light) untrackLight(v.light);   // (no light out of nowhere meanwhile)
    e.mode = 'dead'; wetTrail(v, e, 0, ORIGIN);
    for (const p of v.trail?.list ?? []) scene.remove(p.mesh);
    list.push(e);
  }
  return { objects: list.flatMap(e => [e.view.group, ...(e.view.trail?.list ?? []).map(p => p.mesh)]), dispose: () => removeEnemyViews(list) };
}

export function removeEnemyViews(list) {
  for (const e of list) if (e.view) {
    const v = e.view;
    scene.remove(v.group);
    if (v.light) untrackLight(v.light);
    if (v.flash) untrackLight(v.flash);
    removeTrail(v);
    v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.model);
    v.material.dispose();
    v.ghost.dispose();
    v.label.material.map.dispose(); v.label.material.dispose();
    const skeletons = new Set();
    v.model.traverse(o => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
    skeletons.forEach(s => s.dispose());
    e.view = null;
  }
}
