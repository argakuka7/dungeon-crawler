import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ZOOM, ZOOM_INTERVAL, CLOSEST_ZOOM, FARTHEST_ZOOM, ZOOM_LEVELS, stepZoom } from '../src/core/zoom.js';

test('default camera magnification is 23% larger', () => {
  assert.equal(1 / DEFAULT_ZOOM, 1.23);
});

test('zoom uses reversible presets anchored at the default', () => {
  assert.equal(stepZoom(DEFAULT_ZOOM, 1), DEFAULT_ZOOM * ZOOM_INTERVAL);
  assert.equal(stepZoom(DEFAULT_ZOOM, -1), DEFAULT_ZOOM / ZOOM_INTERVAL);
  for (const direction of [-1, 1]) {
    let zoom = DEFAULT_ZOOM;
    for (let i = 0; i < 2; i++) zoom = stepZoom(zoom, direction);
    for (let i = 0; i < 2; i++) zoom = stepZoom(zoom, -direction);
    assert.equal(zoom, DEFAULT_ZOOM);
  }
  assert.equal(stepZoom(DEFAULT_ZOOM, 0), DEFAULT_ZOOM);
});

test('zoom has exactly six levels with the default fourth from the closest', () => {
  let zoom = DEFAULT_ZOOM;
  for (let i = 0; i < 100; i++) zoom = stepZoom(zoom, -1);
  const levels = [zoom];
  for (let i = 0; i < 100; i++) {
    const next = stepZoom(zoom, 1);
    if (next === zoom) break;
    levels.push(next);
    zoom = next;
  }
  assert.equal(levels.length, 6);
  assert.equal(levels[3], DEFAULT_ZOOM);
  assert.deepEqual(levels, [...ZOOM_LEVELS]);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] > levels[i - 1]);
});

test('zoom stays bounded and steps away from either limit without drift', () => {
  for (const direction of [-1, 1]) {
    let zoom = DEFAULT_ZOOM;
    for (let i = 0; i < 100; i++) {
      zoom = stepZoom(zoom, direction);
      assert.ok(zoom >= CLOSEST_ZOOM && zoom <= FARTHEST_ZOOM);
    }
    assert.equal(stepZoom(zoom, direction), zoom);
    const away = stepZoom(zoom, -direction);
    assert.notEqual(away, zoom);
    assert.equal(stepZoom(away, direction), zoom);
  }
});

test('closest preset magnifies 20% more and farthest reaches 10% further than before', () => {
  const previousClosest = DEFAULT_ZOOM * ZOOM_INTERVAL ** -2 / 1.25;
  const previousFarthest = DEFAULT_ZOOM * ZOOM_INTERVAL ** 2;
  let closest = DEFAULT_ZOOM, farthest = DEFAULT_ZOOM;
  for (let i = 0; i < 10; i++) { closest = stepZoom(closest, -1); farthest = stepZoom(farthest, 1); }
  assert.ok(Math.abs(previousClosest / closest - 1.2) < 1e-12);
  assert.ok(Math.abs(farthest / previousFarthest - 1.1) < 1e-12);
});

test('off-grid targets snap to the shared presets', () => {
  assert.equal(stepZoom(DEFAULT_ZOOM * 1.01, 1), stepZoom(DEFAULT_ZOOM, 1));
  assert.equal(stepZoom(DEFAULT_ZOOM * 0.99, -1), stepZoom(DEFAULT_ZOOM, -1));
});
