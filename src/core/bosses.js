// The real bosses: each takes the place of one depth's descent guardian (the others stay boss
// placeholders, docs/guardians.md). depth -> the boss's kind (core/enemies.js BOSS_PROFILES).
// The layout marks that arena's guardian with `boss` (world/layout.js, cubegen/guardian.js); its
// spawn is the boss alone (game/enemyspawn.js guardianSpots), with no defenders. docs/bosses.md.
export const BOSSES = Object.freeze({ 0: 'gusto' });
export const bossAt = (depth, role = 'descent') => role === 'descent' ? BOSSES[depth] ?? null : null;
