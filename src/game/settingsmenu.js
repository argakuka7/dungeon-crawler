// The settings menu, from the Esc menu (game/escmenu.js) and the main menu (game/menu.js): the
// language, the frame rate cap and the anti-aliasing, the camera (overview or close view), the UI scale (game/uiscale.js:
// taken when the slider is let go, as the panel itself grows or shrinks with it), the mouse look's speed
// and inverting it up and down, the music on or off, the music's and the sounds' volume, and the keys: each control's primary and
// secondary key (core/keybinds.js). Everything is kept as it changes (game/settings.js).
//
// The keys come in tabs, one per kind of control (core/keybinds.js GROUPS; Left and Right go
// through them too). A click on a key waits for the new one: the next key pressed takes the place (taken from the
// control that had it, which the line at the bottom names), Esc keeps the old one, Backspace
// or Delete leaves the place empty. While the settings are open the game gets no keys.
import { ACTIONS, ACTION, GROUPS, UNBINDABLE } from '../core/keybinds.js';
import {
  FRAME_RATES, frameRate, setFrameRate, antialias, setAntialias, cameraMode, setCameraMode, uiScale, setUiScale,
  lookSpeed, setLookSpeed, invertLook, setInvertLook,
  musicOn, setMusic, musicVolume, setMusicVolume, soundVolume, setSoundVolume,
  keysOf, bindKey, unbindKey, resetKeys, nameOf, onSettingsChange, languageNow, chooseLanguage,
} from './settings.js';
import { tr, tc, LANGUAGES, onLanguageChange } from '../i18n/i18n.js';
import { sfx } from '../audio/sfx.js';
import { MSAA_LEVELS, msaaLevel } from '../render/msaa.js';

const $ = id => document.getElementById(id);
const overlay = $('settings-overlay'), keysBox = $('settings-keys'), tabs = $('settings-tabs'), feedback = $('settings-feedback');
const CONFIRM_MS = 4000;
let waiting = null;    // { id, slot }: the key place waiting for a key
let tab = GROUPS[0];   // the kind of controls shown
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

// a row of buttons, one pressed: [value, label] pairs
function choice(box, options, current) {
  box.innerHTML = options.map(([v, label]) => `<button data-value="${v}" aria-pressed="${v === current}" class="${v === current ? 'on' : ''}">${esc(label)}</button>`).join('');
}
// each language by its own name, so whoever reads it finds theirs
function renderLanguage() {
  choice($('settings-language'), LANGUAGES.map(l => [l.code, l.name]), languageNow());
  for (const b of $('settings-language').children) b.lang = b.dataset.value;
}
function renderGraphics() {
  choice($('settings-fps'), FRAME_RATES.map(f => [f, f ? String(f) : tr('Unlimited')]), frameRate());
  // the levels this GPU can do; one asked for beyond them shows as the one used
  choice($('settings-msaa'), MSAA_LEVELS.map(n => [n, n ? `${n}x` : tc('toggle', 'Off')]), msaaLevel(antialias()));
  choice($('settings-camera'), [['overview', tr('Overview')], ['close', tc('camera', 'Close')]], cameraMode());
  const scale = Math.round(uiScale() * 100);
  $('settings-ui-scale').value = String(scale);
  $('settings-ui-level').textContent = `${scale}%`;
}
function renderMouse() {
  const inverted = invertLook(), speed = Math.round(lookSpeed() * 100);
  $('settings-look-speed').value = String(speed);
  $('settings-look-level').textContent = `${speed}%`;
  $('settings-invert').textContent = inverted ? tc('toggle', 'On') : tc('toggle', 'Off');
  $('settings-invert').setAttribute('aria-pressed', String(inverted));
  $('settings-invert').classList.toggle('on', inverted);
}
function renderSound() {
  const on = musicOn();
  $('settings-music').textContent = on ? tc('toggle', 'On') : tc('toggle', 'Off');
  $('settings-music').setAttribute('aria-pressed', String(on));
  $('settings-music').classList.toggle('on', on);
  for (const [bar, out, v] of [['settings-music-volume', 'settings-music-level', musicVolume()], ['settings-sound-volume', 'settings-sound-level', soundVolume()]]) {
    $(bar).value = String(Math.round(v * 100));
    $(out).textContent = `${Math.round(v * 100)}%`;
  }
}
function keyButton(a, slot) {
  const k = keysOf(a.id)[slot], on = waiting?.id === a.id && waiting.slot === slot;
  const key = k === null ? tr('none') : nameOf(k), label = tr(a.label);
  return `<button data-id="${a.id}" data-slot="${slot}" class="${on ? 'waiting' : k === null ? 'empty' : ''}"`
    + ` aria-label="${esc(slot ? tr('{label}, secondary key: {key}', { label, key }) : tr('{label}, primary key: {key}', { label, key }))}">${on ? esc(tr('Press a key…')) : k === null ? '\u2014' : esc(nameOf(k))}</button>`;
}
// the tabs keep the height of the longest, so the panel does not jump between them
keysBox.style.setProperty('--rows', String(Math.max(...GROUPS.map(g => ACTIONS.filter(a => a.group === g).length))));
function renderKeys() {
  tabs.innerHTML = GROUPS.map(g => `<button role="tab" id="settings-tab-${g}" data-tab="${g}" aria-selected="${g === tab}"`
    + ` tabindex="${g === tab ? 0 : -1}" class="${g === tab ? 'on' : ''}">${esc(tr(g))}</button>`).join('');
  keysBox.setAttribute('aria-labelledby', `settings-tab-${tab}`);
  keysBox.innerHTML = ACTIONS.filter(a => a.group === tab)
    .map(a => `<div class="settings-key"><span>${esc(tr(a.label))}</span>${keyButton(a, 0)}${keyButton(a, 1)}</div>`).join('');
  const reset = $('settings-reset'), sure = performance.now() < resetUntil;
  reset.classList.toggle('confirm', sure);
  reset.textContent = sure ? tr('Sure? Click again') : tr('Reset keys');
}
function render() {
  if (!settingsOpen()) return;
  const focused = document.activeElement?.closest?.('#settings-keys [data-id]');
  const place = focused && { id: focused.dataset.id, slot: focused.dataset.slot };
  const onTab = document.activeElement?.closest?.('#settings-tabs');
  const pressed = document.activeElement?.closest?.('.settings-choice [data-value]');
  const chosen = pressed && { box: pressed.parentElement.id, value: pressed.dataset.value };
  renderLanguage(); renderGraphics(); renderMouse(); renderSound(); renderKeys();
  // the focus stays on the key place, the tab or the choice it was on (they were drawn anew)
  if (chosen) $(chosen.box).querySelector(`[data-value="${chosen.value}"]`)?.focus();
  else if (place) keysBox.querySelector(`[data-id="${place.id}"][data-slot="${place.slot}"]`)?.focus();
  else if (onTab) tabs.querySelector('.on')?.focus();
}
function showTab(g) {
  if (g === tab) return;
  tab = g; waiting = null; say('');
  render();
}
onSettingsChange(render);
onLanguageChange(render);

