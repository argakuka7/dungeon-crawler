// The chat box, bottom left: the chronicle of this visit (game/log.js), the line the game just
// said (setStatus), and a line to type in. Enter opens it to chat: playing together, the
// friends read it in the box and over our head (net/session.js). A line that starts with / is
// a command (game/commands.js, with the developer ones under ?dev=1, game/devcommands.js):
// while typing one, the box offers what fits (the game's items, enemies, rarities ...), Tab
// takes the highlighted one, and Enter runs the line, filling in what clearly fits. ` (the key
// left of 1) opens it with the / typed. Up and Down move through the suggestions while they
// show, else through the lines typed before (kept across reloads); Esc hides the suggestions,
// then closes the box. The game goes on meanwhile.
//
// Closed, new lines show for a while and fade; open, the whole chronicle scrolls, filtered by
// All / Chat / Events. A death's line opens to its record.
import { complete, accept, usage } from '../core/commands.js';
import { describe, details, KINDS, cleanText } from '../core/chronicle.js';
import { RARITY } from '../core/gear/rarities.js';
import { CHAR_H } from '../core/constants.js';
import { CHAT_MAX } from '../net/protocol.js';
import { online, relay, playerColor } from '../net/online.js';
import { floatText } from '../render/floattext.js';
import { partnerAt } from '../render/partner.js';
import { player, state } from './state.js';
import { clearInput } from './inputstate.js';
import { chronicle, log, note } from './log.js';
import { commands, runCommand } from './commands.js';
import './devcommands.js';

const $ = id => document.getElementById(id);
const box = $('chat'), list = $('chat-log'), input = $('chat-input'), popup = $('chat-popup'), hint = $('chat-usage'),
  ghost = $('chat-ghost'), status = $('chat-status');

export const SHOW_FOR = 12;   // s a new line shows while the box is closed
const SUGGEST = 50;           // suggestions at most (the list scrolls)
const HISTORY_KEY = 'cube-crawler-history', HISTORY_MAX = 50;

let open = false, filter = 'all', shown = -1, expanded = new Set();
// what fits the word being typed (core/commands.js complete), and which of it is highlighted
let comp = null, sel = 0, dismissed = false;
// the lines typed before; browsing: where in them (null: not), draft: the line before that
let history = loadHistory(), browsing = null, draft = '';
let hinted = false;   // told that nobody hears us (alone)

export const chatOpen = () => open;

// --- opening and closing --------------------------------------------------------------------

export function openChat(text = '') {
  if (state.inventoryOpen) return;
  open = true;
  box.classList.add('open');
  $('chat-entry').hidden = false; $('chat-tabs').hidden = false;
  clearInput();   // the keys held to walk are let go: from now on they type
  input.value = text;
  input.focus();
  input.setSelectionRange(text.length, text.length);
  browsing = null; dismissed = false;
  refreshCompletion();
  shown = -1; render();
  list.scrollTop = list.scrollHeight;
}
export function closeChat() {
  if (!open) return;
  open = false;
  box.classList.remove('open');
  $('chat-entry').hidden = true; $('chat-tabs').hidden = true;
  comp = null; showPopup();
  if (document.activeElement === input) input.blur();
  shown = -1; render();
}

// Enter: chat; `: a command (also with the inventory and the other panels' fields left alone)
addEventListener('keydown', e => {
  if (open || e.repeat || e.metaKey || e.ctrlKey || e.altKey || state.inventoryOpen) return;
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target?.tagName)) return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); openChat(''); }
  else if (e.code === 'Backquote') { e.preventDefault(); openChat('/'); }
});

// --- typing ----------------------------------------------------------------------------------

