// Browser integration checks. Resets to a fresh seed-3 run before and after testing.
//   runInventoryChecks: the modal, equipment, rewards, revisits
//   runWeaponLootChecks: weapon drops, labels, click pickup, the inventory's floor column, dropping, deaths
import { player, state, view } from '../../src/game/state.js';
import { newWorld, enterCube, spawnEntry, hurt } from '../../src/game/flow.js';
import { updatePlayer } from '../../src/game/update.js';
import { allEnemies, resetEnemies, updateEnemies, ENTRY_GRACE } from '../../src/game/enemies.js';
import { setInventoryOpen, updateInventory } from '../../src/game/inventory.js';
import { clearInput, inputDir } from '../../src/game/input.js';
import { equipOwnedWeapon, devSwapWeapon } from '../../src/game/equipment.js';
import { runCommand } from '../../src/game/commands.js';
import { WEAPONS, ITEMS } from '../../src/core/items.js';
import { lootHere, updateLoot, requestCollect, dropLoot, dropFromBag, floorItems, takeNow } from '../../src/game/loot.js';
import { updateLootLabels } from '../../src/game/lootlabels.js';
import { lootView } from '../../src/render/loot.js';
import { orderPickup, followOrder, order } from '../../src/game/orders.js';
import { combatStats } from '../../src/core/combat.js';
import { addItem, addCopper, copperTotal, equippedItem } from '../../src/core/inventory.js';
import { awardXP, xpScale } from '../../src/core/progression.js';
import { startSwing, cancelSwing, damageEnemy } from '../../src/core/combat.js';
import { character } from '../../src/render/character.js';
import { paused } from './combat.js';
import { answerDeath } from '../../src/game/deathask.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const press = code => {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
};
const $ = id => document.getElementById(id);
async function settleEquipment() {
  for (let i = 0; i < 200 && state.equipping; i++) await delay(20);
  check(!state.equipping, 'Weapon load timed out');
  updateInventory();
}
// in its socket: bows in the left fist, everything else in the right
function correctModel(w) {
  return equippedItem(player.inventory)?.itemId === w.id
    && character.sword.parent === character.bones[w.weapon.kind === 'bow' ? 'hand.L' : 'hand.R']
    && !!character.sword.getObjectByName(w.id === 'weapon_sword_old' ? 'Sword' : w.id);
}
// every sword and the first of each other kind (all of them would fill the bag)
const SAMPLE = [...WEAPONS.filter(w => w.weapon.kind === 'sword'),
  ...['bow', 'crossbow', 'staff'].map(k => WEAPONS.find(w => w.weapon.kind === k))];

