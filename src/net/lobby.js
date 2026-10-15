// The "Play together" panel (O): host a game and give a friend its code (or a link), or type a
// friend's code to join theirs. Like the help it does not pause the game. A link with
// ?join=CODE opens the panel and joins that game once the first cube is there; ?net=local
// plays between tabs of this browser instead of over the internet (for testing,
// net/transport.js).
import { state } from '../game/state.js';
import { readCode } from './protocol.js';
import { online } from './online.js';
import { hostGame, joinGame, leaveGame, sessionStatus, onSessionChange } from './session.js';

const $ = id => document.getElementById(id);
const overlay = $('online-overlay'), params = new URLSearchParams(location.search);
const local = params.get('net') === 'local';
const NAME_KEY = 'cube-crawler-name';

const storedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
function name() {
  const n = $('online-name').value.trim();
  try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode: not remembered */ }
  return n;
}
$('online-name').value = storedName();

export const lobbyOpen = () => !overlay.hidden;
export function setLobbyOpen(open) {
  overlay.hidden = !open;
  // nothing takes the focus: keys still play (a focused button would take the Space for jumping)
  if (open) render(sessionStatus());
  else document.activeElement?.blur?.();
}
export const toggleLobby = () => setLobbyOpen(overlay.hidden);

const link = code => `${location.origin}${location.pathname}?join=${code}${local ? '&net=local' : ''}`;

function render({ phase, text }) {
  const idle = phase === 'idle';
  $('online-start').hidden = !idle;
  $('online-room').hidden = !(online.role === 'host' && online.code && (phase === 'waiting' || phase === 'connected'));
  $('online-room-code').textContent = online.code ?? '';
  $('online-leave').hidden = idle;
  $('online-leave').textContent = phase === 'waiting' ? 'Close the room' : phase === 'opening' || phase === 'joining' ? 'Cancel' : 'Leave';
  $('online-status').textContent = text;
  $('online-name').disabled = !idle;
}

onSessionChange(s => {
  render(s);
  // together: out of the way after a moment
  if (s.phase === 'connected') setTimeout(() => { if (sessionStatus().phase === 'connected') setLobbyOpen(false); }, 1200);
});

$('online-host').onclick = () => hostGame({ name: name(), local });
function join() {
  const code = readCode($('online-code').value);
  if (!code) { $('online-status').textContent = 'A code has four letters'; $('online-code').focus(); return; }
  document.activeElement?.blur?.();   // typing is over: the keys play again
  joinGame(code, { name: name(), local });
}
$('online-join').onclick = join;
// a clicked button lets go of the focus, so Space jumps instead of clicking it again
overlay.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') e.target.blur(); });
$('online-code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
$('online-leave').onclick = () => leaveGame();
$('online-close').onclick = () => setLobbyOpen(false);
$('online-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(link(online.code)); $('online-copy').textContent = 'Copied!'; }
  catch { $('online-copy').textContent = link(online.code); }
  setTimeout(() => { $('online-copy').textContent = 'Copy link'; }, 1600);
};

// ?join=CODE: join once the first cube is there
const invited = readCode(params.get('join'));
if (invited) {
  $('online-code').value = invited;
  setLobbyOpen(true);
  const wait = setInterval(() => {
    if (!state.map || state.transitioning) return;
    clearInterval(wait);
    join();
  }, 200);
}
