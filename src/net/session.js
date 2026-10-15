// Playing together, step one: two players in one world, seeing each other. The host opens a
// room (a four letter code), the guest joins it and plays in the host's world: the same seed
// makes the same cubes on both sides (world/), so the world itself never goes over the wire.
// Each game runs its own player (and, for now, its own enemies and loot) and tells the other
// about 20 times a second where it is and how its character is posed (protocol.js `me`); the
// other draws that as the partner (render/partner.js), a little in the past so it moves
// smoothly (sync.js Timeline).
//
// Both stay in the same cube: whoever goes somewhere takes the other along (sync.js
// shouldFollow). Following is a fade to the cube the partner is in, next to them.
//
// The guest keeps their character (level, bag, gear) when they join; the world's progress
// (opened gates, loot on the floor, chests) starts fresh, as with any new world. Only the host
// starts new worlds; the guest comes along.
import { player, state, setStatus } from '../game/state.js';
import { newWorld, enterCube, spawnAt } from '../game/flow.js';
import { STEP } from '../core/constants.js';
import { supportedPoint } from '../physics/respawn.js';
import { blockedAt } from '../physics/collide.js';
import { whenReady, fadeOut, fadeIn } from '../game/hud.js';
import { cancelSword } from '../game/sword.js';
import { cancelCast } from '../game/townportal.js';
import { clearMouseInput } from '../game/orders.js';
import { setInventoryOpen } from '../game/inventory.js';
import { lockPortalsHere } from '../game/portals.js';
import { equippedWeapon, readiedFlask } from '../core/combat.js';
import { floatText } from '../render/floattext.js';
import { capturePose, capturedLook, showPartner, removePartner } from '../render/partner.js';
import { openRoom, joinRoom } from './transport.js';
import { PROTOCOL, roomCode, cleanName, isMe } from './protocol.js';
import { Timeline, shouldFollow, nextTrip } from './sync.js';
import { online } from './online.js';

const SEND_EVERY = 50;   // ms between `me` messages
const PING_EVERY = 1000; // ms between pings (timers still run, slowly, in a background tab)
const LOST = 12000;      // ms without a word: the other side is gone
const FADE_MS = 380;
const BESIDE = 0.9;      // cells from the partner where following puts you

let room = null, link = null, myName = 'Friend', local = false;
let lastSend = 0, lastHeard = 0, ping = null;
const timeline = new Timeline();
// trips (sync.js shouldFollow): my count, the cube I was in last frame, the world it is in;
// following: a follow is under way; pendingSeed: a world the host asked for, started once we
// are not travelling; announced: the seed the guest was told about (host)
let trip = 0, lastKey = null, lastSeed = null, following = false, pendingSeed = null, announced = null;

// what the lobby shows (net/lobby.js): { phase, text }; phase: idle | opening | waiting |
// joining | connected
const listeners = new Set();
let status = { phase: 'idle', text: '' };
export const sessionStatus = () => status;
export function onSessionChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setPhase(phase, text = '') { status = { phase, text }; for (const fn of listeners) fn(status); }

// what the player needs to see: over the character (setStatus is the dev overlay)
function say(text) {
  setStatus(text);
  floatText(text, q => q.set(player.x, player.visY + 2.1, player.z), { color: '#cfe2ff', size: 0.2, life: 2.2, rise: 0.35 });
}

const reason = e => ({
  'unavailable-id': 'That room code is taken',
  'peer-unavailable': 'There is no game with that code',
  'browser-incompatible': 'This browser cannot play online',
  'timeout': 'No answer: check the code and the internet connection',
}[e?.type] ?? 'Could not connect');

// --- opening and joining -------------------------------------------------------------------

export async function hostGame({ name, local: viaTabs = false } = {}) {
  if (online.role) return;
  myName = cleanName(name); local = viaTabs;
  online.role = 'host';
  setPhase('opening', 'Opening a room...');
  for (let tries = 0; ; tries++) {
    const code = roomCode(crypto.getRandomValues ? cryptoRandom : Math.random);
    try {
      room = await openRoom(code, guestArrived, { local });
      if (online.role !== 'host') { room.close(); room = null; return; }   // left while opening
      online.code = code;
      setPhase('waiting', `Room ${code} is open. Waiting for a friend...`);
      return;
    } catch (e) {
      if (e.type === 'unavailable-id' && tries < 4) continue;
      console.warn('could not open a room', e);
      online.role = null;
      setPhase('idle', reason(e));
      return;
    }
  }
}
function cryptoRandom() { return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32; }

