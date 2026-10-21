// Renew's fight (core/renew.js has the rules, docs/bosses.md tells it): this cube's Renew and the
// minions he casts out of the sky, in one list (`renews`), so they fight, collide, travel and get
// shown to friends like any enemy. Each Renew has a fight of his own here: { e (him), tape (what
// the room was, frame by frame, since the phase began), next (the clock's time of the next
// frame), windup (s left of gathering time before it runs back), rewind (while time runs back:
// { length, time, u }), cool (s to his next cast of minions), combo (blows chained so far), dodge
// (s until he may roll out of a swing again), minions }. A dev spawn (game/devspawn.js) gets one
// too.
//
// On him: `stage` (1 a sword, 2 a bow, 3 a morning star, 4 a twin morning star: his profile,
// core/enemies.js STAGE_PROFILES), `on` (the fight has started), `clock` (the room's time: s since the phase
// began, running back while he rewinds), `rewinding`, `rising` (beaten, rising into the sky as a
// ghost: { t, from, u }) and `ascended` (gone that way: no body is left) (all sent to friends with his row,
// net/protocol.js). This game's own hero and echoes follow his clock (game/rewind.js), on every
// game; the bodies of the fight are rewound here, on the game that runs them.
// Movement and attacks are the shared enemy AI's (game/enemyai.js); the fight chains his blows,
// starts his dodges, carries out his casts at their hit frames and runs the tape.
import { state, setStatus, player } from './state.js';
import { RENEW, STAGE_PROFILES, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf, lungeAt } from '../core/enemies.js';
import { RENEW_FIGHT as G, PHASES, risenAt, newTape, record, spanAt, bodyRow, bodyAt, rewindTime, rewoundAt, summonCount, barred } from '../core/renew.js';
import { muzzleAt } from '../core/beams.js';
import { damageEnemy } from '../core/combat.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { stepEnemy } from '../physics/enemynav.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep, nearest } from './bossfight.js';
import { summonFx, cameraKick } from './juice.js';
import { clearProjectiles } from './projectiles.js';
import { glow, soft, emit, rand } from '../render/particles.js';
import { sfx } from '../audio/sfx.js';

export let renews = [];
let fights = [];

export function resetRenews() {
  removeEnemyViews(renews);
  renews = []; fights = [];
  addRenews(enemySpots(state.map, RENEW).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? RENEW, i)));
}
// Renews to fight: this cube's, or spawned with the dev tools
export function addRenews(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, on: false, clock: 0, rewinding: false, hpFloor: 1 });
    const f = { e, tape: newTape(), next: 0, windup: 0, rewind: null, cool: G.firstSummon, combo: 0, was: null, last: null,
      dodge: 0, leap: 0, rolled: 0, way: 0, minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false };
    e.barred = barred({ stage: 1 });
    e.summon = a => summon(f, a);
    fights.push(f); renews.push(e);
  }
}
export function detachRenews() { const list = renews; renews = []; fights = []; return list; }

export function updateRenews(dt) {
  for (const e of renews) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  for (const f of fights) run(f, dt);
  // (while time runs back the tape holds every body where it was: nothing steps, nothing goes)
  if (fights.some(f => f.rewind)) return;
  stepEnemies(renews.filter(e => e.mode !== 'gone' && e.mode !== 'split' && !e.falling), dt);
  for (const f of fights) { roll(f); fall(f, dt); }
  renews = sweep(renews, dt);
  fights = fights.filter(f => renews.includes(f.e));
}

function run(f, dt) {
  const e = f.e;
  if (f.rewind) { rewind(f, dt); return; }
  f.minions = f.minions.filter(m => renews.includes(m) && m.mode !== 'gone');
  if (e.mode === 'dead') {   // his minions go with him
    if (!f.over) { f.over = true; e.rewinding = false; f.minions.forEach(m => leave(m, G.leave)); f.minions = []; }
    return;
  }
  if (!e.on) {
    if (!(e.mode === 'chase' || e.mode === 'attack' || e.hp < e.profile.hp)) return;
    e.on = true;   // the fight starts, and the room's clock with it
    setStatus(`${e.profile.label} draws his sword`);
  }
  if (e.rising) { e.clock += dt; e.t += dt; rise(f, dt); return; }   // (the echoes play on meanwhile)
  // the room's time runs on, and the tape records it
  e.clock += dt;
  if (e.clock >= f.next) { tape(f); f.next = e.clock + G.sample; }
  if (e.mode === 'split') {   // gathering time in his hands; then it runs back
    e.t += dt;
    if ((f.windup -= dt) <= 0) startRewind(f);
    return;
  }
  const fighting = e.mode === 'chase' || e.mode === 'attack';
  if (fighting) { f.cool -= dt; f.dodge -= dt; f.leap -= dt; }
  chain(f);
  dodge(f);
  keepAway(f);
  if (e.hp <= e.hpFloor) { windup(f); return; }
  e.barred = barred({ stage: e.stage, summonDue: f.cool <= 0 && summonCount(e.stage, f.minions.length) > 0 });
}

