// The developer commands (?dev=1), typed in the chat box (game/console.js): spawning and
// clearing enemies, getting about, items and the hero. They do what the dev tools always did
// (game/devspawn.js, game/dev.js, game/equipment.js), now by name: /help lists them.
import { addCommand, addType } from '../core/commands.js';
import { ITEMS } from '../core/items.js';
import { ENEMY_KINDS } from '../core/enemies.js';
import { addItem } from '../core/inventory.js';
import { xpForLevel, levelFromXP, maxHealth } from '../core/progression.js';
import { MAX_ILVL } from '../core/gear/generate.js';
import { RARITY } from '../core/gear/rarities.js';
import { online } from '../net/online.js';
import { player, state } from './state.js';
import { commands } from './commands.js';
import { spawnEnemies, killEnemies, clearEnemies } from './devspawn.js';
import { goTo, goHorde, goArena, goAdjacent, goSpan, goFeature, goStructure, FEATURES } from './dev.js';
import { BRIDGE_STYLES, LADDER_STYLES } from '../themes/builds.js';
import { ARENA_WEIGHTS } from '../world/arenas.js';
import { devSwapWeapon, devDropWeapon, devWear } from './equipment.js';
import { forceMood } from './music.js';
import { nextCube, newWorld } from './flow.js';
import { pickFloor, pointer } from './pointer.js';
import { heroLevel, MAX_WORLDS } from '../core/save.js';
import { store, play, saveAs, newSavedWorld, savedHero, savedWorld, forget } from './save.js';
import { quitToMenu } from './menu.js';

const dev = cmd => addCommand(commands, { ...cmd, dev: true });
const ahead = (d = 2.5) => ({ x: player.x + Math.sin(player.yaw) * d, y: player.y, z: player.z + Math.cos(player.yaw) * d });

// --- enemies ---------------------------------------------------------------------------------

dev({
  name: 'spawn', help: 'put enemies in this cube (level: what this depth gives)',
  args: [{ name: 'enemy', type: 'enemy' }, { name: 'level', type: 'int', optional: true, min: 1, max: 99 },
    { name: 'count', type: 'int', optional: true, min: 1, max: 20 }, { name: 'where', type: 'where', optional: true }],
  run({ enemy, level = null, count = 1, where = 'front' }) {
    const at = where === 'cursor' ? pointer.inside && pickFloor() : ahead();
    if (!at) return 'The cursor is not on the floor';
    const list = spawnEnemies(enemy, { level, n: count, at }), k = ENEMY_KINDS[enemy];
    return list.length ? `Spawned ${list.length} × ${k.label} (level ${list[0].level})` : `No room for a ${k.label} here`;
  },
});
dev({ name: 'kill', help: 'every enemy here dies (with XP and loot)', run: () => `Killed ${killEnemies()} enemies` });
dev({ name: 'remove', help: 'every enemy here goes (no XP, no loot)', run: () => `Removed ${clearEnemies()} enemies` });
dev({
  name: 'passive', help: 'enemies stand still and never attack (again: they wake up)', args: [{ name: 'on|off', type: 'toggle', optional: true }],
  run({ 'on|off': on }) {
    state.devPassive = on ? on === 'on' : !state.devPassive;
    return `Enemies are ${state.devPassive ? 'passive' : 'awake'}`;
  },
});

// --- getting about -------------------------------------------------------------------------

