// The player stunned by a Wolk's bolt (game/enemycombat.js): sparks crackling over the body and
// little arcs jumping between them, dying down as the stun wears off.
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
