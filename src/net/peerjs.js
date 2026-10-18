// The carrier over the internet (net/transport.js): a WebRTC data channel set up by PeerJS
// (vendor/peerjs). The host registers its room under peerId(code) with the public PeerJS
// broker, the guest asks the broker for it, and from then on the two browsers talk directly
// (encrypted). The broker only introduces them. PeerJS is loaded the first time someone hosts
// or joins.
//
// PeerJS only carries the wire's text frames (net/wire.js), unchanged: serialization 'raw'.
// (Its 'json' serialization drops messages of 16300 bytes or more and closes the connection.)
// Nothing else here knows about PeerJS: another carrier can take its place.
import { peerId, PROTOCOL } from './protocol.js';
import { wireLink } from './wire.js';

const TIMEOUT = 20000;   // ms to wait for the broker or the other side
const SERIALIZATION = 'raw';
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

// PeerJS data connection -> link; peer: the guest's own peer, destroyed with the link
function peerLink(conn, peer = null) {
  const { link, receive, lost } = wireLink({
    send: text => { if (conn.open) conn.send(text); },
    close: () => { conn.close(); peer?.destroy(); },
  });
  conn.on('data', receive);
  conn.on('close', () => { peer?.destroy(); lost(); });
  conn.on('error', e => { console.warn('link error', e); link.close(); });
  return link;
}

// A game from before the wire (PROTOCOL 10 and older) connects with 'json': tell it, in its
// own words, that the versions differ (it says "both reload the page"), and hang up.
function refuseOld(conn) {
  conn.send({ t: 'version', v: PROTOCOL });
  setTimeout(() => conn.close(), 300);
}

const usable = () => { if (!globalThis.RTCPeerConnection) throw failure('browser-incompatible', 'This browser cannot play online'); };

export async function openRoom(code, onGuest) {
  usable();
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId(code), { debug: 1 });
    let open = false;
    const timer = setTimeout(() => { if (!open) { peer.destroy(); reject(failure('timeout', 'The broker did not answer')); } }, TIMEOUT);
    peer.on('open', () => { open = true; clearTimeout(timer); resolve({ close: () => peer.destroy() }); });
    peer.on('connection', conn => conn.on('open', () => conn.serialization === SERIALIZATION ? onGuest(peerLink(conn)) : refuseOld(conn)));
    peer.on('error', e => {
      if (open) { console.warn('room error', e); return; }
      clearTimeout(timer); peer.destroy(); reject(failure(e.type || 'network', e.message));
    });
    // lost the broker: the friend already connected stays connected, new ones need it again
    peer.on('disconnected', () => { if (open && !peer.destroyed) setTimeout(() => peer.destroyed || peer.reconnect(), 2000); });
  });
}

export async function joinRoom(code) {
  usable();
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 1 });
    let done = false;
    const fail = e => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(e); };
    const timer = setTimeout(() => fail(failure('timeout', 'No answer from that room')), TIMEOUT);
    peer.on('open', () => {
      const conn = peer.connect(peerId(code), { reliable: true, serialization: SERIALIZATION });
      conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); resolve(peerLink(conn, peer)); });
    });
    peer.on('error', e => fail(failure(e.type || 'network', e.message)));
  });
}