dev({
  name: 'goto', help: 'take the nearest way down or up on this depth (PgDn / PgUp)', args: [{ name: 'way', type: 'way' }],
  run({ way }) { goTo(way, true); },
});
dev({
  name: 'find', help: 'stand next to the nearest way down or up (G)', args: [{ name: 'way', type: 'way' }],
  run({ way }) { goTo(way, false); },
});
dev({
  name: 'go', help: 'into the cube next to this one (Alt + WASD)', args: [{ name: 'side', type: 'dir' }],
  run({ side }) { goAdjacent(['east', 'west', 'south', 'north'].indexOf(side)); },
});
dev({
  name: 'horde', help: "a depth's wild horde (H)", args: [{ name: 'depth', type: 'depth', optional: true }],
  async run({ depth }) { await goHorde(depth === undefined ? undefined : Number(depth)); },
});
dev({
  name: 'span', help: 'the start of a gorge span\'s long bridge (the next one, or the n-th)', args: [{ name: 'n', type: 'int', optional: true }],
  async run({ n }) { await goSpan(n === undefined ? undefined : Number(n)); },
});
addType(commands, { name: 'bridgestyle', values: () => Object.keys(BRIDGE_STYLES).map(s => ({ value: s, label: s })) });
dev({
  name: 'bridge', help: 'stand at the next bridge (of a style) from this depth (or that one) on down',
  args: [{ name: 'style', type: 'bridgestyle', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ style, depth }) { await goStructure('bridge', style, depth === undefined ? undefined : Number(depth)); },
});
addType(commands, { name: 'ladderstyle', values: () => Object.keys(LADDER_STYLES).map(s => ({ value: s, label: s })) });
dev({
  name: 'ladder', help: 'stand at the foot of the next ladder (of a style) from this depth (or that one) on down',
  args: [{ name: 'style', type: 'ladderstyle', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ style, depth }) { await goStructure('ladder', style, depth === undefined ? undefined : Number(depth)); },
});
addType(commands, { name: 'feature', values: () => FEATURES.map(f => ({ value: f, label: f })) });
dev({
  name: 'height', help: 'the next of the big height pieces: a tableland\'s ascent, plateau or descent, a great shaft, a pinnacle, a tunnel',
  args: [{ name: 'kind', type: 'feature' }],
  async run({ kind }) { await goFeature(kind); },
});
addType(commands, { name: 'arena', values: () => Object.keys(ARENA_WEIGHTS.descent).map(t => ({ value: t, label: t })) });
dev({
  name: 'arena', help: 'a guardian arena of this kind (nearest depth first)',
  args: [{ name: 'kind', type: 'arena', optional: true }, { name: 'depth', type: 'depth', optional: true }],
  async run({ kind, depth }) { await goArena(kind, depth === undefined ? undefined : Number(depth)); },
});
dev({
  name: 'newworld', help: 'start a new world (N), with this seed', args: [{ name: 'seed', type: 'int', optional: true, min: 0, max: 2 ** 32 - 1 }],
  run({ seed }) {
    if (online.role === 'guest') return 'Only the host starts a new world';
    if (seed === undefined) { nextCube(); return; }
    newWorld(seed);
  },
});

// --- things ----------------------------------------------------------------------------------

dev({
  name: 'give', help: 'put things in the bag (weapons: /weapon)', args: [{ name: 'item', type: 'item' }, { name: 'count', type: 'int', optional: true, min: 1, max: 9999 }],
  async run({ item, count = 1 }) {
    const def = ITEMS[item];
    if (def.weapon) return await devSwapWeapon(item, 'common', 1) ? `Equipped: ${def.name} (Common)` : 'No room in the bag';
    return addItem(player.inventory, item, count) ? `+${count} ${def.name}` : 'No room in the bag';
  },
});
dev({
  name: 'weapon', help: 'roll a weapon and equip it (or drop it at your feet)',
  args: [{ name: 'weapon', type: 'weapon' }, { name: 'rarity', type: 'rarity', optional: true },
    { name: 'level', type: 'int', optional: true, min: 1, max: MAX_ILVL }, { name: 'drop', type: 'drop', optional: true }],
  async run({ weapon, rarity = 'rare', level = 8, drop }) {
    const name = `${ITEMS[weapon].name} (${RARITY[rarity].name}, item level ${level})`;
    if (drop) return devDropWeapon(weapon, rarity, level) ? `Dropped: ${name}` : 'Could not drop it here';
    return await devSwapWeapon(weapon, rarity, level) ? `Equipped: ${name}` : 'Could not equip it (bag full, or busy)';
  },
});
dev({
  name: 'wear', help: 'put something on your head (off: take it off)', args: [{ name: 'thing', type: 'wearable' }],
  async run({ thing }) {
    const off = thing === 'off';
    return await devWear(off ? null : thing) ? off ? 'Took it off' : `Wearing the ${ITEMS[thing].name}` : 'Could not wear that now';
  },
});
dev({
  name: 'gold', help: 'gold coins into the purse', args: [{ name: 'amount', type: 'int', min: 1, max: 1e6 }],
  run({ amount }) { addItem(player.inventory, 'item_coin_gold', amount); return `+${amount} gold`; },
});

