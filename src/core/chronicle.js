// The chronicle: the diary of this visit to the game (game/log.js keeps it, game/console.js shows
// it). Pure: no DOM, no game state, so it can be tested in node.
//
// An entry is plain data: { id, kind, data, who, at, time }
//   kind: what happened (KINDS); data: its details
//   who:  null when it happened to us, { slot, name } when to a friend (or they said it)
//   at:   Date.now() when it happened; time: seconds since the page opened
// The words are made only when an entry is shown (describe), so the same entry reads "You
// died" on our screen and "Anna died" on a friend's: playing together, some kinds are told to
// the others (NEWS, net/session.js `news`) and every chat line is (`chat`).
//
// Nothing of it is saved: a reload starts a new diary.
import { RARITY } from './gear/rarities.js';

// learn: memory.html#diary (see learn/README.md)
export const LOG_LIMIT = 200;   // entries kept; the oldest go first
export const MERGE_TIME = 6;    // s: kills this close together are one line

// What can happen. group: the console's filter it shows under (all of them show under "All")
// learn: memory.html#diary (see learn/README.md)
export const KINDS = {
  chat: { group: 'chat' },       // { text }: something someone said
  death: { group: 'events' },    // a death record (deathRecord)
  down: { group: 'events' },     // { cause, by }: lying downed, a friend can help (game/downed.js)
  up: { group: 'events' },       // { by }: helped up again
  level: { group: 'events' },    // { level }
  guardian: { group: 'events' }, // { label, level, depth }: a guardian defeated, its gate open
  depth: { group: 'events' },    // { depth, place }: the first time down there in this world
  loot: { group: 'events' },     // { name, rarity }: a rare (or better) weapon picked up
  kill: { group: 'events' },     // { count, xp }: enemies defeated (merged, MERGE_TIME)
  horde: { group: 'events' },    // {}: a horde woke up
  trade: { group: 'events' },    // { item, price }: bought something
  party: { group: 'events' },    // { text }: someone joined or left
  world: { group: 'events' },    // { seed, name? }: a new world began (name: a saved one, back in it)
  system: { group: 'system' },   // { text }: what the console says (help, mistakes)
  dev: { group: 'system' },      // { text, error? }: what a developer command did
};
// what a friend is told about (net/session.js `news`)
// learn: memory.html#diary (see learn/README.md)
export const NEWS = new Set(['death', 'down', 'up', 'level', 'guardian', 'depth', 'loot']);

export const createLog = () => ({ entries: [], next: 1, version: 0 });
export function clearLog(log) { log.entries.length = 0; log.version++; }

// Write an entry down; kills right after kills (ours, within MERGE_TIME) go onto the same line.
// Returns the entry (the merged one too).
// learn: memory.html#diary-code (see learn/README.md)
export function addEntry(log, kind, data = {}, { who = null, at = 0, time = 0 } = {}) {
  if (!Object.hasOwn(KINDS, kind)) throw new TypeError(`Unknown chronicle kind: ${kind}`);
  const last = log.entries.at(-1);
  if (kind === 'kill' && !who && last?.kind === 'kill' && !last.who && time - last.time <= MERGE_TIME) {
    last.data = { count: last.data.count + data.count, xp: last.data.xp + data.xp };
    last.time = time; last.at = at;
    log.version++;
    return last;
  }
  const entry = { id: log.next++, kind, data, who, at, time };
  log.entries.push(entry);
  if (log.entries.length > LOG_LIMIT) log.entries.splice(0, log.entries.length - LOG_LIMIT);
  log.version++;
  return entry;
}

// --- what a death says -----------------------------------------------------------------------

// A blow's reason ('Bitten by a Redback!') as part of a sentence ('bitten by a Redback')
export function phrase(reason) {
  const s = String(reason ?? '').trim().replace(/[!.]+$/, '');
  if (!s) return '';
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}
// the enemy behind a blow (game/enemycombat.js attacker): { label, level, guardian }
export function cleanBy(by) {
  if (!by || typeof by !== 'object' || typeof by.label !== 'string') return null;
  const level = Number.isInteger(by.level) && by.level > 0 && by.level < 1000 ? by.level : null;
  return { label: cleanText(by.label, 40), level, guardian: !!by.guardian };
}

