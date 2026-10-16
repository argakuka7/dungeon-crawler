# Sound

Every sound is generated with Web Audio: no sample files. Music is separate (`docs/music.md`).
All of it plays into the one AudioContext of `src/audio/context.js`, made on the first key or
click.

| File | What |
|---|---|
| `src/audio/sfx.js` | one-shot effects: `sfx(name, { at, pitch, volume })`; `at` pans by screen position |
| `src/audio/voices.js` | the enemies' voices, registered with sfx.js as `<species>_alert/_windup/_death` |
| `src/audio/footsteps.js` | footsteps per surface and gait, pre-rendered into variants when audio starts |
| `src/audio/loops.js` | continuous sounds: the charge and cast drones, the ambient beds, drips and lava pops |
| `src/core/footing.js` | the surface under the player (theme, height, structures, banks, town paths) |
| `src/game/footsteps.js` | steps on the walk / run cycle and the ladder rungs, landings |
| `src/game/sounds.js` | sounds from watching state: jumps, long falls, ragdoll thuds, getting up, enemy voices |
| `src/game/ambience.js` | ambient levels from the surroundings, the charge and cast drones |

## Effects and where they come from

| Sound | Event |
|---|---|
| `swing`, `hit`, `kill`, `hurt`, `sizzle` | combat and burning (`game/juice.js`) |
| `fireball`, `zap`, `frost`, `whump`, `shatter`, `icecrack` | projectiles (`game/juice.js`) |
| `laser`, `zapburst`, `fizzle` | the Spicy's laser shining, bursting, put out (`game/juice.js`) |
| `thunder`, `gust` | the Wolla's storm cloud flashing, its blow (`game/juice.js`) |
| `draw`, `twang`, `crossbow`, `reload`, `spell`, `thunk`, `burst` | the player's bow, crossbow and staff: drawing, loosing, a crossbow's shot and reload, a spell leaving, a shot striking a wall, a spell bursting (`game/juice.js`) |
| `coin`, `pickup`, `drop`, `clink`, `toss` | loot: coins, items, a rare+ weapon landing, any other landing, dropping from the bag |
| `unlock`, `levelUp` | a guardian falls, a kill gains a level (`game/enemies.js`) |
| `jump`, `fall`, `thud`, `getUp` | watched in `game/sounds.js`; a fall whistles below 9 units/s down |
| `knock`, `splash`, `burn`, `dissolve` | knocked over, dying in water / lava / acid (`game/ragdoll.js`) |
| `dizzy` | a landing hard enough to sit you down (`game/update.js`) |
| `death` | any death, with a shimmer for coming back at the entry (`game/flow.js`) |
| `gate`, `wellDown`, `ringUp`, `cloud` | portal travel (`game/travel.js`); the town portal keeps `portal` |
| `door` | through a house door (`game/doors.js`): a wooden creak and the latch |
| `castStart`, `fizzle` | reading the scroll, a broken cast or charge (`game/townportal.js`, `game/ambience.js`) |
| `equip`, `bagOpen`, `bagClose`, `use` | equipping, the inventory, quick bar slots |
| `drink`, `buff`, `chest` | drinking a potion and a buff or cure taking hold (`game/quickbar.js`), opening a treasure chest (`game/chests.js`) |
| `lob`, `glass`, `boom`, `hiss`, `poison` | a flask thrown, breaking, a blast, a toxic cloud, a poison tick (`game/juice.js`) |
| `<species>_alert/_windup/_death` | an enemy starts chasing you (at most every 0.3 s), winds up an attack, dies |

## Continuous sounds

- **Drones:** `charge` rises in pitch while standing in a well, ring or the town portal pad
  (stepping off early fizzles); `cast` rises over the scroll's 5 s cast.
- **Beds:** water, waterfalls, lava (plus pops), acid by the distance to the nearest fluid
  surface or fall (falls carry further); wind under an open sky by theme and height; cave air
  and random drips below ground (drip rates per theme). Levels glide over about 0.4 s.

## Levels

Effects go through a gain of 0.45 and a gentle compressor, footsteps through 0.3, the
continuous sounds through 0.5. Per-surface footstep trims are in `footsteps.js` (`TRIM`), bed
levels in `loops.js` (`setAmbience`).
