// Hit feedback: a brief hit pause, a camera nudge, sparks and ichor, damage numbers and
// sounds. Gameplay never depends on any of this.
import { player } from './state.js';
import { emit, glow, soft, rand } from '../render/particles.js';
import { floatText } from '../render/floattext.js';
import { sfx } from '../audio/sfx.js';

let stop = 0;
// world-space camera offset that springs back (camera.js)
export const kick = { x: 0, y: 0, z: 0 };

export function hitstop(seconds) { stop = Math.max(stop, seconds); }
// the frame's time scale: nearly frozen during a hit pause
// learn: combat.html#juice, loop.html#pause (see learn/README.md)
export function timeScale(elapsed) {
  if (stop <= 0) return 1;
  stop -= elapsed;
  return 0.03;
}
export function cameraKick(dx, dz, amount, dy = 0) {
  const l = Math.hypot(dx, dz) || 1;
  kick.x += dx / l * amount; kick.z += dz / l * amount; kick.y += dy;
}

// the player's blade hit enemy e for dmg (killed: that was the last of its health);
// (dx, dz): the direction of the blow; crit: a critical hit (a bigger, golden number); felt:
// our own hit (a friend's has no hit pause and does not nudge our camera)
// learn: architecture.html#swing-journey, combat.html#juice, loop.html#pause (see learn/README.md)
export function enemyHitFx(e, dmg, killed, dx, dz, crit = false, felt = true) {
  const l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l;
  const x = e.x - nx * e.profile.radius * 0.5, y = e.y + Math.min(e.profile.bodyHeight * 0.6, 0.7), z = e.z - nz * e.profile.radius * 0.5;
  const [c1, c2] = e.profile.ichor ?? ['#a6d84e', '#5f8f22'], n = killed ? 16 : 9;
  emit(glow, x, y, z, { life: 0.14, size: killed ? 0.8 : 0.55, grow: 0.8, color: '#ffc870', alpha: 0.9 });
  for (let i = 0; i < n; i++) {   // sparks fanning out along the blow
    const s = rand(2.5, 5.5), a = rand(-0.9, 0.9), cx = nx * Math.cos(a) - nz * Math.sin(a), cz = nz * Math.cos(a) + nx * Math.sin(a);
    emit(glow, x, y, z, { v: [cx * s, rand(0.5, 2.5), cz * s], life: rand(0.18, 0.32), size: rand(0.07, 0.11),
      color: i % 3 ? '#ffd27a' : '#ffffff', gravity: 9, drag: 3 });
  }
  for (let i = 0; i < n; i++) {   // ichor droplets
    const s = rand(1, 3);
    emit(soft, x, y, z, { v: [nx * s + rand(-0.8, 0.8), rand(1, 3), nz * s + rand(-0.8, 0.8)], life: rand(0.35, 0.6),
      size: rand(0.08, 0.14), color: i % 2 ? c1 : c2, alpha: 0.95, gravity: 11 });
  }
  const top = { x: e.x, y: e.y + e.profile.bodyHeight + 0.25, z: e.z };
  floatText(crit ? dmg + '!' : String(dmg), top, { color: crit ? '#ffd23a' : killed ? '#ffb347' : '#ffffff',
    size: crit ? 0.36 : killed ? 0.3 : 0.24, life: 0.8, rise: 0.9, drift: rand(-0.35, 0.35), pop: crit ? 1.1 : 0.7 });
  if (felt) { hitstop(killed ? 0.09 : 0.055); cameraKick(nx, nz, killed ? 0.16 : 0.08); }
  sfx(killed ? 'kill' : 'hit', { at: e, pitch: e.profile.pitch ?? 1.1 });
}

// an attack starts: a sword's whoosh, a bow's draw, a staff's wind-up (a crossbow is quiet until
// it shoots)
export function swingFx(kind = 'sword') {
  if (kind === 'sword') sfx('swing', { at: player, pitch: 0.9 + 0.2 * Math.random() });
  else if (kind === 'bow') sfx('draw', { at: player, volume: 0.8 });
  else if (kind === 'staff') sfx('swing', { at: player, pitch: 0.6, volume: 0.5 });
}

