// Drum hits rendered once and played as samples. The synth (vendor/scrimshaw) builds every hit
// from scratch, and every node that runs is work for the audio thread: a hi-hat is six square
// oscillators, a noise source and three filters, and with hats, snares and toms going in
// sixteenths the drums were about a third of the music's work. A hit depends only on the drum
// and the velocity (the voice's volume, pan and reverb come after it, in the voice's channel),
// so each (drum, velocity) a song uses is rendered when the song starts, in an
// OfflineAudioContext (the browser renders it off the main thread), and then played as one
// buffer source into the same channel. Until a song's hits are in, the synth plays them live.
// Each hit gets VARIANTS takes (their noise differs), so a row of hats is not one sound
// repeated; the same take never plays twice in a row. Only the short hits: the long ones (a
// gong, thunder, a crash) ring for many seconds, which would take megabytes, and come seldom
// enough to cost little played live.
import { DRUM } from '../../vendor/scrimshaw/synth.js';

const VARIANTS = 3;
const LONG = 1.5;    // s: a hit at least this long is played live
const GAP = 0.05;    // s between takes in the render

const takes = new Map();   // `${inst}|${vel}` -> [AudioBuffer], null while rendering, 'live' for a long hit
const last = new Map();    // key -> the take played last
let rate = 0;              // the sample rate the takes are rendered at
let noise = null;          // seconds of white noise at that rate, for the hits' noise sources

const keyOf = (inst, vel) => `${inst}|${vel}`;

// what the drums need of the synth (synth.js S), on context c; onStop(t) hears when each source stops
function synthOn(c, onStop) {
  const watch = node => { const stop = node.stop.bind(node); node.stop = t => { onStop(t); stop(t); }; return node; };
  return {
    nyq: c.sampleRate / 2, noise, waves: {}, ks: {},
    ctx: {
      sampleRate: c.sampleRate,
      createGain: () => c.createGain(), createBiquadFilter: () => c.createBiquadFilter(),
      createOscillator: () => watch(c.createOscillator()), createBufferSource: () => watch(c.createBufferSource()),
    },
  };
}

// how long a hit sounds: built on `probe`, a context that is never rendered
function lengthOf(probe, inst, vel) {
  let end = 0;
  DRUM[inst].hit(synthOn(probe, t => { end = Math.max(end, t); }), probe.destination, 0, vel);
  return end;
}

// render the hits of `song` that are not in yet, at ctx's sample rate (a browser that cannot:
// the synth plays them all)
export function prepareDrums(ctx, song) {
  if (typeof OfflineAudioContext === 'undefined' || typeof AudioBuffer === 'undefined') return Promise.resolve();
  return render(ctx, song).catch(e => console.warn(`drum render: ${e.message}`));
}

async function render(ctx, song) {
  if (ctx.sampleRate !== rate) {
    takes.clear();
    noise = new AudioBuffer({ length: 3 * ctx.sampleRate, sampleRate: ctx.sampleRate });   // as long as the synth's
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    rate = ctx.sampleRate;
  }
  const probe = new OfflineAudioContext(1, 1, rate);
  const todo = [];   // { key, inst, vel, len, n }
  const seen = new Set();
  song.voices.forEach((v, vi) => {
    if (!v.drum || !DRUM[v.inst]) return;
    for (const tl of [song.intro, song.loop]) for (const e of tl.events) {
      const key = keyOf(v.inst, e.vel);
      if (e.v !== vi || seen.has(key) || takes.has(key)) continue;
      seen.add(key);
      const len = lengthOf(probe, v.inst, e.vel);
      if (len >= LONG) takes.set(key, 'live');
      else todo.push({ key, inst: v.inst, vel: e.vel, len, n: VARIANTS });
    }
  });
  if (!todo.length) return;
  for (const d of todo) takes.set(d.key, null);
  try {
    // every take of every hit one after the other in one render, each starting on a sample
    // frame (between two, Chrome renders the short attacks at half their energy: music.js play)
    const slot = d => Math.ceil((d.len + GAP) * rate);   // frames
    let frames = 0;
    for (const d of todo) { d.at = frames; frames += d.n * slot(d); }
    const c = new OfflineAudioContext(1, frames + 1, rate);
    for (const d of todo) for (let i = 0; i < d.n; i++)
      DRUM[d.inst].hit(synthOn(c, () => {}), c.destination, (d.at + i * slot(d)) / rate, d.vel);
    const data = (await c.startRendering()).getChannelData(0);
    for (const d of todo) {
      const list = [];
      for (let i = 0; i < d.n; i++) {
        const from = d.at + i * slot(d), clip = data.slice(from, from + Math.ceil(d.len * rate));
        let end = clip.length;
        while (end > 1 && Math.abs(clip[end - 1]) < 1e-4) end--;   // drop the silent tail
        const b = ctx.createBuffer(1, end, rate);
        b.copyToChannel(clip.subarray(0, end), 0);
        list.push(b);
      }
      takes.set(d.key, list);
    }
  } catch (e) {
    for (const d of todo) if (takes.get(d.key) === null) takes.delete(d.key);   // played live, tried again with the next song
    throw e;
  }
}

// play drum `inst` at `vel` into `out` at time t from its takes; false while they are not in
export function playDrum(ctx, inst, vel, out, t) {
  const key = keyOf(inst, vel), list = takes.get(key);
  if (!Array.isArray(list) || ctx.sampleRate !== rate) return false;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last.get(key)) i = (i + 1) % list.length;
  last.set(key, i);
  const src = ctx.createBufferSource();
  src.buffer = list[i];
  src.connect(out);
  src.start(t);
  return true;
}

// for checks and the dev tools: the hits rendered, and their samples in all
export function drumInfo() {
  let samples = 0, hits = 0;
  for (const list of takes.values()) if (Array.isArray(list)) { hits++; for (const b of list) samples += b.length; }
  return { hits, samples, rate };
}
