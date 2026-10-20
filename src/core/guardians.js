// Run-persistent guardian gates. Terrain/encounter identity never depends on unlock state.
import { DIRS } from './constants.js';

export const GUARDIAN_COLOR = '#ff3fa8';
export const DESCENT_GUARDIAN_COLOR = '#ff9b35';
export const guardianColor = role => role === 'descent' ? DESCENT_GUARDIAN_COLOR : GUARDIAN_COLOR;
// Over its bar a guardian shows its kind's name (core/enemies.js): a side guardian's
// 'Guardian Spider', a descent guardian's 'Temp Boss Spider' (it holds the place of a boss to
// come), a real boss's own name (core/bosses.js).
export const guardianTitle = (role, label) => `${role === 'descent' ? '♛' : '◆'} ${label}`;
const bossName = boss => boss ? boss[0].toUpperCase() + boss.slice(1) : null;
// The guardian of map, as a message names it: a boss by his name, any other by its kind's label
// (game/enemyspawn.js guardianKind), else by its tier. label: the guardian kind's, if known.
function guardianCalled(map, label) {
  if (map.guardian?.boss) return bossName(map.guardian.boss);
  return `the ${label ?? (map.guardian?.role === 'descent' ? 'Temp Boss' : 'guardian')}`;
}
export const guardianLockMessage = (map, label = null) =>
  `Defeat ${guardianCalled(map, label)} to unlock this ${map.guardian?.role === 'descent' ? 'descent' : 'passage'}`;
export const guardianId = key => `${key}:guardian`;
// what a locked portal (towards dir) says: a guardian's, or an annex's sealed one (world/layout.js);
// label: this arena's guardian's (a gate of another cube's guardian says only 'the guardian')
export function lockMessage(map, dir, label = null) {
  const gate = map?.gateKeys?.[dir];
  if (gate?.startsWith('annex:')) return 'Sealed. Somebody on this depth may know the way in.';
  if (gate && gate !== map.key) return 'Defeat the guardian to unlock this passage';
  return guardianLockMessage(map, label);
}
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
export const guardianName = (map, label = null) => {
  const s = guardianCalled(map, label);
  return s[0].toUpperCase() + s.slice(1);
};
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
