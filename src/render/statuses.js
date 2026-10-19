// Statuses that show (core/status.js): enemies on fire lick with flames, poisoned ones (and the
// poisoned player) seep green bubbles and a sickly mist. The player's own burning is
// render/burning.js.
import { glow, soft, emit, rand, ring } from './particles.js';
import { player } from '../game/state.js';
import { FIRE_COLORS } from './flames.js';

const FLAMES = FIRE_COLORS, GREENS = ['#c8ff7a', '#8fdc3c', '#5f9f2a'];

function flames(x, y, z, r, h, dt) {
  for (let i = Math.floor(70 * dt + Math.random()); i > 0; i--) {
    const [dx, dz] = ring(r);
    emit(glow, x + dx, y + rand(0.05, h), z + dz, { v: [dx * 0.8, rand(0.8, 1.6), dz * 0.8], spread: 0.3, life: rand(0.25, 0.4),
      size: rand(0.08, 0.15), grow: -0.5, color: FLAMES[i % 4], gravity: -2, drag: 1 });
  }
}
function poison(x, y, z, r, h, dt) {
  for (let i = Math.floor(18 * dt + Math.random()); i > 0; i--) {
    const [dx, dz] = ring(r);
    emit(glow, x + dx, y + rand(0.1, h), z + dz, { v: [0, rand(0.3, 0.7), 0], spread: 0.1, life: rand(0.4, 0.7), size: rand(0.04, 0.08),
      color: GREENS[i % 3], alpha: 0.85, drag: 1 });
  }
  if (Math.random() < 5 * dt) {
    const [dx, dz] = ring(r * 0.7);
    emit(soft, x + dx, y + rand(0.2, h), z + dz, { v: [0, rand(0.1, 0.3), 0], spread: 0.15, life: rand(0.7, 1), size: rand(0.2, 0.3),
      grow: 0.6, color: '#6fae2a', alpha: 0.25, drag: 0.6 });
  }
}

export function tickStatuses(enemies, dt) {
  if (dt <= 0) return;
  for (const e of enemies) {
    if (e.mode === 'dead' || (!e.burning && !e.toxic)) continue;
    const r = e.profile.radius * 0.8, h = e.profile.bodyHeight;
    if (e.burning) flames(e.x, e.y, e.z, r, h, dt);
    if (e.toxic) poison(e.x, e.y, e.z, r, h, dt);
  }
  if (player.toxic && !player.ragdoll) poison(player.x, player.visY, player.z, 0.25, 1, dt);
}
