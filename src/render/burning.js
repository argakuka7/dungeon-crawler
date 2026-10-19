// The player on fire (a Fire-face's fireball, game/enemycombat.js): flames licking up the
// body and a flickering orange light, then a wisp of smoke once it goes out.
import * as THREE from 'three';
import { scene } from './scene.js';
import { glow, soft, emit, rand, ring } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { FIRE_COLORS as COLORS } from './flames.js';
import { player } from '../game/state.js';

const holder = new THREE.Group(), light = new THREE.PointLight(0xff6a20, 0, 3, 2);
light.position.y = 0.6;
scene.add(holder);
let lit = false, smoke = 0, t = 0;

export function tickBurning(dt) {
  const on = !!player.burning;
  t += dt;
  if (on) smoke = 0.35;
  else if (smoke > 0) smoke -= dt;
  if (on !== lit) { lit = on; if (on) trackLight(light, holder); else untrackLight(light); }
  if (!on && smoke <= 0) return;
  const x = player.x, y = player.visY, z = player.z;
  holder.position.set(x, y, z);
  light.intensity = on ? 3.2 * (0.75 + 0.25 * Math.sin(t * 29) * Math.sin(t * 11)) : 0;
  if (on) {
    for (let i = Math.floor(110 * dt + Math.random()); i > 0; i--) {
      const [dx, dz] = ring(0.2);
      emit(glow, x + dx, y + rand(0.05, 0.75), z + dz, { v: [dx * 0.8, rand(0.8, 1.8), dz * 0.8], spread: 0.3,
        life: rand(0.25, 0.45), size: rand(0.1, 0.18), grow: -0.5, color: COLORS[i % 4], gravity: -2, drag: 1 });
    }
  } else if (Math.random() < 14 * dt) {
    const [dx, dz] = ring(0.15);
    emit(soft, x + dx, y + rand(0.4, 0.9), z + dz, { v: [0, rand(0.4, 0.8), 0], spread: 0.2, life: rand(0.7, 1.1),
      size: rand(0.15, 0.25), grow: 0.8, color: '#4a4440', alpha: 0.35, drag: 0.5 });
  }
}
// for checks
export const burningLit = () => lit;