// A blow over, he chains the next one at once (a player clicking again), up to `combo` of them;
// then he recovers as any enemy does
function chain(f) {
  const e = f.e, name = e.mode === 'attack' ? attackOf(e).name : null;
  if (f.was === 'attack' && e.mode === 'chase' && (f.last === 'slash' || f.last === 'dash')) {
    if (++f.combo < G.combo[e.stage - 1] && Math.random() < 0.8) e.cool = G.chain;
    else f.combo = 0;
  } else if (e.mode === 'attack' && name !== 'slash' && name !== 'dash') f.combo = 0;
  f.was = e.mode; f.last = name ?? f.last;
}
// A player winding up a swing within reach of him: now and then he rolls out of its way (and
// nothing hurts him while he rolls: a player's roll, as they would wish for one)
function dodge(f) {
  const e = f.e, s = player.sword, stats = s.stats;
  if (e.mode !== 'chase' || f.dodge > 0 || !s.active || !stats || stats.ranged || s.t >= stats.activeStart) return;
  const d = Math.hypot(player.x - e.x, player.z - e.z);
  if (d > stats.range + e.profile.radius + G.dodge.near || Math.abs(player.y - e.y) > 0.8) return;
  f.dodge = G.dodge.every;
  if (Math.random() > G.dodge.chance) return;
  // (with a ranged weapon he leaps back out of it instead)
  if (e.profile.attacks.some(a => a.name === 'leap')) { leapBack(f); return; }
  const i = e.profile.attacks.findIndex(a => a.name === 'roll'), away = Math.atan2(e.x - player.x, e.z - player.z);
  const side = Math.random() < 0.5 ? -1 : 1, dist = e.profile.attacks[i].dodge.dist;
  // the first way out with room to roll: aside and back, the other side, straight back, aside
  const yaw = [0.9 * side, -0.9 * side, 0, 1.5 * side, -1.5 * side].map(a => away + a).find(a => room(e, a, dist));
  if (yaw === undefined) return;
  Object.assign(e, { mode: 'attack', attack: i, t: 0, bit: false, leap: 0, yaw, speed: 0, path: null, shield: 0.6 });
  e.attacks++; f.rolled = 0; f.way = yaw;
}
// With a ranged weapon (the bow) he keeps away: the AI runs him backwards
// (`backpedal`, game/enemyai.js), and once the player is well inside the distance he keeps
// (keep[0]) he leaps back out of reach, facing them, every `leap.every` s at most
function keepAway(f) {
  const e = f.e, keep = e.profile.keep;
  if (e.mode !== 'chase' || f.leap > 0 || !keep || !e.profile.attacks.some(a => a.name === 'leap')) return;
  const d = Math.hypot(player.x - e.x, player.z - e.z);
  if (d > keep[0] - G.leap.near || Math.abs(player.y - e.y) > 1.2 || player.hp <= 0 || player.flipping) return;
  leapBack(f);
}
function leapBack(f) {
  const e = f.e, i = e.profile.attacks.findIndex(a => a.name === 'leap'), dist = e.profile.attacks[i].dodge.dist;
  const away = Math.atan2(e.x - player.x, e.z - player.z), side = Math.random() < 0.5 ? -1 : 1;
  f.leap = G.leap.every;
  // straight back, a little aside, or more aside (the way with room; a shorter leap rather than none)
  const ways = [0, 0.5 * side, -0.5 * side, 1.1 * side, -1.1 * side].map(a => away + a);
  const way = ways.find(a => room(e, a, dist)) ?? ways.find(a => room(e, a, dist * 0.5));
  if (way === undefined) return;
  Object.assign(e, { mode: 'attack', attack: i, t: 0, bit: false, leap: 0, yaw: away + Math.PI, speed: 0, path: null, shield: 0.4 });
  e.attacks++; f.rolled = 0; f.way = way;
}
// can body e roll `dist` cells along yaw (over walkable floors, nothing in the way)?
function room(e, yaw, dist) {
  const probe = { x: e.x, y: e.y, z: e.z, f: e.f, profile: e.profile }, n = 4;
  for (let i = 0; i < n; i++) if (!stepEnemy(probe, Math.sin(yaw) * dist / n, Math.cos(yaw) * dist / n)) return false;
  return Math.hypot(probe.x - e.x, probe.z - e.z) > dist * 0.9;
}
// ... and the roll (or the leap) carries him the way it goes
function roll(f) {
  const e = f.e, a = e.mode === 'attack' ? attackOf(e) : null;
  if (!a?.dodge) return;
  const r = a.dodge, k = lungeAt(r, e.t), step = (k - f.rolled) * r.dist;
  f.rolled = k;
  if (step > 0) stepEnemy(e, Math.sin(f.way) * step, Math.cos(f.way) * step);
}