export async function runInventoryChecks() {
  const results = [];
  await newWorld(3); clearInput();
  try {
    check(correctModel(WEAPONS[0]) && player.level === 1 && equippedItem(player.inventory).gen?.name === 'Old Sword', 'Run must start with the Old Sword / level 1');
    press('KeyI');
    check(state.inventoryOpen && !$('inventory-overlay').hidden, 'I must open inventory');
    check(document.querySelectorAll('.inventory-slot').length === 24, 'Inventory must have 24 bag slots');
    check(document.querySelectorAll('.coin-slot').length === 3, 'Currency needs three reserved slots');
    check(!$('inventory-dev'), 'Developer weapons come from the console (/weapon), not the inventory');
    const before = [state.time, player.x, player.y, player.z, player.hp, view.yawTarget, view.zoomTarget];
    for (const code of ['KeyW','Space','ShiftLeft','ControlLeft','KeyQ','KeyK','KeyL','KeyR','KeyN']) press(code);
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    updatePlayer(1); updateEnemies(1);
    await delay(200);
    check(JSON.stringify(before) === JSON.stringify([state.time,player.x,player.y,player.z,player.hp,view.yawTarget,view.zoomTarget]), 'Inventory must freeze simulation and suppress gameplay input');
    check(!player.sword.requested && !player.sword.active, 'UI input must not queue a slash');
    results.push('I opens / 24 slots / currency / simulation pause / input isolation');

    for (const w of SAMPLE) {
      if (state.dev) {
        check(await runCommand(`/weapon ${w.id}`), '/weapon must equip ' + w.id);
      } else {
        check(!await runCommand(`/weapon ${w.id}`), 'Non-dev runs must not know /weapon');
        check(!await devSwapWeapon(w.id), 'Non-dev runs must reject dev grants');
        if (!player.inventory.slots.some(s => s?.itemId === w.id)) addItem(player.inventory, w.id);
        await equipOwnedWeapon(player.inventory.slots.find(s => s?.itemId === w.id).instanceId);
      }
      await settleEquipment(); check(correctModel(w), 'Equipment stats / model mismatch for ' + w.id);
      check(!player.sword.active && !player.sword.requested, 'Equipping must not attack');
    }
    const basicIndex = player.inventory.slots.findIndex(s => s?.itemId === WEAPONS[0].id);
    document.querySelector(`[data-slot="${basicIndex}"]`).click(); $('inventory-equip').click();
    await settleEquipment(); check(correctModel(WEAPONS[0]), 'Owned slot Equip action must work');
    results.push('all six swords and a bow, crossbow and staff load in their sockets / dev grants / ordinary slot equipment');

    addItem(player.inventory, 'item_potion_health', 150); addCopper(player.inventory, 1237); updateInventory();
    check(JSON.stringify(player.inventory.currency.map(s=>s.count)) === '[1,23,7]', 'Coin denominations must roll up');
    const potionCounts = player.inventory.slots.filter(s=>s?.itemId === 'item_potion_health').map(s=>s.count);
    check(JSON.stringify(potionCounts) === '[99,54]', 'Items must stack across slots (onto the three a run starts with)');
    check([...document.querySelectorAll('.inventory-slot .count')].some(el=>el.textContent === '99'), 'Stack count must be visible');
    await delay(150);
    check([...document.querySelectorAll('#inventory-grid img, #inventory-currency img')].every(img=>img.complete && img.naturalWidth), 'Inventory previews failed to load');
    press('Escape'); check(!state.inventoryOpen && $('inventory-overlay').hidden, 'Escape must close inventory');
    check(inputDir().every(n=>n === 0) && !player.sword.requested, 'Closing must not replay input');
    results.push('visible counts / 1g 23s 7c conversion / Escape / no buffered input');

    await paused(async () => {
      startSwing(player); setInventoryOpen(true);
      check($('inventory-equip').disabled, 'Mid-swing weapon switches must be disabled');
      check(!await equipOwnedWeapon(player.inventory.slots.find(s=>s?.itemId === WEAPONS[1].id).instanceId), 'Equipment API must guard active swings');
      setInventoryOpen(false); cancelSwing(player, true);
      const hostile = await state.cubes.get('0,0,-2'), town = await state.cubes.get('0,0,0');
      enterCube(hostile, 2);
      const e = allEnemies()[0]; check(e && e.level === 1, 'Need a level-1 surface enemy');
      const xp = player.xp, coins = copperTotal(player.inventory), expectedCoins = e.coinDrop, id = e.id;
      const expectedXP = Math.round(e.profile.xp * xpScale(player.level, e.level));
      damageEnemy(e, e.hp); updateEnemies(1/60);
      const loot = () => lootHere().filter(p => ITEMS[p.itemId].category === 'currency').reduce((n, p) => n + ITEMS[p.itemId].value * p.count, 0);
      check(player.xp === xp + expectedXP && copperTotal(player.inventory) === coins && loot() === expectedCoins, 'Death must grant XP and drop the seeded coins');
      // C from a cell away pulls them all in; they count once they arrive
      Object.assign(player, { x: e.x + 1, z: e.z, y: e.y, visY: e.y });
      for (let i = 0; i < 40; i++) updateLoot(1/60, i / 60);   // let them land
      requestCollect();
      for (let i = 0; i < 120 && lootHere().length; i++) updateLoot(1/60, 1 + i / 60);
      check(!lootHere().some(p => !p.gen) && copperTotal(player.inventory) === coins + expectedCoins, 'C must collect the dropped coins');
      const earnedXP = player.xp, earnedCoins = copperTotal(player.inventory);
      updateEnemies(1/60); resetEnemies(); updateEnemies(1/60);
      check(!allEnemies().some(e=>e.id === id), 'Defeated enemies must not respawn');
      check(player.xp === earnedXP && copperTotal(player.inventory) === earnedCoins, 'Rewards must not duplicate');
      enterCube(town, 3); enterCube(hostile, 2);
      check(!allEnemies().some(e=>e.id === id) && player.xp === earnedXP, 'Cube revisits must keep defeated IDs and progression');
      awardXP(player, 100); const level = player.level, equipped = player.inventory.equipped;
      player.hp = 1; spawnEntry();
      check(player.hp === player.maxHp && player.level === level && player.inventory.equipped === equipped
        && copperTotal(player.inventory) === earnedCoins, 'Death/respawn must preserve progression, equipment and currency');
      // a death puts the cube back as it was when you came in: enemies return, their coins go
      const again = allEnemies()[0], againId = again.id;
      damageEnemy(again, again.hp); updateEnemies(1/60);
      check(again.mode === 'dead' && state.run.defeated.has(againId), 'Need a second kill');
      hurt(player.hp, 'Test death'); answerDeath(true);   // "You died": respawn (game/deathask.js)
      check(!state.run.defeated.has(againId) && allEnemies().some(e=>e.id === againId) && !lootHere().length
        && !allEnemies().some(e=>e.id === id), 'Death must restore the cube as entered (and only that)');
      check(state.enemyGrace === ENTRY_GRACE, 'Enemies must hold their attacks after a respawn');
      results.push('real cube death reward / no duplicate rewards / revisits / max-HP respawn / death resets the visit');

      const pending = equipOwnedWeapon(player.inventory.slots.find(s=>s?.itemId === WEAPONS[4].id).instanceId);
      await newWorld(3);
      check(!await pending && correctModel(WEAPONS[0]), 'Old asynchronous equipment must not cross a new-run reset');
      check(player.xp === 0 && player.level === 1 && player.maxHp === 100 && copperTotal(player.inventory) === 0
        && player.inventory.slots.filter(Boolean).length === 3 && state.run.defeated.size === 0 && !state.run.chests.size, 'New world must reset the entire run');
      results.push('new-run reset / stale asynchronous weapon requests');
    });
    const resumedAt = state.time;
    for (let i = 0; i < 100 && state.time === resumedAt; i++) await delay(20);
    check(state.time > resumedAt, 'Browser checks must resume the main frame loop');
    return results;
  } finally { setInventoryOpen(false); clearInput(); await newWorld(3); }
}

