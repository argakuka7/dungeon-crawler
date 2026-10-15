// Playing together: a blow that would kill you leaves you lying where you fell instead
// (downed). The enemies leave you be. Your friend helps you up by standing next to you for
// REVIVE_TIME; you get up with a share of your health. If nobody comes within BLEED_OUT, the
// friend leaves the cube or goes down too, you are back at the entry as after any death (R
// gives up at once). Alone, a death is a death (game/flow.js die).
import { player, setStatus } from './state.js';
import { online } from '../net/online.js';
import { die } from './flow.js';
import { standUp } from './ragdoll.js';
import { sfx } from '../audio/sfx.js';

export const REVIVE_TIME = 2;      // s the friend stands next to you
export const REVIVE_REACH = 1.3;   // cells: how near that is
export const REVIVE_HP = 0.3;      // the share of the maximum health you get up with
export const BLEED_OUT = 30;       // s you can lie and wait

// is the friend here and on their feet, to help?
const helper = () => { const b = online.buddy; return b?.here && !b.out && b.hp > 0 ? b : null; };

// the ragdoll of a fatal blow came to rest: lie there (true), or not (alone: false, die)
export function goDown() {
  if (!helper()) return false;
  player.down = { t: 0, revive: 0 };
  setStatus(`Down! ${online.partner?.name ?? 'Your friend'} can help you up`);
  return true;
}

// every step while down (game/ragdoll.js stepRagdoll)
export function tickDown(dt) {
  const d = player.down, b = helper();
  d.t += dt;
  if (!b || d.t >= BLEED_OUT) { player.down = null; player.ragdoll = null; die(); return; }
  const near = Math.hypot(b.x - player.x, b.z - player.z) < REVIVE_REACH && Math.abs(b.y - player.y) < 1.2;
  d.revive = near ? d.revive + dt : Math.max(0, d.revive - dt);
  if (d.revive < REVIVE_TIME) return;
  const r = player.ragdoll;
  player.down = null; player.ragdoll = null;
  player.hp = Math.ceil(player.maxHp * REVIVE_HP);
  sfx('levelUp');
  setStatus('Back on your feet!');
  standUp(r);
}

// what the others are told about it (net/session.js me.ko): [revived %, s left] or 0
export const downInfo = () => player.down ? [Math.round(100 * player.down.revive / REVIVE_TIME), Math.ceil(BLEED_OUT - player.down.t)] : 0;
