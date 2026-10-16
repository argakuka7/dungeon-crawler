// Generated sound effects (Web Audio, no sample files): a sword whoosh, a bow's draw and twang,
// a crossbow's shot and reload, a spell's cast and burst, shots striking walls, hits, kills,
// getting hurt, pickups, thrown fireballs / punches / ice balls and burning, lasers, storms, lightning and thunder, the player's body (jumps,
// falls, knock-downs, fluid deaths), travel, items and the bag, and the enemies' voices
// (voices.js). Footsteps are footsteps.js, the continuous sounds loops.js. The audio context
// lives in context.js.
import * as THREE from 'three';
import { camera } from '../render/scene.js';
import { onAudioStart } from './context.js';
import { voices } from './voices.js';

const NOISE = 3;   // seconds of noise: a layer may last up to NOISE - 0.5 s

let ctx = null, master = null, noiseBuf = null;
const last = {};
let combo = 0, comboAt = 0;

onAudioStart((ac, output) => {
  ctx = ac;
  master = ctx.createGain(); master.gain.value = 0.45;
  // a gentle limiter, so many hits at once do not clip
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 6;
  master.connect(comp).connect(output);
  noiseBuf = ctx.createBuffer(1, NOISE * ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
});

// building blocks: a gain envelope, noise and pitch-swept oscillators
// learn: sound.html#coin-code (see learn/README.md)
function amp(t, attack, peak, decay, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}
function noise(t, dur, into) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.connect(into);
  s.start(t, Math.random() * 0.5, dur + 0.05);
}
function filter(type, freq, q, into) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(into);
  return f;
}
function tone(type, f0, f1, t, dur, into) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(into); o.start(t); o.stop(t + dur + 0.05);
}

