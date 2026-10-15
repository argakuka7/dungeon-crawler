// Shared floor-bound behaviour. Species tuning controls health, speed, clearance,
// wind-up / strike / recovery, and what a hit does; a species with several attacks
// picks one each time it strikes, among those its target is in reach of. A ranged attack is
// thrown from its reach away when it has a clear shot; a species that also fights up close
// keeps closing in while its throw recovers. A pouncing one is carried forward through its leap,
// one that retreats (the Spicy) rolls back before it fires its beam (game/beams.js).
//
// Whom it goes after: the player, or when playing together the nearer of the two players
// (game/party.js chooseTarget, its `target`); "the player" below is that one.
//
// Awareness: an enemy sees the player within its `aggro` ahead of it, half as far behind it,
// and hears one right next to it. It turns towards a player it half notices, reacts a moment
// after it notices, and calls the others near it. A hunt follows the player over the floor
// graph (stairs, ramps, bridges and landings included) to where it last knew the player stood,
// or as close to that as it gets; out of sight it keeps hunting for a while, then searches
// around that spot and only then goes home. A hit makes it hunt for longer.
// In the fight its `style` decides what it does between blows: a skirmisher backs off and
// circles, then darts in again; a ranged one keeps its distance and sidesteps; a brute holds
// its ground (and a `charge`r runs at the player from a few cells away). Throws are aimed a
// little ahead of a running player.
import { player, state } from './state.js';
import { party, chooseTarget, alive as canHurt } from './party.js';
import { playerFloor, strikePlayer } from './enemycombat.js';
import { stepEnemy, findPath, pathToward, around, clearLine } from '../physics/enemynav.js';
import { attackOf, pickAttack, attacksInReach, lungeDistance, lungeAt, retreatAt, fireAt, isRanged, shotOf } from '../core/enemies.js';
import { launchProjectile } from './projectiles.js';
import { fireBeam } from './beams.js';
import { tryHordeAttack } from './hordes.js';

const THINK = 0.2;         // s between decisions
export const AHEAD = -0.2; // ahead: the cosine of the angle to the player is above this (about 100 degrees each way)
export const BEHIND = 0.5; // the share of its aggro an enemy sees behind it
export const HEAR = 1.6;   // cells: this close it notices the player without seeing them
export const WARY = 1.4;   // times its aggro: it turns towards a player it can see this far
const REACT = 0.3;         // s (and up to as much again) from noticing to giving chase
const CALL = 5;            // cells: how far a call to arms carries
const MEMORY = 3;          // s it hunts on out of sight
const PROVOKED = 6;        // s after a hit it hunts on out of sight
const SEARCH = 4;          // s it searches around the spot it lost the player at
const STRANDED = 4;        // s it waits as close as it gets to a player it cannot reach
const HUNT = 24;           // longest path (steps) it plans on a hunt
const LEAD = 0.5;          // how much of a running player's way a throw is aimed ahead

// Calls to arms: where an enemy noticed the player (or was hit), heard by idle allies nearby.
let calls = [];
export const resetCalls = () => { calls = []; };
export function stepCalls(dt) { calls = calls.filter(c => (c.t -= dt) > 0); }
const call = e => calls.push({ x: e.x, y: e.y, z: e.z, t: 0.3, from: e });

