// The inventory is a paused DOM overlay. Item/equipment rules remain renderer-free.
// I (or V, or the touch bag button) opens the bag, with a Floor column beside it when items lie
// within C's reach (and from then on while it stays open, also once something is dropped).
// Take (Enter or a double-click) moves a floor item into the bag; Drop puts a bag item down.
// You can drop every weapon, even the last one: then you cannot attack until you pick one up.
// Bound items (the portal scrolls) cannot be dropped. Keys 1-6, the Quick bar buttons in the
// details or a tap on a quick bar slot put the selected bag item on the quick bar (again on the
// same slot: off; game/quickbar.js); Use (Enter or a double-click on a bag item, after Equip)
// uses it (and closes the bag): drinks a potion, takes a flask in hand. Trading with a villager (game/orders.js) opens it with their wares in a column
// of their own (core/shops.js): Buy, Enter or a double-click buys one.
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { ITEMS, COINS } from '../core/items.js';
import { BURST_SHARE } from '../core/shots.js';
import { BAR_SIZE, equippedItem, ownedItem, assignBar, barAllowed, barIndexOf, countOf, copperTotal, formatCoins, hasRoom, autoBar } from '../core/inventory.js';
import { shopOf, priceOf, buy as buyWare } from '../core/shops.js';
import { flaskStats, cooldownLeft } from '../core/potions.js';
import { xpProgress, levelDamage } from '../core/progression.js';
import { rarityOf } from '../core/gear/rarities.js';
import { itemStats, displayName, baseLine, affixLines, weaponDps } from '../core/gear/stats.js';
import { equipmentAllowed, equipOwnedWeapon, syncEquippedWeapon } from './equipment.js';
import { floorItems, takeNow, dropFromBag } from './loot.js';
import { clearInput } from './inputstate.js';
import { cancelCast } from './townportal.js';
import { useItem } from './quickbar.js';
import { log } from './log.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// selected: { from: 'bag', id: instanceId } | { from: 'floor', id: pickup id } |
// { from: 'shop', id: item id } | null; trader: the villager whose wares are shown (or null)
let selected = null, signature = '', shown = null, previousFocus = null, floorMode = false, trader = null;

// the details' Quick bar row: one button per slot
$('inventory-bar-keys').innerHTML = Array.from({ length: BAR_SIZE }, (_, i) => `<button data-bar-key="${i}" aria-pressed="false">${i + 1}</button>`).join('');
const barButtons = [...$('inventory-bar-keys').querySelectorAll('[data-bar-key]')];
const touchOn = () => document.body.classList.contains('touch');

export const inventoryFloor = () => state.inventoryOpen && floorMode;
// villager: open with their wares (a villager with a shop) instead of the floor
export function setInventoryOpen(open, villager = null) {
  if (open && (!state.map || state.transitioning)) return;
  if (open) cancelCast(state.cast ? 'Portal cancelled' : '');
  if (open !== state.inventoryOpen) sfx(open ? 'bagOpen' : 'bagClose');
  state.inventoryOpen = open; clearInput();
  $('inventory-overlay').hidden = !open;
  if (open) {
    trader = shopOf(villager) ? villager : null;
    floorMode = !trader && floorItems().length > 0; previousFocus = document.activeElement;
    const first = floorMode && floorItems()[0], ware = trader && shopOf(trader).wares[0];
    selected = ware ? { from: 'shop', id: ware } : first ? { from: 'floor', id: first.id }
      : player.inventory.equipped ? { from: 'bag', id: player.inventory.equipped } : null;
    signature = ''; updateInventory();
    (ware ? $('inventory-shop').querySelector('[data-ware]') : first ? $('inventory-floor').querySelector('[data-floor]') : $('inventory-close')).focus();
  } else { trader = null; previousFocus?.focus(); }
}
// trade with villager v (core/shops.js): the bag with their wares beside it
export function openShop(v) {
  if (state.inventoryOpen || !shopOf(v)) return;
  setInventoryOpen(true, v);
  if (state.inventoryOpen) setStatus(`${shopOf(v).title}: what will it be?`);
}
export const toggleInventory = () => setInventoryOpen(!state.inventoryOpen);

