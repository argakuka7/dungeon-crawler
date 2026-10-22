// Squarlo's fight (core/squarlo.js has the rules, docs/bosses.md tells it): this cube's Squarlo
// and the Squirtles he summons, in one list (`squarlos`), so they fight, collide, travel and get
// shown to friends like any enemy. Each Squarlo has a fight of his own here: { e (him), tide (his
// arena's water, core/squarlo.js newTide), tideIn (s until the next tide is due), cool (s to the
// next summon), since (attacks since he last rested), restDue, morph (s left of growing),
// minions }. A dev spawn (game/devspawn.js) gets one too; without tidal hills he calls no tide.
//
// On him: `stage` (1 small, 2 a giant: his profile, core/enemies.js STAGE_PROFILES) and `tide`
// (0 at rest .. 1 at high tide: game/tide.js raises the arena's water by it).
// Movement and attacks are the shared enemy AI's (game/enemyai.js): the fight says which attacks
// may start (`barred`), carries out a summon (`summon`) and the tide (`cast`) at their hit frames,
// and turns him into a giant. While he grows (mode 'split') the AI leaves him be. What the giant's
// attacks do beyond that is the fight's too: his stomp's shadow lies where his foot will come
// down (`footShadow`), his jump carries him through the air onto his shadow, which follows the
// player (`leap`), and his water cannon sweeps across (`sweep`). He keeps clear of the bank
// (`keepIn`). Their shockwaves are game/quakes.js's.
import { N } from '../core/constants.js';
import { state, player, setStatus } from './state.js';
import { SQUARLO, SQUARLO_GIANT, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf, enemyName } from '../core/enemies.js';
import { SQUARLO_FIGHT as G, splitHp, summonCount, newTide, stepTide, raiseTide, drainTide, barred, jumpLift } from '../core/squarlo.js';
import { muzzleAt, aiming } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { stepEnemy, groundY } from '../physics/enemynav.js';
import { groundAt, cellAt } from '../physics/collide.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep as sweepOut, fitting } from './bossfight.js';
import { alive } from './party.js';
import { summonFx, leapFx } from './juice.js';
import { tr } from '../i18n/i18n.js';

export let squarlos = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();

export function resetSquarlos() {
  removeEnemyViews(squarlos);
  squarlos = []; fights = [];
  addSquarlos(enemySpots(state.map, SQUARLO).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? SQUARLO, i)));
}
// Squarlos to fight: this cube's, or spawned with the dev tools
export function addSquarlos(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, tide: 0, hpFloor: splitHp(e.profile.hp) });
    const f = { e, tide: newTide(), tideIn: G.tide.first, cool: G.firstSummon, since: 0, restDue: false, counted: e.attacks,
      morph: 0, minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false, leap: null, swept: null, fits: null };
    e.barred = barred({ tideDue: false, restDue: false, summonDue: false, waterUp: false });
    e.summon = a => summon(f, a);
    e.cast = a => cast(f, a);
    fights.push(f); squarlos.push(e);
  }
}
export function detachSquarlos() { const list = squarlos; squarlos = []; fights = []; return list; }

