// Enemies come back. An ordinary enemy (one of a cube's own or of its horde: `respawn`, the key of
// its cube) that died RESPAWN seconds of play ago is back the next time anyone comes into its
// cube: never in front of you. Guardians, their defenders, bounties, raiders, summoned minions and
// dev spawns have no `respawn` and stay dead.
//
// run.kills remembers each such kill: id -> { n, at, cube }. n is how many times it came back
// (its life: 0 the first), at the play time it died (run.clock), cube where it lives. A life of
// its own rolls its own drops (`wave` mixes into the drop seed, core/gear/drops.js) and its own
// coins, and drops under a source of its own (`dropSource`), so coming back pays anew. A death
// that puts a cube back (core/guardians.js restoreDefeated) brings the enemy back in the same
// life: dying does not re-roll anything.
import { mulberry32, hash32 } from './util.js';
import { coinRange } from './enemies.js';

export const RESPAWN = 300;   // s of play after its death an enemy is back, when its cube is entered

// a kill awardKill (core/progression.js) is paying for, remembered if the enemy comes back
export function noteKill(run, e) {
  if (e.respawn && e.id) run.kills.set(e.id, { n: e.wave ?? 0, at: run.clock, cube: e.respawn });
}
// another player's kill (net/session.js, `defeated`): life n of enemy id, which lives in cube
export function shareKill(run, id, cube, n) {
  if (typeof cube !== 'string' || !Number.isInteger(n) || n < 0) return;
  const k = run.kills.get(id);
  if (!k || k.n <= n) run.kills.set(id, { n, at: run.clock, cube });
}
// Coming into cube `key`: whoever of it has been dead long enough comes back, in its next life.
// Returns how many came back.
export function respawnCube(run, key) {
  let back = 0;
  for (const [id, k] of run.kills) {
    if (k.cube !== key || !run.defeated.has(id) || run.clock - k.at < RESPAWN) continue;
    run.defeated.delete(id); k.n++; back++;
  }
  return back;
}
// which life enemy `id` is in
export const lifeOf = (run, id) => run.kills.get(id)?.n ?? 0;
// enemy e (just made from its spot) in the life the run says: its wave, and from the second life
// on coins of their own
export function liveAgain(run, e) {
  const n = e.respawn ? lifeOf(run, e.id) : 0;
  e.wave = n;
  if (!n || !e.kind?.coins) return e;
  const [lo, hi] = coinRange(e.kind, e.level || 1), R = mulberry32(hash32(hashId(e.id) ^ Math.imul(n, 0x85ebca6b) ^ 0xc017));
  e.coinDrop = lo + Math.floor(R() * (hi - lo + 1));
  return e;
}
// the loot source of an enemy's drop (game/loot.js): one per life
export const dropSource = e => e.wave ? `e:${e.id}~${e.wave}` : `e:${e.id}`;
// the enemy a drop source is of (null: not an enemy's)
export const sourceEnemy = s => s.startsWith('e:') ? s.slice(2).replace(/~\d+$/, '') : null;

function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// saved / sent: [[id, n, at, cube]]
export const packKills = kills => [...kills].map(([id, k]) => [id, k.n, Math.round(k.at * 10) / 10, k.cube]);
export function unpackKills(list) {
  const out = new Map();
  for (const x of Array.isArray(list) ? list : []) {
    if (!Array.isArray(x)) continue;
    const [id, n, at, cube] = x;
    if (typeof id === 'string' && typeof cube === 'string' && Number.isInteger(n) && n >= 0 && Number.isFinite(at))
      out.set(id, { n, at, cube });
  }
  return out;
}
