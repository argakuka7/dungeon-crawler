// What the games say to each other when playing together (src/net/session.js). Pure: no DOM,
// no game state, so it can be tested in node.
//
// Up to MAX_PLAYERS play together. Every player has a number (slot): the host 0, the guests
// 1, 2, 3 in the order they came. The guests are only connected to the host, which passes
// their messages on (a star): a guest's message goes to everyone else unless it says `to`
// (a slot or a list of slots), and the host stamps who it is `from` (only the types in
// RELAYED go on). Everything a guest hears has a `from` (0: the host itself).
//
// Messages are plain JSON objects with a type `t`:
//   hello   { v, name, pid }           guest -> host, first thing after connecting (pid: this
//                                      page's player; the same pid again is the friend getting
//                                      back in after a lost connection)
//   welcome { v, slot, players, seed, defeated, gates, visited, faces, loot, dropped, chests, quests }
//                                      host -> guest: you are player `slot`, with players
//                                      ([{ slot, name }], the host too); play in this world
//                                      (and what was defeated, opened and discovered in it so
//                                      far, the loot on its floors: [[cube, pickups]], the
//                                      sources that dropped, the chests open, the quest log)
//   joined  { slot, name }             host -> guests: someone came (or got back in)
//   left    { slot }                   host -> guests: someone went
//   visited { keys }                   to all: I discovered these cubes (yours too now)
//   faces   { keys }                   to all: the side faces open for me (open for you too)
//   world   { seed }                   host -> guests: the host started a new world
//   me      { ts, seed, cube, busy, pose, body, ground, swim, down, ko, hp, maxHp, level,
//             weapon, armed, worn, skin }  to all, about 20 times a second: where I am and how I
//                                      look (`ts`: the sender's clock, ms; skin: the id of the
//                                      painted skin I wear, or null; body: [x, y, z, vx,
//                                      vz], what enemies go after; ko: lying downed, [helped up
//                                      %, s left], game/downed.js). The host passes it on less
//                                      often to players in another cube (FAR_EVERY).
// A cube's enemies are run by the player there with the lowest number (net/foes.js): the
// runner. Those with it in the cube are shown them (viewers):
//   roster  { cube, seed, profiles, list }  runner -> viewer: the enemies in its cube
//   foes    { ts, cube, list }         runner -> viewers, about 15 times a second: where they are
//   want    {}                         viewer -> runner: send the roster again (we came, died)
//   handover { cube, list }            to the new runner: it came into our cube: our enemies
//                                      as they are ({ id, x, y, z, yaw, hp, mode }), its now
//   defeated { id, gate }              to all: I got the reward for enemy `id` (apart, it
//                                      stays defeated for you; gate: a guardian's, now open)
//   hit     { id, damage, crit, dx, dz, kb }  viewer -> runner: I hurt enemy `id`
//   afflict { id, status, spec }       viewer -> runner: I set it burning or poisoned
//   hurt    { blow, fx, fz, nx, nz }   runner -> viewer: an enemy's blow landed on you
//   shot    { n, id, spec, at }        runner -> viewers: enemy `id` threw projectile n
//   landed  { n, end }                 runner -> viewers: ... and it ended
// A painted skin (core/skin.js) is a PNG too big for one message: who sees a new `skin` id in a
// `me` asks its wearer for it, and gets it in pieces (SKIN_PIECE base64 characters each):
//   skinWant { id }                    to the wearer: send me skin `id`
//   skin    { id, n, of, data }        to who asked: piece n (0..of-1) of skin `id`'s PNG
//   arrow   { kind, stats, at, origin }  to those here: I shot (it only looks, net/session.js)
//   flask   { flask }                  to those here: I threw a flask (it only looks)
// What the players say, and what happened to them (game/console.js shows both in the chat box):
//   chat    { text }                   to all: something I typed (at most CHAT_MAX characters;
//                                      the host passes on at most CHAT_BURST in CHAT_WINDOW ms)
//   news    { kind, data }             to all: something that happened to me, for the others'
//                                      chronicle (core/chronicle.js NEWS: died, levelled up...)
// The floor loot is shared and the host decides (game/loot.js). A pickup: { id, itemId, count,
// gen?, x, y, z, from: [x, y, z], toss, kept? }; its id is `<source>#<i>`, the source the
// enemy, chest or bag drop it came from:
//   drop    { cube, source, list }     guest -> host: I dropped these (killed, opened, put down)
//   loot    { cube, source, list }     host -> guests: what source dropped (the first drop of it
//                                      stands; to a guest whose drop did not: what stands, or
//                                      null: nothing, it is not dead)
//   take    { cube, id }               guest -> host: may I have it?
//   took    { cube, id, by }           host -> guests: player `by` has it
//   forget  { cube, sources }          guest -> host: a death put my cube back, undo these drops
//   gone    { cube, sources }          host -> guests: these drops are undone
// The world's quests are shared and the host decides (game/quests.js, core/quests.js):
//   quests  { log }                    host -> guests: the quest log, whenever it changed
//   quest   { act, id?, ev? }          guest -> host: we did `act` with quest `id` (accept, archive,
//                                      unarchive, restart, handIn, meet), or event `ev` happened here
//                                      (visit, horde, landmark, found, rescued)
//   questReward { id, rewards, title }  host -> guests: quest `id` was handed in: take your reward
// and between a guest and the host only:
//   ping    {}                         both ways, every second, also from a background tab
//   full    {}                         host -> a guest too many: this game is full
//   version { v }                      either way: the other side runs a different version
//   bye     {}                         either way: leaving