const steps = (n, f) => { for (let i = 0; i < n; i++) f(i); };
export async function runWeaponLootChecks() {
  const results = [];
  await newWorld(3); clearInput();
  try {
    await paused(async () => {
      const hostile = await state.cubes.get('0,0,-2');
      enterCube(hostile, 2);
      const weapons = () => lootHere().filter(p => p.gen && ITEMS[p.itemId].weapon);   // (not the armor it drops too)
      dropLoot({ id: 'browser:guardian', level: 20, guardian: true, guardianRole: 'descent', x: player.x, y: player.y, z: player.z }, 0);
      steps(90, i => updateLoot(1 / 60, i / 60));
      check(weapons().length === 2 && weapons().every(p => p.toss === 1), 'A level-20 descent guardian drops two weapons');
      const armor = lootHere().filter(p => ITEMS[p.itemId].armor);
      check(armor.length === 1, 'and a piece of armor');
      for (const p of armor) takeNow(p);   // (into the bag: the floor is the weapons' from here)
      check(weapons().every(p => ['remarkable', 'fabled', 'impossible', 'omg'].includes(p.gen.rarity)), 'Descent guardians drop Remarkable or better from level 20');
      const isPotion = id => ITEMS[id].category === 'potion', bagged = () => player.inventory.slots.reduce((n, s) => n + (s && isPotion(s.itemId) ? s.count : 0), 0);
      const potions = () => lootHere().filter(p => isPotion(p.itemId)).reduce((n, p) => n + p.count, 0);
      check(potions() === 2, 'and two potions');
      const w = weapons()[0], had = bagged();
      Object.assign(player, { x: w.x, z: w.z, y: w.y, visY: w.y }); requestCollect();
      steps(90, i => updateLoot(1 / 60, 2 + i / 60));
      check(weapons().length === 2, 'Walking over weapons and C leave them on the floor');
      check(!potions() && bagged() === had + 2, 'C collects the potions');
      results.push('guardian weapon and potion drops / walk-over and C ignore weapons');

      for (let i = 0; i < 100 && !weapons().every(lootView); i++) { await delay(30); updateLoot(0, 4); }   // models load
      state.showLabels = true; updateLootLabels();
      check(document.querySelectorAll('.loot-label').length >= 2, 'X shows a label per weapon');
      state.showLabels = false; updateLootLabels();
      check(document.querySelectorAll('.loot-label').length === 0 || document.querySelector('.loot-label.hovered'), 'Without X only the hovered item has a label');
      orderPickup(w);
      steps(30, i => { followOrder(1 / 60); updateLoot(1 / 60, 4 + i / 60); });
      check(!lootHere().includes(w) && player.inventory.slots.some(s => s?.gen?.name === w.gen.name) && !order.kind, 'A clicked weapon in reach is picked up');
      results.push('labels / click pickup');

      press('KeyV');
      check(state.inventoryOpen && !$('inventory-floor-col').hidden && floorItems().length === 1, 'V (like I) opens the inventory with the floor beside it');
      check(document.querySelectorAll('#inventory-floor [data-floor]').length === 1, 'The floor column lists the weapons in reach');
      check(/Damage per second \d+/.test($('inventory-item-stats').textContent) && /Damage per second\s*\d+\s*→\s*\d+/.test($('inventory-item-compare').textContent),
        'A weapon shows its damage per second and compares by it');
      const before = player.inventory.slots.filter(Boolean).length;
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
      check(player.inventory.slots.filter(Boolean).length === before + 1 && floorItems().length === 0, 'Enter takes the selected floor item');
      for (const s of player.inventory.slots.filter(s => s && ITEMS[s.itemId].weapon)) dropFromBag(s.instanceId);
      check(!player.inventory.equipped && combatStats(player) === null && !startSwing(player), 'Dropping the last weapon leaves you unable to attack');
      updateInventory();
      check(floorItems().length === 3 && /None/.test($('inventory-equipped').textContent), 'Dropped weapons lie on the floor');
      press('KeyV');
      check(!state.inventoryOpen, 'V closes the panel again');
      results.push('inventory floor take / drop / last weapon');

      const kept = weapons().filter(p => p.kept).length;
      dropLoot({ id: 'browser:guardian2', level: 8, guardian: true, guardianRole: 'side', x: player.x, y: player.y, z: player.z }, 0);
      check(weapons().length === kept + 1, 'A side guardian drops one weapon');
      hurt(player.hp, 'Test death'); answerDeath(true);   // "You died": respawn (game/deathask.js)
      check(weapons().length === kept && weapons().every(p => p.kept), 'A death keeps what you dropped and takes back fresh drops');
      results.push('deaths keep dropped items');
    });
    return results;
  } finally { setInventoryOpen(false); clearInput(); state.showLabels = false; await newWorld(3); }
}
