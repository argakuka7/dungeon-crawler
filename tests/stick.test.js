import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickVector, screenToWorld, aimReach, pinchStep, DEAD_ZONE, PINCH_STEP } from '../src/core/stick.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('the stick does nothing inside its dead zone', () => {
  assert.deepEqual(stickVector(0, 0, 60), { x: 0, y: 0, m: 0 });
  assert.equal(stickVector(DEAD_ZONE * 60 - 1, 0, 60).m, 0);
});

test('the stick gives a unit direction with y up and a push from 0 to 1', () => {
  const up = stickVector(0, -30, 60);
  near(up.x, 0); near(up.y, 1);
  assert.ok(up.m > 0 && up.m < 1);
  const edge = stickVector(300, 0, 60);
  near(edge.x, 1); near(edge.y, 0); near(edge.m, 1);
  const diag = stickVector(20, 20, 60);
  near(Math.hypot(diag.x, diag.y), 1);
});

test('a screen direction turns with the view like the movement keys', () => {
  // the keys: W is screen up, D screen right (game/input.js inputDir)
  for (const yaw of [-Math.PI / 4, 0, 1.2]) {
    const [ux, uz] = screenToWorld(0, 1, yaw), [rx, rz] = screenToWorld(1, 0, yaw);
    near(ux, -Math.sin(yaw)); near(uz, -Math.cos(yaw));
    near(rx, Math.cos(yaw)); near(rz, -Math.sin(yaw));
    near(ux * rx + uz * rz, 0);
  }
});

test('an aimed throw reaches from close by to the full range', () => {
  near(aimReach(1, 8), 8);
  assert.ok(aimReach(0, 8) > 0 && aimReach(0, 8) < 2);
  near(aimReach(5, 8), 8);
});

test('pinching steps only past its threshold', () => {
  assert.equal(pinchStep(1), 0);
  assert.equal(pinchStep(PINCH_STEP), -1);
  assert.equal(pinchStep(1 / PINCH_STEP), 1);
});
