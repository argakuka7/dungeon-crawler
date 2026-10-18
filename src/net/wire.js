// How messages travel between two games, whatever carries them (net/transport.js). Pure: no DOM,
// no network, so it can be tested in node.
//
// A carrier (PeerJS, BroadcastChannel, one day a WebSocket or bare WebRTC) only moves text
// frames, in order and reliably, each at most FRAME_BYTES of UTF-8: what every WebRTC data
// channel takes. The game only sees links that send and receive whole messages (plain objects
// with a type `t`, protocol.js), of any size up to MESSAGE_BYTES. wireLink is the only way to
// make a link, so nothing can send a message the carrier would drop, or a frame of its own:
//
//   const { link, receive, lost } = wireLink({ send: text => ..., close: () => ... });
//   carrier text in  -> receive(text)    the carrier went away -> lost()
//   game -> link.send(message), link.close(); link.onmessage(message), link.onclose()
//
// A frame is one of
//   '=' + JSON                       a whole message
//   '+' + id ',' n ',' of ':' text   piece n (0..of-1) of message id's JSON, cut at FRAGMENT
// The pieces of one message go out one after the other, nothing between them (send is
// synchronous), so a receiver takes them strictly in order. Anything else is a broken or
// hostile other side: the link closes.

export const FRAME_BYTES = 16000;           // < 16 KiB, the safe size for any data channel
export const MESSAGE_BYTES = 8 * 1024 * 1024;
const FRAGMENT = 15000;                     // UTF-8 bytes of JSON per piece at most (the rest: the header)
const MAX_PIECES = Math.ceil(MESSAGE_BYTES / (FRAGMENT / 3));
const enc = new TextEncoder();
const bytesOf = text => enc.encode(text).length;

export class WireError extends Error {}

// message -> frames (throws for what is no message or too big: a mistake in the game, not the network)
export function encodeMessage(message, id) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.t !== 'string')
    throw new TypeError('A message is an object with a type t');
  const json = JSON.stringify(message), bytes = bytesOf(json);
  if (bytes > MESSAGE_BYTES) throw new RangeError(`Message ${message.t} is too big (${bytes} bytes)`);
  if (bytes <= FRAGMENT) return ['=' + json];
  // cut in code units: 1 byte each in ASCII, else at most 3 (a surrogate pair: 4 for 2); never
  // inside a pair
  const step = bytes === json.length ? FRAGMENT : Math.floor(FRAGMENT / 3), cuts = [];
  for (let i = 0; i < json.length;) {
    let end = Math.min(json.length, i + step);
    const c = json.charCodeAt(end - 1);
    if (end < json.length && c >= 0xd800 && c <= 0xdbff) end--;
    cuts.push(json.slice(i, end));
    i = end;
  }
  return cuts.map((text, n) => `+${id},${n},${cuts.length}:${text}`);
}

// frames -> messages: decoder(text) returns the message it completes, or null (more to come);
// throws WireError for what does not follow the rules
export function createDecoder() {
  let open = null;   // the message being put together: { id, of, parts, bytes }
  const parse = json => {
    let m;
    try { m = JSON.parse(json); } catch { throw new WireError('Not JSON'); }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') throw new WireError('Not a message');
    return m;
  };
  return text => {
    if (typeof text !== 'string') throw new WireError('Not a text frame');
    const size = bytesOf(text);
    if (size > FRAME_BYTES) throw new WireError('Frame too big');
    if (text[0] === '=') {
      if (open) throw new WireError('A message inside another one');
      return parse(text.slice(1));
    }
    const head = /^\+(\d{1,9}),(\d{1,6}),(\d{1,6}):/.exec(text);
    if (!head) throw new WireError('Not a frame');
    const [id, n, of] = head.slice(1).map(Number), part = text.slice(head[0].length);
    if (n === 0) {
      if (open) throw new WireError('A message inside another one');
      if (of < 2 || of > MAX_PIECES) throw new WireError('Bad piece count');
      open = { id, of, parts: [], bytes: 0 };
    }
    if (!open || id !== open.id || of !== open.of || n !== open.parts.length) throw new WireError('Piece out of order');
    open.parts.push(part);
    open.bytes += size - head[0].length;
    if (open.bytes > MESSAGE_BYTES) throw new WireError('Message too big');
    if (open.parts.length < of) return null;
    const json = open.parts.join('');
    open = null;
    return parse(json);
  };
}

// A link over a carrier ({ send(text), close() }): see the top. The carrier calls receive(text)
// for each frame and lost() when it went away; its close() is called once, when we close.
const links = new WeakSet();
export function wireLink(carrier) {
  let closed = false, next = 0;
  const decode = createDecoder();
  const end = () => { if (closed) return false; closed = true; link.onmessage = null; return true; };
  const link = {
    onmessage: null, onclose: null,
    send(message) {
      const frames = encodeMessage(message, next = (next + 1) % 1e9);   // (throws before sending anything)
      if (!closed) for (const f of frames) carrier.send(f);
    },
    close() { const cb = link.onclose; if (end()) { carrier.close(); cb?.(); } },
  };
  Object.seal(link);
  links.add(link);
  return {
    link,
    receive(text) {
      if (closed) return;
      let m;
      try { m = decode(text); } catch (e) {
        if (!(e instanceof WireError)) throw e;
        console.warn('the other side broke the wire protocol, closing', e.message);
        link.close();
        return;
      }
      if (m) link.onmessage?.(m);
    },
    lost() { const cb = link.onclose; if (end()) cb?.(); },
  };
}
// made by wireLink (net/transport.js checks every link a carrier hands out)
export const isWireLink = link => links.has(link);
