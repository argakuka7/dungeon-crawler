// Flip's fight (core/flip.js has the rules, docs/bosses.md tells it): this cube's Flip and the Sky
// wollas he summons, in one list (`flips`), so they fight, collide, travel and get shown to
// friends like any enemy. Each Flip has a fight of his own here: { e (him), flipIn (s until the
// next flip is due), cool (s to the next summon), holeIn (s until the next black hole), split (s
// left of spinning up), minions }. A dev spawn (game/devspawn.js) gets one too; out of his box he
// flips nothing.
//
// On him: `stage` (1, 2 from half his health on), `orient` and `turns` (the way he has turned his
// box and how many times: game/flipworld.js turns every game's world after them), `holes` (his
// open black holes: { id, x, y, z, t, life }) and `dark` (1 while one is open, or while it has
// someone: the scene darkens, game/enemies.js). Movement and attacks are the shared enemy AI's
// (game/enemyai.js, a volley's three balls game/projectiles.js): the fight says which attacks may
// start (`barred`), carries out a summon (`summon`), a flip and a black hole (`cast`) at their hit
// frames, and starts phase 2. While he spins up (mode 'split') and while the world turns, the AI
// leaves everyone be.
import { LH } from '../core/constants.js';
import { state, setStatus, player } from './state.js';
import { FLIP, ENEMY_KINDS, makeEnemy } from '../core/enemies.js';
import { FLIP_FIGHT as G, splitHp, summonCount, barred, nextDown, turnTo, orientIndex, ORIENTS, downFace } from '../core/flip.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep } from './bossfight.js';
import { summonFx } from './juice.js';
import { resetFlipWorld, turning } from './flipworld.js';
import { clearBlackHoles } from '../render/flipview.js';

export let flips = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();

export function resetFlips() {
  removeEnemyViews(flips);
  flips = []; fights = [];
  resetFlipWorld(); clearBlackHoles();
  addFlips(enemySpots(state.map, FLIP).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? FLIP, i)));
}
// Flips to fight: this cube's, or spawned with the dev tools
export function addFlips(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, hpFloor: splitHp(e.profile.hp), orient: 0, turns: 0, holes: [], dark: 0 });
    const f = { e, flipIn: G.flip.first, cool: G.firstSummon, holeIn: G.hole.first, split: 0, swallowed: null, minions: [], n: 0,
      nonce: Math.random().toString(36).slice(2, 7), over: false };
    e.barred = barred({ phase: 1, flipDue: false, summonDue: false, holeDue: false });
    e.summon = a => summon(f, a);
    e.cast = a => cast(f, a);
    e.swallowed = () => { f.swallowed = 0.35; };   // (game/flipworld.js: a black hole has the player)
    fights.push(f); flips.push(e);
  }
}
export function detachFlips() { const list = flips; flips = []; fights = []; return list; }

