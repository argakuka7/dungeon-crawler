// The action key, F or Enter (game/input.js, game/console.js): does the first thing that works
// where the player stands:
//   1. open the closed treasure chest beside them (game/chests.js)
//   2. talk to the villager beside them: one who trades opens their shop (game/inventory.js)
//   3. collect the coins and items around them (game/loot.js; four cells across)
// useAction says whether it did anything: when not, F goes to a friend and Enter opens the chat.
import { player, state } from './state.js';
import { chestInReach, openChest } from './chests.js';
import { canTrade } from './orders.js';
import { openShop } from './inventory.js';
import { canCollect, requestCollect } from './loot.js';
import { shopOf } from '../core/shops.js';

// the trading villager the player stands next to (the nearest one), if any
function villagerInReach() {
  let best = null, bestD = Infinity;
  for (const v of state.map?.villagers ?? []) {
    if (!shopOf(v) || !canTrade(v)) continue;
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < bestD) { best = v; bestD = d; }
  }
  return best;
}

export function useAction() {
  if (state.mode !== 'play' || !state.map || state.transitioning || state.inventoryOpen
    || player.down || player.ragdoll || player.hp <= 0) return false;
  const chest = chestInReach();
  if (chest) return openChest(chest);
  const villager = villagerInReach();
  if (villager) { openShop(villager); return true; }
  if (canCollect()) { requestCollect(); return true; }
  return false;
}
