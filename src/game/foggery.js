// Foggery's fight (core/foggery.js has the rules, docs/bosses.md tells it): this cube's Foggery and
// the Fire-faces and Fire-cats he calls, in one list (`foggerys`), so they fight, collide, travel and
// get shown to friends like any enemy. Each Foggery has a fight of his own here: { e (him), on
// (the fight has started), lava (core/foggery.js newLava), cool (s to the next summon of
// Fire-faces), geyserIn (s until the next geysers are due), catsIn (s until he calls new cats,
// null while one lives), split (s left of curling up or rising), minions }. A dev spawn
// (game/devspawn.js) gets one too; out of his caldera there is no lava and no tower to climb.
//
// On him: `stage` (1 a frog, 2 a ball, 3 a ball over the drowned tower: his profile, core/enemies.js
// STAGE_PROFILES), `tide` (his lava, game/tide.js), `eyes` ([left, right]: 1 in his head, 0 just
// thrown, growing back), `guard` (1 while his shield holds: a Fire-cat lives) and `clock` (his
// platforms', game/movers.js; all sent to friends with his row, net/protocol.js).
// Movement and attacks are the shared enemy AI's (game/enemyai.js): before the fight he waits at the
// foot of his tower (`waiting`), up the ramp he follows a way of his own (`route`: after the player,
// or to the top in a hurry), over the drowned tower the fight holds him (`anchored`) circling; the fight
// says which attacks may start (`barred`) and carries out the summons at their hit frames.
import { LH } from '../core/constants.js';
import { state, setStatus } from './state.js';
import { FOGGERY, FOGGERY_BALL, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf } from '../core/enemies.js';
import { FOGGERY_FIGHT as G, TOWER, PLATFORMS, LAVA, splitHp, summonCount, barred, newLava, moveLava, stepLava } from '../core/foggery.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { findPath, pathToward, walkable } from '../physics/enemynav.js';
import { playerFloor } from './enemycombat.js';
import { groundAt } from '../physics/collide.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep, players, nearest } from './bossfight.js';
import { summonFx } from './juice.js';
import { moverClock } from './movers.js';
import { sfx } from '../audio/sfx.js';

export let foggerys = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();

export function resetFoggerys() {
  removeEnemyViews(foggerys);
  foggerys = []; fights = [];
  addFoggerys(enemySpots(state.map, FOGGERY).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? FOGGERY, i)));
}
// Foggerys to fight: this cube's, or spawned with the dev tools
export function addFoggerys(list) {
  for (const e of list) {
    // (in his caldera he waits at the foot of his tower, the AI leaves him be: game/enemyai.js)
    Object.assign(e, { stage: 1, tide: 0, hpFloor: splitHp(e.profile.hp, 1), eyes: [1, 1], guard: 0, clock: 0, waiting: !!tower() });
    const f = { e, on: false, lava: newLava(), cool: G.firstSummon, geyserIn: G.geyser.first, catsIn: null, split: 0, thrown: -1,
      minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false, angle: null, settle: null };
    e.barred = barred({ phase: 1, eyes: e.eyes });
    e.summon = a => summon(f, a);
    fights.push(f); foggerys.push(e);
  }
}
export function detachFoggerys() { const list = foggerys; foggerys = []; fights = []; return list; }

