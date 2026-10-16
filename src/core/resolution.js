// Render resolution that follows the frame rate (render/resolution.js applies it). On a high-DPI
// screen the GPU shades up to four pixels per CSS pixel; when frames come too slowly because of
// that, the resolution steps down, and creeps back up after a while of smooth frames.
//   - Frames are judged a second at a time, by the time between frames and by how much of it the
//     frame's own work (JavaScript, handing the draws to the GPU) took: slow frames that are
//     mostly that work are CPU-bound, and fewer pixels would not help.
//   - Every step down has to prove itself: if the next second is not clearly faster (a CPU-bound
//     frame after all, or a browser that caps the frame rate, like Safari in low power mode), it
//     is taken back and stepping down rests for a while.
//   - Stepping up again waits for a calm spell, twice as long each time a step up had to be taken
//     back right away, so the resolution does not see-saw.

export const SLOW = 1000 / 50;       // ms between frames: slower than 50 fps is too slow
const SMOOTH = 1000 / 57;            // ms between frames: faster than ~57 fps (vsync at 60 or more)
const CPU_BOUND = 0.6;               // the frame's work takes this much of the time between frames
const STALL = 250;                   // ms: a hitch, a background tab; not counted
const WINDOW = 1000;                 // ms of frames judged at a time
const DOWN = 0.85, UP = 1.1;         // a step's factor
const PROOF = 0.9;                   // a step down must make frames at least this much shorter
const CALM = 4000, CALM_MAX = 64000; // ms of smooth frames before a step up
const REST = 30000;                  // ms without stepping down after a step down that did not help

export function resolutionController(max, min = Math.min(max, Math.max(0.6, max / 2))) {
  let ratio = max, sum = 0, work = 0, n = 0, span = 0;
  let smooth = 0, calm = CALM, rest = 0, trial = null, raised = -Infinity, clock = 0;
  const clamp = r => Math.min(max, Math.max(min, r));
  // interval: ms since the last frame; spent: ms the frame's own work took. Returns the new
  // ratio when it changes, else null.
  function tick(interval, spent) {
    if (!(interval > 0) || interval > STALL) return null;
    clock += interval; rest = Math.max(0, rest - interval);
    sum += interval; work += spent; n++; span += interval;
    if (span < WINDOW) return null;
    const avg = sum / n, busy = work / sum;
    sum = work = n = span = 0;
    if (trial) {   // the second after a step down: did it help?
      const t = trial; trial = null;
      if (avg > t.before * PROOF) { rest = REST; return set(t.from); }
    }
    if (avg > SLOW) {
      smooth = 0;
      if (clock - raised < 3000) calm = Math.min(CALM_MAX, calm * 2);   // the step up was too much
      if (busy < CPU_BOUND && rest === 0 && ratio > min) {
        trial = { from: ratio, before: avg };
        return set(clamp(ratio * DOWN));
      }
      return null;
    }
    smooth = avg < SMOOTH ? smooth + WINDOW : 0;
    if (smooth >= calm && ratio < max) { smooth = 0; raised = clock; return set(clamp(ratio * UP)); }
    return null;
  }
  function set(r) { if (r === ratio) return null; ratio = r; return r; }
  return { tick, get ratio() { return ratio; }, min, max };
}