export function updateFlips(dt) {
  for (const f of fights) run(f, dt);
  for (const e of flips) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  if (!turning()) stepEnemies(flips.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  flips = sweep(flips, dt);
  fights = fights.filter(f => flips.includes(f.e));
}

// can he turn the world here (his box, or its test room)?
const canTurn = () => !!state.map?.flip;

function run(f, dt) {
  const e = f.e;
  f.minions = f.minions.filter(m => living(m) && flips.includes(m));
  // his black holes open, pull and close (game/flipworld.js pulls)
  for (const h of e.holes) h.t += dt;
  e.holes = e.holes.filter(h => h.t < h.life && !h.gone);
  e.dark = e.mode !== 'dead' && (e.holes.length || f.swallowed !== null || player.vanished) ? 1 : 0;
  if (e.mode === 'dead') {   // his Sky wollas go with him, and the world turns back the right way up
    if (!f.over) {
      f.over = true; e.holes = []; e.dark = 0;
      f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
      if (canTurn() && downFace(ORIENTS[e.orient]) !== 'bottom') turnWorld(f, 'bottom');
    }
    return;
  }
  if (turning()) return;   // (the world turns: nobody does anything)
  if (e.mode === 'split') {   // spinning up; then phase 2, the world upside down
    e.t += dt;
    if ((f.split -= dt) <= 0) {
      e.stage = 2;
      Object.assign(e, { attack: 0, cool: 0.8 });
      engage(e);
      f.holeIn = G.hole.first; f.flipIn = between(G.flip.every);
      if (canTurn()) turnWorld(f, downFace(ORIENTS[e.orient]) === 'top' ? 'bottom' : 'top');
    }
    return;
  }
  // swallowed by a black hole: the world turns for it
  if (f.swallowed !== null && (f.swallowed -= dt) <= 0) {
    f.swallowed = null;
    if (canTurn()) { turnWorld(f, nextDown(downFace(ORIENTS[e.orient]), e.stage, Math.random())); f.flipIn = Math.max(f.flipIn, 6); }
  }
  if (e.mode === 'chase' || e.mode === 'attack') {   // (in the fight)
    f.cool -= dt; f.holeIn -= dt;
    if (!player.flipping) f.flipIn -= dt;
  }
  e.barred = barred({ phase: e.stage, flipDue: canTurn() && f.flipIn <= 0,
    summonDue: f.cool <= 0 && summonCount(e.stage, f.minions.length) > 0, holeDue: f.holeIn <= 0 && !e.holes.length && !player.vanished });
  if (e.stage === 1 && e.hp <= e.hpFloor) split(f);
}

// at half his health: he stops and spins up; nothing hurts him meanwhile
function split(f) {
  const e = f.e;
  Object.assign(e, { hpFloor: 0, mode: 'split', speed: 0, path: null, t: 0, shield: G.splitTime + 0.4 });
  f.split = G.splitTime;
  setStatus(`${e.profile.label} spins up!`);
}
// the world turned so that side `face` is down (game/flipworld.js does it, on every game)
function turnWorld(f, face) {
  const e = f.e, t = turnTo(ORIENTS[e.orient], face, Math.random());
  if (!t) return;
  e.orient = orientIndex(t.O); e.turns++;
  e.holes = [];   // (his black holes close: they were where the floor was)
}
// a cast's hit frame: the flip turns the world; a black hole opens near the player
function cast(f, a) {
  const e = f.e;
  if (a.cast === 'flip') {
    f.flipIn = between(G.flip.every);
    if (canTurn()) turnWorld(f, nextDown(downFace(ORIENTS[e.orient]), e.stage, Math.random()));
  } else if (a.cast === 'hole') {
    f.holeIn = between(G.hole.every);
    // two of them: one close to the player, one further off
    for (const [lo, hi] of [[1.6, 2.8], [3.5, 6]]) {
      const h = holeSpot(lo, hi, e.holes);
      if (h) e.holes.push({ n: ++f.n, ...h, t: 0, life: G.hole.life });
    }
  }
}
// where a black hole opens: on a floor of the fight lo to hi cells from the player (not on a hole),
// apart from the others
function holeSpot(lo, hi, others) {
  const p = player, floors = state.map.floors.filter(g => g.encounter && g.hole === undefined && !g.open
    && Math.abs(g.top * LH - p.y) < 1.2 && others.every(o => Math.hypot(o.x - g.x - 0.5, o.z - g.z - 0.5) > 3));
  const near = floors.map(g => ({ g, d: Math.hypot(g.x + 0.5 - p.x, g.z + 0.5 - p.z) })).filter(o => o.d > lo && o.d < hi);
  const pick = near[Math.floor(Math.random() * near.length)]?.g;
  if (!pick) return null;
  return { x: pick.x + 0.5, y: pick.top * LH, z: pick.z + 0.5 };
}
// a summon's hit frame: Sky wollas come out of his rings, as many as fill up to the most
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], n = summonCount(e.stage, f.minions.length);
  f.cool = G.summonCool[e.stage - 1];
  if (!n) return;
  const list = minionFloors(e, kind, n, flips.filter(living), { ahead: 1.6, within: 5 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.8 + Math.random();
    return m;
  });
  flips.push(...list); f.minions.push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'rings');
}
