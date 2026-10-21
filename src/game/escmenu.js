// The Esc menu (Esc, the menu key O, or the menu button on the touch quick bar): resume, play
// together, the settings (game/settingsmenu.js: music, volumes, keys), and save and quit to the
// main menu (game/menu.js). Alone it pauses the world (state.js worldPaused); playing together
// the world goes on, only your own input stops.
//
// Play together: host this world (friends come in with a four letter room code, or a link
// with ?join=CODE, and drop out as they like), stop hosting, leave a friend's game (back to the
// main menu; joining one is done there, game/menu.js). Up to four play together
// (net/session.js); ?net=local plays between tabs of this browser instead of over the internet
// (for testing, net/transport.js). Your name is your saved hero's (game/save.js); without one
// (?seed=, the dev tools) a random one for this page.
import { state } from './state.js';
import { clearInput } from './inputstate.js';
import { clearMouseInput } from './orders.js';
import { savedHero } from './save.js';
import { NAME_MAX } from '../core/save.js';
import { ADJECTIVES } from '../core/names.js';
import { quitToMenu } from './menu.js';
import { openSettings, closeSettings } from './settingsmenu.js';
import { online, together, playerColor } from '../net/online.js';
import { hostGame, leaveGame, sessionStatus, onSessionChange } from '../net/session.js';

const $ = id => document.getElementById(id);
const overlay = $('menu-overlay'), params = new URLSearchParams(location.search);
const local = params.get('net') === 'local';
const CONFIRM_MS = 4000;
let confirmUntil = 0, quitUntil = 0;   // the stop hosting / the quit button asks again until then

export const menuOpen = () => state.menuOpen;
export function setMenuOpen(open) {
  if (open === state.menuOpen) return;
  state.menuOpen = open;
  overlay.hidden = !open;
  if (open) {
    clearInput(); clearMouseInput();   // nothing walks on by itself while the menu is open
    confirmUntil = quitUntil = 0;
    render();
  } else {
    closeSettings();
    document.activeElement?.blur?.();   // back to the game: keys play again
  }
}
export const toggleMenu = () => setMenuOpen(!state.menuOpen);

// --- your name ----------------------------------------------------------------------------------

// without a saved hero: a word of the world names and Crawler ("Misty Crawler")
const SHORT = ADJECTIVES.filter(w => w.length <= NAME_MAX - ' Crawler'.length);
const randomName = `${SHORT[Math.floor(Math.random() * SHORT.length)]} Crawler`;
const playerName = () => savedHero()?.name ?? randomName;

// --- drawing ------------------------------------------------------------------------------------

const link = code => `${location.origin}${location.pathname}?join=${code}${local ? '&net=local' : ''}`;

function players() {
  if (online.slot === null) return [];
  const list = [{ slot: online.slot, name: playerName(), you: true },
    ...[...online.peers].map(([slot, p]) => ({ slot, name: p.name }))];
  return list.sort((a, b) => a.slot - b.slot);
}

function render() {
  if (!state.menuOpen) return;
  const { phase, text } = sessionStatus(), idle = phase === 'idle', host = online.role === 'host';
  $('menu-paused').textContent = together() ? 'The game goes on' : 'Paused';
  // play together: Host this world, or (hosting) Stop hosting with the join code and its link
  const room = host && online.code && (phase === 'waiting' || phase === 'connected');
  $('menu-host').hidden = !idle;
  $('menu-room').hidden = $('menu-copy').hidden = !room;
  $('menu-room-code').textContent = online.code ?? '';
  const list = players();
  $('menu-players').hidden = list.length < 2;
  $('menu-players').innerHTML = '';
  for (const p of list) {
    const li = document.createElement('li'), dot = document.createElement('i');
    dot.style.background = playerColor(p.slot);
    li.append(dot, `${p.name}${p.you ? ' (you)' : ''}${p.slot === 0 ? ' · host' : ''}`);
    $('menu-players').append(li);
  }
  $('menu-status').textContent = room ? '' : text;   // (hosting, the code and the players say it)
  const leave = $('menu-leave'), asking = performance.now() < confirmUntil;
  leave.hidden = idle;
  leave.classList.toggle('confirm', asking);
  leave.textContent = phase === 'opening' || phase === 'joining' ? 'Cancel'
    : host ? asking ? 'Stop hosting? Your friends drop out' : 'Stop hosting'
    : 'Leave the game';
  const quit = $('menu-quit'), sure = performance.now() < quitUntil;
  quit.classList.toggle('confirm', sure);
  quit.textContent = sure ? 'Quit? Your friends drop out' : savedHero() ? 'Save and quit to the menu' : 'Quit to the menu';
}

onSessionChange(s => {
  if (s.phase === 'idle') confirmUntil = 0;
  render();
  // joined: off to play after a moment
  if (s.phase === 'connected' && online.role === 'guest')
    setTimeout(() => { if (sessionStatus().phase === 'connected' && online.role === 'guest') setMenuOpen(false); }, 1200);
});

// --- buttons ------------------------------------------------------------------------------------

$('menu-resume').onclick = () => setMenuOpen(false);
$('menu-close').onclick = () => setMenuOpen(false);
// a click on the dimmed game around the panel resumes too
overlay.addEventListener('pointerdown', e => { if (e.target === overlay) setMenuOpen(false); });
$('menu-host').onclick = () => hostGame({ name: playerName(), local });
// stopping a game friends are in asks first
$('menu-leave').onclick = () => {
  if (online.role === 'host' && together() && performance.now() >= confirmUntil) {
    confirmUntil = performance.now() + CONFIRM_MS;
    render();
    setTimeout(render, CONFIRM_MS + 50);
    return;
  }
  confirmUntil = 0;
  const guest = online.role === 'guest';
  leaveGame();
  if (guest) { setMenuOpen(false); quitToMenu(); }   // a guest goes back to the main menu
};
// quitting a game friends are in asks first too
$('menu-quit').onclick = () => {
  if (online.role === 'host' && together() && performance.now() >= quitUntil) {
    quitUntil = performance.now() + CONFIRM_MS;
    render();
    setTimeout(render, CONFIRM_MS + 50);
    return;
  }
  setMenuOpen(false);
  quitToMenu();
};
$('menu-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(link(online.code)); $('menu-copy').textContent = 'Copied!'; }
  catch { $('menu-copy').textContent = link(online.code); }
  setTimeout(() => { $('menu-copy').textContent = 'Copy join link'; }, 1600);
};
$('menu-settings').onclick = () => openSettings();
// a clicked button lets go of the focus: Space and Enter belong to the game again
overlay.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') e.target.blur(); });
