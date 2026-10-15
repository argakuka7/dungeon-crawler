// Loot on the ground: what a defeated enemy drops and what the player can pick up. Plain data,
// no renderer (see game/loot.js and render/loot.js). Weapons are generated (core/gear/).
import { COINS, ITEMS } from './items.js';
import { coinCounts, whole } from './inventory.js';

export const WALK_RADIUS = 0.45;   // walking over a pickup takes it
export const MAGNET_RADIUS = 1;    // coins pull themselves in this close (cells)
export const COLLECT_RADIUS = 4;   // C sucks up stackable pickups this close (cells)
export const COLLECT_HEIGHT = 1.5; // ... and at most this far above or below
const MAX_PILES = 4;               // per coin kind: a few coins scatter, larger sums share piles

// copper -> [{ itemId, count }]: gold, silver and copper coins, each kind split into up to
// MAX_PILES piles that together hold exactly the amount
export function coinDrops(copper) {
  const out = [];
  coinCounts(whole(copper)).forEach((n, i) => {
    const piles = Math.min(n, MAX_PILES);
    for (let k = 0; k < piles; k++) out.push({ itemId: COINS[i].id, count: Math.floor(n / piles) + (k < n % piles ? 1 : 0) });
  });
  return out;
}

export const stackable = itemId => ITEMS[itemId].stackLimit > 1;
export const isCoin = itemId => ITEMS[itemId].category === 'currency';
export const isWeapon = itemId => !!ITEMS[itemId].weapon;
// walking over takes coins and stackables; weapons wait for a click or the inventory
export const walkTakes = p => !isWeapon(p.itemId);
// what gets a name label (X) and can be clicked to pick up: everything but coins
export const labelled = p => !isCoin(p.itemId);

// can C collect pickup p from (x, y, z)?
export const inCollectReach = (p, x, y, z) => stackable(p.itemId)
  && Math.hypot(p.x - x, p.z - z) <= COLLECT_RADIUS && Math.abs(p.y - y) <= COLLECT_HEIGHT;
// does coin p pull itself to the player at (x, y, z)?
export const inMagnetReach = (p, x, y, z) => isCoin(p.itemId)
  && Math.hypot(p.x - x, p.z - z) <= MAGNET_RADIUS && Math.abs(p.y - y) <= COLLECT_HEIGHT;
// is pickup p close enough to the player at (x, y, z) to take from the inventory? (C's reach)
export const inFloorReach = (p, x, y, z) => labelled(p)
  && Math.hypot(p.x - x, p.z - z) <= COLLECT_RADIUS && Math.abs(p.y - y) <= COLLECT_HEIGHT;
// is the player at (x, y, z) standing on pickup p?
export const steppedOn = (p, x, y, z) => Math.hypot(p.x - x, p.z - z) <= WALK_RADIUS && Math.abs(p.y - y) <= 0.8;