// what the room is now: every body of the fight (him and his minions), where it is and what it
// does; rewinding, each is put back to this (rewind)
function tape(f) {
  record(f.tape, f.e.clock, { bodies: renews.filter(b => b.mode !== 'gone').map(bodyRow) });
}

// Brought to the end of a phase's health (the last too: game/renew.js ascend), he stops and gathers time in his hands
// (mode `split`: nothing hurts him); then it runs back
function windup(f) {
  const e = f.e;
  Object.assign(e, { mode: 'split', speed: 0, path: null, t: 0, shield: G.windup + 0.5, attack: 0 });
  f.windup = G.windup;
  setStatus(e.stage < PHASES ? `${e.profile.label}: "Not yet." He turns back time!` : `${e.profile.label}: "One more time..."`);
  sfx('clockwind', { at: e });
}
function startRewind(f) {
  const e = f.e, length = e.clock;
  f.rewind = { length, time: rewindTime(length), u: 0, attacks: e.attacks };
  e.rewinding = true;
  clearProjectiles();   // (what flies goes back with the tape, game/rewind.js)
  for (const b of renews) b.rewound = true;   // (no voices while it runs back, game/sounds.js)
  sfx('rewind', { at: e });
}
// Time running back: the room's clock goes back to the start of the phase, and every body that
// was here then is where the tape has it (one that was not yet here is gone; one that died is up
// again), warded. At the start of the phase, he takes up his next weapon.
function rewind(f, dt) {
  const e = f.e, r = f.rewind;
  r.u = Math.min(1, r.u + dt / r.time);
  e.clock = rewoundAt(r.length, r.u);
  const span = spanAt(f.tape, e.clock);
  if (span) {
    const at = new Map(span.b.bodies.map(row => [row[0], row])), here = new Set();
    for (const row of span.a.bodies) {
      const b = row[0], o = at.get(b) ?? row;
      here.add(b);
      if (!renews.includes(b)) renews.push(b);   // (a corpse let go: back from where it lay)
      put(b, row, o, span.k);
    }
    for (const b of renews) if (!here.has(b) && b !== e && b.mode !== 'gone') Object.assign(b, { mode: 'gone', speed: 0 });
  }
  for (const b of renews) { b.shield = 0.2; b.rewound = true; }
  if (r.u >= 1) endRewind(f);
}
// body b as the tape has it between rows A and B (k of the way)
function put(b, A, B, k) {
  const { profile, ...was } = bodyAt(A, B, k);
  if (b.view?.dead && was.mode !== 'dead') removeEnemyViews([b]);   // (up again: drawn afresh)
  Object.assign(b, was, { falling: null, kbx: 0, kbz: 0, stun: 0, path: null });
}
function endRewind(f) {
  const e = f.e, first = f.tape.frames[0]?.bodies.find(row => row[0] === e);
  if (first) put(e, first, first, 0);
  e.attacks = f.rewind.attacks + 1;   // (he has struck: his room lets him fight on, game/defence.js)
  for (const b of renews) if (b !== e) { b.rewound = false; leave(b, G.leave); }
  f.minions = [];
  if (e.stage >= PHASES) { ascend(f); return; }   // the last one: he does not come back
  e.stage++;
  e.profile = enemyProfile(STAGE_PROFILES.renew[e.stage - 1], e.level);
  Object.assign(e, { hp: e.profile.hp, hpFloor: 1, attack: 0, t: 0, cool: G.rest, rewinding: false,
    rewound: false, clock: 0, shield: 0.4, lastHp: e.profile.hp });
  e.barred = barred({ stage: e.stage });
  f.rewind = null; f.tape = newTape(); f.next = 0; f.cool = G.firstSummon; f.combo = 0; f.dodge = 1; f.leap = 1;
  engage(e);
  setStatus([null, null, `${e.profile.label} takes up a bow. Your echo does again what you did!`,
    `${e.profile.label} takes up a morning star. Two of your echoes walk again!`,
    `${e.profile.label} takes up a morning star with two balls! Three of your echoes walk again!`][e.stage]);
  sfx('rewound', { at: e });
}

