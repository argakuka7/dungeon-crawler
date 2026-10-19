// Running a trial room (docs/trials.md): the state of the trial in the cube we are in
// (state.trial, core/trials.js), the rising fluid, the HUD, the parts the action key uses
// (game/action.js), resolving and resetting it.
//   state.trial: { key, kind, phase, t, done, at } (core/trials.js newTrial) or null
import * as THREE from 'three';
import { LH, N } from '../core/constants.js';
import { step } from '../world/coords.js';
import { camera } from '../render/scene.js';
import { pointer } from './pointer.js';
import { TRIALS, ARM_DISTANCE, ARM_TIME, PART_REACH, fogY, fogLevel, fogHurt, COLD, coldStep, STORM, stormPhase, newTrial, stepTrial, resolveTrial, resetTrial, trialFluidLevel,
  nextPulse, floodEnd, trialSealed, trialGate, crustState, PART_LABELS, slideStop, fieldIn, isRock, isPuzzle, useBit, plateHeld, sinkStage,
  traceBeam, allLit, pressBrazier, pushTarget, clueMark } from '../core/trials.js';
import { groundAt } from '../physics/collide.js';
import { setTrialFluid } from '../physics/fluid.js';
import { setTrialWater, setTrialParts, setTrialBarriers, setCrust, setGridParts, setTrialFog, setStorm } from '../render/trials.js';
import { setGoneFloors, setPartBlockers } from '../physics/collide.js';
import { openedSides } from '../core/boundaries.js';
import { setPortalSeals } from '../render/world.js';
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { log } from './log.js';
import { allEnemies, mirroring } from './enemies.js';
import { relay, online } from '../net/online.js';
import { followTrial } from '../net/trials.js';
import { solveMirror, solveBraziers } from '../cubegen/trials/solve.js';
import { refreshOpenFaces, spawnEntry, backBeforeTrial, besidePortal, rebuildWorld, hurt } from './flow.js';
import { CHAR_H } from '../core/constants.js';
import { stepSiege, stepChase, resetEvents, lightBeacon, eventHud, EVENT_HOW, EVENT_DONE } from './trialevents.js';
import { path as teachPath, label as teachLabel } from './teach.js';

const $ = id => document.getElementById(id);
const SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// what the HUD says while a puzzle waits to be solved
const PUZZLE_HINT = {
  slide: 'Slide across the ice onto the plate by the closed gate',
  mirror: 'Turn the mirrors till the beam lights the receiver',
  braziers: 'Light every brazier: each one lights or puts out those it is linked to',
  crates: 'Push a crate onto every plate (the lever by the way in puts them back)',
  timedgate: 'Pull the lever on the rock, then run for the exit before it shuts',
  runes: 'Press the runestones in the order the carved tablet tells',
};
// what the banner says as an event arms
const HOW = {
  flood: 'The water is coming. Climb to the summit and press the button.',
  collapse: 'The floor crumbles behind you. Run for the far side!',
  miasma: 'Poison fog sinks from above. Get down to the vent valve!',
  cold: 'The cold sets in. Light the braziers on your way to the great fire!',
  storm: 'Gusts sweep the room. Shelter behind the rocks, cross in the lulls, pull the lightning rod!',
  ...EVENT_HOW,
};
const SEALED = 'The portals are sealed.';
export const trialHere = () => state.trial;
const mapTrial = () => state.map?.trial ?? null;
const resolvedIn = (map, run) => !!map?.trial && run.unlockedGates.has(map.trial.gate);

// coming into a cube (game/flow.js enterCube): its trial, as built or resolved for good
export function enterTrial(map) {
  state.trial = map?.trial ? newTrial(map.trial, resolvedIn(map, state.run)) : null;
  if (state.trial && map.trial.kind === 'sunken') state.trial.stage = state.run.trials.get(map.trial.key) ?? 0;   // (drained for the run)
  gone.clear(); crust.clear(); ice = null; cold = 0; shelterOf = null; resetEvents();
  partBlockers(map?.trial);
  showTrial(true);
}

