import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolutionController } from '../src/core/resolution.js';

// feed `ms` of frames, each `interval` apart and `spent` of them the frame's own work; returns
// the ratios the controller switched to
function run(c, ms, interval, spent) {
  const changes = [];
  for (let t = 0; t < ms; t += interval) {
    const r = c.tick(interval, spent);
    if (r) changes.push(r);
  }
  return changes;
}

// a GPU-bound scene: frame time grows with the pixels shaded (gpu ms at ratio 1), but not
// below vsync at 60 Hz
function gpuBound(c, ms, gpu, spent = 3) {
  for (let t = 0; t < ms;) {
    const interval = Math.max(1000 / 60, spent + gpu * c.ratio * c.ratio);
    c.tick(interval, spent);
    t += interval;
  }
}

test('GPU-bound slow frames lower the resolution until frames are fast, never below the floor', () => {
  const c = resolutionController(2);
  assert.equal(c.min, 1);
  assert.deepEqual(run(c, 1000, 30, 5), [1.7]);
  const d = resolutionController(2);
  gpuBound(d, 20000, 6);       // 27 ms at 2x: fast enough at about 1.6x
  assert.ok(d.ratio < 1.75 && d.ratio > 1.3, String(d.ratio));
  const e = resolutionController(2);
  gpuBound(e, 60000, 40);      // hopeless: down to (within a step of) the floor, no further
  assert.ok(e.ratio >= e.min && e.ratio < e.min / 0.85, String(e.ratio));
});

test('CPU-bound slow frames keep the resolution', () => {
  const c = resolutionController(2);
  assert.deepEqual(run(c, 5000, 30, 25), []);
  assert.equal(c.ratio, 2);
});

test('a step down that does not help is taken back and stepping down rests', () => {
  const c = resolutionController(2);
  assert.deepEqual(run(c, 1000, 33.4, 4), [1.7]);   // e.g. a browser capping the frame rate at 30
  assert.deepEqual(run(c, 1000, 33.4, 4), [2]);
  assert.deepEqual(run(c, 20000, 33.4, 4), []);
  assert.equal(c.ratio, 2);
});

test('smooth frames raise the resolution again after a calm spell', () => {
  const c = resolutionController(2);
  run(c, 1000, 30, 5);
  assert.equal(c.ratio, 1.7);
  assert.deepEqual(run(c, 3000, 16.7, 4), []);
  assert.equal(run(c, 2000, 16.7, 4).length, 1);
  assert.ok(Math.abs(c.ratio - 1.87) < 1e-9);
  run(c, 20000, 16.7, 4);
  assert.equal(c.ratio, 2);   // up to the device's ratio, not beyond
});

test('a step up that is too much makes the next calm spell longer', () => {
  const c = resolutionController(2);
  run(c, 1000, 30, 5);                       // 2 -> 1.7
  run(c, 1000, 16.7, 4);                     // proves itself
  run(c, 4000, 16.7, 4);                     // calm: 1.7 -> 1.87
  assert.ok(Math.abs(c.ratio - 1.87) < 1e-9);
  run(c, 1000, 30, 5);                       // too slow right away: steps down, calm doubles
  assert.ok(c.ratio < 1.87);
  const at = c.ratio;
  assert.deepEqual(run(c, 6000, 16.7, 4), []);   // 4 s is no longer enough
  run(c, 3000, 16.7, 4);
  assert.ok(c.ratio > at);
});

test('stalls (a background tab, a hitch) are not counted', () => {
  const c = resolutionController(2);
  assert.deepEqual(run(c, 20000, 500, 5), []);
  assert.equal(c.ratio, 2);
});