export function updateSquarlos(dt) {
  for (const f of fights) run(f, dt);
  for (const e of squarlos) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(squarlos.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  for (const f of fights) { moves(f, dt); if (f.e.mode !== 'dead' && !f.leap) keepIn(f.e, dt); }
  squarlos = sweepOut(squarlos, dt);
  fights = fights.filter(f => squarlos.includes(f.e));
}

function run(f, dt) {
  const e = f.e, hasTide = !!state.map?.tide;
  f.minions = f.minions.filter(m => living(m) && squarlos.includes(m));
  // the water goes on (after his death too: it drains)
  if (stepTide(f.tide, dt) === 'rest') f.tideIn = between(G.tide.every);
  e.tide = hasTide ? f.tide.k : 0;
  if (e.mode === 'dead') {   // his Squirtles go with him, the water drains
    if (!f.over) { f.over = true; drainTide(f.tide); f.minions.forEach(m => leave(m, G.leave)); f.minions = []; }
    return;
  }
  if (e.mode === 'split') {   // growing; then back into the fight, a giant
    e.t += dt;
    if ((f.morph -= dt) <= 0) grow(f);
    return;
  }
  if (e.mode === 'chase' || e.mode === 'attack') { f.cool -= dt; if (f.tide.phase === 'rest') f.tideIn -= dt; }   // (in the fight)
  // each attack he starts: after the tide (and after a few others) he has to rest
  if (e.attacks !== f.counted) {
    f.counted = e.attacks;
    const a = attackOf(e);
    if (a.name === 'rest') { f.since = 0; f.restDue = false; }
    else if (a.name === 'tide') f.restDue = true;
    else if (++f.since >= G.restAfter[e.stage - 1]) f.restDue = true;
  }
  e.barred = barred({ tideDue: hasTide && f.tide.phase === 'rest' && f.tideIn <= 0, restDue: f.restDue,
    summonDue: f.cool <= 0 && summonCount(e.stage, f.minions.length) > 0, waterUp: f.tide.phase !== 'rest' });
  if (e.stage === 1 && e.hp <= e.hpFloor) split(f);
}

// at half his health: he stops, the fog rolls in and he grows; nothing hurts him meanwhile
function split(f) {
  const e = f.e;
  Object.assign(e, { hpFloor: 0, mode: 'split', speed: 0, path: null, t: 0, shield: G.morphTime + G.appear });
  f.morph = G.morphTime;
  setStatus(tr('{name} grows into a giant!', { name: enemyName(e.profile) }));
}
function grow(f) {
  const e = f.e;
  e.profile = enemyProfile(SQUARLO_GIANT, e.level);
  Object.assign(e, { stage: 2, attack: 0, t: 0, cool: 1, shield: G.appear });
  f.cool = G.firstSummon; f.since = 0; f.restDue = false;
  engage(e);
}
// a cast's hit frame: the tide starts to rise (a rest does nothing)
function cast(f, a) {
  if (a.cast !== 'tide' || !state.map?.tide) return;
  raiseTide(f.tide);
  f.tideIn = Infinity;
  setStatus(tr('The water is rising! Get up a hill!'));
}
// a summon's hit frame: Squirtles pop out of the floor round him, as many as fill up to the most
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], n = summonCount(e.stage, f.minions.length);
  f.cool = G.summonCool[e.stage - 1];
  if (!n) return;
  const giant = e.stage === 2;
  const list = minionFloors(e, kind, n, squarlos.filter(living), giant ? { ahead: 3, within: 7 } : { ahead: 1.2, within: 4.5 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    Object.assign(m, { under: 1, pop: true, dig: 0.2 + Math.random() * 0.3, cool: 0.8 + Math.random() });   // (they pop out of the floor)
    return m;
  });
  squarlos.push(...list); f.minions.push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'splash');
}

// What the giant's attacks do to him, after the AI's step: the stomp's shadow, the jump, the
// cannon's sweep. (A jump cut short, by his death say, comes down where he is.)
function moves(f, dt) {
  const e = f.e, a = e.mode === 'attack' ? attackOf(e) : null;
  if (f.leap && (!a?.jump || e.attacks !== f.leap.attacks)) touchDown(f, e);
  if (!a) { f.swept = null; return; }
  if (a.beam?.foot && e.beam) footShadow(e, a);
  if (a.jump) leap(f, e, a, dt);
  if (a.gust?.sweep) sweep(f, e, a);
}

// A giant's stomp: its shadow is where his foot will come down (the beam's muzzle, in front of
// him), on the floor there; it swings round with him while he turns to the player, and holds
// still with him (core/enemies.js SQUARLO_STOMP: he stops turning as the shadow locks)
function footShadow(e, a) {
  const foot = muzzleAt(e, a.beam.muzzle), g = groundAt(foot.x, foot.z, e.y + 0.6, 0);
  Object.assign(e.beam, { ax: foot.x, ay: (Number.isFinite(g.h) ? g.h : e.y) + 0.05, az: foot.z });
}

