// Prepare the model first, then commit visual + inventory equipment together. The hand holds the
// weapon, or a flask readied to throw (core/inventory.js readyItem; game/throws.js) instead.
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { ITEMS } from '../core/items.js';
import { ownedItem, equipItem, addInstance, readyItem } from '../core/inventory.js';
import { rollWeapon } from '../core/gear/generate.js';
import { displayName } from '../core/gear/stats.js';
import { dropAtFeet } from './loot.js';
import { equippedWeapon, canChangeWeapon, readiedFlask } from '../core/combat.js';
import { prepareSword, equipSword, character } from '../render/character.js';
import { loadThing, wear, takeOff } from '../render/figure.js';

let request = 0;
export const equipmentAllowed = () => !state.transitioning && !state.equipping && canChangeWeapon(player);
export async function syncEquippedWeapon() {
  const token = ++request, inventory = player.inventory, def = readiedFlask(player) ?? equippedWeapon(player);
  state.equipping = true;
  try {
    const model = def ? await prepareSword(def.model) : null;
    if (token === request && inventory === player.inventory) equipSword(model);
  } finally { if (token === request) state.equipping = false; }
}
export async function equipOwnedWeapon(instanceId) {
  if (!equipmentAllowed()) { setStatus('Finish your current action before changing weapons'); return false; }
  const inventory = player.inventory, slot = ownedItem(inventory, instanceId), def = ITEMS[slot?.itemId];
  if (!def?.weapon) return false;
  const token = ++request;
  state.equipping = true;
  try {
    const model = await prepareSword(def.model);
    if (token !== request || inventory !== player.inventory || !canChangeWeapon(player) || state.transitioning
        || ownedItem(inventory, instanceId) !== slot) return false;
    equipItem(inventory, instanceId); equipSword(model); sfx('equip');
    setStatus(`Equipped ${displayName(slot)}`);
    return true;
  } catch (error) {
    console.error('weapon failed to load', error);
    setStatus('Could not load this weapon; your previous sword is still equipped');
    return false;
  } finally { if (token === request) state.equipping = false; }
}
// Take flask `itemId` in hand to throw it (null: put it away, the weapon back in hand).
export async function readyFlask(itemId) {
  const inventory = player.inventory, def = itemId && ITEMS[itemId];
  if (!equipmentAllowed()) { setStatus('Finish your current action first'); return false; }
  if (itemId && !readyItem(inventory, itemId)) { setStatus(`No ${def?.name ?? 'flask'} left`); return false; }
  if (!itemId) readyItem(inventory, null);
  await syncEquippedWeapon();
  if (inventory !== player.inventory) return false;
  sfx(itemId ? 'toss' : 'equip', { volume: 0.6 });
  // (touch controls, game/touch.js: aimed with the action button)
  const how = globalThis.document?.body.classList.contains('touch') ? 'aim with the action button' : 'click where to throw it';
  setStatus(itemId ? `${def.name} in hand: ${how}` : `${displayName(equippedItemOf(inventory)) || 'Weapon'} back in hand`);
  return true;
}
const equippedItemOf = inv => ownedItem(inv, inv.equipped);
// dev tools (?dev=1): roll a weapon of this base, rarity and item level into the bag and
// equip it, or drop one at your feet
const devRoll = (itemId, rarity, ilvl) => rollWeapon(Math.random, ilvl, { itemId, rarity });
export async function devSwapWeapon(itemId, rarity = 'common', ilvl = 1) {
  if (!state.dev || !ITEMS[itemId]?.weapon || !equipmentAllowed()) return false;
  const id = addInstance(player.inventory, devRoll(itemId, rarity, ilvl));
  if (!id) { setStatus('Inventory is full'); return false; }
  return equipOwnedWeapon(id);
}
export function devDropWeapon(itemId, rarity = 'rare', ilvl = 8) {
  if (!state.dev || !ITEMS[itemId]?.weapon) return null;
  return dropAtFeet(devRoll(itemId, rarity, ilvl));
}
// dev tools: put a worn thing on the player, or take it off again (null). Headwear only for
// now: the player's hands carry the weapon and the animator has no carry poses for them yet.
export async function devWear(itemId) {
  if (!state.dev || !character.ready) return false;
  if (itemId == null) { takeOff(character, 'head'); return true; }
  if (ITEMS[itemId]?.slot !== 'head') { setStatus('Only headwear on the player for now'); return false; }
  await loadThing(itemId);
  return wear(character, itemId);
}
