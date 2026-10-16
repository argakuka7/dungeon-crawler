// Saved games: heroes and worlds, apart. Pure: no DOM, no game state (game/save.js runs it).
//
// A hero (up to MAX_HEROES) is the character: name, XP and the bag. It goes into any world, a
// friend's too, and takes home what it found there.
//   { v, id, name, created, updated, playTime, xp, inventory }
// A world (up to MAX_WORLDS) is a seed and what was done in it: what was defeated and opened,
// the loot on the floor, the cubes discovered, and where each hero left it (spots).
//   { v, id, name, seed, created, updated, deepest,
//     run: { defeated, gates, chests, dropped, loot, townPortal }, faces, visited,
//     spots: { [heroId]: { cube, arrival: { x, y, z } } } }
// The map itself is never saved: the same seed makes the same cubes (world/).
//
// The store keeps them in a Storage (localStorage, or a stand-in in the tests) under KEYS: the
// heroes in one entry, the worlds one entry each (they grow) plus an index for the menu. What
// is read is checked: a damaged or unknown entry is left out (and left alone), an item the game
// no longer knows leaves the bag. `v` says which version wrote it: migrate brings older ones up.
import { ITEMS, COINS } from './items.js';
import { BAG_SIZE, BAR_SIZE, createInventory, whole } from './inventory.js';
import { createPlayerStats, levelFromXP, maxHealth } from './progression.js';
import { validGen, validPickup } from './loot.js';
import { mulberry32 } from './util.js';

export const SAVE_VERSION = 1, MAX_HEROES = 3, MAX_WORLDS = 8, NAME_MAX = 16;
export const KEYS = {
  heroes: 'cube-crawler.heroes', worlds: 'cube-crawler.worlds', last: 'cube-crawler.last',
  world: id => `cube-crawler.world.${id}`,
};

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (...xs) => xs.every(Number.isFinite);
const strings = xs => Array.isArray(xs) ? xs.filter(x => typeof x === 'string') : [];
const point = p => isObj(p) && finite(p.x, p.y, p.z) ? { x: p.x, y: p.y, z: p.z } : null;
const time = t => Number.isFinite(t) && t >= 0 ? t : 0;
const isId = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);