// A giant's jump: the shadow shows on the floor he can land on nearest the player (in the arena,
// clear of its bank) and follows them there (jump.track cells/s) until it holds still at the last
// (beam.lock); he crouches, springs off at jump.from and flies (jumpLift high over the line) to
// land on it at the hit frame, where the beam bursts (game/beams.js: whoever it is on is
// squashed) and the shockwave runs out (game/quakes.js).
const EDGE = 2.6;
function leap(f, e, a, dt) {
  const j = a.jump, b = e.beam, p = e.target?.here && alive(e.target) ? e.target : player;
  if (!b) return;
  const to = aiming(b) || !b.floor ? nearestLanding(f, Math.min(N - EDGE, Math.max(EDGE, p.x)), Math.min(N - EDGE, Math.max(EDGE, p.z)), p.y) : null;
  if (to && !b.floor) Object.assign(b, { ax: to.x, az: to.z, ay: groundY(to.g, to.x, to.z) + 0.05, floor: to.g });
  else if (to) {
    const dx = to.x - b.ax, dz = to.z - b.az, d = Math.hypot(dx, dz), step = Math.min(d, j.track * dt);
    b.ax += d ? dx / d * step : 0; b.az += d ? dz / d * step : 0;
    const g = landing(f, b.ax, b.az, to.y);
    if (g) b.floor = g;
    b.ay = groundY(g ?? b.floor, b.ax, b.az) + 0.05;
  }
  if (!b.floor) Object.assign(b, { ax: e.x, ay: e.y + 0.05, az: e.z, floor: e.f });
  if (e.t < j.from) return;
  if (!f.leap) { f.leap = { attacks: e.attacks, x: e.x, y: e.y, z: e.z }; leapFx(e); }
  const L = f.leap, u = Math.min(1, (e.t - j.from) / (a.hitAt - j.from)), y1 = groundY(landing(f, b.ax, b.az, b.ay) ?? b.floor, b.ax, b.az);
  e.x = L.x + (b.ax - L.x) * u; e.z = L.z + (b.az - L.z) * u;
  e.y = L.y + (y1 - L.y) * u + jumpLift(j, u);
  e.speed = 0;
  const dx = b.ax - e.x, dz = b.az - e.z, want = Math.atan2(dx, dz);
  if (Math.hypot(dx, dz) > 0.3) e.yaw += Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw)) * Math.min(1, dt * 6);
  if (u < 1) return;
  // down: where the shadow is (on a floor he fits on: a shadow still on its way there lands on it)
  const at = nearestLanding(f, b.ax, b.az, y1) ?? { x: b.ax, z: b.az, g: b.floor };
  Object.assign(e, { x: at.x, z: at.z, f: at.g, y: groundY(at.g, at.x, at.z) });
  f.leap = null;
}
// a jump cut short: down onto a floor he fits on where he is, else back where he sprang off
function touchDown(f, e) {
  const g = landing(f, e.x, e.z, e.y);
  if (g) Object.assign(e, { f: g, y: groundY(g, e.x, e.z) });
  else Object.assign(e, { x: f.leap.x, y: f.leap.y, z: f.leap.z });
  f.leap = null;
}
// a floor he fits on (bossfight.js fitting) at (x, z), the one nearest to the height y
function landing(f, x, z, y) {
  if (!f.fits) {
    f.fits = new Map();
    for (const g of fitting(f.e.profile)) f.fits.set(g.c, [...(f.fits.get(g.c) ?? []), g]);
  }
  const list = f.fits.get(cellAt(x, z)) ?? [];
  return list.reduce((best, g) => !best || Math.abs(groundY(g, x, z) - y) < Math.abs(groundY(best, x, z) - y) ? g : best, null);
}
// the spot nearest to (x, y, z) he can land on: there, or the middle of the floor he fits on
// nearest to it (a step up or down counting double): { x, y, z, g (the floor) }, or null for none
function nearestLanding(f, x, z, y) {
  const g = landing(f, x, z, y);
  if (g) return { x, y, z, g };
  let best = null, far = Infinity;
  for (const list of f.fits.values()) for (const h of list) {
    const d = Math.hypot(h.x + 0.5 - x, h.z + 0.5 - z) + 2 * Math.abs(groundY(h, h.x + 0.5, h.z + 0.5) - y);
    if (d < far) { far = d; best = h; }
  }
  return best && { x: best.x + 0.5, y, z: best.z + 0.5, g: best };
}

// The water cannon: from the end of his aiming at the player to the blast he swings round to one
// side of them, then sweeps across them to the other while it blasts (gust.sweep rad in all)
const ease = u => u * u * (3 - 2 * u);
function sweep(f, e, a) {
  const g = a.gust, half = g.sweep / 2;
  if (e.t < a.trackUntil) { f.swept = null; return; }
  if (f.swept?.attacks !== e.attacks) f.swept = { attacks: e.attacks, yaw: e.yaw, dir: Math.random() < 0.5 ? -1 : 1 };
  const w = f.swept;
  if (e.t < a.hitAt) e.yaw = w.yaw - w.dir * half * ease((e.t - a.trackUntil) / (a.hitAt - a.trackUntil));
  else e.yaw = w.yaw + w.dir * half * (2 * ease(Math.min(1, (e.t - a.hitAt) / g.time)) - 1);
}
// a giant keeps his body off the bank round the arena
function keepIn(e, dt) {
  if (!e.profile.giant) return;
  const ox = Math.max(0, EDGE - e.x) - Math.max(0, e.x - (N - EDGE)), oz = Math.max(0, EDGE - e.z) - Math.max(0, e.z - (N - EDGE));
  if (ox || oz) stepEnemy(e, Math.sign(ox) * Math.min(Math.abs(ox), 3 * dt), Math.sign(oz) * Math.min(Math.abs(oz), 3 * dt));
}