// the crumbling floor (collapse): which crust cells are gone (their floors are not there for the
// physics, physics/collide.js) and how each looks
const gone = new Set(), crust = new Map();
setGoneFloors(f => gone.has(f.id));
function stepCrust(m, s, dt) {
  if (!m.crust) return;
  let fell = 0;
  for (const q of m.crust) {
    const now = crustState(m, s, q);
    if (now === 'gone' && !gone.has(q.f)) { gone.add(q.f); fell++; }
    if (now !== 'gone') gone.delete(q.f);
    crust.set(q.c, now);
  }
  if (fell) sfx('rumble', { volume: 0.35, pitch: 1.3 });
  setCrust(state.world, crust, dt, s.phase === 'resolved');
  // all of it gone, and still not across: there is no way over any more
  if (s.phase === 'running' && gone.size === m.crust.length && !mirroring()) failTrial('The way across is gone');
}
// the sinking fog (miasma): a head in it hurts, more the longer it stays (core/trials.js fogHurt),
// told in half-second bites
const fog = { inFor: 0, owed: 0 };
function stepFog(m, s, dt) {
  const y = m.kind === 'miasma' && s.phase === 'running' ? fogY(m, s) : null;
  if (y == null || player.hp <= 0 || player.y + CHAR_H < y) { fog.inFor = 0; fog.owed = 0; return; }
  fog.owed += fogHurt(player.maxHp, fog.inFor) * dt;
  fog.inFor += dt;
  if (fog.owed >= player.maxHp * 0.03) { const n = fog.owed; fog.owed = 0; hurt(n, 'Choking in the fog!'); }
}
// the cold snap: our own cold meter (core/trials.js coldStep) while it runs, warm by a lit brazier;
// at 100 we freeze (a death: back in the room before). Frost creeps in from the screen's edges.
let cold = 0, frostEl = null;
function stepCold(m, s, dt) {
  const on = m.kind === 'cold' && s.phase === 'running' && player.hp > 0;
  if (on) {
    const warm = m.parts.some(p => (p.type === 'warm' ? s.bits[p.id] : false) && Math.hypot(p.x - player.x, p.z - player.z) <= COLD.radius && Math.abs(p.y - player.y) < 2);
    cold = coldStep(cold, dt, warm);
    if (cold >= 100) { cold = 0; hurt(player.hp + 1, 'Frozen solid'); }
  } else if (m.kind !== 'cold' || s.phase !== 'armed') cold = Math.max(0, cold - 40 * dt);
  frost(m.kind === 'cold' ? cold / 100 : 0);
}
function frost(k) {
  if (typeof document === 'undefined') return;
  if (!frostEl && k <= 0) return;
  if (!frostEl) {
    frostEl = document.createElement('div');
    Object.assign(frostEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 5,
      background: 'radial-gradient(ellipse at center, rgba(200,240,255,0) 30%, rgba(200,235,255,0.5) 60%, rgba(225,245,255,0.85) 80%, rgba(245,252,255,1) 100%)' });
    document.body.appendChild(frostEl);
  }
  frostEl.style.opacity = String(Math.min(1, Math.pow(k, 0.7)));
}
// the storm: out of shelter a gust pulls you leeward (physics/move.js pulled, set anew each frame)
let shelterOf = null, lastGust = null;
function stepStorm(m, s, dt) {
  if (m.kind !== 'storm') return;
  const live = s.phase === 'running' || s.phase === 'armed', g = live ? stormPhase(s.t) : { phase: 'calm' };
  if (g.phase !== lastGust) {
    if (g.phase === 'warning') sfx('swing', { volume: 0.5, pitch: 0.4 });
    if (g.phase === 'gust') sfx('rumble', { volume: 0.35, pitch: 1.6 });
    lastGust = g.phase;
  }
  setStorm(state.world, g.phase, m.wind, dt);
  if (g.phase !== 'gust' || player.hp <= 0) return;
  shelterOf ??= new Set(m.shelter);
  if (shelterOf.has(Math.floor(player.z) * N + Math.floor(player.x))) return;
  player.pull = { ux: m.wind[0], uz: m.wind[1], speed: STORM.speed, room: Infinity, hold: STORM.hold };
}
// the keystone: stepping onto the exit apron stops the wave
function keystone(m, s) {
  if (!m.exitApron || s.phase !== 'running' && s.phase !== 'armed' || player.hp <= 0 || !player.grounded) return;
  const c = Math.floor(player.z) * N + Math.floor(player.x);
  if (!m.exitApron.includes(c) || player.y < m.keystone.y - 2) return;
  if (mirroring()) { if (!keystoneAsked) { keystoneAsked = true; relay.trialAct?.({ key: s.key, act: 'part', id: 'keystone' }); } return; }
  resolve();
}
let keystoneAsked = false;

// is the room we are in sealed? (game/portals.js, the scrolls, the teleports)
export const sealedIn = () => trialSealed(state.trial);

// the faces whose portals are sealed: every one while an event runs, else the exit until the
// trial is resolved
export function sealedDirs() {
  const s = state.trial, m = mapTrial();
  if (!s || !m || s.phase === 'resolved') return [];
  if (trialSealed(s)) return state.map.portals.filter(p => p.kind === 'side').map(p => p.dir);
  if (timedOpen(m, s)) return [];   // (the timed gate's lever pulled: the exit open for a while)
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
  resetTrial(state.trial, mapTrial()?.start);
  resetEvents();
  showTrial();
}

// what the trial's fluid and parts look like now, and what the physics knows of the fluid
export const refreshTrialView = () => showTrial(true);
function showTrial(immediate = false) {
  const m = mapTrial(), s = state.trial, level = trialFluidLevel(m, s);
  if (m) {
    updatePartBlockers(m, s);
    const dirs = sealedDirs();
    setPortalSeals(state.world, dirs, immediate);
    setTrialBarriers(state.world, trialSealed(s) ? dirs : [], openedSides(state.openedFaces, state.cubeKey));
  }
  setTrialFluid(level == null ? null : { y: level * LH, fluid: m.fluid });
  setTrialWater(state.world, level == null ? null : level * LH, s?.phase ?? null);
  setTrialFog(state.world, fogY(m, s));
  setTrialParts(state.world, s, immediate);
  hud();
}

// one step of the trial in the cube we are in (main.js, after the player and the enemies).
// Playing together, the game that runs the cube's enemies owns the trial (net/trials.js): it
// steps it; the others' clocks run on between its words, and stepping off the pad is told to it.
let awayAsked = false, awayFrom = false;
export function updateTrial(dt) {
  const s = state.trial, m = mapTrial();
  if (!s || !m) return;
  const away = player.hp > 0 && !!state.arrival && Math.hypot(player.x - state.arrival.x, player.z - state.arrival.z) > ARM_DISTANCE;
  let happened = null;
  if (mirroring()) {
    if (s.phase === 'armed' || s.phase === 'running') { s.t += dt; if (s.phase === 'armed' && s.t >= ARM_TIME) { s.phase = 'running'; happened = 'running'; } }
    if (s.phase === 'resolved') s.done += dt;
    if (away && s.phase === 'idle' && !awayAsked) { awayAsked = true; relay.trialAct?.({ key: s.key, act: 'away' }); }
  } else {
    happened = stepTrial(s, dt, { away: away || awayFrom });
    awayFrom = false;
  }
  if (s.phase !== 'idle') awayAsked = false;
  if (s.sink) s.sink.t += dt;
  if (s.phase === 'idle' || s.phase === 'resolved') keystoneAsked = false;
  announce(s, happened);
  stepCrust(m, s, dt);
  stepFog(m, s, dt);
  stepCold(m, s, dt);
  stepStorm(m, s, dt);
  stepSiege(m, s, dt, resolve);
  stepChase(m, s, dt, failTrial);
  keystone(m, s);
  stepCrates(m, s, dt);
  stepTimed(m, s, dt);
  stepParts(m, s);
  showTrial();
  if (!mirroring()) drown(m, s);
}
// what a phase coming says: the banner and the rumble as it arms
function announce(s, happened) {
  if (happened === 'armed') {
    setStatus(`${TRIALS[s.kind].name}! ${SEALED}`);
    banner(TRIALS[s.kind].name, HOW[s.kind] ?? '');
    sfx('rumble'); sfx('gate', { delay: 0.4 });
  }
  if (happened === 'running') sfx('rumble', { pitch: 0.7 });
}

