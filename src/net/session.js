// Playing together: two players in one world, seeing each other and fighting together. The host opens a
// room (a four letter code), the guest joins it and plays in the host's world: the same seed
// makes the same cubes on both sides (world/), so the world itself never goes over the wire.
// Each game runs its own player and tells the other about 20 times a second where it is and
// how its character is posed (protocol.js `me`); the other draws that as the partner
// (render/partner.js), a little in the past so it moves smoothly (sync.js Timeline).
//
// Each explores where they like. A cube's enemies are run by one of the two (net/foes.js):
// by the host while it is there (they go after either player; the guest is shown them and
// fights them, blows on the guest are sent over as `hurt`), else by whoever is there. When the
// two meet or part, the enemies change hands as they are (`handover`, game/enemies.js
// adoptEnemies). In a cube together every kill gives both players XP and loot of their own (the
// loot never goes over the wire); apart, a kill only tells the other the enemy is gone
// (`defeated`). F fades you over to your friend (goToFriend).
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
import { capturePose, capturedLook, showPartner, showHelp, removePartner } from '../render/partner.js';
import { openRoom, joinRoom } from './transport.js';
import { PROTOCOL, roomCode, cleanName, isMe } from './protocol.js';
import { Timeline } from './sync.js';
import { online, relay } from './online.js';
import { Host, Guest, canBeHit } from './foes.js';
import { setOthers } from '../game/party.js';
import { allEnemies, adoptEnemies, shareDefeat } from '../game/enemies.js';
import { drawMinimap } from '../game/minimap.js';
import { hitEnemy } from '../game/sword.js';
import { afflictEnemy } from '../game/statuses.js';
import { hitPlayer } from '../game/enemycombat.js';
import { mirrorProjectile, endMirrored } from '../game/projectiles.js';
import { ghostShot } from '../game/shots.js';
import { ghostFlask } from '../game/throws.js';
import { damageEnemy } from '../core/combat.js';
import { CHAR_R, CHAR_H } from '../core/constants.js';
import { groundAt } from '../physics/collide.js';
import { downInfo } from '../game/downed.js';

const SEND_EVERY = 50;   // ms between `me` messages
const PING_EVERY = 1000; // ms between pings (timers still run, slowly, in a background tab)
const LOST = 12000;      // ms without a word: the other side is gone
const REJOIN_EVERY = 3000, REJOIN_TRIES = 10;   // the guest tries to get back in after losing the connection
const FADE_MS = 380;
const BESIDE = 0.9;      // cells from the partner where going to them puts you
const SETTLED = 1000;    // ms in a cube: then a friend coming in is the one who arrived (handover)
const MAP_EVERY = 500;   // ms between redraws of the minimap's dot for the friend
const FOES_EVERY = 66;   // ms between the host's enemy messages (net/foes.js)
const AFFLICT_EVERY = 500;   // ms: the guest tells the host about a status at most this often

let room = null, link = null, myName = 'Friend', local = false, rejoin = null;
// this page's player: getting back in after a lost connection, the host knows it is still us
const pid = Math.random().toString(36).slice(2, 12);
let lastSend = 0, lastHeard = 0, ping = null;
const timeline = new Timeline();
// lastKey / cubeSince: the cube we are in and since when; following: a fade to the friend is
// under way; pendingSeed: a world the host asked for, started once we are not travelling;
// announced: the seed the guest was told about (host); mapAt / mapCube: the minimap's friend dot
let lastKey = null, cubeSince = 0, following = false, pendingSeed = null, pendingRun = null, announced = null, mapAt = 0, mapCube = null;
// the enemies (net/foes.js): host or guest side, while together
let foes = null, lastFoes = 0;
// the host's stand-in for the guest, for its enemies to go after (game/party.js)
const friend = { remote: true, here: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: CHAR_R, h: CHAR_H,
  hp: 1, maxHp: 1, ragdoll: false, grounded: true, swimming: false, support: null, stun: 0,
  hurt(blow, fx, fz, nx, nz) { link?.send({ t: 'hurt', blow, fx, fz, nx, nz }); } };

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

