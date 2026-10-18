// The room portal scroll: the way out of a spot you cannot get out of. Reading it takes
// ROOM_PORTAL_CAST s; moving, jumping, attacking, being hurt or knocked over, falling or drifting
// off interrupts it, as with the town portal scroll (game/townportal.js), but it needs no firm
// ground: it works on a ladder, in mid-air or wedged anywhere. Then the screen fades and you
// stand where you came into this cube (state.arrival), as you were: unlike a death, the cube
// stays as it is. One way, never used up.
//
// Playing together it is the teleport scroll (game/itemnames.js): using it first asks where to
// (game/teleportmenu.js): back to where you came in, as alone, or over to one of the others
// (net/online.js travel). The cast is the same; where the friend is counts once it is read.
import { ROOM_PORTAL_CAST } from '../core/items.js';
import { respawnPoint } from '../physics/respawn.js';
import { floatText } from '../render/floattext.js';
import { sfx } from '../audio/sfx.js';
import { player, state, setStatus } from './state.js';
import { sealedIn } from './trials.js';
import { SEALED_MESSAGE } from '../core/trials.js';
import { fadeOut, fadeIn } from './hud.js';
import { spawnAt } from './flow.js';
import { startCast, cancelCast } from './townportal.js';
import { lockPortalsHere } from './portals.js';
import { cancelSword } from './sword.js';
import { clearMouseInput } from './orders.js';
import { openTeleportMenu, closeTeleportMenu, teleportMenuOpen } from './teleportmenu.js';
import { together, travel, playerColor } from '../net/online.js';

const FADE_MS = 380;

function say(message) {
  setStatus(message);
  floatText(message, q => q.set(player.x, player.visY + 2.1, player.z), { color: '#9fe3d8', size: 0.2, life: 1.8, rise: 0.35 });
}

// why the scroll cannot be read right now (null: it can)
function castBlocked() {
  const p = player;
  if (!state.map || state.transitioning || !state.arrival) return 'Not now';
  if (state.fallFrom) return 'Not while falling';
  if (sealedIn()) return SEALED_MESSAGE;   // a trial room while its event runs (game/trials.js)
  if (p.hp <= 0 || p.ragdoll || p.getUp || p.down) return 'Get up first';
  if (p.stun > 0 || p.sword.active) return 'Finish your current action first';
  return null;
}
// ... and why it cannot take you back to where you came in
function entryBlocked() {
  const p = player, a = state.arrival;
  return a && Math.hypot(p.x - a.x, p.z - a.z) < 1 && Math.abs(p.y - a.y) < 0.6 ? 'You are where you came in already' : null;
}

// use the scroll: start reading it (playing together: ask where to first), or stop a cast in
// progress (or the asking)
export function useRoomPortal() {
  if (teleportMenuOpen()) { closeTeleportMenu(); return false; }
  if (state.cast) { cancelCast('Portal cancelled'); return false; }
  const why = castBlocked();
  if (why) { say(why); return false; }
  if (together()) { openTeleportMenu(destinations, castTo); return true; }
  const back = entryBlocked();
  if (back) { say(back); return false; }
  return castTo({ to: 'entry' });
}

// where the teleport scroll can take you: where you came in, then the others (null: alone again)
function destinations() {
  if (!together()) return null;
  return [{ to: 'entry', label: 'Where you came in', why: entryBlocked() },
    ...travel.targets().map(t => ({ to: t.slot, label: t.name, color: playerColor(t.slot), why: t.why }))];
}

// read the scroll for there: to 'entry' or a player's number
function castTo({ to, label }) {
  const why = castBlocked();
  if (why) { say(why); return false; }
  const friend = to !== 'entry';
  startCast({ kind: 'roomPortal', duration: ROOM_PORTAL_CAST, firm: false, done: friend ? () => takeToFriend(to) : takeRoomPortal });
  setStatus(friend ? `Reading the teleport scroll to ${label}... hold still`
    : together() ? 'Reading the teleport scroll... hold still' : 'Reading the room portal scroll... hold still');
  return true;
}

function takeToFriend(slot) {
  if (state.transitioning) return;
  if (travel.goTo(slot)) sfx('portal');
  else sfx('fizzle');
}

function takeRoomPortal() {
  if (state.transitioning || !state.arrival) return;
  const cubes = state.cubes, key = state.cubeKey;
  state.transitioning = true;
  state.portalCharge = null;
  cancelSword(true); clearMouseInput();
  sfx('portal');
  fadeOut();
  setTimeout(() => {
    if (state.cubes !== cubes || state.cubeKey !== key) return;   // a new world meanwhile
    const p = player, keep = { hp: p.hp, burning: p.burning, chilled: p.chilled, toxic: p.toxic };
    const a = state.arrival = respawnPoint(state.arrival);
    spawnAt(a.x, a.y, a.z);
    Object.assign(p, keep);
    lockPortalsHere();   // arriving beside a well or in a gate: it waits until you step out
    state.transitioning = false;
    fadeIn();
    sfx('portal', { at: a });
    say('Back where you came in');
  }, FADE_MS);
}
