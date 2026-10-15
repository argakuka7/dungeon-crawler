import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomCode, readCode, CODE_LETTERS, CODE_LENGTH, cleanName, packPose, isPose, isMe, BONES, Q } from '../src/net/protocol.js';
import { Timeline, shouldFollow, nextTrip, lerpAngle, DELAY } from '../src/net/sync.js';

test('room codes are four letters without I and O', () => {
  assert.ok(!CODE_LETTERS.includes('I') && !CODE_LETTERS.includes('O'));
  for (let i = 0; i < 200; i++) {
    const code = roomCode();
    assert.equal(code.length, CODE_LENGTH);
    assert.equal(readCode(code), code);
  }
  assert.equal(roomCode(() => 0), 'AAAA');
  assert.equal(roomCode(() => 0.9999), 'ZZZZ');
});

test('a typed code or a pasted link reads as the code', () => {
  assert.equal(readCode(' abcd '), 'ABCD');
  assert.equal(readCode('ab-cd'), 'ABCD');
  assert.equal(readCode('https://example.com/game/?join=WXYZ&net=local'), 'WXYZ');
  assert.equal(readCode('abc'), null);
  assert.equal(readCode('abcde'), null);
  assert.equal(readCode('ABIO'), null);   // letters a code never has
  assert.equal(readCode(null), null);
});

test('names are short plain text', () => {
  assert.equal(cleanName('  Anna '), 'Anna');
  assert.equal(cleanName(''), 'Friend');
  assert.equal(cleanName('a\nb'), 'ab');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
});

test('a pose packs into whole numbers and checks out', () => {
  const quats = BONES.flatMap(() => [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  const pose = packPose([1.23456, 2, 3], 0.5, [0, 0.69, 0.01], quats);
  assert.deepEqual(pose.p, [1.235, 2, 3]);
  assert.ok(pose.q.every(Number.isInteger));
  assert.equal(pose.q[1], Math.round(Math.SQRT1_2 * Q));
  assert.ok(isPose(pose));
  assert.ok(!isPose({ ...pose, q: pose.q.slice(1) }));
  assert.ok(!isPose({ ...pose, p: [1, 2, NaN] }));
  const me = { t: 'me', ts: 1, seed: 7, cube: '0,0,0', trip: 0, pose, hp: 10, maxHp: 10 };
  assert.ok(isMe(me));
  assert.ok(!isMe({ ...me, cube: 3 }));
  assert.ok(!isMe({ ...me, pose: null }));
});

const me = (ts, x = ts / 100) => ({ ts, x });

test('the timeline shows the partner a little in the past, blending two messages', () => {
  const tl = new Timeline();
  assert.equal(tl.at(0), null);
  // sent every 50 ms, arriving 30 ms later (their clock is 1000 ms behind ours)
  for (let ts = 0; ts <= 500; ts += 50) tl.push(me(ts), ts + 1000 + 30);
  const span = tl.at(1530);   // shown: their clock at 1530 - 1030 - DELAY
  const t = 500 - DELAY;
  assert.ok(span.a.ts <= t && span.b.ts > t);
  assert.ok(Math.abs(span.a.ts + span.k * (span.b.ts - span.a.ts) - t) < 1e-9);
  assert.equal(tl.latest().ts, 500);
});

test('the timeline holds the newest message when nothing newer came, and drops late ones', () => {
  const tl = new Timeline();
  tl.push(me(0), 10); tl.push(me(50), 60);
  tl.push(me(20), 70);   // sent before the last one: ignored
  assert.equal(tl.list.length, 2);
  const span = tl.at(5000);
  assert.equal(span.a.ts, 50); assert.equal(span.b.ts, 50); assert.equal(span.k, 0);
  // jitter: a message that took longer does not move the clock offset
  tl.push(me(100), 180);
  assert.equal(tl.offset, 10);
});

test('the one who travelled last takes the other along', () => {
  const at = (cube, trip, busy = false, seed = 1) => ({ seed, cube, trip, busy });
  // same cube: nobody follows
  assert.equal(shouldFollow(at('a', 1), at('a', 2), 'host'), false);
  // they went somewhere after us: follow
  assert.equal(shouldFollow(at('a', 1), at('b', 2), 'host'), true);
  assert.equal(shouldFollow(at('b', 2), at('a', 1), 'guest'), false);
  // the same count (both moved at once): the guest gives way
  assert.equal(shouldFollow(at('a', 3), at('b', 3), 'guest'), true);
  assert.equal(shouldFollow(at('b', 3), at('a', 3), 'host'), false);
  // not while either is on the way, nor across worlds
  assert.equal(shouldFollow(at('a', 1), at('b', 2, true), 'guest'), false);
  assert.equal(shouldFollow(at('a', 1, true), at('b', 2), 'guest'), false);
  assert.equal(shouldFollow(at('a', 1), at('b', 2, false, 2), 'guest'), false);
  assert.equal(shouldFollow(at('a', 1), null, 'guest'), false);
  // a trip of your own counts past everything before it
  assert.equal(nextTrip(1, 4), 5);
  assert.equal(nextTrip(6, 4), 7);
  assert.equal(nextTrip(0), 1);
});

test('angles blend the short way round', () => {
  assert.ok(Math.abs(lerpAngle(3, -3, 0.5) - (3 + (2 * Math.PI - 6) / 2)) < 1e-9);
  assert.equal(lerpAngle(0, 1, 0.25), 0.25);
});
