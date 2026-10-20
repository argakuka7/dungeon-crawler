// "Leave the fight?": walking back out of a guardian's arena while the guardian lives asks first
// (game/portals.js, core/guardians.js leavingFight). Leave (Enter, Y) goes through the face as
// always; Stay (Esc, N, a click beside the box) keeps you in, and it does not ask again until you
// step away from the face. Alone the world waits meanwhile (state.js worldPaused); playing
// together it goes on, only your own input stops, and the question goes away if you are knocked
// over, grabbed, downed or taken elsewhere before you answer.
import { player, state } from './state.js';
import { clearInput } from './inputstate.js';
import { clearMouseInput } from './orders.js';
import { startTravel } from './travel.js';
import { guardianName } from '../core/guardians.js';
import { guardianKind } from './enemyspawn.js';

const $ = id => document.getElementById(id);
const overlay = $('leave-overlay');

export const leaveAsked = () => !!state.leaveAsk;

export function askLeave(dir) {
  if (state.leaveAsk) return;
  state.leaveAsk = { key: state.cubeKey, dir };
  $('leave-text').textContent = `${guardianName(state.map, guardianKind(state.map)?.label)} still stands. Leave the arena?`;
  overlay.hidden = false;
  clearInput(); clearMouseInput();   // nothing walks on by itself meanwhile
}

const canGo = ask => ask.key === state.cubeKey && state.mode === 'play' && !state.transitioning
  && player.hp > 0 && !player.down && !player.ragdoll && !player.held;

export function answerLeave(go) {
  const ask = state.leaveAsk;
  if (!ask) return;
  state.leaveAsk = null;
  overlay.hidden = true;
  document.activeElement?.blur?.();   // back to the game: keys play again
  if (ask.key !== state.cubeKey) return;
  const gate = state.map.portals.find(q => q.kind === 'side' && q.dir === ask.dir);
  if (go && canGo(ask)) { startTravel(gate || { kind: 'side', dir: ask.dir }); return; }
  // not again until you step away from the face (an open one) or out of its gate (one not open)
  state.boundaryLock = ask.dir;
  if (gate) state.portalLock = gate.id;
}

// main.js, every frame: the question only holds while it can still be answered
export function updateLeave() {
  if (state.leaveAsk && !canGo(state.leaveAsk)) answerLeave(false);
}

$('leave-go').onclick = () => answerLeave(true);
$('leave-stay').onclick = () => answerLeave(false);
overlay.addEventListener('pointerdown', e => { if (e.target === overlay) answerLeave(false); });
