// Name labels over the items on the floor, Diablo style, in their rarity's colour. X shows
// them for everything in the cube but coins; otherwise only the item under the cursor gets
// one. A label (or the item itself) is clicked to walk there and pick it up (game/orders.js).
// Closed treasure chests are hovered and labelled the same way (coloured by how grand the site
// is), and clicked to go and open them (game/chests.js); so are villagers with something to say
// (named in gold, with their trade, core/shops.js), clicked to go and talk to them. A villager
// with a quest for you (!) or one to hand in (?, core/quests.js giverMark) is always labelled.
// A trial's parts the action key uses (levers, runestones, braziers, a rune room's tablet ...;
// game/trials.js usableParts) are hovered too, labelled with what using them does, and clicked to
// go and use them.
// Labels that would overlap are pushed upwards into a stack. Runs after the camera moved.
import * as THREE from 'three';
import { camera, renderer } from '../render/scene.js';
import { lootView } from '../render/loot.js';
import { rarityOf } from '../core/gear/rarities.js';
import { labelled } from '../core/loot.js';
import { displayName } from '../core/gear/stats.js';
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
import { state } from './state.js';
import { lootHere } from './loot.js';
import { pointer, hoveredEnemy } from './pointer.js';
import { orderPickup, orderChest, orderTrade, orderWalk, orderPart } from './orders.js';
import { usableParts, partLabel } from './trials.js';
import { questItemsHere } from './questworld.js';
import { shopOf } from '../core/shops.js';
import { GIVERS, giverOf, giverMark } from '../core/quests.js';
import { talkative } from './action.js';
import { peopleHere } from './npcs.js';
import { closedChests } from './chests.js';
import { RARITY } from '../core/gear/rarities.js';
import { tr, say, onLanguageChange } from '../i18n/i18n.js';

const layer = document.getElementById('loot-labels'), canvas = renderer.domElement;
const labels = new Map();   // pickup id (or 'chest:' + site id) -> { el, p, w, h }
// another language: the labels are made again in it
onLanguageChange(() => { for (const l of labels.values()) l.el.remove(); labels.clear(); });
const PICK = 26;             // px: how close the cursor must be to an item to hover it
const CHEST_PICK = 40;       // ... and to a chest
const VILLAGER_PICK = 46;    // ... and to a villager's head
const PART_PICK = 40;        // ... and to a trial's part
const PART_COLOR = '#8fd0ff';
// a chest's label colour: a grander site, a rarer colour
const CHEST_COLOR = { basic: '#d8d2c4', uncommon: RARITY.decent.css, rare: RARITY.unusual.css, exceptional: RARITY.remarkable.css };
let hovered = null, overLabel = null, cursor = '';

// villagers (state.map.villagers) have an outfit, chests (reward sites) a prestige; the trial's
// usable parts are this frame's usableParts()
let parts = new Set();
const isVillager = p => !!p?.outfit, isPart = p => parts.has(p);
// the pickup under the cursor, the closed chest (a reward site), the trading villager and the trial's part
export const hoveredPickup = () => hovered && !hovered.prestige && !isVillager(hovered) && !isPart(hovered) ? hovered : null;
export const hoveredChest = () => hovered?.prestige ? hovered : null;
export const hoveredVillager = () => isVillager(hovered) ? hovered : null;
export const hoveredPart = () => isPart(hovered) ? hovered : null;
const keyOf = p => p.prestige ? 'chest:' + p.id : isVillager(p) ? 'villager:' + (p.id ?? p.name) : isPart(p) ? `part:${p.type === 'tablet' ? p.key : p.id}` : p.id;
const textOf = p => isVillager(p) ? villagerText(p) : isPart(p) ? partLabel(p) : null;   // (labels whose text changes)
// the villagers in this cube with something to say
const traders = () => peopleHere().filter(talkative);
// what a villager's label says: the quest mark, their name, their trade
function villagerText(v) {
  const shop = shopOf(v), mark = v.lost || v.helper ? '!' : giverOf(v) && state.run?.quests ? giverMark(state.run.quests, giverOf(v)) : '';
  const name = v.title ? say(v.title) : GIVERS[v.name] ? tr(GIVERS[v.name].title) : shop ? tr(shop.title) : v.name;
  return `${mark ? `${mark} ` : ''}${name}${shop ? ` · ${tr(shop.trade)}` : ''}`;
}
export function toggleLabels() { state.showLabels = !state.showLabels; }

