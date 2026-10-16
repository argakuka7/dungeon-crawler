# Enemy kinds

A **species** is a model with its animations and its base tuning (`SPIDER`, `SNAKE`, ... in
`src/core/enemies.js`). A **kind** is a species with its own name, colours and strength,
drawn with the species' model. The base profile of a species is its first kind. The kinds
are in `ENEMY_KINDS`. Each depth's roster says which kinds of a species spawn there and how
often (`src/core/spawns.js`, see `docs/depths.md`).

Kinds need no new models. They recolour the species' materials at load time in OKLCH.

## Defining a kind

```js
export const BLOOD_VIPER = enemyKind(SNAKE, {
  type: 'bloodviper', label: 'Blood viper', reason: 'Bitten by a Blood viper!',
  colors: { skin: 'oklch(0.60 0.19 27)', eyes: 'oklch(0.93 0.18 100)' },
  ichor: Object.freeze(['#e0503a', '#6a1410']),
  mods: { hp: 1.4, damage: 1.4, speed: 1.2, size: 1.1 },
});
```

Then add it to `ENEMY_KINDS` and to the rosters that should spawn it.

- `mods` multiply the base:
  - `hp` and `damage` scale the base values and their growth per level.
  - `speed` scales chase, wander and homing speed. The animation follows, because the clips
    are sampled from the distance covered.
  - `size` scales the model, the body (radius, height, `bodyHeight`), the melee reach, the
    attacks' `hitReach` and the projectile muzzle. Placement makes room for the biggest kind
    a roster entry can draw, and bigger bodies take longer strides.
  - `xp` scales XP and coins. It defaults to `√(hp × damage)`.
- Any other key replaces the base value outright: `label`, `reason`, `ichor`, `cooldown`,
  `aggro`, and so on.
- `hide` lists materials the kind does not show: meshes drawn only with them are hidden
  (`hideParts` in `src/render/recolor.js`). A model can carry parts for several kinds this
  way: the Shraps has an ice head and a fire head, and each of its kinds hides the other.
- `fx` names the glow of its own in `GLOW` (`src/render/enemies.js`), in place of the
  species' (the Fire shraps' flames; the plain Shraps has none).
- `attacks` replaces the species' attack list before it is sized, e.g. to throw something
  else: the Fire shraps throws fireballs where the Shraps throws ice balls.
- `light` (a colour string) replaces the glow light of a species that has one (`GLOW` in
  `src/render/enemies.js`) and the light of its projectile. `sparks` (a list of colours)
  replaces its embers and its projectile trail.
- A kind keeps its species' `seedSalt`, and an enemy's id uses the species. So where an enemy
  stands, its level and its id do not depend on the kind it drew. Behaviour is still the
  species'. A kind that needs to behave differently would override the attack fields, or
  get new ones that `game/enemyai.js` reads.

## Recolouring

Every enemy GLB has plain, named materials: no textures and no vertex colours. Each species
lists its recolourable materials by role in `parts`:

```js
parts: { skin: ['SnakeBody', 'SnakeRibs'], eyes: ['SnakeEyes_glow'] }
```

The first material of a role is its **anchor**. Teeth, fangs, pupils and mouths are left out,
so they never change. The Stunder's green mouth is the exception: it moves with the skin.

`colors` maps a role, or a single material name, to an op (`recolorFn` in
`src/core/oklch.js`):

- **A colour** (`'oklch(L C H)'` or `'#rrggbb'`): the anchor becomes exactly that colour. The
  role's other materials move with it. Their lightness and chroma scale by the same ratio
  as the anchor's, and their hue turns as far. So the snake's darker ribs stay darker by
  the same amount. If the anchor is close to grey (the black spider), it has no hue to turn
  from. Then the hue is set outright, and chroma shifts rather than scales.
- **An object**: `{ l, c, h }` sets components, then `{ ls, cs }` scales them, then
  `{ dl, dc, dh }` shifts them. For example, `{ dh: 40 }` turns the hue, and
  `{ cs: 0.5, dl: -0.1 }` gives a duller, darker colour.

Roles are applied first, then single materials, so a material entry wins over its role.
Emissive colours move the same way as base colours. Colours that leave the sRGB gamut keep
their lightness and hue and give up chroma until they fit.

At runtime `src/render/recolor.js` works out each kind's colours once, from the prefab's
materials. They are then copied into the material clones that each enemy (and each
projectile) owns, before the hit flash and the hover tint remember the base colour. So
recolouring costs nothing per frame. Every kind of a species shares one shader program.

## Previewing

`npm run serve`, then open `/tools/kinds.html`. It lines up every species that has kinds,
recoloured as in the game, with their HP, damage, speed and size. `?pose=attack` shows the
attack clip's hit frame. `?bg=%23202020` sets the backdrop colour.

## The kinds

