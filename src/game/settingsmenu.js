// The settings menu, from the Esc menu (game/escmenu.js) and the main menu (game/menu.js): the
// music on or off, the music's and the sounds' volume, and the keys: each control's primary and
// secondary key (core/keybinds.js). Everything is kept as it changes (game/settings.js).
//
// A click on a key waits for the new one: the next key pressed takes the place (taken from the
// control that had it, which the line at the bottom names), Esc keeps the old one, Backspace
// or Delete leaves the place empty. While the settings are open the game gets no keys.
import { ACTIONS, ACTION, GROUPS, UNBINDABLE } from '../core/keybinds.js';
import {
  musicOn, setMusic, musicVolume, setMusicVolume, soundVolume, setSoundVolume,
  keysOf, bindKey, unbindKey, resetKeys, nameOf, onSettingsChange,
} from './settings.js';
import { sfx } from '../audio/sfx.js';

const $ = id => document.getElementById(id);
const overlay = $('settings-overlay'), keysBox = $('settings-keys'), feedback = $('settings-feedback');
const CONFIRM_MS = 4000;
let waiting = null;    // { id, slot }: the key place waiting for a key
let resetUntil = 0;    // the reset button asks again until then
let opener = null;     // what had the focus before (it gets it back)

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const say = text => { feedback.textContent = text; };

export const settingsOpen = () => !overlay.hidden;
export function openSettings() {
  if (settingsOpen()) return;
  opener = document.activeElement;
  overlay.hidden = false;
  waiting = null; resetUntil = 0; say('');
  render();
  $('settings-close').focus();
}
export function closeSettings() {
  if (!settingsOpen()) return;
  overlay.hidden = true;
  waiting = null;
  if (opener?.isConnected && opener.offsetParent) opener.focus(); else document.activeElement?.blur?.();
  opener = null;
}

// --- drawing ------------------------------------------------------------------------------------

function renderSound() {
  const on = musicOn();
  $('settings-music').textContent = on ? 'On' : 'Off';
  $('settings-music').setAttribute('aria-pressed', String(on));
  $('settings-music').classList.toggle('on', on);
  for (const [bar, out, v] of [['settings-music-volume', 'settings-music-level', musicVolume()], ['settings-sound-volume', 'settings-sound-level', soundVolume()]]) {
    $(bar).value = String(Math.round(v * 100));
    $(out).textContent = `${Math.round(v * 100)}%`;
  }
}
function keyButton(a, slot) {
  const k = keysOf(a.id)[slot], on = waiting?.id === a.id && waiting.slot === slot;
  const which = slot ? 'secondary' : 'primary';
  return `<button data-id="${a.id}" data-slot="${slot}" class="${on ? 'waiting' : k === null ? 'empty' : ''}"`
    + ` aria-label="${esc(`${a.label}, ${which} key: ${k === null ? 'none' : nameOf(k)}`)}">${on ? 'Press a key\u2026' : k === null ? '\u2014' : esc(nameOf(k))}</button>`;
}
function renderKeys() {
  keysBox.innerHTML = GROUPS.map(g => `<h3>${g}</h3>` + ACTIONS.filter(a => a.group === g)
    .map(a => `<div class="settings-key"><span>${esc(a.label)}</span>${keyButton(a, 0)}${keyButton(a, 1)}</div>`).join('')).join('');
  const reset = $('settings-reset'), sure = performance.now() < resetUntil;
  reset.classList.toggle('confirm', sure);
  reset.textContent = sure ? 'Sure? Click again' : 'Reset keys';
}
function render() {
  if (!settingsOpen()) return;
  const focused = document.activeElement?.closest?.('#settings-keys [data-id]');
  const place = focused && { id: focused.dataset.id, slot: focused.dataset.slot };
  renderSound(); renderKeys();
  // the focus stays on the key place it was on (it was drawn anew)
  if (place) keysBox.querySelector(`[data-id="${place.id}"][data-slot="${place.slot}"]`)?.focus();
}
onSettingsChange(render);

// --- doing --------------------------------------------------------------------------------------

function wait(id, slot) {
  waiting = waiting?.id === id && waiting.slot === slot ? null : { id, slot };
  say(waiting ? `${ACTION[id].label}: press the new key` : '');
  render();
}
// the key pressed while a place waits for one
function take(e) {
  const { id, slot } = waiting;
  if (e.code === 'Escape') { waiting = null; say(''); render(); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') {
    waiting = null; unbindKey(id, slot);
    say(`${ACTION[id].label}: no ${slot ? 'secondary' : 'primary'} key`);
    return;
  }
  if (!e.code || UNBINDABLE.has(e.code)) { say(`${nameOf(e.code) || 'That key'} cannot be used, try another`); return; }
  waiting = null;
  const lost = bindKey(id, slot, e.code, e.key);
  say(lost.length ? lost.map(l => `${nameOf(l.key)} is no longer ${ACTION[l.id].label}'s key`).join('. ')
    : `${ACTION[id].label}: ${nameOf(e.code)}`);
  if (lost.length) sfx('use', { volume: 0.6 });
}

// the keys go to the settings, none to the game (the buttons and sliders still work as usual)
addEventListener('keydown', e => {
  if (!settingsOpen()) return;
  e.stopImmediatePropagation();
  if (waiting) { e.preventDefault(); if (!e.repeat) take(e); return; }
  if (e.code === 'Escape') { e.preventDefault(); closeSettings(); }
}, true);

keysBox.addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) wait(b.dataset.id, Number(b.dataset.slot));
});
$('settings-close').onclick = () => closeSettings();
overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeSettings(); });
$('settings-music').onclick = () => setMusic(!musicOn());
$('settings-music-volume').addEventListener('input', e => setMusicVolume(e.target.value / 100));
$('settings-sound-volume').addEventListener('input', e => setSoundVolume(e.target.value / 100));
$('settings-sound-volume').addEventListener('change', () => sfx('coin'));   // how loud it is now
$('settings-reset').onclick = () => {
  if (performance.now() >= resetUntil) {
    resetUntil = performance.now() + CONFIRM_MS;
    renderKeys();
    setTimeout(render, CONFIRM_MS + 50);
    return;
  }
  resetUntil = 0; waiting = null;
  resetKeys();
  say('All keys are back as they were at the start');
};