const SOUNDS = {
  swing(t, out, p) {   // band-passed noise sweeping up and back down
    const f = filter('bandpass', 500 * p, 0.9, amp(t, 0.04, 1.3, 0.17, out));
    f.frequency.setValueAtTime(500 * p, t);
    f.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.07);
    f.frequency.exponentialRampToValueAtTime(800 * p, t + 0.21);
    noise(t, 0.24, f);
  },
  draw(t, out, p) {    // a bow being drawn: a creak of wood and a string stretching
    tone('sawtooth', 110 * p, 150 * p, t, 0.22, filter('bandpass', 700 * p, 6, amp(t, 0.06, 0.12, 0.18, out)));
    noise(t, 0.2, filter('bandpass', 2400 * p, 4, amp(t, 0.08, 0.1, 0.12, out)));
  },
  twang(t, out, p) {   // a bowstring let go: a plucked low note and the arrow's hiss leaving
    tone('triangle', 196 * p, 180 * p, t, 0.25, amp(t, 0.001, 0.55, 0.25, out));
    tone('sine', 392 * p, 370 * p, t, 0.15, amp(t, 0.001, 0.2, 0.15, out));
    sweep(t + 0.01, 0.18, 3000 * p, 4200 * p, 1800 * p, 1.5, 0.35, out, 0.01);
  },
  crossbow(t, out, p) {   // a crossbow shot: the nut's click, a heavy snap of the prod, the bolt's hiss
    tone('square', 2400 * p, 1800 * p, t, 0.015, amp(t, 0.001, 0.15, 0.015, out));
    tone('sine', 150 * p, 70 * p, t + 0.01, 0.14, amp(t + 0.01, 0.001, 0.8, 0.14, out));
    noise(t + 0.01, 0.06, filter('bandpass', 900 * p, 1.5, amp(t + 0.01, 0.001, 0.6, 0.06, out)));
    sweep(t + 0.02, 0.14, 3500 * p, 5000 * p, 2200 * p, 1.5, 0.3, out, 0.01);
  },
  reload(t, out, p) {     // the string drawn back to the nut and a bolt laid in: a ratchet and a click
    for (let i = 0; i < 4; i++)
      tone('square', 1500 * p, 1300 * p, t + i * 0.05, 0.012, filter('bandpass', 1800, 3, amp(t + i * 0.05, 0.001, 0.12, 0.012, out)));
    tone('triangle', 900 * p, 700 * p, t + 0.24, 0.05, amp(t + 0.24, 0.001, 0.3, 0.05, out));
    noise(t + 0.24, 0.04, filter('lowpass', 1500, 0.7, amp(t + 0.24, 0.001, 0.25, 0.04, out)));
  },
  spell(t, out, p) {      // a spell leaving the staff: a rising shimmer over a soft whoosh
    sweep(t, 0.3, 400 * p, 1800 * p, 900 * p, 1.2, 0.45, out, 0.04);
    for (const [i, hz] of [660, 880, 1320].entries())
      tone('sine', hz * p, hz * p * 1.5, t + i * 0.03, 0.25, amp(t + i * 0.03, 0.01, 0.12, 0.25, out));
  },
  thunk(t, out, p) {      // an arrow or bolt striking wood or stone: a short knock and a rattle
    tone('sine', 300 * p, 120 * p, t, 0.06, amp(t, 0.001, 0.6, 0.06, out));
    noise(t, 0.05, filter('bandpass', 1800 * p, 2, amp(t, 0.001, 0.4, 0.05, out)));
    tone('triangle', 420 * p, 380 * p, t + 0.01, 0.12, amp(t + 0.01, 0.002, 0.12, 0.12, out));
  },
  burst(t, out, p) {      // a spell bursting: a bright pop that fizzes out
    tone('sine', 520 * p, 130 * p, t, 0.18, amp(t, 0.002, 0.6, 0.18, out));
    noise(t, 0.3, filter('bandpass', 2600 * p, 0.8, amp(t, 0.004, 0.45, 0.28, out)));
    for (const [i, hz] of [1568, 2093, 2637].entries())
      tone('sine', hz * p, hz * p * 0.9, t + 0.02 + i * 0.03, 0.2, amp(t + 0.02 + i * 0.03, 0.002, 0.07, 0.2, out));
  },
  hit(t, out, p) {     // a thump, a body of noise and a bright crack
    tone('sine', 180 * p, 50 * p, t, 0.12, amp(t, 0.002, 0.8, 0.12, out));
    noise(t, 0.1, filter('lowpass', 2200 * p, 0.7, amp(t, 0.002, 0.7, 0.08, out)));
    noise(t, 0.04, filter('highpass', 3500, 0.7, amp(t, 0.001, 0.3, 0.03, out)));
  },
  kill(t, out, p) {    // deeper and longer, with a crunch
    tone('sine', 120 * p, 32 * p, t, 0.35, amp(t, 0.002, 1, 0.35, out));
    noise(t, 0.32, filter('lowpass', 900 * p, 0.7, amp(t, 0.003, 0.8, 0.3, out)));
    noise(t, 0.2, filter('bandpass', 320 * p, 3, amp(t, 0.002, 0.7, 0.18, out)));
    noise(t, 0.05, filter('highpass', 3000, 0.7, amp(t, 0.001, 0.35, 0.04, out)));
  },
  hurt(t, out, p) {    // a dull grunt-like buzz over a thud
    tone('sawtooth', 260 * p, 120 * p, t, 0.18, filter('lowpass', 1000, 1, amp(t, 0.005, 0.3, 0.18, out)));
    tone('sine', 90 * p, 50 * p, t, 0.15, amp(t, 0.003, 0.7, 0.15, out));
    noise(t, 0.08, filter('lowpass', 700, 0.7, amp(t, 0.002, 0.4, 0.07, out)));
  },
  unlock(t, out, p) {   // rising chord: the red seal breaks
    for (const [i, hz] of [440, 554, 660, 880].entries()) {
      const at = t + i * .07;
      tone('triangle', hz * p, hz * p, at, .35, amp(at, .005, .25, .35, out));
    }
  },
  // learn: sound.html#coin-code (see learn/README.md)
  coin(t, out, p) {    // two quick bright notes; rapid pickups climb in pitch
    tone('triangle', 1568 * p, 1568 * p, t, 0.08, amp(t, 0.002, 0.32, 0.07, out));
    tone('triangle', 2093 * p, 2093 * p, t + 0.055, 0.2, amp(t + 0.055, 0.002, 0.3, 0.18, out));
  },
  fireball(t, out, p) {   // a breathy roar: low-passed noise swelling, with a low rumble
    const f = filter('lowpass', 600 * p, 1, amp(t, 0.06, 1, 0.35, out));
    f.frequency.setValueAtTime(400 * p, t); f.frequency.exponentialRampToValueAtTime(1800 * p, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(500 * p, t + 0.4);
    noise(t, 0.42, f);
    tone('sawtooth', 90 * p, 55 * p, t, 0.3, filter('lowpass', 300, 1, amp(t, 0.03, 0.35, 0.28, out)));
  },
  whump(t, out, p) {      // a fireball bursting: a soft thud and crackle
    tone('sine', 140 * p, 45 * p, t, 0.2, amp(t, 0.003, 0.8, 0.2, out));
    noise(t, 0.3, filter('bandpass', 1400 * p, 0.6, amp(t, 0.005, 0.6, 0.28, out)));
  },
  sizzle(t, out, p) {     // burning: hissing high noise
    noise(t, 0.22, filter('highpass', 3000 * p, 0.7, amp(t, 0.01, 0.35, 0.2, out)));
  },
  zap(t, out, p) {        // the Triangle's punch: a falling buzzy chirp
    tone('square', 900 * p, 160 * p, t, 0.22, filter('lowpass', 2400, 2, amp(t, 0.004, 0.25, 0.22, out)));
    tone('sine', 300 * p, 90 * p, t, 0.18, amp(t, 0.004, 0.5, 0.18, out));
  },
  shatter(t, out, p) {    // the punch landing: a glassy ping over a thump
    tone('triangle', 1760 * p, 1320 * p, t, 0.25, amp(t, 0.002, 0.25, 0.25, out));
    tone('sine', 160 * p, 60 * p, t, 0.15, amp(t, 0.002, 0.7, 0.15, out));
    noise(t, 0.08, filter('highpass', 2500, 0.7, amp(t, 0.001, 0.35, 0.07, out)));
  },
  frost(t, out, p) {      // an ice ball thrown: an airy whoosh with a cold, glassy shimmer on top
    const f = filter('bandpass', 900 * p, 1.2, amp(t, 0.04, 0.7, 0.3, out));
    f.frequency.setValueAtTime(700 * p, t); f.frequency.exponentialRampToValueAtTime(3200 * p, t + 0.25);
    noise(t, 0.34, f);
    for (const [i, hz] of [2637, 3520, 3136].entries()) {
      const at = t + 0.03 + i * 0.04;
      tone('sine', hz * p, hz * p * 0.98, at, 0.25, amp(at, 0.003, 0.08, 0.25, out));
    }
  },
  icecrack(t, out, p) {   // an ice ball bursting: a sharp crack, a thump and tinkling shards
    noise(t, 0.06, filter('highpass', 3500 * p, 0.8, amp(t, 0.001, 0.6, 0.06, out)));
    tone('sine', 180 * p, 70 * p, t, 0.12, amp(t, 0.002, 0.55, 0.12, out));
    for (let i = 0; i < 5; i++) {
      const at = t + 0.03 + i * 0.035 * (0.7 + Math.random() * 0.6), hz = (2200 + Math.random() * 2600) * p;
      tone('triangle', hz, hz * 0.97, at, 0.12, amp(at, 0.002, 0.12, 0.12, out));
    }
  },
  laser(t, out, p) {      // the Spicy's laser: a buzzing hum rising to a whine for its 0.6 s
    tone('sawtooth', 110 * p, 220 * p, t, 0.62, filter('bandpass', 900 * p, 2, amp(t, 0.04, 0.3, 0.58, out)));
    tone('square', 1650 * p, 2600 * p, t, 0.62, filter('lowpass', 3500, 1, amp(t, 0.08, 0.05, 0.54, out)));
    for (let i = 0; i < 6; i++) {   // and it crackles
      const at = t + 0.05 + i * 0.09 * (0.7 + Math.random() * 0.6);
      noise(at, 0.02, filter('highpass', 4000 * p, 1, amp(at, 0.001, 0.2, 0.02, out)));
    }
  },
  zapburst(t, out, p) {   // the laser bursting: a sharp electric pop, a falling zap and a thump
    noise(t, 0.12, filter('highpass', 2500 * p, 0.7, amp(t, 0.001, 0.7, 0.12, out)));
    tone('square', 1800 * p, 180 * p, t, 0.22, filter('lowpass', 3000, 1, amp(t, 0.002, 0.2, 0.22, out)));
    tone('sine', 190 * p, 50 * p, t, 0.25, amp(t, 0.002, 0.75, 0.25, out));
  },
  portal(t, out, p) {     // the town portal opening or taking you: a rising shimmer over a soft rush
    const f = filter('bandpass', 300 * p, 1.2, amp(t, 0.15, 0.6, 0.6, out));
    f.frequency.setValueAtTime(300 * p, t); f.frequency.exponentialRampToValueAtTime(2400 * p, t + 0.6);
    noise(t, 0.75, f);
    for (const [i, hz] of [523, 659, 784, 1047].entries()) {
      const at = t + i * 0.08;
      tone('sine', hz * p, hz * p * 1.02, at, 0.5, amp(at, 0.01, 0.12, 0.5, out));
    }
  },
  pickup(t, out, p) {
    tone('sine', 660 * p, 990 * p, t, 0.1, amp(t, 0.004, 0.3, 0.1, out));
  },
  drop(t, out, p) {      // a good weapon landing: a soft clink and a shimmering rising chime
    tone('triangle', 1200 * p, 900 * p, t, 0.06, amp(t, 0.001, 0.25, 0.06, out));
    for (const [i, hz] of [784, 988, 1175, 1568].entries()) {
      const at = t + 0.05 + i * 0.06;
      tone('sine', hz * p, hz * p * 1.005, at, 0.5, amp(at, 0.004, 0.16, 0.5, out));
    }
  },
  clink(t, out, p) {     // any other item landing: a small dull clink
    tone('triangle', 1400 * p, 1150 * p, t, 0.06, amp(t, 0.001, 0.2, 0.06, out));
    tone('sine', 2100 * p, 2000 * p, t + 0.01, 0.05, amp(t + 0.01, 0.001, 0.08, 0.05, out));
    noise(t, 0.03, filter('lowpass', 1200, 0.7, amp(t, 0.001, 0.15, 0.03, out)));
  },
  toss(t, out, p) {      // dropping an item from the bag: a little whoosh, then it lands
    sweep(t, 0.16, 500 * p, 1600 * p, 700 * p, 1.2, 0.35, out);
    tone('sine', 160 * p, 70 * p, t + 0.17, 0.08, amp(t + 0.17, 0.002, 0.4, 0.08, out));
  },

  // --- the player's body --------------------------------------------------------------------
  levelUp(t, out, p) {   // a bright rising arpeggio over a swelling sparkle
    for (const [i, hz] of [523, 659, 784, 1047, 1319].entries()) {
      const at = t + i * 0.07, last = i === 4;
      tone('triangle', hz * p, hz * p, at, last ? 0.9 : 0.35, amp(at, 0.005, 0.22, last ? 0.9 : 0.35, out));
      tone('sine', hz * 2 * p, hz * 2 * p, at, 0.3, amp(at, 0.005, 0.06, 0.3, out));
    }
    sweep(t, 0.9, 1000 * p, 6000 * p, 3000 * p, 1.5, 0.18, out, 0.3);
  },
  jump(t, out, p) {      // a short upward whoosh off a light scuff
    sweep(t, 0.14, 400 * p, 1500 * p, 900 * p, 1, 0.6, out, 0.02);
    noise(t, 0.04, filter('lowpass', 900, 0.7, amp(t, 0.002, 0.4, 0.035, out)));
  },
  knock(t, out, p) {     // knocked over: a whoosh and a grunt
    sweep(t, 0.3, 300 * p, 1200 * p, 300 * p, 1, 0.5, out, 0.05);
    tone('sawtooth', 220 * p, 110 * p, t, 0.15, filter('lowpass', 900, 1, amp(t, 0.005, 0.25, 0.15, out)));
  },
  thud(t, out, p) {      // the body hitting the ground (volume: how hard)
    tone('sine', 110 * p, 45 * p, t, 0.15, amp(t, 0.002, 0.9, 0.15, out));
    noise(t, 0.1, filter('lowpass', 600 * p, 0.7, amp(t, 0.002, 0.6, 0.09, out)));
  },
  getUp(t, out, p) {     // getting up: two soft rustles of cloth
    for (const at of [t, t + 0.22]) noise(at, 0.12, filter('bandpass', 1300 * p, 0.9, amp(at, 0.03, 0.4, 0.1, out)));
  },
  dizzy(t, out, p) {     // seeing stars after a hard landing: little twinkles going round
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.11, hz = [1568, 1976, 1760][i % 3] * p;
      tone('sine', hz, hz * 1.03, at, 0.12, amp(at, 0.004, 0.18, 0.12, out));
    }
  },
  fall(t, out, p) {      // a long fall: a whistle dropping away over rushing air
    tone('sine', 1400 * p, 300 * p, t, 1.3, amp(t, 0.15, 0.08, 1.15, out));
    sweep(t, 1.4, 2000 * p, 2200 * p, 500 * p, 0.8, 0.25, out, 0.3);
  },
  splash(t, out, p) {    // into the water: a big splash and gloops of air going up
    tone('sine', 120 * p, 50 * p, t, 0.2, amp(t, 0.002, 0.6, 0.2, out));
    sweep(t, 0.7, 4000 * p, 1500 * p, 400 * p, 0.6, 0.8, out, 0.005, 'lowpass');
    for (let i = 0; i < 7; i++) {
      const at = t + 0.2 + i * 0.12 + Math.random() * 0.06, hz = (300 + Math.random() * 300) * p;
      tone('sine', hz, hz * 2.2, at, 0.05, amp(at, 0.003, 0.18 * (1 - i / 9), 0.05, out));
    }
  },
  burn(t, out, p) {      // into the lava: a roaring whoomph and a long sizzle
    sweep(t, 0.8, 300 * p, 1500 * p, 250 * p, 1, 0.9, out, 0.04, 'lowpass');
    tone('sawtooth', 55 * p, 40 * p, t, 0.7, filter('lowpass', 200, 1, amp(t, 0.03, 0.5, 0.65, out)));
    noise(t + 0.1, 1.1, filter('highpass', 4000 * p, 0.7, amp(t + 0.1, 0.1, 0.35, 1, out)));
  },
  dissolve(t, out, p) {  // into the acid: fizzing, then sinking gloops
    for (let i = 0; i < 26; i++) {
      const at = t + Math.random() * 1.1;
      noise(at, 0.02, filter('bandpass', (2500 + Math.random() * 4000) * p, 4, amp(at, 0.001, 0.25, 0.015, out)));
    }
    noise(t, 1.1, filter('highpass', 3000 * p, 0.7, amp(t, 0.05, 0.25, 1, out)));
    for (let i = 0; i < 4; i++) {
      const at = t + 0.3 + i * 0.2, hz = (500 - i * 80) * p;
      tone('sine', hz, hz * 0.6, at, 0.08, amp(at, 0.003, 0.15, 0.08, out));
    }
  },
  death(t, out, p) {     // a low, falling tone; then a soft shimmer: back at the entry
    tone('sawtooth', 330 * p, 80 * p, t, 0.6, filter('lowpass', 900, 1, amp(t, 0.01, 0.3, 0.6, out)));
    tone('sine', 165 * p, 40 * p, t, 0.6, amp(t, 0.01, 0.4, 0.6, out));
    for (const [i, hz] of [523, 784, 1047].entries()) {
      const at = t + 0.6 + i * 0.06;
      tone('sine', hz * p, hz * p, at, 0.6, amp(at, 0.05, 0.1, 0.55, out));
    }
  },

  // --- travel ---------------------------------------------------------------------------------
  gate(t, out, p) {      // through a side portal: an airy whoosh with a soft shimmer
    sweep(t, 0.6, 600 * p, 2400 * p, 900 * p, 1, 0.45, out, 0.1);
    tone('sine', 880 * p, 1320 * p, t, 0.5, amp(t, 0.1, 0.07, 0.4, out));
  },
  wellDown(t, out, p) {  // down the well: a swirl sinking away
    sweep(t, 1, 2000 * p, 1200 * p, 250 * p, 1.4, 0.45, out, 0.08);
    tone('triangle', 660 * p, 180 * p, t, 0.9, amp(t, 0.05, 0.12, 0.85, out));
  },
  ringUp(t, out, p) {    // up through the ring: a swirl rising, with sparkles
    sweep(t, 1, 300 * p, 1200 * p, 2600 * p, 1.4, 0.4, out, 0.15);
    tone('triangle', 330 * p, 990 * p, t, 0.9, amp(t, 0.1, 0.12, 0.8, out));
    for (let i = 0; i < 5; i++) {
      const at = t + 0.3 + i * 0.1, hz = (1568 + i * 220) * p;
      tone('sine', hz, hz, at, 0.15, amp(at, 0.004, 0.06, 0.15, out));
    }
  },
  door(t, out, p) {      // a house door: a short wooden creak, then the latch clunks shut
    const f = filter('bandpass', 520 * p, 6, amp(t, 0.04, 0.35, 0.26, out));
    f.frequency.setValueAtTime(520 * p, t); f.frequency.exponentialRampToValueAtTime(980 * p, t + 0.25);
    noise(t, 0.3, f);
    tone('sawtooth', 190 * p, 240 * p, t, 0.25, filter('bandpass', 900, 4, amp(t, 0.03, 0.08, 0.22, out)));
    tone('sine', 120 * p, 60 * p, t + 0.3, 0.12, amp(t + 0.3, 0.002, 0.7, 0.12, out));
    noise(t + 0.3, 0.06, filter('lowpass', 1200, 0.7, amp(t + 0.3, 0.002, 0.45, 0.06, out)));
  },
  thunder(t, out, p) {   // the Wolla's little storm cloud: a sharp crack and a rolling rumble
    noise(t, 0.08, filter('highpass', 2200 * p, 0.7, amp(t, 0.001, 0.55, 0.08, out)));
    noise(t + 0.02, 0.12, filter('bandpass', 900 * p, 1, amp(t + 0.02, 0.003, 0.4, 0.12, out)));
    const rumble = filter('lowpass', 260 * p, 1.5, amp(t + 0.04, 0.06, 0.9, 1.1, out));
    rumble.frequency.setValueAtTime(420 * p, t + 0.04); rumble.frequency.exponentialRampToValueAtTime(110 * p, t + 1.1);
    noise(t + 0.04, 1.15, rumble);
    tone('sine', 70 * p, 38 * p, t + 0.03, 0.7, amp(t + 0.03, 0.02, 0.4, 0.65, out));
  },
  charge(t, out, p) {    // the Wolk's lightning gathering for its 0.8 s: a hum and static, crackling ever faster
    tone('sawtooth', 70 * p, 150 * p, t, 0.82, filter('lowpass', 650 * p, 3, amp(t, 0.3, 0.2, 0.5, out)));
    sweep(t, 0.8, 2500 * p, 4200 * p, 7500 * p, 1.5, 0.1, out, 0.45, 'highpass');
    for (let i = 0; i < 14; i++) {
      const u = i / 14, at = t + 0.78 * Math.sqrt(u);
      noise(at, 0.015, filter('highpass', 3500 * p, 1, amp(at, 0.001, 0.1 + 0.25 * u, 0.015, out)));
    }
  },
  lightning(t, out, p) { // the Wolk's bolt striking: a blinding crack, a sizzle and a thump
    noise(t, 0.05, filter('highpass', 3000 * p, 0.7, amp(t, 0.0005, 0.9, 0.05, out)));
    noise(t + 0.01, 0.25, filter('bandpass', 1800 * p, 0.8, amp(t + 0.01, 0.002, 0.45, 0.25, out)));
    tone('square', 2400 * p, 120 * p, t, 0.2, filter('lowpass', 4000, 1, amp(t, 0.001, 0.16, 0.2, out)));
    tone('sine', 140 * p, 40 * p, t, 0.3, amp(t, 0.002, 0.8, 0.3, out));
  },
  rumble(t, out, p) {    // the thunder after the Wolk's bolt: a low roll that swells twice and dies away
    const roll = filter('lowpass', 300 * p, 1.2, amp(t, 0.12, 0.9, 1.7, out));
    roll.frequency.setValueAtTime(520 * p, t); roll.frequency.exponentialRampToValueAtTime(90 * p, t + 1.85);
    noise(t, 1.9, roll);
    noise(t + 0.45, 0.9, filter('lowpass', 220 * p, 1, amp(t + 0.45, 0.15, 0.6, 0.75, out)));
    tone('sine', 55 * p, 32 * p, t, 1.4, amp(t, 0.1, 0.45, 1.3, out));
  },
  gust(t, out, p) {      // the Wolla blowing: a roaring wind that swells and howls away
    sweep(t, 0.65, 300 * p, 1100 * p, 450 * p, 1.2, 0.75, out, 0.05);
    sweep(t + 0.05, 0.55, 1400 * p, 2600 * p, 900 * p, 6, 0.12, out, 0.08);   // the howl
    noise(t, 0.6, filter('lowpass', 180 * p, 1, amp(t, 0.04, 0.5, 0.55, out)));
  },
  cloud(t, out, p) {     // the cloud bridge puffing out of the gate
    noise(t, 0.6, filter('lowpass', 900 * p, 0.7, amp(t, 0.08, 0.45, 0.5, out)));
  },
  castStart(t, out, p) { // reading the scroll: a soft two-note chime
    for (const [i, hz] of [523, 784].entries()) {
      const at = t + i * 0.08;
      tone('sine', hz * p, hz * p, at, 0.35, amp(at, 0.005, 0.15, 0.35, out));
    }
  },
  fizzle(t, out, p) {    // a cast or charge broken off: a crackle falling away
    sweep(t, 0.3, 1500 * p, 900 * p, 300 * p, 2, 0.35, out, 0.005);
    tone('sine', 660 * p, 330 * p, t, 0.25, amp(t, 0.005, 0.12, 0.25, out));
  },

  // --- items and the bag ----------------------------------------------------------------------
  equip(t, out, p) {     // a blade in hand: a metallic shing
    sweep(t, 0.18, 3000 * p, 8000 * p, 6000 * p, 1.5, 0.25, out, 0.01, 'highpass');
    tone('triangle', 1760 * p, 1760 * p, t + 0.03, 0.35, amp(t + 0.03, 0.002, 0.12, 0.35, out));
    tone('sine', 2637 * p, 2637 * p, t + 0.03, 0.25, amp(t + 0.03, 0.002, 0.06, 0.25, out));
  },
  bagOpen(t, out, p) {   // leather flap and a rummage, rising
    noise(t, 0.08, filter('bandpass', 900 * p, 1, amp(t, 0.01, 0.6, 0.07, out)));
    noise(t + 0.07, 0.1, filter('bandpass', 1500 * p, 1, amp(t + 0.07, 0.01, 0.45, 0.09, out)));
  },
  bagClose(t, out, p) {  // and back down, with a soft thump
    noise(t, 0.08, filter('bandpass', 1300 * p, 1, amp(t, 0.01, 0.2, 0.07, out)));
    tone('sine', 140 * p, 80 * p, t + 0.06, 0.06, amp(t + 0.06, 0.002, 0.3, 0.06, out));
  },
  use(t, out, p) {       // using a quick bar slot: a soft pop
    tone('sine', 900 * p, 600 * p, t, 0.05, amp(t, 0.002, 0.2, 0.05, out));
  },
  drink(t, out, p) {     // a potion: three gulps, then a warm rising glow
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.13, hz = (260 + i * 30) * p;
      tone('sine', hz, hz * 0.55, at, 0.09, amp(at, 0.004, 0.35, 0.09, out));
      noise(at, 0.05, filter('lowpass', 700 * p, 1, amp(at, 0.003, 0.15, 0.05, out)));
    }
    for (const [i, hz] of [392, 523, 659].entries()) {
      const at = t + 0.38 + i * 0.05;
      tone('sine', hz * p, hz * p * 1.01, at, 0.45, amp(at, 0.03, 0.07, 0.42, out));
    }
  },
  buff(t, out, p) {      // a potion's power taking hold after the gulps: a quick rising shimmer
    for (const [i, hz] of [523, 784, 1047, 1568].entries()) {
      const at = t + 0.3 + i * 0.045;
      tone('triangle', hz * p, hz * p * 1.02, at, 0.3, amp(at, 0.004, 0.09, 0.3, out));
    }
    sweep(t + 0.28, 0.4, 800 * p, 3200 * p, 2000 * p, 2, 0.12, out, 0.08);
  },
  poison(t, out, p) {    // a poison tick: a sickly bubbling gurgle
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.06, hz = (180 + Math.random() * 120) * p;
      tone('sine', hz, hz * 1.8, at, 0.05, amp(at, 0.004, 0.25, 0.05, out));
    }
    noise(t, 0.15, filter('bandpass', 600 * p, 3, amp(t, 0.01, 0.15, 0.14, out)));
  },
  lob(t, out, p) {       // a flask thrown: a short rising whoosh and the slosh inside
    sweep(t, 0.24, 400 * p, 1600 * p, 900 * p, 1, 0.5, out, 0.04);
    tone('sine', 300 * p, 520 * p, t + 0.03, 0.12, amp(t + 0.03, 0.01, 0.12, 0.12, out));
  },
  glass(t, out, p) {     // a flask breaking: a sharp crack and tinkling shards
    noise(t, 0.05, filter('highpass', 4200 * p, 0.8, amp(t, 0.001, 0.7, 0.05, out)));
    for (let i = 0; i < 6; i++) {
      const at = t + 0.02 + i * 0.03 * (0.6 + Math.random() * 0.8), hz = (2600 + Math.random() * 3000) * p;
      tone('triangle', hz, hz * 0.96, at, 0.1, amp(at, 0.002, 0.1, 0.1, out));
    }
  },
  boom(t, out, p) {      // a blast flask: a deep thump, a roar of noise and a long rumble
    tone('sine', 110 * p, 32 * p, t, 0.5, amp(t, 0.003, 1.2, 0.5, out));
    noise(t, 0.6, filter('lowpass', 1400 * p, 0.7, amp(t, 0.004, 1.1, 0.6, out)));
    noise(t + 0.05, 1.1, filter('lowpass', 260 * p, 1, amp(t + 0.05, 0.05, 0.6, 1, out)));
  },
  hiss(t, out, p) {      // a toxic flask: gas hissing out and bubbling
    sweep(t, 0.9, 5000 * p, 3200 * p, 2500 * p, 0.8, 0.35, out, 0.03, 'highpass');
    for (let i = 0; i < 5; i++) {
      const at = t + 0.1 + i * 0.09, hz = (220 + Math.random() * 200) * p;
      tone('sine', hz, hz * 1.7, at, 0.06, amp(at, 0.005, 0.15, 0.06, out));
    }
  },
  chest(t, out, p) {     // a chest lid: a creaking hinge, the lid knocking back, a glint of treasure
    sweep(t, 0.35, 500 * p, 900 * p, 650 * p, 9, 0.25, out, 0.05);
    tone('sawtooth', 110 * p, 140 * p, t, 0.3, filter('bandpass', 700 * p, 6, amp(t, 0.05, 0.12, 0.28, out)));
    tone('sine', 150 * p, 70 * p, t + 0.33, 0.12, amp(t + 0.33, 0.003, 0.6, 0.12, out));
    noise(t + 0.33, 0.08, filter('lowpass', 900 * p, 1, amp(t + 0.33, 0.003, 0.4, 0.08, out)));
    for (const [i, hz] of [1047, 1319, 1568, 2093].entries()) {
      const at = t + 0.42 + i * 0.07;
      tone('sine', hz * p, hz * p, at, 0.3, amp(at, 0.004, 0.08, 0.3, out));
    }
  },
};

