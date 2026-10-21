// Renew's fight as rules (game/renew.js runs it, game/rewind.js rewinds our own hero and plays his
// echoes and the ghosts of the fight; his profiles are core/enemies.js RENEW, RENEW_BOW,
// RENEW_FLAIL and RENEW_TWIN). docs/bosses.md tells the whole fight.
//
// Renew is a hero like the player: the same figure, running, rolling out of the way and chaining
// his blows as a player chains clicks, with a weapon in his hands: a sword (phase 1), a bow
// (phase 2), a morning star (phase 3: a flail of one ball) and a twin morning star (phase 4: two
// balls). With the bow he keeps his distance, running backwards and leaping back out of reach.
// Each phase is a whole health bar. Brought down
// to its end (the first three) he turns back time: everything that happened in the room since the
// phase began runs backwards (him, his minions, the player, the shots in flight), every body warded
// meanwhile, until the room is as it was then; and he goes on with his next weapon. But the player
// was there all along, so now there are two of them: the player's past self, the echo, does again
// what the player did in that phase, and its blows (and shots) hurt the player; and the fight it was
// in plays again with it, ghosts of him and his minions as they were then (harmless). Every phase
// adds an echo. In phases 2 and 3 he casts minions out of the sky onto the floor: spiders, then
// Fire-faces. The light goes as the fight goes on: dusk, then night. At the end of the last bar
// time runs back once more, but he does not come back: he rises into the sky as a ghost and is
// gone, his loot falling out of the sky where he went (always a flail among it: core/gear/drops.js);
// the echoes and the ghosts fight on a while (harmless now) and fade.
//
// The room's time is a clock (`clock` on him, s since the phase began) that runs forward while
// they fight and back while he rewinds; tapes record what the room was at each moment, and a
// rewind and an echo play a tape back at that clock.
//
import { ballAt } from './combat.js';

// (his final rewind's end: how far he has risen, 0 .. 1, at time t of it)
export const risenAt = t => { const u = Math.min(1, Math.max(0, t / RENEW_FIGHT.ascend.time)); return u * u * (3 - 2 * u); };

export const RENEW_FIGHT = Object.freeze({
  weapons: ['weapon_sword_medium', 'weapon_bow_hunting', 'weapon_flail_morningstar', 'weapon_flail_twin'],   // in his hands, phase by phase
  sample: 1 / 20,                // s between the frames of a tape
  windup: 1.4,                   // s he gathers time in his hands before it runs back (nothing hurts him)
  rewind: { speed: 10, min: 4, max: 8 },   // the rewind lasts the phase's length / speed, but min .. max s
  rest: 1.2,                     // s after the rewind before he strikes again
  minions: [0, 4, 2, 0],         // the most of his minions at once, phase by phase (spiders, then Fire-faces)
  summonCool: [0, 10, 13, 0],    // s from one cast of minions to the next
  firstSummon: 3,                // s into a phase before his first cast
  drop: { height: 6, gravity: 20 },   // cells over the floor his minions are cast from, how fast they fall (cells/s²)
  combo: [3, 1, 2, 2],           // the most blows he chains in a row, phase by phase
  chain: 0.06,                   // s between chained blows
  dodge: { chance: 0.4, every: 2.2, near: 0.6 },   // a roll out of a player's swing: how likely, how often at most (s), how far past its reach (cells)
  leap: { every: 2.4, near: 0.5 },   // with the bow: a leap back once the player is this far inside his keep[0], at most every s
  echo: { power: 0.45, fade: 0.35 },   // an echo's blow (× his damage), s it takes to come and go
  ascend: { time: 3.2, height: 7 },   // beaten: he rises as a ghost into the sky over this long (s), this high (cells)
  outro: 3.5,                    // s the echoes and the ghosts fight on once he is gone, before they fade
  leave: 0.3,                    // s a minion lingers, gone, before it is let go
});
export const PHASES = 4;
const ALL = ['slash', 'dash', 'roll', 'leap', 'summon', 'spell', 'volley', 'shoot', 'arrows'];

// how many minions a cast brings in phase `stage` with `alive` of them about
export const summonCount = (stage, alive) => Math.max(0, (RENEW_FIGHT.minions[stage - 1] ?? 0) - alive);
// The attacks he may not start now: the roll and the leap only ever as a dodge (game/renew.js),
// the cast only when it is due (and phases 2 and 3 have it)
export function barred({ stage, summonDue = false }) {
  return new Set(ALL.filter(n => n === 'roll' || n === 'leap' || (n === 'summon' && !(summonDue && stage > 1))));
}
// how dark the fight has got (0 .. 1): a quarter a phase, the more the further he is brought down
// in it (share: of his health lost in the phase)
export const duskAt = (stage, share) => Math.min(1, Math.max(0, (stage - 1 + Math.min(1, Math.max(0, share))) / PHASES));

