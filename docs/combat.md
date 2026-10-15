# Combat and enemies

Four kinds of weapon: swords swing (most of this page), bows, crossbows and staffs shoot (see
[Bows, crossbows and staffs](#bows-crossbows-and-staffs)). The controls are the same for all.

- **Mouse (Diablo style):** click the floor to walk there (pathing over the floor
  graph, to the closest reachable floor if the spot cannot be reached), click an enemy
  to walk up and swing at it. Holding the button keeps following the cursor / keeps
  attacking. WASD
  still moves and cancels any mouse order. The character only turns when you click
  (or move), never just from hovering. **Space:** movement-only jump.
- **Movement speed:** the player always runs, by keyboard and by mouse order; holding
  **Ctrl** walks. On the ground speed ramps up linearly, standing to a full run in
  `RUN_RAMP` (0.25 s, walking pace after about 0.17 s, so taps stay precise), and brakes
  at `BRAKE` (30 units/s², about 0.1 s from a run). The direction follows the input at
  once, so turning keeps the speed. Swimming and air control are unchanged. Ctrl+W/A/S/D
  are tracked as movement and Ctrl+S/D/A are kept from the browser; on Windows/Linux
  browsers do not let pages stop Ctrl+W from closing the tab (use the arrow keys there).
- **Auto-attack (hold Shift):** swings at the best enemy the blade can reach (blade
  reach plus 0.15 the wind-up step-in covers, the same height band as the blade, in line
  of sight): the hovered one first, else the closest, preferring those ahead of the
  movement keys or the facing (`softTarget`). It never swings at the air and never walks
  up: without an enemy that close it does nothing. Holding keeps swinging and re-picks
  the target; a mouse order carries on between swings.
- A swing is fast and buffered (`core/combat.js`, `game/sword.js`): the blade connects
  0.16–0.27 s after it starts; from 0.3 s moving cuts the recovery short; from 0.42 s
  a queued click chains into the next swing (clicks are kept for 0.3 s). A weapon's
  `interval` (its attack speed: 0.32 s for a short sword to 0.66 s for a greatsword) is
  that chain point; every swing time scales with it. The Slash clip (frames 15–21 are its contact) is retimed
  to fit (`swingClipTime`). During the wind-up the player steps in towards an enemy
  that is just out of reach.
- Blade hits land in a forward arc, within blade reach and vertical overlap, with
  slab / prop line-of-sight. Each target can be hit once per swing. No contact /
  landing / stomp damage. Every weapon crits 5% of the time (a bigger, golden number);
  affixes can widen the arc, crit more often and harder, add life on hit and harder
  knockback ([loot.md](loot.md)). Without a weapon there are no attacks.
- **Stagger and poise:** a hit staggers an enemy: it interrupts its wind-up, stuns it
  briefly and holds its next attack for 0.45 s. Then the enemy is *poised* for
  `profile.poise` seconds (none for spiders and snakes, 0.4 s Fire-cat, 0.8 s Octonaut,
  Shraps and Fire-face, 1.2 s Triangle, 1.5 s Stunder, 1.4 s / 2 s side / descent guardians): lighter
  hits hurt it (it flashes, barely moves) but do not stagger it, so it can strike back. A
  blow of a quarter of its health or more (`HEAVY_HIT`) staggers it anyway.
- Hit feedback (`game/juice.js`): a short hit pause, a camera nudge, sparks and
  ichor, a knockback, a damage number and generated sounds (`audio/sfx.js`).
  Spider bites are a short flinch; a Stunder ram or a lethal bite knocks you over.
- Knocked over, you ragdoll until the body settles, then get up from where it lies
  (`game/ragdoll.js`): face down or on the back picks `GetUpFront` / `GetUpBack`,
  turned to the body; the animator morphs the ragdoll pose into the clip's first frames.
  The clips keep the feet planted (or lift them), so nothing slides. You can't act until
  you are nearly upright (the clip's `move_time`); walking or swinging then cuts the
  rest short. `GET_UP_SPEED` sets the pace.
- Swimming, ladder climbing, stun, knockdown and travel cancel / block slashes.
- The Old Sword deals 30 base damage. Level-1 spider has 32 HP / 15 damage (two slashes);
  Stunder has 140 HP / 30 damage (five slashes), a heavier collision body and an
  always-knockdown head-down ram. The enemy under the cursor is highlighted and shows its health. Player/enemy levels and alternative weapons scale these numbers;
  see [progression.md](progression.md). Inventory (`I`) pauses simulation and input.
- Each depth has its own roster (`src/core/spawns.js`, see [depths.md](depths.md)):
  snakes and a rare Stunder near the surface, then spiders, then the stronger species
  further down. Each cube rolls which species it holds, how many, and which one leads.
  Melee species spawn in packs that grow with depth; ranged ones stay at a few per cube.
  Spawn sites must be dry, clear for the species' height, linked to walkable floors,
  at least four cells from portals and spaced apart (a pack gathers closer around its
  first member). If no safe site exists, spawn fewer.
- Every layer has one [wild horde pack](hordes.md) in ordinary terrain: numerous lighter melee enemies
  rally together on sight or damage, approaching from different sides. Their
  attack starts are staggered and capped at three simultaneous attacks. Hordes
  use a small reserved open patch, replacing that cube's scattered roster without
  turning it into an arena. Ordinary packs and guardians keep
  their existing behaviour.
- All species share navigation / AI / melee (`core/enemies.js` holds the tuning; see
  [Enemy behaviour](#enemy-behaviour)).
  Stunder walks at 0.45 cells/s, pursues at 1.05 cells/s using its fast wiggling
  walk, commits its heading before the ram, and contacts at animation frame 16.
- Snake (light green, `blender/snake.py`): slithers with a lateral wave that runs
  back along its body at exactly its ground speed, so the body follows a fixed path
  on the floor. It coils, strikes forward and down and bites at frame 12 (16 damage,
  a flinch like a spider bite).
- Octonaut (pale blue, six legs, two arms, floating face; `blender/octonaut.py`):
  two attacks, listed in the profile's `attacks` and picked at random each time it
  strikes (slaps twice as often): a two-armed slap in front of it (frame 13), and a
  full spin on five legs that sweeps the sixth, stretched out, all around it (frame
  19): 1.4x damage, hits in every direction, knocks the player down. Each attack has
  its own clip; the renderer plays the one `attackOf(e)` names.
- Snake and Octonaut share shining purple eyes (an emissive material; the eyes
  shrink away as they die).
- Fire-face, Triangle and Fire-cat are much stronger than the rest (120 / 170 / 130 HP,
  22 / 28 / 26 damage, 90–110 XP at level 1). Fire-face and Triangle hover: their idle loop runs
  on time, not on ground speed.
- Fire-face (`blender/fireface.py`): a floating, glowing red and orange flame with an
  angry face whose tongues flicker. From up to 4.5 cells away, with a clear line to the
  player, it rears back, grows a fireball in front of its mouth and spits it (frame
  18). The fireball sets the player on fire for half a second (6 more damage in two
  ticks, flames and an orange light on the body; water puts it out).
- Triangle (`blender/triangle.py`): a floating, pulsing purple triangle with two
  smaller triangles inside it. From up to 4 cells away it pulls them back and shoots
  them out as a punch (frame 20) that knocks the player down; new ones grow back.
- Projectiles (`core/projectiles.js`, `game/projectiles.js`) leave from the clip's
  muzzle point (`extras.muzzle`, mirrored in the profile) and fly straight along the
  thrower's heading, pitched at the player's chest. The thrower stops aiming before it
  lets go, so stepping aside dodges. Walls, props and range stop them; travel clears
  them. The meshes are exported beside the rig in the same GLB (`props` in
  `render/enemymodel.js`).
- Fire-cat (`blender/firecat.py`): a dark red, striped cat that is slightly on fire
  (tail tip, spine and a mane of flames). It prowls, runs in at 3.4 cells/s (a gallop
  blended in by speed) and pounces from up to 2.2 cells: the AI carries it forward
  between 0.3 s and 0.6 s of the attack until it is 0.55 cells short of the player, and
  it bites on landing (frame 20). The bite does not burn.
- Shraps (`blender/shraps.py`): a light blue crab-armed creature on bent, frog-like legs
  with wavy shins, and a block of ice for a head. It fights near and far: each of its two
  attacks has its own `reach` (and `minReach`), and it picks among those the player is in
  (`attacksInReach`). Within 1.05 cells it raises both claws, lunges and pinches them shut
  (frame 13). From 1.8 to 5 cells, with a clear line, it cocks its right claw back over its
  head while an ice ball grows in it and throws it (frame 21). The ice ball chills the
  player: it moves at half speed for 1.6 s, thawing back over the last 0.4 s (frost on the
  body, `render/chilled.js`). While a throw recovers it keeps closing in, so it ends up at
  the claws. Fire puts a chill out and ice puts out a fire.
- Fire shraps: a kind of the Shraps (`docs/enemy-kinds.md`), red, with a head of flames in
  place of the ice block, that throws the Fire-face's burning fireball. The one model carries
  both heads (and both balls in the claw); each kind hides the other's materials (`hide`).
- Spicy (`blender/spicy.py`): a toxic green, curved bar of a body with four glowing stalks,
  red eyes floating above it and two thin legs on wheels, from which three-fingered arms
  branch off. It rolls: `render/enemies.js` spins the wheel bones by the distance the body
  covers along its heading (`profile.wheel` is their radius), so its clips leave them still,
  and a corpse's wheels spin down. It fights from afar (`style: 'ranged'`, 2.4–4.2 cells). To
  attack it rolls backwards, swaying, for 0.7 cells (`retreat`: the AI backs it off between
  0.05 s and 0.75 s of the attack, eased like a lunge), braces, and at 0.9 s shines a green
  laser from both eyes (`beam`, `game/beams.js`, `core/beams.js`). The beam aims at the
  player's chest and follows them at 0.8 cells/s, runs on until a wall or the player's body
  stops it, and after 0.6 s bursts (clip frame 45): a player within 0.28 cells of it (body
  radius included) takes the hit. Walking or running across the beam gets out of it in time;
  standing still or backing straight off does not. A stagger or death of the Spicy puts the
  beam out before it bursts.
- The glow lives in `render/enemies.js`: each of the three (and the Fire shraps) carries a light from the
  shared light pool (`trackLight`), bones named `flame*` keep flickering over any clip,
  the Triangle's emissive materials pulse with its hover beat, fire sheds embers, and
  all of it dies down with the death clip.
- Actual GLB death clips play once and hold their corpse poses, then fade and
  release their skeletons, mixers and instance materials. Portals detach /
  slide / dispose both species, rather than leaving enemies in the old cube.

## Enemy behaviour

One brain for every species (`game/enemyai.js`), a state machine that thinks about five
times a second (0.2 s, jittered so a pack does not decide in lockstep) and acts every frame.

- **Navigation** (`physics/enemynav.js`, `physics/floornav.js`): the floor graph's nodes are
  floors and structure pieces. A stair or bridge piece links to the pieces before and after it
  along its run, the run's end pieces to its floors or landings, a landing to the landings its
  walkways open to (`structureLinks`). So enemies follow you up and down stairs, over ramps,
  bridges and landings, and so does a click-to-move walk. Nobody climbs ladders or jumps. The
  body probe is kept within 0.42 cells, so broad bodies fit on one-cell structures.
- **Noticing** (idle, walk, home, search): within `aggro` ahead of it (100° either side of its
  heading), half that behind it, or within 1.6 cells whatever it faces; with a clear line from
  its eyes to your chest and within 1.6 height. Within 1.4 × aggro in sight it turns towards
  you slowly, so sneaking up from behind works only so long. Noticing puts it in `alert` (a
  "!" over its head) for 0.3–0.6 s, then it gives chase and calls the others: idle enemies
  within 5 cells react a little later. A hit (any damage, also unstaggered ones) makes it hunt at
  once, for longer, and calls the others too. Hordes and guardian defenders keep their group
  logic ([hordes.md](hordes.md), [guardians.md](guardians.md)).
- **Hunting** (`chase`): a path (up to 24 steps) to the node you stand on; while you are not on
  one it can walk (jumping, swimming, on a ladder, under a ceiling too low for it), to where
  it last saw you stand; if that is out of reach, as close as it gets (`pathToward`). It sees
  you within the larger of `aggro` and `giveUp`, all around and up to 4 above or below. Out of
  sight it keeps going for 3 s (6 s after a hit); once it reaches the spot where it lost you,
  stays stuck short of you for 4 s (unless it can shoot from there) or runs out of memory, it
  `search`es: it looks around near that spot for 4 s, then goes home.
- **Between blows**, by the profile's `style`:
  - `skirmish` (spiders, snakes, Fire-cats): backs off after a blow, circles at `circle` cells
    (spiders scuttle sideways facing you, `strafe`; the others walk round), switching sides
    when blocked and now and then, and darts in once the cooldown is over.
  - `ranged` (Fire-face, Triangle, Spicy): backs away while closer than `keep[0]`, sidesteps while the
    throw recovers, and moves for a clear shot when it has none.
  - `brute` (Stunder, Octonaut, Shraps): holds its ground. The Stunder `charge`s: it runs the
    last 1.5–5 cells at 1.8× its chase speed when it can strike again.
  Cooldowns vary by ±20% per blow. Throws are aimed ahead of a running player by half the way
  they would run before the throw arrives; changing direction dodges them.
- Blows start within 0.75 height (a stair step or a ramp) and land within 0.85.

## Bows, crossbows and staffs

The ranged kinds (`kind` in `core/items.js`, five bases each; stats in
[progression.md](progression.md#weapons)) attack like swords do: a planted wind-up, an active
moment, a recovery that movement or the next attack cuts short, every time scaled by the
weapon's `interval`. Each kind has its timing in `core/combat.js` (`KINDS`: `BOW`, `CROSSBOW`,
`STAFF` at a middling interval) and its clip in `character.glb`, retimed the same way as Slash
(`swingClipTime`). Instead of a blade arc, the attack lets a shot go at `activeStart`
(`shotDue`, `game/sword.js`):

- **Shots** (`core/shots.js`, `game/shots.js`, `render/shots.js`): an arrow, a bolt or a spell
  flies straight at the middle of what it was aimed at, where that was when it left (the drawing
  player keeps turning to the target until then, so a moving enemy is tracked during the wind-up
  but can step out of the shot's line afterwards). It flies from the middle of the body at the
  height the weapon lets go (`MUZZLES`, the clips' `extras.muzzle`), so an enemy pressed up
  against you is hit too; the renderer draws it from the weapon and lets it catch up. It hits
  every enemy body it passes once: an arrow stops at the first, a bolt goes through `pierce`
  more, a spell stops at the first and bursts (`burst` cells, `BURST_SHARE` = half its damage
  to everything else there). Walls, props and its `range` stop it (a spell bursts there too).
  Damage, crits, life on hit, knockback (along the flight) and staggering are the sword's
  (`weaponHit`). Travel and level resets clear shots in flight.
- **Targeting**: clicking an enemy walks until it is in range *and* in sight (a clear line from
  where the shot leaves to its body, `lineOfFire`), then shoots without walking further;
  holding keeps shooting. Shift auto-attack picks enemies within the range that are in sight.
  Shots reach enemies up to 2.6 cells above and 2.2 below your feet (`AIM_BAND`), so ledges
  are fair game. There is no lunge.
- **Bow** (left fist): turn side-on, raise the bow, draw to the cheek, loose. A chained shot
  starts the clip at `redraw` with the bow still up, and the two attacks cross-fade (every
  kind's attack clip is played on alternating actions for this, `render/animator.js`). The
  string is drawn by the right fist and an arrow lies on the bow from the moment the fist takes
  the string until the arrow leaves (`render/held.js`).
- **Crossbow** (right fist, like a pistol): raise to the chest, shoot with a kick, then lower
  it to the belly where the left hand draws the string and lays the next bolt. It shows empty
  (string forward, no bolt) from the shot until the reload (`crossbowLoaded`, at the clip's
  `reloaded`), also when walking cut the reload short; a ratchet and click sound just before.
- **Staff** (right fist): lift it beside the shoulder, then thrust it so its head points at the
  target as the spell leaves, the left palm pushing along. The stone glows in the spell's
  colour (`color` per staff) as it gathers, with sparks at the head.
- **Carrying**: the ranged kinds are carried in a hold pose (`HoldBow`, `HoldCrossbow`,
  `HoldStaff`: one arm's two bones, laid over idle, walk, run and jumps by the animator, a
  little looser while running): a bow upright at the left hip, a crossbow pointing ahead at
  the right, a staff upright beside you. Their attack clips start and end in it.
- **Mounting**: every weapon GLB says in its extras which fist it goes in and how it sits there
  (`socket`, `mount_quat_gltf`, from `MOUNTS` in `blender/items.py`); bows and crossbows have
  their string (and a crossbow its loaded bolt) as separate parts that the game poses. `blender/
  loadout.py` renders the player with each kind at the clips' key frames and solves the mounts
  (`--mounts`): the bow upright at the loose, the crossbow level at the shot, the staff upright
  in the hold.

![The bow's Shoot clip, from the hold to the loose](../blender/previews/loadout-bow-front.png)

The other kinds: [sword](../blender/previews/loadout-sword-front.png),
[crossbow](../blender/previews/loadout-crossbow-front.png),
[staff](../blender/previews/loadout-staff-front.png).

## Fluids and falls

- Walking/running stops at edges facing water, lava or acid; jumps, knockbacks and
  airborne falls can still enter them. Bridges and dry floors above fluids remain walkable.
- Entering any fluid is fatal (`physics/fluid.js`, `dieInFluid` in `game/ragdoll.js`):
  you drown in water, burn up in lava, dissolve in acid. The player ragdolls, slowed
  down and sinking, for at least 2.2 s, then respawns at the cube entry with full
  health. Existing ragdolls die the same way when they tumble in.
- There are no dedicated death animations; `render/fluiddeath.js` layers an effect
  over the ragdoll: a splash and bubbles (water); embers, smoke, a glowing then
  charred body and an orange light (lava); fizz, vapour and a green body that fades
  away (acid). The shared character material is restored when that ragdoll ends.
- Falling through a cube into a fluid preserves the landing position. A fall through
  cubes always ends back in the cube it started in (see `docs/world.md`).
- Dying puts the cube back as it was when you came in (`game/flow.js` `die`): enemies
  defeated since return and the coins they dropped that are still on the floor go.
- Entering a cube (or respawning) gives a grace period (`ENTRY_GRACE`, 1.2 s in
  `game/enemies.js`): enemies may chase but start no attack until it runs out or you
  land a hit.
- Lava and acid *falls* (the sheets pouring off ledges) are unchanged: lavafalls knock
  you down for 50 damage, acid falls hurt over time.

## Development

Run the game and its tests from any checkout:

```sh
uv run --no-project tools/serve.py 8001   # or: npm run serve -- 8001
# http://localhost:8001/?seed=123
npm test
```

When working in a git worktree, the server automatically serves `/assets/*`
from the main checkout, while game code stays in the worktree. This permits
re-exporting Blender assets in the main checkout without copying them into the
worktree. Asset tests follow the same convention (`CRAWLER_ASSETS_ROOT` can
point them at a different checkout).

Use `--assets-root /path/to/repo` to override asset location. The player GLB
is unarmed: just the skinned body, clips and empty `hand.L` / `hand.R` sockets.
The game separately loads the equipped weapon's GLB and mounts it in the socket its extras
name (the Old Sword, `assets/sword.glb`, on `hand.R`). Gameplay equipment uses `game/equipment.js`: it loads a weapon first,
then atomically updates inventory equipment and the hand-held model. `?dev=1`
adds a weapon roller (base, rarity, item level) to inventory. `render/character.js` also
exposes low-level `loadSword(url)` / `equipSword(null)` for renderer tests only;
these do not change inventory or combat stats. Swimming / climbing hides the prop.
`Climb` is an in-place IK loop covering two ladder rungs (0.56 game units);
vertical speed advances its phase, descent reverses it, and stopping holds
the grip. Regenerate via the Blender commands in
`character.py`, `spider.py`, `stunder.py`, `snake.py`, `octonaut.py`, `fireface.py`,
`triangle.py`, `firecat.py`, `shraps.py`, `spicy.py` and `sword.py` (the SDF creatures share `blender/creature.py`
and can also be rebuilt from a Blender MCP session; previews land in `blender/previews/`). Tests check balance, hit timing,
direction / reach / height, cancellations, deterministic spawns, clearance,
navigation and the exported asset/clip contract.

For browser integration checks, load the game, wait for the assets, then run
in the browser console:

```js
const checks = await import('./tests/browser/combat.js');
await checks.runCombatChecks(); // real input (click on an enemy, Shift), controller, damage, GLB poses, cleanup
await checks.runControlChecks(); // run ramp / Ctrl walk / Ctrl+W, Space jump, Shift auto-attack only in reach, F unbound
await checks.runNewEnemyChecks(); // snake bite, Octonaut slap / spin kick, their clips and corpses
await checks.runFireChecks(); // fireball + burning, Triangle punch / dodge / walls, Fire-cat chase and pounce
await checks.runClimbChecks(); // ladder controller, reverse / hold / exits, dynamic weapon
await checks.runGetUpChecks(); // knockdown -> ragdoll -> GetUpFront / GetUpBack, move time, idle pose
await checks.runRangedChecks(); // bow / crossbow / staff: sockets, hold pose, drawn string and arrow, range and walking up, pierce, reload, burst
await checks.runTravelCheck(); // real portal; leaves the player in the next cube
const water = await import('./tests/browser/water.js');
await water.runWaterChecks(); // all fluids: edge guard, jumps/high falls, ragdolls, effects, dry respawn
const inventory = await import('./tests/browser/inventory.js');
await inventory.runInventoryChecks(); // resets the run; UI, equipment, rewards, revisits
await inventory.runWeaponLootChecks(); // weapon drops, labels, click pickup, the inventory floor column, deaths
```
