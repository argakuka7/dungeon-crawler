// The one AudioContext shared by sound effects (sfx.js, footsteps.js, loops.js) and music
// (music.js). Browsers only let audio start after a user gesture, so it is made on the first key
// or click. Two buses, each with its own volume (the settings, game/settings.js): the sounds
// and the music.
let ctx = null, sounds = null, music = null;
const starters = [];
const level = { sounds: 1, music: 1 };
// a volume (0-1, as the slider shows it) as a gain: loudness follows the square more evenly
const gainOf = v => v * v;

function start() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    sounds = ctx.createGain(); music = ctx.createGain();
    sounds.gain.value = gainOf(level.sounds); music.gain.value = gainOf(level.music);
    sounds.connect(ctx.destination); music.connect(ctx.destination);
    for (const fn of starters) fn(ctx, sounds, music);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
addEventListener('pointerdown', start, true);
addEventListener('keydown', start, true);

// fn(ctx, sounds, music) runs once the context exists (right away if it already does): the
// buses to play the sound effects and the music into
export function onAudioStart(fn) {
  starters.push(fn);
  if (ctx) fn(ctx, sounds, music);
}

// bus: 'sounds' or 'music'; v: 0 (silent) to 1 (full)
export function setVolume(bus, v) {
  level[bus] = v;
  const g = bus === 'music' ? music : sounds;
  if (g) g.gain.setTargetAtTime(gainOf(v), ctx.currentTime, 0.02);
}