export async function joinGame(code, { name, local: viaTabs = false } = {}) {
  if (online.role) return;
  myName = cleanName(name); local = viaTabs;
  online.role = 'guest'; online.code = code;
  setPhase('joining', `Joining ${code}...`);
  try {
    const l = await joinRoom(code, { local });
    if (online.role !== 'guest') { l.close(); return; }   // left while joining
    attach(l);
    l.send({ t: 'hello', v: PROTOCOL, name: myName });
  } catch (e) {
    console.warn('could not join', e);
    online.role = null; online.code = null;
    setPhase('idle', reason(e));
  }
}

export function leaveGame() {
  link?.send({ t: 'bye' });
  const l = link;
  detach();
  l?.close();
  room?.close(); room = null;
  online.role = null; online.code = null;
  pendingSeed = null;
  setPhase('idle', '');
}

function guestArrived(l) {
  if (link) { l.send({ t: 'full' }); setTimeout(() => l.close(), 300); return; }
  attach(l);
}

function attach(l) {
  link = l;
  lastHeard = performance.now();
  timeline.clear();
  l.onmessage = receive;
  l.onclose = () => { if (link === l) lost(); };
  ping = setInterval(() => {
    link?.send({ t: 'ping' });
    if (link && performance.now() - lastHeard > LOST) { const old = link; lost(); old.close(); }
  }, PING_EVERY);
}

function detach() {
  if (link) { link.onmessage = null; link.onclose = null; }
  link = null;
  clearInterval(ping); ping = null;
  online.partner = null;
  timeline.clear();
  removePartner();
}

// the other side is gone (left, closed the tab, lost the connection)
function lost() {
  const name = online.partner?.name;
  detach();
  if (online.role === 'host' && room) setPhase('waiting', `${name ?? 'Your friend'} left. Room ${online.code} is still open.`);
  else { online.role = null; online.code = null; setPhase('idle', name ? `${name} left the game` : 'The connection was lost'); }
  if (name) say(`${name} left`);
}

// --- messages --------------------------------------------------------------------------------

function receive(m) {
  lastHeard = performance.now();
  if (!m || typeof m !== 'object') return;
  if (m.t === 'me') { if (online.partner && isMe(m)) timeline.push(m, performance.now()); return; }
  if (m.t === 'ping') return;
  if (m.t === 'bye') { const l = link; lost(); l?.close(); return; }
  if (online.role === 'host') {
    if (m.t !== 'hello' || online.partner) return;
    if (m.v !== PROTOCOL) { refuse(); return; }
    online.partner = { name: cleanName(m.name) };
    announced = state.cubes?.seed ?? null;
    link.send({ t: 'welcome', v: PROTOCOL, name: myName, seed: announced });
    setPhase('connected', `Playing with ${online.partner.name}`);
    say(`${online.partner.name} joined`);
    return;
  }
  // guest
  if (m.t === 'welcome' && !online.partner) {
    if (m.v !== PROTOCOL) { refuse(); return; }
    online.partner = { name: cleanName(m.name) };
    if (Number.isFinite(m.seed) && m.seed !== state.cubes?.seed) pendingSeed = m.seed;
    setPhase('connected', `Playing with ${online.partner.name}`);
    say(`Joined ${online.partner.name}'s world`);
  } else if (m.t === 'world' && online.partner && Number.isFinite(m.seed)) pendingSeed = m.seed;
  else if (m.t === 'full') { const l = link; detach(); l?.close(); online.role = null; online.code = null; setPhase('idle', 'That game has two players already'); }
  else if (m.t === 'version') { const l = link; detach(); l?.close(); online.role = null; online.code = null; setPhase('idle', 'Your friend has another version of the game: both reload the page'); }
}

function refuse() {
  link.send({ t: 'version', v: PROTOCOL });
  const l = link;
  detach(); l.close();
  if (online.role === 'host') setPhase('waiting', `A friend with another version of the game tried to join: both reload the page. Room ${online.code} is still open.`);
  else { online.role = null; online.code = null; setPhase('idle', 'Your friend has another version of the game: both reload the page'); }
}

// --- every frame -----------------------------------------------------------------------------