// 1-6 with the bag open: the selected bag item onto that quick bar slot (or off it again)
export function assignSelectedToBar(i) {
  const slot = selected?.from === 'bag' && ownedItem(player.inventory, selected.id);
  if (!slot) { setStatus('Select a bag item to put it on the quick bar'); return false; }
  if (!barAllowed(slot.itemId)) { setStatus('Only weapons and usable items go on the quick bar'); return false; }
  const was = player.inventory.bar[i] && barIndexOf(player.inventory, slot) === i;
  assignBar(player.inventory, i, slot.instanceId);
  setStatus(was ? `${displayName(slot)} taken off the quick bar` : `${displayName(slot)} on quick bar slot ${i + 1}`);
  return true;
}

// a bag item that can go on the quick bar is selected (the bar calls for a tap: game/quickbar.js)
export function barReady() {
  const slot = state.inventoryOpen && selected?.from === 'bag' && ownedItem(player.inventory, selected.id);
  return !!slot && barAllowed(slot.itemId);
}

const floorPickup = id => floorItems().find(p => p.id === id) || null;
function selectedItem() {
  if (selected?.from === 'bag') return ownedItem(player.inventory, selected.id);
  if (selected?.from === 'floor') return floorPickup(selected.id);
  if (selected?.from === 'shop' && trader && shopOf(trader).wares.includes(selected.id)) return { itemId: selected.id, count: 1 };
  return null;
}
// a potion or flask: what it does (a flask's numbers at the player's level, buffs included),
// its cooldown, how many you have; in a shop its price
function potionText(item, from) {
  const def = ITEMS[item.itemId], have = countOf(player.inventory, def.id), lines = [];
  if (from === 'bag') lines.push(`Count ${have}`);
  lines.push(def.description);
  if (def.flask) {
    const f = flaskStats(def, player.level);
    if (f.blast) lines.push(`Bursts for up to ${f.blast} damage within ${f.radius} cells`);
    else lines.push(`Bursts over ${f.radius} cells`);
    if (f.burn) lines.push(`Burns for ${f.burn.damage} over ${f.burn.time} s; the ground burns ${f.patch} s`);
    if (f.toxin) lines.push(`Poisons for ${f.toxin.damage} over ${f.toxin.time} s; the cloud lingers ${f.cloud} s`);
  }
  const wait = cooldownLeft(player, def.id, state.time);
  lines.push(`One every ${def.cooldown} s${wait > 0 ? ` (ready in ${wait.toFixed(1)} s)` : ''}`);
  if (from === 'shop') lines.push(`Price ${formatCoins(def.price)} · you have ${have}`);
  return lines.join('\n');
}

// the weapon's stats as the player would swing it (the level's damage bonus included), and how
// they compare with what is equipped
function swung(item) {
  const s = itemStats(item);
  return { ...s, damage: Math.round(s.damage * levelDamage(player.level || 1)), speed: 1 / s.interval };
}
const KIND_NAMES = { sword: 'Sword', bow: 'Bow · shoots arrows', crossbow: 'Crossbow · shoots bolts', staff: 'Staff · casts spells' };
function weaponText(item) {
  const s = swung(item), r = rarityOf(item);
  const lines = [`${r.name}${item.gen ? ` · item level ${item.gen.ilvl}` : ''}`, KIND_NAMES[s.kind],
    `Damage ${s.damage} · ${s.speed.toFixed(2)} attacks per second`, `Damage per second ${Math.round(weaponDps(s))}`,
    s.ranged ? `Range ${s.range.toFixed(1)} cells` : `Reach ${s.range.toFixed(2)} cells`,
    `Critical hits ${Math.round(s.crit * 100)}% for ×${s.critDamage.toFixed(2)}`];
  if (s.pierce) lines.push(`Bolts pierce ${s.pierce} enem${s.pierce === 1 ? 'y' : 'ies'}`);
  if (s.burst) lines.push(`Bursts for ${Math.round(BURST_SHARE * 100)}% damage within ${s.burst.toFixed(2)} cells`);
  return lines.join('\n');
}
function compareText(item) {
  const eq = equippedItem(player.inventory);
  if (!eq) return 'You have no weapon equipped.';
  if (selected?.from === 'bag' && selected.id === eq.instanceId) return '';
  const a = swung(item), b = swung(eq);
  const diff = (label, d, fmt) => d ? `<span class="${d > 0 ? 'up' : 'down'}">${label} ${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>` : null;
  const parts = [diff('damage per second', Math.round(weaponDps(a)) - Math.round(weaponDps(b)), n => n),
    diff('damage', a.damage - b.damage, n => n),
    diff('attacks per second', Math.round(a.speed * 100) - Math.round(b.speed * 100), n => (n / 100).toFixed(2)),
    diff(a.ranged ? 'range' : 'reach', Math.round(a.range * 100) - Math.round(b.range * 100), n => (n / 100).toFixed(2))].filter(Boolean);
  return `Compared with ${esc(displayName(eq))}:\n${parts.join('\n') || 'same damage, speed and reach'}`;
}