input.addEventListener('keydown', e => {
  e.stopPropagation();   // the game's keys are not ours while typing (game/input.js, game/dev.js)
  const items = popupItems();
  if (e.key === 'Escape') { e.preventDefault(); if (items.length) { dismissed = true; showPopup(); } else closeChat(); return; }
  if (e.key === 'Tab') { e.preventDefault(); if (items.length) take(sel); return; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const step = e.key === 'ArrowUp' ? -1 : 1;
    // the suggestions while they show (going through the history: on through it)
    if (items.length && browsing === null) { sel = (sel + step + items.length) % items.length; showPopup(); }
    else browse(step);
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); submit(); }
});
input.addEventListener('input', () => { browsing = null; dismissed = false; refreshCompletion(); });
// the cursor moved: the word under it may be another
for (const ev of ['click', 'keyup']) input.addEventListener(ev, e => {
  if (ev === 'keyup' && !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  refreshCompletion(false);
});
input.addEventListener('blur', () => closeChat());
// clicks in the box keep the line focused; the wheel scrolls the box, not the camera
box.addEventListener('mousedown', e => { if (e.target !== input) e.preventDefault(); });
box.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

async function submit() {
  const line = input.value.trim();
  browsing = null;
  if (!line || line === '/') { closeChat(); return; }
  remember(line);
  if (!line.startsWith('/')) { closeChat(); say(line); return; }
  // a command: the box stays open for the next one
  input.value = '/'; refreshCompletion();
  await runCommand(line);
}

// Say something: into the chronicle, over our head and, playing together, to the friends
export function say(text) {
  text = cleanText(text, CHAT_MAX);
  if (!text) return;
  log('chat', { text });
  speech(text);
  if (relay.chat) relay.chat(text);
  else if (!hinted) { hinted = true; note('Nobody else hears you here: O plays together with friends'); }
}

// What someone said, over their head for a while: ours (slot null) or a friend's who is here
export function speech(text, slot = null) {
  const short = text.length > 42 ? text.slice(0, 41) + '…' : text, opts = { color: '#f4f6fa', size: 0.17, life: 4, rise: 0.12 };
  if (slot === null) { floatText(short, q => q.set(player.x, player.visY + CHAR_H + 0.75, player.z), opts); return; }
  const at = partnerAt(slot);
  if (!at) return;
  const last = at.clone();
  floatText(short, q => { const a = partnerAt(slot); if (a) last.copy(a); return q.set(last.x, last.y + CHAR_H + 0.75, last.z); }, opts);
}

// --- completing --------------------------------------------------------------------------------

const popupItems = () => comp && !dismissed ? comp.items : [];
function refreshCompletion(fresh = true) {
  const before = comp?.items[sel]?.value;
  comp = complete(commands, input.value, input.selectionStart ?? input.value.length, { dev: state.dev }, SUGGEST);
  sel = fresh ? 0 : Math.max(0, comp?.items.findIndex(i => i.value === before) ?? 0);
  showPopup();
}
// put the highlighted value in place of the word being typed
function take(i) {
  const item = popupItems()[i];
  if (!item) return;
  const r = accept(input.value, comp, item.value);
  input.value = r.line;
  input.setSelectionRange(r.cursor, r.cursor);
  refreshCompletion();
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function showPopup() {
  const items = popupItems();
  popup.hidden = !items.length;
  popup.innerHTML = items.map((it, i) => `<li role="option" data-i="${i}"${i === sel ? ' class="on" aria-selected="true"' : ''}>`
    + (it.icon ? `<img src="${esc(it.icon)}" alt="">` : '<i></i>')
    + `<span class="label"${it.color ? ` style="color:${esc(it.color)}"` : ''}>${esc(it.label ?? it.value)}</span>`
    + (it.label && it.label !== it.value ? `<span class="id">${esc(it.value)}</span>` : '')
    + (it.hint ? `<span class="hint">${esc(it.hint)}</span>` : '') + '</li>').join('');
  // how the command goes, the argument being typed in bold
  const c = comp?.command;
  hint.hidden = !c;
  if (c) hint.innerHTML = usage(c).split(' ').map((w, i) => i - 1 === comp.arg ? `<b>${esc(w)}</b>` : esc(w)).join(' ') + ` <span>${esc(c.help)}</span>`;
  // greyed out after what was typed: the rest of the highlighted value, or what it is
  const it = items[sel], end = input.value.length;
  const after = it && comp.to === end && input.selectionStart === end && comp.query && input.scrollLeft === 0;
  const rest = after && (it.value.toLowerCase().startsWith(comp.query.toLowerCase()) ? it.value.slice(comp.query.length)
    : `  → ${it.label ?? it.value}`);
  ghost.innerHTML = rest ? `<span>${esc(input.value)}</span>${esc(rest)}` : '';
  popup.children[sel]?.scrollIntoView({ block: 'nearest' });
}
popup.addEventListener('click', e => { const li = e.target.closest('li'); if (li) take(Number(li.dataset.i)); });

// --- the lines typed before --------------------------------------------------------------------

function loadHistory() {
  try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(h) ? h.filter(l => typeof l === 'string') : []; }
  catch { return []; }
}
function remember(line) {
  history = [...history.filter(l => l !== line), line].slice(-HISTORY_MAX);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* private mode: not kept */ }
}
// step -1: an older line, +1: a newer one (past the newest: what was being typed)
function browse(step) {
  if (browsing === null) { if (step > 0 || !history.length) return; draft = input.value; browsing = history.length; }
  browsing = Math.max(0, Math.min(history.length, browsing + step));
  input.value = browsing === history.length ? draft : history[browsing];
  if (browsing === history.length) browsing = null;
  input.setSelectionRange(input.value.length, input.value.length);
  refreshCompletion();
}