// What the chronicle keeps about a death: what did it, where, with what, and when.
// hurt: the last blow ({ reason, by }, player.lastHurt); the rest about us and the place.
export function deathRecord(hurt, { depth = 0, place = '', cube = '', weapon = '', level = 1, session = 0 } = {}) {
  return { cause: phrase(hurt?.reason) || 'out of luck', by: cleanBy(hurt?.by), depth, place, cube, weapon, level,
    session: Math.max(0, Math.round(session)) };
}

// mm:ss (or h:mm:ss) of a number of seconds
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
const where = (depth, place) => depth > 0 ? `depth ${depth}, ${place}` : place || 'the surface';
const lv = by => by?.level ? ` (Lv ${by.level})` : '';

// The entry as words, from our point of view (who: null, "You") or a friend's ("Anna").
// learn: memory.html#diary-code (see learn/README.md)
export function describe({ kind, data: d = {}, who }) {
  const S = who ? who.name : 'You';
  switch (kind) {
    case 'chat': return `${S}: ${d.text}`;
    case 'death': return `${S} died: ${d.cause}${lv(d.by)} · ${where(d.depth, d.place)}`;
    case 'down': return who ? `${S} is down: ${d.cause}${lv(d.by)}. Stand next to them to help them up` : `You are down: ${d.cause}${lv(d.by)}`;
    case 'up': return who ? `${S} is back on their feet` : d.by ? `${d.by} helped you up` : 'You are back on your feet';
    case 'level': return `${S} reached level ${d.level}`;
    case 'guardian': return `${S} defeated the ${d.label}${lv(d)} on depth ${d.depth}: its gate is open`;
    case 'depth': return `${S} reached depth ${d.depth}: ${d.place}`;
    case 'loot': return `${S} found ${d.name}${RARITY[d.rarity] ? ` (${RARITY[d.rarity].name})` : ''}`;
    case 'kill': return `Defeated ${d.count} ${d.count === 1 ? 'enemy' : 'enemies'} · +${d.xp} XP`;
    case 'horde': return 'A horde woke up!';
    case 'trade': return `Bought ${d.item} for ${d.price}`;
    case 'world': return d.name ? `${d.name} · seed ${d.seed}` : `A new world · seed ${d.seed}`;
    default: return String(d.text ?? '');
  }
}
// the death record in full, line by line (the console shows it when the line is clicked)
export function details({ kind, data: d }) {
  if (kind !== 'death') return [];
  return [
    `Killed by: ${d.by ? `${d.by.label}${lv(d.by)}` : d.cause}`,
    `Where: ${where(d.depth, d.place)}${d.cube ? ` · cube ${d.cube}` : ''}`,
    ...d.weapon ? [`Weapon: ${d.weapon}`] : [],
    `Level: ${d.level}`,
    `After: ${clock(d.session)} of playing`,
  ];
}

// --- from the network ----------------------------------------------------------------------

// short plain text: no control characters, no surrounding space, at most max characters
export const cleanText = (s, max = 200) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi ? x : null;

// A friend's news (net/session.js `news`) as an entry's data we can show, or null: only the
// NEWS kinds, only the fields they have, of the right kinds and short.
export function cleanNews(kind, d) {
  if (!NEWS.has(kind) || !d || typeof d !== 'object') return null;
  const text = (x, max = 60) => typeof x === 'string' ? cleanText(x, max) : '';
  switch (kind) {
    case 'death': {
      const depth = int(d.depth, 0, 999), level = int(d.level, 1, 999);
      if (depth === null || level === null) return null;
      return { cause: text(d.cause) || 'out of luck', by: cleanBy(d.by), depth, place: text(d.place, 30), cube: text(d.cube, 30),
        weapon: text(d.weapon), level, session: int(d.session, 0, 1e7) ?? 0 };
    }
    case 'down': return { cause: text(d.cause) || 'knocked out', by: cleanBy(d.by) };
    case 'up': return { by: text(d.by, 16) || null };
    case 'level': { const level = int(d.level, 1, 999); return level === null ? null : { level }; }
    case 'guardian': {
      const depth = int(d.depth, 0, 999);
      return depth === null || !text(d.label) ? null : { label: text(d.label), level: int(d.level, 1, 999), depth };
    }
    case 'depth': { const depth = int(d.depth, 1, 999); return depth === null ? null : { depth, place: text(d.place, 30) }; }
    case 'loot': return text(d.name) && Object.hasOwn(RARITY, d.rarity) ? { name: text(d.name), rarity: d.rarity } : null;
  }
  return null;
}