export function updateInventory() {
  $('inventory-overlay').hidden = !state.inventoryOpen;
  if (!state.inventoryOpen) return;
  if (!floorMode && !trader && floorItems().length) floorMode = true;   // something was put down
  const inv = player.inventory, equipped = equippedItem(inv), allowed = equipmentAllowed(), floor = floorMode ? floorItems() : [];
  if (selected && !selectedItem()) selected = null;
  const item = selectedItem(), sel = selected ? `${selected.from}:${selected.id}` : '';
  const next = `${inv.version}:${sel}:${floorMode}:${trader?.name}:${floor.map(p => p.id)}:${allowed}:${state.equipping}:${player.hp}:${player.xp}:${state.statusMsg}`;
  if (next === signature && inv === shown) return;   // (another hero's bag: game/save.js)
  signature = next; shown = inv;
  const xp = xpProgress(player), shop = shopOf(trader);
  $('inventory-panel').classList.toggle('with-floor', floorMode || !!shop);
  $('inventory-floor-col').hidden = !floorMode;
  $('inventory-shop-col').hidden = !shop;
  $('inventory-progress').textContent = `Level ${player.level} · XP ${xp.current}/${xp.required} · HP ${Math.ceil(player.hp)}/${player.maxHp}`;
  $('inventory-equipped').textContent = `Equipped: ${equipped ? displayName(equipped) : 'None (you cannot attack)'}${inv.readied ? ` · in hand: ${ITEMS[inv.readied].name}` : ''} · level bonus +${Math.round((levelDamage(player.level || 1) - 1) * 100)}% damage`;
  $('inventory-currency').innerHTML = COINS.map((c, i) => `<div class="coin-slot"><img src="${c.icon}" alt=""><div><small>${c.name}</small><b>${inv.currency[i].count}</b></div></div>`).join('');
  const focus = document.activeElement?.dataset;
  const focusSlot = focus?.slot, focusFloor = focus?.floor, focusWare = focus?.ware;
  if (shop) {
    const copper = copperTotal(inv);
    $('inventory-shop-title').textContent = `${shop.title} · ${shop.trade}`;
    $('inventory-shop').innerHTML = shop.wares.map(id => {
      const def = ITEMS[id], on = selected?.from === 'shop' && selected.id === id, price = priceOf(id);
      return `<button class="floor-item${on ? ' selected' : ''}${copper < price ? ' poor' : ''}" role="option" aria-selected="${on}" data-ware="${id}" title="${esc(def.name)}"><img src="${def.icon}" alt=""><span>${esc(def.name)}</span><span class="price">${formatCoins(price)}</span></button>`;
    }).join('');
    if (focusWare !== undefined) $('inventory-shop').querySelector(`[data-ware="${focusWare}"]`)?.focus();
  }
  if (floorMode) $('inventory-floor').innerHTML = floor.length ? floor.map(p => {
    const def = ITEMS[p.itemId], on = selected?.from === 'floor' && selected.id === p.id, color = p.gen ? rarityOf(p).css : '';
    return `<button class="floor-item${on ? ' selected' : ''}" role="option" aria-selected="${on}" data-floor="${p.id}"${color ? ` style="--rarity:${color};color:${color}"` : ''} title="${esc(displayName(p))}"><img src="${def.icon}" alt=""><span>${esc(displayName(p))}${p.count > 1 ? ` ×${p.count}` : ''}</span></button>`;
  }).join('') : '<div class="floor-empty">Nothing on the floor within reach.</div>';
  $('inventory-grid').innerHTML = inv.slots.map((s, i) => {
    const def = s && ITEMS[s.itemId], on = !!s && selected?.from === 'bag' && s.instanceId === selected.id;
    const rarity = s?.gen && rarityOf(s).glow ? ` style="--rarity:${rarityOf(s).css}"` : '';
    const key = s ? barIndexOf(inv, s) : -1;
    const worn = s && (s.instanceId === inv.equipped || s.itemId === inv.readied);
    return `<button class="inventory-slot${on ? ' selected' : ''}"${rarity} data-slot="${i}" aria-pressed="${on}" aria-label="${def ? `${esc(displayName(s))}, ${s.count}${s.instanceId === inv.equipped ? ', equipped' : ''}${s.itemId === inv.readied ? ', in hand' : ''}${key >= 0 ? `, quick bar ${key + 1}` : ''}` : `Empty slot ${i + 1}`}" title="${esc(def ? displayName(s) : 'Empty')}">${s ? `<img src="${def.icon}" alt="">${s.count > 1 ? `<span class="count">${s.count}</span>` : ''}${worn ? '<span class="equipped">E</span>' : ''}${key >= 0 ? `<span class="bar-key">${key + 1}</span>` : ''}` : ''}</button>`;
  }).join('');
  if (focusSlot !== undefined) $('inventory-grid').querySelector(`[data-slot="${focusSlot}"]`)?.focus();
  if (focusFloor !== undefined) ($('inventory-floor').querySelector(`[data-floor="${focusFloor}"]`)
    || $('inventory-floor').querySelector('[data-floor]') || $('inventory-grid').querySelector('[data-slot]'))?.focus();
  const def = item && ITEMS[item.itemId], image = $('inventory-item-icon');
  image.hidden = !def;
  if (def) image.src = def.icon;
  $('inventory-item-name').textContent = item ? displayName(item) : 'Select an item';
  $('inventory-item-name').style.color = item?.gen ? rarityOf(item).css : '';
  $('inventory-item-base').textContent = item ? baseLine(item) ?? '' : '';
  // the Quick bar row: the slot it is on lit (again: off)
  const barKey = selected?.from === 'bag' ? barIndexOf(inv, item) : -1;
  $('inventory-bar').hidden = !item || selected?.from !== 'bag' || !barAllowed(item.itemId);
  barButtons.forEach((b, i) => {
    b.classList.toggle('on', i === barKey);
    b.setAttribute('aria-pressed', String(i === barKey));
    b.title = i === barKey ? `Take it off quick bar slot ${i + 1}` : `Put it on quick bar slot ${i + 1}`;
  });
  $('inventory-bar-hint').textContent = barKey >= 0 ? 'Again to take it off'
    : touchOn() ? 'Or tap a slot of the bar above' : 'Or press 1-6';
  $('inventory-item-stats').textContent = (def?.weapon ? weaponText(item)
    : def?.effect || def?.flask ? potionText(item, selected?.from)
    : def?.use ? `${def.stackLimit > 1 ? `Count ${item.count}\n` : ''}${def.description}${def.bound ? '\nBound: it cannot be dropped' : ''}`
    : def ? `Count ${item.count}\nStack limit ${def.stackLimit}\nNo use action yet` : selected ? '' : 'Select a bag slot to inspect it.');
  $('inventory-item-affixes').innerHTML = item ? affixLines(item).map(l => `<li>${esc(l)}</li>`).join('') : '';
  $('inventory-item-compare').innerHTML = def?.weapon ? compareText(item) : '';
  const inBag = selected?.from === 'bag', isEquipped = inBag && item?.instanceId === inv.equipped;
  const equip = $('inventory-equip'), take = $('inventory-take'), drop = $('inventory-drop'), use = $('inventory-use'), buy = $('inventory-buy');
  use.hidden = !inBag || !def?.use;
  use.textContent = def?.use === 'drink' ? 'Drink' : def?.use === 'throw' ? (inv.readied === def.id ? 'Put away' : 'Take in hand') : 'Use';
  const fromShop = selected?.from === 'shop' && !!item, poor = fromShop && copperTotal(inv) < priceOf(item.itemId);
  const full = fromShop && !hasRoom(inv) && !inv.slots.some(s => s?.itemId === item.itemId && s.count < ITEMS[s.itemId].stackLimit);
  buy.hidden = !fromShop;
  buy.disabled = poor || full;
  buy.textContent = fromShop ? `Buy · ${formatCoins(priceOf(item.itemId))}` : 'Buy';
  buy.title = poor ? 'Not enough coins' : full ? 'Your bag is full' : '';
  equip.hidden = !inBag || !def?.weapon;
  equip.disabled = !allowed || isEquipped;
  equip.textContent = isEquipped ? 'Equipped' : 'Equip';
  equip.title = allowed ? '' : 'Close inventory and finish your current action first';
  take.hidden = selected?.from !== 'floor' || !item;
  take.disabled = !!item?.gen && !inv.slots.includes(null);
  take.title = take.disabled ? 'Your bag is full' : '';
  drop.hidden = !inBag || !item;
  drop.disabled = isEquipped && !allowed || !!def?.bound;
  drop.title = def?.bound ? 'Bound: it cannot be dropped' : '';
  $('inventory-feedback').textContent = state.equipping ? 'Loading weapon…' : !allowed ? 'Finish your current action before changing weapons.' : state.statusMsg;
}
const refresh = () => { signature = ''; updateInventory(); };

