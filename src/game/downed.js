// Playing together: a blow that would kill you leaves you lying where you fell instead
// (downed). The enemies leave you be. A friend helps you up by standing next to you for
// REVIVE_TIME; you get up with a share of your health. If nobody comes within BLEED_OUT, or
// no friend is left in the cube on their feet, you are back at the entry as after any death
// (R gives up at once). Alone, a death is a death (game/flow.js die).
import { player, setStatus } from './state.js';
import { online } from '../net/online.js';
import { die } from './flow.js';
import { standUp } from './ragdoll.js';
import { sfx } from '../audio/sfx.js';
import { REVIVE_TIME, REVIVE_REACH, REVIVE_HP, BLEED_OUT } from '../core/downed.js';
import { cleanBy } from '../core/chronicle.js';
import { log } from './log.js';
import { tr, msg } from '../i18n/i18n.js';

// the friends here and on their feet, who can help
const helpers = () => online.buddies.filter(b => b.here && !b.out && b.hp > 0);
// who can help you up, said in a few words
export const helperName = (list = helpers()) => list.length === 1 ? list[0].name : tr('A friend');

// the ragdoll of a fatal blow came to rest: lie there (true), or not (alone: false, die)
// learn: network.html#help-up (see learn/README.md)
export function goDown() {
  const list = helpers();
  if (!list.length) return false;
  player.down = { t: 0, revive: 0, by: null };
  setStatus(tr('Down! {who} can help you up', { who: helperName(list) }));
  log('down', { cause: player.lastHurt?.reason || msg('Knocked out'), by: cleanBy(player.lastHurt?.by) }, { share: true });
  return true;
}

// every step while down (game/ragdoll.js stepRagdoll)
// learn: network.html#help-up (see learn/README.md)
export function tickDown(dt) {
  const d = player.down, list = helpers();
  d.t += dt;
  if (!list.length || d.t >= BLEED_OUT) { player.down = null; die(); return; }
  const near = list.find(b => Math.hypot(b.x - player.x, b.z - player.z) < REVIVE_REACH && Math.abs(b.y - player.y) < 1.2);
  d.revive = near ? d.revive + dt : Math.max(0, d.revive - dt);
  d.by = near?.name ?? d.by;   // who is helping (for the note over us, render/playerbar.js)
  if (d.revive < REVIVE_TIME) return;
  const r = player.ragdoll;
  player.down = null; player.ragdoll = null;
  player.hp = Math.ceil(player.maxHp * REVIVE_HP);
  sfx('levelUp');
  setStatus(tr('Back on your feet!'));
  log('up', { by: d.by }, { share: true });
  standUp(r);
}

// what the others are told about it (net/session.js me.ko): [revived %, s left] or 0
export const downInfo = () => player.down ? [Math.round(100 * player.down.revive / REVIVE_TIME), Math.ceil(BLEED_OUT - player.down.t)] : 0;
