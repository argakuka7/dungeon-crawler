// The teleport scroll's little menu (game/roomportal.js, playing together): where to go. A
// row each, on the quick bar's keys (1-4, as the settings give them) or a click or a tap: back
// to where you came into the room, then the other players in their colour. One that cannot be
// gone to now says why and cannot be picked. Picking one starts the scroll's cast; Esc, using
// the scroll again, moving, the inventory, the menu or travelling close it. The world goes on
// meanwhile (it does, playing together).
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { keyLabel, onSettingsChange } from './settings.js';
import { tr } from '../i18n/i18n.js';

const el = document.getElementById('teleport-menu');
const MOVED = 0.3;   // cells walked off where it opened: closed
// entries(): [{ label, color, why }] as of now (null: there is nothing to choose any more);
// pick(entry): go there; at: where the player stood; shown: what is drawn
let menu = null;

export const teleportMenuOpen = () => !!menu;
export function openTeleportMenu(entries, pick) {
  menu = { entries, pick, at: { x: player.x, y: player.y, z: player.z }, shown: '' };
  el.hidden = false;
  updateTeleportMenu();
}
export function closeTeleportMenu() {
  if (!menu) return;
  menu = null;
  el.hidden = true;
}

// the i-th row (a quick bar key, a click): picked if it can be, else what stands in the way;
// past the last row it closes the menu
export function pickTeleport(i) {
  if (!menu) return;
  const e = menu.entries()?.[i];
  if (!e) { closeTeleportMenu(); return; }
  if (e.why) { setStatus(e.why); sfx('fizzle'); return; }
  const { pick } = menu;
  closeTeleportMenu();
  pick(e);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// every frame: close it once it no longer fits, redraw it as the others come, go and move on
export function updateTeleportMenu() {
  if (!menu) return;
  const p = player, a = menu.at, list = menu.entries();
  if (!list || state.mode !== 'play' || state.transitioning || state.inventoryOpen || state.menuOpen || state.cast
    || p.ragdoll || p.down || Math.hypot(p.x - a.x, p.z - a.z) > MOVED || Math.abs(p.y - a.y) > MOVED) { closeTeleportMenu(); return; }
  const next = JSON.stringify(list);
  if (next === menu.shown) return;
  menu.shown = next;
  el.innerHTML = `<h2>${esc(tr('Teleport to'))}</h2>` + list.map((e, i) => {
    const key = keyLabel(`bar${i + 1}`, { both: false });
    return `<button data-pick="${i}"${e.why ? ' class="off" aria-disabled="true"' : ''} tabindex="-1">`
      + `${key ? `<kbd>${esc(key)}</kbd>` : ''}<b${e.color ? ` style="color:${e.color}"` : ''}>${esc(e.label)}</b>`
      + `${e.why ? `<small>${esc(e.why)}</small>` : ''}</button>`;
  }).join('');
}
onSettingsChange(() => { if (menu) menu.shown = ''; });   // other keys: show them

el.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault();   // no focus: the keys stay with the game
  const b = e.target.closest('[data-pick]');
  if (b) pickTeleport(Number(b.dataset.pick));
});
