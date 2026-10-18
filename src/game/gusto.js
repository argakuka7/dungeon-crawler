// Gusto's fight (core/gusto.js has the rules, docs/bosses.md tells it): this cube's Gustos, the
// proxies they split into and the Custo triangles they summon, all in one list (`gustos`), so
// they fight, collide, travel and get shown to friends like any enemy. Each Gusto has a fight of
// its own here: { e (him), phase (1, 'split', 2, 'gone'), t (s left of the split or of being
// away), cool (s to the next summon), proxies, minions, window (s he can still be hit after the
// last proxy went, null before) }. A dev spawn (game/devspawn.js) gets one too.
//
// Movement and attacks are the shared enemy AI's (game/enemyai.js): the fight only says when a
// summon or a breath may start (`barred`: the attacks not to start now), carries a summon out
// (`summon`, at its hit frame), and moves him between the phases. Each body counts how long the
// nearest player has kept away from it (`far`) and how long only a grab may follow its breath
// (`follow`). While he splits or is away (modes 'split' and 'gone') the AI leaves him be.
// Only the game that runs the enemies runs the fight; the others see its result (net/foes.js).
import { player, state, setStatus } from './state.js';
import { party, alive } from './party.js';
import { GUSTO, GUSTO_SPLIT, ENEMY_KINDS, enemyProfile, makeEnemy, attackOf } from '../core/enemies.js';
import { GUSTO_FIGHT as G, splitHp, summonCount } from '../core/gusto.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { playerFloor } from './enemycombat.js';
import { walkable, floorAt, groundY } from '../physics/enemynav.js';
import { removeEnemyViews } from '../render/enemies.js';
import { summonFx } from './juice.js';

export let gustos = [];
let fights = [];
const NONE = new Set();
// what a body may not start: anything but a breath (keeping away), anything but a grab (after
// one), else the breath and maybe the summon
const BREATH_ONLY = new Set(['grab', 'summon', 'vortex']), GRAB_ONLY = new Set(['summon', 'vortex', 'inhale']);
const NO_BREATH = new Set(['inhale']), NO_BREATH_OR_SUMMON = new Set(['inhale', 'summon']);

export function resetGustos() {
  removeEnemyViews(gustos);
  gustos = []; fights = [];
  addGustos(enemySpots(state.map, GUSTO).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? GUSTO, i)));
}
// Gustos to fight: this cube's, or spawned with the dev tools
export function addGustos(list) {
  for (const e of list) {
    e.hpFloor = splitHp(e.profile.hp);
    const f = { e, phase: 1, t: 0, cool: G.firstSummon, breath: 0, proxies: [], minions: [], window: null, n: 0,
      nonce: Math.random().toString(36).slice(2, 7), over: false };
    hook(f, e);
    fights.push(f); gustos.push(e);
  }
}
export function detachGustos() { const list = gustos; gustos = []; fights = []; return list; }

