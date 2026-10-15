# Loot

Enemies drop coins, now and then a weapon or a potion; guardians always drop weapons and
potions; treasure chests at reward sites hold all three. Weapons are generated: each one is an
instance of a base weapon (a sword, bow, crossbow or staff) with its own rarity, item level,
affixes and name. The generator lives
in `src/core/gear/` and is pure and seeded; the floor, pickup and inventory code in
`src/game/loot.js`, `src/game/lootlabels.js`, `src/game/inventory.js` and `src/render/loot.js`;
chests in `src/core/chests.js` and `src/game/chests.js`. How much of it there is and why:
[balance.md](balance.md).

## Controls

- Weapons are **not** taken by walking over them, by the coin magnet or by **C**.
- **Click** a weapon (or its label) to walk there and pick it up. The enemy under the cursor
  still wins over an item; an item wins over a chest, a chest over the floor. A full bag says so
  and leaves it.
- **Click** a closed treasure chest (or its label, "Treasure chest", coloured by how grand the
  site is) to walk up and open it. X labels chests too.
- Potions are taken by walking over them or with **C**, like coins, and go on the quick
  bar by themselves (one of each family, [potions.md](potions.md)).
- **X** toggles name labels over every item on the floor but coins. Without it only the item
  under the cursor shows its name. Labels are in the rarity's colour and stack instead of
  overlapping; they are clickable.
- **V** opens the inventory (paused, like **I**) with a **Floor** column: every item but coins
  within C's reach (4 cells across, 1.5 up or down), best first, then nearest. Take moves a
  floor item into the bag, Drop puts a bag item down at your feet. Enter (or Space) on the
  selected item, or a double-click, moves it across; arrows move through both columns. V, I or
  Esc closes. Drop also works in the plain I inventory.
- Weapons can go on the quick bar (**1**–**6**, see `docs/progression.md`): using one equips it.
  The Town Portal Scroll is bound and cannot be dropped.
- You may drop every weapon, including the equipped one and the last one. Without a weapon you
  cannot attack ("No weapon equipped") until you pick one up and equip it.
- Items you put down are `kept`: a death leaves them on the floor, while weapons enemies dropped
  during that visit go with the rest of the visit (see `docs/progression.md`).
- Playing together the floor loot and the chests are shared: one copy of every pickup, for
  whoever takes it first; the killer's or opener's game rolls the drop (see `docs/online.md`,
  Rewards).

## Item data

A bag slot or pickup holding a weapon carries its own `gen`:

```js
{ itemId: 'weapon_sword_long', count: 1,
  gen: { v: 1, rarity: 'rare', ilvl: 7, affixes: [{ id: 'swift', tier: 2, value: 8 }, ...], name: 'Duskfang' } }
```

Items keep what they rolled (not a seed), so retuning the tables does not change weapons
already found; `v` is the generator version. `core/gear/stats.js` `itemStats` turns an item
into the stats combat reads; nothing else looks at base weapon stats. A weapon without `gen`
(dev grants, tests) counts as Common. The run starts with one Common **Old Sword**.

## Generation

`rollWeapon(rng, ilvl, opts)` in `core/gear/generate.js`: rarity, then base, then affixes,
then name, each from a table. `opts.favor` (the kind of weapon the player has equipped) makes
the base lean towards that kind.

| Rarity | Weight | Min. item level | Affixes | Base damage | Floor glow |
|---|---:|---:|---:|---:|---|
| Junk | 24 | 1 | 0 | ×0.80 | none |
| Common | 40 | 1 | 0 | ×1.00 | none |
| Uncommon | 22 | 1 | 1 | ×1.05 | ring |
| Rare | 8 | 1 | 2 | ×1.10 | ring, pool of light |
| Epic | 2.5 | 4 | 3 | ×1.16 | + short beam |
| Legendary | 0.5 | 8 | 4 | ×1.24 | + tall beam, sparks |
| Mythic | 0.08 | 13 | 4 (+1 tier) | ×1.32 | + turning runes, a real light |
| Ancient | 0.015 | 17 | 5 (+2 tiers) | ×1.40 | + very tall shimmering beam (guardians only) |

