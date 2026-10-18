# Sound

Every sound is generated with Web Audio: no sample files. Music is separate (`docs/music.md`).
All of it plays into the one AudioContext of `src/audio/context.js`, made on the first key or
click. It runs at 44.1 kHz whatever the speakers run at (the browser resamples), with
`latencyHint: 'balanced'`: the audio thread's work grows with the sample rate, and at a device's
96 or 192 kHz the music alone took two to four times as long, up to all of a core, and broke up.

| File | What |
|---|---|
| `src/audio/sfx.js` | one-shot effects: `sfx(name, { at, pitch, volume })`; `at` pans by screen position |
| `src/audio/voices.js` | the enemies' voices, registered with sfx.js as `<species>_alert/_windup/_death` |
| `src/audio/footsteps.js` | footsteps per surface and gait, pre-rendered into variants when audio starts |
| `src/audio/loops.js` | continuous sounds: the charge and cast drones, the ambient beds, drips and lava pops |
| `src/core/footing.js` | the surface under the player (theme, height, structures, banks, town paths) |
| `src/game/footsteps.js` | steps on the walk / run cycle and the ladder rungs (each ladder style its own sound: `LADDER_STYLES[style].sound`, `themes/builds.js`), landings |
| `src/game/sounds.js` | sounds from watching state: jumps, long falls, ragdoll thuds, getting up, enemy voices |
| `src/game/ambience.js` | ambient levels from the surroundings, the charge and cast drones |

## Effects and where they come from

| Sound | Event |
|---|---|
| `swing`, `hit`, `kill`, `hurt`, `sizzle` | combat and burning (`game/juice.js`) |
| `fireball`, `zap`, `frost`, `whump`, `shatter`, `icecrack` | projectiles (`game/juice.js`) |
| `laser`, `zapburst`, `fizzle` | the Spicy's laser shining, bursting, put out (`game/juice.js`) |
| `thunder`, `gust` | the Wolla's storm cloud flashing, its blow (`game/juice.js`) |
| `charge`, `lightning`, `rumble` | the Wolk's lightning gathering, striking, and its thunder rolling in later, the later the further away (`sfx`'s `delay`, `game/juice.js`) |
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
- Each bed and drone is built when it is first wanted and taken apart after 3 s at level 0:
  the audio thread works on every running node, heard or not.

## Levels

Ladders sound like what they are made of: a dry knock on wooden rungs (`ladder`), a softer
knock and creaking ropes (`ladder-rope`), a rustle of leaves (`ladder-vine`), a short damped
clank (`ladder-iron`) and a scuff of grit with now and then the chain jingling (`ladder-stone`,
the footholds). Hands sound the walk variants, feet the run ones.

Effects go through a gain of 0.45 and a gentle compressor, footsteps through 0.3, the
continuous sounds through 0.5. Per-surface footstep trims are in `footsteps.js` (`TRIM`), bed
levels in `loops.js` (`setAmbience`).