export function updateGustos(dt) {
  for (const f of fights) run(f, dt);
  for (const e of gustos) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(gustos.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  gustos = gustos.filter(e => {
    const over = e.mode === 'gone' ? e.leaving !== undefined && (e.leaving -= dt) <= 0
      : e.mode === 'dead' && e.deadT >= e.profile.corpseTime;
    if (over) removeEnemyViews([e]);
    return !over;
  });
  fights = fights.filter(f => gustos.includes(f.e));
}

// a body of fight f (him or a proxy): it may summon when the fight says so, for the fight
function hook(f, b) {
  b.barred = NONE;
  b.summon = a => summon(f, b, a);
}
const phaseOf = f => f.phase === 1 ? 1 : 2;
const living = b => b.mode !== 'dead' && b.mode !== 'gone';

function run(f, dt) {
  const e = f.e;
  f.minions = f.minions.filter(m => living(m) && gustos.includes(m));
  f.proxies = f.proxies.filter(p => living(p) && gustos.includes(p));
  if (e.mode === 'dead') {   // his proxies and triangles go with him
    if (!f.over) { f.over = true; [...f.proxies, ...f.minions].forEach(leave); f.proxies = []; f.minions = []; }
    return;
  }
  if (e.mode === 'chase' || e.mode === 'attack') { f.cool -= dt; f.breath -= dt; }   // (in the fight)
  const summon = f.cool <= 0 && summonCount(phaseOf(f), f.minions.length) > 0, bodies = [e, ...f.proxies];
  for (const b of bodies) keepingAway(f, b, dt);
  const breathing = bodies.some(b => b.mode === 'attack' && attackOf(b).pull);
  for (const b of bodies) {
    b.barred = !breathing && f.breath <= 0 && b.far >= G.wait ? BREATH_ONLY
      : b.follow > 0 ? GRAB_ONLY : summon ? NO_BREATH : NO_BREATH_OR_SUMMON;
  }
  for (const p of f.proxies) { p.hp = e.hp; p.hurtT = Math.max(p.hurtT, e.hurtT); }   // they show his health
  if (f.phase === 1) {
    if (e.hp <= e.hpFloor) split(f);
  } else if (f.phase === 'split') {
    if ((f.t -= dt) <= 0) appear(f);
  } else if (f.phase === 2) {
    if (f.proxies.length) f.window = null;
    else if (f.window === null) f.window = G.window;
    else if ((f.window -= dt) <= 0 && e.mode !== 'attack') vanish(f);   // (a grab is seen through)
  } else if ((f.t -= dt) <= 0) appear(f);   // gone: back
}

// how long the nearest player has kept away from body b (in the fight), and whether only a
// grab may follow its breath; a breath starting holds the others' back for breathCool
function keepingAway(f, b, dt) {
  const p = nearest(b), fighting = b.mode === 'chase' || b.mode === 'attack';
  b.far = fighting && Math.hypot(p.x - b.x, p.z - b.z) > G.far ? (b.far ?? 0) + dt : 0;
  if (b.mode === 'attack' && attackOf(b).pull) {
    if (b.breathAt !== b.attacks) { b.breathAt = b.attacks; f.breath = G.breathCool; }
    b.far = 0; b.follow = G.follow;
  } else b.follow = Math.max(0, (b.follow ?? 0) - dt);
}

// at half his health: he stops and shudders, nothing hurts him, then the three of him appear
function split(f) {
  const e = f.e;
  Object.assign(e, { hpFloor: 0, mode: 'split', speed: 0, path: null, shield: G.splitTime + G.appear });
  f.phase = 'split'; f.t = G.splitTime;
  setStatus(`${e.profile.label} splits into three! Find the real one`);
}
function vanish(f) {
  const e = f.e;
  Object.assign(e, { mode: 'gone', speed: 0, path: null, shield: G.gone + G.appear });
  f.phase = 'gone'; f.t = G.gone; f.window = null;
}
// he and two new proxies appear on spots apart from each other and from the players, he on any
// of them; from the split on, he fights with the vortex too
function appear(f) {
  const e = f.e, spots = places(e, 1 + G.proxies);
  if (f.phase === 'split') { e.profile = enemyProfile(GUSTO_SPLIT, e.level); e.attack = 0; }
  const k = Math.floor(Math.random() * spots.length);
  if (spots[k]) put(e, spots[k]);
  engage(e);
  e.shield = G.appear;
  for (const [i, s] of spots.entries()) if (i !== k) f.proxies.push(proxy(f, s));
  f.phase = 2; f.window = null;
}
function proxy(f, s) {
  const e = f.e, p = makeEnemy({ id: `${e.id}:proxy:${f.nonce}${++f.n}`, level: e.level, coinDrop: 0, kind: e.kind,
    guardian: true, guardianRole: e.guardianRole, boss: e.boss, proxy: true, noReward: true,
    f: s, x: s.x + 0.5, y: groundY(s, s.x + 0.5, s.z + 0.5), z: s.z + 0.5, yaw: e.yaw }, GUSTO_SPLIT, f.n);
  p.hp = e.hp; p.shield = G.appear;
  engage(p); p.cool = 0.5 + Math.random() * 1.5;   // not all three at once
  hook(f, p); gustos.push(p);
  return p;
}
// a proxy or a triangle he takes along: gone at once (a cloud, render/enemies.js), let go soon
function leave(b) { Object.assign(b, { mode: 'gone', speed: 0, path: null, noReward: true, leaving: G.leave }); }

// into the fight at once, after the nearest player
function engage(b) {
  const p = nearest(b);
  Object.assign(b, { mode: 'chase', think: 0, path: null, target: p, provoked: 6, lost: 0,
    seen: { x: p.x, y: p.y, z: p.z, f: playerFloor(b.profile.height, p) }, yaw: Math.atan2(p.x - b.x, p.z - b.z) });
}
const players = () => party().filter(b => alive(b) && (b === player || b.here));
function nearest(b) {
  const list = players();
  return list.reduce((best, p) => Math.hypot(p.x - b.x, p.z - b.z) < Math.hypot(best.x - b.x, best.z - b.z) ? p : best, list[0] ?? player);
}
function put(b, s) {
  Object.assign(b, { f: s, x: s.x + 0.5, z: s.z + 0.5, y: groundY(s, s.x + 0.5, s.z + 0.5), path: null, kbx: 0, kbz: 0 });
}

// floors a body of kind `cfg` fits on (in a guardian's arena, its fight zone)
function fitting(cfg) {
  const arena = !!state.map.guardian, h = cfg.height, r = cfg.radius;
  return state.map.floors.filter(f => (!arena || f.encounter) && walkable(f, h)
    && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => floorAt(f, f.x + 0.5 + dx, f.z + 0.5 + dz, h)));
}
// n spots for the three of him: apart from each other and from the players (as far as the
// level allows: the rule loosens until there are enough), at random
function places(e, n) {
  const floors = fitting(e.profile), bodies = players();
  for (let i = floors.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [floors[i], floors[j]] = [floors[j], floors[i]]; }
  for (const apart of [G.apart, G.apart * 0.66, 1.5, 0]) {
    const out = [];
    for (const f of floors) {
      if (out.length === n) break;
      const x = f.x + 0.5, z = f.z + 0.5;
      if (bodies.every(p => Math.hypot(p.x - x, p.z - z) >= apart) && out.every(g => Math.hypot(g.x - f.x, g.z - f.z) >= apart)) out.push(f);
    }
    if (out.length === n) return out;
  }
  return [e.f];
}