// the player's shot (core/shots.js) left ('launch'), or ended: 'hit' (an enemy stopped it),
// 'blocked' (the level), 'spent' (its range). Arrows and bolts knock into walls; spells burst
// in their colour wherever they end. A crossbow's reload: 'reload'
export function shotFx(shot, what) {
  const { x, y, z } = shot, spell = shot.kind === 'spell', color = shot.stats.color ?? '#c48cff';
  if (what === 'launch') { sfx(spell ? 'spell' : shot.kind === 'bolt' ? 'crossbow' : 'twang', { at: shot.ghost ? shot : player }); return; }
  if (what === 'reload') { sfx('reload', { at: player, volume: 0.8 }); return; }
  if (spell) {
    const r = Math.max(0.4, shot.stats.burst ?? 0.5), n = what === 'spent' ? 10 : 22;
    emit(glow, x, y, z, { life: 0.22, size: r * 1.6, grow: 1.2, color, alpha: 0.85 });
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(1.5, 3.5) * r;
      emit(glow, x, y, z, { v: [Math.cos(a) * s, rand(0.3, 2.2), Math.sin(a) * s], life: rand(0.25, 0.5), size: rand(0.06, 0.13),
        color: i % 3 ? color : '#ffffff', gravity: 2, drag: 3 });
    }
    sfx('burst', { at: shot, volume: what === 'spent' ? 0.5 : 0.8 });
    return;
  }
  if (what !== 'blocked') return;
  for (let i = 0; i < 7; i++)   // splinters and grit off the wall
    emit(soft, x, y, z, { v: [-shot.vx * 0.06 + rand(-1, 1), rand(0.5, 2), -shot.vz * 0.06 + rand(-1, 1)], life: rand(0.25, 0.45),
      size: rand(0.04, 0.08), color: i % 2 ? '#c9b48a' : '#8a7a62', alpha: 0.9, gravity: 9 });
  sfx('thunk', { at: shot, volume: 0.7 });
}

// the player took dmg from something at (fx, fz)
export function playerHurtFx(dmg, fx, fz) {
  floatText('-' + Math.ceil(dmg), q => q.set(player.x, player.visY + 1.3, player.z), { color: '#ff6a5a', size: 0.24, life: 0.9, rise: 0.7, pop: 0.6 });
  hitstop(0.05);
  cameraKick(player.x - fx, player.z - fz, 0.12, -0.05);
  sfx('hurt', { at: player });
}

// burn damage ticking while the player is on fire
export function burnHurtFx(dmg) {
  floatText('-' + Math.ceil(dmg), q => q.set(player.x, player.visY + 1.15, player.z), { color: '#ffa040', size: 0.2, life: 0.7, rise: 0.8,
    drift: rand(-0.3, 0.3), pop: 0.4 });
  sfx('sizzle', { at: player, volume: 0.7 });
}

// a projectile was thrown ('launch'), or ended: 'hit' (the player), 'blocked' (the level), 'spent'
export function projectileFx(pr, what) {
  const fire = pr.kind === 'fireball', ice = pr.kind === 'iceball', { x, y, z } = pr;
  if (what === 'launch') { sfx(fire ? 'fireball' : ice ? 'frost' : 'zap', { at: pr }); return; }
  const colors = fire ? ['#ffd25a', '#ff8a2a', '#ff4a17'] : ice ? ['#ffffff', '#c4ecff', '#7fc8ff'] : ['#f0d0ff', '#b57aff', '#7a3cff'];
  const n = what === 'spent' ? 6 : 18, s = what === 'spent' ? 1 : 2.6;
  emit(glow, x, y, z, { life: 0.18, size: what === 'spent' ? 0.35 : 0.7, grow: 1, color: colors[1], alpha: 0.9 });
  for (let i = 0; i < n; i++)
    emit(glow, x, y, z, { v: [rand(-s, s), rand(0.3, s), rand(-s, s)], life: rand(0.25, 0.5), size: rand(0.06, 0.12),
      color: colors[i % 3], gravity: fire ? 3 : 6, drag: 2 });
  if (fire) for (let i = 0; i < 3; i++)
    emit(soft, x, y + 0.1, z, { v: [rand(-0.3, 0.3), rand(0.4, 0.8), rand(-0.3, 0.3)], life: rand(0.8, 1.2), size: rand(0.2, 0.3),
      grow: 0.8, color: '#4a403a', alpha: 0.4, drag: 0.6 });
  if (ice) for (let i = 0; i < 3; i++)   // a puff of cold mist
    emit(soft, x, y, z, { v: [rand(-0.4, 0.4), rand(-0.1, 0.3), rand(-0.4, 0.4)], life: rand(0.6, 0.9), size: rand(0.2, 0.3),
      grow: 0.9, color: '#d8f2ff', alpha: 0.35, drag: 0.8 });
  if (what !== 'spent') sfx(fire ? 'whump' : ice ? 'icecrack' : 'shatter', { at: pr, volume: 0.8 });
}