// --- playing together (net/trials.js, net/session.js) -------------------------------------------

// the owner's word on the trial of the cube we are in (we are shown it); m: trialMessage
export function takeTrialWord(m) {
  const s = state.trial;
  if (!s || m.key !== s.key || m.seed !== state.cubes?.seed) return;
  if (m.phase === 'resolved') { resolve(false); return; }   // (its gate, the banner, the water draining)
  const happened = followTrial(s, m);
  announce(s, happened);
  showTrial();
}
// another player's act on the trial we own: stepping off the pad, using a part
export function trialActFrom(m) {
  const s = state.trial;
  if (!s || m.key !== s.key || mirroring()) return;
  if (m.act === 'away') awayFrom = true;
  if (m.act === 'part' && m.id === 'keystone') { resolve(); return; }
  if (m.act === 'part' && m.id.startsWith('solve:')) { solvePuzzle(+m.id.slice(6)); return; }
  if (m.act === 'part' && m.id === 'timed:reach') { if (timedOpen(mapTrial(), s) || timed.t < (mapTrial()?.puzzles?.[0]?.T ?? 0) + 1) resolve(); return; }
  if (m.act === 'part' && m.id.startsWith('push:')) { const [, pi, i, d] = m.id.split(':').map(Number); const pz = mapTrial()?.puzzles?.[pi]; if (pz) pushCrateAt(pz, i, d, true); return; }
  if (m.act === 'part') { const p = mapTrial()?.parts?.find(q => q.id === m.id); if (p) usePart(p, true); }
}
// a trial resolved somewhere (by whoever): its gate is open for us too
export function shareTrialResolved(m) {
  if (!m.gate || state.run.unlockedGates.has(m.gate)) return;
  if (state.trial?.key === m.key && state.trial.phase !== 'resolved') { resolve(false); return; }
  state.run.unlockedGates.add(m.gate);
  refreshOpenFaces();
  // standing at its portal: the warning goes
  if (state.map?.trialWarn?.some(Boolean)) {
    const before = state.map.trialWarn.join();
    if (warnTrials(state.map).join() !== before) rebuildWorld();
  }
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
  // a rune room's tablet (in a room before it)
  const c = (state.map?.clues || []).find(q => Math.hypot(q.x - player.x, q.z - player.z) < PART_REACH + 0.3 && Math.abs(q.y - player.y) < 1.2);
  if (c) return { id: 'tablet', type: 'tablet', key: c.key, x: c.x, y: c.y, z: c.z, label: PART_LABELS.tablet };
  if (!m?.parts || !s || s.phase === 'resolved') return null;
  let best = null, bestD = PART_REACH;
  for (const p of m.parts) {
    if (!PART_LABELS[p.type] || (p.puzzle != null && puzzleSolved(s, p.puzzle)) || (p.type === 'warm' && s.bits[p.id])) continue;
    if ((p.type === 'beacon' && s.phase !== 'idle') || (m.kind === 'chase' && s.phase !== 'running')) continue;   // (plates, gates: nothing to use; a solved puzzle: done)
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < PART_REACH + 0.4 && d < bestD && Math.abs(p.y - player.y) < 1.2) { best = p; bestD = d; }
  }
  return best && { ...best, label: partLabel(best) };
}
const partLabel = p => p.type === 'runestone' ? `Press the runestone ${p.glyph}` : p.type === 'brazier' ? (state.trial?.bits[p.id] ? 'Put out the brazier (and its links)' : 'Light the brazier (and its links)')
  : PART_LABELS[p.type] ?? 'Use it';

