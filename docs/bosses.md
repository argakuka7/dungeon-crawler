# Bosses

A real boss takes the place of one depth's descent guardian; the other descent guardians stay
boss placeholders ([guardians.md](guardians.md)). `BOSSES` in `src/core/bosses.js` says which
depth has which: so far the first descent, on the road out of town (depth 0), has **Gusto**, and
the second (depth 1) **Totnar**.

The layout marks that arena's guardian with `boss` (`world/layout.js`, `cubegen/guardian.js`;
`bossPlaceholder` is false there). The boss stands on the guardian's spot **alone**: no
defenders, it brings its own (`game/enemyspawn.js` `bossSpot`). It is a guardian in every other
way: the descent guardian's level, id, gate, seal, amber HP bar and drops; its death alone opens
the well, for good. Its label shows its name (`♛ Gusto · Lv 1`), the locked well says
"Defeat Gusto to unlock this descent", and the music turns to the boss mood like for any
guardian. Once hurt, or once it has struck, it no longer keeps to its post (`game/defence.js`).
Like every guardian's arena, leaving it while the boss lives asks first, and being pushed against
the entrance never takes you out ([guardians.md](guardians.md#encounter-and-persistence)).

Each boss runs its own fight (`game/gusto.js`, `game/totnar.js`, its rules in `core/gusto.js`,
`core/totnar.js`); what they share is `game/bossfight.js`: the players in the fight, sending a
body into it, the floors a body fits on, putting minions down round their boss and letting
bodies go. A boss's minions (`minion` kinds, summoned) live in no roster: they pay a little XP
once, no coins, no weapons, now and then a minor health potion, and go with their boss when it
dies.

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
| Damage | 24 (grab ×1.4, vortex ×0.5; breathing in: none) |
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
- **A grab that catches nothing** (the grab's `miss`, `game/enemyai.js whiff`): it goes on into
  `stuck` (clip `GustoStuck`, 2 s): from the catch pose it overshoots and face-plants, arms splayed
  on the floor, tentacles flopping, and heaves itself back up. Until 1.6 s (`exposed.until`)
  every weapon blow does ×1.5 (`exposed.damage`, `core/combat.js weaponHit`, the number shown is
  the bigger one) and none staggers it out of this (`damageEnemy`). Every game shows the crash
  (`game/gusts.js`, `felledFx`: a thump, dust) and says "Gusto missed! Hit him while he is
  down". So reading the tell (arms flung wide and up) and stepping out of reach pays, with any
  weapon; a proxy that misses falls the same way.
- **Breathing in** (`inhale`, within 2 to 9 cells, clip `GustoInhale`, 2.4 s), also in phase 2:
  once the nearest player has kept more than 4 cells (`GUSTO_FIGHT.far`) from it for 3 s
  (`wait`), it starts nothing else (`barred`, `game/gusto.js`). The tell: it sweeps its arms
  back behind it, tips its face up and empties itself; at 0.5 s it lunges its face forward, arms
  out to scoop, and for 1.3 s sucks in whoever stands in the cone before its mouth (9 cells long,
  0.7 either side at the mouth widening by 0.5 per cell) with a clear line to it, swelling all
  the while, then gulps. Pulled at 4 cells/s (`pull.speed`) up to 1.5 cells from it
  (`pull.stop`); away from it the player keeps only a quarter of their steering (`pull.hold`),
  but sideways all of it, and it stops turning at 1 s: stepping out of its breath escapes. It
  does no harm; it recovers in 0.2 s (`recover`), and for 1.5 s after it only a grab may start
  (`follow`). One of the three at a time, every 8 s at most (`breathCool`). Every game pulls its
  own player off the attack clock (`player.pull`, `physics/move.js`), so nothing is sent.
  Shooting from afar is still the safer way, but it no longer keeps the player out of his hands.
- **Summon** (within 8 cells, clip `GustoSummon`): it rears back with its arms up and spits Custo
  triangles from its mouth at 0.9 s, onto free floors around it: as many as fill up to **three**.
  It summons again only while fewer are about, at most every 7 s (the first after 1.5 s of
  fighting).
- No blow takes it below half its health (`hpFloor`, `core/combat.js` `damageEnemy`).

### The split

At half its health it stops, shudders and steams (mode `split`) and nothing hurts it for 1.8 s.
Then **three Gustos** appear on spots of the fight zone at least 3 cells apart from each other
and from the players (closer where the arena does not allow that): the real one on any of them,
and two **proxies**.

### Phase 2 (half health to death)

- All three fight the same: the grab, the **vortex**, the summon and breathing in. Their attacks are out of
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

## Totnar

![Totnar's clips](../blender/previews/totnar-preview.png)

From the kids' whiteboard sketch (`blender/totnar.py`, `assets/totnar.glb`): a tumbleweed, a
ball of tangled sticks and clumps of dry leaves, about 2.4 cells tall with his skulls. In the
middle burns his heart, a red hexagon of embers in a pentagon of thick sticks; three skulls
float above the ball, side by side, bobbing out of step and clacking their jaws; two long stick
arms with twig fingers come out of his sides. The game rolls the ball by the distance he covers
(`tumble`, `render/enemies.js`: the bone `brush`), and he sheds leaves and twigs as he rolls
fast (`litter`). His skulls glow faintly, so they show in the dark.

The sticks lie in three layers round the heart. Each time he loses a skull, one shell of
sticks goes with it (`shed`: the bones the game scales away at each stage, with a burst of bone
shards or sticks and leaves and a crack): stage 2 loses the right skull and the outer shell,
stage 3 the left one and the middle shell. So his heart shows more and more, and its light
grows (`grow` in `render/enemies.js` GLOW).

Profile: `TOTNAR` in `src/core/enemies.js` (all his attacks on one profile; the fight bars
those not of his stage); the fight's rules in `src/core/totnar.js` (`TOTNAR_FIGHT`); the fight
itself in `src/game/totnar.js`.

| | Level 3 |
|---|---|
| Health | 1340 (the descent tier's floor, grown two levels) |
| Damage | 29 (skull ×0.7 and a push, roll ×1.3 and a knock-down, lightning ×0.9 and a stun) |
| XP | 650 grown; coins 140–240 at level 1; two weapons and two potions like a descent guardian |
| Poise | 2 s |

### The dark

All fight long he makes it dark, and after a while light again: the gloom (clip
`TotnarGloom`, 1.7 s; any distance, any height): he spreads his arms high, the ball swells and
the skulls gape, and at 0.9 s he sweeps his arms down. The darkness is sucked into his heart (or
the light bursts out of it) and the whole cube turns to night over a second or so
(`state.dark`, `render/look.js` NIGHT): the sky and the sun all but go out, the far side sinks
into the dark, stars come out. What still shines are the fires, his heart, the skulls' eyes, the
lightning and the player's own light (at its brightest meanwhile). Five braziers burn round the
edge of his arena (`BOSS_ARENAS`, `cubegen/arenaprops.js`), away from his post. He first makes
it dark 3 s into the fight; the light lasts 5–9 s, the dark 8–13 s. When it is due he starts
nothing else. Each time he loses a skull it is light at once, for 6 s at least; his death
brings the light back for good.

### Stage 1: three skulls (full health to two thirds)

- **Skull throw** (within 7.5 cells, clip `TotnarThrow`, 1.4 s): he reaches into his sticks with
  the right hand, pulls out a skull, draws it back over his head and hurls it at 0.8 s. It flies
  tumbling at 7.5 cells/s (turned to cross his aim where the player is, `converge`). A hit hurts
  (20 at level 3) and pushes the player back at 7 cells/s fading over 0.45 s.
- Wherever it ends (a player, the level, its range), it comes to life: a **snapping skull**
  (`becomes`, `game/projectiles.js` tells him, `game/totnar.js`) on the nearest free floor, at
  most four at a time. It hops after the player and bites (with a little pounce); after 7 s it
  crumbles in bone dust.
- No blow takes him below two thirds of his health (`hpFloor`).

### Losing a skull

At two thirds (and at a third) of his health he stops (mode `split`): a skull bursts off him
with a shell of his sticks, nothing hurts him for 1.6 s, and the light comes back. Then he
fights on with the next stage's attacks.

### Stage 2: two skulls (two thirds to a third)

- The skull throw and the dark, as before.
- **Twig spiders** (clip `TotnarSummon`, 1.6 s): he grips his own ball and tears it open,
  shaking, and at 0.9 s small spiders of twigs pour out of it (Spiders at 0.55×, fast and weak)
  onto the floors around him: as many as fill up to **eleven**, every 9 s at most.
- **Roll** (from 1.6 to 8 cells, clip `TotnarRoll`, 3.5 s): he crouches, tucks his arms in and
  pulls his skulls down while the ball spins up in place (the tell), and at 0.8 s rolls at the
  player at 7 cells/s, turning towards them at no more than 0.8 rad/s. What stops him (a wall, an
  edge: he never rolls off one) bounces him off, towards the player if they are that way, with a
  thump and dust; after two bounces the next stop ends the roll. Whoever he touches is run over
  (37 at level 3) and knocked down, once a roll. While he rolls no blow staggers him (`steady`,
  `core/combat.js damageEnemy`); a heavy blow in the wind-up still stops it. At 2.6 s he stops
  and sits dizzy, skulls circling, until the attack is over: the time to hit him.

### Stage 3: one skull (a third to death)

- No more throws and rolls; the snapping skulls left crumble.
- **The storm** (within 9 cells, clip `TotnarStorm`, 1.9 s): he raises his arms, his heart
  flares and his skull gapes at the sky. From 0.4 s three storm clouds gather high above the
  player and two spots 1.4–2.4 cells round them, each with the Wolk's crackling ring on the floor
  (`bolts`, `sky`, `core/beams.js`, `game/beams.js`); the rings follow the player for 0.65 s and
  hold still for the last 0.35 s. At 1.4 s the lightning strikes out of the sky: whoever is in a
  ring is hurt (26 at level 3) and stunned for 0.8 s; the thunder rolls in after. A stagger puts
  the storm out.
- **Bramble stunders** (the summon's clip): Stunders at 0.72×, weaker, whose rams do not knock
  you over: as many as fill up to **two**.
- The dark, as before.

His death takes his minions along (in dust and leaves) and brings the light back.

## Totnar's minions

All three live in no roster (`minion`), pay a little XP once and drop a minor health potion now
and then (`drops`); they turn up and go in a puff of dust and leaves, the skulls in bone dust
(`puff`, `render/enemies.js`).

| | Kind of | Size | Notes |
|---|---|---|---|
| Snapping skull | its own species (`SNAP_SKULL`, `assets/snapskull.glb`) | 0.55 tall | hops and bites, crumbles after 7 s |
| Twig spider (`TOT_SPIDER`) | Spider | 0.55× | twig brown, ember eyes, ×0.4 health, ×1.2 speed |
| Bramble stunder (`TOT_STUNDER`) | Stunder | 0.72× | no knock-down, ×0.55 health and damage |

## Playing together

The game that runs the cube's enemies runs the fight; the others are shown it (`net/foes.js`):
proxies and triangles appear in the roster like any enemy (`proxy`, `summoned`, `noReward`), and
the modes `gone` and `split` go along. A grab is a blow like any other (`blow.grab`: the enemy's
id): the game of the player it caught carries it out, after the Gusto as it is shown there.
Enemies the runner lets go of without killing them pay nothing. Totnar's stage and whether he
keeps it dark go along with his row (`stage`, `dark`, `net/protocol.js rowOf`), and so do the
other bolts of his storm (`bolts`, shown like his beam, `game/beams.js mirrorBeam`); his thrown
skulls fly there like any projectile, but only the runner brings them to life. A game that takes
over running his cube (`adoptEnemies`) starts him at the stage his health gives: he loses the
skulls he has lost again at once.

## Dev

`/spawn gusto` spawns one anywhere, with its fight (`game/devspawn.js` `addGustos`); `/kill`
kills it whatever its phase. `/spawn custotriangle` spawns its minions on their own. Likewise
`/spawn totnar` (`addTotnars`), `/spawn snapskull`, `/spawn totspider` and `/spawn totstunder`.

## Checks

```sh
node --test tests/gusto.test.js tests/totnar.test.js tests/assets.test.js
```

```js
await (await import('./tests/browser/gusto.js')).runGustoChecks()   // the whole fight, in its arena
await (await import('./tests/browser/totnar.js')).runTotnarChecks() // Totnar's, in his
```

Re-export the model with `Blender -b --python blender/gusto.py -- assets/gusto.glb
blender/gusto.blend blender/previews/gusto-preview.png`, then `npm run compress-assets`. The
grip path and the muzzles it prints must match `GUSTO` / `GUSTO_SPLIT` (`tests/assets.test.js`
checks them).

Totnar and the snapping skull: `Blender -b --python blender/totnar.py -- assets/totnar.glb
blender/totnar.blend blender/previews/totnar-preview.png assets/snapskull.glb`, then
`npm run compress-assets`. The throw, summon and storm points it prints must match `TOTNAR`
(`tests/assets.test.js`).
