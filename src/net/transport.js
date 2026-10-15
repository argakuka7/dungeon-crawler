// The wire between two games. A link: link.send(message), link.close(), and the callbacks
// link.onmessage(message) and link.onclose() (called once, whoever closed it).
//
// Over the internet the link is a WebRTC data channel set up by PeerJS (vendor/peerjs): the
// host registers its room under peerId(code) with the public PeerJS broker, the guest asks the
// broker for it, and from then on the two browsers talk directly (encrypted). The broker only
// introduces them. PeerJS is loaded the first time someone hosts or joins.
//
// With `local` (?net=local) the link is a BroadcastChannel instead: tabs of this browser on the
// same page find each other without a network, for testing.
//
// Failures reject with an Error whose `type` says why: 'unavailable-id' (the code is taken),
// 'peer-unavailable' (no room with that code), 'browser-incompatible', 'network', 'timeout'.
import { peerId } from './protocol.js';

const TIMEOUT = 20000;   // ms to wait for the broker or the other side
const failure = (type, message) => Object.assign(new Error(message), { type });

let peerLib = null;
function loadPeer() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  peerLib ??= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: 'vendor/peerjs/peerjs.min.js' });
    s.onload = () => globalThis.Peer ? resolve(globalThis.Peer) : reject(failure('network', 'PeerJS did not load'));
    s.onerror = () => { peerLib = null; s.remove(); reject(failure('network', 'Could not load PeerJS')); };
    document.head.append(s);
  });
  return peerLib;
}

function makeLink(send, close) {
  let closed = false;
  const link = {
    onmessage: null, onclose: null,
    send(m) { if (!closed) send(m); },
    close() { if (closed) return; closed = true; close(); link.onclose?.(); },
    // the other side went away (or the connection broke)
    lost() { if (closed) return; closed = true; link.onclose?.(); },
  };
  return link;
}

// PeerJS data connection -> link; peer: the guest's own peer, destroyed with the link
function peerLink(conn, peer = null) {
  const link = makeLink(m => { if (conn.open) conn.send(m); }, () => { conn.close(); peer?.destroy(); });
  conn.on('data', m => link.onmessage?.(m));
  conn.on('close', () => { peer?.destroy(); link.lost(); });
  conn.on('error', e => { console.warn('link error', e); link.close(); });
  return link;
}

// Opens room `code`; onGuest(link) for everyone who joins. Resolves with { close() }.
export async function openRoom(code, onGuest, { local = false } = {}) {
  if (local) return localRoom(code, onGuest);
  if (!globalThis.RTCPeerConnection) throw failure('browser-incompatible', 'This browser cannot play online');
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId(code), { debug: 1 });
    let open = false;
    const timer = setTimeout(() => { if (!open) { peer.destroy(); reject(failure('timeout', 'The broker did not answer')); } }, TIMEOUT);
    peer.on('open', () => { open = true; clearTimeout(timer); resolve({ close: () => peer.destroy() }); });
    peer.on('connection', conn => conn.on('open', () => onGuest(peerLink(conn))));
    peer.on('error', e => {
      if (open) { console.warn('room error', e); return; }
      clearTimeout(timer); peer.destroy(); reject(failure(e.type || 'network', e.message));
    });
    // lost the broker: the friend already connected stays connected, new ones need it again
    peer.on('disconnected', () => { if (open && !peer.destroyed) setTimeout(() => peer.destroyed || peer.reconnect(), 2000); });
  });
}

// Joins room `code`. Resolves with the link to its host.
export async function joinRoom(code, { local = false } = {}) {
  if (local) return localJoin(code);
  if (!globalThis.RTCPeerConnection) throw failure('browser-incompatible', 'This browser cannot play online');
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 1 });
    let done = false;
    const fail = e => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(e); };
    const timer = setTimeout(() => fail(failure('timeout', 'No answer from that room')), TIMEOUT);
    peer.on('open', () => {
      const conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
      conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); resolve(peerLink(conn, peer)); });
    });
    peer.on('error', e => fail(failure(e.type || 'network', e.message)));
  });
}

// --- tabs of one browser: a BroadcastChannel per room ---------------------------------------
// Everyone on the channel sees every post: { from, to, kind, data }. A guest knocks, the host
// opens; 'data' carries a message, 'close' ends a link. A new host first asks whether the room
// is taken.

const channel = code => new BroadcastChannel(`cube-crawler-${code}`);
const randomId = () => Math.random().toString(36).slice(2, 10);

function localRoom(code, onGuest) {
  const ch = channel(code), me = randomId(), links = new Map();
  return new Promise((resolve, reject) => {
    let open = false;
    ch.onmessage = ({ data: d }) => {
      if (d.kind === 'who' && open) { ch.postMessage({ from: me, to: d.from, kind: 'here' }); return; }
      if (d.kind === 'knock' && open) {
        const link = makeLink(m => ch.postMessage({ from: me, to: d.from, kind: 'data', data: m }),
          () => { ch.postMessage({ from: me, to: d.from, kind: 'close' }); links.delete(d.from); });
        links.set(d.from, link);
        ch.postMessage({ from: me, to: d.from, kind: 'open' });
        onGuest(link);
        return;
      }
      if (d.to !== me) return;
      if (d.kind === 'here' && !open) { open = null; ch.close(); reject(failure('unavailable-id', 'Room code taken')); return; }
      if (d.kind === 'data') links.get(d.from)?.onmessage?.(d.data);
      if (d.kind === 'close') { links.get(d.from)?.lost(); links.delete(d.from); }
    };
    ch.postMessage({ from: me, kind: 'who' });
    setTimeout(() => {
      if (open !== false) return;
      open = true;
      resolve({ close() { for (const l of links.values()) l.close(); ch.close(); } });
    }, 250);
  });
}

function localJoin(code) {
  const ch = channel(code), me = randomId();
  return new Promise((resolve, reject) => {
    let host = null, link = null;
    const timer = setTimeout(() => { if (!link) { ch.close(); reject(failure('peer-unavailable', 'No room with that code')); } }, 1500);
    ch.onmessage = ({ data: d }) => {
      if (d.to !== me) return;
      if (d.kind === 'open' && !link) {
        clearTimeout(timer);
        host = d.from;
        link = makeLink(m => ch.postMessage({ from: me, to: host, kind: 'data', data: m }),
          () => { ch.postMessage({ from: me, to: host, kind: 'close' }); ch.close(); });
        resolve(link);
      }
      if (!link || d.from !== host) return;
      if (d.kind === 'data') link.onmessage?.(d.data);
      if (d.kind === 'close') { link.lost(); ch.close(); }
    };
    ch.postMessage({ from: me, kind: 'knock' });
  });
}