// the action key on part p (fromOther: another player used it, we own the trial). Shown another's
// trial, the press goes to its owner.
export function usePart(p, fromOther = false) {
  const s = state.trial, m = mapTrial();
  if (p.type === 'tablet') { readTablet(p.key); return true; }
  if (!s || !m) return false;
  if (!fromOther && mirroring()) { sfx('clink'); relay.trialAct?.({ key: s.key, act: 'part', id: p.id }); return true; }
  if (p.type === 'button' && m.kind === 'flood') { if (!fromOther) sfx('clink'); resolve(); return true; }
  if (p.type === 'valve') { if (!fromOther) sfx('door'); resolve(); return true; }
  if (p.type === 'fire') { if (!fromOther) sfx('fireball'); resolve(); return true; }
  if (p.type === 'rod') { if (!fromOther) sfx('unlock'); resolve(); return true; }
  if (p.type === 'lever' && m.kind === 'chase') { if (!fromOther) sfx('door'); sfx('gate', { delay: 0.1 }); resolve(); return true; }
  if (p.type === 'beacon') {
    if (lightBeacon(s)) { if (!fromOther) sfx('fireball'); announce(s, 'armed'); showTrial(); }
    return true;
  }
  if (p.type === 'warm') { if (!fromOther) sfx('fireball'); s.bits[p.id] = 1; showTrial(); return true; }
  if (!fromOther) sfx(p.type === 'lever' || p.type === 'reset' ? 'door' : p.type === 'brazier' ? 'fireball' : 'clink');
  const pz = m.puzzles?.[p.puzzle ?? 0];
  if (m.kind === 'timedgate' && p.type === 'lever') { s.bits[p.id] = 1; timed.t = 0; setStatus(`The gate is open: ${pz.T} s to reach it`); sfx('gate', { delay: 0.2 }); }
  else if (p.type === 'mirror') s.bits[p.id] = s.bits[p.id] ? 0 : 1;
  else if (p.type === 'runestone') {   // the next in the order lights; a wrong one puts them all out
    const key = `${pz.id}:n`, n = s.bits[key] ?? 0;
    if (pz.field.order[n] === p.i) s.bits[key] = n + 1;
    else { s.bits[key] = 0; if (!fromOther) { sfx('thud'); setStatus('The stones go dark: start over'); } }
  }
  else if (p.type === 'brazier') {   // it and every one linked to it
    const lit = bitsOf(pz, s, 'brazier');
    pressBrazier(lit, pz.field.links, p.i);
    for (const q of pz.parts) if (q.type === 'brazier') s.bits[q.id] = lit[q.i];
  } else useBit(s, p, m.start);
  if (p.type === 'reset') { ice = null; setStatus('Back to the start'); }
  showTrial();
  return true;
}

// The goal is met: the gate into the run (saved, shared, respected by discovery like a guardian's),
// the seals open, the fluid drains back, the chronicle notes it. tell: we resolved it (not told so):
// the others hear of it
export function resolve(tell = true) {
  const s = state.trial, m = mapTrial();
  if (!s || !m || s.phase === 'resolved') return false;
  resolveTrial(s, m.kind === 'miasma' ? fogLevel(m.timeline, s.t) : trialFluidLevel(m, s));
  state.run.unlockedGates.add(m.gate);
  refreshOpenFaces();
  if (tell) relay.trialDone?.({ key: s.key, gate: m.gate, time: s.t });   // resolved for everyone (net/session.js)
  sfx('unlock'); sfx('levelUp', { delay: 0.2 });
  setStatus(`${TRIALS[m.kind].name}: done! The way on is open`);
  banner(isPuzzle(m.kind) ? 'Solved!' : 'Well done!', { flood: 'The water drains away.', miasma: 'The vents open: the fog lifts.', cold: 'The great fire burns: the cold lifts.', storm: 'Lightning strikes the rod: the storm ends.', ...EVENT_DONE, collapse: 'The keystone holds: the floor is whole again.',
    sunken: 'The room is drained: the way on is clear.', timedgate: 'You made it through: the gate stays open.',
    slide: m.role === 'branch' ? 'The gate is open, and the vault with it.' : 'The gate is open: the way on too.' }[m.kind] ?? '');
  log('trial', { name: TRIALS[m.kind].name, depth: state.map.depth, what: 'resolved' }, { share: tell });
  showTrial();
  return true;
}

// --- the runes' clue -----------------------------------------------------------------------------
// Reading the carved tablet: its glyphs in order, and the hero remembers them (run.trials, saved)
function readTablet(key) {
  const c = (state.map?.clues || []).find(q => q.key === key);
  if (!c) return;
  state.run.trials.set(clueMark(c.key), 1);
  sfx('clink');
  banner('A carved tablet', `Press them in this order:  ${c.glyphs.join('  ')}`);
  setStatus(`The tablet reads ${c.glyphs.join(' ')}: you will remember it`);
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
  // (an event while it runs; a puzzle, or the sunken room's, while it is not solved)
  const show = !!s && !!m && (s.phase === 'armed' || s.phase === 'running' || (isPuzzle(s.kind) || s.kind === 'sunken' || s.kind === 'siege') && s.phase !== 'resolved');
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
  if (isPuzzle(s.kind)) line = PUZZLE_HINT[s.kind] ?? '';
  if (s.kind === 'runes') {   // read the clue: the order shows; else where to find it
    const pz = m.puzzles[0], order = pz.field.order.map(i => pz.field.glyphs[i]), n = s.bits[`${pz.id}:n`] ?? 0;
    line = state.run.trials.has(clueMark(m.key)) ? `The order: ${order.map((g, i) => i < n ? `[${g}]` : g).join('  ')}`
      : 'Press the runestones in the right order: a carved tablet in a room before this one tells it';
    fill = n / order.length;
  }
  if (s.kind === 'timedgate' && timedOpen(m, s)) { const T = m.puzzles[0].T; line = `The gate is open: ${Math.max(0, Math.ceil(T - timed.t))} s`; fill = Math.max(0, 1 - timed.t / T); }
  if (s.kind === 'sunken') {
    line = `Stage ${(s.stage ?? 0) + 1} of ${m.stages}: solve the dry platform's puzzle to drain the room`;
    fill = (s.stage ?? 0) / m.stages;
  }
  const ev = m && eventHud(m, s);
  if (ev) ({ line, fill } = ev);
  if (s.kind === 'storm') {
    const g = stormPhase(s.t);
    line = s.phase === 'armed' ? 'The wind rises…' : g.phase === 'warning' ? `A gust is coming! Take cover (${Math.ceil(g.left)})` : g.phase === 'gust' ? 'GUST! Stay behind the rocks' : `A lull: cross now (${Math.ceil(g.left)})`;
    fill = g.phase === 'gust' ? 1 : g.phase === 'warning' ? 1 - g.left / STORM.warning : g.left / STORM.lull;
  }
  if (s.kind === 'cold') {
    line = s.phase === 'armed' ? 'The cold sets in…' : `Cold ${Math.round(cold)}%: keep near a lit brazier`;
    fill = cold / 100;
  }
  if (s.kind === 'miasma') {
    const tl = m.timeline, next = nextPulse(tl, s.t);
    line = s.phase === 'armed' ? `The fog comes in ${Math.ceil(ARM_TIME - s.t)}…` : next != null ? `The fog sinks in ${Math.ceil(next - s.t)} s` : 'The fog is down: open the valve!';
    fill = Math.min(1, s.t / floodEnd(tl));
  }
  if (s.kind === 'collapse') {
    line = s.phase === 'armed' ? 'The floor shakes…' : 'Run! Reach the far side';
    fill = m.crust.length ? gone.size / m.crust.length : 0;
  }
  $('trial-line').textContent = line;
  $('trial-bar').style.width = `${Math.round(fill * 100)}%`;
}

