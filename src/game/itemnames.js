// What an item is called right now. Some tools go by another name while friends play along
// (core/items.js `together`: the room portal scroll is the teleport scroll then); it is the same
// item all the same, in the bag, on the quick bar and in the save. What shows an item's name or
// description asks here; core/gear/stats.js displayName stays the plain one.
import { ITEMS } from '../core/items.js';
import { displayName } from '../core/gear/stats.js';
import { together } from '../net/online.js';

const variant = def => (together() && def?.together) || null;
export const itemName = item => variant(ITEMS[item?.itemId])?.name ?? displayName(item);
export const defName = def => variant(def)?.name ?? def?.name ?? '';
export const defDescription = def => variant(def)?.description ?? def?.description ?? '';