// b (him or a proxy) spits Custo triangles at its summon's hit frame: as many as fill up to the
// phase's most, on free floors around it
function summon(f, b, a) {
  const n = summonCount(phaseOf(f), f.minions.length);
  f.cool = G.summonCool[phaseOf(f) - 1];
  if (!n) return;
  const kind = ENEMY_KINDS[a.summon.kind], mouth = muzzleAt(b, a.summon.muzzle);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), tx = b.x + fx * 2.2, tz = b.z + fz * 2.2;
  const others = gustos.filter(living), spots = [];
  const floors = fitting(kind).filter(g => {
    const x = g.x + 0.5, z = g.z + 0.5, d = Math.hypot(x - b.x, z - b.z);
    return d > b.profile.radius + 0.6 && d < 4.5 && Math.abs(groundY(g, x, z) - b.y) < 1.2
      && others.every(o => Math.hypot(o.x - x, o.z - z) > o.profile.radius + kind.radius + 0.2);
  }).sort((p, q) => Math.hypot(p.x + 0.5 - tx, p.z + 0.5 - tz) - Math.hypot(q.x + 0.5 - tx, q.z + 0.5 - tz));
  for (const g of floors) {
    if (spots.length === n) break;
    if (spots.every(s => Math.hypot(s.x - g.x, s.z - g.z) >= 1)) spots.push(g);
  }
  const list = spots.map(s => {
    const m = makeEnemy({ id: `${f.e.id}:minion:${f.nonce}${++f.n}`, level: f.e.level, coinDrop: 0, kind, summoned: true,
      f: s, x: s.x + 0.5, y: groundY(s, s.x + 0.5, s.z + 0.5), z: s.z + 0.5, yaw: b.yaw }, kind, f.n);
    engage(m); m.cool = 0.8 + Math.random();
    return m;
  });
  gustos.push(...list); f.minions.push(...list);
  summonFx(mouth, list);
}