// Beaten at the end of his last bar, time ran back once more, but he does not come back: a ghost,
// he rises into the sky (mode `split`, nothing hurts him; render/renewview.js draws him pale and
// fading), while the room's clock runs on and the echoes and ghosts fight on below (game/rewind.js).
// Once he is gone he dies there (no body left: `ascended`), and what he had falls out of the sky
// (`lootFrom`, game/loot.js dropLoot): his gate opens.
function ascend(f) {
  const e = f.e;
  Object.assign(e, { mode: 'split', t: 0, speed: 0, path: null, attack: 0, shield: 99, rewinding: false, rewound: false, clock: 0,
    hpFloor: 0, rising: { t: 0, from: e.y, u: 0 } });
  f.rewind = null;
  setStatus(`${e.profile.label} has no more time. He rises away into the sky...`);
  sfx('portal', { at: e, pitch: 0.7 });
}
function rise(f, dt) {
  const e = f.e, r = e.rising;
  r.t += dt; r.u = risenAt(r.t);
  e.y = r.from + G.ascend.height * r.u;
  if (r.t < G.ascend.time) return;
  e.lootFrom = { x: e.x, y: e.y, z: e.z };
  Object.assign(e, { y: r.from, rising: null, ascended: true, shield: 0 });
  damageEnemy(e, e.hp);
  setStatus(`${e.profile.label} is gone, back into time. What he had falls out of the sky`);
  sfx('dawn', { at: e });
}

// A cast's hit frame (phases 2 and 3): he raises his weapon to the sky, and his minions are cast
// out of it onto the floor round him and the player, falling (`falling`) until they land
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], n = summonCount(e.stage, f.minions.length);
  f.cool = G.summonCool[e.stage - 1];
  if (!n) return;
  const p = nearest(e), ahead = Math.min(4, Math.hypot(p.x - e.x, p.z - e.z));
  const list = minionFloors(e, kind, n, renews.filter(living), { ahead, within: 6.5 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, Math.atan2(p.x - s.x - 0.5, p.z - s.z - 0.5), f.n);
    Object.assign(m, { falling: { to: m.y, v: 0 }, cool: 0.6 + Math.random() * 0.6 });
    m.y += G.drop.height + Math.random() * 1.5;
    return m;
  });
  renews.push(...list); f.minions.push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'time');
}
// his minions falling out of the sky; landing with a thump and a ring of dust
function fall(f, dt) {
  for (const m of f.minions) {
    const d = m.falling;
    if (!d) continue;
    d.v += G.drop.gravity * dt;
    m.y -= d.v * dt;
    if (Math.hypot(m.x - player.x, m.z - player.z) < 20 && Math.random() < dt * 40)
      emit(glow, m.x + rand(-0.1, 0.1), m.y + m.profile.height * 0.5, m.z + rand(-0.1, 0.1), { v: [0, d.v * 0.3, 0], life: rand(0.2, 0.35),
        size: rand(0.08, 0.14), color: ['#ffffff', '#bdf3ff', '#ffe9a8'][Math.floor(Math.random() * 3)], drag: 2 });
    if (m.y > d.to) continue;
    m.y = d.to; m.falling = null;
    landed(m);
  }
}
function landed(m) {
  if (Math.hypot(m.x - player.x, m.z - player.z) > 20) return;
  sfx('thud', { at: m, pitch: 0.8 });
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1, 2.4);
    emit(soft, m.x, m.y + 0.08, m.z, { v: [Math.cos(a) * s, rand(0.2, 0.8), Math.sin(a) * s], life: rand(0.4, 0.7),
      size: rand(0.18, 0.3), grow: 1.2, color: '#c9c0ae', alpha: 0.45, drag: 2.5 });
  }
  if (Math.hypot(m.x - player.x, m.z - player.z) < 5) cameraKick(0, 0, 0, 0.04);
}
