# Quests

Status: a first slice is built (below, "What is built"): the six villagers give quests about
things the world has anyway, with the shared quest log, the Quests tab and **U**. The rest of this
is the design: what the quest system should do, what it has to respect in the rest of the game,
the kinds of quests we want, and what is still open. Complements [world.md](world.md),
[villagers.md](villagers.md), [saves.md](saves.md), [hordes.md](hordes.md),
[guardians.md](guardians.md) and [online.md](online.md).

## What is built

The first step of "Order of work" below, but for the quest plan ("The numbers"):

- **The rules** (`core/quests.js`, pure, `tests/quests.test.js`): the quest log, the kinds, making
  offers, what players do with a quest, events, checks for saves and the network.
- **Four kinds**, all about what the world has anyway, so nothing new in the world:
  - `reach`: get down to a depth nobody has been to (one or two below the deepest);
  - `landmark`: stand beside the landmark of a depth (its grand reward site; within
    `LANDMARK_REACH` cells of its chest);
  - `guardian`: beat a side or descent guardian (done once its gate is open);
  - `horde`: break a depth's horde (every member defeated).

  All are paid back at the giver (`return`); the engine knows `spot` too.
- **Givers:** the six villagers (`GIVERS`), each leaning to some kinds. Each has one offer at a
  time (`MAX_OFFERS`), made when it has none: the `n`-th from `hash(seed, giver, n)`, about a
  depth from one above the deepest anyone got to two below it, never about something another
  quest is about or already done. An offer whose goal got done meanwhile goes. When nothing is
  left to ask, a giver offers nothing. There is no plan of about 100 yet.
- **Difficulty** by how far below the deepest the quest is (a descent guardian one harder);
  **rewards** made with the offer and shown in it (`questRewards`, "Rewards" below).
- **Progress:** goals are checked against the world (the deepest depth, the open gates, the
  hordes broken: `goalDone`) every half second, and events come from the game: a cube visited
  (`game/flow.js`), a horde broken (`game/enemies.js`, also found broken on coming in),
  standing at a landmark (`game/quests.js`). An archived quest counts nothing; unarchived, what
  is true in the world by then counts (a guardian beaten meanwhile stays beaten), standing at a
  landmark does not.
- **A death** that puts the cube back takes back the quest progress made since coming in
  (`progressOf` / `restoreProgress`): a horde broken comes back.
- **Talking** (`game/inventory.js talkTo`): a click on a villager, or the action key beside one.
  The panel opens on the Quests tab with what that villager has on top: offers to accept, quests
  to hand in. The alchemist opens on her wares unless she has news (a quest to hand in, an offer
  not seen yet). Labels over villagers show `!` (an offer) and `?` (one to hand in), always.
- **The Quests tab** (`game/questpanel.js`): Going on / Done / Archived, the selected quest's
  giver, depth, difficulty, story, goals, reward, and Accept, Hand in (only at its giver),
  Archive / Unarchive, Restart (a failed quest; none of the four kinds can fail yet). **U**
  (`quests` in `core/keybinds.js`) opens it, again closes it; **I** goes over to the bag.