// resolves true once connected (the host still has to welcome us)
export async function joinGame(code, { name, local: viaTabs = false } = {}) {
  if (online.role) return false;
  myName = cleanName(name); local = viaTabs;
  online.role = 'guest'; online.code = code;
  if (!rejoin) setPhase('joining', `Joining ${code}...`);
  try {
    const l = await joinRoom(code, { local });
    if (online.role !== 'guest') { l.close(); return false; }   // left while joining
    attach(l);
    l.send({ t: 'hello', v: PROTOCOL, name: myName, pid });
    return true;
  } catch (e) {
    console.warn('could not join', e);
    online.role = null; online.code = null;
    if (!rejoin) setPhase('idle', reason(e));
    return false;
  }
}

// the guest lost the connection (not a goodbye): try to get back in a few times
function retry() {
  if (!rejoin) return;
  if (rejoin.tries++ >= REJOIN_TRIES) { rejoin = null; setPhase('idle', 'The connection was lost'); return; }
  setPhase('joining', `Connection lost. Trying again (${rejoin.tries}/${REJOIN_TRIES})...`);
  const r = rejoin;
  joinGame(r.code, { name: myName, local }).then(ok => { if (!ok && rejoin === r) r.timer = setTimeout(retry, REJOIN_EVERY); });
}

export function leaveGame() {
  if (rejoin) { clearTimeout(rejoin.timer); rejoin = null; }
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
  if (!link) { attach(l); return; }
  // the friend we have, getting back in over a new connection (the old one broke): swap it
  l.onmessage = m => {
    if (m?.t === 'hello' && m.pid && m.pid === online.partner?.pid) {
      const old = link;
      detach(); old.close();
      attach(l); receive(m);
    } else { l.send({ t: 'full' }); setTimeout(() => l.close(), 300); }
  };
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
  if (foes instanceof Guest) foes.stop(foes.cube === state.cubeKey);   // the host's enemies here are ours now
  foes = null;
  relay.hit = relay.afflict = relay.launch = relay.landed = relay.shoot = relay.toss = relay.defeated = null;
  friend.here = false; setOthers([]);
  clearInterval(ping); ping = null;
  online.partner = null; online.buddy = null;
  timeline.clear();
  removePartner();
}

// the other side is gone: it said goodbye (bye), or the connection broke (the guest then tries
// to get back in)
function lost(bye = false) {
  const name = online.partner?.name, code = online.code, guest = online.role === 'guest' && !!name;
  detach();
  if (online.role === 'host' && room) setPhase('waiting', `${name ?? 'Your friend'} left. Room ${online.code} is still open.`);
  else {
    online.role = null; online.code = null;
    if (guest && !bye) { rejoin = { code, tries: 0, timer: setTimeout(retry, 500) }; setPhase('joining', 'Connection lost. Trying again...'); }
    else setPhase('idle', name ? `${name} left the game` : 'The connection was lost');
  }
  if (name) say(bye || !guest ? `${name} left` : 'Connection lost');
}

// --- messages --------------------------------------------------------------------------------

function receive(m) {
  lastHeard = performance.now();
  if (!m || typeof m !== 'object') return;
  if (m.t === 'me') { if (online.partner && isMe(m)) timeline.push(m, performance.now()); return; }
  if (m.t === 'ping') return;
  if (m.t === 'bye') { const l = link; lost(true); l?.close(); return; }
  if (online.role === 'host') {
    if (foes) { hostReceive(m); return; }
    if (m.t !== 'hello' || online.partner) return;
    if (m.v !== PROTOCOL) { refuse(); return; }
    online.partner = { name: cleanName(m.name), pid: typeof m.pid === 'string' ? m.pid : null };
    announced = state.cubes?.seed ?? null;
    link.send({ t: 'welcome', v: PROTOCOL, name: myName, seed: announced,
      defeated: [...state.run.defeated], gates: [...state.run.unlockedGates] });
    startHost();
    setPhase('connected', `Playing with ${online.partner.name}`);
    say(`${online.partner.name} joined`);
    return;
  }
  // guest
  if (m.t === 'welcome' && !online.partner) {
    if (m.v !== PROTOCOL) { refuse(); return; }
    online.partner = { name: cleanName(m.name) };
    if (rejoin) { clearTimeout(rejoin.timer); rejoin = null; }
    // the host's world, and its progress so far: what it defeated stays defeated for us too
    const run = { defeated: Array.isArray(m.defeated) ? m.defeated : [], gates: Array.isArray(m.gates) ? m.gates : [] };
    if (Number.isFinite(m.seed) && m.seed !== state.cubes?.seed) { pendingSeed = m.seed; pendingRun = run; }
    else takeRun(run);
    startGuest();
    setPhase('connected', `Playing with ${online.partner.name}`);
    say(`Joined ${online.partner.name}'s world`);
  } else if (foes && guestReceive(m)) return;
  else if (m.t === 'world' && online.partner && Number.isFinite(m.seed)) pendingSeed = m.seed;
  else if (m.t === 'full') { const l = link; detach(); l?.close(); online.role = null; online.code = null; setPhase('idle', 'That game has two players already'); }
  else if (m.t === 'version') { const l = link; detach(); l?.close(); online.role = null; online.code = null; setPhase('idle', 'Your friend has another version of the game: both reload the page'); }
}

