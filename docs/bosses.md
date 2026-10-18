# Bosses

A real boss takes the place of one depth's descent guardian; the other descent guardians stay
boss placeholders ([guardians.md](guardians.md)). `BOSSES` in `src/core/bosses.js` says which
depth has which: so far only the first descent, on the road out of town (depth 0), has one:
**Gusto**.

The layout marks that arena's guardian with `boss` (`world/layout.js`, `cubegen/guardian.js`;
`bossPlaceholder` is false there). The boss stands on the guardian's spot **alone**: no
defenders, it brings its own (`game/enemyspawn.js` `bossSpot`). It is a guardian in every other
way: the descent guardian's level, id, gate, seal, amber HP bar and drops; its death alone opens
the well, for good. Its label shows its name (`♛ Gusto · Lv 1`), the locked well says
"Defeat Gusto to unlock this descent", and the music turns to the boss mood like for any
guardian. Once hurt it no longer keeps to its post (`game/defence.js`).

## Gusto

![Gusto's clips](../blender/previews/gusto-preview.png)

From the kids' whiteboard sketch (`blender/gusto.py`, `assets/gusto.glb`): a big round,
white-grey head with a V of angry brows, glowing red eyes and a wide grin of jagged teeth
(upper row down, lower row up, interlocking). Two long thin arms come out of its sides and end
in four dark claws. Eight thin tentacles hang from its underside: it floats (`hover`), they never
touch the floor, and they move like crazy: the clips only sway them, the game shakes every
tentacle bone on top of whatever clip plays (`flail`, `render/enemies.js`). About 2.3 cells
tall. Its eyes flare up while it winds up an attack.

Profiles: `GUSTO` and `GUSTO_SPLIT` (phase 2) in `src/core/enemies.js`; the fight's rules in
`src/core/gusto.js` (`GUSTO_FIGHT`); the fight itself in `src/game/gusto.js`.

| | Level 1 |
|---|---|
| Health | 1000 (the descent tier's floor) |
| Damage | 24 (grab ×1.4, vortex ×0.5) |
| XP | 650; coins 120–220; two weapons and two potions like a descent guardian |
| Poise | 2 s |

### Phase 1 (full health to half)

- **Grab and throw** (within 1.6 cells, clip `GustoGrab`, 2.2 s): it spreads its arms wide and
  leans back (the tell), lunges and catches at 0.73 s whoever is within 1.8 cells in front of it.
  Caught, the player is held in its hands (`game/grab.js`): no moving, no striking, nothing else
  hurts them, and there is no wriggling free. It lifts them up high in front of its face along
  the clip's grip path (`grab.grip`, read off the clip by `blender/gusto.py`) and at 1.53 s throws
  them down in front of itself: then the blow lands (34 at level 1) and they go over as a
  ragdoll and get up as after any knock-down. A stagger (a heavy blow, a friend's) or its death
  makes it let go: the player drops unhurt.
- **Summon** (within 8 cells, clip `GustoSummon`): it rears back with its arms up and spits Custo
  triangles from its mouth at 0.9 s, onto free floors around it: as many as fill up to **five**.
  It summons again only while fewer are about, at most every 7 s (the first after 1.5 s of
  fighting).
- No blow takes it below half its health (`hpFloor`, `core/combat.js` `damageEnemy`).

### The split

At half its health it stops, shudders and steams (mode `split`) and nothing hurts it for 1.8 s.
Then **three Gustos** appear on spots of the fight zone at least 3 cells apart from each other
and from the players (closer where the arena does not allow that): the real one on any of them,
and two **proxies**.

### Phase 2 (half health to death)

- All three fight the same: the grab, the **vortex** and the summon. Their attacks are out of
  step, so they do not all blow at once.
- **Vortex** (within 4.4 cells, clip `GustoBlow`, 2.1 s): it brings both hands up in front of its
  mouth and breathes in from 0.3 s (air spirals into its hands, it swells), and at 1 s blows a
  vortex through them for 0.6 s: a gust like the Wolla's (`core/gusts.js`, `game/gusts.js`,
  kind `vortex`), 5 cells long, 0.45 either side at the hands widening by 0.4 per cell. A player
  in it is hit once (12 at level 1) and blown back at 10 cells/s fading over 0.7 s (about 3.5
  cells). It stops turning at 0.85 s: stepping out of the cone then dodges it.
- Summons now fill up to **two** Custo triangles; any of the three can summon.
- **Proxies** look exactly like it, carry its name and show its health (their bars drop with
  its own). Any hit at all, however small (a burn tick too), makes one go up in a cloud: no XP,
  no loot. The real one takes damage like any enemy: the play is to find it, and mostly to beat
  it while one proxy still stands.
- When the **second proxy** goes, the real one can still be hit for **1 second** (if it is in
  the middle of an attack, until that is over). Then it vanishes in a cloud (mode `gone`: it
  cannot be seen, hit or touched; `absent` in `core/enemies.js`), and 1.3 s later it and two new
  proxies appear on new spots, as after the split. For 0.5 s after appearing nothing hurts them.
- Its death takes its proxies and triangles along, in clouds (no XP for them).

## Custo triangle

`CUSTO_TRIANGLE` (`src/core/enemies.js`): a kind of the Triangle, half its size, light blue,
1.9× as fast, with a weaker, faster punch (9.5 cells/s) that does **not** knock the player over.
It lives in no roster (`minion`): only Gusto brings them, and they go for the player at once.
Each pays a little XP (11 at level 1) once (`awarded`; never remembered as defeated), no coins
and no weapons, and drops a minor health potion 8% of the time (`drops`,
`core/gear/drops.js`). All the real XP is Gusto's.

## Playing together

The game that runs the cube's enemies runs the fight; the others are shown it (`net/foes.js`):
proxies and triangles appear in the roster like any enemy (`proxy`, `summoned`, `noReward`), and
the modes `gone` and `split` go along. A grab is a blow like any other (`blow.grab`: the enemy's
id): the game of the player it caught carries it out, after the Gusto as it is shown there.
Enemies the runner lets go of without killing them pay nothing.

## Dev

`/spawn gusto` spawns one anywhere, with its fight (`game/devspawn.js` `addGustos`); `/kill`
kills it whatever its phase. `/spawn custotriangle` spawns its minions on their own.

## Checks

```sh
node --test tests/gusto.test.js tests/assets.test.js
```

```js
await (await import('./tests/browser/gusto.js')).runGustoChecks()   // the whole fight, in its arena
```

Re-export the model with `Blender -b --python blender/gusto.py -- assets/gusto.glb
blender/gusto.blend blender/previews/gusto-preview.png`, then `npm run compress-assets`. The
grip path and the muzzles it prints must match `GUSTO` / `GUSTO_SPLIT` (`tests/assets.test.js`
checks them).