// --- parts and their rules ------------------------------------------------------------------------

// Every frame: the plates (held by a player standing on them: ours, a friend's here), then each
// puzzle's rule on its bits; met, it is solved. What the rules see (the beam's way, the plates
// held) is kept for the drawing (render/trials.js setGridParts). (rule(pz, s, bodies): solved?)
const bitsOf = (pz, s, type) => pz.parts.filter(p => p.type === type).sort((a, b) => a.i - b.i).map(p => s.bits[p.id] ?? 0);
const shown = new Map();   // puzzle index -> { beam: { cells, lit } } | { held: Set } | {}
const RULES = {
  runes: (pz, s) => (s.bits[`${pz.id}:n`] ?? 0) >= pz.field.order.length,
  mirror(pz, s, bodies) {
    const D = pz.deck, y = D.level * LH;
    const blocked = (x, z) => bodies.some(b => Math.floor(b.x) === D.x0 + x && Math.floor(b.z) === D.z0 + z && Math.abs(b.y - y) < 1);
    const beam = traceBeam(pz.field, bitsOf(pz, s, 'mirror'), blocked);
    shown.set(pz.index, { beam });
    return beam.lit;
  },
  braziers: (pz, s) => allLit(bitsOf(pz, s, 'brazier')),
  // every plate held at once: by a crate, or by a body standing on it
  crates(pz, s, bodies) {
    const F = pz.field, D = pz.deck, crates = bitsOf(pz, s, 'crate');
    const cells = bodies.filter(b => Math.abs(b.y - D.level * LH) < 0.6).map(b => (Math.floor(b.z) - D.z0) * F.w + Math.floor(b.x) - D.x0);
    const held = new Set(F.plates.filter(p => crates.includes(p) || cells.includes(p)));
    shown.set(pz.index, { held });
    return held.size === F.plates.length;
  },
};

// --- the timed gate --------------------------------------------------------------------------------
// The lever opens the exit (its seal) for the puzzle's T s (its bit 1 while open; the owner shuts
// it); reaching the exit's pad while it is open passes the gate for good. A pull while open starts
// the time again.
const timed = { t: 0, was: 0, asked: false };
const timedOpen = (m, s) => m?.kind === 'timedgate' && !!s?.bits['p0:lever'] && s.phase !== 'resolved';
function stepTimed(m, s, dt) {
  if (m.kind !== 'timedgate' || s.phase === 'resolved') return;
  const pz = m.puzzles[0], open = timedOpen(m, s);
  if (open && !timed.was) timed.t = 0;   // (opened: by us, or the owner's word)
  timed.was = open ? 1 : 0;
  if (!open) { timed.asked = false; return; }
  timed.t += dt;
  if (timed.t >= pz.T && !mirroring()) { s.bits['p0:lever'] = 0; timed.was = 0; sfx('gate'); setStatus('The gate shut: back to the lever'); return; }
  const near = Math.hypot(player.x - pz.pad.x, player.z - pz.pad.z) < 1.3 && Math.abs(player.y - pz.pad.y) < 1 && player.hp > 0;
  if (!near) return;
  if (mirroring()) { if (!timed.asked) { timed.asked = true; relay.trialAct?.({ key: s.key, act: 'part', id: 'timed:reach' }); } return; }
  resolve();
}