// --- fighting together (net/foes.js) ------------------------------------------------------------

// Our arrows, bolts, spells and flasks fly on the friend's side too (they only look; the hits
// are ours: game/shots.js, game/throws.js)
function shareShots() {
  const r = x => Math.round(x * 1000) / 1000;
  relay.defeated = e => link?.send({ t: 'defeated', id: e.id, gate: e.guardian && e.guardianGate || null });
  relay.shoot = shot => {
    if (!partnerHere()) return;
    const { kind, range, pierce, burst, color } = shot.stats;
    link?.send({ t: 'arrow', kind: shot.kind, stats: { kind, range, pierce, burst, color },
      at: [shot.x, shot.y, shot.z, shot.vx, shot.vy, shot.vz].map(r), from: shot.from.map(r) });
  };
  relay.toss = f => {
    if (!partnerHere()) return;
    const { view, ...flask } = f;
    link?.send({ t: 'flask', flask });
  };
}
function shotReceive(m) {
  if (m.t === 'defeated' && typeof m.id === 'string') { shareDefeat(m.id, typeof m.gate === 'string' ? m.gate : null); return true; }
  if (m.t === 'arrow' && ['arrow', 'bolt', 'spell'].includes(m.kind) && Array.isArray(m.at) && m.at.length === 6 && finite(...m.at)
      && Array.isArray(m.from) && m.from.length === 3 && finite(...m.from) && m.stats && finite(m.stats.range)) {
    if (!partnerHere()) return true;
    const [x, y, z, vx, vy, vz] = m.at;
    ghostShot({ kind: m.kind, stats: m.stats, x, y, z, vx, vy, vz, from: m.from });
  } else if (m.t === 'flask' && m.flask?.stats && finite(m.flask.x, m.flask.y, m.flask.z, m.flask.vx, m.flask.vy, m.flask.vz, m.flask.T)) {
    if (partnerHere()) ghostFlask({ ...m.flask, t: 0, spin: 0 });
  } else return false;
  return true;
}
// is the friend in our cube (the host: as its stand-in says; the guest: as the host's last word)?
const partnerHere = () => foes instanceof Host ? friend.here : hostHere();