function label(p) {
  let l = labels.get(keyOf(p));
  if (l) return l;
  const el = document.createElement('button');
  el.className = 'loot-label'; el.tabIndex = -1;
  const part = isPart(p);
  el.textContent = textOf(p) ?? (p.prestige ? tr('Treasure chest') : p.questItem ? tr('{thing} · quest', { thing: p.label ? capital(say(p.label)) : displayName(p) })
    : displayName(p) + (p.count > 1 ? ` (${p.count})` : ''));
  el.style.color = part ? PART_COLOR : isVillager(p) || p.questItem ? '#e6c35a' : p.prestige ? CHEST_COLOR[p.prestige] ?? CHEST_COLOR.basic : p.gen ? rarityOf(p).css : '#d8d2c4';
  if (p.gen) { el.dataset.rarity = rarityOf(p).id; el.classList.toggle('rainbow', !!rarityOf(p).glow?.rainbow); }
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || state.inventoryOpen || state.transitioning) return;
    e.preventDefault(); e.stopPropagation();
    if (part) orderPart(p); else if (isVillager(p)) orderTrade(p); else if (p.prestige) orderChest(p); else if (p.questItem) orderWalk(p.x, p.y, p.z); else orderPickup(p);
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
  else if (isPart(p)) v.set(p.x + off.x, p.y + off.y + 0.9, p.z + off.z).project(camera);
  else v.set(p.x + off.x, p.y + off.y + (p.gen ? 0.12 : 0.35), p.z + off.z).project(camera);
  if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}

export function updateLootLabels() {
  const live = !state.inventoryOpen && !state.transitioning && !!state.world;
  parts = new Set(live && state.mode === 'play' ? usableParts() : []);
  const list = live ? [...parts, ...lootHere().filter(p => labelled(p) && p.toss >= 1 && !p.fly && lootView(p)), ...questItemsHere().filter(lootView),
    ...closedChests(), ...traders()] : [];
  const off = state.world?.group.position ?? v.set(0, 0, 0), spots = new Map();
  for (const p of list) { const s = screen(p, off); if (s) spots.set(p, s); }
  // the item under the cursor: a label it points at, else the nearest item on screen
  hovered = null;
  if (live && overLabel && spots.has(overLabel)) hovered = overLabel;
  else if (live && pointer.inside && !hoveredEnemy()) {
    const px = (pointer.ndc.x + 1) / 2 * innerWidth, py = (1 - pointer.ndc.y) / 2 * innerHeight;
    let best = Infinity;
    for (const [p, s] of spots) {
      const d = Math.hypot(s.x - px, s.y - py) / (isVillager(p) ? VILLAGER_PICK : p.prestige ? CHEST_PICK : isPart(p) ? PART_PICK : PICK);   // items win when close
      if (d < Math.min(1, best)) { best = d; hovered = p; }
    }
  }
  const show = [...spots.keys()].filter(p => state.showLabels || p === hovered || p.questItem || isVillager(p) && villagerText(p).match(/^[!?] /));
  // nearest to the camera first; each label goes up past any it would cover
  show.sort((a, b) => spots.get(b).y - spots.get(a).y);
  const placed = [], keep = new Set();
  for (const p of show) {
    const l = label(p), s = spots.get(p);
    keep.add(keyOf(p));
    const text = textOf(p);
    if (text != null && l.el.textContent !== text) { l.el.textContent = text; l.w = 0; }
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