// move the selected item across: floor -> bag, bag -> floor
function take() {
  const p = selected?.from === 'floor' && floorPickup(selected.id);
  if (!p) return;
  const at = floorItems().indexOf(p);
  if (takeNow(p)) {
    const rest = floorItems(), next = rest[Math.min(at, rest.length - 1)];
    selected = next ? { from: 'floor', id: next.id } : null;
  }
  refresh();
}
async function drop() {
  const id = selected?.from === 'bag' && selected.id;
  if (!id) return;
  const wasEquipped = player.inventory.equipped === id, readied = player.inventory.readied;
  if (wasEquipped && !equipmentAllowed()) return;
  const index = player.inventory.slots.findIndex(s => s?.instanceId === id);
  if (!dropFromBag(id)) return;
  if (wasEquipped) { syncEquippedWeapon(); setStatus('No weapon equipped: you cannot attack'); }
  else if (readied && !player.inventory.readied) syncEquippedWeapon();   // the last flask in hand went
  const next = player.inventory.slots.slice(index).find(Boolean) || player.inventory.slots.find(Boolean);
  selected = next ? { from: 'bag', id: next.instanceId } : null;
  refresh();
}
// buy one of the selected ware
function buy() {
  const id = selected?.from === 'shop' && selected.id;
  if (!id || !trader) return;
  const done = buyWare(player.inventory, id);
  if (done === 'ok') {
    autoBar(player.inventory, id);
    sfx('coin', { pitch: 0.8 }); sfx('pickup');
    setStatus(`Bought a ${ITEMS[id].name} for ${formatCoins(priceOf(id))}`);
    log('trade', { item: `a ${ITEMS[id].name}`, price: formatCoins(priceOf(id)) });
  } else setStatus({ poor: 'Not enough coins', full: 'Your bag is full', unknown: 'Not for sale' }[done]);
  refresh();
}
function act() {
  if (selected?.from === 'shop') buy();
  else if (selected?.from === 'floor') take();
  else if (selected?.from !== 'bag') return;
  else if (!$('inventory-equip').hidden && !$('inventory-equip').disabled) $('inventory-equip').click();
  else if (!$('inventory-use').hidden) $('inventory-use').click();
}
// close the bag first: the game is paused while it is open
function use() {
  const id = selected?.from === 'bag' && selected.id;
  if (!id) return;
  setInventoryOpen(false);
  useItem(id);
}

