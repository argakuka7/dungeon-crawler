import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomCode, readCode, CODE_LETTERS, CODE_LENGTH, cleanName, packPose, isPose, isMe, BONES, Q } from '../src/net/protocol.js';
import { Timeline, lerpAngle, DELAY } from '../src/net/sync.js';

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
  const me = { t: 'me', ts: 1, seed: 7, cube: '0,0,0', pose, body: [1, 2, 3, 0, 0], hp: 10, maxHp: 10 };
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

test('angles blend the short way round', () => {
  assert.ok(Math.abs(lerpAngle(3, -3, 0.5) - (3 + (2 * Math.PI - 6) / 2)) < 1e-9);
  assert.equal(lerpAngle(0, 1, 0.25), 0.25);
});

// --- fighting together ---------------------------------------------------------------------
import './fixtures.js';
const { chooseTarget, nearestTo, alive, SWITCH } = await import('../src/game/party.js');
const { stepProjectile } = await import('../src/core/projectiles.js');
const { rowOf, rosterOf, MODES } = await import('../src/net/protocol.js');

const body = (x, z, more = {}) => ({ x, y: 0, z, r: 0.22, h: 0.85, hp: 10, ragdoll: null, ...more });

test('an enemy goes after the nearer player and does not dither between two', () => {
  const a = body(0, 0), b = body(5, 0), e = { x: 4, y: 0, z: 0, mode: 'chase' };
  assert.equal(chooseTarget(e, [a, b]), b);
  e.target = b; e.x = 2.4;   // a is a little nearer now: it stays with b
  assert.equal(chooseTarget(e, [a, b]), b);
  e.x = 2.5 - SWITCH;        // a is clearly nearer
  assert.equal(chooseTarget(e, [a, b]), a);
  e.target = b; e.mode = 'attack';   // never in the middle of an attack
  assert.equal(chooseTarget(e, [a, b]), b);
  e.mode = 'chase';
  b.ragdoll = {};            // a fallen player is not gone after
  e.x = 5;
  assert.equal(chooseTarget(e, [a, b]), a);
  a.hp = 0;                  // nobody to hurt: it keeps its target
  assert.equal(chooseTarget(e, [a, b]), b);
  assert.equal(chooseTarget(e, [a]), a);
  assert.ok(!alive(a) && !alive(null));
  assert.equal(nearestTo(5, 0, [body(0, 0), body(4, 0)]).x, 4);
});

test('a projectile hits whichever player it touches first', () => {
  const pr = { spec: { speed: 10, radius: 0.1, range: 20 }, x: 0, y: 0.5, z: 0, vx: 10, vy: 0, vz: 0, travelled: 0, t: 0 };
  const near = body(3, 0), far = body(6, 0);
  let end = null;
  for (let i = 0; !end && i < 100; i++) end = stepProjectile(pr, 1 / 60, [far, near], () => false);
  assert.equal(end, 'hit');
  assert.equal(pr.victim, near);
});

test('the host describes its enemies compactly for the guest', () => {
  const profile = { type: 'snake', hp: 48, corpseTime: 3 };
  const e = { id: 'k:snake:1', profile, level: 2, coinDrop: 5, kind: { xp: 10, dropXP: undefined, dropScale: 1 },
    x: 1.23456, y: 2, z: 3, yaw: 0.5, hp: 40, mode: 'attack', t: 0.333, attacks: 3, attack: 1, speed: 0,
    burning: {}, toxic: null, beam: { t: 0.2, ex: 4, ey: 1, ez: 5 } };
  const row = rowOf(e, 7);
  assert.deepEqual(row, [7, 1.23, 2, 3, 0.5, MODES.indexOf('attack'), 0.33, 3, 1, 0, 40, 1, [0.2, 4, 1, 5]]);
  const roster = rosterOf([e, { ...e, id: 'k:snake:2' }], 'k', 9);
  assert.equal(roster.profiles.length, 1);   // a pack shares its profile
  assert.deepEqual(roster.list.map(x => x.p), [0, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(roster)).list[1].id, 'k:snake:2');
});
