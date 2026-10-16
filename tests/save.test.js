import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHero, checkHero, heroStats, heroLevel, checkInventory, createWorld, checkWorld, worldName, cleanName,
  openStore, memoryStorage, KEYS, MAX_HEROES, MAX_WORLDS, SAVE_VERSION } from '../src/core/save.js';
import { addInstance, addItem, assignBar, equippedItem, countOf, BAG_SIZE } from '../src/core/inventory.js';
import { xpForLevel, maxHealth, START_POTIONS } from '../src/core/progression.js';
import { HEALTH_POTION, OLD_SWORD } from '../src/core/items.js';
import { rollWeapon } from '../src/core/gear/generate.js';
import { mulberry32 } from '../src/core/util.js';

const roundTrip = x => JSON.parse(JSON.stringify(x));

test('a new hero starts like a new game: the Old Sword in hand, the scroll and the potions on the bar', () => {
  const h = createHero('  Mia   the  Bold ', { id: 'h-1', now: 5 });
  assert.equal(h.name, 'Mia the Bold');
  assert.equal(h.v, SAVE_VERSION);
  assert.equal(heroLevel(h), 1);
  assert.equal(equippedItem(h.inventory).itemId, OLD_SWORD.id);
  assert.equal(countOf(h.inventory, HEALTH_POTION.id), START_POTIONS);
  assert.deepEqual(checkHero(roundTrip(h)), h, 'a hero comes back as it was saved');
  assert.equal(createHero('', { id: 'h-2' }).name, 'Hero');
});

test('a hero comes into a world at its level with full health and no potions at work', () => {
  const h = { ...createHero('Ben', { id: 'h-1' }), xp: xpForLevel(5) + 10 };
  const s = heroStats(h);
  assert.equal(s.level, 5);
  assert.equal(s.maxHp, maxHealth(5));
  assert.equal(s.hp, s.maxHp);
  assert.deepEqual(s.effects, {});
  assert.notEqual(s.inventory, h.inventory, 'the player gets its own copy of the bag');
  assert.deepEqual(s.inventory, h.inventory);
});

test('a saved bag is checked: what the game does not know leaves it, the bar and hand follow', () => {
  const h = createHero('Ann', { id: 'h-1' }), inv = h.inventory;
  const sword = addInstance(inv, rollWeapon(mulberry32(3), 4));
  addItem(inv, 'item_coin_gold', 7);
  assignBar(inv, 2, sword);
  const saved = roundTrip(inv);
  saved.slots[BAG_SIZE - 1] = { instanceId: 'item-99', itemId: 'item_from_the_future', count: 1 };
  saved.slots[BAG_SIZE - 2] = { instanceId: sword, itemId: HEALTH_POTION.id, count: 1 };   // the same instance twice
  saved.slots[BAG_SIZE - 3] = { instanceId: 'item-40', itemId: HEALTH_POTION.id, count: 1000 };   // more than a stack
  const back = checkInventory(saved);
  assert.equal(back.slots.filter(Boolean).length, inv.slots.filter(Boolean).length);
  assert.equal(back.currency.find(c => c.itemId === 'item_coin_gold').count, 7);
  assert.deepEqual(back.bar, inv.bar);
  assert.equal(back.equipped, inv.equipped);
  assert.ok(back.nextInstance >= inv.nextInstance);

  // the equipped weapon and a barred one gone (an update took the item out): hand and bar let go
  const gone = roundTrip(inv);
  gone.slots = gone.slots.map(s => s && (s.instanceId === inv.equipped || s.instanceId === sword) ? { ...s, itemId: 'weapon_gone' } : s);
  const b2 = checkInventory(gone);
  assert.equal(b2.equipped, null);
  assert.equal(b2.bar[2], null);
  assert.equal(b2.bar[0]?.instanceId, inv.bar[0].instanceId, 'the town portal scroll is still there');
  // an instance number from a newer page: new ones never meet it
  const later = roundTrip(inv); later.slots[BAG_SIZE - 1] = { instanceId: 'item-500', itemId: HEALTH_POTION.id, count: 2 }; later.nextInstance = 3;
  assert.equal(checkInventory(later).nextInstance, 501);
  assert.deepEqual(checkInventory(null).slots, Array(BAG_SIZE).fill(null));
});

test('damaged or foreign hero entries are not heroes', () => {
  const h = createHero('Ann', { id: 'h-1' });
  assert.equal(checkHero(null), null);
  assert.equal(checkHero({ ...h, v: SAVE_VERSION + 1 }), null, 'a newer version wrote it');
  assert.equal(checkHero({ ...h, id: '../x' }), null);
  assert.equal(checkHero({ ...h, xp: -4 }), null);
  assert.equal(checkHero({ ...h, name: '<b>' + 'x'.repeat(40) }).name.length, 16);
});

test('names are plain and short', () => {
  assert.equal(cleanName('a\u0000b\n c'), 'ab c');
  assert.equal(cleanName(42), '');
  assert.equal(cleanName('x'.repeat(30)).length, 16);
});

test('a world is named after its seed, the same every time', () => {
  assert.equal(worldName(7), worldName(7));
  assert.match(worldName(7), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => worldName(i))).size > 25, 'seeds give different names');
  for (let i = 0; i < 200; i++) { const [a, b] = worldName(i).split(' '); assert.notEqual(a, b); }
  assert.equal(createWorld(7, { id: 'w-1' }).name, worldName(7));
  assert.equal(createWorld(7, { id: 'w-1', name: 'Home' }).name, 'Home');
  assert.equal(createWorld(-1, { id: 'w-1' }).seed, 0xffffffff);
});

