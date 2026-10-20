import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLock, nextLock, lockYaw, wrapAngle, LOCK_RANGE, LOCK_CONE } from '../src/core/lockon.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;
const at = (x, z) => ({ x, z });
const hero = at(0, 0), ahead = 0;   // looking along +z: +x is to the left, -x to the right

test('the lock goes to the enemy nearest the middle of the view, in range and in the cone', () => {
  const middle = at(0.5, 8), side = at(4, 3), behind = at(0, -2), far = at(0, LOCK_RANGE + 1);
  assert.equal(pickLock(hero, ahead, [side, middle, behind, far]), middle);
  assert.equal(pickLock(hero, ahead, [behind, far]), null);
  // just outside the cone: not picked
  const out = at(Math.sin(LOCK_CONE + 0.05) * 5, Math.cos(LOCK_CONE + 0.05) * 5);
  assert.equal(pickLock(hero, ahead, [out]), null);
  // how far away counts a little: of two in the same direction, the nearer
  assert.equal(pickLock(hero, ahead, [at(0, 10), at(0, 3)]).z, 3);
  // one standing on the hero counts as in the middle
  assert.ok(pickLock(hero, Math.PI, [at(0.1, 0.1)]));
});

test('a flick moves the lock to the next enemy on that side', () => {
  const current = at(0, 6), right = at(-2, 6), farRight = at(-5, 5), left = at(2, 6), behind = at(-1, -6);
  const list = [current, right, farRight, left, behind];
  assert.equal(nextLock(hero, current, list, 1), right);
  assert.equal(nextLock(hero, current, list, -1), left);
  assert.equal(nextLock(hero, right, list, 1), farRight);
  assert.equal(nextLock(hero, farRight, list, 1), null);   // nothing more that way (behind does not count)
  assert.equal(nextLock(hero, current, [current], 1), null);
});

test('the locked camera stands opposite the enemy, behind the hero', () => {
  // the enemy along +z: the camera behind the hero, at -z (yaw pi: where it stands, seen from the hero)
  assert.ok(close(Math.abs(lockYaw(0, 0, 0, 5)), Math.PI));
  assert.ok(close(lockYaw(0, 0, 5, 0), -Math.PI / 2));
  assert.ok(close(wrapAngle(3 * Math.PI), Math.PI) || close(wrapAngle(3 * Math.PI), -Math.PI));
  assert.ok(close(wrapAngle(0.5 + 4 * Math.PI), 0.5));
});