// --- tapes ---------------------------------------------------------------------------------
// A tape: frames at rising times (`t`, the room's clock), each what the caller recorded then.
export const newTape = () => ({ frames: [] });
export function record(tape, t, frame) {
  const last = tape.frames.at(-1);
  if (last && t <= last.t) return false;
  frame.t = t;
  tape.frames.push(frame);
  return true;
}
export const tapeLength = tape => tape.frames.at(-1)?.t ?? 0;
// the frames round time t and how far between them: { a, b, k } (a === b at either end; null:
// an empty tape)
export function spanAt(tape, t) {
  const F = tape.frames;
  if (!F.length) return null;
  if (t <= F[0].t) return { a: F[0], b: F[0], k: 0 };
  if (t >= F.at(-1).t) return { a: F.at(-1), b: F.at(-1), k: 0 };
  let lo = 0, hi = F.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].t <= t) lo = mid; else hi = mid; }
  const a = F[lo], b = F[hi];
  return { a, b, k: (t - a.t) / (b.t - a.t) };
}
export const lerp = (a, b, k) => a + (b - a) * k;
export const lerpYaw = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// A body of the room on a tape (a row): [body, x, y, z, yaw, hp, mode, attack, t, attacks, speed,
// deadT, f (its floor), profile (what it was then: Renew's weapon of that phase)]
export const bodyRow = b => [b, b.x, b.y, b.z, b.yaw, b.hp, b.mode, b.attack, b.t, b.attacks, b.speed, b.deadT, b.f, b.profile];
// ... and what the body was between rows A and B, k of the way (what changes at once, at the nearer)
export function bodyAt(A, B, k) {
  const near = k < 0.5 ? A : B;
  return { x: lerp(A[1], B[1], k), y: lerp(A[2], B[2], k), z: lerp(A[3], B[3], k), yaw: lerpYaw(A[4], B[4], k),
    hp: Math.round(lerp(A[5], B[5], k)), mode: near[6], attack: near[7], attacks: near[9],
    t: A[9] === B[9] ? lerp(A[8], B[8], k) : near[8], speed: lerp(A[10], B[10], k), deadT: lerp(A[11], B[11], k), f: near[12], profile: near[13] };
}
// the bodies on a tape at time t: body -> its state then (those not there then are not in it)
export function bodiesAt(tape, t) {
  const span = spanAt(tape, t), out = new Map();
  if (!span?.a.bodies) return out;
  const later = new Map(span.b.bodies.map(row => [row[0], row]));
  for (const row of span.a.bodies) out.set(row[0], bodyAt(row, later.get(row[0]) ?? row, span.k));
  return out;
}

// A rewind of a phase `length` s long: how long it takes, and the room's clock u of the way
// through it (0 .. 1): slow at first, racing back, slowing down at the end
export const rewindTime = length => Math.min(RENEW_FIGHT.rewind.max, Math.max(RENEW_FIGHT.rewind.min, length / RENEW_FIGHT.rewind.speed));
const ease = u => u * u * (3 - 2 * u);
export const rewoundAt = (length, u) => length * (1 - ease(Math.min(1, Math.max(0, u))));

// --- the echo ------------------------------------------------------------------------------
// What the player did in a phase, as the echo does it again: the blows of their sword (`strikes`,
// each where its blade went through: the first frame of a swing in its active window) and the
// shots of their bow, crossbow or staff (`shots`, the frame each left). A player frame's swing
// (`sw`, null between attacks): { n: its serial, t: how far into it, yaw, fired, ranged, range,
// arc (rad, each way), a0, a1 (its active window), color (a spell's), balls (a flail's: each
// strikes) }.
export function echoEvents(tape) {
  const strikes = [], shots = [], struck = new Set(), shot = new Set();
  for (const f of tape.frames) {
    const s = f.sw;
    if (!s) continue;
    const blow = `${s.n}:${ballAt({ balls: s.balls, activeStart: s.a0, activeEnd: s.a1 }, s.t)}`;
    if (!s.ranged && s.t >= s.a0 && s.t <= s.a1 + 0.1 && !struck.has(blow)) {
      struck.add(blow);
      strikes.push({ t: f.t, x: f.x, y: f.y, z: f.z, yaw: s.yaw, range: s.range, arc: s.arc });
    }
    if (s.ranged && s.fired && !shot.has(s.n)) {
      shot.add(s.n);
      shots.push({ t: f.t, x: f.x, y: f.y, z: f.z, yaw: s.yaw, kind: s.kind, color: s.color ?? null });
    }
  }
  return { strikes, shots };
}
// is body p (x, y, z, r) in the way of an echo's blow? Like a sword's arc (core/combat.js inSwordArc)
export function inStrike(s, p) {
  const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
  if (d > s.range + (p.r ?? 0.22)) return false;
  if (d > 0.01 && Math.cos(Math.atan2(dx, dz) - s.yaw) < Math.cos(s.arc)) return false;
  return p.y + 0.85 > s.y + 0.08 && p.y < s.y + 0.85;
}
// the echoes a phase starts with: one for each phase before it
export const echoesIn = stage => Math.max(0, stage - 1);
