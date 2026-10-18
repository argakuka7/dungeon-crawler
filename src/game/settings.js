// The settings (the settings menu, game/settingsmenu.js, changes them): the frame rate cap
// (main.js) and the anti-aliasing (render/msaa.js), the music on or off, the music's and the sounds' volume, and the keys
// (core/keybinds.js). Kept in localStorage
// (crawler.settings) as soon as they change, for every hero alike; the keys only as far as they
// differ from the defaults. The music setting of before (crawler.music) is taken over once.
import { resolveBindings, overrides, assignKey, clearKey, actionsFor, defaultBindings, keyName, BAR_ACTIONS } from '../core/keybinds.js';
import { setMusicEnabled } from '../audio/music.js';
import { setVolume } from '../audio/context.js';

const KEY = 'crawler.settings', OLD_MUSIC = 'crawler.music';
const listeners = new Set();

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return s;
    return { music: localStorage.getItem(OLD_MUSIC) === '1' };
  } catch { return {}; }
}
const volume = v => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
export const FRAME_RATES = [30, 60, 0];       // frames a second at most; 0: as many as the screen shows
export const ANTIALIAS = [0, 2, 4, 8];        // MSAA samples; 0: off (the GPU may offer fewer, render/msaa.js)
// 2x MSAA by default: on a high-DPI screen it looks like 4x for less of the GPU's work (and when
// the GPU cannot keep up, render/resolution.js drops it further before the resolution)
const DEFAULT_FPS = 60, DEFAULT_MSAA = 2;
const oneOf = (list, v, fallback) => (list.includes(v) ? v : fallback);
const stored = read();
const settings = {
  fps: oneOf(FRAME_RATES, stored.fps, DEFAULT_FPS), msaa: oneOf(ANTIALIAS, stored.msaa, DEFAULT_MSAA),
  music: stored.music === true,
  musicVolume: volume(stored.musicVolume), soundVolume: volume(stored.soundVolume),
  keys: resolveBindings(stored.keys),
};

function changed() {
  setMusicEnabled(settings.music);
  setVolume('music', settings.musicVolume);
  setVolume('sounds', settings.soundVolume);
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, fps: settings.fps, msaa: settings.msaa, music: settings.music, musicVolume: settings.musicVolume,
      soundVolume: settings.soundVolume, keys: overrides(settings.keys) }));
  } catch { /* private mode: for this page only */ }
  for (const fn of listeners) fn();
}
// fn() after any change (the keys shown in the help, the quick bar ...)
export function onSettingsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
setMusicEnabled(settings.music);
setVolume('music', settings.musicVolume);
setVolume('sounds', settings.soundVolume);

// --- graphics ----------------------------------------------------------------------------------

export const frameRate = () => settings.fps;
export function setFrameRate(fps) { settings.fps = oneOf(FRAME_RATES, fps, DEFAULT_FPS); changed(); }
export const antialias = () => settings.msaa;
export function setAntialias(samples) { settings.msaa = oneOf(ANTIALIAS, samples, DEFAULT_MSAA); changed(); }

// --- sound --------------------------------------------------------------------------------------

export const musicOn = () => settings.music;
export function setMusic(on) { settings.music = !!on; changed(); return settings.music; }
export const toggleMusic = () => setMusic(!settings.music);
export const musicVolume = () => settings.musicVolume;
export const soundVolume = () => settings.soundVolume;
export function setMusicVolume(v) { settings.musicVolume = volume(v); changed(); }
export function setSoundVolume(v) { settings.soundVolume = volume(v); changed(); }

// --- keys ---------------------------------------------------------------------------------------

export const bindings = () => settings.keys;
export const keysOf = id => settings.keys[id] ?? [null, null];
// give the key to the action's slot; returns what lost it ([{ id, key }])
export function bindKey(id, slot, key, typed = null) {
  const { bindings: next, lost } = assignKey(settings.keys, id, slot, key, typed);
  settings.keys = next; changed();
  return lost;
}
export function unbindKey(id, slot) { settings.keys = clearKey(settings.keys, id, slot); changed(); }
export function resetKeys() { settings.keys = defaultBindings(); changed(); }

// the actions a key event is for
export const actionsOf = e => actionsFor(settings.keys, e.code, e.key);
export const isFor = (e, id) => actionsOf(e).includes(id);

// --- names --------------------------------------------------------------------------------------

// the keyboard's own characters (Chrome, Edge): a German keyboard's KeyZ shows as Y
let layout = null;
navigator.keyboard?.getLayoutMap?.().then(m => { layout = m; for (const fn of listeners) fn(); }, () => {});
export const nameOf = key => keyName(key, layout);
// the action's keys to show: both ('F / Right Ctrl'), or only the primary; '' with none
export function keyLabel(id, { both = true } = {}) {
  const ks = keysOf(id).filter(k => k !== null);
  return (both ? ks : ks.slice(0, 1)).map(nameOf).join(' / ');
}
// the quick bar's keys, in a few characters: '1-6', else each one's ('Z X C V B N')
export function barKeysText() {
  const names = BAR_ACTIONS.map(id => keyLabel(id, { both: false }) || '\u2014');
  return names.join('') === '123456' ? '1-6' : names.join(' ');
}
