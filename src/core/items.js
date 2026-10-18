// Item definitions are data, not renderer objects. Equipment uses rig units in the hand sockets.
// These are the base types; a weapon in the bag or on the floor is an instance of one, with its
// own rolled rarity, affixes and name in `gen` (core/gear/). Its stats: core/gear/stats.js.
// `model`: how it looks, on the floor, in a hand and in the bag (render/itemviews.js draws the
// bag's pictures from it).
const model = name => `assets/items/${name}.glb`;
// Base weapon stats at item level 1 (core/gear/stats.js grows the damage with item level):
//   kind: sword, bow, crossbow or staff (how it attacks: core/combat.js KINDS); damage per hit;
//   interval: seconds from one attack to the next (the attack speed; every attack time scales
//   with it, see core/combat.js); range: reach in cells (how far a shot flies for the ranged
//   kinds); arc: × the basic swing arc (swords); pierce: how many enemies a bolt goes through
//   before it stops; burst: the radius (cells) a spell bursts over where it hits, hurting
//   everything else there for BURST_SHARE of its damage (core/shots.js); color: the spell's.
// Swords: the light ones are quick and nimble, the heavy ones hit harder, wider and further but
// plant you for longer; damage per second rises a little with weight, and the heavier bases only
// drop deeper down (core/gear/bases.js). Shooting from afar is safer, so the ranged kinds deal
// less per second than swords of the same weight: bows are quick and reach far, crossbows hit
// hard and slowly and pierce, staffs are slow and burst.
const weapon = (id, name, kind, damage, interval, range, more = {}) => ({
  id, name, category: 'weapon', stackLimit: 1,
  model: more.old ? 'assets/sword.glb' : model(id),
  weapon: { kind, damage, interval, range, arc: more.arc ?? 1, pierce: more.pierce ?? 0,
    burst: more.burst ?? 0, ...(more.color && { color: more.color }) },
});
const sword = (id, name, damage, interval, range, arc = 1, old = false) => weapon(id, name, 'sword', damage, interval, range, { arc, old });
// learn: combat.html#chain (see learn/README.md)
export const WEAPONS = [
  sword('weapon_sword_old', 'Old Sword', 30, .42, .85, 1, true),   //  71 damage per second
  sword('weapon_sword_short', 'Short Sword', 23, .32, .72),         //  72, the fastest
  sword('weapon_sword_medium', 'Medium Sword', 34, .42, .85),       //  81
  sword('weapon_sword_long', 'Long Sword', 39, .48, 1.05),          //  81, long reach
  sword('weapon_sword_broad', 'Broadsword', 46, .54, .88, 1.25),    //  85, a wide sweep
  sword('weapon_sword_greatsword', 'Greatsword', 60, .66, 1.15, 1.3), // 91, wide and long
  weapon('weapon_bow_short', 'Short Bow', 'bow', 22, .44, 5),             // 50, the quickest
  weapon('weapon_bow_hunting', 'Hunting Bow', 'bow', 30, .56, 6),         // 54
  weapon('weapon_bow_recurve', 'Recurve Bow', 'bow', 35, .62, 6.5),       // 56
  weapon('weapon_bow_long', 'Longbow', 'bow', 44, .74, 8),                // 59, the furthest
  weapon('weapon_bow_war', 'War Bow', 'bow', 54, .84, 7),                 // 64
  weapon('weapon_crossbow_hand', 'Hand Crossbow', 'crossbow', 34, .66, 4.5),                // 52
  weapon('weapon_crossbow_light', 'Light Crossbow', 'crossbow', 46, .84, 5.5, { pierce: 1 }), // 55
  weapon('weapon_crossbow_repeating', 'Repeating Crossbow', 'crossbow', 27, .45, 5),       // 60, rapid
  weapon('weapon_crossbow_heavy', 'Heavy Crossbow', 'crossbow', 64, 1.04, 6, { pierce: 1 }), // 62
  weapon('weapon_crossbow_arbalest', 'Arbalest', 'crossbow', 86, 1.28, 7, { pierce: 2 }),  // 67
  weapon('weapon_staff_gnarled', 'Gnarled Staff', 'staff', 27, .58, 4.5, { burst: .5, color: '#8fe07a' }),   // 47
  weapon('weapon_staff_oak', 'Oak Staff', 'staff', 33, .62, 5, { burst: .6, color: '#7fb4ff' }),            // 53
  weapon('weapon_staff_ember', 'Ember Staff', 'staff', 41, .70, 5, { burst: .85, color: '#ff8a3a' }),       // 59
  weapon('weapon_staff_crystal', 'Crystal Staff', 'staff', 47, .74, 5.5, { burst: .7, color: '#bdf3ff' }),  // 64
  weapon('weapon_staff_arcane', 'Arcane Staff', 'staff', 58, .84, 6, { burst: 1, color: '#c48cff' }),       // 69
];
// the kinds of weapon, in the order the UI lists them
export const WEAPON_KINDS = ['sword', 'bow', 'crossbow', 'staff'];
// learn: code.html#lists (see learn/README.md)
export const COINS = [
  { id: 'item_coin_gold', name: 'Gold', value: 1000, suffix: 'g' },
  { id: 'item_coin_silver', name: 'Silver', value: 10, suffix: 's' },
  { id: 'item_coin_copper', name: 'Copper', value: 1, suffix: 'c' },
].map(c => ({ ...c, category: 'currency', stackLimit: Infinity, model: model(c.id) }));
// Potions (core/potions.js has their rules). Two families, both stackable:
//   drinks (`use: 'drink'`): drinking one puts its `effect` on you for `effect.time` s:
//     { heal }: that share of the maximum health, poured in over the time (well under a second)
//     { cure, immune }: ends that status (core/status.js) and keeps it off for the time
//     { buff, value }: a share more of `buff` (core/potions.js BUFFS) for the time
//   flasks (`use: 'throw'`): readied into the hand (game/equipment.js), thrown with a click at
//     what the arc points at, within `flask.range` cells (game/throws.js). They burst over
//     `flask.radius` cells and never hurt the player: `blast` damages, `burn` sets on fire
//     and leaves a burning `patch` for that many s, `toxin` poisons and leaves a `cloud`. Their
//     damage grows with the player's level (core/potions.js flaskPower).
// Each kind has its own cooldown (`cooldown` s; core/potions.js cooldownLeft). `price`: copper
// at the alchemist (core/shops.js); `level`: the least item level they drop at, `weight`: how
// likely they drop against the others (core/gear/drops.js, core/chests.js). `family`: which
// quick bar slot they share by themselves (core/inventory.js autoBar). A new run starts with a
// few health potions on the quick bar.
const potionDef = (id, name, use, spec, description) => ({ id, name, category: 'potion', stackLimit: 99,
  model: model(id), use, cooldown: 1, level: 1, weight: 1, ...spec, description });
