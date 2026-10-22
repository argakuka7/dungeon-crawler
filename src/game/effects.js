// Over the quick bar: what the potions you drank are doing (core/potions.js activeEffects), each
// as its potion's picture with the seconds left and a bar running down, blinking the last few
// seconds; and a chip while you are poisoned (core/status.js).
import { player, state } from './state.js';
import { ITEMS } from '../core/items.js';
import { activeEffects } from '../core/potions.js';
import { pictureImg } from '../render/itemviews.js';
import { defName, defDescription } from './itemnames.js';
import { tr } from '../i18n/i18n.js';

const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

const row = document.getElementById('effects');
let shown = '';

export function updateEffects() {
  const list = state.map ? activeEffects(player, state.time) : [];
  const poison = player.toxic ? Math.max(0, Math.ceil(player.toxic.time - player.toxic.t)) : 0;
  const next = list.map(f => `${f.itemId}:${Math.ceil(f.left)}:${Math.round(f.share * 40)}`).join() + `|${poison}`;
  if (next === shown) return;
  shown = next;
  row.innerHTML = (poison ? `<div class="fx status" title="${esc(tr('Poisoned: an antidote cures it'))}">${esc(tr('poisoned {n}s', { n: poison }))}</div>` : '')
    + list.map(f => {
      const def = ITEMS[f.itemId], left = Math.ceil(f.left);
      return `<div class="fx${left <= 5 ? ' ending' : ''}" title="${esc(`${defName(def)}: ${defDescription(def)}`)}">${pictureImg(def.id)}`
        + `<span class="left">${left}</span><span class="bar" style="width:${Math.round(f.share * 100)}%"></span></div>`;
    }).join('');
}
