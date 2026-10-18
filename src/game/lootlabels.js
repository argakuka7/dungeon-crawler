// Name labels over the items on the floor, Diablo style, in their rarity's colour. X shows
// them for everything in the cube but coins; otherwise only the item under the cursor gets
// one. A label (or the item itself) is clicked to walk there and pick it up (game/orders.js).
// Closed treasure chests are hovered and labelled the same way (coloured by how grand the site
// is), and clicked to go and open them (game/chests.js); so are villagers with something to say
// (named in gold, with their trade, core/shops.js), clicked to go and talk to them. A villager
// with a quest for you (!) or one to hand in (?, core/quests.js giverMark) is always labelled.
// Labels that would overlap are pushed upwards into a stack. Runs after the camera moved.
import * as THREE from 'three';
import { camera, renderer } from '../render/scene.js';
import { lootView } from '../render/loot.js';
import { rarityOf } from '../core/gear/rarities.js';
import { labelled } from '../core/loot.js';
import { displayName } from '../core/gear/stats.js';
import { state } from './state.js';
import { lootHere } from './loot.js';
import { pointer, hoveredEnemy } from './pointer.js';
import { orderPickup, orderChest, orderTrade } from './orders.js';
import { shopOf } from '../core/shops.js';
import { GIVERS, giverOf, giverMark } from '../core/quests.js';
import { talkative } from './action.js';
import { closedChests } from './chests.js';
import { RARITY } from '../core/gear/rarities.js';

const layer = document.getElementById('loot-labels'), canvas = renderer.domElement;
const labels = new Map();   // pickup id (or 'chest:' + site id) -> { el, p, w, h }
const PICK = 26;             // px: how close the cursor must be to an item to hover it
const CHEST_PICK = 40;       // ... and to a chest
const VILLAGER_PICK = 46;    // ... and to a villager's head
// a chest's label colour: a grander site, a rarer colour
const CHEST_COLOR = { basic: '#d8d2c4', uncommon: RARITY.uncommon.css, rare: RARITY.rare.css, exceptional: RARITY.epic.css };
let hovered = null, overLabel = null, cursor = '';

// villagers (state.map.villagers) have an outfit, chests (reward sites) a prestige
const isVillager = p => !!p?.outfit;
// the pickup under the cursor, the closed chest (a reward site) and the trading villager
export const hoveredPickup = () => hovered && !hovered.prestige && !isVillager(hovered) ? hovered : null;
export const hoveredChest = () => hovered?.prestige ? hovered : null;
export const hoveredVillager = () => isVillager(hovered) ? hovered : null;
const keyOf = p => p.prestige ? 'chest:' + p.id : isVillager(p) ? 'villager:' + p.name : p.id;
// the villagers in this cube with something to say
const traders = () => (state.map?.villagers ?? []).filter(talkative);
// what a villager's label says: the quest mark, their name, their trade
function villagerText(v) {
  const shop = shopOf(v), mark = giverOf(v) && state.run?.quests ? giverMark(state.run.quests, v.name) : '';
  const name = GIVERS[v.name]?.title ?? shop?.title ?? v.name;
  return `${mark ? `${mark} ` : ''}${name}${shop ? ` · ${shop.trade}` : ''}`;
}
export function toggleLabels() { state.showLabels = !state.showLabels; }

function label(p) {
  let l = labels.get(keyOf(p));
  if (l) return l;
  const el = document.createElement('button');
  el.className = 'loot-label'; el.tabIndex = -1;
  const shop = shopOf(p);
  el.textContent = isVillager(p) ? villagerText(p) : p.prestige ? 'Treasure chest' : displayName(p) + (p.count > 1 ? ` (${p.count})` : '');
  el.style.color = isVillager(p) ? '#e6c35a' : p.prestige ? CHEST_COLOR[p.prestige] ?? CHEST_COLOR.basic : p.gen ? rarityOf(p).css : '#d8d2c4';
  if (p.gen) el.dataset.rarity = rarityOf(p).id;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || state.inventoryOpen || state.transitioning) return;
    e.preventDefault(); e.stopPropagation();
    if (isVillager(p)) orderTrade(p); else if (p.prestige) orderChest(p); else orderPickup(p);
  });
  el.addEventListener('pointerenter', () => { overLabel = p; });
  el.addEventListener('pointerleave', () => { if (overLabel === p) overLabel = null; });
  layer.append(el);
  l = { el, p, w: 0, h: 0 };
  labels.set(keyOf(p), l);
  return l;
}

const v = new THREE.Vector3();
// p on screen (px), over the item; null when behind the camera or off screen
function screen(p, off) {
  if (isVillager(p)) v.set(p.x + off.x, p.y + off.y + 1.05, p.z + off.z).project(camera);
  else if (p.prestige) v.set(p.anchor.x + off.x, p.anchor.y + off.y + 0.75, p.anchor.z + off.z).project(camera);
  else v.set(p.x + off.x, p.y + off.y + (p.gen ? 0.12 : 0.35), p.z + off.z).project(camera);
  if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}

export function updateLootLabels() {
  const live = !state.inventoryOpen && !state.transitioning && !!state.world;
  const list = live ? [...lootHere().filter(p => labelled(p) && p.toss >= 1 && !p.fly && lootView(p)), ...closedChests(), ...traders()] : [];
  const off = state.world?.group.position ?? v.set(0, 0, 0), spots = new Map();
  for (const p of list) { const s = screen(p, off); if (s) spots.set(p, s); }
  // the item under the cursor: a label it points at, else the nearest item on screen
  hovered = null;
  if (live && overLabel && spots.has(overLabel)) hovered = overLabel;
  else if (live && pointer.inside && !hoveredEnemy()) {
    const px = (pointer.ndc.x + 1) / 2 * innerWidth, py = (1 - pointer.ndc.y) / 2 * innerHeight;
    let best = Infinity;
    for (const [p, s] of spots) {
      const d = Math.hypot(s.x - px, s.y - py) / (isVillager(p) ? VILLAGER_PICK : p.prestige ? CHEST_PICK : PICK);   // items win when close
      if (d < Math.min(1, best)) { best = d; hovered = p; }
    }
  }
  const show = [...spots.keys()].filter(p => state.showLabels || p === hovered || isVillager(p) && villagerText(p).match(/^[!?] /));
  // nearest to the camera first; each label goes up past any it would cover
  show.sort((a, b) => spots.get(b).y - spots.get(a).y);
  const placed = [], keep = new Set();
  for (const p of show) {
    const l = label(p), s = spots.get(p);
    keep.add(keyOf(p));
    if (isVillager(p) && l.el.textContent !== villagerText(p)) { l.el.textContent = villagerText(p); l.w = 0; }
    if (!l.w) { l.w = l.el.offsetWidth || 80; l.h = l.el.offsetHeight || 18; }
    let x = s.x - l.w / 2, y = s.y - l.h - 6;
    for (let moved = true, n = 0; moved && n < 30; n++) {
      moved = false;
      for (const r of placed) if (x < r.x + r.w && x + l.w > r.x && y < r.y + r.h && y + l.h > r.y) { y = r.y - l.h - 2; moved = true; }
    }
    placed.push({ x, y, w: l.w, h: l.h });
    l.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    l.el.classList.toggle('hovered', p === hovered);
  }
  for (const [id, l] of labels) if (!keep.has(id)) { l.el.remove(); labels.delete(id); if (overLabel === l.p) overLabel = null; }
  const want = hoveredEnemy() ? 'crosshair' : hovered ? 'pointer' : '';
  if (want !== cursor) canvas.style.cursor = cursor = want;
}
