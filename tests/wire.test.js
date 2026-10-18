import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wireLink, isWireLink, encodeMessage, createDecoder, FRAME_BYTES, MESSAGE_BYTES } from '../src/net/wire.js';

const bytes = text => new TextEncoder().encode(text).length;

// two links joined by a pretend carrier that keeps every frame it carried
function pair() {
  const frames = [], ends = {};
  const carrier = to => ({ send: text => { frames.push(text); ends[to].receive(text); }, close: () => ends[to].lost() });
  ends.a = wireLink(carrier('b'));
  ends.b = wireLink(carrier('a'));
  const got = { a: [], b: [] };
  ends.a.link.onmessage = m => got.a.push(m);
  ends.b.link.onmessage = m => got.b.push(m);
  return { a: ends.a, b: ends.b, frames, got };
}

test('small messages go as one frame, big ones in pieces under the frame size', () => {
  const { a, frames, got } = pair();
  a.link.send({ t: 'ping' });
  assert.equal(frames.length, 1);
  const big = { t: 'welcome', defeated: Array.from({ length: 5000 }, (_, i) => `3,-1,2:spider:${i}`) };
  a.link.send(big);
  assert.ok(frames.length > 3);
  assert.ok(frames.every(f => bytes(f) <= FRAME_BYTES));
  assert.deepEqual(got.b, [{ t: 'ping' }, big]);
});

test('text outside ASCII is never cut inside a character', () => {
  const { a, frames, got } = pair();
  const text = 'Grüße 🐉 '.repeat(6000);   // surrogate pairs at every possible cut
  a.link.send({ t: 'chat', text });
  assert.ok(frames.length > 1 && frames.every(f => bytes(f) <= FRAME_BYTES && f.isWellFormed()));
  assert.equal(got.b[0].text, text);
});

test('what is no message, or too big, is refused before anything is sent', () => {
  const { a, frames } = pair();
  for (const bad of [null, 'ping', [1], { x: 1 }, { t: 3 }]) assert.throws(() => a.link.send(bad), TypeError);
  assert.throws(() => a.link.send({ t: 'x', data: 'a'.repeat(MESSAGE_BYTES) }), RangeError);
  assert.equal(frames.length, 0);
});

test('a broken or hostile other side closes the link', () => {
  const frames = encodeMessage({ t: 'x', data: 'a'.repeat(40000) }, 7);
  const cases = [
    ['not text', [{ t: 'ping' }]],
    ['not a frame', ['hello']],
    ['not JSON', ['={']],
    ['a list', ['=[1,2]']],
    ['a string', ['="t"']],
    ['too big a frame', ['=' + JSON.stringify({ t: 'x', s: 'a'.repeat(FRAME_BYTES) })]],
    ['pieces out of order', [frames[1]]],
    ['a piece skipped', [frames[0], frames[2]]],
    ['a message inside another', [frames[0], '={"t":"ping"}']],
    ['another message\'s piece', [frames[0], frames[1].replace('+7,', '+8,')]],
    ['too many pieces', ['+1,0,999999:x']],
  ];
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const [what, list] of cases) {
      let closed = 0, carrierClosed = 0;
      const got = [];
      const w = wireLink({ send() {}, close: () => carrierClosed++ });
      w.link.onmessage = m => got.push(m);
      w.link.onclose = () => closed++;
      for (const f of list) w.receive(f);
      assert.equal(closed, 1, what);
      assert.equal(carrierClosed, 1, what);
      assert.deepEqual(got, [], what);
      w.receive('={"t":"ping"}');   // closed: nothing more comes through
      assert.deepEqual(got, [], what);
    }
  } finally { console.warn = warn; }
});

test('the decoder follows the pieces of one message after the other', () => {
  const decode = createDecoder(), m = { t: 'x', data: 'b'.repeat(50000) };
  const frames = [...encodeMessage(m, 1), ...encodeMessage({ t: 'y' }, 2), ...encodeMessage(m, 3)];
  const out = frames.map(decode).filter(Boolean);
  assert.deepEqual(out, [m, { t: 'y' }, m]);
});

test('closing calls onclose once, on both ends; only wireLink makes links', () => {
  const { a, b } = pair();
  let ca = 0, cb = 0;
  a.link.onclose = () => ca++;
  b.link.onclose = () => cb++;
  a.link.close(); a.link.close(); a.lost();
  assert.equal(ca, 1); assert.equal(cb, 1);
  a.link.send({ t: 'ping' });   // after closing: nothing, no error
  assert.ok(isWireLink(a.link));
  assert.ok(!isWireLink({ send() {}, close() {} }));
  assert.throws(() => { a.link.extra = 1; }, TypeError);   // ('use strict' in modules: sealed)
});
