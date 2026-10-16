# Saves: heroes and worlds

Status: saving and loading are implemented (`src/core/save.js`, `src/game/save.js`), and can be
used through the developer commands. The Esc menu (`src/game/escmenu.js`) hosts and stops
hosting, joins and leaves. Still to come: the main menu (heroes, worlds, joining), "Save & quit
to the menu" in the Esc menu, and the living cubes behind the main menu.

## Heroes and worlds, apart

- A **hero** (up to 3) is the character: a name, the XP (the level follows from it) and the bag
  with everything in it (`core/inventory.js`: slots, coins, quick bar, the weapon in hand). A
  hero goes into any world, a friend's too, and takes home what it found there.
  `{ v, id, name, created, updated, playTime, xp, inventory }`
- A **world** (up to 8) is a seed and what was done in it: what was defeated, the gates and
  chests opened, the drops that came (`run.dropped`), the loot lying on the floors, the open town
  portal, the open side faces, the discovered cubes, the deepest depth reached, and where each
  hero left it (`spots`: the cube and its entry). The map is never saved: the seed makes the same
  cubes again (`world/`). A world is named after its seed (`worldName`: "Mossy Vale").
  `{ v, id, name, seed, created, updated, deepest, run: { defeated, gates, chests, dropped, loot,
  townPortal }, faces, visited, spots }`
- Coming into a world a hero has its level and bag, full health, no potions at work
  (`heroStats`). It comes in at the entry of the cube it left that world in (or the cube a fall
  started in), else in town. What it defeated there stays defeated: no cube is put back.

## Where they are kept

`localStorage`, as JSON (`KEYS` in `core/save.js`):

| key | what |
|---|---|
| `cube-crawler.heroes` | the heroes, one list |
| `cube-crawler.worlds` | the worlds' index for the menu: id, name, seed, updated, deepest, heroes there |
| `cube-crawler.world.<id>` | one world (they grow: mostly the floor loot) |
| `cube-crawler.last` | the hero and world played last (Continue) |

What is read is checked (`checkHero`, `checkWorld`, `checkInventory`): an item the game no
longer knows leaves the bag, the quick bar and the hand only keep what is still there, damaged
entries are left out. Every entry has a version `v`; `migrate` brings an older one up to this
version. An entry from a newer version is left alone (not read, not overwritten). When the
storage refuses (full, private mode) the game says so once and plays on; in private mode the
saves last as long as the page.

## When it saves (`game/save.js`)

- Once a second it looks whether something changed (XP, the bag, the cube, kills, gates, chests,
  drops, the floor loot, open faces, the town portal, discovered cubes) and then writes the hero
  and the world. Every 30 s anyway (the time played), and when the page is hidden or closed.
- Not while on the way between cubes. Where the hero is, is only taken when it stands in a cube.
- Only what came from the store (`play`) or went into it (`saveAs`) is saved: with `?dev=1` or
  `?seed=` nothing is, until `/save` or `/load` (`docs/console.md`).
- A saved hero keeps its character through a new world (N, `state.keepHero`); that new world is
  not saved (the saved one is no longer played).

## Playing together

- The host's world is saved on the host's machine, with what the guests did in it (their kills,
  chests and drops are in the host's run anyway, `docs/online.md`).
- A guest saves its hero only. Joining takes the guest's world off saving (`detachWorld`, from
  `net/session.js welcomed`): it stays as it was. After the host leaves, the guest plays on in
  the friend's world unsaved.
- What a player puts down from the bag is `b:<player>:<page><n>`: a new page has a new tag, so a
  reload never makes a drop with the id of one lying in a saved world.

## Loading

`newWorld(seed, { keepPlayer, restore })` (`game/flow.js`) starts the saved world: the run, the
open faces and the floor loot come back at once, the hero comes in at its spot (the town, if that
cube does not come: the generator changed), then the discovered cubes are made again in the
background, the nearest first, for the minimap. `knowDepths` tells the chronicle which depths
were reached before.