// --- crates (push only) ------------------------------------------------------------------------
// Walking into a crate for PUSH_TIME s pushes it a cell on, if the cell beyond is free (core/trials.js
// pushTarget). Shown another's trial, the push goes to its owner.
export const PUSH_TIME = 0.3;
let steer = [0, 0], pushing = null;   // { pz, i (crate), d, t }
function stepCrates(m, s, dt) {
  const [dx, dz] = steer, len = Math.hypot(dx, dz);
  let want = null;
  if (len > 0.5 && player.grounded && player.hp > 0) for (const pz of m.puzzles || []) {
    if (pz.kind !== 'crates' || puzzleSolved(s, pz.index)) continue;
    const D = pz.deck, F = pz.field;
    if (Math.abs(player.y - D.level * LH) > 0.6) continue;
    const d = Math.abs(dx) > Math.abs(dz) * 1.5 ? (dx > 0 ? 0 : 1) : Math.abs(dz) > Math.abs(dx) * 1.5 ? (dz > 0 ? 2 : 3) : -1;
    if (d < 0) continue;
    const fx = Math.floor(player.x) - D.x0, fz = Math.floor(player.z) - D.z0, ahead = (fz + SD[d][1]) * F.w + fx + SD[d][0];
    const crates = bitsOf(pz, s, 'crate'), i = crates.indexOf(ahead);
    // up against it: near the edge of our cell that faces it, square on
    const along = d < 2 ? player.x - (D.x0 + fx + 0.5) : player.z - (D.z0 + fz + 0.5), across = d < 2 ? player.z - (D.z0 + fz + 0.5) : player.x - (D.x0 + fx + 0.5);
    if (i < 0 || along * (d & 1 ? -1 : 1) < 0.02 || Math.abs(across) > 0.3 || fx < 0 || fz < 0 || fx >= F.w || fz >= F.h) continue;
    want = { pz, i, d };
  }
  if (!want) { pushing = null; return; }
  if (!pushing || pushing.pz !== want.pz || pushing.i !== want.i || pushing.d !== want.d) pushing = { ...want, t: 0 };
  if ((pushing.t += dt) < PUSH_TIME) return;
  pushing = null;
  pushCrateAt(want.pz, want.i, want.d);
}
function pushCrateAt(pz, i, d, fromOther = false) {
  const s = state.trial, crates = bitsOf(pz, s, 'crate'), to = pushTarget(pz.field, crates, crates[i], d);
  if (to === null) { if (!fromOther) sfx('thud', { volume: 0.3 }); return false; }
  if (!fromOther && mirroring()) { relay.trialAct?.({ key: s.key, act: 'part', id: `push:${pz.index}:${i}:${d}` }); return true; }
  const crate = pz.parts.find(p => p.type === 'crate' && p.i === i);
  s.bits[crate.id] = to;
  sfx('door', { volume: 0.5, pitch: 0.7 });
  updateCrateBlockers(pz, s);
  return true;
}
// (every trial's parts are drawn as the state says: the puzzles', the fires of the cold and the siege)
function stepParts(m, s) {
  const bodies = [player, ...online.buddies.filter(b => b.here && b.hp > 0)];
  for (const pz of m.puzzles || []) {
    const met = RULES[pz.kind]?.(pz, s, bodies);
    if (met && !puzzleSolved(s, pz.index) && s.phase !== 'resolved') solvePuzzle(pz.index);
  }
  setGridParts(state.world, m, s, shown);
}
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
  if (m?.puzzles) {   // each puzzle's solution: the ice slide's slides, arrows on the ice
    const said = [];
    for (const pz of m.puzzles) if (pz.kind === 'slide') {
      const D = pz.deck, F = pz.field, y = D.level * LH + 0.3, at = ([x, z]) => ({ x: D.x0 + x + 0.5, y, z: D.z0 + z + 0.5 });
      let cur = slideStop(F, F.entry.x, F.entry.z, F.entry.side ^ 1);   // (sliding in)
      pz.check.solution.forEach((d, i) => {
        const next = slideStop(F, cur[0], cur[1], d);
        teachPath([at(cur), at(next)], { id: `trial-solve-${pz.id}-${i}`, color: TRIALS[pz.kind].color, width: 0.08, head: true, ttl: 60 });
        teachLabel(at(next), String(i + 1), { id: `trial-solve-${pz.id}-n${i}`, size: 0.2, ttl: 60 });
        cur = next;
      });
      said.push(`${pz.check.slides} slides (${pz.check.decoys} stops lead nowhere)`);
    }
    // the timed gate: the run back
    for (const pz of m.puzzles) if (pz.kind === 'timedgate') {
      teachPath(m.check.path.map(p => ({ x: p.x, y: p.y, z: p.z })), { id: 'trial-solve', color: TRIALS.timedgate.color, width: 0.07, head: true, ttl: 60 });
      said.push(`the run back: ${pz.check.run} s, open ${pz.T} s`);
    }
    // the grid puzzles: from where they are now, which part to use how often
    for (const pz of m.puzzles) {
      const moves = puzzleMoves(pz, state.trial);
      if (!moves) continue;
      for (const [p, n] of moves) teachLabel({ x: p.x, y: p.y + 1.5, z: p.z }, n > 1 ? `×${n}` : '✓', { id: `trial-solve-${p.id}`, size: 0.22, ttl: 60, color: TRIALS[pz.kind].color });
      said.push(`${pz.kind}: ${moves.reduce((a, [, n]) => a + n, 0)} to go`);
    }
    return `${said.join('; ')}: shown for a minute`;
  }
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

// --- the warning (docs/trials.md "The warning") ---------------------------------------------------

// Which side faces of `map` lead into a trial room not resolved yet (by dir: its kind, or null):
// their portals carry the trial's ring and glyph (render/markers.js). Before the cube is built.
export function warnTrials(map) {
  map.trialWarn = (map.trialFaces || [null, null, null, null]).map((kind, d) => kind && !state.run.unlockedGates.has(trialGate(step(map.key, d))) ? kind : null);
  return map.trialWarn;
}

// the kind behind face d of a visited cube on the minimap (game/minimap.js), or null
export const warnedFace = (map, d) => {
  const kind = map?.trialFaces?.[d];
  return kind && !state.run.unlockedGates.has(trialGate(step(map.key, d))) ? kind : null;
};

