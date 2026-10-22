// What an item is called right now. Some tools go by another name while friends play along
// (core/items.js `together`: the room portal scroll is the teleport scroll then); it is the same
// item all the same, in the bag, on the quick bar and in the save. What shows an item's name or
// description asks here; core/gear/stats.js displayName stays the plain one.
import { ITEMS } from '../core/items.js';
import { displayName } from '../core/gear/stats.js';
// All in the language of the moment.
import { together } from '../net/online.js';
import { tr } from '../i18n/i18n.js';

const variant = def => (together() && def?.together) || null;
export const itemName = item => { const v = variant(ITEMS[item?.itemId]); return v ? tr(v.name) : displayName(item); };
export const defName = def => tr(variant(def)?.name ?? def?.name ?? '');
export function defDescription(def) {
  const d = variant(def)?.description ? variant(def) : def;
  return d?.description ? tr(d.description, d.params) : '';
}