export function updateFoggerys(dt) {
  for (const e of foggerys) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  for (const f of fights) run(f, dt);
  stepEnemies(foggerys.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  for (const f of fights) float(f, dt);
  foggerys = sweep(foggerys, dt);
  fights = fights.filter(f => foggerys.includes(f.e));
}

// his tower (his caldera, or its test room): the floor he climbs to
const tower = () => state.map?.tower ?? null;
const goal = () => { const t = tower(); return t && state.map.cols[t.goal.z * 16 + t.goal.x].at(-1); };
const onTop = e => !tower() || e.f?.tower === 'top';

function run(f, dt) {
  const e = f.e;
  e.clock = moverClock();
  e.tide = tower() ? stepLava(f.lava, dt) : 0;
  f.minions = f.minions.filter(m => living(m) && foggerys.includes(m));
  if (e.mode === 'dead') {   // his minions go with him, the lava drains away for good
    if (!f.over) {
      f.over = true; e.route = null; e.anchored = false; e.guard = 0;
      f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
      if (tower()) moveLava(f.lava, LAVA.gone, G.lava.drain);
      // (floating over the lava, he sinks onto the floor under him)
      const g = groundAt(e.x, e.z, e.y + 0.2, 0);
      f.settle = Number.isFinite(g.h) ? g.h : e.y;
    }
    if (f.settle !== null) e.y += (f.settle - e.y) * Math.min(1, dt * 3);
    return;
  }
  // his eyes: the one he throws is gone at the throw, then grows back
  if (e.stage === 1 && e.mode === 'attack' && e.bit && f.thrown !== e.attacks) {
    const eye = attackOf(e).projectile?.eye;
    if (eye !== undefined) { e.eyes[eye] = 0; f.thrown = e.attacks; }
  }
  for (let i = 0; i < 2; i++) if (e.eyes[i] < 1) e.eyes[i] = Math.min(1, e.eyes[i] + dt / G.eyes.grow);
  if (!f.on) { wake(f); return; }
  if (e.mode === 'split') {   // curling up into his ball, or rising over the lava
    e.t += dt;
    if ((f.split -= dt) <= 0) e.stage === 1 ? curled(f) : risen(f);
    return;
  }
  const fighting = e.mode === 'chase' || e.mode === 'attack';
  if (fighting) { f.cool -= dt; if (e.stage > 1) f.geyserIn -= dt; }
  // phase 1: after the player, up the ramp (in a hurry to the top once he cannot be hurt any further)
  const top = onTop(e), stuck = e.hp <= e.hpFloor;
  if (e.stage === 1) {
    e.route = !tower() ? null : stuck && !top ? climb(e) : chase(e);
    e.hurry = stuck && !top ? G.hurry : 1;
    if (stuck && top) { split(f); return; }
  }
  // phases 2 and 3: his cats guard him; both dead, he calls new ones a while later
  if (e.stage > 1) {
    const cats = f.minions.length;
    if (cats && f.catsIn !== null) f.catsIn = null;
    else if (!cats && f.catsIn === null) {
      f.catsIn = G.catsAgain;
      setStatus(`${e.profile.label}'s shield is down! Hit him now!`);
      sfx('shatter', { at: e });
    } else if (!cats) f.catsIn -= dt;
    // (and while he is about to call them: only the while before that leaves him open)
    e.guard = cats || (f.catsIn !== null && f.catsIn <= 0) ? 1 : 0;
    if (e.guard) e.shield = Math.max(e.shield ?? 0, 0.1);
    if (e.stage === 2 && stuck) { split(f); return; }
  }
  const hurrying = e.stage === 1 && e.hurry > 1;
  e.barred = hurrying ? new Set(['eyeL', 'eyeR', 'summon']) : barred({ phase: e.stage, eyes: e.eyes,
    summonDue: f.cool <= 0 && summonCount(1, f.minions.length) > 0, catsDue: f.catsIn !== null && f.catsIn <= 0,
    geyserDue: f.geyserIn <= 0 });
  // (the geysers he starts set their own clock)
  if (e.mode === 'attack' && attackOf(e).name === 'geyser' && f.geyserIn <= 0) f.geyserIn = between(G.geyser.every);
}

// Not yet in the fight: a player setting foot on the ramp of his tower (or coming close, or a hit)
// wakes him; a dormant one (a test room's, game/devspawn.js) only a hit. Then the lava starts
// rising, Fire-faces wait up the ramp, and he comes after the player.
const onRamp = p => { const s = groundAt(p.x, p.z, p.y + 0.1, 0.3).s; return s?.tower === 'ramp' || s?.tower === 'top'; };
function wake(f) {
  const e = f.e, near = players().some(p => Math.hypot(p.x - e.x, p.z - e.z) < G.wake && Math.abs(p.y - e.y) < 2);
  const climbing = !!tower() && players().some(onRamp);
  if (!(e.hp < e.profile.hp || e.attacks > 0 || ((near || climbing) && !e.dormant))) return;
  f.on = true;
  e.dormant = false; e.waiting = false;
  engage(e);
  if (tower()) {
    moveLava(f.lava, LAVA.high, G.lava.rise);
    setStatus(`${e.profile.label} croaks: the lava is rising! Up the tower!`);
    sfx('rumble', { at: e });
    lieInWait(f);
  }
}
// Fire-faces waiting up the ramp, spread along the way from the bridge to the top: each waits
// where it is till the player comes up to it (it notices them closer than a Fire-face would)
function lieInWait(f) {
  const e = f.e, kind = ENEMY_KINDS.fogface, t = tower(), n = summonCount(1, f.minions.length);
  const ramp = state.map.floors.filter(g => g.tower === 'ramp' && walkable(g, kind.height));
  const taken = [];
  for (let k = 1; k <= n; k++) {
    const u = t.marks.j1 + (t.marks.t - t.marks.j1) * k / (G.lieInWait + 1);
    const s = ramp.filter(g => taken.every(o => Math.hypot(o.x - g.x, o.z - g.z) > 2)).sort((a, b) => Math.abs(a.ramp - u) - Math.abs(b.ramp - u))[0];
    if (!s) continue;
    taken.push(s);
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, Math.atan2(TOWER.mid - s.x - 0.5, TOWER.mid - s.z - 0.5) + Math.PI, f.n);
    m.profile = { ...m.profile, aggro: G.waitAggro };
    Object.assign(m, { mode: 'idle', t: 1, target: null, provoked: 0, path: null, seen: null });
    foggerys.push(m); f.minions.push(m);
  }
  sfx('fireball', { at: e, pitch: 0.7 });
}
// after the nearest player: the way to their floor, else as close to them as it gets
function chase(e) {
  return () => {
    const p = nearest(e), h = e.profile.height, to = playerFloor(h, p);
    return (to && findPath(e.f, to, 200, h)) || pathToward(e.f, p.x, p.y, p.z, 200, h) || [e.f];
  };
}
// the way up the ramp to the top of the tower
function climb(e) {
  return () => findPath(e.f, goal(), 200, e.profile.height) ?? [e.f];
}