// Hovering over a warned portal (or standing near it) names the trial: a tip over its glyph
const tipAt = new THREE.Vector3();
export function updateTrialTip() {
  const el = $('trial-tip');
  if (!el) return;
  const map = state.map;
  let show = null;
  if (map?.trialWarn && !state.transitioning && state.mode === 'play') for (const p of map.portals) {
    const kind = p.kind === 'side' && map.trialWarn[p.dir];
    if (!kind) continue;
    tipAt.set(p.dir < 2 ? (p.dir === 0 ? N : 0) : p.x + 0.5, p.y + 2.55, p.dir < 2 ? p.z + 0.5 : (p.dir === 2 ? N : 0)).project(camera);
    if (tipAt.z > 1) continue;
    const x = (tipAt.x + 1) / 2 * innerWidth, y = (1 - tipAt.y) / 2 * innerHeight;
    const cursor = pointer.inside ? [(pointer.ndc.x + 1) / 2 * innerWidth, (1 - pointer.ndc.y) / 2 * innerHeight] : null;
    const near = Math.hypot(player.x - p.x - 0.5, player.z - p.z - 0.5) < 3;
    if (near || (cursor && Math.hypot(cursor[0] - x, cursor[1] - y) < 70)) { show = { kind, x, y }; break; }
  }
  el.hidden = !show;
  if (!show) return;
  const t = TRIALS[show.kind], text = `${t.name} · ${t.family === 'event' ? 'an event: it seals the room' : 'a puzzle'}`;
  if (el.textContent !== text) { el.textContent = text; el.style.borderColor = t.color; }
  el.style.left = `${Math.round(show.x)}px`; el.style.top = `${Math.round(show.y - 34)}px`;
}

// --- puzzles (docs/trials.md "Puzzles") ----------------------------------------------------------
// A puzzle room holds its puzzles in map.trial.puzzles (one; a sunken room one a stage, solved in
// turn); s.stage counts those solved. Each one's parts carry its index (`puzzle`).

export const puzzleSolved = (s, i) => !!s && (s.phase === 'resolved' || (s.stage ?? 0) > i);
// is a part's gate open? (its puzzle solved: for good)
const gateOpen = (s, part) => puzzleSolved(s, part.puzzle ?? 0);

// the parts that stand in the way, as colliders (physics/collide.js): a gate while shut
let partCells = null, partBoxes = [];
function partBlockers(m) {
  partBoxes = []; crateBoxes.clear();
  partCells = Array.from({ length: N * N }, () => []);
  for (const p of m?.parts || []) if (p.type === 'gate') {
    const half = (p.w ?? 1) / 2, across = p.side < 2;
    const b = { shape: 'box', part: p, bottom: p.y - 0.1, top: p.y + 2.4,
      x0: across ? p.x - 0.14 : p.x - half, x1: across ? p.x + 0.14 : p.x + half, z0: across ? p.z - half : p.z - 0.14, z1: across ? p.z + half : p.z + 0.14 };
    partBoxes.push(b);
    for (let z = Math.floor(b.z0 - 0.3); z <= Math.floor(b.z1 + 0.3); z++) for (let x = Math.floor(b.x0 - 0.3); x <= Math.floor(b.x1 + 0.3); x++)
      if (x >= 0 && z >= 0 && x < N && z < N) partCells[z * N + x].push(b);
  }
  setPartBlockers(partCells);
}
function updatePartBlockers(m, s) {
  for (const b of partBoxes) b.off = gateOpen(s, b.part);
  for (const pz of m?.puzzles || []) if (pz.kind === 'crates') updateCrateBlockers(pz, s);
}
// the crates where they stand now: boxes in the way (moved by a push, a reset, the owner's word)
const crateBoxes = new Map();   // crate part id -> box
function updateCrateBlockers(pz, s) {
  const D = pz.deck, F = pz.field;
  for (const p of pz.parts) if (p.type === 'crate') {
    const c = s.bits[p.id] ?? 0, x = D.x0 + c % F.w + 0.5, z = D.z0 + Math.floor(c / F.w) + 0.5;
    let b = crateBoxes.get(p.id);
    if (b && b.x === x && b.z === z) continue;
    if (b) for (const list of partCells) { const k = list.indexOf(b); if (k >= 0) list.splice(k, 1); }
    b = { shape: 'box', x, z, x0: x - 0.42, x1: x + 0.42, z0: z - 0.42, z1: z + 0.42, bottom: p.y - 0.1, top: p.y + 0.9, crate: p.id };
    crateBoxes.set(p.id, b);
    partCells[Math.floor(z) * N + Math.floor(x)].push(b);
  }
}

// The vault (a puzzle in a branch room): its reward site's chest stays shut, caged, until it is solved
export function vaultLocked(site) {
  const m = state.map?.trial;
  return !!m && m.role === 'branch' && (state.map.rewardSites || []).includes(site) && !state.run.unlockedGates.has(m.gate);
}

// What solves grid puzzle pz from its state now: [[part, how many uses], ...] (null: not a grid one)
export function puzzleMoves(pz, s) {
  const of = type => pz.parts.filter(p => p.type === type).sort((a, b) => a.i - b.i);
  if (pz.kind === 'mirror') {
    const ms = of('mirror'), bits = ms.map(p => s.bits[p.id] ?? 0), sol = solveMirror(pz.field, bits).solution;
    return sol ? ms.filter((p, i) => sol[i] !== bits[i]).map(p => [p, 1]) : [];
  }
  if (pz.kind === 'braziers') {
    const bs = of('brazier'), sol = solveBraziers(pz.field.links, bs.map(p => s.bits[p.id] ?? 0));
    return (sol.which || []).map(i => [bs[i], 1]);
  }
  return null;
}