Each rarity's weight is multiplied by `exp((0.025 × (ilvl − 1) + luck) × rank)`, so better
rarities grow more likely with item level, but slowly: at item level 20 about 8% of weapon
drops are Epic, 3% Legendary and under 1% Mythic. A rarity floor (guardians, chests) above what
the item level allows comes down to the best it does allow. `node tools/loot-table.mjs [n]`
prints the odds per level and per guardian (and `n` sample weapons per rarity).

**Bases** (`core/gear/bases.js`): five of each kind, a light one or two from item level 1 and
heavier ones further down (swords: short and medium from 1, long 2, broad 4, greatsword 6;
bows: short and hunting 1, recurve 3, longbow 5, war bow 7; crossbows: hand 1, light 2, heavy
4, repeating 6, arbalest 8; staffs: gnarled 1, oak 2, ember 4, crystal 6, arcane 8). The Old
Sword never drops. Their stats are in [progression.md](progression.md#weapons). A base's damage
grows **5% per item level** (`ILVL_DAMAGE`), so a weapon from ten depths further down hits half
again as hard as the same one from the top.

**Smart loot**: every base weighs the same, except that bases of the kind the player has
equipped when the loot rolls weigh `FAVOR` (3) times as much: once every kind drops, about half
of the weapons are of your kind and the rest spread over the other three. So whatever you fight
with keeps finding upgrades and you still see the others. A sword player arrives at each depth
with about 6% less damage per second than when swords were all there was
(`node tools/balance.mjs`).

**Affixes** (`core/gear/affixes.js`), each at most once per item, at most three prefixes and
three suffixes. Sweeping and of Reach roll only on swords (`melee`), of Distance only on bows,
crossbows and staffs (`ranged`), the rest on all. The item level picks the tier (1: 1–3, 2: 4–7, 3: 8–12, 4: 13–18, 5: 19+);
Mythic and Ancient reach one or two tiers above (up to 7).

| Affix | Kind | Stat | Tier 1 | Tier 7 |
|---|---|---|---|---|
| Sharp | prefix | + damage | 2–4 | 29–38 |
| Brutal | prefix | + % damage | 4–8 | 37–45 |
| Swift | prefix | % faster attacks (all swing times) | 3–6 | 21–25 |
| Sweeping | prefix | + % swing arc | 8–15 | 55–65 |
| Vicious | prefix | + % critical chance | 3–5 | 18–22 |
| of Reach | suffix | + reach (cells) | 0.05–0.08 | 0.30–0.36 |
| of Distance | suffix | + % range (shots) | 5–9 | 38–46 |
| of the Leech | suffix | + life on hit | 1–2 | 13–17 |
| of Force | suffix | + % knockback | 15–30 | 125–150 |
| of Precision | suffix | + % critical damage (base ×1.5) | 10–20 | 85–100 |

Damage is `(base × item level growth × rarity + flat) × (1 + percent)`, rounded, then × the
player's level bonus (+2% a level). Every weapon crits 5% of the time for ×1.5 before affixes; a
critical hit shows a bigger golden number. Life on hit never heals past the maximum. Stats are
computed when read, so retuning bases, rarities or item-level growth changes weapons already
found.

**Names** (`core/gear/names.js`) are generated for every rarity: Junk and Common get a word
and the base ("Rusty Long Sword"), Uncommon two words ("Bright Fang"), Rare and Epic a
compound ("Grimfang"), Legendary and Mythic a compound and an epithet, Ancient an old root,
a compound and an epithet. The base type shows under the name where the name does not say it.

## Drops

`enemyDrops(enemy, worldSeed, favor)` in `core/gear/drops.js` (`weaponDrops` and `potionDrops`),
seeded by the world seed and the enemy id: the same enemy always drops the same thing (also
after a death brings it back, like its coins) as long as you fight with the same kind of weapon
(`favor`, see smart loot). The item level is the enemy's level.

- Which potion is drawn by the item level from those that drop there, weighted, health
  potions the likeliest (`potionTable`, [potions.md](potions.md)); chests likewise.
- Ordinary enemies: a weapon 5% and a potion 3% of the time, both × √(the kind's
  level-1 XP / 30): a spider 4% / 2.5%, a Stunder 8% / 5%, a Triangle 10% / 6%.
- Side guardians: one weapon, at least Uncommon (Rare from level 10), luck 0.1; one potion.
- Descent guardians: two weapons, at least Uncommon (Rare from level 5, Epic from 14), luck
  0.2; two potions.
- Ancient drops only from guardians.

## Chests

Every stratum budgets four reward sites, each with a treasure chest ([world.md](world.md)):
two basic, one uncommon and one rare (now and then exceptional). `chestLoot(site, depth, seed)`
in `core/chests.js` decides what one holds, seeded by the site (its weapons lean towards your
kind like drops do); `CHESTS` is the table:

| Site | Item level | Copper at level 1 | Potions | Weapons |
|---|---|---|---|---|
| Basic | depth | 25–45 | 0–1 | one, at least Common |
| Uncommon | depth + 1 | 50–90 | 1 | one, at least Uncommon |
| Rare | depth + 1 | 100–160 | 1–2 | at least Rare and at least Uncommon |
| Exceptional | depth + 2 | 180–280 | 2 | at least Epic and at least Rare |

Copper grows like enemy coins. Weapons roll with luck (0.1 to 0.45 by prestige). Opening a chest
(`game/chests.js`) adds its site to `run.chests`, opens the model and, once the lid's `Open` clip has
played out, spills the loot in front of it (pickups wait hidden until then). The chest stays open for the run and what it spilled is `kept`: a death takes neither
back.

## Extending

- A new rarity: a row in `RARITIES` (weight, gate, affix count, tier bonus, damage factor,
  colour, glow). The tests check the ordering.
- A new affix: an entry in `AFFIXES` whose `stat` `itemStats` applies (add the stat there and
  in combat if it is new). Every tier is validated by `tests/gear.test.js`.
- A new dropping weapon: the item in `core/items.js` (model, icon, kind, base stats), then a
  row in `BASES` with its item level; its tags (its kind, melee or ranged) come from its kind.
  Affixes roll on bases whose tags they list. A new kind also needs its timing and clip
  (`KINDS` in `core/combat.js`), a hold pose and mount (`blender/character.py`,
  `blender/items.py`) and, if it shoots, a shot (`core/shots.js`).
- Uniques or other item kinds can come in as further `rollWeapon` options or another
  generator writing the same `{ itemId, count, gen }` shape.

## Dev tools

With `?dev=1` the console (`` ` ``, `docs/console.md`) rolls a weapon of any base, rarity and item
level: `/weapon <weapon> [rarity] [level] [drop]` puts it in the bag and equips it, or with `drop`
lays it on the floor (`/weapon grsw mythic 20 drop`). `__game.devDropWeapon(itemId, rarity, ilvl)`
does the same from the browser's devtools.

## Tests

`tests/gear.test.js` covers rarity odds and gates, deterministic JSON items, affix validity
and tiers, names, stats, item-level growth, drop and potion rates and guardian floors, item
instances in the bag, crits and life on hit; `tests/chests.test.js` the chest table. In the
browser console:

```js
const checks = await import('./tests/browser/inventory.js');
await checks.runWeaponLootChecks();   // guardian drops, walk-over / C, labels, click pickup, V, drops, deaths
await (await import('./tests/browser/chests.js')).runChestChecks();   // hover, click, open, spill, deaths, potions
```
