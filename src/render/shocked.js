// The player stunned by a Wolk's bolt (game/enemycombat.js): sparks crackling over the body and
// little arcs jumping between them, dying down as the stun wears off. Dazed: stars (tickDaze).
import { glow, emit, rand, ring } from './particles.js';
import { player } from '../game/state.js';

const COLORS = ['#ffffff', '#fff3a0', '#9fd0ff'];

export function tickShock(dt) {
  if (!(player.shocked > 0) || dt <= 0) return;
  player.shocked = Math.max(0, player.shocked - dt);
  const k = Math.min(1, player.shocked / 0.5), x = player.x, y = player.visY, z = player.z;
  for (let i = Math.floor(60 * k * dt + Math.random()); i > 0; i--) {
    const [dx, dz] = ring(0.28), h = rand(0.1, 1.2);
    emit(glow, x + dx, y + h, z + dz, { v: [rand(-1.5, 1.5), rand(-0.5, 1.5), rand(-1.5, 1.5)], life: rand(0.06, 0.14),
      size: rand(0.04, 0.08), color: COLORS[i % 3], drag: 4 });
  }
  if (Math.random() < 14 * k * dt) {   // a little arc: a quick line of sparks
    const [ax, az] = ring(0.25), [bx, bz] = ring(0.25), ay = rand(0.2, 1.1), by = ay + rand(-0.3, 0.3);
    for (let j = 0; j <= 5; j++) {
      const u = j / 5;
      emit(glow, x + ax + (bx - ax) * u + rand(-0.03, 0.03), y + ay + (by - ay) * u + rand(-0.03, 0.03), z + az + (bz - az) * u,
        { life: 0.07, size: 0.05, color: '#ffffff' });
    }
  }
}

// Squashed flat by a giant (game/enemycombat.js, a blow's `daze`): sitting dazed, little stars
// circle over the head, slowing and fading as the daze wears off.
const STARS = ['#fff6a0', '#ffffff', '#ffe066'];
let spin = 0;
export function tickDaze(dt) {
  if (!(player.dazed > 0) || dt <= 0) return;
  player.dazed = Math.max(0, player.dazed - dt);
  const k = Math.min(1, player.dazed / 0.6), n = 4, y = player.visY + 0.75;
  spin += dt * (3 + 3 * k);
  for (let i = 0; i < n; i++) {
    const a = spin + i * Math.PI * 2 / n, x = player.x + Math.cos(a) * 0.28, z = player.z + Math.sin(a) * 0.28;
    emit(glow, x, y + 0.05 * Math.sin(a * 2), z, { life: 0.12, size: 0.09 * (0.6 + 0.4 * k), color: STARS[i % 3], alpha: k });
    if (Math.random() < dt * 6) emit(glow, x, y, z, { v: [rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3)], life: 0.25, size: 0.04, color: '#ffffff', alpha: k });
  }
}