const pct = v => `${Math.round(v * 100)}%`;
const BUFF_TEXT = { moveSpeed: v => `You move ${pct(v)} faster`, attackSpeed: v => `You attack ${pct(v)} faster`,
  damage: v => `Your attacks deal ${pct(v)} more damage`, jump: v => `You jump ${pct(v)} higher` };
const drink = (id, name, effect, spec) => potionDef(id, name, 'drink', { family: effect.buff ? 'buff' : effect.heal ? 'heal' : 'cure', ...spec,
  effect }, effect.heal ? `Restores ${pct(effect.heal)} of your health in an instant.`
  : effect.cure ? `Cures poison and keeps it off you for ${effect.time} seconds.` : `${BUFF_TEXT[effect.buff](effect.value)} for ${effect.time} seconds.`);
const flask = (id, name, spec, text) => potionDef(id, name, 'throw', { family: 'flask', ...spec, flask: spec.flask },
  `Click its quick bar slot to take it in hand, then click where to throw it (up to ${spec.flask.range} cells away). ${text} It never hurts you.`);
export const POTIONS = [
  drink('item_potion_health_minor', 'Minor health potion', { heal: 0.25, time: 0.5 }, { price: 15, weight: 5 }),
  drink('item_potion_health', 'Health potion', { heal: 0.4, time: 0.6 }, { price: 40, weight: 6 }),
  drink('item_potion_health_greater', 'Greater health potion', { heal: 0.6, time: 0.7 }, { price: 110, level: 5, weight: 3 }),
  drink('item_potion_health_superior', 'Superior health potion', { heal: 1, time: 0.8 }, { price: 260, level: 10, weight: 1.5 }),
  drink('item_potion_antidote', 'Antidote', { cure: 'toxic', immune: 'toxic', time: 30 }, { price: 30, level: 3, weight: 2 }),
  drink('item_potion_swiftness', 'Swiftness potion', { buff: 'moveSpeed', value: 0.3, time: 30 }, { price: 70, level: 2 }),
  drink('item_potion_haste', 'Haste potion', { buff: 'attackSpeed', value: 0.25, time: 30 }, { price: 90, level: 3 }),
  drink('item_potion_might', 'Potion of might', { buff: 'damage', value: 0.3, time: 30 }, { price: 90, level: 3 }),
  drink('item_potion_leaping', 'Leaping potion', { buff: 'jump', value: 0.5, time: 30 }, { price: 60, level: 2 }),
  flask('item_flask_blast', 'Blast flask', { price: 60, level: 2, weight: 1.5,
    flask: { range: 6, radius: 1.6, blast: 55, color: '#ffb347' } }, 'It explodes where it lands, hurting and throwing back everything around.'),
  flask('item_flask_fire', 'Fire flask', { price: 70, level: 3,
    flask: { range: 6, radius: 1.4, blast: 12, burn: { damage: 45, time: 4, ticks: 8 }, patch: 4, color: '#ff7a2a' } },
    'It bursts into flames: everything around catches fire, and the ground burns on for a while.'),
  flask('item_flask_toxic', 'Toxic flask', { price: 70, level: 4,
    flask: { range: 6, radius: 1.8, toxin: { damage: 60, time: 6, ticks: 6 }, cloud: 6, color: '#8fdc3c' } },
    'It bursts into a poison cloud that lingers; everything in it is poisoned.'),
];
export const HEALTH_POTION = POTIONS.find(p => p.id === 'item_potion_health');
// Mana and stamina potions and the materials have inventory definitions only (no mana or
// stamina yet); no use or crafting.
const stackables = [
  ['item_potion_mana', 'Mana potion'], ['item_potion_stamina', 'Stamina potion'],
  ['item_stick_short', 'Short stick'], ['item_stick_long', 'Long stick'], ['item_stick_forked', 'Forked stick'],
  ...['ruby', 'diamond', 'emerald', 'sapphire', 'amethyst'].map(s => [`item_crystal_${s}`, s[0].toUpperCase() + s.slice(1)]),
].map(([id, name]) => ({ id, name, category: 'item', stackLimit: 99, model: model(id) }));
// Tools are used, not consumed. `bound`: never leaves the bag (no Drop); `use`: what using it
// does (game/quickbar.js useItem). They never lie on the floor, so they have no `model`; their
// `picture` is the model the bag shows them as (render/itemviews.js). `together`: the name and
// description it goes by while friends play along (game/itemnames.js); it is the same item.
export const TOWN_PORTAL = {
  id: 'item_town_portal', name: 'Town Portal Scroll', category: 'tool', stackLimit: 1, bound: true, use: 'townPortal',
  description: 'Opens a portal to town after 5 seconds of standing still. Step back through it in town to return here. Never used up.',
  picture: model('item_town_portal'),
};
// the way out of a spot you cannot leave (game/roomportal.js); playing together it also takes
// you to a friend, picked from a little menu (game/teleportmenu.js)
export const ROOM_PORTAL_CAST = 3;   // s holding still to read it
export const ROOM_PORTAL = {
  id: 'item_room_portal', name: 'Room Portal Scroll', category: 'tool', stackLimit: 1, bound: true, use: 'roomPortal',
  description: `Takes you back to where you came into this room after ${ROOM_PORTAL_CAST} seconds of holding still, even on a ladder or wedged in somewhere: the way out when you are stuck. One way. Never used up.`,
  picture: model('item_room_portal'),
  together: { name: 'Teleport Scroll',
    description: `Takes you back to where you came into this room, or to a friend, after ${ROOM_PORTAL_CAST} seconds of holding still, even on a ladder or wedged in somewhere. Never used up.` },
};
// every hero carries these (core/progression.js carryTools)
export const TOOLS = [TOWN_PORTAL, ROOM_PORTAL];
// Things a character wears or carries (render/figure.js puts them on): `slot` is where they go,
// one thing per slot (OUTFIT_SLOTS): on the head, or in the right or the left hand. Their models
// say which bone they sit on, how, and how the arm holds them (blender/items.py WEARS).
// `glow`: the colour the gem-like part shines in. No stats or uses yet; for now only the
// villagers wear them (world/town.js VILLAGERS), but they are items like any other.
const wearable = (id, name, slot, description, more = {}) => ({
  id, name, category: slot === 'head' ? 'wearable' : 'held', slot, stackLimit: 1, model: model(id),
  description, ...more });
