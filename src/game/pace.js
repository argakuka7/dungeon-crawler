// How fast game time runs: paused, slower, faster, or one frame at a time. For teaching (the
// Guide, through game/teach.js) and tests. The frame loop (main.js) asks gameTime how much game
// time a frame of real time is worth; while paused everything stands still but is still drawn,
// and the camera can still turn and zoom.
import { online } from '../net/online.js';

export const STEP = 1 / 60;   // s of game time in one step
export const pace = { paused: false, speed: 1 };
let steps = 0, waiting = [];

// the game time `elapsed` real seconds are worth this frame
export function gameTime(elapsed) {
  // playing together, time runs for both alike: one side cannot stop or slow it (src/net/)
  if (online.partner) { if (steps) release(); return elapsed; }
  if (!pace.paused) return elapsed * pace.speed;
  if (steps <= 0) return 0;
  // the frame runs once this returns; whoever waits for the steps goes on after it (a microtask)
  if (--steps === 0) { for (const done of waiting) done(); waiting = []; }
  return STEP;
}

export function pause() { pace.paused = true; }
export function resume() { pace.paused = false; release(); }
// speed: 1 is normal, 0.25 a quarter as fast (slow motion), 2 twice as fast
export function setSpeed(speed) {
  if (!(speed > 0 && speed <= 4)) throw new RangeError('The speed must be above 0 and at most 4');
  pace.speed = speed;
}
// pause (if it is not) and run `frames` frames of STEP each; resolves when they have run
export function step(frames = 1) {
  pause();
  steps += Math.max(1, Math.round(frames));
  return new Promise(resolve => waiting.push(resolve));
}
export function resetPace() { pace.paused = false; pace.speed = 1; release(); }
function release() { steps = 0; for (const done of waiting) done(); waiting = []; }
