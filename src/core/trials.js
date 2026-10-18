// Trials (docs/trials.md): rooms built around one goal that is more than walking to the exit.
// Pure rules and data, shared by the world (the plan), the generator, the game and the tests.
//
// Two families: events change the room while you are in it (timed, the room sealed, failing
// puts you back in the room before); puzzles are untimed and open (walk away, come back).
//
//   kind: { id, name (what the warning on the portal says), family: 'event' | 'puzzle',
//           sealed, timed, depths: [first, last], themes (theme ids it fits, null: any),
//           weight (when drawn among the kinds that fit), color, built (planned at all),
//           population (how many enemies live in the room, times the usual) }

export const TRIALS = {
  flood: { name: 'Rising water', family: 'event', sealed: true, timed: true, depths: [1, 19], themes: null, weight: 1, color: '#3fa8ff', built: true,
    population: 0.5 },
  sunken: { name: 'The sunken room', family: 'event', sealed: false, timed: false, depths: [2, 19], themes: null, weight: 1, color: '#3fd0c0' },
  collapse: { name: 'Crumbling floor', family: 'event', sealed: true, timed: true, depths: [1, 19], themes: null, weight: 1, color: '#e0a050' },
  cold: { name: 'Cold snap', family: 'event', sealed: true, timed: true, depths: [3, 10], themes: ['peaks', 'frozen'], weight: 1.5, color: '#9fe8ff' },
  storm: { name: 'The storm', family: 'event', sealed: true, timed: true, depths: [1, 6],
    themes: ['meadow', 'clouds', 'lagoon', 'karst', 'peaks', 'highlands', 'badlands', 'saltflats', 'canyon'], weight: 1, color: '#b0b8ff' },
  siege: { name: 'Hold the beacon', family: 'event', sealed: true, timed: true, depths: [2, 19], themes: null, weight: 1, color: '#ff7a3a' },
  chase: { name: 'The hunter', family: 'event', sealed: true, timed: true, depths: [4, 19], themes: null, weight: 1, color: '#ff4060' },
  drift: { name: 'The drifting gate', family: 'event', sealed: true, timed: true, depths: [3, 19], themes: null, weight: 1, color: '#d080ff' },
  miasma: { name: 'Sinking fog', family: 'event', sealed: true, timed: true, depths: [5, 19], themes: 'walled', weight: 1, color: '#9adf50' },
  slide: { name: 'Ice slide', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#bfe8ff' },
  mirror: { name: 'Mirror beam', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: ['mines', 'forge', 'ruins', 'abyss', 'highlands'], weight: 1.5, color: '#ffe060' },
  channels: { name: 'Rotating channels', family: 'puzzle', sealed: false, timed: false, depths: [1, 19],
    themes: ['grotto', 'cenote', 'lagoon', 'swamp', 'mines', 'forge', 'volcanic', 'meadow', 'karst', 'clouds', 'peaks', 'highlands', 'canyon', 'roots', 'frozen', 'hive', 'abyss'], weight: 1, color: '#50b0ff' },
  braziers: { name: 'Lights out', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#ffa040',
    lean: { ossuary: 2.5, ruins: 2.5 } },
  crates: { name: 'Crates on plates', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#c09060' },
  stones: { name: 'Sinking stones', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: ['lagoon', 'grotto', 'cenote', 'swamp', 'volcanic', 'abyss'], weight: 1.5, color: '#60e0b0' },
  sluices: { name: 'Sluices', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: ['grotto', 'cenote', 'lagoon', 'hive', 'mines'], weight: 1.5, color: '#40c8e0' },
  timedgate: { name: 'Timed gate', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#f0d0a0' },
  runes: { name: 'Rune order', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: ['ruins', 'highlands', 'ossuary', 'karst', 'abyss'], weight: 1.5, color: '#c0a0ff' },
  plates: { name: 'Two plates', family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#e0e0a0' },
};
for (const [id, t] of Object.entries(TRIALS)) t.id = id;
export const TRIAL_KINDS = Object.keys(TRIALS);

// a trial resolved is its gate in run.unlockedGates (core/guardians.js portalLocked)
export const trialGate = key => `trial:${key}`;
export const isTrialGate = g => typeof g === 'string' && g.startsWith('trial:');
export const trialOf = kind => TRIALS[kind] ?? null;
export const isEvent = kind => TRIALS[kind]?.family === 'event';
export const isPuzzle = kind => TRIALS[kind]?.family === 'puzzle';

// does kind fit depth d of theme `theme` (themes/index.js)? force: the dev's ?trial= lifts the limits
export function trialFits(kind, d, theme, force = false) {
  const t = TRIALS[kind];
  if (!t) return false;
  if (force) return true;
  if (!t.built || d < t.depths[0] || d > t.depths[1]) return false;
  if (t.themes === 'walled') return !!(theme.cave || theme.walls);
  return !t.themes || t.themes.includes(theme.props);
}

// the weight of a kind in theme `theme`
export const trialWeight = (kind, theme) => TRIALS[kind].weight * (TRIALS[kind].lean?.[theme.props] ?? 1);

// ?trial=<kind> or ?trial=sunken:slide,mirror (dev, tests): { kind, stages } or null
export function parseForce(s) {
  if (!s) return null;
  const [kind, rest] = String(s).split(':');
  if (!TRIALS[kind]) return null;
  return { kind, stages: rest ? rest.split(',').filter(k => isPuzzle(k)) : null };
}
