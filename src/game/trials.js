// Running a trial room (docs/trials.md): the state of the trial in the cube we are in
// (state.trial, core/trials.js), the rising fluid, the HUD, the parts the action key uses
// (game/action.js), resolving and resetting it.
//   state.trial: { key, kind, phase, t, done, at } (core/trials.js newTrial) or null
import { LH } from '../core/constants.js';
import { TRIALS, ARM_DISTANCE, ARM_TIME, PART_REACH, newTrial, stepTrial, resolveTrial, resetTrial, trialFluidLevel,
  nextPulse, floodEnd, trialSealed } from '../core/trials.js';
import { setTrialFluid } from '../physics/fluid.js';
import { setTrialWater, setTrialParts, setTrialBarriers } from '../render/trials.js';
import { openedSides } from '../core/boundaries.js';
import { setPortalSeals } from '../render/world.js';
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { log } from './log.js';
import { allEnemies } from './enemies.js';
import { refreshOpenFaces, spawnEntry, backBeforeTrial, besidePortal } from './flow.js';
import { path as teachPath, label as teachLabel } from './teach.js';

const $ = id => document.getElementById(id);
const SEALED = 'The portals are sealed.';
export const trialHere = () => state.trial;
const mapTrial = () => state.map?.trial ?? null;
const resolvedIn = (map, run) => !!map?.trial && run.unlockedGates.has(map.trial.gate);

// coming into a cube (game/flow.js enterCube): its trial, as built or resolved for good
export function enterTrial(map) {
  state.trial = map?.trial ? newTrial(map.trial, resolvedIn(map, state.run)) : null;
  showTrial(true);
}

// is the room we are in sealed? (game/portals.js, the scrolls, the teleports)
export const sealedIn = () => trialSealed(state.trial);

// the faces whose portals are sealed: every one while an event runs, else the exit until the
// trial is resolved
export function sealedDirs() {
  const s = state.trial, m = mapTrial();
  if (!s || !m || s.phase === 'resolved') return [];
  if (trialSealed(s)) return state.map.portals.filter(p => p.kind === 'side').map(p => p.dir);
  return m.exit == null ? [] : [m.exit];
}

// where a save made while sealed comes back in: the room before, beside its portal into the trial
// room (null: that room's map is not here)
export function beforeTrialSpot() {
  const m = mapTrial();
  if (!sealedIn() || !m) return null;
  const c = state.cubes?.cubes.get(m.from);
  return c ? { cube: m.from, arrival: besidePortal(c.map, m.fromDir) } : null;
}

// the trial room put back as it was (a death in it, game/flow.js; /trial reset)
export function restartTrial() {
  if (!state.trial || state.trial.phase === 'resolved') return;
  resetTrial(state.trial);
  showTrial();
}

// what the trial's fluid and parts look like now, and what the physics knows of the fluid
export const refreshTrialView = () => showTrial(true);
function showTrial(immediate = false) {
  const m = mapTrial(), s = state.trial, level = trialFluidLevel(m, s);
  if (m) {
    const dirs = sealedDirs();
    setPortalSeals(state.world, dirs, immediate);
    setTrialBarriers(state.world, trialSealed(s) ? dirs : [], openedSides(state.openedFaces, state.cubeKey));
  }
  setTrialFluid(level == null ? null : { y: level * LH, fluid: m.fluid });
  setTrialWater(state.world, level == null ? null : level * LH, s?.phase ?? null);
  setTrialParts(state.world, s);
  hud();
}

// one step of the trial in the cube we are in (main.js, after the player and the enemies)
export function updateTrial(dt) {
  const s = state.trial, m = mapTrial();
  if (!s || !m) return;
  const away = player.hp > 0 && !!state.arrival && Math.hypot(player.x - state.arrival.x, player.z - state.arrival.z) > ARM_DISTANCE;
  const happened = stepTrial(s, dt, { away });
  if (happened === 'armed') {
    setStatus(`${TRIALS[s.kind].name}! ${SEALED}`);
    banner(TRIALS[s.kind].name, 'The water is coming. Climb to the summit and press the button.');
    sfx('rumble'); sfx('gate', { delay: 0.4 });
  }
  if (happened === 'running') sfx('rumble', { pitch: 0.7 });
  showTrial();
  drown(m, s);
}

// enemies under the trial's fluid drown (no reward: the water took them)
function drown(m, s) {
  const level = trialFluidLevel(m, s);
  if (level == null) return;
  for (const e of allEnemies()) {
    if (e.mode === 'dead' || e.hp <= 0 || e.y > level * LH - 0.15) continue;
    e.noReward = true; e.hp = 0; e.mode = 'dead'; e.deadT = 0; e.path = null; e.speed = 0;
  }
}

// --- parts (game/action.js 'part') ---------------------------------------------------------------