function startHost() {
  foes = new Host();
  shareShots();
  relay.launch = (pr, e) => { if (friend.here) link?.send({ t: 'shot', n: pr.n, id: e.id, spec: pr.spec, at: [pr.x, pr.y, pr.z, pr.vx, pr.vy, pr.vz] }); };
  relay.landed = (pr, end) => { if (friend.here) link?.send({ t: 'landed', n: pr.n, end }); };
}
const enemy = id => allEnemies().find(e => e.id === id && e.mode !== 'dead');
const validState = s => s && typeof s.id === 'string' && [s.x, s.y, s.z, s.yaw, s.hp].every(Number.isFinite);
// an enemy as it is now, for the other side to take over (game/enemies.js adoptEnemies)
const stateOf = e => ({ id: e.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: e.hp, mode: e.mode });
const finite = (...xs) => xs.every(Number.isFinite);
function hostReceive(m) {
  if (shotReceive(m)) return;
  if (m.t === 'want') { foes.forget(); return; }
  // the guest ran this cube's enemies until we came in: take them over as they are
  if (m.t === 'handover' && m.cube === state.cubeKey && Array.isArray(m.list)) { adoptEnemies(m.list.filter(validState)); foes.forget(); return; }
  if (!friend.here) return;
  if (m.t === 'hit' && finite(m.damage, m.dx, m.dz, m.kb) && m.damage > 0) {
    const e = enemy(m.id);
    if (!e) return;
    const before = e.hp;
    if (damageEnemy(e, m.damage)) hitEnemy(e, { damage: before - e.hp, crit: !!m.crit }, before, m.dx, m.dz, m.kb, friend);
  } else if (m.t === 'afflict' && (m.status === 'burning' || m.status === 'toxic') && m.spec && typeof m.spec === 'object') {
    const e = enemy(m.id);
    if (e && afflictEnemy(e, m.status, m.spec)) e.target = friend;
  }
}

function startGuest() {
  const g = foes = new Guest(() => link?.send({ t: 'want' }));
  const told = new Map();   // enemy and status -> when the host was last told
  relay.hit = (e, damage, crit, dx, dz, kb) => {
    g.predicted(e);
    link?.send({ t: 'hit', id: e.id, damage, crit, dx, dz, kb });
  };
  relay.afflict = (e, status, spec) => {
    const key = e.id + status, now = performance.now();
    if (now - (told.get(key) ?? -Infinity) < AFFLICT_EVERY) return;
    told.set(key, now);
    link?.send({ t: 'afflict', id: e.id, status, spec });
  };
  shareShots();
}   // (it is shown the host's enemies while the host is in its cube: updateOnline)
function guestReceive(m) {
  if (shotReceive(m)) return true;
  if (m.t === 'roster' && Array.isArray(m.list) && Array.isArray(m.profiles)) foes.roster(m);
  else if (m.t === 'foes') foes.foes(m, performance.now());
  else if (m.t === 'hurt') {
    const b = m.blow;
    if (b && typeof b === 'object' && finite(b.damage, b.knock ?? 0, m.fx, m.fz, m.nx, m.nz) && canBeHit() && hostHere())
      hitPlayer(b, m.fx, m.fz, m.nx, m.nz);
  } else if (m.t === 'shot' && Array.isArray(m.at) && m.at.length === 6 && finite(...m.at) && m.spec?.speed > 0 && hostHere())
    mirrorProjectile(m.n, foes.find(m.id), m.spec, ...m.at);
  else if (m.t === 'landed') endMirrored(m.n, ['hit', 'blocked', 'spent'].includes(m.end) ? m.end : 'spent');
  else return false;
  return true;
}
// is the host in our cube (as of its last word)?
function hostHere() {
  const h = timeline.latest();
  return !!h && h.seed === state.cubes?.seed && h.cube === state.cubeKey && !h.busy;
}

// the host's stand-in for the guest follows the guest's latest word: enemies go after it while
// the guest is in this cube
function updateFriend() {
  const m = timeline.latest();
  friend.here = !!m && !m.busy && m.seed === state.cubes?.seed && m.cube === state.cubeKey && !state.transitioning;
  if (friend.here) {
    const [x, y, z, vx, vz] = m.body;
    Object.assign(friend, { x, y, z, vx, vz, hp: m.hp, maxHp: m.maxHp, ragdoll: !!m.down || m.hp <= 0,
      grounded: !!m.ground, swimming: !!m.swim });
    friend.support = friend.grounded ? groundAt(x, z, y + 0.05, 0).s : null;
  }
  setOthers(friend.here ? [friend] : []);
}

