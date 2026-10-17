// Which song plays and in which mood (audio/music.js plays it; music/README.md has the moods):
// the town's waltz in the town and the merchant camp, the core's theme at the bottom of the
// world, and everywhere else the song of the depth's theme (themes/: music).
//   explore   nothing going on
//   treasure  a reward site's closed chest close by, no enemy around
//   sense     a live enemy close by, not after you yet
//   rise      an enemy chasing you from afar
//   fight     an enemy after you is close, or blows were traded (you hit one, one hit you or
//             swung at you) in the last few seconds and one is still after you or near
//   boss      a guardian is after you, or hurt and close by
// The mood rises at once and falls back after the calmer reason has held for a moment.
import { player, state } from './state.js';
import { allEnemies } from './enemies.js';
import { themeOf, MAX_DEPTH } from '../themes/depth.js';
import { playSong, setMood } from '../audio/music.js';
import { MOODS } from '../audio/score.js';

// learn: sound.html#mood-rules (see learn/README.md)
const NEAR = 8;          // cells: an enemy this close is sensed
// learn: sound.html#mood-rules (see learn/README.md)
const CLOSE = 4;         // cells: an enemy after you this close is a fight
// learn: sound.html#mood-rules (see learn/README.md)
const TREASURE = 6;      // cells: a chest this close
// learn: sound.html#mood-rules (see learn/README.md)
const FIGHT_MEMORY = 6;  // s: a blow keeps the fight going this long while an enemy is after you or near
// learn: sound.html#mood-code #mood-rules (see learn/README.md)
const HOLD = { treasure: 1, sense: 2, rise: 3, fight: 4, boss: 5 };   // s the calmer reason must hold
const RANK = Object.fromEntries(MOODS.map((m, i) => [m, i]));      // MOODS runs calm to fierce

// learn: code.html#names (see learn/README.md)
let mood = 'explore', calm = 0, lastClash = -Infinity;
let playerHp = 0;
const enemyHp = new WeakMap();   // enemy -> hp last frame: a drop means you hit it
let forced = null;       // dev/console: hold one mood (window.__game.musicMood)

export function forceMood(name) { forced = MOODS.includes(name) ? name : null; }

function wanted() {
  if (player.hp < playerHp) lastClash = state.time;
  playerHp = player.hp;
  if (player.hp <= 0) return 'explore';
  let want = 'explore';
  const raise = m => { if (RANK[m] > RANK[want]) want = m; };
  let around = false;
  for (const e of allEnemies()) {
    const hit = e.hp < (enemyHp.get(e) ?? e.hp);
    enemyHp.set(e, e.hp);
    if (hit || e.mode === 'attack') lastClash = state.time;
    if (e.mode === 'dead' || e.hp <= 0) continue;
    const dist = Math.hypot(e.x - player.x, e.z - player.z), level = Math.abs(e.y - player.y) < 3;
    const after = e.mode === 'chase' || e.mode === 'attack';
    if (e.guardian && (after || hit || (e.hp < e.profile.hp && dist < NEAR * 1.5))) raise('boss');
    if (after && dist < CLOSE && level) raise('fight');
    if (after) raise('rise');
    else if (dist < NEAR && level) raise('sense');
    if (after || (dist < NEAR && level)) around = true;
  }
  if (around && state.time - lastClash < FIGHT_MEMORY) raise('fight');
  if (want === 'explore') for (const site of state.map.rewardSites ?? []) {
    if (state.run.chests.has(site.id)) continue;   // an opened chest no longer calls
    const a = site.anchor;
    if (Math.hypot(a.x - player.x, a.z - player.z) < TREASURE && Math.abs(a.y - player.y) < 3) { want = 'treasure'; break; }
  }
  return want;
}

// learn: sound.html#mood-code (see learn/README.md)
export const songFor = map => map.enemyFree ? 'town' : map.depth >= MAX_DEPTH ? 'core' : themeOf(map).music;

// learn: sound.html#mood-code (see learn/README.md)
export function updateMusic(dt) {
  if (!state.map) return;
  playSong(songFor(state.map));
  const want = forced ?? wanted();
  if (forced || RANK[want] >= RANK[mood]) { mood = want; calm = 0; }
  else if ((calm += dt) > HOLD[mood]) { mood = want; calm = 0; }
  setMood(mood);
}