// the part the player stands at, if any: { id, type, label, x, y, z }
export function partInReach() {
  const m = mapTrial(), s = state.trial;
  if (!m?.parts || !s || s.phase === 'resolved') return null;
  let best = null, bestD = PART_REACH;
  for (const p of m.parts) {
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < bestD && Math.abs(p.y - player.y) < 1.2) { best = p; bestD = d; }
  }
  return best && { ...best, label: partLabel(best) };
}
const partLabel = p => ({ button: 'Press the button' })[p.type] ?? 'Use it';

// the action key on part p
export function usePart(p) {
  if (p.type === 'button') { sfx('clink'); resolve(); return true; }
  return false;
}

// The goal is met: the gate into the run (saved, shared, respected by discovery like a guardian's),
// the seals open, the fluid drains back, the chronicle notes it.
export function resolve() {
  const s = state.trial, m = mapTrial();
  if (!s || !m || s.phase === 'resolved') return false;
  resolveTrial(s, trialFluidLevel(m, s));
  state.run.unlockedGates.add(m.gate);
  refreshOpenFaces();
  sfx('unlock'); sfx('levelUp', { delay: 0.2 });
  setStatus(`${TRIALS[m.kind].name}: done! The way on is open`);
  banner('Well done!', 'The water drains away.');
  log('trial', { name: TRIALS[m.kind].name, depth: state.map.depth, what: 'resolved' }, { share: true });
  showTrial();
  return true;
}

// --- the HUD: the banner on arming, the trial's line while it runs -------------------------------

let bannerUntil = 0;
function banner(title, text) {
  const el = $('trial-banner');
  if (!el) return;
  el.querySelector('b').textContent = title; el.querySelector('span').textContent = text;
  el.hidden = false; el.classList.remove('out');
  bannerUntil = performance.now() + 3200;
}

function hud() {
  const el = $('trial-hud'), s = state.trial, m = mapTrial();
  if (!el) return;
  if (bannerUntil && performance.now() > bannerUntil) { $('trial-banner').classList.add('out'); bannerUntil = 0; }
  const show = !!s && !!m && (s.phase === 'armed' || s.phase === 'running');
  el.hidden = !show;
  if (!show) return;
  $('trial-name').textContent = TRIALS[s.kind].name;
  let line = '', fill = 0;
  if (s.kind === 'flood') {
    const tl = m.timeline, next = nextPulse(tl, s.t);
    if (s.phase === 'armed') line = `The water comes in ${Math.ceil(ARM_TIME - s.t)}…`;
    else line = next != null ? `The water rises in ${Math.ceil(next - s.t)} s` : 'The water rises…';
    fill = Math.min(1, s.t / floodEnd(tl));
  }
  $('trial-line').textContent = line;
  $('trial-bar').style.width = `${Math.round(fill * 100)}%`;
}

// the dev's /trial win | fail | reset | solve on the trial of this room (game/devcommands.js)
export function devTrial(what) {
  const s = state.trial, m = mapTrial();
  if (!s || !m) return 'No trial in this room';
  if (what === 'win') return resolve() ? `${TRIALS[m.kind].name}: resolved` : 'Resolved already';
  if (what === 'reset') {
    if (s.phase === 'resolved') { state.run.unlockedGates.delete(m.gate); s.phase = 'idle'; }
    restartTrial(); return `${TRIALS[m.kind].name}: back as built`;
  }
  if (what === 'fail') { failTrial('The trial is lost'); return `${TRIALS[m.kind].name}: failed`; }
  if (what === 'solve') return solveLens();
  return `Unknown: ${what}`;
}

// Failing an event in a way of its own (later kinds: blown off, frozen, grabbed; /trial fail): back
// where the room was entered, the room as it was
export function failTrial(reason) {
  const s = state.trial, m = mapTrial();
  if (!s || !m || s.phase === 'resolved') return;
  log('trial', { name: TRIALS[m.kind].name, depth: state.map.depth, what: 'failed' });
  if (sealedIn()) { backBeforeTrial(reason); return; }
  setStatus(reason);
  restartTrial();
  spawnEntry();
}

// /trial solve: what the generator proved, as a lens over the room (game/teach.js): the timed way
// up, each step with when a slow player leaves it and when it goes under
function solveLens() {
  const m = mapTrial();
  if (!m?.check?.path) return 'Nothing proved for this trial';
  const pts = m.check.path.map(p => ({ x: p.x, y: p.y, z: p.z }));
  teachPath(pts, { id: 'trial-solve', color: TRIALS[m.kind].color, width: 0.07, head: true, ttl: 60 });
  m.check.path.forEach((p, i) => {
    if (i % 3 && i !== m.check.path.length - 1) return;
    teachLabel({ x: p.x, y: p.y, z: p.z }, `${p.t.toFixed(1)} s${p.dl != null ? ` · under at ${p.dl.toFixed(1)} s` : ' · safe'}`,
      { id: `trial-solve-${i}`, size: 0.16, ttl: 60 });
  });
  return `The way up: ${m.check.path.at(-1).t.toFixed(1)} s walking, slack ${m.check.slack} s (shown for a minute)`;
}
