// The Esc menu (Esc, O, or the menu button on the touch quick bar): resume, play together,
// the controls and the music. Alone it pauses the world (state.js worldPaused); playing
// together the world goes on, only your own input stops.
//
// Play together: host this world (friends come in with a four letter room code, or a link
// with ?join=CODE, and drop out as they like), stop hosting, join a friend's game with their
// code, leave it. Up to four play together (net/session.js); ?net=local plays between tabs of
// this browser instead of over the internet (for testing, net/transport.js). Your name is
// your saved hero's (game/save.js); without one a field asks for it.
import { state } from './state.js';
import { clearInput } from './inputstate.js';
import { clearMouseInput } from './orders.js';
import { setHelpOpen } from './help.js';
import { savedHero } from './save.js';
import { musicEnabled, toggleMusic } from '../audio/music.js';
import { readCode } from '../net/protocol.js';
import { online, together, playerColor } from '../net/online.js';
import { hostGame, joinGame, leaveGame, sessionStatus, onSessionChange } from '../net/session.js';

const $ = id => document.getElementById(id);
const overlay = $('menu-overlay'), params = new URLSearchParams(location.search);
const local = params.get('net') === 'local';
const NAME_KEY = 'cube-crawler-name';
const CONFIRM_MS = 4000;
let confirmUntil = 0;   // the stop / leave button asks again until then

export const menuOpen = () => state.menuOpen;
export function setMenuOpen(open) {
  if (open === state.menuOpen) return;
  state.menuOpen = open;
  overlay.hidden = !open;
  if (open) {
    setHelpOpen(false);
    clearInput(); clearMouseInput();   // nothing walks on by itself while the menu is open
    confirmUntil = 0;
    render();
  } else document.activeElement?.blur?.();   // back to the game: keys play again
}
export const toggleMenu = () => setMenuOpen(!state.menuOpen);

// --- your name ----------------------------------------------------------------------------------

const storedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
$('menu-name').value = storedName();
function playerName() {
  const hero = savedHero();
  if (hero) return hero.name;
  const n = $('menu-name').value.trim();
  try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode: not remembered */ }
  return n;
}

// --- drawing ------------------------------------------------------------------------------------

const link = code => `${location.origin}${location.pathname}?join=${code}${local ? '&net=local' : ''}`;

function players() {
  if (online.slot === null) return [];
  const list = [{ slot: online.slot, name: playerName() || 'You', you: true },
    ...[...online.peers].map(([slot, p]) => ({ slot, name: p.name }))];
  return list.sort((a, b) => a.slot - b.slot);
}

function render() {
  if (!state.menuOpen) return;
  const { phase, text } = sessionStatus(), idle = phase === 'idle', host = online.role === 'host';
  $('menu-paused').textContent = together() ? 'The game goes on' : 'Paused';
  $('menu-start').hidden = !idle;
  $('menu-name-row').hidden = !!savedHero();
  $('menu-room').hidden = !(host && online.code && (phase === 'waiting' || phase === 'connected'));
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
  $('menu-status').textContent = text;
  const leave = $('menu-leave'), asking = performance.now() < confirmUntil;
  leave.hidden = idle;
  leave.classList.toggle('confirm', asking);
  leave.textContent = phase === 'opening' || phase === 'joining' ? 'Cancel'
    : host ? asking ? 'Stop hosting? Your friends drop out' : 'Stop hosting'
    : 'Leave the game';
  $('menu-music').textContent = `Music: ${musicEnabled() ? 'on' : 'off'}`;
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
function join() {
  const code = readCode($('menu-code').value);
  if (!code) { $('menu-status').textContent = 'A code has four letters'; $('menu-code').focus(); return; }
  document.activeElement?.blur?.();
  joinGame(code, { name: playerName(), local });
}
$('menu-join').onclick = join;
$('menu-code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
// stopping a game friends are in asks first
$('menu-leave').onclick = () => {
  if (online.role === 'host' && together() && performance.now() >= confirmUntil) {
    confirmUntil = performance.now() + CONFIRM_MS;
    render();
    setTimeout(render, CONFIRM_MS + 50);
    return;
  }
  confirmUntil = 0;
  leaveGame();
};
$('menu-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(link(online.code)); $('menu-copy').textContent = 'Copied!'; }
  catch { $('menu-copy').textContent = link(online.code); }
  setTimeout(() => { $('menu-copy').textContent = 'Copy link'; }, 1600);
};
$('menu-controls').onclick = () => { setMenuOpen(false); setHelpOpen(true); };
$('menu-music').onclick = () => { toggleMusic(); render(); };
// a clicked button lets go of the focus: Space and Enter belong to the game again
overlay.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') e.target.blur(); });

// ?join=CODE: the menu opens (once every module is there: not while they are still loading)
// and joins once the first cube is there
const invited = readCode(params.get('join'));
if (invited) {
  $('menu-code').value = invited;
  const wait = setInterval(() => {
    setMenuOpen(true);
    if (!state.map || state.transitioning) return;
    clearInterval(wait);
    join();
  }, 200);
}