| Kind | Species | Main colour | HP | Damage | Speed | Size | XP | Depths |
|---|---|---|---|---|---|---|---|---|
| Sand viper | Grass snake | `oklch(0.80 0.12 82)` ochre | ×1.25 | ×1.2 | ×1.1 | 1 | ×1.23 | 2, 4–7, 9–11, 15–16 |
| Blood viper | Grass snake | `oklch(0.60 0.19 27)` red | ×1.4 | ×1.4 | ×1.2 | 1.1 | ×1.4 | 4, 6, 9–11, 15–17 |
| Frost adder | Grass snake | `oklch(0.88 0.04 225)` icy | ×1.35 | ×1.1 | ×0.95 | 1 | ×1.23 | 7 |
| Venom adder | Grass snake | `oklch(0.58 0.15 310)` violet | ×1.2 | ×1.35 | ×1.1 | 1 | ×1.27 | 9–11 |
| Shadow mamba | Grass snake | `oklch(0.34 0.025 280)` near-black | ×1.6 | ×1.6 | ×1.3 | 1.15 | ×1.6 | 15–17 |
| Frost spider | Spider | `oklch(0.82 0.035 235)` icy | ×1.35 | ×1.1 | ×0.9 | 1 | ×1.2 | 3, 7–8, 13–14 |
| Bog spider | Spider | `oklch(0.40 0.06 135)` moss | ×1.15 | ×1.25 | ×1.05 | 1 | ×1.2 | 5–6, 9–12 |
| Redback | Spider | `oklch(0.34 0.11 25)` crimson | ×1.3 | ×1.4 | ×1.2 | 1.1 | ×1.35 | 4, 6, 11–14, 16, 18, 20 |
| Frost stunder | Stunder | `oklch(0.80 0.04 235)` icy | ×1.25 | ×1 | ×0.9 | 1 | ×1.11 | 3, 7–8 |
| Stone stunder | Stunder | `oklch(0.55 0.03 70)` stone | ×1.6 | ×1.15 | ×0.85 | 1.12 | ×1.36 | 4–6, 8, 11–14, 19–20 |
| Magma stunder | Stunder | `oklch(0.30 0.09 27)` charred red | ×1.35 | ×1.4 | ×1.15 | 1 | ×1.38 | 17–20 |
| Bog octonaut | Octonaut | `oklch(0.74 0.10 130)` olive | ×1.2 | ×1.15 | ×1 | 1 | ×1.18 | 9–12, 15–16 |
| Coral octonaut | Octonaut | `oklch(0.74 0.13 30)` coral | ×1.3 | ×1.35 | ×1.2 | 1 | ×1.33 | 12–16 |
| Emerald triangle | Triangle | `oklch(0.80 0.20 155)` green glow | ×1.25 | ×1.1 | ×1 | 1 | ×1.17 | 13–16 |
| Crimson triangle | Triangle | `oklch(0.64 0.22 25)` red glow | ×1.35 | ×1.35 | ×1 | 1 | ×1.35 | 15–16, 19–20 |
| Fire shraps | Shraps | `oklch(0.56 0.17 32)` red, fire head | ×1.45 | ×1.4 | ×1.1 | 1 | ×1.42 | 17–19 |
| Bog wolla | Wolla | `oklch(0.70 0.17 145)` green | ×1.2 | ×1.15 | ×1 | 1 | ×1.17 | 9–10, 14 |
| Storm wolla | Wolla | `oklch(0.56 0.20 300)` purple | ×1.3 | ×1.3 | ×1.1 | 1.08 | ×1.3 | 13–15, 19 |
| Ember wolla | Wolla | `oklch(0.72 0.17 52)` orange | ×1.45 | ×1.4 | ×1.1 | 1.12 | ×1.42 | 18–19 |

The Crimson triangle also throws 20% more often (`cooldown` × 0.8). Grass snake, Sand viper,
Blood viper and Shadow mamba are strength tiers: green, ochre, red, then near-black. The red
one bites 40% harder and moves 20% faster than the green one. The mamba bites 60% harder and
moves 30% faster. The Frost adder (slow and tough) and the Venom adder (bites hard) give the
ice and the swamp snakes of their own.

The Fire shraps swaps the Shraps' ice head for a burning one (`hide`), throws fireballs that
burn instead of ice balls that chill (`attacks`) and glows like the fire species (`fx`).

The Wollas are strength tiers too: blue, then green in the swamp, purple in the mines and ruins,
orange in the volcanic depths and the abyss. Their eyes take a contrasting colour, and each kind
leaves a trail of its own colour (`trail`).

Fire-face, Fire-cat and Spicy have `parts` (flame, fur, eyes; the Spicy's body, glow, wheels and
eyes) but no kinds yet. A Spicy kind can give its laser a colour of its own with `beamColor`. A blue-fire kind
would also need its embers, its light and its fireball trail recoloured through `sparks`
and `light`.

The Wolk has `parts` (body, limbs) but no kinds yet. Its `gloom` darkens the `body` role towards
a colour of its own while it gathers its lightning, so a kind's cloud darkens from the kind's
colour; a kind may set its own `gloom` too.

## Guardians

Every species' guardians are kinds as well (`GUARDIAN_KINDS`, `DESCENT_GUARDIAN_KINDS`):
hot pink and amber with pale eyes ([guardians.md](guardians.md)). A species can dress them
otherwise with `guardianLooks.side` and `.descent`, which replace those fields (`colors`,
`light`, `sparks`, `ichor`, ...). The Wolk's side guardian is a grey rain cloud that darkens
almost to black, its descent guardian a polished silver cloud: its `finish` (`{ parts,
roughness, metalness, sheen, glints }`, `render/enemies.js`) makes those materials smoother and
a little metallic, with a faint sheen of their own colour (the scene has no environment to
mirror, so fully metallic would look dark) and white glints twinkling on it.
