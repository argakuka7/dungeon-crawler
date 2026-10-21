// Browser checks for armor (docs/armor.md). Resets to a fresh seed-3 run before and after.
//   runArmorChecks: wearing from the bag, the parts on their bones, rarity trim, the maximum
//   health, blocks and armor on blows, the shield on the back with a bow, the Smith's wares
//
// In the browser console (?dev=1):
//   await (await import('./tests/browser/armor.js')).runArmorChecks()
import { player, state } from '../../src/game/state.js';
import { newWorld } from '../../src/game/flow.js';
import { setInventoryOpen, talkTo, updateInventory } from '../../src/game/inventory.js';
import { updateArmor } from '../../src/game/armor.js';
import { hitPlayer } from '../../src/game/enemycombat.js';
import { devSwapWeapon } from '../../src/game/equipment.js';
import { ITEMS } from '../../src/core/items.js';
import { addInstance, addCopper, wornItem } from '../../src/core/inventory.js';
import { rollArmor } from '../../src/core/gear/generate.js';
import { maxHealth } from '../../src/core/progression.js';
import { character } from '../../src/render/character.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const $ = id => document.getElementById(id);
const settle = async () => { for (let i = 0; i < 100; i++) { updateArmor(state.time); await delay(20); } };

export async function runArmorChecks() {
  const results = [];
  await newWorld(3);
  try {
    // into the bag, worn from it
    const helm = rollArmor(Math.random, 8, { itemId: 'armor_head_horned', rarity: 'fabled' });
    helm.gen.affixes = [{ id: 'hearty', tier: 3, value: 15 }];
    const ids = [helm, rollArmor(Math.random, 8, { itemId: 'armor_body_plate', rarity: 'omg' }),
      rollArmor(Math.random, 8, { itemId: 'armor_shield_kite', rarity: 'vanilla' }),
      rollArmor(Math.random, 8, { itemId: 'armor_feet_greaves', rarity: 'crap' })]
      .map((item, i) => { if (i) item.gen.affixes = []; return addInstance(player.inventory, item); });   // (only the helm's health)
    setInventoryOpen(true);
    for (const id of ids) {
      $('inventory-grid').querySelector(`[data-slot="${player.inventory.slots.findIndex(s => s?.instanceId === id)}"]`).click();
      check($('inventory-equip').textContent === 'Wear', 'a piece of armor in the bag can be worn');
      $('inventory-equip').click();
      check($('inventory-equip').textContent === 'Take off', 'and then taken off');
    }
    check(Object.values(player.inventory.worn).every(Boolean), 'all four slots worn');
    updateInventory();
    check($('inventory-worn').querySelectorAll('[data-worn] img').length === 4, 'under the hero, a slot each shows what is worn');
    check(/Armor\s*\d+/.test($('inventory-equipped').textContent) && /Block/.test($('inventory-equipped').textContent), 'the armor and the block add up under the hero');
    setInventoryOpen(false);
    await settle();
    check(player.maxHp === maxHealth(player.level) + 15, 'the helm\'s health raises the maximum');
    results.push('wear from the bag / worn slots / health');

    // on the hero: every part on its bone, the trim in the rarity's colour
    const w = character.worn;
    check(w.head?.objects[0].parent === character.bones.head, 'the helm on the head');
    check(w.body?.objects.some(o => o.parent === character.bones.spine) && w.body.objects.some(o => o.parent === character.bones['upper_arm.L'])
      && w.body.objects.some(o => o.parent === character.bones['thigh.R']), 'plate on the spine, the shoulders and the thighs');
    check(w.feet?.objects.length === 2 && w.feet.objects.every(o => o.parent === character.bones['shin.L'] || o.parent === character.bones['shin.R']), 'a boot on each shin');
    check(w.shield?.objects[0].parent === character.bones['forearm.L'] && !w.shield.back, 'the shield on the left forearm');
    check(w.body.shine?.rainbow && w.head.shine?.pulse.length, 'OMG plate runs through the rainbow, a Fabled helm glows');
    results.push('parts on their bones / rarity');

    // blows: the armor takes its share, the shield blocks some
    const taken = [];
    for (let i = 0; i < 60; i++) {
      player.hp = player.maxHp; player.ragdoll = null; player.stun = 0;
      hitPlayer({ damage: 40, knock: 3, reason: 'Test', by: { label: 'Test', level: 8 } }, player.x + 1, player.z, -1, 0);
      taken.push(player.maxHp - player.hp);
    }
    check(taken.every(d => d < 40), 'armor takes something off every blow');
    check(new Set(taken.map(d => d.toFixed(2))).size === 2, 'and a block takes most of some: two sizes of hit');
    results.push('armor / blocks');

    // a bow: the shield goes on the back
    check(await devSwapWeapon('weapon_bow_short', 'vanilla', 1), 'took up a bow');
    await settle();
    check(character.worn.shield?.back && character.worn.shield.objects[0].parent === character.bones.spine, 'with a bow, the shield on the back');
    check(await devSwapWeapon('weapon_sword_short', 'vanilla', 1), 'and a sword again');
    await settle();
    check(!character.worn.shield.back, 'and back on the arm');
    results.push('shield on the back');

    // the Smith: armor for sale, bought into the bag
    const smith = state.map.villagers?.find(v => v.name === 'smith');
    if (smith) {
      addCopper(player.inventory, 1e6);
      talkTo(smith);
      const wares = $('inventory-shop').querySelectorAll('[data-ware]');
      check(state.inventoryOpen && wares.length === 6, 'the Smith has six pieces of armor');
      wares[0].click();
      const before = player.inventory.slots.filter(Boolean).length;
      $('inventory-buy').click();
      check(player.inventory.slots.filter(Boolean).length === before + 1 && state.run.smith.sold.length === 1, 'bought one');
      check($('inventory-shop').querySelectorAll('[data-ware]').length === 5, 'and it is gone from his wares');
      setInventoryOpen(false);
      results.push('the Smith sells armor');
    }
    // dropping what is worn takes it off
    const { dropFromBag } = await import('../../src/game/loot.js');
    dropFromBag(wornItem(player.inventory, 'head').instanceId);
    await settle();
    check(!player.inventory.worn.head && !character.worn.head && player.maxHp === maxHealth(player.level), 'dropped: off the hero, the health with it');
    check(ITEMS[wornItem(player.inventory, 'body').itemId].armor, 'the rest stays on');
    results.push('dropping takes it off');
  } finally {
    setInventoryOpen(false);
    await newWorld(3);
  }
  return results;
}
