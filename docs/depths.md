# Depths

Quick reference for every depth (`Y = 0` to `Y = -20`, `depth = -Y`). Themes come from
`src/themes/index.js` and `src/themes/caves.js`. A theme starts at its depth and lasts until
the next one. The layout comes from `src/world/layout.js`, the enemy roster per depth from
`DEPTH_SPAWNS` in `src/core/spawns.js`, and enemy levels from `enemyRoll` in
`src/core/enemies.js`. Enemy kinds (recoloured, stronger versions of a species) are described
in `docs/enemy-kinds.md`.

## Overview

| Depth | Theme | Kind | Layout (ring radius) | Fluids / river | Enemy level (base, range) |
|---:|---|---|---|---|---|
| 0 | Meadow islands | surface | town + road to the first well | water | 1 (always 1) |
| 1 | Meadow islands | surface, sky islands | arc, r=3 | water | 1 (always 1) |
| 2 | Meadow islands | surface, sky islands | arc, r=3 | water | 2 (1–3) |
| 3 | Snowy peaks | surface, sky islands | arc, r=3 | water | 3 (2–4) |
| 4 | Badlands | surface | arc, r=3 | water (some lava / acid) | 4 (3–5) |
| 5 | Root caves | cave | arc, r=3 | water | 5 (4–6) |
| 6 | Root caves | cave | arc, r=2 | water | 6 (5–7) |
| 7 | Frozen caves | cave | arc, r=2 | water | 7 (6–8) |
| 8 | Frozen caves | cave | arc, r=2 | water | 8 (7–9) |
| 9 | Fungal swamp | cave | arc, r=2 | acid river | 9 (8–10) |
| 10 | Fungal swamp | cave | arc, r=2 | acid river | 10 (9–11) |
| 11 | Spider nests | cave | arc, r=2 | acid river | 11 (10–12) |
| 12 | Spider nests | cave | arc, r=2 | acid river | 12 (11–13) |
| 13 | Crystal mines | cave | arc, r=1 | water (some lava) | 13 (12–14) |
| 14 | Crystal mines | cave | arc, r=1 | water (some lava) | 14 (13–15) |
| 15 | Buried ruins | cave | arc, r=1 | acid river, lava | 15 (14–16) |
| 16 | Buried ruins | cave | arc, r=1 | acid river, lava | 16 (15–17) |
| 17 | Volcanic depths | cave | arc, r=1 | lava river | 17 (16–18) |
| 18 | Volcanic depths | cave | arc, r=1 | lava river | 18 (17–19) |
| 19 | Obsidian abyss | cave, large voids | arc, r=1 | lava only | 19 (18–20) |
| 20 | Obsidian abyss | cave, the core | 3×3 core around the axis | lava only | 20 (19–21) |

## Enemies per depth

Every layer also has one coordinated [wild horde pack](hordes.md), replacing that cube's
ordinary roster with 6–24 light enemies. The table below is for ordinary rooms; a quieter
approach room may halve its counts. Guardian arenas still use their doubled roster.

Each depth has its own roster (`DEPTH_SPAWNS` in `src/core/spawns.js`). The town and the
merchant camp have no enemies (`enemyFreeAt` in `src/world/town.js`: `Y = 0` and
`max(|X|, |Z|) ≤ 1`). The rest of the depth-0 road uses the row for depth 0.

A roster entry is `species chance count (packs) [kinds]`:

- **chance**: how likely a cube is to have the species at all. No percentage means always.
- **count**: how many spawn when it is there.
- **packs**: the biggest group it spawns in. No value means each one spawns on its own.
- **kinds**: which kinds of the species spawn, and how often. Each pack draws one kind, so a
  pack is all Redbacks or all plain spiders. No value means the species' base kind.

`mix` is the most species a single cube can hold.

