// What two games say to each other when playing together (src/net/session.js). Pure: no DOM,
// no game state, so it can be tested in node.
//
// Messages are plain JSON objects with a type `t`:
//   hello   { v, name }                guest -> host, first thing after connecting
//   welcome { v, name, seed }          host -> guest: play in this world
//   world   { seed }                   host -> guest: the host started a new world
//   me      { ts, seed, cube, busy, trip, pose, body, ground, swim, down, hp, maxHp, level,
//             weapon, armed, worn }    both ways, about 20 times a second: where I am and how
//                                      I look (`ts`: the sender's clock, ms; body: [x, y, z, vx,
//                                      vz], what the host's enemies go after)
//   roster  { cube, seed, profiles, list }  host -> guest: the enemies in its cube (net/foes.js)
//   foes    { ts, cube, list }         host -> guest, about 15 times a second: where they are
//   want    {}                         guest -> host: send the roster again (we came into a cube)
//   hit     { id, damage, crit, dx, dz, kb }  guest -> host: I hurt enemy `id`
//   afflict { id, status, spec }       guest -> host: I set it burning or poisoned
//   hurt    { blow, fx, fz, nx, nz }   host -> guest: an enemy's blow landed on you
//   shot    { n, id, spec, at }        host -> guest: enemy `id` threw projectile n
//   landed  { n, end }                 host -> guest: ... and it ended
//   arrow   { kind, stats, at, from }  either way: I shot (it only looks, net/session.js)
//   flask   { flask }                  either way: I threw a flask (it only looks)
//   ping    {}                         both ways, every second, also from a background tab
//   full    {}                         host -> a second guest: this game has two players already
//   version { v }                      either way: the other side runs a different version
//   bye     {}                         either way: leaving

// raised whenever two versions of the game could no longer understand each other
export const PROTOCOL = 2;

// Room codes: four letters, without I and O (they look like 1 and 0). Easy to read out loud.
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

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
export const peerId = code => `cube-crawler-${code}`;

// names are shown over the character: short, plain text
export const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Friend';

// The character's bones (assets/character.glb), in the order a pose lists them.
export const BONES = ['root', 'hips', 'spine', 'head', 'upper_arm.L', 'forearm.L', 'hand.L',
  'upper_arm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'thigh.R', 'shin.R'];

// A pose: where the figure stands (p, yaw), where its hips are in it (hips) and how every bone
// is turned (q: BONES.length quaternions as x, y, z, w, times Q). Whole numbers keep it short.
export const Q = 10000;
const r3 = x => Math.round(x * 1000) / 1000;
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
    && Number.isFinite(m.trip) && isPose(m.pose) && Number.isFinite(m.hp) && Number.isFinite(m.maxHp)
    && Array.isArray(m.body) && m.body.length === 5 && m.body.every(Number.isFinite);
}

// --- the enemies (net/foes.js) --------------------------------------------------------------------

export const MODES = ['idle', 'walk', 'home', 'alert', 'chase', 'attack', 'search', 'defend', 'dead'];
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
      kind: e.kind && { xp: e.kind.xp, dropXP: e.kind.dropXP, dropScale: e.kind.dropScale },
      guardian: e.guardian, guardianRole: e.guardianRole, bossPlaceholder: e.bossPlaceholder, guardianGate: e.guardianGate,
      hordeId: e.hordeId, x: r3(e.x), y: r3(e.y), z: r3(e.z), yaw: r3(e.yaw), hp: e.hp, mode: e.mode };
  });
  return { t: 'roster', cube, seed, profiles, list: entries };
}

// one row per enemy: [index, x, y, z, yaw, mode, t, attacks, attack, speed, hp, statuses, beam]
// (t: how far into its attack, or how long dead; beam: [t, ex, ey, ez] while its laser shines)
export function rowOf(e, i) {
  const b = e.beam;
  return [i, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), Math.max(0, MODES.indexOf(e.mode)), r2(e.mode === 'dead' ? e.deadT : e.t),
    e.attacks, e.attack, r2(e.speed), e.hp, (e.burning ? BURNING : 0) | (e.toxic ? TOXIC : 0),
    b ? [r2(b.t), r2(b.ex), r2(b.ey), r2(b.ez)] : 0];
}

