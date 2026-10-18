// The carrier between tabs of this browser (?net=local, net/transport.js): a BroadcastChannel
// per room, for testing without a network. It carries the wire's text frames (net/wire.js) like
// the internet does, so the same messages get cut into the same pieces here.
//
// Everyone on the channel sees every post: { from, to, kind, data }. A guest knocks, the host
// opens; 'data' carries a frame, 'close' ends a link. A new host first asks whether the room
// is taken.
import { wireLink } from './wire.js';

const failure = (type, message) => Object.assign(new Error(message), { type });
const channel = code => new BroadcastChannel(`cube-crawler-${code}`);
const randomId = () => Math.random().toString(36).slice(2, 10);

export function openRoom(code, onGuest) {
  const ch = channel(code), me = randomId(), links = new Map();
  return new Promise((resolve, reject) => {
    let open = false;
    ch.onmessage = ({ data: d }) => {
      if (d.kind === 'who' && open) { ch.postMessage({ from: me, to: d.from, kind: 'here' }); return; }
      if (d.kind === 'knock' && open) {
        const wire = wireLink({
          send: text => ch.postMessage({ from: me, to: d.from, kind: 'data', data: text }),
          close: () => { ch.postMessage({ from: me, to: d.from, kind: 'close' }); links.delete(d.from); },
        });
        links.set(d.from, wire);
        ch.postMessage({ from: me, to: d.from, kind: 'open' });
        onGuest(wire.link);
        return;
      }
      if (d.to !== me) return;
      if (d.kind === 'here' && !open) { open = null; ch.close(); reject(failure('unavailable-id', 'Room code taken')); return; }
      if (d.kind === 'data') links.get(d.from)?.receive(d.data);
      if (d.kind === 'close') { links.get(d.from)?.lost(); links.delete(d.from); }
    };
    ch.postMessage({ from: me, kind: 'who' });
    setTimeout(() => {
      if (open !== false) return;
      open = true;
      resolve({ close() { for (const w of links.values()) w.link.close(); ch.close(); } });
    }, 250);
  });
}

export function joinRoom(code) {
  const ch = channel(code), me = randomId();
  return new Promise((resolve, reject) => {
    let host = null, wire = null;
    const timer = setTimeout(() => { if (!wire) { ch.close(); reject(failure('peer-unavailable', 'No room with that code')); } }, 1500);
    ch.onmessage = ({ data: d }) => {
      if (d.to !== me) return;
      if (d.kind === 'open' && !wire) {
        clearTimeout(timer);
        host = d.from;
        wire = wireLink({
          send: text => ch.postMessage({ from: me, to: host, kind: 'data', data: text }),
          close: () => { ch.postMessage({ from: me, to: host, kind: 'close' }); ch.close(); },
        });
        resolve(wire.link);
      }
      if (!wire || d.from !== host) return;
      if (d.kind === 'data') wire.receive(d.data);
      if (d.kind === 'close') { wire.lost(); ch.close(); }
    };
    ch.postMessage({ from: me, kind: 'knock' });
  });
}