| Depth | mix | Roster |
|---:|---:|---|
| 0 | 1 | snakes 1–2 |
| 1 | 2 | snakes 2–4, Stunders 20% 1 |
| 2 | 3 | snakes 2–5 [80% Grass snake, 20% Sand viper], spiders 60% 2–4 (packs ≤2), Stunders 25% 1 |
| 3 | 3 | spiders 8–14 (packs ≤3) [75% Frost spider, 25% Spider], Stunders 50% 1–2 [Frost stunder], Shraps 20% 1, Triangles 12% 1 |
| 4 | 3 | snakes 3–6 (packs ≤2) [67% Sand viper, 22% Grass snake, 11% Blood viper], spiders 80% 4–8 (packs ≤3) [80% Spider, 20% Redback], Stunders 60% 1–2 [50% Stone stunder, 50% Stunder] |
| 5 | 3 | spiders 6–10 (packs ≤3) [75% Spider, 25% Bog spider], snakes 80% 3–6 (packs ≤2) [67% Grass snake, 33% Sand viper], Stunders 60% 1–2 [67% Stunder, 33% Stone stunder], Wollas 30% 1–2 |
| 6 | 3 | spiders 7–12 (packs ≤3) [67% Spider, 22% Bog spider, 11% Redback], snakes 80% 4–7 (packs ≤2) [29% Grass snake, 57% Sand viper, 14% Blood viper], Stunders 60% 1–3 [67% Stunder, 33% Stone stunder], Wollas 40% 1–2, Octonauts 20% 1 |
| 7 | 3 | Octonauts 2–4, Shraps 80% 1–3, spiders 80% 6–10 (packs ≤3) [75% Frost spider, 25% Spider], Stunders 50% 1–2 [Frost stunder], snakes 30% 3–5 (packs ≤2) [75% Frost adder, 25% Grass snake] |
| 8 | 3 | Octonauts 3–5 (packs ≤2), Shraps 90% 2–3, spiders 80% 7–12 (packs ≤4) [75% Frost spider, 25% Spider], Stunders 60% 1–2 [67% Frost stunder, 33% Stone stunder], Triangles 15% 1 |
| 9 | 3 | snakes 6–10 (packs ≤3) [40% Venom adder, 40% Grass snake, 20% Blood viper], Octonauts 80% 2–4 (packs ≤2) [75% Bog octonaut, 25% Octonaut], Spicies 60% 1–2, Wollas 35% 1–2 [75% Bog wolla, 25% Wolla], spiders 60% 6–10 (packs ≤4) [75% Bog spider, 25% Spider], Stunders 25% 1–2 |
| 10 | 3 | snakes 7–12 (packs ≤3) [50% Venom adder, 25% Grass snake, 25% Blood viper], Octonauts 80% 3–5 (packs ≤2) [75% Bog octonaut, 25% Octonaut], Spicies 80% 1–3, Wollas 50% 1–2 [75% Bog wolla, 25% Wolla], spiders 60% 8–12 (packs ≤4) [75% Bog spider, 25% Spider], Fire-faces 10% 1 |
| 11 | 3 | spiders 16–24 (packs ≤6) [60% Spider, 20% Bog spider, 20% Redback], Stunders 50% 1–2 [50% Stunder, 50% Stone stunder], Octonauts 30% 1–2 [50% Octonaut, 50% Bog octonaut], snakes 30% 4–6 (packs ≤3) [50% Venom adder, 50% Blood viper], Spicies 25% 1–2 |
| 12 | 3 | spiders 20–28 (packs ≤7) [44% Spider, 22% Bog spider, 33% Redback], Stunders 60% 1–3 [50% Stunder, 50% Stone stunder], Octonauts 40% 1–2 [40% Octonaut, 40% Bog octonaut, 20% Coral octonaut], Triangles 15% 1 |
| 13 | 3 | Triangles 1–2 [67% Emerald triangle, 33% Triangle], Stunders 60% 1–2 [Stone stunder], Octonauts 70% 2–4 (packs ≤2) [50% Octonaut, 50% Coral octonaut], Wollas 40% 1–2 [67% Storm wolla, 33% Wolla], spiders 60% 10–14 (packs ≤4) [50% Spider, 25% Frost spider, 25% Redback] |
| 14 | 3 | Triangles 2–3 [67% Emerald triangle, 33% Triangle], Stunders 70% 1–3 [Stone stunder], Octonauts 70% 2–5 (packs ≤2) [50% Octonaut, 50% Coral octonaut], Wollas 50% 1–3 [67% Storm wolla, 33% Bog wolla], spiders 50% 10–14 (packs ≤4) [50% Spider, 25% Frost spider, 25% Redback] |
| 15 | 3 | Triangles 80% 1–2 [33% Triangle, 33% Emerald triangle, 33% Crimson triangle], Octonauts 80% 3–5 (packs ≤2) [67% Coral octonaut, 33% Bog octonaut], snakes 80% 8–12 (packs ≤4) [25% Sand viper, 50% Blood viper, 25% Shadow mamba], Wollas 30% 1–2 [Storm wolla], Fire-cats 30% 1–2 |
| 16 | 4 | Triangles 80% 1–3 [33% Triangle, 33% Emerald triangle, 33% Crimson triangle], Octonauts 80% 3–6 (packs ≤2) [67% Coral octonaut, 33% Bog octonaut], snakes 60% 10–14 (packs ≤4) [57% Blood viper, 43% Shadow mamba], Fire-cats 50% 2–3 (packs ≤2), spiders 40% 10–16 (packs ≤5) [50% Redback, 50% Spider] |
| 17 | 4 | Fire-faces 1–2, Fire-cats 2–4 (packs ≤2), Shraps 60% 1–2 [Fire shraps], Stunders 60% 1–2 [Magma stunder], snakes 50% 10–14 (packs ≤4) [67% Shadow mamba, 33% Blood viper] |
| 18 | 3 | Fire-faces 2–3, Fire-cats 3–6 (packs ≤3), Shraps 70% 1–3 [Fire shraps], Stunders 60% 2–3 [Magma stunder], Wollas 50% 1–2 [Ember wolla], spiders 30% 14–20 (packs ≤6) [Redback] |
| 19 | 3 | Fire-faces 2–3, Fire-cats 4–7 (packs ≤3), Shraps 40% 1–2 [Fire shraps], Triangles 60% 1–2 [67% Crimson triangle, 33% Triangle], Wollas 40% 1–2 [67% Ember wolla, 33% Storm wolla], Stunders 40% 1–2 [67% Magma stunder, 33% Stone stunder] |
| 20 | 4 | Fire-cats 5–9 (packs ≤3), Fire-faces 2–4, Triangles 80% 2–3 [67% Crimson triangle, 33% Triangle], Stunders 50% 2–3 [67% Magma stunder, 33% Stone stunder], spiders 30% 18–26 (packs ≤8) [67% Redback, 33% Spider] |

