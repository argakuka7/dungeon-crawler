import { test } from 'node:test';
import assert from 'node:assert/strict';
import { townPadIn, onPad, CAST_TIME, TOWN_PORTAL_CHARGE, PAD_RADIUS, MAX_PAD_DISTANCE, padOffsets, minPadDistance } from '../src/core/townportal.js';
import { createRun } from '../src/core/progression.js';

const body = (x, z, extra = {}) => ({ x, y: 2, z, vx: 0, vz: 0, grounded: true, stun: 0, ...extra });

test('the open town portal stands in its cube and in town, nowhere else', () => {
  const run = createRun(), pad = { x: 5.5, y: 2, z: 7 }, townEnd = { x: 12, y: 2, z: 8.5 };
  const dungeon = { key: '2,-3,1' }, other = { key: '2,-3,2' }, town = { key: '0,0,0', town: { portal: townEnd } };
  for (const m of [dungeon, other, town]) assert.equal(townPadIn(m, run), null, 'none open yet');
  run.townPortal = { key: dungeon.key, depth: 3, pad, back: { x: 5.5, y: 2, z: 5.4 } };
  assert.equal(townPadIn(dungeon, run), pad);
  assert.equal(townPadIn(other, run), null);
  assert.equal(townPadIn(town, run), townEnd);
  assert.equal(townPadIn(null, run), null);
  assert.equal(CAST_TIME, 5); assert.ok(TOWN_PORTAL_CHARGE > 0 && TOWN_PORTAL_CHARGE < CAST_TIME);
});

test('it takes you only when you stand in it on purpose, like a well', () => {
  const pad = { x: 5.5, y: 2, z: 7 };
  assert.ok(onPad(body(5.6, 7.1), pad));
  assert.ok(!onPad(body(5.5, 7.5), pad), 'beside it');
  assert.ok(!onPad(body(5.5, 7, { y: 3 }), pad), 'above it');
  assert.ok(!onPad(body(5.5, 7, { grounded: false }), pad), 'jumping over it');
  assert.ok(!onPad(body(5.5, 7, { stun: .5 }), pad), 'knocked into it');
  assert.ok(!onPad(body(5.5, 7, { vx: 4.5 }), pad), 'flung through it');
});

test('the pad goes ahead first, else anywhere around, never on the caster', () => {
  const r = 0.22, min = minPadDistance(r), ahead = padOffsets(0, r), behind = padOffsets(Math.PI, r);
  const [dx, dz] = ahead[0];
  assert.ok(dz > 1.4 && Math.abs(dx) < 0.2, 'first choice: about 1.6 cells straight ahead');
  assert.ok(behind[0][1] < -1.4, 'facing the other way: ahead is the other way');
  for (const [x, z] of ahead) {
    const d = Math.hypot(x, z);
    assert.ok(d >= min && d <= MAX_PAD_DISTANCE);
    assert.ok(!onPad(body(0, 0), { x, y: 2, z }), 'the caster never stands in it');
  }
  assert.ok(min + PAD_RADIUS + r < 1.5 * Math.SQRT2, 'beside the caster, pad and caster share a 1.5 x 1.5 spot');
  assert.ok(ahead.some(([x, z]) => Math.hypot(x, z) < min + 0.1), 'it may go right beside the caster');
  // in a 1.5 x 1.5 room with the caster in a corner, a candidate lands where the disc fits
  const fits = ([x, z]) => [x, z].every(v => v + 0.3 >= PAD_RADIUS && v + 0.3 <= 1.5 - PAD_RADIUS);
  assert.ok(ahead.some(fits));
});