// the host's progress in its world (welcome): its kills and opened gates are ours too
function takeRun(run) {
  for (const id of run.defeated) if (typeof id === 'string') state.run.defeated.add(id);
  for (const k of run.gates) if (typeof k === 'string') state.run.unlockedGates.add(k);
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

function send(now) {
  const pose = capturePose();
  if (!pose || !state.cubes || !state.cubeKey) return;
  const weapon = (readiedFlask(player) ?? equippedWeapon(player))?.model ?? null;
  const p = player, r = x => Math.round(x * 1000) / 1000;
  link.send({ t: 'me', ts: now, seed: state.cubes.seed, cube: state.cubeKey, busy: busy(), pose,
    body: [p.x, p.y, p.z, p.vx, p.vz].map(r), ground: p.grounded ? 1 : 0, swim: p.swimming ? 1 : 0, down: p.ragdoll ? 1 : 0,
    ko: downInfo(), hp: p.hp, maxHp: p.maxHp, level: p.level, weapon, ...capturedLook() });
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

// F: fade over to the cube the friend is in, and stand next to them
export function goToFriend() {
  const them = timeline.latest();
  if (!online.partner || !them) return;
  if (busy() || player.down || player.ragdoll || them.busy || them.seed !== state.cubes?.seed) { say('Not now'); return; }
  follow(them);
}
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
    state.transitioning = false;
  }, e => {
    console.error('could not follow', e);
    following = false;
    if (state.cubes !== cubes) return;
    state.transitioning = false; fadeIn();
  }), FADE_MS);
}

// main.js, every frame after the camera moved: send, hand enemies over, show the partner
export function updateOnline() {
  if (!link) return;
  const now = performance.now(), them = timeline.latest();
  // the host's world: start it once we are not on the way somewhere
  if (pendingSeed !== null && !busy()) {
    const seed = pendingSeed;
    pendingSeed = null;
    if (state.inventoryOpen) setInventoryOpen(false);
    newWorld(seed, { keepPlayer: true });   // (it starts the fresh run at once, the cube comes later)
    if (pendingRun) { takeRun(pendingRun); pendingRun = null; }
  }
  if (online.role === 'host' && online.partner && state.cubes && state.cubes.seed !== announced) {
    announced = state.cubes.seed;
    link.send({ t: 'world', seed: announced });
  }
  if (state.cubeKey !== lastKey) { lastKey = state.cubeKey; cubeSince = now; }
  // the friend as of their last word, for the rest of the game (net/online.js buddy)
  online.buddy = online.partner && them && them.seed === state.cubes?.seed ? { cube: them.cube,
    here: them.cube === state.cubeKey && !them.busy && !state.transitioning,
    x: them.body[0], y: them.body[1], z: them.body[2], hp: them.hp, out: !!them.ko } : null;
  // the friend on the minimap: when they change cubes, and now and then as they move
  if (online.buddy?.cube !== mapCube || (online.buddy && now - mapAt > MAP_EVERY)) {
    mapCube = online.buddy?.cube ?? null; mapAt = now;
    if (state.cubes) drawMinimap();
  }
  // The guest is shown the host's enemies while the host is here. When the host came in to us
  // (we were here first), ours go over to it as they are; when it leaves us here, its go on
  // here as we were shown them (net/foes.js).
  if (foes instanceof Guest && foes.active !== hostHere()) {
    if (!foes.active) {
      if (now - cubeSince > SETTLED) link.send({ t: 'handover', cube: state.cubeKey, list: allEnemies().filter(e => e.id && e.mode !== 'dead').map(stateOf) });
      foes.start();
    } else foes.stop(foes.cube === state.cubeKey);
  }
  if (online.partner && now - lastSend >= SEND_EVERY) { lastSend = now; send(now); }
  if (foes instanceof Host) {
    updateFriend();
    if (state.cubes && them?.seed === state.cubes.seed && now - lastFoes >= FOES_EVERY) {
      lastFoes = now;
      for (const msg of foes.messages(now)) link.send(msg);
    }
  }
  // the partner, if they are here (as they were DELAY ago)
  const span = online.partner && timeline.at(now), b = span?.b;
  const here = b && !b.busy && b.seed === state.cubes?.seed && b.cube === state.cubeKey && !state.transitioning;
  showPartner(here ? span : null, online.partner?.name);
  showHelp(here && Array.isArray(b.ko) && finite(...b.ko) ? b.ko : null, online.partner?.name);
}

addEventListener('pagehide', () => link?.send({ t: 'bye' }));
