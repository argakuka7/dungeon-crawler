// The game's texts that live in data tables rather than in tr('...') calls: tools/i18n.mjs reads
// them from here, so a new item or enemy is a new message to translate. A new table of texts
// belongs here too. Each entry: where they come from -> the English texts.
import { GROUPS, ACTIONS, KEY_NAMES } from '../core/keybinds.js';
import { ITEMS, COINS } from '../core/items.js';
import { RARITIES } from '../core/gear/rarities.js';
import { AFFIXES } from '../core/gear/affixes.js';
import { ENCHANTS } from '../core/gear/enchants.js';
import { ENCHANTER_SAYS, SMITH_SAYS, ENCHANTED_SAYS, SOLD_SAYS, REROLLED_SAYS } from '../core/crafting.js';
import { SHOPS } from '../core/shops.js';

const items = Object.values(ITEMS);
export function sources() {
  return {
    'src/core/keybinds.js GROUPS': GROUPS,
    'src/core/keybinds.js ACTIONS': ACTIONS.map(a => a.label),
    'src/core/keybinds.js KEY_NAMES': Object.values(KEY_NAMES),
    'src/core/items.js names': items.flatMap(i => [i.name, i.together?.name]).filter(Boolean),
    'src/core/items.js descriptions': items.flatMap(i => [i.description, i.together?.description]).filter(Boolean),
    'src/core/items.js COINS': COINS.map(c => `coin|${c.suffix}`),
    'src/core/gear/rarities.js': RARITIES.map(r => r.name),
    'src/core/gear/affixes.js': AFFIXES.flatMap(a => [a.name, a.text]),
    'src/core/gear/enchants.js': ENCHANTS.flatMap(e => [e.name, e.text, e.quip]),
    'src/core/crafting.js': [...new Set([ENCHANTER_SAYS, SMITH_SAYS, ENCHANTED_SAYS].flatMap(Object.values).concat(SOLD_SAYS, REROLLED_SAYS))],
    'src/core/shops.js': Object.values(SHOPS).flatMap(s => [s.title, s.trade, s.hello]),
  };
}
