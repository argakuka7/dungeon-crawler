// The events with actors of their own (docs/trials.md): `siege` (waves for the beacon's ring) and
// `chase` (the hunter on the way behind you). Stepped from game/trials.js updateTrial; the game that
// owns the trial (net/trials.js) spawns the waves and counts the hold (the trial's bits, told to
// the others); each game checks its own player against the hunter.
import { ARM_TIME, TRIALS, SIEGE, holdTime, HUNTER, hunterAt } from '../core/trials.js';
import { ENEMY_KINDS, isRanged, makeEnemy, coinRange, depthLevel } from '../core/enemies.js';
import { swarmKind } from '../core/hordes.js';
import { DEPTH_SPAWNS } from '../core/spawns.js';
import { hordeKinds, hordeSize } from '../world/hordes.js';
import { walkable, groundY } from '../physics/enemynav.js';
import { mulberry32, hash32 } from '../core/util.js';
import { hashString } from '../core/gear/drops.js';
import { player, state, setStatus } from './state.js';
import { addEnemies, removeEnemies, mirroring, allEnemies } from './enemies.js';
import { online } from '../net/online.js';
import { hurt } from './flow.js';
import { sfx } from '../audio/sfx.js';
import { setHunter } from '../render/trials.js';

const bodies = () => [player, ...online.buddies.filter(b => b.here && b.hp > 0)].filter(b => b.hp > 0);

// --- siege ---------------------------------------------------------------------------------------

let raiders = new Set(), attempt = 0;
// the room put back (a fail, a death, coming in): the attackers gone
export function resetEvents() {
  if (raiders.size) { const ids = raiders; removeEnemies(e => ids.has(e.id)); }
  raiders = new Set(); attempt++;
}

// the depth's light kinds (the horde's) and its heaviest that fights up close
function waveKinds(depth) {
  const light = hordeKinds(depth).map(k => ENEMY_KINDS[k]).filter(Boolean).map(k => swarmKind(k, 0.5));
  const roster = DEPTH_SPAWNS[Math.min(depth, DEPTH_SPAWNS.length - 1)].roster.flatMap(r => Object.keys(r.kinds)).map(k => ENEMY_KINDS[k])
    .filter(k => k && !k.boss && !isRanged(k));
  const heavy = roster.sort((a, b) => b.hp - a.hp)[0] ?? light[0];
  return { light: light.length ? light : [ENEMY_KINDS.snake], heavy };
}

function spawnWave(m, s, k) {
  const depth = state.map.depth, R = mulberry32(hash32(hashString(m.key) ^ Math.imul(k + 1, 0x9e37) ^ attempt));
  const [lo, hi] = hordeSize(depth), n = Math.round((lo + hi) / 2 / SIEGE.waves), { light, heavy } = waveKinds(depth), level = depthLevel(depth);
  const ring = state.map.floors.filter(f => Math.hypot(f.x + 0.5 - m.ring.x, f.z + 0.5 - m.ring.z) <= m.ring.r && walkable(f, 0.9) && !f.fluid);
  const mouths = [m.mouths[k % m.mouths.length], m.mouths[(k + 1) % m.mouths.length]];
  const list = [];
  for (let i = 0; i < n + (k === SIEGE.waves - 1 ? 1 : 0); i++) {
    const kind = i === n ? heavy : light[Math.floor(R() * light.length)], mouth = mouths[i % 2];
    const f = state.map.floors.filter(g => !g.fluid && Math.hypot(g.x + 0.5 - mouth.x, g.z + 0.5 - mouth.z) < 1.6 && walkable(g, kind.height ?? 0.9))
      .sort((a, b) => Math.hypot(a.x + 0.5 - mouth.x, a.z + 0.5 - mouth.z) - Math.hypot(b.x + 0.5 - mouth.x, b.z + 0.5 - mouth.z))[i % 3] ?? null;
    if (!f || !ring.length) continue;
    const [clo, chi] = coinRange(kind, level), id = `trial:${m.key}:siege${attempt}:${k}:${i}`;
    const e = makeEnemy({ id, level, coinDrop: Math.round((clo + chi) / 4), kind, f, x: f.x + 0.5, y: groundY(f, f.x + 0.5, f.z + 0.5), z: f.z + 0.5,
      yaw: Math.atan2(m.ring.x - f.x - 0.5, m.ring.z - f.z - 0.5) }, kind, i);
    e.siege = m.key;   // (kept out of a guardian room's posting, game/defence.js)
    e.defence = { post: ring[Math.floor(R() * ring.length)], engage: true };
    raiders.add(id); list.push(e);
  }
  addEnemies(list);
  sfx('rumble', { volume: 0.4 });
  setStatus(k === 0 ? 'They are coming from the dark!' : `Wave ${k + 1} of ${SIEGE.waves}!`);
}

