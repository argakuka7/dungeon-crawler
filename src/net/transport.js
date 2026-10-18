// The line between two games: what carries the messages of net/session.js. A link:
// link.send(message), link.close(), and the callbacks link.onmessage(message) and
// link.onclose() (called once, whoever closed it). A message is a plain object with a type `t`
// (net/protocol.js), of any size up to net/wire.js MESSAGE_BYTES: the wire cuts it into frames
// a carrier takes and puts it together again on the other side.
//
// Carriers: over the internet a WebRTC data channel set up by PeerJS (net/peerjs.js: the host
// registers its room code with a public broker, the guest asks the broker for it, then the two
// browsers talk directly, encrypted); with `local` (?net=local) a BroadcastChannel between tabs
// of this browser (net/tabs.js), for testing without a network.
//
// A carrier is { openRoom(code, onGuest) -> Promise<{ close() }>, joinRoom(code) -> Promise<link> }
// and moves the wire's text frames, in order and reliably. It makes its links with wireLink
// (net/wire.js) and nothing else: links that did not come from there are refused here.
//
// Failures reject with an Error whose `type` says why: 'unavailable-id' (the code is taken),
// 'peer-unavailable' (no room with that code), 'browser-incompatible', 'network', 'timeout'.
import * as peerjs from './peerjs.js';
import * as tabs from './tabs.js';
import { isWireLink } from './wire.js';

const carrier = local => local ? tabs : peerjs;
const checked = link => {
  if (!isWireLink(link)) { link?.close?.(); throw new TypeError('A carrier handed out a link not made by wireLink'); }
  return link;
};

// Opens room `code`; onGuest(link) for everyone who joins. Resolves with { close() }.
export function openRoom(code, onGuest, { local = false } = {}) {
  return carrier(local).openRoom(code, link => onGuest(checked(link)));
}

// Joins room `code`. Resolves with the link to its host.
export async function joinRoom(code, { local = false } = {}) {
  return checked(await carrier(local).joinRoom(code));
}