// the Spicy's laser (game/beams.js) switched on ('start'), went off ('burst') or was put out
// because its enemy was staggered or killed ('fizzle')
export function beamFx(b, what) {
  const color = b.profile?.beamColor ?? b.spec.color ?? '#7dff3a', colors = ['#ffffff', color, '#d8ff7a'];
  if (what === 'start') { sfx('laser', { at: b }); return; }
  if (what === 'fizzle') {
    for (let i = 0; i < 6; i++)
      emit(glow, b.x, b.y, b.z, { v: [rand(-1, 1), rand(0, 1), rand(-1, 1)], life: rand(0.15, 0.3), size: rand(0.04, 0.08), color: colors[i % 3], drag: 2 });
    sfx('fizzle', { at: b, pitch: 1.4, volume: 0.6 });
    return;
  }
  // the burst: a flash where it ends, and the whole beam crackling apart
  const { ex: x, ey: y, ez: z } = b;
  emit(glow, x, y, z, { life: 0.22, size: 1.1, grow: 1.2, color, alpha: 0.9 });
  emit(glow, x, y, z, { life: 0.12, size: 0.6, grow: 1, color: '#ffffff', alpha: 0.9 });
  for (let i = 0; i < 26; i++)
    emit(glow, x, y, z, { v: [rand(-3.5, 3.5), rand(0.5, 4), rand(-3.5, 3.5)], life: rand(0.25, 0.55), size: rand(0.06, 0.13),
      color: colors[i % 3], gravity: 7, drag: 2 });
  for (let i = 0; i < 4; i++)   // a whiff of toxic smoke
    emit(soft, x, y + 0.1, z, { v: [rand(-0.3, 0.3), rand(0.4, 0.8), rand(-0.3, 0.3)], life: rand(0.8, 1.2), size: rand(0.22, 0.32),
      grow: 0.8, color: '#7a9a4a', alpha: 0.35, drag: 0.6 });
  for (let i = 0, n = Math.ceil(b.length / 0.25); i < n; i++) {
    const k = (i + Math.random()) / n;
    emit(glow, b.x + (x - b.x) * k, b.y + (y - b.y) * k, b.z + (z - b.z) * k, { v: [rand(-0.6, 0.6), rand(-0.2, 0.8), rand(-0.6, 0.6)],
      life: rand(0.15, 0.3), size: rand(0.06, 0.11), color: colors[i % 3], drag: 3 });
  }
  sfx('zapburst', { at: { x, y, z } });
  if (Math.hypot(x - player.x, z - player.z) < 3) cameraKick(x - player.x, z - player.z, 0.06, 0.02);
}

