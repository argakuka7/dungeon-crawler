// The real bosses: each takes the place of one depth's descent guardian (the others stay boss
// placeholders, docs/guardians.md). depth -> the boss's kind (core/enemies.js BOSS_PROFILES):
// Gusto on the road out of town, Totnar a depth below, Squarlo below him.
// The layout marks that arena's guardian with `boss` (world/layout.js, cubegen/guardian.js); its
// spawn is the boss alone (game/enemyspawn.js guardianSpots), with no defenders. docs/bosses.md.
export const BOSSES = Object.freeze({ 0: 'gusto', 1: 'totnar', 2: 'squarlo' });
export const bossAt = (depth, role = 'descent') => role === 'descent' ? BOSSES[depth] ?? null : null;
// How a boss's arena differs from its planned one (cubegen/guardian.js, cubegen/arenaprops.js):
// `braziers` lit round the fight zone, for a boss who makes it dark (Totnar); a `type` of its
// own (cubegen/arenashapes.js BOSS_SHAPES): Squarlo's tidal hills, where his tide comes and goes.
export const BOSS_ARENAS = Object.freeze({ totnar: { braziers: 5 }, squarlo: { type: 'tidal' } });