export const OUTFIT_SLOTS = ['head', 'right', 'left'];
export const WEARABLES = [
  wearable('wear_headscarf', 'Headscarf', 'head', 'A plum kerchief with golden dots, knotted at the nape.'),
  wearable('wear_welding_mask', 'Welding mask', 'head', 'A smith\'s mask with a dark glass window.'),
  wearable('wear_wizard_hat', 'Wizard hat', 'head', 'Tall, pointed and covered in stars.'),
  wearable('held_towel', 'Towel', 'left', 'A striped towel, carried over the forearm.'),
  wearable('held_crystal_ball', 'Crystal ball', 'right', 'It floats over the palm and glows softly.', { glow: '#7fb4ff' }),
  wearable('held_rope', 'Rope', 'right', 'A coil of hemp rope.'),
  wearable('held_hammer', 'Hammer', 'right', 'A smith\'s hammer.'),
  wearable('held_pliers', 'Pliers', 'left', 'A smith\'s pliers, holding a glowing billet.', { glow: '#ff7a2a' }),
  wearable('held_feed_bag', 'Feed bag', 'left', 'Grain for the animals, and a carrot.'),
];
// what a list of worn and held item ids puts in each slot: { head, right, left } (missing: empty)
export function outfitOf(ids) {
  const out = {};
  for (const id of ids) {
    const slot = ITEMS[id]?.slot;
    if (!slot) throw new TypeError(`Not a wearable item: ${id}`);
    if (out[slot]) throw new Error(`Two things for the ${slot} slot: ${out[slot]} and ${id}`);
    out[slot] = id;
  }
  return out;
}
export const ITEMS = Object.fromEntries([...WEAPONS, ...COINS, ...POTIONS, ...stackables, ...TOOLS, ...WEARABLES].map(i => [i.id, i]));
export const OLD_SWORD = WEAPONS[0];
