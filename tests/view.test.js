import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapYaw, SIDE0, closeDistance, clampPitch, PITCH, PITCH_MIN, PITCH_MAX, keyPress, keyMove, keyRelease, TAP_MS, ORBIT_PX } from '../src/core/view.js';
import { DEFAULT_ZOOM, stepZoom } from '../src/core/zoom.js';
import { ACTION, defaultBindings, resolveBindings } from '../src/core/keybinds.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('the overview settles on the nearest of its four diagonal sides', () => {
  for (let k = -5; k <= 5; k++) {
    const side = SIDE0 + k * Math.PI / 2;
    assert.ok(close(snapYaw(side), side));
    assert.ok(close(snapYaw(side + 0.7), side));
    assert.ok(close(snapYaw(side - 0.7), side));
    assert.ok(close(snapYaw(side + 0.9), side + Math.PI / 2));
  }
  assert.ok(close(snapYaw(0.1), Math.PI / 4));
  assert.ok(close(snapYaw(-0.1), -Math.PI / 4));
});

test('the close view zooms with the same presets, from about 1.5 to 4 units', () => {
  assert.equal(closeDistance(DEFAULT_ZOOM), 3);
  let zoom = DEFAULT_ZOOM;
  for (let i = 0; i < 5; i++) zoom = stepZoom(zoom, -1);
  assert.ok(closeDistance(zoom) > 1.4 && closeDistance(zoom) < 1.7);
  for (let i = 0; i < 5; i++) zoom = stepZoom(zoom, 1);
  assert.ok(closeDistance(zoom) > 3.8 && closeDistance(zoom) < 4.2);
});

test('the close view pitch stays within its limits', () => {
  assert.equal(clampPitch(PITCH), PITCH);
  assert.equal(clampPitch(-5), PITCH_MIN);
  assert.equal(clampPitch(5), PITCH_MAX);
});

test('the camera key: a quick tap switches, a hold or moving the mouse does not', () => {
  assert.equal(keyRelease(keyPress(0), TAP_MS - 1), 'toggle');
  assert.equal(keyRelease(keyPress(0), TAP_MS + 1), null);
  // a jitter under the threshold is still a tap
  const k = keyPress(0);
  assert.equal(keyMove(k, 1, 1), false);
  assert.equal(keyRelease(k, 100), 'toggle');
  // moving the mouse turns the view at once, and letting go then never switches
  const m = keyPress(0);
  assert.equal(keyMove(m, ORBIT_PX, 0), true);
  assert.equal(keyMove(m, 0, 0), true);
  assert.equal(keyRelease(m, 50), 'orbited');
});

test('the camera key is Tab, else C, and C does not take a key from others', () => {
  assert.deepEqual(defaultBindings().camera, ['Tab', 'KeyC']);
  assert.equal(ACTION.camera.group, 'View');
  const all = Object.values(defaultBindings()).flat().filter(Boolean);
  assert.equal(all.filter(k => k === 'Tab' || k === 'KeyC').length, 2);
  // whoever had moved another action onto Tab keeps it: the camera keeps C
  assert.deepEqual(resolveBindings({ jump: ['Tab', null] }).camera, [null, 'KeyC']);
});