// --- doing --------------------------------------------------------------------------------------

function wait(id, slot) {
  waiting = waiting?.id === id && waiting.slot === slot ? null : { id, slot };
  say(waiting ? tr('{label}: press the new key', { label: tr(ACTION[id].label) }) : '');
  render();
}
// the key pressed while a place waits for one
function take(e) {
  const { id, slot } = waiting;
  if (e.code === 'Escape') { waiting = null; say(''); render(); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') {
    waiting = null; unbindKey(id, slot);
    const label = tr(ACTION[id].label);
    say(slot ? tr('{label}: no secondary key', { label }) : tr('{label}: no primary key', { label }));
    return;
  }
  if (!e.code || UNBINDABLE.has(e.code)) {
    say(nameOf(e.code) ? tr('{key} cannot be used, try another', { key: nameOf(e.code) }) : tr('That key cannot be used, try another'));
    return;
  }
  waiting = null;
  const lost = bindKey(id, slot, e.code, e.key);
  say(lost.length ? lost.map(l => tr('{key} is no longer the key for {label}', { key: nameOf(l.key), label: tr(ACTION[l.id].label) })).join('. ')
    : `${tr(ACTION[id].label)}: ${nameOf(e.code)}`);
  if (lost.length) sfx('use', { volume: 0.6 });
}

// the keys go to the settings, none to the game (the buttons and sliders still work as usual)
addEventListener('keydown', e => {
  if (!settingsOpen()) return;
  e.stopImmediatePropagation();
  if (waiting) { e.preventDefault(); if (!e.repeat) take(e); return; }
  if (e.code === 'Escape') { e.preventDefault(); closeSettings(); return; }
  // on the tabs: Left and Right go to the one before and after
  if (e.target?.closest?.('#settings-tabs') && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    const i = GROUPS.indexOf(tab) + (e.code === 'ArrowLeft' ? -1 : 1);
    showTab(GROUPS[(i + GROUPS.length) % GROUPS.length]);
    tabs.querySelector('.on')?.focus();
  }
}, true);

tabs.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});
keysBox.addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) wait(b.dataset.id, Number(b.dataset.slot));
});
$('settings-close').onclick = () => closeSettings();
overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeSettings(); });
$('settings-language').addEventListener('click', e => {
  const b = e.target.closest('[data-value]');
  if (b) chooseLanguage(b.dataset.value);
});
$('settings-fps').addEventListener('click', e => {
  const b = e.target.closest('[data-value]');
  if (b) setFrameRate(Number(b.dataset.value));
});
$('settings-camera').addEventListener('click', e => {
  const b = e.target.closest('[data-value]');
  if (b) setCameraMode(b.dataset.value);
});
$('settings-msaa').addEventListener('click', e => {
  const b = e.target.closest('[data-value]');
  if (b) setAntialias(Number(b.dataset.value));
});
// while dragged only the number follows: the panel growing under the pointer would move the slider away from it
$('settings-ui-scale').addEventListener('input', e => { $('settings-ui-level').textContent = `${e.target.value}%`; });
$('settings-ui-scale').addEventListener('change', e => setUiScale(e.target.value / 100));
$('settings-look-speed').addEventListener('input', e => setLookSpeed(e.target.value / 100));
$('settings-invert').onclick = () => setInvertLook(!invertLook());
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
  say(tr('All keys are back as they were at the start'));
};
