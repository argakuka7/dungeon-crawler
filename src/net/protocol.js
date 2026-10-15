// What two games say to each other when playing together (src/net/session.js). Pure: no DOM,
// no game state, so it can be tested in node.
//
// Messages are plain JSON objects with a type `t`:
//   hello   { v, name }                guest -> host, first thing after connecting
//   welcome { v, name, seed }          host -> guest: play in this world
//   world   { seed }                   host -> guest: the host started a new world
//   me      { ts, seed, cube, busy, trip, pose, hp, maxHp, level, weapon, armed, worn }
//                                      both ways, about 20 times a second: where I am and how
//                                      I look (`ts`: the sender's clock, ms)
//   ping    {}                         both ways, every second, also from a background tab
//   full    {}                         host -> a second guest: this game has two players already
//   version { v }                      either way: the other side runs a different version
//   bye     {}                         either way: leaving

// raised whenever two versions of the game could no longer understand each other
export const PROTOCOL = 1;

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
    && Number.isFinite(m.trip) && isPose(m.pose) && Number.isFinite(m.hp) && Number.isFinite(m.maxHp);
}
