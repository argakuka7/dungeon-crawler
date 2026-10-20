// The real bosses: each takes the place of one depth's descent guardian (the others stay boss
// placeholders, docs/guardians.md). depth -> the boss's kind (core/enemies.js BOSS_PROFILES):
// Gusto on the road out of town, Totnar a depth below, Squarlo below him, Flip below Squarlo,
// Foggery below Flip, Renew below Foggery.
// The layout marks that arena's guardian with `boss` (world/layout.js, cubegen/guardian.js); its
// spawn is the boss alone (game/enemyspawn.js guardianSpots), with no defenders. docs/bosses.md.
export const BOSSES = Object.freeze({ 0: 'gusto', 1: 'totnar', 2: 'squarlo', 3: 'flip', 4: 'foggery', 5: 'renew' });
export const bossAt = (depth, role = 'descent') => role === 'descent' ? BOSSES[depth] ?? null : null;
// How a boss's arena differs from its planned one (cubegen/guardian.js, cubegen/arenaprops.js):
// `braziers` lit round the fight zone, for a boss who makes it dark (Totnar; Renew, whose fight
// goes from dusk into night, in the arena his depth would have anyway); a `type` of its
// own (cubegen/arenashapes.js BOSS_SHAPES): Squarlo's tidal hills, where his tide comes and goes;
// Flip's box (cubegen/fliparena.js), which he turns any side up; Foggery's caldera of lava with
// his tower in the middle (cubegen/towerarena.js): its doorway stands `door` levels up, in the
// middle of its face (`centre`, world/faces.js), so you come in on a bridge over the lava.
export const BOSS_ARENAS = Object.freeze({ totnar: { braziers: 5 }, squarlo: { type: 'tidal' }, flip: { type: 'flip' },
  foggery: { type: 'tower', door: 8, centre: 7 }, renew: { braziers: 4 } });