const busy = () => !state.map || state.transitioning || !!state.fallFrom || following;

function mine() { return { seed: state.cubes?.seed ?? null, cube: state.cubeKey, busy: busy(), trip }; }

// count my own trips; a new world starts the count again (the host's new world counts as a trip,
// so the guest follows into it)
function countTrips(theirs) {
  const seed = state.cubes?.seed ?? null;
  if (seed !== lastSeed) {
    lastSeed = seed; lastKey = state.cubeKey;
    trip = online.role === 'host' ? nextTrip(trip, theirs?.trip) : 0;
  } else if (state.cubeKey !== lastKey) {
    lastKey = state.cubeKey;
    trip = nextTrip(trip, theirs?.trip);
  }
}

function send(now) {
  const pose = capturePose();
  if (!pose || !state.cubes || !state.cubeKey) return;
  const weapon = (readiedFlask(player) ?? equippedWeapon(player))?.model ?? null;
  link.send({ t: 'me', ts: now, seed: state.cubes.seed, cube: state.cubeKey, busy: busy(), trip, pose,
    hp: player.hp, maxHp: player.maxHp, level: player.level, weapon, ...capturedLook() });
}

// a spot a step away from p on the same level, in a straight line from it (null: none)
function beside(p) {
  for (let i = 0; i < 8; i++) {
    const a = p.yaw + Math.PI * (0.5 + (i >> 1) * 0.25) * (i & 1 ? -1 : 1);   // to the sides first, then behind
    const x = p.x + Math.sin(a) * BESIDE, z = p.z + Math.cos(a) * BESIDE, s = supportedPoint(x, p.y, z);
    if (s && Math.abs(s.y - p.y) <= STEP && [0.33, 0.66].every(t => !blockedAt(p.x + (x - p.x) * t, p.z + (z - p.z) * t, p.y, STEP))) return s;
  }
  return null;
}

// fade over to the cube the partner is in, and stand next to them
function follow(them) {
  const cubes = state.cubes, key = them.cube, at = { x: them.pose.p[0], y: them.pose.p[1], z: them.pose.p[2] };
  following = true;
  if (state.inventoryOpen) setInventoryOpen(false);
  state.transitioning = true; state.portalCharge = null;
  cancelSword(true); cancelCast(); clearMouseInput();
  fadeOut();
  say(`Following ${online.partner?.name ?? 'your friend'}`);
  setTimeout(() => whenReady(cubes.get(key)).then(c => {
    following = false;
    if (state.cubes !== cubes) return;
    enterCube(c, null, null, at);
    const spot = beside({ x: player.x, y: player.y, z: player.z, yaw: them.pose.yaw });   // enterCube put us on (or near) their spot
    if (spot) { spawnAt(spot.x, spot.y, spot.z); player.yaw = Math.atan2(at.x - spot.x, at.z - spot.z); }
    lockPortalsHere();   // arriving on a portal does not take us straight on
    lastKey = state.cubeKey; trip = them.trip;
    state.transitioning = false;
  }, e => {
    console.error('could not follow', e);
    following = false;
    if (state.cubes !== cubes) return;
    state.transitioning = false; fadeIn();
  }), FADE_MS);
}

// main.js, every frame after the camera moved: send, follow, show the partner
export function updateOnline() {
  if (!link) return;
  const now = performance.now(), them = timeline.latest();
  // the host's world: start it once we are not on the way somewhere
  if (pendingSeed !== null && !busy()) {
    const seed = pendingSeed;
    pendingSeed = null;
    if (state.inventoryOpen) setInventoryOpen(false);
    newWorld(seed, { keepPlayer: true });
  }
  if (online.role === 'host' && online.partner && state.cubes && state.cubes.seed !== announced) {
    announced = state.cubes.seed;
    link.send({ t: 'world', seed: announced });
  }
  countTrips(them);
  if (online.partner && now - lastSend >= SEND_EVERY) { lastSend = now; send(now); }
  if (online.partner && shouldFollow(mine(), them, online.role)) follow(them);
  // the partner, if they are here (as they were DELAY ago)
  const span = online.partner && timeline.at(now), b = span?.b;
  const here = b && !b.busy && b.seed === state.cubes?.seed && b.cube === state.cubeKey && !state.transitioning;
  showPartner(here ? span : null, online.partner?.name);
}

addEventListener('pagehide', () => link?.send({ t: 'bye' }));