// --- the chronicle -----------------------------------------------------------------------------

const colorOf = who => who ? playerColor(who.slot) : online.slot !== null && online.peers.size ? playerColor(online.slot) : '#ffe4ae';
const groupOk = e => filter === 'all' || KINDS[e.kind].group === filter;
function row(e) {
  const li = document.createElement('li');
  li.className = `k-${e.kind}${e.who ? ' friend' : ''}${e.data.error ? ' error' : ''}`;
  li.dataset.time = e.time;
  if (e.kind === 'chat') {
    const name = document.createElement('b');
    name.textContent = e.who ? e.who.name : 'You';
    name.style.color = colorOf(e.who);
    li.append(name, ': ' + e.data.text);
    return li;
  }
  const text = document.createElement('span');
  text.textContent = describe(e);
  if (e.kind === 'loot' && RARITY[e.data.rarity]) text.style.color = RARITY[e.data.rarity].css;
  if (e.who) text.style.setProperty('--who', colorOf(e.who));
  li.append(text);
  if (e.kind === 'death') {
    li.classList.add('more');
    li.dataset.id = e.id;
    if (expanded.has(e.id)) {
      const more = document.createElement('div');
      more.className = 'record';
      more.textContent = details(e).join('\n');
      li.append(more);
    }
  }
  return li;
}
list.addEventListener('click', e => {
  const li = e.target.closest('li.more');
  if (!li) return;
  const id = Number(li.dataset.id);
  if (!expanded.delete(id)) expanded.add(id);
  shown = -1; render();
});
for (const b of $('chat-tabs').querySelectorAll('button')) b.addEventListener('click', () => {
  filter = b.dataset.filter;
  for (const o of $('chat-tabs').querySelectorAll('button')) o.classList.toggle('on', o === b);
  shown = -1; render();
  list.scrollTop = list.scrollHeight;
});

function render() {
  if (shown === chronicle.version) return;
  shown = chronicle.version;
  const bottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
  list.replaceChildren(...chronicle.entries.filter(e => !open || groupOk(e)).map(row));
  if (bottom || !open) list.scrollTop = list.scrollHeight;
  fade(true);
}
// closed, lines older than SHOW_FOR fade out (only the last few can still be new)
function fade(all = false) {
  const now = performance.now() / 1000, rows = list.children;
  for (let i = rows.length - 1, n = 0; i >= 0 && (all || n < 12); i--, n++)
    rows[i].classList.toggle('old', !open && now - Number(rows[i].dataset.time) > SHOW_FOR);
}

let said = null;
// main.js, every frame
export function updateConsole() {
  render();
  fade();
  if (said !== state.statusMsg) { said = state.statusMsg; status.textContent = said; status.classList.toggle('on', !!said); }
}