The design rules behind the table:

- **The surface ramps up slowly.** Depth 1 has only snakes and a rare Stunder. Depth 2 adds
  a few spiders. Depth 3 is the first spider-heavy depth, with more Stunders and a rare
  Triangle as a mini-boss. Depth 4 mixes snakes, spiders and Stunders.
- **Each theme has one or two signature species:** Octonauts and Shraps in the frozen caves,
  snakes and Spicies in the swamp, Wollas (by kind) from the root caves down, spiders in the nests, Triangles in the mines and ruins, Fire-faces,
  Fire-cats and Fire shraps in the volcanic depths and the abyss.
- **Kinds follow the theme and get stronger with depth.** Frost spiders and Frost stunders
  live in the snow and ice, as do Frost adders. Bog spiders, Bog octonauts and Venom adders
  live in the swamp. Stone stunders live in the badlands, mines and ruins, and Magma
  stunders in the volcanic depths. Within a species the stronger kinds take over deeper
  down. The snakes go from Grass snakes to Sand vipers (badlands), then Blood vipers, then
  Shadow mambas (ruins and volcanic depths). Spiders go from plain spiders to Redbacks.
- **Rare guests preview the next theme.** A 10–20% roll lets a species show up a theme
  early: an Octonaut at 6, a Shraps at 3, a Triangle at 8 and 12, a Fire-face at 10, Fire-cats at 15.
- **Ranged species stay few.** Fire-faces, Triangles, Shraps, Spicies and Wollas never go above 4 per
  cube, because several shooters at once are hard to read and to dodge. The Shraps throws and
  pinches, so it stays at 1–3; so does the Spicy, whose lasers are easy to dodge one at a time
  but not from three sides.
- **Melee species get more numerous.** Spiders go from 2–4 at depth 2 to 8–14 at 3, 20–28 in
  the nests, and up to 26 in the core. They spawn in packs, and the packs get bigger the
  deeper you go. Snakes grow the same way, but more slowly.

### Variety within a depth

Every cube rolls its own population with its own seeded stream (`population(map)`), so two
cubes at the same depth can feel quite different. Three controls decide how different:

1. **Chance**: each species rolls whether it is in the cube at all.
2. **Mix**: if more species roll present than `mix` allows, the extra ones are dropped.
   Always-present species are kept first. The rest are kept in a random order weighted by
   chance. A low mix means focused cubes (only spiders and a Stunder, say), and a high mix
   means mixed ones. Because of this cut, a rare species' real share can be lower than its
   chance. At depth 8, for example, the Triangle's 15% ends up at about 3%.
3. **Lead**: one present species (picked by chance) dominates the cube. It takes its count
   from the top half of its range, and every other species from the bottom half. This gives
   cubes like a spider den with a lone snake, or a snake pit with a few spiders, at the same
   depth.

Placement (`enemySpots` in `src/game/enemyspawn.js`) uses one seeded stream per species. The
first member of a pack keeps `profile.spacing` from every other enemy of its species. The
rest of the pack gathers within `1.5 + √size` cells of it, on the same level, at least 1.2
cells apart. Floors must have room for the biggest kind the entry can draw. If there is not
enough safe floor, fewer enemies spawn. In practice the target count is almost always met.
Each pack then draws its kind on a separate seeded stream, so kinds never move a spot.

With `?dev=1`, the depth line in the dev panel shows the cube's population. The lead species
is marked with `*`.

