// Browser checks for click to move (game/orders.js, physics/playernav.js, physics/leaps.js):
// clicks in the `leaps` test room played out by the game's own update (the jumps, ladders and
// drops its way takes), and keys taking over. A fresh seed-3 run before and after. From the
// devtools console (with ?dev=1):
//   await (await import('./tests/browser/clickmove.js')).runClickMoveChecks()
import { idx } from '../../src/core/util.js';
import { topOf } from '../../src/core/surfaces.js';
import { SIT_IMPACT } from '../../src/core/constants.js';
import { player, state } from '../../src/game/state.js';
import { newWorld } from '../../src/game/flow.js';
import { updatePlayer } from '../../src/game/update.js';
import { clearInput } from '../../src/game/input.js';
import { goTestRoom } from '../../src/game/dev.js';
import { order, orderMove, clearOrder } from '../../src/game/orders.js';
import { LEAPS } from '../../src/cubegen/testrooms.js';
import { paused } from './combat.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const DT = 1 / 60;
// click floor f's middle, step the game until the order is done: what the way was made of
function walkTo(f, frames = 3600) {
  const at = { x: f.x + 0.5, y: topOf(f, 0.5, 0.5), z: f.z + 0.5, s: f };
  orderMove(at);
  const w = order.walk, used = new Set((w.how || []).map(h => h?.ladder ? (h.up ? 'up' : 'down') : h ? (h.drop ? 'drop' : 'jump' + h.k) : null).filter(Boolean));
  let landed = 0, climbed = false;
  const counted = player.landCount;
  for (let i = 0; i < frames && order.kind; i++) {
    updatePlayer(DT);
    climbed ||= !!player.climb;
    if (player.landCount !== counted) landed = Math.max(landed, player.landImpact);
  }
  check(!order.kind, `Walking to ${f.x}, ${f.z} never got there (at ${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)})`);
  check(player.support === f, `Walking to ${f.x}, ${f.z} ended on another floor`);
  check(landed < SIT_IMPACT && player.stun <= 0 && !player.ragdoll, `Walking to ${f.x}, ${f.z}: a hard landing`);
  return { used, climbed };
}

export async function runClickMoveChecks() {
  const results = [];
  await newWorld(3); clearInput();
  try {
    await goTestRoom('leaps', 1);
    check(state.map?.testRoom?.name === 'leaps', 'Into the leaps test room');
    await paused(async () => {
      const at = (x, z) => state.map.cols[idx(x, z)][0], { ledge, tower, pit, gap, steps } = LEAPS;
      for (const [x, z, kind, what] of [[7, 8, 'jump1', 'over the trench'], [ledge.x, 3, 'jump0', 'onto the ledge'],
        [tower.x, tower.z1, 'up', 'up the tower'], [8, 8, 'down', 'down the tower'], [12, 5, 'jump2', 'over the wide gap'],
        [pit.x0, 8, 'drop', 'into the pit'], [12, 12, 'up', 'out of the pit'], [gap[0], steps, 'jump0', 'up the steps'],
        [2, 8, 'jump1', 'home over the trench']]) {
        const r = walkTo(at(x, z));
        check(r.used.has(kind), `${what}: by ${kind} (${[...r.used]})`);
        if (kind === 'up' || kind === 'down') check(r.climbed, `${what}: climbed`);
        results.push(what);
      }
      // a key takes over, even half way through
      orderMove({ x: 12.5, y: 1, z: 5.5, s: at(12, 5) });
      for (let i = 0; i < 10; i++) updatePlayer(DT);
      check(order.kind === 'move', 'Under way');
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      updatePlayer(DT);
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
      check(!order.kind, 'A key ends the order');
      results.push('keys take over');
    });
  } finally {
    clearOrder();
    await newWorld(3); clearInput();
  }
  return results;
}