export const newId = (prefix, rand = Math.random) => `${prefix}-${Date.now().toString(36)}${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;

// a name as typed: plain, single spaced, at most NAME_MAX characters ('' if nothing is left)
export function cleanName(s) {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '';
}

// A world's name from its seed: 'Mossy Hollow'
const FIRST = ['Mossy', 'Hidden', 'Crooked', 'Silent', 'Golden', 'Misty', 'Ancient', 'Windy', 'Frozen', 'Sunken',
  'Bright', 'Shadow', 'Stony', 'Hollow', 'Rusty', 'Thorny', 'Amber', 'Copper', 'Dusky', 'Lucky'];
const SECOND = ['Hollow', 'Vale', 'Deeps', 'Reach', 'Barrow', 'Crag', 'Glen', 'Warren', 'Keep', 'Burrow',
  'Fen', 'Spire', 'Grotto', 'Ridge', 'Pits', 'Halls', 'Wilds', 'Nook', 'Rift', 'Moor'];
export function worldName(seed) {
  const r = mulberry32(seed ^ 0x5eed);
  const a = FIRST[Math.floor(r() * FIRST.length)];
  let b = SECOND[Math.floor(r() * SECOND.length)];
  if (b === a) b = SECOND[(SECOND.indexOf(b) + 1) % SECOND.length];
  return `${a} ${b}`;
}

// --- heroes -------------------------------------------------------------------------------------

export function createHero(name, { id = newId('h'), now = Date.now() } = {}) {
  return { v: SAVE_VERSION, id, name: cleanName(name) || 'Hero', created: now, updated: now, playTime: 0,
    xp: 0, inventory: createPlayerStats().inventory };
}
export const heroLevel = h => levelFromXP(h.xp);

// What the hero is when it comes into a world: its level, its bag, full health, no potions at work
// (the fields of core/progression.js createPlayerStats)
export function heroStats(h) {
  const level = levelFromXP(h.xp), maxHp = maxHealth(level);
  return { ...createPlayerStats(), xp: h.xp, level, maxHp, hp: maxHp, inventory: structuredClone(h.inventory) };
}

// A bag as it was saved, checked: slots with items the game no longer knows (or that do not
// make sense) are emptied, the quick bar keeps only what it can point at
export function checkInventory(saved) {
  const inv = createInventory();
  if (!isObj(saved)) return inv;
  const seen = new Set();
  let top = 0;
  (Array.isArray(saved.slots) ? saved.slots : []).slice(0, BAG_SIZE).forEach((s, i) => {
    if (!isObj(s) || typeof s.instanceId !== 'string' || seen.has(s.instanceId)) return;
    const def = ITEMS[s.itemId];
    if (!def || def.category === 'currency' || !Number.isInteger(s.count) || s.count < 1 || s.count > def.stackLimit) return;
    if (s.gen !== undefined && (!def.weapon || !validGen(s.gen))) return;
    seen.add(s.instanceId);
    top = Math.max(top, Number(/^item-(\d+)$/.exec(s.instanceId)?.[1] ?? 0));
    inv.slots[i] = { instanceId: s.instanceId, itemId: s.itemId, count: s.count, ...s.gen ? { gen: structuredClone(s.gen) } : {} };
  });
  const counts = new Map((Array.isArray(saved.currency) ? saved.currency : []).filter(isObj).map(c => [c.itemId, c.count]));
  inv.currency = COINS.map(c => ({ itemId: c.id, count: Number.isSafeInteger(counts.get(c.id)) && counts.get(c.id) > 0 ? counts.get(c.id) : 0 }));
  const own = id => inv.slots.find(s => s?.instanceId === id);
  inv.bar = Array.from({ length: BAR_SIZE }, (_, i) => {
    const r = Array.isArray(saved.bar) ? saved.bar[i] : null;
    if (isObj(r) && typeof r.itemId === 'string' && ITEMS[r.itemId]?.use && ITEMS[r.itemId].stackLimit > 1) return { itemId: r.itemId };
    if (isObj(r) && typeof r.instanceId === 'string' && own(r.instanceId)) return { instanceId: r.instanceId };
    return null;
  });
  inv.equipped = typeof saved.equipped === 'string' && ITEMS[own(saved.equipped)?.itemId]?.weapon ? saved.equipped : null;
  inv.readied = typeof saved.readied === 'string' && ITEMS[saved.readied]?.use === 'throw' && inv.slots.some(s => s?.itemId === saved.readied) ? saved.readied : null;
  inv.nextInstance = Math.max(Number.isSafeInteger(saved.nextInstance) ? saved.nextInstance : 1, top + 1);
  inv.version = Number.isSafeInteger(saved.version) && saved.version >= 0 ? saved.version : 0;
  return inv;
}

export function checkHero(h) {
  h = migrate(h);
  if (!h || !isId(h.id)) return null;
  let xp = 0;
  try { xp = whole(h.xp); } catch { return null; }
  return { v: SAVE_VERSION, id: h.id, name: cleanName(h.name) || 'Hero', created: time(h.created), updated: time(h.updated),
    playTime: time(h.playTime), xp, inventory: checkInventory(h.inventory) };
}

// --- worlds -------------------------------------------------------------------------------------

export function createWorld(seed, { name = '', id = newId('w'), now = Date.now() } = {}) {
  seed >>>= 0;
  return { v: SAVE_VERSION, id, name: cleanName(name) || worldName(seed), seed, created: now, updated: now, deepest: 0,
    run: { defeated: [], gates: [], chests: [], dropped: [], loot: [], townPortal: null }, faces: [], visited: [], spots: {} };
}

function checkTownPortal(tp) {
  if (!isObj(tp) || typeof tp.key !== 'string' || !Number.isInteger(tp.depth)) return null;
  const pad = point(tp.pad), back = point(tp.back);
  return pad && back ? { key: tp.key, depth: tp.depth, pad, back } : null;
}
// [[cube key, pickups]] with each pickup's source
function checkLoot(loot) {
  if (!Array.isArray(loot)) return [];
  return loot.filter(c => Array.isArray(c) && typeof c[0] === 'string' && Array.isArray(c[1]))
    .map(([k, list]) => [k, list.filter(p => typeof p?.source === 'string' && validPickup(p))])
    .filter(([, list]) => list.length);
}

export function checkWorld(w) {
  w = migrate(w);
  if (!w || !isId(w.id) || !Number.isInteger(w.seed) || w.seed < 0 || w.seed > 0xffffffff) return null;
  const run = isObj(w.run) ? w.run : {}, spots = {};
  if (isObj(w.spots)) for (const [hero, s] of Object.entries(w.spots)) {
    const arrival = point(s?.arrival);
    if (isId(hero) && typeof s.cube === 'string' && arrival) spots[hero] = { cube: s.cube, arrival };
  }
  return { v: SAVE_VERSION, id: w.id, name: cleanName(w.name) || worldName(w.seed), seed: w.seed,
    created: time(w.created), updated: time(w.updated), deepest: Number.isInteger(w.deepest) && w.deepest > 0 ? w.deepest : 0,
    run: { defeated: strings(run.defeated), gates: strings(run.gates), chests: strings(run.chests), dropped: strings(run.dropped),
      loot: checkLoot(run.loot), townPortal: checkTownPortal(run.townPortal) },
    faces: strings(w.faces), visited: strings(w.visited), spots };
}
// what the menu lists of a world, without reading all of it
export const worldEntry = w => ({ id: w.id, name: w.name, seed: w.seed, updated: w.updated, deepest: w.deepest, heroes: Object.keys(w.spots) });

// an entry written by an older version of the game, brought up to this one; null: not a save
// we can read (one from a newer version is left alone)
export function migrate(x) {
  if (!isObj(x) || !Number.isInteger(x.v) || x.v < 1 || x.v > SAVE_VERSION) return null;
  return x;
}

// --- the store ----------------------------------------------------------------------------------

// The saves in `storage` (getItem / setItem / removeItem). Writes return false when the storage
// refused (full, or switched off).
export function openStore(storage) {
  const read = k => { try { const s = storage.getItem(k); return s === null ? null : JSON.parse(s); } catch { return null; } };
  const write = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const remove = k => { try { storage.removeItem(k); } catch { /* nothing to do */ } };
  const rawList = k => { const l = read(k); return Array.isArray(l) ? l : []; };
  const newestFirst = (a, b) => b.updated - a.updated;

  const store = {
    heroes: () => rawList(KEYS.heroes).map(checkHero).filter(Boolean).sort((a, b) => a.created - b.created),
    hero: id => store.heroes().find(h => h.id === id) ?? null,
    // false: no room for another hero, or the storage refused
    putHero(h) {
      const list = rawList(KEYS.heroes), i = list.findIndex(x => x?.id === h.id);
      if (i < 0 && store.heroes().length >= MAX_HEROES) return false;
      if (i < 0) list.push(h); else list[i] = h;
      return write(KEYS.heroes, list);
    },
    // a hero goes, and so do its spots in the worlds
    deleteHero(id) {
      write(KEYS.heroes, rawList(KEYS.heroes).filter(x => x?.id !== id));
      for (const e of store.worlds()) {
        const w = store.world(e.id);
        if (w?.spots[id]) { delete w.spots[id]; store.putWorld(w); }
      }
      if (read(KEYS.last)?.hero === id) remove(KEYS.last);
    },
    worlds: () => rawList(KEYS.worlds).filter(e => isObj(e) && isId(e.id)).sort(newestFirst),
    world: id => isId(id) ? checkWorld(read(KEYS.world(id))) : null,
    putWorld(w) {
      const index = rawList(KEYS.worlds), i = index.findIndex(e => e?.id === w.id);
      if (i < 0 && store.worlds().length >= MAX_WORLDS) return false;
      if (!write(KEYS.world(w.id), w)) return false;
      if (i < 0) index.push(worldEntry(w)); else index[i] = worldEntry(w);
      return write(KEYS.worlds, index);
    },
    deleteWorld(id) {
      remove(KEYS.world(id));
      write(KEYS.worlds, rawList(KEYS.worlds).filter(e => e?.id !== id));
      if (read(KEYS.last)?.world === id) remove(KEYS.last);
    },
    // the hero and world played last (Continue), if both are still there
    last() {
      const l = read(KEYS.last);
      return isObj(l) && store.hero(l.hero) && store.worlds().some(e => e.id === l.world) ? { hero: l.hero, world: l.world } : null;
    },
    setLast: (hero, world) => write(KEYS.last, { hero, world }),
  };
  return store;
}

// A Storage in memory (tests; private browsing where localStorage throws)
export function memoryStorage() {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, get size() { return m.size; } };
}