// in the ring: a body within its radius, about its level
const inRing = (m, b) => Math.hypot(b.x - m.ring.x, b.z - m.ring.z) <= m.ring.r + 0.3 && Math.abs(b.y - m.ring.y) < 1.5;
export function stepSiege(m, s, dt, resolve) {
  if (m.kind !== 'siege' || s.phase !== 'running') return;
  // they go straight for the players (whoever is about, to their floor or where they can strike
  // them from); with no way to anyone, they make for their posts in the ring
  for (const e of allEnemies()) if (raiders.has(e.id) && e.defence) e.defence.engage = true;
  if (mirroring()) return;
  const hold = holdTime(state.map.depth);
  if (bodies().some(b => inRing(m, b))) s.bits.hold = Math.min(hold, (s.bits.hold ?? 0) + dt);
  const want = Math.min(SIEGE.waves, Math.floor((s.bits.hold ?? 0) / hold * SIEGE.waves) + 1);
  while ((s.bits.wave ?? 0) < want) { spawnWave(m, s, s.bits.wave ?? 0); s.bits.wave = (s.bits.wave ?? 0) + 1; }
  if ((s.bits.hold ?? 0) >= hold) {   // the beacon flares: whoever is left flees into the mouths
    const ids = raiders;
    removeEnemies(e => ids.has(e.id) && e.mode !== 'dead');
    raiders = new Set();
    resolve();
  }
}
// lighting the beacon starts it (the clock, the seals): not stepping off the pad
export function lightBeacon(s) {
  if (s.phase !== 'idle') return false;
  s.phase = 'armed'; s.t = 0; s.bits.hold = 0; s.bits.wave = 0;
  return true;
}

// --- chase -----------------------------------------------------------------------------------------

// the hunter where the clock says; within reach of us it grabs: the owner's grab fails the trial
// (everyone back), another's grab is that player's death (back in the room before)
export function stepChase(m, s, dt, failTrial) {
  if (m.kind !== 'chase') return;
  const out = s.phase === 'running' && s.t >= ARM_TIME, h = out ? hunterAt(m.hunterPath, s.t) : null;
  setHunter(state.world, h, s.phase === 'resolved');
  if (!h || player.hp <= 0) return;
  if (Math.hypot(player.x - h.x, player.z - h.z) < HUNTER.grab && Math.abs(player.y - h.y) < 1.5) {
    sfx('rumble', { pitch: 0.6 });
    if (mirroring()) hurt(player.hp + 1, 'Caught by the hunter');
    else failTrial('The hunter caught you');
  }
}
// how far behind us it is along its way (cells), for the HUD
export function hunterGap(m, s) {
  const h = hunterAt(m.hunterPath, s.t), path = m.hunterPath;
  let best = 0, bd = Infinity;
  path.forEach((p, i) => { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd) { bd = d; best = i; } });
  return Math.max(0, best - h.at);
}

// the HUD's line for these kinds: { line, fill } (null: not one of them)
export function eventHud(m, s) {
  if (s.kind === 'siege') {
    if (s.phase === 'idle') return { line: 'Light the beacon when you are ready, then hold its ring', fill: 0 };
    const hold = holdTime(state.map.depth), k = (s.bits.hold ?? 0) / hold;
    if (s.phase === 'armed') return { line: 'The beacon blazes: something stirs in the dark…', fill: 0 };
    return { line: bodies().some(b => inRing(m, b)) ? `Hold the ring: ${Math.floor(k * 100)}%` : `Get back in the ring! (${Math.floor(k * 100)}%)`, fill: k };
  }
  if (s.kind === 'chase') {
    if (s.phase === 'armed') return { line: 'Something is breaking through the wall behind you…', fill: 0 };
    const h = hunterAt(m.hunterPath, s.t);
    return { line: `Run! It is ${hunterGap(m, s)} cells behind you: pull the lever past the portcullis`, fill: Math.min(1, h.at / m.hunterPath.length) };
  }
  return null;
}
export const EVENT_HOW = {
  siege: 'Hold the beacon\'s ring against the waves!',
  chase: 'Something that cannot be hurt is coming. Run, and drop the portcullis on it!',
};
export const EVENT_DONE = {
  siege: 'The beacon flares: they flee into the dark.',
  chase: 'The portcullis crashes down on the hunter.',
};
export const isActorEvent = kind => kind === 'siege' || kind === 'chase';
export { TRIALS };