The console (`` ` ``, `docs/console.md`) can also spawn any enemy kind (`game/devspawn.js`):
`/spawn <enemy> [level] [count] [front|cursor]` (no level: the level this depth rolls for it;
the kind completes from its name, `/spawn red 5 3`). Spawns take the nearest floors that fit
their body, spread a little apart. `/kill` kills every enemy with XP and loot, `/remove`
removes them without, `/passive` makes enemies stand still and never attack. Spawns get ids of their own,
so they never count as the cube's defeated enemies, and vanish when the cube resets. Guardian
kinds keep their bars and drops but guard no gate. From the console:
`__game.spawnEnemy('redback', { level: 5, n: 3 })`, `__game.killEnemies()`,
`__game.clearEnemies()`. Checks: `await (await import('/tests/browser/dev.js')).runDevSpawnChecks()`.

### Measured population

These numbers come from 4 seeds and 32 cubes per depth on real generated cubes, guardian arenas
(with their doubled defenders and the guardian), wild packs in ordinary terrain and quieter approaches included (`node tools/depth-population.mjs`).
They are averages per cube, and "max" is the most enemies in any one cube. XP is at the
enemies' own levels, before the player's level scales it.

| Depth | Enemies | Max | XP | Depth | Enemies | Max | XP |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 2.8 | 7 | 163 | 11 | 26.9 | 56 | 2746 |
| 1 | 4.7 | 12 | 233 | 12 | 27.6 | 54 | 3187 |
| 2 | 7.2 | 14 | 380 | 13 | 14.1 | 34 | 2772 |
| 3 | 15.0 | 32 | 766 | 14 | 12.8 | 32 | 3760 |
| 4 | 12.4 | 26 | 880 | 15 | 15.1 | 32 | 4033 |
| 5 | 15.0 | 28 | 1036 | 16 | 21.0 | 62 | 5559 |
| 6 | 17.7 | 36 | 1435 | 17 | 14.3 | 36 | 5134 |
| 7 | 12.9 | 26 | 1499 | 18 | 12.4 | 40 | 5386 |
| 8 | 14.9 | 32 | 1917 | 19 | 11.5 | 24 | 5981 |
| 9 | 17.3 | 40 | 2141 | 20 | 16.8 | 33 | 7302 |
| 10 | 20.0 | 48 | 2932 |  |  |  |  |

The enemy count drops at a theme change that brings in stronger species (13, 17, 19). The
XP per cube keeps rising.

## Enemy levels

- Base level: the depth (`depthLevel`), 1 on the surface, 20 at the core.
- Depths 0 and 1: always level 1.
- From depth 2: a seeded −1 / 0 / +1 roll, weighted 25% / 50% / 25%, clamped to at least 1.
  The roll is per cube, species and spawn floor, so it is stable when you come back.
- Guardians: a level above the depth (side), two above (descent), from depth 1 on.
- Levels never follow the player's level. Only HP, damage, XP and coins scale. Size, speed,
  timing and knockback stay the same. Kinds change those (`docs/enemy-kinds.md`).
- Every species grows at the same rate per level (`GROWTH`): HP +17%, damage +10%, XP and
  coins +25% of its level-1 values. Why these: [balance.md](balance.md).

## Species stats

At level 1; at level `L` multiply HP by `1 + 0.17 (L − 1)`, damage by `1 + 0.1 (L − 1)`, XP
and coins by `1 + 0.25 (L − 1)`, and round.

| Species | Tier | HP | Damage | XP | Coins (copper) | Poise |
|---|---|---:|---:|---:|---|---:|
| Spider | weak, swarms | 32 | 15 | 20 | 4–8 | – |
| Snake | weak | 48 | 16 | 30 | 6–12 | – |
| Octonaut | medium | 90 | 20 (spin 28) | 55 | 12–22 | 0.8 s |
| Shraps | medium, throws | 110 | 22 (ice ball 20, chills) | 70 | 16–28 | 0.8 s |
| Spicy | medium, laser | 100 | 26 (laser burst) | 72 | 16–30 | 0.6 s |
| Wolla | medium, storm | 95 | 22 (storm, pushes back) | 64 | 14–26 | 0.6 s |
| Stunder | heavy | 140 | 30 | 80 | 20–35 | 1.5 s |
| Fire-face | strong, ranged | 120 | 22 (+6 burn) | 90 | 24–40 | 0.8 s |
| Fire-cat | strong | 130 | 26 | 95 | 22–38 | 0.4 s |
| Triangle | strong, ranged | 170 | 28 | 110 | 28–46 | 1.2 s |

These are the base kinds. The other kinds multiply them (`docs/enemy-kinds.md`). For example, a
level 5 Blood viper has `round(67 × 1.68)` = 113 HP. Poise: for how long after a stagger lighter
hits do not stagger it again ([combat.md](combat.md)).

For example, at depth 20 (level 20): spider 135 HP / 44 damage, Stunder 592 HP / 87 damage,
Triangle 719 HP / 81 damage, a Magma stunder 799 HP / 122 damage. The player arrives there at
about level 22 with 310 HP and a weapon dealing about 190 a hit.