// raised whenever two versions of the game could no longer understand each other
export const PROTOCOL = 10;

export const MAX_PLAYERS = 4;
// what the host passes on from one guest to the others
export const RELAYED = new Set(['me', 'visited', 'faces', 'defeated', 'roster', 'foes', 'want', 'handover',
  'hit', 'afflict', 'hurt', 'shot', 'landed', 'arrow', 'flask', 'drop', 'take', 'forget', 'chat', 'news', 'quest', 'skinWant', 'skin']);
// is a message addressed `to` (undefined: everyone) for player `slot`?
export const isFor = (to, slot) => to === undefined || to === slot || Array.isArray(to) && to.includes(slot);
// a valid `to` from a guest: a slot, a list of slots, or none (everyone)
export const validTo = to => to === undefined || Number.isInteger(to) || Array.isArray(to) && to.every(Number.isInteger);
// the free slot a new guest gets (null: full); `want`: the one it had before, if free
export function freeSlot(taken, want = null) {
  if (Number.isInteger(want) && want > 0 && want < MAX_PLAYERS && !taken.has(want)) return want;
  for (let s = 1; s < MAX_PLAYERS; s++) if (!taken.has(s)) return s;
  return null;
}
// who runs the enemies of a cube: the lowest player number there (the host, if it is there)
export const runnerOf = slots => Math.min(...slots);

// How often (ms) the games talk (net/session.js)
// learn: network.html#messages (see learn/README.md)
export const SEND_EVERY = 50;     // `me`: where I am and how I stand
export const FOES_EVERY = 66;     // `foes`: the runner's enemies
export const FAR_EVERY = 500;     // `me` from a player in another cube (the host passes on fewer)
// learn: network.html#broken (see learn/README.md)
export const PING_EVERY = 1000;   // `ping` (timers still run, slowly, in a background tab)
// learn: network.html#broken (see learn/README.md)
export const LOST = 12000;        // without a word this long, the other side is gone
export const REJOIN_EVERY = 3000, REJOIN_TRIES = 10;   // a guest that lost the connection tries to get back in

// Room codes: four letters, without I and O (they look like 1 and 0). Easy to read out loud.
// learn: network.html#code-code (see learn/README.md)
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// learn: network.html#code-code (see learn/README.md)
export const CODE_LENGTH = 4;

// learn: network.html#code-code (see learn/README.md)
export function roomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return code;
}

