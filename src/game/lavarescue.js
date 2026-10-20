// Falling into Foggery's lava (his caldera: map.tower, cubegen/towerarena.js) does not kill: it
// burns away a quarter of one's most health (core/foggery.js FOGGERY_FIGHT.rescue), and magic
// takes one out of it to safe ground: where one last stood if the lava is still well under it,
// else the nearest floor of the fight above it (the top of the tower, once nothing lower is
// safe), else (the lava over the top) the nearest of the floating platforms. Only if that quarter
// is all one has left does the lava kill, as everywhere else (game/ragdoll.js dieInFluid).
import { LH, LAVA } from '../core/constants.js';
import { player, state, setStatus } from './state.js';
import { spawnAt } from './flow.js';
import { flash } from './hud.js';
import { takeDamage } from '../core/progression.js';
import { FOGGERY_FIGHT } from '../core/foggery.js';
import { floorY } from '../core/surfaces.js';
import { supportedPoint } from '../physics/respawn.js';
import { moversNow } from '../physics/collide.js';
import { sfx } from '../audio/sfx.js';
import { emit, glow, soft, rand } from '../render/particles.js';

// how far over the lava a spot must stand to be safe (units): a floor of the top, just over it;
// any other, well over it (the lava may still be rising)
const OVER_TOP = 0.05, OVER = 1.6;

export const rescues = fluid => fluid === LAVA && !!state.map?.tower;

// -> true when the magic took the player out (the lava did not kill them)
export function lavaRescue(x = player.x, y = player.y, z = player.z) {
  const lose = Math.ceil(player.maxHp * FOGGERY_FIGHT.rescue);
  if (player.hp <= lose) return false;
  const spot = rescueSpot(x, y, z);
  if (!spot) return false;
  player.lastHurt = { reason: 'Burned by Foggery\'s lava!', by: null };
  takeDamage(player, lose, state.time);
  flash();
  sfx('burn', { at: { x, y, z } });
  sfx('portal', { at: spot, pitch: 1.4 });
  burst(x, y, z, ['#ffd25a', '#ff8a2a', '#ff4a17'], 1);
  spawnAt(spot.x, spot.y, spot.z);
  burst(spot.x, spot.y, spot.z, ['#ffffff', '#ffe9a0', '#9fdcff'], 0);
  setStatus('Burned by the lava! Magic pulls you out of it');
  return true;
}

function rescueSpot(x, y, z) {
  const lava = (state.tide ?? -Infinity) * LH;
  const ok = (s, top) => s && s.y > lava + (top ? OVER_TOP : OVER);
  const safe = player.safe, near = (a, b) => Math.hypot(a.x - x, (a.y - y) * 0.5, a.z - z) - Math.hypot(b.x - x, (b.y - y) * 0.5, b.z - z);
  const floors = state.map.floors.filter(f => f.encounter && f.tower).map(f => ({ f, x: f.x + 0.5, y: floorY(f, 0.5, 0.5), z: f.z + 0.5 }));
  const lastTop = safe && floors.some(o => o.f.tower === 'top' && Math.hypot(o.x - safe.x, o.z - safe.z) < 0.8 && Math.abs(o.y - safe.y) < 0.3);
  if (ok(safe, lastTop) && supportedPoint(safe.x, safe.y, safe.z)) return safe;
  for (const o of floors.filter(o => ok(o, o.f.tower === 'top')).sort(near)) {
    const p = supportedPoint(o.x, o.y, o.z);
    if (p) return p;
  }
  const platforms = moversNow().map(m => ({ x: (m.x0 + m.x1) / 2, y: m.y1, z: (m.z0 + m.z1) / 2 })).filter(o => o.y > lava + OVER_TOP).sort(near);
  return platforms[0] ?? null;
}

// a splash of lava where one fell in (up: 1), or a shimmer of magic where one comes out (0)
function burst(x, y, z, colors, up) {
  emit(glow, x, y + 0.5, z, { life: 0.4, size: 1.6, grow: 1.2, color: colors[1], alpha: 0.8 });
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.6, 2.4);
    emit(i % 3 ? glow : soft, x + Math.cos(a) * 0.3, y + rand(0, 1.1), z + Math.sin(a) * 0.3, { v: [Math.cos(a) * s, rand(1, 3.5) * (up ? 1.2 : 0.6), Math.sin(a) * s],
      life: rand(0.4, 0.9), size: rand(0.06, 0.14), color: colors[i % 3], alpha: 0.95, gravity: up ? 6 : -0.5, drag: 1.5 });
  }
}
