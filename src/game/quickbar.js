// The quick bar: six slots along the bottom of the screen, on keys 1-6 (or a click). A slot
// points at a bag item (core/inventory.js assignBar): a weapon is equipped, a usable item used
// (the town portal scroll starts its cast, game/townportal.js; a potion is drunk, core/
// potions.js; a flask is taken in hand to throw, or put away again, game/equipment.js). With
// the inventory open, 1-6 or a click puts the selected bag item on that slot instead (again on
// the same slot: off; the bar pulses while such an item is selected). A potion's slot fills
// while its cooldown runs. With touch controls (game/touch.js) the bar sits at the top, with a
// bag button at its end for the inventory and a menu button for the Esc menu (game/escmenu.js).
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { ITEMS } from '../core/items.js';
import { BAR_SIZE, barEntry, ownedItem, removeItem } from '../core/inventory.js';
import { drinkPotion, cooldownShare } from '../core/potions.js';
import { floatText } from '../render/floattext.js';
import { displayName } from '../core/gear/stats.js';
import { rarityOf } from '../core/gear/rarities.js';
import { equipOwnedWeapon, readyFlask } from './equipment.js';
import { useTownPortal } from './townportal.js';
import { assignSelectedToBar, toggleInventory, setInventoryOpen, barReady } from './inventory.js';
import { toggleMenu } from './escmenu.js';

const bar = document.getElementById('quickbar');
bar.innerHTML = Array.from({ length: BAR_SIZE }, (_, i) => `<button class="qb-slot" data-bar="${i}" tabindex="-1">`
  + `<img alt="" hidden><span class="qb-cast"></span><span class="qb-key">${i + 1}</span><span class="qb-count"></span></button>`).join('')
  + '<button class="qb-bag" data-bag tabindex="-1" title="Inventory (I)" aria-label="Inventory"><svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M9 7V5.5a3 3 0 0 1 6 0V7h2.6a1 1 0 0 1 1 .9l1.2 11A1 1 0 0 1 18.8 20H5.2a1 1 0 0 1-1-1.1l1.2-11a1 1 0 0 1 1-.9zm1.6 0h2.8V5.5a1.4 1.4 0 0 0-2.8 0z"/></svg></button>'
  + '<button class="qb-menu" data-menu tabindex="-1" title="Menu (Esc)" aria-label="Menu"><svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M4 6h16v2.2H4zm0 4.9h16v2.2H4zm0 4.9h16V18H4z"/></svg></button>';
const buttons = [...bar.querySelectorAll('[data-bar]')];
let signature = '', shown = null;   // shown: the inventory drawn (a new run has a new one)

// use the bag item (from the bar or the inventory's Use button)
export function useItem(instanceId) {
  const inv = player.inventory, slot = ownedItem(inv, instanceId), def = ITEMS[slot?.itemId];
  if (!def || state.transitioning) return false;
  if (def.weapon) {
    // the weapon's own slot with a flask in hand: put the flask away
    if (inv.equipped === instanceId && !inv.readied) { setStatus(`${displayName(slot)} is already equipped`); return false; }
    if (inv.equipped === instanceId) return readyFlask(null);
    equipOwnedWeapon(instanceId);
    return true;
  }
  if (def.use === 'townPortal') return useTownPortal();
  if (def.use === 'drink') return drink(slot, def);
  if (def.use === 'throw') return readyFlask(inv.readied === def.id ? null : def.id);
  setStatus(`${def.name} cannot be used yet`);
  return false;
}

const BUFF_NAMES = { moveSpeed: 'faster on your feet', attackSpeed: 'quicker attacks', damage: 'harder hits', jump: 'higher jumps' };
function drink(slot, def) {
  if (player.ragdoll) { setStatus('Not while knocked down'); return false; }
  const did = drinkPotion(player, def, state.time);
  if (typeof did === 'string') {
    setStatus({ full: 'Already at full health', wait: 'Not so fast', dead: '' }[did]);
    return false;
  }
  removeItem(player.inventory, slot.instanceId, 1);
  const over = q => q.set(player.x, player.visY + 1.3, player.z);
  if (did.heal !== undefined) {
    sfx('drink');
    floatText(`+${Math.round(did.heal)}`, over, { color: '#ff6b6b', life: 1 });
    setStatus(`${def.name}: +${Math.round(did.heal)} health`);
  } else {
    sfx('drink', { pitch: 1.15 }); sfx('buff');
    const text = did.buff ? BUFF_NAMES[did.buff] : did.cured ? 'poison cured' : 'poison kept off';
    floatText(text, over, { color: '#ffd56a', size: 0.2, life: 1.2 });
    setStatus(`${def.name}: ${text} for ${def.effect.time} seconds`);
  }
  return true;
}

export function useBarSlot(i) {
  const e = barEntry(player.inventory, i);
  if (!e) return false;
  if (!e.slot) { setStatus(`No ${ITEMS[e.itemId].name} left`); return false; }
  sfx('use', { volume: 0.6 });
  return useItem(e.slot.instanceId);
}

// keys 1-6: use the slot, or assign to it while the inventory is open
export function barKey(i) {
  if (state.inventoryOpen) assignSelectedToBar(i);
  else useBarSlot(i);
}

bar.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('[data-bag]')) { e.preventDefault(); toggleInventory(); return; }
  if (e.target.closest('[data-menu]')) { e.preventDefault(); setInventoryOpen(false); toggleMenu(); return; }
  const b = e.target.closest('[data-bar]');
  if (!b) return;
  e.preventDefault();   // no focus: Space and Enter must stay with the game
  barKey(Number(b.dataset.bar));
});

function draw() {
  const inv = player.inventory;
  buttons.forEach((b, i) => {
    const e = barEntry(inv, i), def = e && ITEMS[e.itemId], img = b.querySelector('img');
    img.hidden = !def;
    if (def && img.getAttribute('src') !== def.icon) img.src = def.icon;
    const glow = e?.slot?.gen && rarityOf(e.slot).glow;
    b.style.setProperty('--rarity', glow ? rarityOf(e.slot).css : 'transparent');
    b.classList.toggle('rare', !!glow);
    b.classList.toggle('equipped', !!e?.slot && e.slot.instanceId === inv.equipped && !inv.readied);
    b.classList.toggle('in-hand', !!e && e.itemId === inv.readied);
    b.classList.toggle('none-left', !!e && !e.slot);
    b.querySelector('.qb-count').textContent = def && def.stackLimit > 1 ? String(e.count) : '';
    b.title = def ? `${e.slot ? displayName(e.slot) : def.name} (${i + 1})` : `Empty (${i + 1}): select a bag item in the inventory and press ${i + 1}`;
  });
}

// every frame: redraw on inventory changes, and fill the slot being cast
export function updateQuickbar() {
  const inv = player.inventory, next = `${inv.version}:${inv.equipped}:${inv.readied}`;
  if (next !== signature || inv !== shown) { signature = next; shown = inv; draw(); }
  bar.classList.toggle('assigning', state.inventoryOpen);
  bar.classList.toggle('ready', barReady());
  const c = state.cast;
  buttons.forEach((b, i) => {
    const e = barEntry(inv, i), def = e && ITEMS[e.itemId], on = !!c && def?.use === c.kind;
    const wait = def?.cooldown ? cooldownShare(player, def.id, state.time) : 0;
    b.classList.toggle('casting', on);
    b.classList.toggle('cooling', wait > 0);
    b.querySelector('.qb-cast').style.height = on ? `${Math.min(1, c.t / c.duration) * 100}%` : wait > 0 ? `${Math.min(1, wait) * 100}%` : '0';
  });
}