// poison ticking while the player is poisoned (core/status.js)
export function poisonHurtFx(dmg) {
  floatText('-' + Math.ceil(dmg), q => q.set(player.x, player.visY + 1.15, player.z), { color: '#9be05a', size: 0.2, life: 0.7, rise: 0.8,
    drift: rand(-0.3, 0.3), pop: 0.4 });
  sfx('poison', { at: player, volume: 0.6 });
}
// a burn or poison tick on enemy e (game/statuses.js); killed: that was the last of its health
const STATUS_COLOR = { burning: '#ffa040', toxic: '#9be05a' };
export function statusHurtFx(e, dmg, status, killed) {
  const top = { x: e.x, y: e.y + e.profile.bodyHeight + 0.2, z: e.z };
  floatText(String(dmg), top, { color: STATUS_COLOR[status], size: killed ? 0.26 : 0.19, life: 0.7, rise: 0.8, drift: rand(-0.3, 0.3), pop: 0.4 });
  if (killed) { sfx('kill', { at: e, pitch: e.profile.pitch ?? 1.1 }); hitstop(0.05); }
}

// a flask (game/throws.js) leaving the hand ('launch') or bursting ('burst') at (x, y, z):
// a blast flask explodes, a fire flask bursts into flames, a toxic one into a green cloud
export function flaskFx(f, what) {
  const s = f.stats, { x, y, z } = f;
  if (what === 'launch') { sfx('lob', { at: f.ghost ? f : player }); return; }
  const r = s.radius, color = s.color;
  sfx('glass', { at: f, volume: 0.8 });
  emit(glow, x, y + 0.2, z, { life: 0.2, size: r * 1.4, grow: 1.4, color, alpha: 0.85 });
  for (let i = 0; i < 14; i++)   // shards of glass
    emit(glow, x, y + 0.1, z, { v: [rand(-2.5, 2.5), rand(1, 3.5), rand(-2.5, 2.5)], life: rand(0.3, 0.55), size: rand(0.04, 0.07),
      color: i % 2 ? '#ffffff' : color, gravity: 12, drag: 1 });
  if (s.blast && !s.burn) {
    emit(glow, x, y + 0.3, z, { life: 0.14, size: r * 1.1, grow: 0.8, color: '#ffffff', alpha: 0.9 });
    for (let i = 0; i < 34; i++) {   // the fireball and its sparks fanning out
      const a = rand(0, Math.PI * 2), v = rand(2, 6) * r;
      emit(glow, x, y + 0.2, z, { v: [Math.cos(a) * v, rand(0.5, 3), Math.sin(a) * v], life: rand(0.25, 0.55), size: rand(0.07, 0.15),
        color: ['#fff0a0', '#ffd25a', '#ff8a2a'][i % 3], gravity: 5, drag: 2.5 });
    }
    for (let i = 0; i < 8; i++)
      emit(soft, x + rand(-0.4, 0.4) * r, y + 0.3, z + rand(-0.4, 0.4) * r, { v: [rand(-0.5, 0.5), rand(0.6, 1.4), rand(-0.5, 0.5)],
        life: rand(0.9, 1.4), size: rand(0.35, 0.55), grow: 1, color: '#3e3834', alpha: 0.45, drag: 0.8 });
    sfx('boom', { at: f });
    cameraKick(x - player.x, z - player.z, 0.1, -0.08);
    hitstop(0.04);
  } else if (s.burn) {
    for (let i = 0; i < 26; i++) {
      const [dx, dz] = [rand(-1, 1) * r, rand(-1, 1) * r];
      emit(glow, x + dx * 0.5, y + 0.1, z + dz * 0.5, { v: [dx * 1.5, rand(1, 3), dz * 1.5], life: rand(0.3, 0.6), size: rand(0.12, 0.22),
        grow: -0.4, color: ['#fff0a0', '#ffd25a', '#ff8a2a', '#ff4a17'][i % 4], gravity: -1, drag: 2 });
    }
    sfx('whump', { at: f });
  } else {
    for (let i = 0; i < 14; i++)
      emit(soft, x + rand(-0.5, 0.5) * r, y + rand(0.1, 0.5), z + rand(-0.5, 0.5) * r, { v: [rand(-1, 1), rand(0.2, 0.8), rand(-1, 1)],
        life: rand(0.8, 1.3), size: rand(0.3, 0.5), grow: 1.2, color: i % 2 ? '#8fdc3c' : '#5f9f2a', alpha: 0.45, drag: 1.2 });
    sfx('hiss', { at: f });
  }
}