- **Shared:** the log is the world's (`run.quests`, saved with the world, `core/save.js`); the
  host decides and tells the guests ([online.md](online.md#quests)); a quest handed in pays
  everyone in the game. The chronicle notes quests taken, done, complete and failed.
- **Not yet:** the quest plan, NPCs out in the world and their spots, the other kinds,
  failing, repeats, tracking a quest in the HUD, dev commands.

## What we want

- Quests are **generated**: from a set of templates, of different kinds, not written one by one.
  A world has about **100 quests** over its 21 depths (see "The numbers" below).
- Quests are given by **NPCs**. Most start in town with the villagers, but there are NPCs out in
  the world too: some give quests of their own, some only exist to help a quest someone else
  started (the next step of a chain, the one a parcel goes to, the one who pays you at the end).
- **Several quests at once.** The bag gets a second tab: **Bag | Quests**. A new action
  `quests`, bound to **U** on the desktop, opens the panel on the Quests tab.
- **Archive** a quest: it disappears from the list by default and can be brought back (a filter
  shows archived quests). Archiving is a soft abandon: an archived quest is paused, it counts no
  progress until it is unarchived.
- **Shared.** Everyone in a world plays the same quests: they belong to the world, not to a hero.
  A reward goes to everyone who is in the game when the quest is done.
- **Quests can fail** (a defense lost). A failed quest stays in the list, and
  the quest menu has a **Restart** button for it.

## The rules it has to keep

1. **The world never depends on quests.** Maps are made again from the seed and never saved
   ([saves.md](saves.md)). Everything that shapes the ground (where an NPC stands, where a camp
   is, an outpost, an annex room) is planned from the seed alone, like reward sites, guardians and
   hordes, whether a quest ever uses it or not. What a quest adds while it runs is an overlay on
   top: a figure standing on a planned spot, a thing lying on the floor (like `run.loot`), enemies
   of its own (like dev spawns, with ids of their own).
2. **Only where you have been** ([world.md](world.md#only-where-you-have-been)). A quest never
   shows a cube nobody has visited: no marker, no minimap pin. It tells you in words (the depth, a
   clue about the place); a marker shows once you are in the cube.
3. **Never ask for what cannot happen.** Every target is checked against the world as it is:
   species from the depth's roster (`DEPTH_SPAWNS`), places from the layout (sites, landmarks, set
   pieces, large areas, guardians, hordes, branches), and what was done already (`run.defeated`,
   `run.chests`, `deepest`). A guardian already defeated is no quest target.
4. **Enemies do not come back.** A defeated enemy stays defeated for the world (`run.defeated`),
   so a depth can run out of snakes. A quest that needs enemies brings its own (quest spawns, see
   below), never counts on the room's own.
5. **Deterministic.** The world's quest plan (which quest, of which kind, from whom, at which
   depth, see "The numbers") comes from the seed alone, and each quest is filled in from
   `hash(seed, quest slot)`: friends in the same world see the same offers, and a tool can list
   them. The save keeps the whole generated quest, not just its seed, so a changed generator
   does not change quests already taken.

## A quest

```
{ id, template, giver, helpers: [npc], depth, level, difficulty,
  title, text, stages: [{ goal, need, have, npc?, spot?, clue? }], stage,
  payout: 'return' | 'spot' | 'self', rewards: { xp, copper, items: [] },
  items: [],                      // quest items it carries (below)
  state: 'offered' | 'active' | 'ready' | 'done' | 'failed', archived, created, finished }
```

- **Stages** run one after another; a chain is just more stages. Each stage has one goal.
- **Goals** are a few verbs, each fed by something the game does anyway:

  | Goal | Done when |
  |---|---|
  | `talk` | someone talks to that NPC (the action key) |
  | `find` | someone picks up the quest item or comes to the person on that spot |
  | `kill` | the quest's own enemies are defeated (a bounty, a pack) |
  | `defend` | the waves are beaten and the thing defended still stands |
  | `deliver` | the quest's item is brought to that NPC |
  | `give` | that NPC is given N of an ordinary item (potions, crystals) |
  | `reach` | someone gets to a depth, a landmark, a set piece, a cube |
  | `collect` | N quest drops picked up |

- **Payout:** how a quest ends.
  - `return`: back to the giver, who pays.
  - `spot`: it ends where the last goal is done, paid by someone there: the person found, the NPC
    the parcel was for, the one who asked for help on the spot.
  - `self`: the quest is its own payout, e.g. a treasure map whose chest is the reward.
- **Rewards** go to everyone in the game when the quest is done: XP (a share of a level at the
  quest's depth), coins (grown like enemy coins, `GROWTH.coins`), and items rolled like chest loot
  (`rollWeapon`, `rollPotions`) at the quest's level. They are tuned against the balance curve
  ([balance.md](balance.md)) and `tools/balance.mjs` should include them.
- **Quest items** (a lost locket, a parcel, a map scrap) are carried by the quest, not by one
  player's bag, since the quest is shared: they show in the quest's details and nobody can drop or
  lose them by leaving the game. Every quest item gets a real model and icon
  (`blender/items.py`, `assets/items/`), like every other item: no placeholders.

## The engine

- `core/quests.js`: pure, no DOM, tested in node. The quest records, `advance(quests, event)`,
  archiving, payout.
- `core/quests/templates.js` and a generator: picks a template for an NPC, binds its slots
  (where, what, who, how many) under the rules above, writes the text, sets the rewards.
- `game/quests.js`: the glue. The game raises events where things happen anyway (an enemy
  defeated, an item picked up, a cube visited, a villager talked to, a chest opened) as
  `{ kind, species, enemyKind, depth, key, id, npc, item }`; active quests that are not archived
  take them.
- Playing together the host's world holds the quests; events from guests come in like their kills
  do now ([online.md](online.md)) and count the same.

## NPCs and spots

### Spots, planned from the seed

The world plans **spots** per depth, next to the reward sites (`world/sites.js planSites`), from
the seed alone: places kept free where somebody or something may stand later. Kinds:

- a **seat**: one NPC sitting or standing about somewhere, a rock, a ledge, a bridge's end;
- a **camp**: a small footprint with a fire and a bedroll, room for two or three people;
- a **hiding place**: somewhere a thing or a person can be found (below, Find);
- an **outpost**: a room built to be defended (below, Defense).

Cubegen keeps a spot clear (no clutter, slabs or structures on it, reachable on foot, checked
like the villagers' places in `tests/town.test.js`). What stands on it is decided by the game from
the quests: an NPC (its figure from `render/figure.js`, its collider added then), a quest item, a
thing to defend, or nothing. An unused spot is just open ground.

### Who they are

An NPC out in the world has a seeded identity: a role (hermit, explorer, miner, pilgrim, a lost
child, a worried father ...), a name, a clay tint and an outfit (wearables, `core/items.js`;
new ones get models in `blender/items.py`). Some are always there (they sit somewhere, maybe at a
camp, and give quests of their own: the deeper quests start out there). Others only appear while a
quest needs them. Enemies ignore NPCs and cannot hurt them.

### Where people go when they are found

A rescued person moves to a **lasting place**: not necessarily the town, it can be where the
quest giver stood. A father looking for his daughter in a cave waits at the start of the cave;
once she is found, both of them wait there. So a camp or a seat has room for the people who end up
there, and the world save remembers who lives where. Someone who moved may give quests of their
own later.

## Kinds of quests

### Find (an item or a person)

Something is hidden somewhere; how far you have to go depends on the quest's difficulty. Two
things make it hard:

- **How deep:** against how far the party got (`deepest`): easy is a depth already behind you,
  medium is where you are, hard is one or two depths further down.
- **How hidden**, from the layout, easier to harder:
  1. a room on the route;
  2. a branch room;
  3. a discovery site;
  4. a hard place: the top of a pinnacle, the lone peak, the islet in the great lake, the summit
     of a spiral or a hairpin, the island at the far end of a span;
  5. past the depth's horde, or behind a guardian.

The generator scores the hiding places of the depths in range and takes one that fits.

**Finding it:** the giver says the depth and gives a **clue made from the place's real
features**: the cube's spec knows its falls, spouts, spans, tunnels, lakes, set pieces and
archetype ("where the water falls from the sky", "on the needle of rock", "past the long bridge").
In the right cube you hear it or see it glint, or the person calls out; then it gets a marker.

**When it is found:**
- an item is taken back to the giver (`return`);
- a person thanks you and pays (`spot`), then goes to their lasting place;
- a person sends you on (a next stage: "my brother went further down");
- a treasure map's chest is the reward itself (`self`).

### Defense

An NPC's something (a camp, a cart, a dig site, a shrine, a farm) is attacked: beat every enemy
that comes, and keep the thing standing. Where:

- **Outposts (B)**: rooms planned from the seed every few depths and built to be defended, like
  hordes and set pieces: open ground, a fence or a wall, the thing in the middle, ground for the
  enemies to come in over. A farm on the surface, a dig site in the mines, a shrine in the ossuary.
  Without a quest it is a calm place with its NPC; with one, it is attacked.
- **Annex rooms (C, on the grid)**: a room of its own for one quest, but not outside the world
  like the house interiors: a cube on the grid where there is otherwise none, with a portal towards
  it from a room beside it. It is planned from the seed like a one-room branch (`world/layout.js`)
  and its face carries a portal like any other. Before a quest opens it, the portal is there to
  see but greyed out and cannot be passed (like a guardian's gate before the guardian falls);
  once opened it stays open. So the world stays the same whatever the quests, the annex is
  discovered like every other cube (through its portal), and it can be shaped for the fight. It
  is one of the depth's branches: it comes out of the branch budget (`min(4, most − route)`), so
  a depth never has more rooms than its band allows (`ROUTE_ROOMS`).

Not wanted: taking over an ordinary room while the quest runs (its shape is random: a ledge, a
shore, a tunnel), and rooms outside the grid.

**The fight:** enemies come in waves, through the room's portals, from the depth's roster at the
quest's level. They go for the thing, not only for the players: that is new AI (enemies with an
object as target), built on the horde's group logic (`game/hordes.js`). The waves are quest
spawns: defeated or not, they never enter `run.defeated` of the room. If the thing is destroyed or
everyone is down, the quest fails (below). The host runs the waves, like enemies now.

### Bounty

A named, stronger enemy (a guardian's tier and look, `GUARDIAN_TIERS`) on a hiding place at the
quest's difficulty. Paid on the spot or back at the giver. Cheap, and the first use of quest
spawns.

### Delivery and relay

Carry a parcel (a quest item) from the giver to an NPC elsewhere; that NPC ends it and pays, or
sends you on. This is what helper NPCs are for: the one waiting at a camp three depths down for a
letter.

### More ideas

- **Gather:** N things dropped by quest spawns of a species (spider silk, snake fangs), or picked
  at hiding places (mushrooms, crystal nodes). Gives the crystals and sticks, which have no use
  yet, one.
- **Scattered pieces:** N parts of something spread over one depth (map scraps, pages, a broken
  amulet): Find, several times, all over a depth.
- **Beacons and shrines:** light N things at spots across a depth: exploring, with something to do
  at each.
- **Free the prisoners:** a cage in the depth's horde room; beat the horde, open the cage, a
  person is rescued (and moves to their lasting place).
- **Pet chase:** the pet keeper's lost animal runs off when you come close; corner it.
- **Escort:** an NPC follows you across portals. Costly (paths, falls, portals): later.
- **Scout:** reach a depth, stand on its landmark, climb the spiral.
- **Champion:** beat a depth's side or descent guardian, or break its horde: things that happen
  anyway, with a story and a reward.

### Who gives what

Each giver leans towards the templates that suit them: the smith crystals and stone stunders, the
alchemist venom and potions to give, the pet keeper lost animals, the groom deliveries, the
innkeeper rumours, scouting and bounties, the enchanter landmarks and crystals. NPCs out in the
world lean towards what is around them (a miner: the mines below; a father: his daughter).

## The numbers

A world has about **100 quests**. The world plans them from the seed (the **quest plan**): for
each one its kind, its depth, its difficulty and who gives it. The details (which spot, which
species, which clue, the text) are filled in when it is offered, against the world as it is then
(rule 3).

### Per depth

A world has about 384 rooms (route and branches, `ROUTE_ROOMS` in `world/layout.js`): long routes
near the surface, shorter ones deeper down. 100 quests make one for about every four rooms. They
follow the rooms, a little heavier near the top, where a run spends its first hours:

| Depths | Route rooms per depth | Quests per depth | Quests |
|---|---:|---:|---:|
| 0 (the road out of town) | 18–24 | 4 | 4 |
| 1–3 | 18–24 | 7 | 21 |
| 4–7 | 16–22 | 5 | 20 |
| 8–11 | 14–20 | 5 | 20 |
| 12–15 | 12–18 | 4 | 16 |
| 16–19 | 9–16 | 4 | 16 |
| 20 (the core) | 9 | 3 | 3 |
| | | | **100** |

A quest's depth is where it is done, not where it is given.

### Kinds

| Kind | Quests | |
|---|---:|---|
| Find: an item | 18 | |
| Find: a person | 10 | they move to their lasting place |
| Bounty | 15 | |
| Delivery and relay | 14 | the helper NPCs |
| Gather | 10 | |
| Scout, champion | 10 | cheap, on things that are there anyway |
| Defense | 9 | 6 at outposts, 3 in annexes |
| Scattered pieces, beacons | 8 | |
| Free the prisoners, pet chase | 6 | |
| | **100** | |

Difficulty: 40% easy, 40% medium, 20% hard. No two quests of the same kind and target are active
at once; a kind the giver gave last weighs less.

### Who gives them

- **The town, about 40:** the six villagers, six or seven each, mostly for depths 0–11 (the town
  portal brings you back up), the deep ones fewer.
- **NPCs out in the world, about 60:** about 25 givers (two or three quests each), at seats and
  camps on the way down. Their quests are mostly for their own depth and the next.
- Helpers (about 14, for deliveries and relays) and the people to be found (10) give none of
  their own at first; someone found may give one later from their lasting place (counted in the
  60).

### Spots per depth

Every depth plans more spots than its quests need, so the generator has a choice:

| Spot | Per depth | In a world | For |
|---|---:|---:|---|
| Hiding place | 6–8, from easy to hard (Find) | about 150 | finds, bounties, gathering, pieces (3–5 in one depth) |
| Seat | 2 | about 40 | world givers, helpers, lasting places |
| Camp | every third depth | 7 | givers, lasting places (room for three) |
| Outpost | on 6 depths, about one per band from depth 1 to 19 | 6 | defense |
| Annex | on 3 depths, where the branch budget has room | 3 | defense (later maybe a find or a bounty) |

The town's surface buffer stays enemy-free: no outposts, bounties or quest spawns there.

### When they are offered

- A world NPC offers its quests once someone has come to it; a villager offers a quest once
  `deepest` is at most two above the quest's depth (hard quests are those one or two further
  down), so the town never sends a level 3 hero to depth 15.
- An NPC shows at most two offers at a time; the rest of its quests wait in the plan.
- Some quests are **repeatable** (below); the others are done once.

### Repeatable quests

Whether a quest can come again depends on its kind: things that happen again in a world can be
asked again, stories cannot.

| Repeatable | Not repeatable |
|---|---|
| Bounty ("another one turned up") | Find a person (they are home now) |
| Gather ("I need more") | Delivery and relay (the story is told) |
| Defense at an outpost ("they are back") | Defense in an annex (built for one fight) |
| Pet chase ("it got out again") | Scattered pieces, beacons, free the prisoners |
| | Find an item, scout, champion (the place is the same) |

- A repeatable quest comes back to its giver some time after it was done: once the party has
  been away from that giver's depth and come back, never more than once per visit.
- It is filled in anew each time (`hash(seed, quest slot, n)` for the `n`-th time): a new spot,
  a new target, at the depth the party is at now (within the giver's reach: a world NPC its own
  depth and the next, a villager down to two above `deepest`).
- Repeats pay half the XP and coins of the first time, and potions instead of a weapon, so they
  do not run past the balance curve. They are not counted in the 100.
- When a world's 100 are done, the repeatable ones are what is left; the other NPCs only chat.

### Rewards

- **XP:** about 7% of the cost of the next level at the quest's depth level (`xpToNext`), times
  0.6 (easy), 1 (medium) or 1.6 (hard). About five quests per depth add up to a third of a level
  per depth on top of the kills ([balance.md](balance.md): about one level per depth from kills).
- **Coins** like a chest at the quest's depth: basic (easy), uncommon (medium), rare (hard)
  (`CHESTS` in `core/chests.js`).
- **Items:** easy quests potions, medium ones a weapon half the time, hard ones a weapon from
  Uncommon up (`rollWeapon`, `rollPotions`).
- `tools/balance.mjs` takes the quests into account; if the curve gets too fast, the quests'
  share goes down, not the kills'.

### Text

From phrase templates per giver, with slots, friendly for children (the game is made with kids,
[learn](../learn/)).

## Failing and restarting

A quest can fail: a defense lost (the thing destroyed or everyone down). A failed quest stays in
the list, marked failed, with a **Restart** button in the quest menu: it starts again from the
beginning (its first stage, whichever stage failed), its quest items back where they were, its quest spawns come
again, an annex it opened stays open. Archiving a failed quest works like any other.

Dying is no failure, but a death puts the cube back as it was when you came in
(`game/flow.js`): quest progress made in that cube since then goes back with it (a bounty
defeated there stands again), like `run.defeated`.

## Saving

The world save holds (`cube-crawler.world.<id>`, [saves.md](saves.md)):
- the quests, offered, active, done, failed and archived (the plan itself comes from the seed);
- who lives where (people found and moved);
- quest overlays in the cubes (quest items lying somewhere, a bounty still standing);
- the annexes opened.

A hero brings nothing of the quests into another world: each world has its own. A guest plays the
host's quests, and keeps the rewards it got there, like loot. A reward goes to every player in the
game when the quest is done, wherever they are in the world; a hero who comes later gets nothing
for it.

## The panel

- Tabs **Bag | Quests** in the inventory overlay (`game/inventory.js`); **U** (`quests` in
  `core/keybinds.js`) opens it on Quests; on touch, the tab in the panel.
- The Quests tab: a list with filters (Active, Done, Archived), the details of the selected quest:
  who gave it, the text, its stages with progress, the clue, the rewards, the quest items, a
  "Track" toggle (one tracked quest shows a line in the HUD), Archive / Unarchive, and Restart
  for a failed quest.
- Talking to an NPC (the `talk` action, `game/action.js`, today only shops) opens a small
  dialog: a greeting, the offers to take, quests to hand in; a shop becomes one choice there.

## Checks and dev tools

- A node test makes the quest plan of many seeds and checks the numbers (about 100, the shares
  per depth and kind above), and fills in every quest and checks it can be done: targets in the
  rosters, places in the layout, depths in range, spots clear and reachable, annexes reached
  through their portal and inside the depth's room budget.
- `node tools/quests.mjs <seed>`: a world's quest plan and its quests filled in, to read the text.
- Dev commands: `/quest <template> [depth]`, `/spot` (to the next spot).

## Order of work

1. Engine, generator, the shared quest log in the world save, the tabs and **U**, the dialog
   (built, the dialog being the Quests tab opened by talking; the quest plan still to come).
2. Spots in the world plan and NPCs on them.
3. **Find** (an item or a person), with difficulty, clues, the three payouts, lasting places, the
   first quest items and NPC outfits.
4. **Bounty** (quest spawns).
5. **Delivery / relay.**
6. **Defense**: outposts, then annex rooms; enemies that go for a thing.

## Open questions

- Quests against the clock (a courier): left out for now, maybe later.