$('inventory-close').addEventListener('click', () => setInventoryOpen(false));
$('inventory-overlay').addEventListener('click', e => { if (e.target === $('inventory-overlay')) setInventoryOpen(false); });
$('inventory-grid').addEventListener('click', e => {
  const button = e.target.closest('[data-slot]');
  if (!button) return;
  const s = player.inventory.slots[Number(button.dataset.slot)];
  selected = s ? { from: 'bag', id: s.instanceId } : null;
  refresh();
});
$('inventory-grid').addEventListener('dblclick', e => { if (e.target.closest('[data-slot]')) act(); });
$('inventory-floor').addEventListener('click', e => {
  const button = e.target.closest('[data-floor]');
  if (!button) return;
  selected = { from: 'floor', id: button.dataset.floor };
  refresh();
});
$('inventory-floor').addEventListener('dblclick', e => { if (e.target.closest('[data-floor]')) take(); });
$('inventory-shop').addEventListener('click', e => {
  const button = e.target.closest('[data-ware]');
  if (!button) return;
  selected = { from: 'shop', id: button.dataset.ware };
  refresh();
});
$('inventory-shop').addEventListener('dblclick', e => { if (e.target.closest('[data-ware]')) buy(); });
$('inventory-bar-keys').addEventListener('click', e => {
  const b = e.target.closest('[data-bar-key]');
  if (!b) return;
  assignSelectedToBar(Number(b.dataset.barKey));
  refresh();
});
$('inventory-buy').addEventListener('click', buy);
$('inventory-equip').addEventListener('click', async () => {
  if (await equipOwnedWeapon(selected?.id)) selected = { from: 'bag', id: player.inventory.equipped };
  refresh();
});
$('inventory-take').addEventListener('click', take);
$('inventory-use').addEventListener('click', use);
$('inventory-drop').addEventListener('click', drop);

