// Projectiles in flight: the fireball / Triangle punch / ice ball meshes exported beside their thrower
// (enemymodel.js props), turned along the flight, each with a light and a particle trail.
// A thrower's kind recolours the mesh and replaces the light and trail colours.
import * as THREE from 'three';
import { scene } from './scene.js';
import { glow, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { fireFaceModel } from './firefacemodel.js';
import { triangleModel } from './trianglemodel.js';
import { shrapsModel } from './shrapsmodel.js';
import { kindColors, recolor } from './recolor.js';

const LOOKS = {
  fireball: { model: fireFaceModel, prop: () => fireFaceModel.props?.FireFaceBall, light: [0xff7424, 3.5, 3.5], trail: ['#ffd25a', '#ff8a2a', '#ff4a17'], rate: 90 },
  punch: { model: triangleModel, prop: () => triangleModel.props?.TrianglePunch, light: [0xa45cff, 2.5, 3], trail: ['#e2b8ff', '#9a55ff'], rate: 45 },
  // frost glitter falls off it rather than rising
  iceball: { model: shrapsModel, prop: () => shrapsModel.props?.ShrapsIceBall, light: [0x9fdcff, 2, 3], trail: ['#ffffff', '#c4ecff', '#7fc8ff'], rate: 50, gravity: 2.5 },
};
const ahead = new THREE.Vector3();

function makeView(pr) {
  const look = LOOKS[pr.kind], group = new THREE.Group(), src = look.prop();
  if (!src) look.model.load();   // (the thrower's model has it: loaded already, unless thrown by a friend's)
  const colors = kindColors(pr.profile, look.model), owned = [];
  const own = m => { const c = recolor(m.clone(), colors); owned.push(c); return c; };
  if (src) {
    const mesh = src.clone();
    if (colors) mesh.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); });
    group.add(mesh);
  }
  const [color, intensity, distance] = look.light, light = new THREE.PointLight(pr.profile?.light ?? color, intensity, distance, 2);
  scene.add(group); trackLight(light, group, group, 2);   // a pool light source, not in the scene
  return { group, light, look, trail: pr.profile?.sparks ?? look.trail, owned, base: intensity };
}
export function drawProjectiles(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const pr of list) {
    const v = pr.view || (pr.view = makeView(pr)), g = v.group;
    g.position.set(pr.x + off.x, pr.y + off.y, pr.z + off.z);
    g.lookAt(ahead.set(pr.vx, pr.vy, pr.vz).add(g.position));   // +Z along the flight
    if (pr.spec.spin) g.rotateZ(pr.t * pr.spec.spin);
    if (pr.kind === 'fireball') g.scale.setScalar(1 + 0.08 * Math.sin(pr.t * 40));
    v.light.intensity = v.base * (0.8 + 0.2 * Math.sin(pr.t * 31) * Math.sin(pr.t * 13));
    const colors = v.trail, n = Math.floor(v.look.rate * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const r = pr.spec.radius * 0.6;
      emit(glow, g.position.x + rand(-r, r), g.position.y + rand(-r, r), g.position.z + rand(-r, r), {
        v: [-pr.vx * 0.12 + rand(-0.3, 0.3), rand(0.2, 0.9), -pr.vz * 0.12 + rand(-0.3, 0.3)], life: rand(0.2, 0.4),
        size: rand(0.08, 0.15), color: colors[i % colors.length], drag: 2, gravity: v.look.gravity ?? -1 });
    }
  }
}
export function removeProjectileViews(list) {
  for (const pr of list) if (pr.view) {
    scene.remove(pr.view.group); untrackLight(pr.view.light);
    pr.view.owned.forEach(m => m.dispose()); pr.view = null;
  }
}
