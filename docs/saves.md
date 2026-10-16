# Saves: heroes and worlds

Status: implemented (`src/core/save.js`, `src/game/save.js`), with the main menu
(`src/game/menu.js`), the living cubes behind it (`src/game/showcase.js`) and the Esc menu
(`src/game/escmenu.js`).

## The menus

- **The main menu** comes first (`state.mode` `'menu'`; the dev tools and `?seed=` skip it,
  `?menu=1` shows it after all). Title: Continue (the hero and world played last), the heroes,
  the controls, the guide. Heroes: three places, a new hero needs only a name; choose one, rename
  it, delete it (the button asks again). Worlds, for the chosen hero: play one (a world the hero
  was never in says so), rename, delete, or make a new one: a name and a seed, both optional (a
  number is the seed itself, any other text is made into one, nothing: a random one; the name is
  made up from the seed). Or join a friend's game with their code. Esc goes back a screen.
- **`?join=CODE`** opens the heroes, with the code: the hero chosen (or made) joins at once.
  A failed join comes back to the worlds and says why.
- **The Esc menu** in a world: "Save and quit to the menu" (with friends in a hosted game it asks
  first: they drop out). A guest's "Leave the game" goes back to the main menu too; when the
  host leaves, the guest plays on in the friend's world, unsaved, until it quits.
- Quitting (`menu.js quitToMenu`): the hero and world are saved a last time and no longer saved
  (`stopSaving`), the game with friends ends, the screen goes dark and the world goes
  (`flow.js endWorld`: the cubes, the enemies, the neighbours, the run). In the menu the frame
  runs the showcase and lets a join go on (`main.js menuFrame`): the hero and its bars are
  hidden, there is no music.
- **Behind the main menu** (`showcase.js`): a random cube of a random world (a new seed each time
  the menu opens), at any depth, every 10 s another, with a fade between. Its enemies and
  villagers go about their business: the hero waits far away, so nothing notices it, and the
  enemies idle and wander about their homes. The camera goes round slowly, the whole cube in
  view (zoom 1: it does not lean towards the parked hero). With no hero there is no hero's light,
  so from depth 5 on a lamp over the middle of the cube lights the caves instead. The next cube is
  made in the world worker while one shows (5 to 40 ms; building it about 2 ms) and the one
  before is dropped, so the menu can stay open for hours. Wide screens have the menu on the left
  and the picture moved right (`camera.setViewOffset`), a phone held upright has it at the bottom
  and the picture moved up. Starting a game or a friend's world coming in takes its place (it is
  the game's own world machinery: `state.cubes`, `state.map`, the enemies).
- N (a new world) is a dev tool now: new worlds come from the menu.

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
- Only what came from the store (`play`, `playAsGuest`) or went into it (`saveAs`) is saved:
  with `?dev=1` or `?seed=` nothing is, until `/save` or `/load` (`docs/console.md`).
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