// learn: space.html#angles (see learn/README.md)
const turn = (e, yaw, dt, rate = 8) => { e.yaw += Math.atan2(Math.sin(yaw - e.yaw), Math.cos(yaw - e.yaw)) * Math.min(1, dt * rate); };
// the player e goes after (one that left the cube is not gone after any more)
const foe = e => e.target && (e.target === player || e.target.here) ? e.target : player;
const toPlayer = e => { const p = foe(e); return Math.atan2(p.x - e.x, p.z - e.z); };
const side = () => Math.random() < 0.5 ? -1 : 1;
function steer(e, x, z, speed, dt) {
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { e.speed = 0; return true; }
  turn(e, Math.atan2(dx, dz), dt);
  const forward = Math.max(0, (Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / d);
  const step = Math.min(d, speed * forward * dt), x0 = e.x, z0 = e.z;
  stepEnemy(e, Math.sin(e.yaw) * step, Math.cos(e.yaw) * step);
  e.speed = Math.hypot(e.x - x0, e.z - z0) / dt;
  return false;
}
// move along (ux, uz) while facing the player: sidesteps and backing off. Returns the share
// of the step it managed.
function slide(e, ux, uz, speed, dt) {
  const x0 = e.x, z0 = e.z;
  stepEnemy(e, ux * speed * dt, uz * speed * dt);
  turn(e, toPlayer(e), dt);
  e.speed = Math.hypot(e.x - x0, e.z - z0) / dt;
  return e.speed / speed;
}
function follow(e, speed, dt, end) {
  if (!e.path) { e.speed = 0; return true; }
  const i = e.path.indexOf(e.f);
  if (i > 0) e.path = e.path.slice(i);
  const next = e.path[1];
  if (next) { steer(e, next.x + 0.5, next.z + 0.5, speed, dt); return false; }
  return steer(e, end ? end[0] : e.f.x + 0.5, end ? end[1] : e.f.z + 0.5, speed, dt);
}

// a clear line from its eyes to the player's chest, within range and within `rise` above or below
function sees(e, range, rise = 1.6, p = foe(e)) {
  const d = Math.hypot(p.x - e.x, p.z - e.z);
  if (d > range || Math.abs(p.y - e.y) > rise) return false;
  return clearLine(e.x, e.y + Math.min(e.profile.bodyHeight, 1) * 0.8, e.z, p.x, p.y + 0.6, p.z);
}
// does an unaware enemy notice the player? Ahead of it within aggro, behind it at half that,
// or right next to it
// learn: enemies.html#decide-code (see learn/README.md)
export function notices(e, p = foe(e)) {
  const d = Math.hypot(p.x - e.x, p.z - e.z);
  if (d < HEAR && Math.abs(p.y - e.y) < 1) return true;
  const ahead = Math.cos(Math.atan2(p.x - e.x, p.z - e.z) - e.yaw) > AHEAD;
  return sees(e, e.profile.aggro * (ahead ? 1 : BEHIND), 1.6, p);
}
// remember where the player is (and the floor they stand on, if this enemy can walk it)
function spot(e) {
  const p = foe(e), f = playerFloor(e.profile.height, p);
  e.seen = { x: p.x, y: p.y, z: p.z, f: f ?? e.seen?.f ?? null };
  e.lost = 0;
}
function notice(e, delay, loud) {
  spot(e);
  e.mode = 'alert'; e.t = delay; e.speed = 0; e.path = null;
  if (loud) call(e);
}
// a hit: it knows where the shot came from, hunts for longer and calls the others
function provoke(e) {
  spot(e); e.provoked = PROVOKED;
  if (e.horde || e.defence) return;   // their groups decide
  call(e);
  if (e.mode !== 'attack' && e.mode !== 'chase') { e.mode = 'chase'; e.think = 0; }
}
function goHome(e) { e.mode = 'home'; e.path = findPath(e.f, e.home, 40, e.profile.height) || [e.f]; e.provoked = 0; }
function search(e) {
  e.mode = 'search'; e.t = SEARCH; e.pause = 0; e.look = e.yaw;
  e.path = e.seen?.f ? findPath(e.f, e.seen.f, HUNT, e.profile.height) : null;
}
// Hunting: a path to the floor the player stands on (else to where it last saw them, else as
// close to that as it gets); out of sight for too long, or stuck short of a player it cannot
// reach, it starts searching.
function hunt(e) {
  const p = foe(e), cfg = e.profile, d = Math.hypot(p.x - e.x, p.z - e.z);
  if (sees(e, Math.max(cfg.aggro, cfg.giveUp), 4) || d < HEAR) spot(e);   // a quarry up a stair stays in sight
  else e.lost += THINK;
  if (!e.seen) { search(e); return; }
  const goal = e.seen.f;
  e.path = goal && findPath(e.f, goal, HUNT, cfg.height);
  const short = !e.path;
  if (short) e.path = pathToward(e.f, e.seen.x, e.seen.y, e.seen.z, HUNT, cfg.height);
  // (a thrower that has the player in sight is not stuck: it shoots from there)
  e.stranded = short && e.path?.length <= 1 && !(isRanged(cfg) && e.lost === 0) ? (e.stranded || 0) + THINK : 0;
  const memory = e.provoked > 0 ? PROVOKED : MEMORY;
  // out of sight: on to where it last saw the player, then look around there
  const there = e.lost > 0.6 && (!e.path || e.path.length <= 1);
  if (e.lost > memory || there || e.stranded > STRANDED) search(e);
}
// learn: enemies.html#decide-code #state-machine, paths.html#bfs (see learn/README.md)
function decide(e) {
  e.target = chooseTarget(e);
  const p = foe(e), cfg = e.profile, target = playerFloor(cfg.height, p);
  const alive = !p.ragdoll && p.hp > 0 && !state.transitioning, dist = Math.hypot(p.x - e.x, p.z - e.z);
  if (e.defence) {
    if (e.mode === 'attack') return;   // never cancel a committed wind-up
    const engage = alive && target && e.defence.engage;
    e.path = findPath(e.f, engage ? target : e.defence.post, 40, cfg.height);
    e.mode = engage && e.path ? 'chase' : 'defend'; e.lost = 0;
    return;
  }
  if (e.horde) {
    if (e.mode === 'attack') return;
    const active = e.horde.group.active && e.horde.wakeIn <= 0 && alive && target;
    if (active) {
      // Approach from different neighbouring floors, then close for the actual bite.
      const flank = dist > 2.5 ? around(target, 1, cfg.height).filter(f => f !== target) : [];
      const goal = flank.length ? flank[e.hordeSlot % flank.length] : target;
      e.path = findPath(e.f, goal, 32, cfg.height);
      e.mode = 'chase'; e.lost = 0;
    } else if (e.mode === 'chase') goHome(e);
    return;
  }
  if (e.mode === 'attack' || e.mode === 'alert') return;
  if (e.mode === 'chase') {
    if (alive) hunt(e); else goHome(e);
    return;
  }
  // unaware: idle, walking about, going home or searching
  e.wary = alive && dist < cfg.aggro * WARY && sees(e, cfg.aggro * WARY);
  // either player can catch its eye
  const noticed = !state.transitioning && party().find(b => canHurt(b) && notices(e, b));
  if (noticed) { e.target = noticed; notice(e, (e.mode === 'search' ? 0.5 : 1) * REACT * (1 + Math.random()), true); return; }
  const heard = alive && calls.find(c => c.from !== e && Math.hypot(c.x - e.x, c.z - e.z) < CALL && Math.abs(c.y - e.y) < 2);
  if (heard) notice(e, REACT * (1.5 + Math.random()), false);
}
// a thrown attack (or a beam) needs a free line from its muzzle height to the player's chest
const clearShot = (e, a, p = foe(e)) => clearLine(e.x, e.y + shotOf(a).muzzle[1], e.z, p.x, p.y + p.h * 0.55, p.z);
// the attacks e could start now (indices into profile.attacks; [0] for a single attack)
function ready(e, d) {
  const p = foe(e), list = e.profile.attacks ?? [e.profile];
  if (p.ragdoll) return [];
  return attacksInReach(e.profile, d, Math.abs(p.y - e.y)).filter(i => !shotOf(list[i]) || clearShot(e, list[i]));
}
// where a wind-up turns to: the player, or for a throw a little ahead of where they run
function aim(e, a) {
  const p = foe(e);
  if (!a.projectile) return toPlayer(e);
  const t = Math.max(0, a.hitAt - e.t) + Math.hypot(p.x - e.x, p.z - e.z) / a.projectile.speed;
  return Math.atan2(p.x + (p.vx || 0) * t * LEAD - e.x, p.z + (p.vz || 0) * t * LEAD - e.z);
}
// The leap of a pounce: once it takes off it commits to a distance (along its heading, up to
// lunge.stop short of the player) and covers it between lunge.from and lunge.to.
function leap(e, lunge, t0, dx, dz) {
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  if (t0 < lunge.from && e.t >= lunge.from) e.leap = lungeDistance(lunge, Math.max(0, fx * dx + fz * dz));
  const step = (lungeAt(lunge, e.t) - lungeAt(lunge, t0)) * e.leap;
  if (step > 0) stepEnemy(e, fx * step, fz * step);
}
// A retreat: it rolls straight back from its heading by retreat.dist over the retreat's window.
function backOff(e, retreat, t0) {
  const step = retreatAt(retreat, e.t) - retreatAt(retreat, t0);
  if (step > 0) stepEnemy(e, -Math.sin(e.yaw) * step, -Math.cos(e.yaw) * step);
}
// Between blows, by style. Returns false where it should simply close in.
//   skirmish: backs off after a blow, circles at `circle` cells (sidestepping if it `strafe`s,
//     else walking round), then darts in when it can strike again
//   ranged: backs away inside keep[0], sidesteps while its throw recovers
//   brute: holds its ground
function manoeuvre(e, dt, d, strike) {
  const p = foe(e), cfg = e.profile, speed = cfg.chase;
  // a side it cannot go on to: try the other one; and now and then anyway
  const going = moved => {
    e.blocked = moved < 0.25 ? (e.blocked || 0) + dt : 0;
    if (e.blocked > 0.25 || (e.flip -= dt) <= 0) { e.side = -(e.side || 1); e.blocked = 0; e.flip = 1.5 + Math.random() * 2; }
  };
  if (cfg.style === 'skirmish') {
    if (e.cool <= 0 && state.enemyGrace <= 0 && !e.held) return false;
    const away = Math.atan2(e.x - p.x, e.z - p.z), r = cfg.circle;
    const backing = e.cool > cfg.cooldown * 0.6 && d < r;
    const a = away + (e.side || 1) * (backing ? 0.4 : 0.75), R = backing ? r + 0.4 : r;
    const tx = p.x + Math.sin(a) * R, tz = p.z + Math.cos(a) * R;
    if (cfg.strafe) {
      const ux = tx - e.x, uz = tz - e.z, l = Math.hypot(ux, uz) || 1;
      going(slide(e, ux / l, uz / l, speed * 0.75, dt));
    } else {
      const x0 = e.x, z0 = e.z;
      steer(e, tx, tz, speed * 0.75, dt);
      going(Math.hypot(e.x - x0, e.z - z0) / (speed * 0.75 * dt));
    }
    return true;
  }
  if (cfg.style === 'ranged') {
    if (e.cool <= 0 && state.enemyGrace <= 0 && !e.held) return false;
    const ux = (e.x - p.x) / (d || 1), uz = (e.z - p.z) / (d || 1), s = e.side || 1;
    if (d < cfg.keep[0] && slide(e, ux, uz, speed * 0.9, dt) > 0.5) return true;
    if (!strike && d > cfg.keep[0]) return false;   // no shot from here: get one
    going(slide(e, uz * s, -ux * s, speed * 0.55, dt));
    return true;
  }
  return false;
}
function fight(e, dt) {
  const p = foe(e), cfg = e.profile, dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  if (!e.path) { e.speed = 0; turn(e, toPlayer(e), dt, 3); return; }
  const facing = Math.cos(Math.atan2(dx, dz) - e.yaw) > 0.7, can = ready(e, d), list = cfg.attacks ?? [cfg];
  // only throws in reach while they recover: one that also bites keeps coming
  const closing = e.cool > 0 && can.every(i => shotOf(list[i])) && list.some(a => !shotOf(a));
  const strike = can.length > 0 && !closing;
  e.held = false;
  if (strike && e.cool <= 0 && state.enemyGrace <= 0) {
    e.speed = 0; turn(e, Math.atan2(dx, dz), dt);
    if (!facing) return;
    if (tryHordeAttack(e)) {
      e.mode = 'attack'; e.t = 0; e.bit = false; e.attacks++; e.attack = pickAttack(cfg, Math.random(), can); e.leap = 0;
      return;
    }
    e.held = true;   // the horde has enough attackers
  }
  // in the fight (close, in sight, a short way): manoeuvre between blows
  if (d < 4 && e.lost === 0 && e.path.length <= 4 && manoeuvre(e, dt, d, strike)) return;
  if (strike) { e.speed = 0; turn(e, Math.atan2(dx, dz), dt); return; }
  // a charger runs the last few cells at a player it sees, when it can strike again
  const charging = cfg.charge && e.lost === 0 && e.cool <= 0 && d > 1.5 && d < 5;
  follow(e, cfg.chase * (charging ? cfg.charge : 1), dt, e.lost === 0 ? [p.x, p.z] : e.seen && [e.seen.x, e.seen.z]);
}
// learn: enemies.html#state-machine, paths.html#bfs (see learn/README.md)
function act(e, dt) {
  const p = foe(e), cfg = e.profile, dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  if (e.mode === 'attack') {
    const a = attackOf(e), t0 = e.t;
    e.t += dt; e.speed = 0;
    if (e.t < a.trackUntil) turn(e, aim(e, a), dt, 6);
    else if (e.beam) turn(e, Math.atan2(e.beam.ax - e.x, e.beam.az - e.z), dt, 10);   // follows its laser's aim
    if (a.lunge) leap(e, a.lunge, t0, dx, dz);
    if (a.retreat) backOff(e, a.retreat, t0);
    if (!e.bit && e.t >= fireAt(a)) {
      e.bit = true;
      if (a.beam) fireBeam(e, a); else if (a.projectile) launchProjectile(e, a); else strikePlayer(e);
    }
    if (e.t >= a.attackTime) { e.mode = 'chase'; e.cool = cfg.cooldown * (0.8 + Math.random() * 0.4); e.side = side(); }
    return;
  }
  if (e.mode === 'alert') {   // noticed: turns to look, then gives chase
    e.speed = 0; turn(e, toPlayer(e), dt, 10);
    if ((e.t -= dt) <= 0) { e.mode = 'chase'; e.think = 0; e.side = side(); }
    return;
  }
  if (e.mode === 'chase') { fight(e, dt); return; }
  if (e.mode === 'defend') {
    if (follow(e, e.guardian ? cfg.homeSpeed : cfg.chase, dt)) turn(e, toPlayer(e), dt, 2);
    return;
  }
  if (e.mode === 'search') {   // walks to where it lost the player, then looks about nearby
    if ((e.t -= dt) <= 0) { goHome(e); return; }
    if (!follow(e, (cfg.wander + cfg.chase) / 2, dt)) return;
    e.speed = 0; turn(e, e.look, dt, 3);
    if ((e.pause -= dt) > 0) return;
    const spots = around(e.seen?.f ?? e.f, 2, cfg.height);
    e.path = findPath(e.f, spots[Math.floor(Math.random() * spots.length)], 6, cfg.height);
    e.look = e.yaw + (Math.random() - 0.5) * 3; e.pause = 0.5 + Math.random() * 0.7;
    return;
  }
  if (e.mode === 'walk' || e.mode === 'home') {
    if (follow(e, e.mode === 'home' ? cfg.homeSpeed : cfg.wander, dt)) {
      e.mode = 'idle'; e.t = 2 + Math.random() * 4; e.speed = 0; e.look = e.yaw;
    }
    return;
  }
  // idle: looks about, and turns towards a player it half notices
  e.speed = 0;
  if (e.wary && !p.ragdoll) turn(e, toPlayer(e), dt, 1.5);
  else if (e.look !== undefined) turn(e, e.look, dt, 2);
  if ((e.t -= dt) > 0) return;
  if (Math.random() < 0.35) { e.look = e.yaw + (Math.random() - 0.5) * 2.5; e.t = 1 + Math.random() * 2; return; }
  const spots = around(e.home, 2, cfg.height);
  e.path = findPath(e.f, spots[Math.floor(Math.random() * spots.length)], 6, cfg.height);
  e.mode = e.path ? 'walk' : 'idle'; e.t = 2;
}
// a blow's push, sliding along the floor graph and dying away quickly
function knockback(e, dt) {
  if (!e.kbx && !e.kbz) return;
  stepEnemy(e, e.kbx * dt, e.kbz * dt);
  const k = Math.exp(-dt * 10);
  e.kbx *= k; e.kbz *= k;
  if (Math.hypot(e.kbx, e.kbz) < 0.05) e.kbx = e.kbz = 0;
}
// learn: enemies.html#decide-code #fair (see learn/README.md)
export function stepEnemies(list, dt) {
  for (const e of list) {
    knockback(e, dt);
    if (e.mode === 'dead') { e.deadT += dt; continue; }
    if (e.hp < (e.lastHp ?? e.hp)) provoke(e);
    e.lastHp = e.hp;
    e.cool = Math.max(0, e.cool - dt); e.hurtT = Math.max(0, e.hurtT - dt); e.poised = Math.max(0, (e.poised || 0) - dt);
    e.provoked = Math.max(0, (e.provoked || 0) - dt);
    if (e.stun > 0) { e.stun -= dt; e.speed = 0; continue; }
    if (state.devPassive) { e.speed = 0; e.path = null; if (e.mode !== 'idle') { e.mode = 'idle'; e.t = 1; } continue; }
    if ((e.think -= dt) <= 0) { e.think = THINK * (0.8 + Math.random() * 0.4); decide(e); }
    act(e, dt);
  }
}