// --- the ice slide --------------------------------------------------------------------------------
// On the field's ice you slide the way you set off until a rock or the rim stops you (core/trials.js
// slideStop); no steering meanwhile. Stopping on the goal plate solves it; sliding back out through
// the entry gap (or, solved, through the goal's open gate) takes you off the ice.
export const SLIDE_SPEED = 5;   // cells a second on the ice
let wasOnIce = false;
let ice = null;   // a slide under way: { pz, from: [x, z], to: [x, z], end ('stop' | 'out' | 'goal'), stop: [fx, fz], d, t, T }
// the slide puzzle whose ice the player stands on, and where on it: { pz, at: [fx, fz] } or null
export function onIce(m = mapTrial()) {
  if (!m?.puzzles || !player.grounded) return null;
  for (const pz of m.puzzles) {
    if (pz.kind !== 'slide' || Math.abs(player.y - pz.deck.level * LH) > 0.6) continue;
    const fx = Math.floor(player.x) - pz.deck.x0, fz = Math.floor(player.z) - pz.deck.z0;
    if (fieldIn(pz.field, fx, fz) && !isRock(pz.field, fx, fz)) return { pz, at: [fx, fz] };
  }
  return null;
}
// one step of the player on the ice (game/update.js); true: it moved the player (nothing else does)
export function iceStep(dt, dx, dz) {
  steer = [dx, dz];   // (the crates read it: game/trials.js stepCrates)
  const m = mapTrial(), s = state.trial;
  if (!m?.puzzles || !s) { ice = null; return false; }
  if (ice) {
    const D = ice.pz.deck, y = D.level * LH;
    ice.t += dt;
    const k = Math.min(1, ice.t / ice.T);
    player.x = ice.from[0] + (ice.to[0] - ice.from[0]) * k; player.z = ice.from[1] + (ice.to[1] - ice.from[1]) * k;
    player.y = y; player.vy = 0; player.grounded = true;
    player.vx = k < 1 ? SD[ice.d][0] * SLIDE_SPEED : 0; player.vz = k < 1 ? SD[ice.d][1] * SLIDE_SPEED : 0;
    player.yaw = Math.atan2(SD[ice.d][0], SD[ice.d][1]);
    player.support = groundAt(player.x, player.z, y + 0.05, 0).s;
    if (k >= 1) {
      const end = ice, F = end.pz.field; ice = null;
      if (end.end === 'stop') { sfx('thud', { volume: 0.4 }); if (end.stop[0] === F.goal.x && end.stop[1] === F.goal.z) solvePuzzle(end.pz.index); }
    }
    return true;
  }
  const on = onIce(m), was = wasOnIce;
  wasOnIce = !!on;
  if (!on) return false;
  const { pz, at } = on, F = pz.field, D = pz.deck, y = D.level * LH, centre = ([fx, fz]) => [D.x0 + fx + 0.5, D.z0 + fz + 0.5];
  const [cx, cz] = centre(at);
  // stepping onto the ice through the entry gap: straight on, inwards, whatever the keys say
  if (!was && at[0] === F.entry.x && at[1] === F.entry.z) { dx = -SD[F.entry.side][0]; dz = -SD[F.entry.side][1]; }
  // on the ice and still: drift onto the cell's middle
  const off = Math.hypot(player.x - cx, player.z - cz), push = Math.hypot(dx, dz);
  if (push < 0.3 || off > 0.08) {
    const k = Math.min(1, dt * 12);
    player.x += (cx - player.x) * k; player.z += (cz - player.z) * k; player.vx = player.vz = 0; player.y = y;
    if (push < 0.3) return true;
  }
  const d = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3);
  const stop = slideStop(F, at[0], at[1], d, puzzleSolved(s, pz.index));
  if (Array.isArray(stop) && stop[0] === at[0] && stop[1] === at[1]) return true;   // a rock or the rim right there
  // out through a gap: onto the ground beyond it
  const beyond = (cell, side) => [cell[0] + SD[side][0] * 2, cell[1] + SD[side][1] * 2];
  const target = stop === 'out' ? beyond(at, F.entry.side) : stop === 'goal' ? beyond(at, F.goal.side) : stop;
  const to = centre(target), from = [player.x, player.z];
  ice = { pz, from, to, end: Array.isArray(stop) ? 'stop' : stop, stop, d, t: 0, T: Math.max(0.05, Math.hypot(to[0] - from[0], to[1] - from[1]) / SLIDE_SPEED) };
  sfx('swing', { volume: 0.25, pitch: 0.6 });
  return true;
}

// a sunken room's stage i solved: the water sinks a stage (for the run: run.trials), the last for good
function solveStage(i) {
  const s = state.trial, m = mapTrial();
  if (!sinkStage(m, s, i)) return;
  state.run.trials.set(m.key, s.stage);
  relay.trialStage?.({ key: m.key, stage: s.stage });
  sfx('unlock'); sfx('splash', { delay: 0.3, volume: 0.6 });
  if (s.stage >= m.stages) { resolve(); return; }
  setStatus(`Stage ${s.stage} of ${m.stages}: the water sinks`);
  banner('The water sinks', 'A way down is clear: on to the next platform.');
  showTrial();
}
// playing together: a stage drained somewhere (by whoever): drained for us too
export function shareTrialStage(m) {
  if (!Number.isInteger(m.stage) || m.stage <= (state.run.trials.get(m.key) ?? 0)) return;
  state.run.trials.set(m.key, m.stage);
  const s = state.trial;
  if (s?.key === m.key && (s.stage ?? 0) < m.stage) { const mm = mapTrial(); while ((s.stage ?? 0) < m.stage) sinkStage(mm, s, s.stage ?? 0); showTrial(); }
}

// Puzzle i is solved: in a room of its own the trial is met (its gate into the run, the gate in the
// rim open, the exit or the vault open); a sunken room's stage drains it a stage further (only the
// stage it is at: game/sunken). Playing together the owner decides.
function solvePuzzle(i = 0) {
  const s = state.trial, m = mapTrial();
  if (!s || !m || s.phase === 'resolved' || puzzleSolved(s, i)) return;
  if (mirroring()) { relay.trialAct?.({ key: s.key, act: 'part', id: `solve:${i}` }); return; }
  if (m.kind === 'sunken') { solveStage(i); return; }
  resolve();
}