// what someone typed (lower case, spaces, a pasted link) as a code, or null
export function readCode(text) {
  const s = String(text ?? '').trim(), m = /[?&]join=([^&#]*)/.exec(s);
  const code = (m ? decodeURIComponent(m[1]) : s).toUpperCase().replace(/[^A-Z]/g, '');
  return code.length === CODE_LENGTH && [...code].every(c => CODE_LETTERS.includes(c)) ? code : null;
}

// the name a room goes by on the PeerJS broker (one namespace for everyone using it)
// learn: network.html#code-code (see learn/README.md)
export const peerId = code => `cube-crawler-${code}`;

// names are shown over the character: short, plain text
export const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Friend';

// Chat: a line is short plain text; a player who sends more than CHAT_BURST lines within
// CHAT_WINDOW ms has the rest dropped by the host (chatAllowed: times, when this player's
// last lines came, oldest first; it notes `now` when the line may go on)
export const CHAT_MAX = 160, CHAT_BURST = 5, CHAT_WINDOW = 5000;
export function chatAllowed(times, now) {
  while (times.length && now - times[0] >= CHAT_WINDOW) times.shift();
  if (times.length >= CHAT_BURST) return false;
  times.push(now);
  return true;
}

// --- painted skins (render/partner.js shows them) ---------------------------------------------

// A PeerJS JSON message must stay under 16300 bytes (vendor/peerjs chunkedMTU), so a skin goes
// in pieces, one every SKIN_EVERY ms per player asking, between the other messages. Larger
// PNGs than SKIN_BYTES are not sent: the others see the wearer's clay.
export const SKIN_PIECE = 12000, SKIN_EVERY = 30, SKIN_BYTES = 4 * 1024 * 1024;
export const SKIN_PIECES = Math.ceil(Math.ceil(SKIN_BYTES / 3) * 4 / SKIN_PIECE);
// a skin id as a `me` carries it (core/skin.js checkSkin), else null
export const skinIdOf = id => typeof id === 'string' && /^skin-[a-zA-Z0-9-]{1,80}$/.test(id) ? id : null;
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
// (throws on what is not base64)
export function fromBase64(text) {
  const s = atob(text), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
// base64 -> pieces
export function skinPieces(base64) {
  const pieces = [];
  for (let i = 0; i < base64.length; i += SKIN_PIECE) pieces.push(base64.slice(i, i + SKIN_PIECE));
  return pieces;
}
// a `skin` message we can use
export function isSkinPiece(m) {
  return m?.t === 'skin' && skinIdOf(m.id) !== null && Number.isInteger(m.of) && m.of > 0 && m.of <= SKIN_PIECES
    && Number.isInteger(m.n) && m.n >= 0 && m.n < m.of && typeof m.data === 'string' && m.data.length <= SKIN_PIECE
    && /^[A-Za-z0-9+/]*={0,2}$/.test(m.data);
}

// The character's bones (assets/character.glb), in the order a pose lists them.
export const BONES = ['root', 'hips', 'spine', 'head', 'upper_arm.L', 'forearm.L', 'hand.L',
  'upper_arm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'thigh.R', 'shin.R'];

// A pose: where the figure stands (p, yaw), where its hips are in it (hips) and how every bone
// is turned (q: BONES.length quaternions as x, y, z, w, times Q). Whole numbers keep it short.
// learn: network.html#send-code (see learn/README.md)
export const Q = 10000;
const r3 = x => Math.round(x * 1000) / 1000;
// learn: network.html#send-code (see learn/README.md)
export function packPose(position, yaw, hips, quats) {
  return { p: position.map(r3), yaw: r3(yaw), hips: hips.map(r3), q: quats.map(x => Math.round(x * Q)) };
}

// a well-formed pose (it came over the network)
export function isPose(pose) {
  const nums = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
  return !!pose && nums(pose.p, 3) && Number.isFinite(pose.yaw) && nums(pose.hips, 3) && nums(pose.q, BONES.length * 4);
}

// a `me` message we can use: the fields the game reads, of the right kinds
export function isMe(m) {
  return m?.t === 'me' && Number.isFinite(m.ts) && Number.isFinite(m.seed) && typeof m.cube === 'string'
    && isPose(m.pose) && Number.isFinite(m.hp) && Number.isFinite(m.maxHp)
    && Array.isArray(m.body) && m.body.length === 5 && m.body.every(Number.isFinite);
}

// --- the enemies (net/foes.js) --------------------------------------------------------------------

// (new modes go at the end: an older game reads one it does not know as idle)
// ('gone' and 'split': a boss away, or splitting, game/gusto.js)
export const MODES = ['idle', 'walk', 'home', 'alert', 'chase', 'attack', 'search', 'defend', 'dead', 'hide', 'gone', 'split'];
export const BURNING = 1, TOXIC = 2;
const r2 = x => Math.round(x * 100) / 100;

// What the guest needs to know about each enemy in this cube. Profiles (core/enemies.js, plain
// data) are listed once and referred to by index: a pack shares one.
export function rosterOf(list, cube, seed) {
  const profiles = [], seen = new Map();
  const entries = list.map(e => {
    const key = JSON.stringify(e.profile);
    if (!seen.has(key)) { seen.set(key, profiles.length); profiles.push(e.profile); }
    return { id: e.id, p: seen.get(key), level: e.level, coinDrop: e.coinDrop,
      kind: e.kind && { xp: e.kind.xp, dropXP: e.kind.dropXP, dropScale: e.kind.dropScale, drops: e.kind.drops },
      guardian: e.guardian, guardianRole: e.guardianRole, bossPlaceholder: e.bossPlaceholder, guardianGate: e.guardianGate,
      boss: e.boss, proxy: e.proxy, summoned: e.summoned, noReward: e.noReward,
      hordeId: e.hordeId, x: r3(e.x), y: r3(e.y), z: r3(e.z), yaw: r3(e.yaw), hp: e.hp, mode: e.mode };
  });
  return { t: 'roster', cube, seed, profiles, list: entries };
}

// one row per enemy: [index, x, y, z, yaw, mode, t, attacks, attack, speed, hp, statuses, beam,
// by] (t: how far into its attack, or how long dead; beam: [t, ex, ey, ez] while its laser
// shines; by: the number of the player who hit it last, `runner` when nobody else did)
export function rowOf(e, i, runner = 0) {
  const b = e.beam;
  return [i, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), Math.max(0, MODES.indexOf(e.mode)), r2(e.mode === 'dead' ? e.deadT : e.t),
    e.attacks, e.attack, r2(e.speed), e.hp, (e.burning ? BURNING : 0) | (e.toxic ? TOXIC : 0),
    b ? [r2(b.t), r2(b.ex), r2(b.ey), r2(b.ez)] : 0, e.lastHit ?? runner];
}

