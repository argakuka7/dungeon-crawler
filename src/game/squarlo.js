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
// and turns him into a giant. While he grows (mode 'split') the AI leaves him be. A giant's
// stomp brings his foot to where its shadow is (`plant`), and he keeps clear of the bank (`keepIn`).
import { N } from '../core/constants.js';
import { state, setStatus } from './state.js';
import { SQUARLO, SQUARLO_GIANT, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf } from '../core/enemies.js';
import { SQUARLO_FIGHT as G, splitHp, summonCount, newTide, stepTide, raiseTide, drainTide, barred } from '../core/squarlo.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { stepEnemy } from '../physics/enemynav.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep } from './bossfight.js';
import { summonFx } from './juice.js';

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
      morph: 0, minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false };
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
  for (const f of fights) if (f.e.mode !== 'dead') { plant(f.e, dt); keepIn(f.e, dt); }
  squarlos = sweep(squarlos, dt);
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
    else if (++f.since >= G.restAfter) f.restDue = true;
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
  setStatus(`${e.profile.label} grows into a giant!`);
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
  setStatus('The water is rising! Get up a hill!');
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

// A giant's stomp: until his foot comes down it moves (with him) to where its shadow is, the
// beam's aim (core/enemies.js SQUARLO_STOMP: the foot's landing point is the beam's muzzle)
const FOOT_SPEED = 3.5;   // cells/s
function plant(e, dt) {
  const a = e.mode === 'attack' ? attackOf(e) : null;
  if (a?.beam?.kind !== 'stomp' || !e.beam || e.t >= a.hitAt) return;
  const foot = muzzleAt(e, a.beam.muzzle), dx = e.beam.ax - foot.x, dz = e.beam.az - foot.z, d = Math.hypot(dx, dz);
  if (d > 0.02) { const step = Math.min(d, FOOT_SPEED * dt); stepEnemy(e, dx / d * step, dz / d * step); }
}
// a giant keeps his body off the bank round the arena
const EDGE = 2.6;
function keepIn(e, dt) {
  if (!e.profile.giant) return;
  const ox = Math.max(0, EDGE - e.x) - Math.max(0, e.x - (N - EDGE)), oz = Math.max(0, EDGE - e.z) - Math.max(0, e.z - (N - EDGE));
  if (ox || oz) stepEnemy(e, Math.sign(ox) * Math.min(Math.abs(ox), 3 * dt), Math.sign(oz) * Math.min(Math.abs(oz), 3 * dt));
}