// --- the hero ----------------------------------------------------------------------------------

dev({
  name: 'heal', help: 'full health, no poison, no fire, no chill',
  run() {
    if (player.hp <= 0 || player.down) return 'Too late for that';
    player.hp = player.maxHp; player.burning = null; player.toxic = null; player.chilled = null;
    return 'Healed';
  },
});
dev({
  name: 'level', help: 'become this level (health full)', args: [{ name: 'level', type: 'int', min: 1, max: 99 }],
  run({ level }) {
    player.xp = xpForLevel(level); player.level = levelFromXP(player.xp);
    player.maxHp = maxHealth(player.level);
    if (player.hp > 0) player.hp = player.maxHp;
    return `Level ${player.level}`;
  },
});
// --- saves (game/save.js) --------------------------------------------------------------------

const heroes = () => store.heroes().map(h => ({ value: h.id, label: h.name, hint: `level ${heroLevel(h)}` }));
const worlds = () => store.worlds().map(w => ({ value: w.id, label: w.name, hint: `seed ${w.seed}, depth ${w.deepest}` }));
addType(commands, { name: 'hero', values: heroes });
addType(commands, { name: 'savedworld', values: () => [...worlds(), { value: 'new', label: 'new', hint: 'a new world' }] });
addType(commands, { name: 'save', values: () => [...heroes().map(h => ({ ...h, hint: `hero, ${h.hint}` })), ...worlds().map(w => ({ ...w, hint: `world, ${w.hint}` }))] });

dev({
  name: 'saves', help: 'the saved heroes and worlds',
  run() {
    const h = savedHero(), w = savedWorld();
    return [`Saving: ${h ? h.name : 'no hero'} in ${w ? w.name : 'no world'}`,
      ...store.heroes().map(x => `hero ${x.name}: level ${heroLevel(x)}, ${Math.round(x.playTime / 60)} min`),
      ...store.worlds().map(x => `world ${x.name}: seed ${x.seed}, depth ${x.deepest}`)].join('\n');
  },
});
dev({
  name: 'save', help: 'save as this hero (made, or overwritten) in this world (saved as a new one if it is not yet)',
  args: [{ name: 'hero', type: 'text' }],
  run({ hero }) { return saveAs(hero); },
});
dev({
  name: 'load', help: 'play a saved hero in a saved world (its own one, else a new one)',
  args: [{ name: 'hero', type: 'hero' }, { name: 'world', type: 'savedworld', optional: true }],
  async run({ hero, world }) {
    if (online.role) return 'Not while playing together';
    world ??= store.heroWorld(hero)?.id ?? 'new';
    if (world === 'new') { const w = newSavedWorld(); if (!w) return `There are ${MAX_WORLDS} worlds already`; world = w.id; }
    await play(hero, world);
    return `${savedHero().name} in ${savedWorld().name}`;
  },
});
dev({ name: 'menu', help: 'save and quit to the main menu', run() { quitToMenu(); } });
dev({
  name: 'delete', help: 'delete a saved hero or world', args: [{ name: 'save', type: 'save' }],
  run({ save }) {
    const h = store.hero(save), w = store.worlds().find(x => x.id === save);
    forget(save);
    if (h) store.deleteHero(save); else store.deleteWorld(save);
    return `Deleted ${h ? `hero ${h.name}` : `world ${w.name}`}`;
  },
});

dev({
  name: 'music', help: 'hold one mood of the music (auto: let go)', args: [{ name: 'mood', type: 'mood' }],
  run({ mood }) { forceMood(mood === 'auto' ? null : mood); return mood === 'auto' ? 'The music picks its mood again' : `Music: ${mood}`; },
});
