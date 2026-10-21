// The game's texts that live in data tables rather than in tr('...') calls: tools/i18n.mjs reads
// them from here, so a new item or enemy is a new message to translate. A new table of texts
// belongs here too. Each entry: where they come from -> the English texts.
import { GROUPS, ACTIONS, KEY_NAMES } from '../core/keybinds.js';

export function sources() {
  return {
    'src/core/keybinds.js GROUPS': GROUPS,
    'src/core/keybinds.js ACTIONS': ACTIONS.map(a => a.label),
    'src/core/keybinds.js KEY_NAMES': Object.values(KEY_NAMES),
  };
}
