// Music: Scrimshaw scores (music/<name>.scrim, docs/music.md) played by the vendored Web Audio
// synth (vendor/scrimshaw). One song at a time: switching fades the old one out and starts
// the new one from the top. The mood (explore, treasure, sense, rise, fight, boss; picked by
// game/music.js) decides which voices play: joining ones come in on the next step (a
// sixteenth), picking up notes already under way, leaving ones fade out from the next beat.
// Off until turned on (game/settings.js keeps that: the settings menu, or M). Turned on, the
// song starts from the top. It plays into the music bus (context.js), with its own volume.
import { createSynth } from '../../vendor/scrimshaw/synth.js';
import { loadScore } from './score.js';
import { onAudioStart } from './context.js';

const VOLUME = 0.4;                         // the music sits under the sound effects
const LOOKAHEAD = 0.3, HIDDEN_LOOKAHEAD = 1.6;   // seconds scheduled ahead; timers slow down in hidden tabs
const FADE = 0.35;                          // time constant of a song or voice fading out
const GAP = 0.8;                            // seconds between one song fading and the next starting
const JOIN_MARGIN = 0.04;                   // s: a joining voice comes in on the first step after this
const MIN_HELD = 0.15;                      // s: a held note joined with less than this left stays out

let ctx = null, syn = null;
const scores = new Map();                   // name -> score once loaded (null if it failed)
let want = null, mood = 'explore';
let enabled = false;
let cur = null;                             // the song playing
let nextAt = 0;                             // the next song may start from here

onAudioStart((ac, sounds, output) => {
  ctx = ac;
  syn = createSynth(ctx, output);
  syn.out.gain.value = VOLUME;
  setInterval(tick, 25);
});

function fetchScore(name) {
  if (scores.has(name)) return;
  scores.set(name, undefined);
  fetch(new URL(`../../music/${name}.scrim`, import.meta.url))
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then(text => {
      const score = loadScore(text);
      if (score.errors.length) console.warn(`music/${name}.scrim:\n${score.errors.join('\n')}`);
      scores.set(name, { ...score, name });
    })
    .catch(e => { console.warn(`music/${name}.scrim: ${e.message}`); scores.set(name, null); });
}

// the song to play (null for silence); loads it on first use
export function playSong(name) {
  want = name;
  if (name) fetchScore(name);
}
export function setMood(name) {
  if (name === mood) return;
  mood = name;
  if (cur) retarget();
}

export const musicEnabled = () => enabled;
export function setMusicEnabled(on) { enabled = !!on; }

// for checks and the devtools console: what plays right now
export function musicInfo() {
  return {
    enabled, want, mood, playing: cur?.score.name ?? null, time: cur ? ctx.currentTime - cur.startAt : 0,
    voices: cur ? cur.score.song.voices.filter((_, i) => cur.voices[i].on).map(v => v.name) : [],
  };
}

function tick() {
  if (ctx.state !== 'running') return;
  const name = enabled ? want : null;
  if (cur && cur.score.name !== name) stopSong();
  const score = name && scores.get(name);
  if (!cur && score && ctx.currentTime >= nextAt) startSong(score);
  if (cur) schedule();
}

function startSong(score) {
  const { song, moods } = score;
  const sess = syn.session(song);
  syn.warm(song);
  const voices = sess.ch.map((c, i) => ({ gain: c.input.gain.value, on: moods[mood].has(i), at: 0 }));
  voices.forEach((vc, i) => { if (!vc.on) sess.ch[i].input.gain.value = 0; });
  const startAt = ctx.currentTime + 0.1;
  cur = { score, sess, voices, startAt, list: 'intro', i: 0, offset: 0, until: startAt };
}

function stopSong() {
  cur.sess.stop(FADE);
  cur = null;
  nextAt = ctx.currentTime + GAP;
}

// a voice joining plays from its switch time on, one leaving plays up to it
const audible = (vc, t) => (vc.on ? t >= vc.at : t < vc.at);

