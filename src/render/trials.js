// What a trial room shows (docs/trials.md): its parts (the flood's button on the summit, made in
// code until the parts' assets come in), the rising fluid (one surface clipped to the cube's box:
// the room fills like an aquarium) and the tide lines on the glass that warn of it.
// buildTrialView adds them to a cube being built (render/world.js); game/trials.js sets the level
// and the parts' state every frame.
import * as THREE from 'three';
import { N, BASE, LH } from '../core/constants.js';
import { fluidMaterial, FLUID_LOOK } from './materials.js';
import { TRIALS } from '../core/trials.js';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

// the button: a stone pedestal with a glowing knob on top
function button(p, color) {
  const g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ color: 0x8c8f99, roughness: 0.85, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 8), stone);
  base.position.y = 0.35; base.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.08, 8), stone);
  cap.position.y = 0.74;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 }));
  knob.position.y = 0.78;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 24), glow(color, 0.35));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04;
  const light = new THREE.PointLight(color, 2.5, 4, 2);
  light.position.y = 1.1;
  g.add(base, cap, knob, halo, light);
  g.position.set(p.x, p.y, p.z);
  return { obj: g, knob, halo, light };
}

// tide lines: marks on the glass all round, every few levels up to where the water will stop
function tideLines(tl) {
  const pts = [], e = 0.03;
  for (let l = tl.from + 3; l <= tl.to; l += 3) {
    const y = l * LH;
    pts.push(e, y, e, N - e, y, e, N - e, y, e, N - e, y, N - e, N - e, y, N - e, e, y, N - e, e, y, N - e, e, y, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45, depthWrite: false }));
}

export function buildTrialView(m, group) {
  const t = m.trial;
  if (!t) return null;
  const color = new THREE.Color(TRIALS[t.kind].color);
  const view = { kind: t.kind, parts: new Map(), water: null, tide: null, level: null, phase: null };
  for (const p of t.parts || []) {
    if (p.type === 'button') { const b = button(p, color); group.add(b.obj); view.parts.set(p.id, b); }
  }
  if (t.kind === 'flood') {
    const fluid = t.fluid, water = new THREE.Mesh(new THREE.BoxGeometry(N - 0.04, 1, N - 0.04), fluidMaterial(fluid, 'full'));
    water.material.side = THREE.DoubleSide;
    water.userData.fluid = fluid; water.visible = false; water.renderOrder = 5;
    water.position.set(N / 2, 0, N / 2);
    group.add(water);
    view.water = water;
    view.tide = tideLines(t.timeline);
    group.add(view.tide);
  }
  return view;
}

// the fluid's surface at y (world units; null: none), the trial's phase (the tide lines show while idle)
export function setTrialWater(world, y, phase) {
  const v = world?.trialView;
  if (!v) return;
  v.level = y; v.phase = phase;
  if (v.tide) v.tide.visible = phase === 'idle' || phase === 'armed';
  if (!v.water) return;
  v.water.visible = y != null && y > -BASE + 0.01;
  if (!v.water.visible) return;
  const h = y + BASE;
  v.water.scale.y = h; v.water.position.y = -BASE + h / 2;
}

// the parts as the trial's state says (a pressed button sinks and goes green)
export function setTrialParts(world, s) {
  const v = world?.trialView;
  if (!v || !s) return;
  for (const [, b] of v.parts) {
    const done = s.phase === 'resolved';
    if (b.done === done) continue;
    b.done = done;
    b.knob.position.y = done ? 0.72 : 0.78;
    const c = new THREE.Color(done ? 0x6cff8a : TRIALS[v.kind].color);
    b.knob.material.color.copy(c); b.knob.material.emissive.copy(c); b.halo.material.color.copy(c); b.light.color.copy(c);
  }
}

export function tickTrialView(world, time) {
  const v = world?.trialView;
  if (!v) return;
  for (const [, b] of v.parts) {
    const pulse = b.done ? 0.2 : 0.5 + Math.sin(time * 3.2) * 0.25;
    b.halo.material.opacity = pulse; b.light.intensity = b.done ? 1 : 2 + Math.sin(time * 3.2) * 0.8;
  }
  if (v.tide?.visible) v.tide.material.opacity = 0.3 + Math.sin(time * 2) * 0.15;
  if (v.water?.visible) {
    const t = v.water.userData.fluid, motion = FLUID_LOOK[t].motion;
    if (!motion.bob) v.water.material.emissiveIntensity = FLUID_LOOK[t].emissiveIntensity * (1 + Math.sin(time * 2) * 0.1);
  }
}
