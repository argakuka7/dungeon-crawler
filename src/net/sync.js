// Keeping two games together (src/net/session.js). Pure: no DOM, no game state.

// How far in the past the other player is shown (ms). Their messages come about every 50 ms
// and not evenly: showing them a little late leaves two messages to blend between, so they
// move smoothly instead of jumping 20 times a second.
export const DELAY = 110;
const KEEP = 2000;   // ms of messages kept

// The other player's messages, in the order they were sent. `ts` is the sender's clock; the
// smallest (arrival - ts) seen recently is the clocks' difference plus the fastest trip over
// the network, so (now - offset) is the sender's clock as of the newest possible message.
export class Timeline {
  constructor() { this.list = []; this.offset = null; }

  push(m, now) {
    const list = this.list;
    if (list.length && m.ts <= list.at(-1).m.ts) return;   // late or twice
    list.push({ m, gap: now - m.ts });
    while (list.length > 2 && list[0].m.ts < m.ts - KEEP) list.shift();
    // the clocks may drift apart: forget offsets older than what we keep
    this.offset = Math.min(...list.map(s => s.gap));
  }

  latest() { return this.list.at(-1)?.m ?? null; }
  clear() { this.list = []; this.offset = null; }

  // the two messages around what is shown now and how far between them (0..1)
  at(now) {
    const list = this.list;
    if (!list.length) return null;
    const t = now - this.offset - DELAY;
    let i = list.findIndex(s => s.m.ts > t);
    if (i < 0) return { a: list.at(-1).m, b: list.at(-1).m, k: 0 };   // nothing newer: hold the last
    if (i === 0) return { a: list[0].m, b: list[0].m, k: 0 };
    const a = list[i - 1].m, b = list[i].m;
    return { a, b, k: (t - a.ts) / (b.ts - a.ts) };
  }
}

// the shortest turn from angle a to angle b, k of the way
export const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