// the jukebox's scheduler: the intro once, then the loop forever
function schedule() {
  const { song } = cur.score;
  const horizon = ctx.currentTime + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  for (let guard = 0; guard < 5000; guard++) {
    const tl = cur.list === 'intro' ? song.intro : song.loop;
    if (cur.i >= tl.events.length) {
      if (cur.list === 'intro') { cur.list = 'loop'; cur.i = 0; cur.offset = song.intro.dur; continue; }
      const next = cur.offset + song.loop.dur;
      if (!song.loop.dur || cur.startAt + next > horizon) break;
      cur.i = 0; cur.offset = next;
      continue;
    }
    const ev = tl.events[cur.i], t = cur.startAt + cur.offset + ev.t;
    if (t > horizon) break;
    if (t >= ctx.currentTime - 0.03 && audible(cur.voices[ev.v], t)) cur.sess.play(ev, Math.max(t, ctx.currentTime + 0.005));
    cur.i++;
  }
  cur.until = Math.max(cur.until, horizon);
}

// the pass of the intro or the loop playing at time t, and when it started
function passAt(t) {
  const { song } = cur.score, st = t - cur.startAt;
  if (st < song.intro.dur || !song.loop.dur) return { tl: song.intro, base: cur.startAt };
  const n = Math.floor((st - song.intro.dur) / song.loop.dur);
  return { tl: song.loop, base: cur.startAt + song.intro.dur + n * song.loop.dur };
}

// the first step, beat or bar line at or after time t
function nextBoundary(t, unit) {
  const { tl, base } = passAt(t), st = t - base;
  const s = tl.sections.find(s => st < s.start + s.dur) ?? tl.sections.at(-1);
  if (!s) return t;
  const len = unit === 'bar' ? s.barDur : unit === 'beat' ? 60 / s.tempo : 60 / s.tempo / s.steps;
  return base + s.start + Math.max(0, Math.ceil((st - s.start) / len - 1e-6)) * len;
}

// play voice i's notes from time `at` up to what the scheduler has done (cur.until), which
// passed them over while the voice was out; with held, also the rest of notes sounding at `at`.
// Notes never cross from one pass into the next, so the passes at both ends cover it all.
function catchUp(i, at, held) {
  const passes = [passAt(at)], last = passAt(Math.max(at, cur.until - 1e-6));
  if (last.base !== passes[0].base) passes.push(last);
  const drum = cur.score.song.voices[i].drum;
  for (const { tl, base } of passes) for (const ev of tl.events) {
    if (ev.v !== i) continue;
    const t = base + ev.t, end = t + ev.d;
    if (t >= cur.until) break;
    if (t >= at) cur.sess.play(ev, t);
    else if (held && !drum && end - at >= MIN_HELD) cur.sess.play({ ...ev, d: end - at, g: undefined }, at);
  }
}

// fade voices in or out for the new mood: joining ones on the next step, leaving ones from
// the next beat (the fade takes a moment, so they don't cut off mid-note)
function retarget() {
  const now = ctx.currentTime;
  const step = nextBoundary(now + JOIN_MARGIN, 'step'), beat = nextBoundary(now + JOIN_MARGIN, 'beat');
  const playing = cur.score.moods[mood];
  cur.voices.forEach((vc, i) => {
    const on = playing.has(i);
    if (on === vc.on) return;
    const g = cur.sess.ch[i].input.gain;
    g.cancelScheduledValues(now);
    if (vc.at > now) {
      // the last change has not happened yet: dropping it is enough, except that a voice
      // that was about to leave missed its notes after that point
      if (on) catchUp(i, vc.at, false);
      vc.on = on; vc.at = 0; return;
    }
    vc.on = on; vc.at = on ? step : beat;
    g.setTargetAtTime(on ? vc.gain : 0, vc.at, on ? 0.01 : FADE);
    if (on) catchUp(i, step, true);
  });
}