// a band of noise sweeping f0 -> f1 -> f2 over dur (q: band width); attack: swell time;
// type: the filter (bandpass by default)
function sweep(t, dur, f0, f1, f2, q, level, out, attack = 0.02, type = 'bandpass') {
  const f = filter(type, f0, q, amp(t, attack, level, Math.max(0.02, dur - attack), out));
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.35);
  f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  noise(t, dur, f);
}
Object.assign(SOUNDS, voices({ amp, noise, filter, tone, sweep }));
export const SOUND_NAMES = Object.keys(SOUNDS);

// checks: render a sound offline, returns its peak level (0 = silent)
export async function renderSfx(name, pitch = 1) {
  const live = ctx, liveNoise = noiseBuf;
  const off = new OfflineAudioContext(1, 3 * 44100, 44100);
  ctx = off;
  noiseBuf = off.createBuffer(1, NOISE * 44100, 44100);
  noiseBuf.getChannelData(0).forEach((_, i, d) => { d[i] = Math.random() * 2 - 1; });
  try { SOUNDS[name](0.005, off.destination, pitch); } finally { ctx = live; noiseBuf = liveNoise; }
  const data = (await off.startRendering()).getChannelData(0);
  return data.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
}

const ndc = new THREE.Vector3();
// sfx(name, { at: {x,y,z} (pans by screen position), pitch, volume, delay (s, from now) })
// learn: sound.html#coin-code #recipe (see learn/README.md)
export function sfx(name, { at = null, pitch = 1, volume = 1, delay = 0 } = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (name === 'coin') {
    combo = now - comboAt < 0.4 ? combo + 1 : 0; comboAt = now;
    pitch *= 1 + Math.min(combo, 10) * 0.035;
  } else if (now - (last[name] ?? -1) < 0.03) return;   // the same sound twice in a frame
  last[name] = now;
  let out = ctx.createGain();
  out.gain.value = volume;
  if (at && ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    ndc.set(at.x, at.y, at.z).project(camera);
    pan.pan.value = Math.max(-1, Math.min(1, ndc.x * 0.6));
    out.connect(pan).connect(master);
  } else out.connect(master);
  SOUNDS[name](now + 0.005 + Math.max(0, delay), out, pitch * (0.95 + Math.random() * 0.1));
}
