// Run-persistent guardian gates. Terrain/encounter identity never depends on unlock state.
import { DIRS } from './constants.js';

export const GUARDIAN_COLOR = '#ff3fa8';
export const DESCENT_GUARDIAN_COLOR = '#ff9b35';
export const guardianColor = role => role === 'descent' ? DESCENT_GUARDIAN_COLOR : GUARDIAN_COLOR;
// boss: a real boss's name (core/bosses.js), shown in place of the tier's
export const guardianTitle = (role, boss = null) => boss ? `♛ ${boss}` : role === 'descent' ? '♛ Descent guardian' : '◆ Side guardian';
const bossName = boss => boss ? boss[0].toUpperCase() + boss.slice(1) : null;
export const guardianLockMessage = map => map.guardian?.boss ? `Defeat ${bossName(map.guardian.boss)} to unlock this descent`
  : map.guardian?.role === 'descent' ? 'Defeat the descent guardian to unlock this descent'
  : 'Defeat the side guardian to unlock this passage';
export const guardianId = key => `${key}:guardian`;
// what a locked portal (towards dir) says: a guardian's, or an annex's sealed one (world/layout.js)
export const lockMessage = (map, dir) => map?.gateKeys?.[dir]?.startsWith('annex:')
  ? 'Sealed. Somebody on this depth may know the way in.' : guardianLockMessage(map);
export const gateLocked = (map, run) => !!map?.guardian && !run.unlockedGates.has(map.key);
export const portalLocked = (map, run, portal) => {
  const gate = portal.dir < 4 && map?.gateKeys?.[portal.dir];
  if (gate && !run.unlockedGates.has(gate)) return true;
  return portal.dir === map?.exit && gateLocked(map, run);
};

// Leaving a guardian's arena while the guardian lives (game/leavefight.js): any open side face
// out of it asks first, and only when the player steers out themselves (dx, dz: keys or a mouse
// order). A push (a blow, a gust, a throw) or a body that cannot act just presses against the
// face, so the fight stays in the arena.
export const leavingFight = (map, run, dir) => dir < 4 && gateLocked(map, run);
export const guardianName = map => map.guardian?.boss ? bossName(map.guardian.boss)
  : map.guardian?.role === 'descent' ? 'The descent guardian' : 'The side guardian';
export function steersOut(p, dir, dx, dz) {
  const [nx, nz] = DIRS[dir];
  return !p.ragdoll && !p.held && !p.getUp && !p.down && !(p.stun > 0) && p.hp > 0 && dx * nx + dz * nz > 0;
}

// Ordinary kills made during this visit roll back on death; an opened gate never does.
// learn: memory.html#death (see learn/README.md)
export function restoreDefeated(run, before) {
  const permanent = new Set([...run.unlockedGates].map(guardianId));
  for (const id of run.defeated) if (!before.has(id) && !permanent.has(id)) run.defeated.delete(id);
}
