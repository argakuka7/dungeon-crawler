// What the villagers sell or do (world/town.js VILLAGERS, by name). Clicking a villager with a
// shop walks up to them and opens the bag with their wares beside it (game/inventory.js); an item
// is bought for its `price` in copper (core/items.js), change given. A shop with a `service`
// works on your weapons instead (core/crafting.js): the Enchanter's wares are her enchantments
// (`wares`: their ids), the Smith re-rolls the affix you point at. `hello`: what they say when
// the bag opens. Pure.
import { ITEMS, POTIONS } from './items.js';
import { addItem, spendCopper, copperTotal } from './inventory.js';
import { ENCHANTS } from './gear/enchants.js';

export const SHOPS = {
  // the potion seller in the wizard hat: every potion and flask there is
  alchemist: { title: 'Alchemist', trade: 'Potions', wares: POTIONS.map(p => p.id), hello: 'what will it be?' },
  // the one with the crystal ball: an enchantment on a weapon, for copper and crystals
  enchanter: { title: 'Enchanter', trade: 'Enchantments', service: 'enchant', wares: ENCHANTS.map(e => e.id),
    hello: 'pick a weapon from your bag, then an enchantment.' },
  // at the anvil: one affix of a weapon re-rolled, for copper
  smith: { title: 'Smith', trade: 'Re-rolls', service: 'reroll', wares: [], hello: 'show me a weapon, and the line you want hammered.' },
};
// how close (cells) the player has to be to a villager to trade
export const TRADE_REACH = 1.4;
export const shopOf = villager => SHOPS[villager?.name] ?? null;
export const priceOf = itemId => ITEMS[itemId]?.price ?? null;
// Buy `count` of `itemId`, all or nothing: 'ok', or why not: 'poor' (not enough coins),
// 'full' (no room in the bag), 'unknown' (it has no price)
export function buy(inv, itemId, count = 1) {
  const price = priceOf(itemId);
  if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(count) || count < 1) return 'unknown';
  if (copperTotal(inv) < price * count) return 'poor';
  if (!addItem(inv, itemId, count)) return 'full';
  spendCopper(inv, price * count);
  return 'ok';
}