// Keyboard: arrows move through the floor list and the bag (left/right cross between them),
// Enter or Space on the selected item takes it from the floor, buys it, or equips / uses it.
// Tab stays inside the modal, including when slots are re-rendered.
$('inventory-panel').addEventListener('keydown', e => {
  const el = document.activeElement, slot = el?.dataset?.slot, row = el?.dataset?.floor ?? el?.dataset?.ware;
  if (e.code === 'Tab') {
    const controls = [...$('inventory-panel').querySelectorAll('button, select, input')].filter(c => !c.disabled && c.getClientRects().length);
    const i = controls.indexOf(el), next = (i + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
    e.preventDefault(); controls[next]?.focus();
    return;
  }
  if (slot === undefined && row === undefined) return;
  const rows = [...(trader ? $('inventory-shop').querySelectorAll('[data-ware]') : $('inventory-floor').querySelectorAll('[data-floor]'))];
  const slots = [...$('inventory-grid').querySelectorAll('[data-slot]')];
  const pick = target => { if (!target) return; e.preventDefault(); target.focus(); target.click(); };
  if (e.code === 'Enter' || e.code === 'Space') {
    const on = row !== undefined ? (trader ? selected?.from === 'shop' && selected.id === row : selected?.from === 'floor' && selected.id === row)
      : selected?.from === 'bag' && player.inventory.slots[Number(slot)]?.instanceId === selected.id;
    if (on) { e.preventDefault(); act(); }
    return;
  }
  if (row !== undefined) {
    const i = rows.indexOf(el);
    if (e.code === 'ArrowDown') pick(rows[i + 1]);
    else if (e.code === 'ArrowUp') pick(rows[i - 1]);
    else if (e.code === 'ArrowRight') pick(slots[0]);
  } else {
    const i = Number(slot), col = i % 6;
    if (e.code === 'ArrowRight' && col < 5) pick(slots[i + 1]);
    else if (e.code === 'ArrowLeft' && col > 0) pick(slots[i - 1]);
    else if (e.code === 'ArrowLeft' && (floorMode || trader)) pick(rows[0]);
    else if (e.code === 'ArrowDown') pick(slots[i + 6]);
    else if (e.code === 'ArrowUp') pick(slots[i - 6]);
  }
});
