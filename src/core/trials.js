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
  collapse: { name: 'Crumbling floor', family: 'event', sealed: true, timed: true, depths: [1, 19], themes: null, weight: 1, color: '#e0a050', built: true,
    population: 0.3 },
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

// --- timing (docs/trials.md "Timing check") -----------------------------------------------------

export const ARM_TIME = 3;   // s of telegraph between arming and the clock running
export const SLACK = 1.5;    // a slow player: every arrival times this
export const DRAIN_TIME = 5;   // s for the water to drain back once resolved

// The flood's timeline: the water starts at `from` (levels) and rises in pulses of `step` levels,
// each over `rise` s, the j-th starting at pulses[j] s (the trial's clock: from arming), never over
// `to`. Pure data: physics, render and tests all read the same thing.
//   { kind: 'flood', from, to, step, rise, pulses: [s, ...] }
export const FLOOD = { step: 2, rise: 3, hold: 4, min: 50, max: 70 };

// the water's level (in levels, fractional) at time t of the trial's clock
export function floodLevel(tl, t) {
  let level = tl.from;
  for (let j = 0; j < tl.pulses.length; j++) {
    const p = tl.pulses[j];
    if (t <= p) break;
    level = tl.from + tl.step * j + tl.step * Math.min(1, (t - p) / tl.rise);
  }
  return Math.min(level, tl.to);
}

// the first time the water stands over level h (null: never)
export function floodTime(tl, h) {
  if (h < tl.from) return 0;
  if (h >= tl.to) return null;
  const j = Math.floor((h - tl.from) / tl.step);
  if (j >= tl.pulses.length) return null;
  return tl.pulses[j] + tl.rise * (h - tl.from - tl.step * j) / tl.step;
}

// when the next pulse starts after time t (null: no more), for the HUD's countdown
export const nextPulse = (tl, t) => tl.pulses.find(p => p > t) ?? null;
// the time the water is up (the last pulse done)
export const floodEnd = tl => (tl.pulses.at(-1) ?? 0) + tl.rise;

// draining back: from level `at` down to `from` over DRAIN_TIME, s seconds after resolving
export const drainLevel = (tl, at, s) => at - (at - tl.from) * Math.min(1, s / DRAIN_TIME);

// Fit a flood's pulses to the way up: needs[j] is the earliest the j-th pulse may start (a slow
// player has left every floor it floods by then). Pulses come one per rise + hold at the most,
// later where a need says so, stretched to last FLOOD.min s at least. null: it cannot be done
// within FLOOD.max s (the way up is too long).
export function fitFlood(from, to, needs = []) {
  const { step, rise, hold, min, max } = FLOOD, n = Math.max(1, Math.ceil((to - from) / step));
  const place = gap => {
    const out = [];
    for (let j = 0; j < n; j++) out.push(Math.max(needs[j] ?? 0, ARM_TIME, j ? out[j - 1] + gap : 0));
    return out;
  };
  let pulses = place(rise + hold);
  const end = () => pulses.at(-1) + rise;
  if (end() < min && n > 1) pulses = place(rise + hold + (min - end()) / (n - 1));
  if (end() < min) pulses = pulses.map(p => p + min - end());
  if (end() > max) return null;
  return { kind: 'flood', from, to, step, rise, pulses: pulses.map(p => Math.round(p * 100) / 100) };
}

// --- states (docs/trials.md "States") ------------------------------------------------------------
//   idle      the room as built; an event arms when a player steps off the arrival pad
//   armed     ARM_TIME s of telegraph: the banner, the rumble; nothing hurts yet
//   running   the clock runs (t, from arming on): the water rises
//   resolved  the goal is met; `done` counts the s since (the water drains back)
// One state per trial room a game is in: { key, kind, phase, t, done, at (the water's level when
// it was resolved) }. Puzzles never arm: they are just there.

export const ARM_DISTANCE = 1.2;   // cells off the arrival pad that arm an event
export const newTrial = (trial, resolved = false) => ({ key: trial.key, kind: trial.kind, phase: resolved ? 'resolved' : 'idle', t: 0,
  done: resolved ? Infinity : 0, at: null });

// One step of dt s. input: { away (a player stepped off the arrival pad) }. Returns what happened:
// 'armed', 'running' (the phase it came into), or nothing.
export function stepTrial(s, dt, input = {}) {
  if (s.phase === 'idle') {
    if (isEvent(s.kind) && input.away) { s.phase = 'armed'; s.t = 0; return 'armed'; }
    return null;
  }
  if (s.phase === 'resolved') { s.done += dt; return null; }
  s.t += dt;
  if (s.phase === 'armed' && s.t >= ARM_TIME) { s.phase = 'running'; return 'running'; }
  return null;
}

// Sealed (docs/trials.md "Sealing"): while an event of a sealed kind is armed or running, no
// portal, open face, scroll or teleport takes anyone out of its room
export const trialSealed = s => !!s && !!TRIALS[s.kind]?.sealed && (s.phase === 'armed' || s.phase === 'running');
export const SEALED_MESSAGE = 'The way out is sealed';

// the goal is met (level: the water's level then, for it to drain back from)
export function resolveTrial(s, level = null) {
  if (s.phase === 'resolved') return false;
  s.phase = 'resolved'; s.done = 0; s.at = level;
  return true;
}
// back as built (a fail, a death, nobody left in the room)
export function resetTrial(s) { Object.assign(s, { phase: 'idle', t: 0, done: 0, at: null }); }

// the level (in levels) the trial's fluid stands at in map trial `m` with state s, or null for none
export const BASIN = 2;   // the collapse's basin: its fluid's surface (cubegen/river.js RIVER_SURF)
export function trialFluidLevel(m, s) {
  if (!m || !s) return null;
  // the collapse: what falls through the crust is in the basin's fluid (its surface over every hole)
  if (m.kind === 'collapse') return s.phase === 'armed' || s.phase === 'running' ? BASIN : null;
  if (m.kind !== 'flood') return null;
  const tl = m.timeline;
  if (s.phase === 'idle') return null;
  if (s.phase === 'resolved') return s.at == null || s.done >= DRAIN_TIME ? null : drainLevel(tl, s.at, s.done);
  return floodLevel(tl, s.t);
}

export const PART_REACH = 1.1;   // how near a part (a button, a lever ...) has to be to use it (cells)

// About how long a trial room takes a player who knows what to do (s): the balance simulation's
// estimate (tools/balance.mjs). An event: its clock to the goal; a puzzle: walking it through.
export const TRIAL_TIME = { flood: 45, collapse: 30 };
export const trialTime = kind => TRIAL_TIME[kind] ?? 60;

// --- collapse ----------------------------------------------------------------------------------------
// The crust crumbles in a wave from the entry: a crust cell d cells (over the crust) from the entry
// apron goes at ARM_TIME + delay + d / speed, shaking for SHAKE s before. The delay is fitted per
// room (cubegen/trials/index.js): as little as lets a slow player outrun it, plus a margin.
export const WAVE = { speed: 1.3, margin: 0.5, most: 8, shake: 1.5 };
export const crumbleTime = (wave, d) => ARM_TIME + wave.delay + d / wave.speed;

// is crust cell q ({ d }) of trial m gone at state s? (shaking: the SHAKE s before)
export function crustState(m, s, q) {
  if (!s || s.phase === 'idle' || s.phase === 'resolved') return 'whole';
  const at = crumbleTime(m.wave, q.d);
  return s.t >= at ? 'gone' : s.t >= at - WAVE.shake ? 'shaking' : 'whole';
}