test('a world comes back as it was saved; what does not make sense is left out', () => {
  const w = createWorld(123, { id: 'w-1', now: 9 });
  Object.assign(w, { deepest: 3, faces: ['0,0,0/0'], visited: ['0,0,0', '1,0,0', 'interior:inn'] });
  Object.assign(w.run, { defeated: ['e1'], gates: ['g'], chests: ['c'], dropped: ['e:e1'],
    townPortal: { key: '1,-1,0', depth: 1, pad: { x: 1, y: 2, z: 3 }, back: { x: 4, y: 5, z: 6 } },
    loot: [['1,0,0', [{ id: 'e:e1#0', source: 'e:e1', itemId: 'item_coin_copper', count: 3, x: 1, y: 0, z: 2, from: [1, 0.4, 2], toss: 1 }]]] });
  w.spots['h-1'] = { cube: '1,0,0', arrival: { x: 8.5, y: 0, z: 2.5 } };
  assert.deepEqual(checkWorld(roundTrip(w)), w);

  const bad = roundTrip(w);
  bad.run.defeated.push(5);
  bad.run.loot[0][1].push({ id: 'x', source: 'e:2', itemId: 'nope', count: 1, x: 0, y: 0, z: 0, from: [0, 0, 0], toss: 1 });
  bad.run.loot.push(['2,0,0', 'not a list']);
  bad.run.townPortal.pad = null;
  bad.spots['h-2'] = { cube: '1,0,0', arrival: { x: NaN, y: 0, z: 0 } };
  const back = checkWorld(bad);
  assert.deepEqual(back.run.defeated, ['e1']);
  assert.deepEqual(back.run.loot, w.run.loot);
  assert.equal(back.run.townPortal, null);
  assert.deepEqual(Object.keys(back.spots), ['h-1']);
  assert.equal(checkWorld({ ...w, seed: 1.5 }), null);
  assert.equal(checkWorld({ ...w, v: 0 }), null);
});

test('the store keeps up to three heroes and eight worlds', () => {
  const storage = memoryStorage(), store = openStore(storage);
  const heroes = Array.from({ length: MAX_HEROES }, (_, i) => createHero(`H${i}`, { id: `h-${i}`, now: i }));
  for (const h of heroes) assert.ok(store.putHero(h));
  assert.equal(store.putHero(createHero('One too many', { id: 'h-x' })), false);
  assert.deepEqual(store.heroes().map(h => h.name), ['H0', 'H1', 'H2']);
  assert.ok(store.putHero({ ...heroes[1], xp: 900 }), 'an existing hero is overwritten');
  assert.equal(store.hero('h-1').xp, 900);

  for (let i = 0; i < MAX_WORLDS; i++) assert.ok(store.putWorld({ ...createWorld(i, { id: `w-${i}` }), updated: i }));
  assert.equal(store.putWorld(createWorld(99, { id: 'w-x' })), false);
  assert.equal(store.worlds().length, MAX_WORLDS);
  assert.equal(store.worlds()[0].id, `w-${MAX_WORLDS - 1}`, 'the newest first');
  assert.equal(store.world('w-x'), null);
  assert.equal(store.world('w-2').seed, 2);
});

test('deleting a hero takes its spots out of the worlds and forgets it was played last', () => {
  const store = openStore(memoryStorage());
  const a = createHero('A', { id: 'h-a' }), b = createHero('B', { id: 'h-b' });
  store.putHero(a); store.putHero(b);
  const w = createWorld(5, { id: 'w-1' });
  w.spots = { 'h-a': { cube: '0,0,0', arrival: { x: 1, y: 0, z: 1 } }, 'h-b': { cube: '0,0,0', arrival: { x: 2, y: 0, z: 2 } } };
  store.putWorld(w);
  store.setLast('h-a', 'w-1');
  assert.deepEqual(store.last(), { hero: 'h-a', world: 'w-1' });
  assert.deepEqual(store.worlds()[0].heroes, ['h-a', 'h-b']);
  store.deleteHero('h-a');
  assert.deepEqual(Object.keys(store.world('w-1').spots), ['h-b']);
  assert.deepEqual(store.worlds()[0].heroes, ['h-b']);
  assert.equal(store.last(), null);
  store.setLast('h-b', 'w-1');
  store.deleteWorld('w-1');
  assert.equal(store.world('w-1'), null);
  assert.equal(store.worlds().length, 0);
  assert.equal(store.last(), null);
});

test('the store leaves alone what it cannot read, and says when the storage refuses', () => {
  const storage = memoryStorage(), store = openStore(storage);
  storage.setItem(KEYS.heroes, JSON.stringify([{ v: SAVE_VERSION + 1, id: 'h-new', name: 'From the future' }, 'junk']));
  assert.deepEqual(store.heroes(), []);
  store.putHero(createHero('Now', { id: 'h-now' }));
  assert.equal(JSON.parse(storage.getItem(KEYS.heroes)).length, 3, 'the unreadable entries are kept');
  storage.setItem(KEYS.worlds, '{not json');
  assert.deepEqual(store.worlds(), []);

  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} };
  const s2 = openStore(full);
  assert.equal(s2.putHero(createHero('X', { id: 'h-x' })), false);
  assert.equal(s2.putWorld(createWorld(1, { id: 'w-x' })), false);
});