// At a third of his health (on top) he curls up into his ball; at a sixth he rises over the
// tower and the lava floods it. Nothing hurts him meanwhile.
function split(f) {
  const e = f.e, first = e.stage === 1, time = first ? G.morphTime : G.floodTime;
  Object.assign(e, { hpFloor: first ? e.hpFloor : 0, mode: 'split', speed: 0, path: null, t: 0, shield: time + 0.4, route: null, hurry: 1 });
  f.split = time;
  if (first) {
    f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
    setStatus(`${e.profile.label} curls up into a ball!`);
  } else {
    if (tower()) moveLava(f.lava, LAVA.flood, G.lava.flood);
    setStatus(tower() ? 'The lava swallows the tower! Jump onto the platforms!' : `${e.profile.label} rises up!`);
    if (tower()) sfx('rumble', { at: e });
  }
}
function curled(f) {
  const e = f.e;
  e.profile = enemyProfile(FOGGERY_BALL, e.level);
  Object.assign(e, { stage: 2, attack: 0, t: 0, cool: 0.6, hpFloor: splitHp(e.profile.hp, 2), eyes: [1, 1] });
  f.catsIn = 0; f.geyserIn = G.geyser.first;
  engage(e);
}
function risen(f) {
  const e = f.e;
  Object.assign(e, { stage: 3, attack: 0, t: 0, cool: 0.8, hpFloor: 0, anchored: !!tower() });
  f.geyserIn = Math.min(f.geyserIn, G.geyser.first);
  engage(e);
}

// Phase 3 (and rising into it): he floats over the drowned top of the tower, circling round it
// at about the platforms' height, so that they pass by him
function float(f, dt) {
  const e = f.e, t = tower();
  if (!t || e.mode === 'dead' || !(e.stage === 3 || (e.stage === 2 && e.mode === 'split'))) return;
  const O = G.orbit, mid = TOWER.mid;
  if (f.angle === null) f.angle = Math.atan2(e.z - mid, e.x - mid);
  if (e.mode !== 'split') f.angle += O.speed * dt;
  const tx = mid + Math.cos(f.angle) * O.r, tz = mid + Math.sin(f.angle) * O.r, ty = PLATFORMS.top * LH + O.lift;
  const k = Math.min(1, dt * (e.mode === 'split' ? 1.2 : 2));
  e.x += (tx - e.x) * k; e.z += (tz - e.z) * k; e.y += (ty - e.y) * k;
  // (for the summons and the AI: the floor of the top nearest under him)
  let best = null, gap = Infinity;
  for (const g of state.map.floors) if (g.tower === 'top') {
    const d = Math.hypot(g.x + 0.5 - e.x, g.z + 0.5 - e.z);
    if (d < gap) { gap = d; best = g; }
  }
  if (best) e.f = best;
}

// a summon's hit frame: Fire-faces croaked up (phase 1), or two Fire-cats to guard him
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], cats = a.name === 'cats', n = summonCount(e.stage, f.minions.length);
  if (cats) f.catsIn = null; else f.cool = G.summonCool;
  if (!n) return;
  const list = minionFloors(e, kind, n, foggerys.filter(living), { ahead: 1.4, within: 5 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.8 + Math.random();
    return m;
  });
  foggerys.push(...list); f.minions.push(...list);
  if (cats && list.length) e.guard = 1;
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'embers');
}
