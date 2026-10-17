# World of cubes (spike)

The world is an unbounded grid of cubes `(X, Y, Z)`. `Y = 0` is the surface and deeper
strata go down to depth 20 (`MIN_Y = -20`). Cubes come into existence lazily, the first time you get
near them, and stay around after that.

## Layers

| Layer | Code | Contents |
|---|---|---|
| World | `src/world/` | WFC tiles, faces, specs, the cube cache |
| Themes | `src/themes/` | per-depth palettes, lighting, generator settings, materials |
| Generator | `src/cubegen/` | turns a spec into a map |
| Game | `src/game/flow.js`, `portals.js`, `minimap.js` | entering cubes, portal travel, the overview |
| Render | `src/render/markers.js`, `neighbors.js` | portal looks, low-detail neighbors |

## Starting town (`world/town.js`, `cubegen/town.js`)

The spawn cube `(0,0,0)` is an authored clearing, rotated to match its **single
outgoing side portal**. It contains the four permanent `assets/town.glb`
buildings: inn, stable, pet shop and blacksmith. They stand on the cube grid (quarter
turns, like the rest of the world) at staggered positions around an asymmetric clearing.
The inn, the blacksmith and the pet shop have doors and colliders that follow their walls
and attached props (`parts` in `world/town.js`), so you can walk right up to the door and
in (see House interiors below); the stable, without a door, collides with its whole
footprint. Spawn is in the central clearing; one straight street runs from the grove's
opening past the plaza, and straight paths branch off it at right angles to each doorstep
or frontage. Paths are rendered as grid-aligned ribbons rather than whole-cell paving. No well,
voids or extra exits exist inside town. East of the plaza a spot is kept free for the town
portal's other end (see Travel below). The walkability flood fill also requires the way between
two cell centres to be clear, not just the centres, so a crate cannot pinch a route shut.

All three merchant tents are in a separate **merchant camp one cube in front of
town**, along its outgoing road: `step(TOWN_KEY, seed % 4)`. They face a straight
through-road from both sides, on the grid like the houses. Tents have no doors. The camp has two side portals, one
back to town and one onward; it has no spawn portal, pond or permanent houses.
Authored prop placements are shared by worker metadata and rendering without
marking the camp as town. Both gates and every building/tent frontage are validated
by a body-radius-aware flood-fill before rendering.

Both clearing tiles are pinned to lowland sockets and one layer **before the surface
collapses**. All dry ground is exactly level 4 (2 game units); the town's reserved
five-cell pond has a lower bed and water surface. Clearing face profiles and corner
levels are fixed, and neighbouring terrain's shared boundary corners are pinned
during smoothing, including the camp-to-countryside edge. Neither clearing depends
on generation retries, exploration order or the `?arche=` debug override. Buildings,
pond, spawn and paths are reserved before placing vegetation or validating
reachability.

Villagers stand at the trades (`VILLAGERS` in `world/town.js`, see
[villagers.md](villagers.md)): the innkeeper on the inn's porch, a groom in front of the
horses, the smith at the anvil, the pet keeper by the rabbit pen, and in the camp the
alchemist and the enchanter in front of the potion and herb tents. Each is a body-sized
circle collider, placed before the clutter, so props keep clear of them and the walkability
checks include them.

Sixteen large oak/elm/birch trees from `assets/town_trees.glb` form an irregular
perimeter grove, with smaller shrubs and flowers in reserved pockets. The trees
are 6–7 units tall, higher than the inn; their crowns may overhang the clearing,
but only the trunks block movement. Tree species and scale/yaw vary deterministically.
The existing cutaway includes building and canopy occlusion volumes, independently
of body colliders, so foreground roofs/foliage reveal the player as the camera turns.

Both clearings are then dressed with ~140 small catalog props (`put`/`group`/`scatter`
in `world/town.js`), all reusing `props.glb`/`clutter.glb`: authored set pieces
(a gate signpost, lamp posts, barrels/crates/sacks by each trade, the blacksmith's
planks and coal, a wheelbarrow at the stable, reeds/stones/lily pads around the pond,
the traders' campfire with log seats) followed by seeded meadow ground cover that
thins out towards the open centre. Candidates that do not fit are skipped. Every
prop avoids the oriented building footprints, trunks, other clutter, the pond (except
water/shore props) and the path ribbons; blocking props (barrels, crates, logs …) get
circle colliders and also keep clear of gates, the spawn plaza and doorsteps by a full
character width, so the reachability validation is unaffected. Lamp posts are
marked `unlit` because the town is in daylight.

`enemyFree` is generation metadata, retained on cached maps and checked before any
species-specific spawn selection. The town and the one-cube-wide **surface** buffer
(`Y=0`, `max(abs(X), abs(Z)) <= 1`, including diagonals if they exist) have no enemies.
Along the current surface road: **town → safe merchant camp → enemies → well**.
This is not temporary spawn protection and does not make the underground safe.

The initial loading screen waits for both the ordinary prop library and the town
building/tree libraries. Static building/tent colliders are generated in the worker,
independent of download timing; rendering cannot accidentally remove them.

`npm test` includes town checks across seeds and all four exit
orientations: flat dry ground, guaranteed town pond, four houses inside town and
three tents only in the adjacent road cube, non-overlapping assets, dry reachable
gates/frontages using actual movement probes, generation-order-independent
boundaries, grid-aligned buildings and straight path geometry, clutter placement and colliders,
safe-buffer spawns/revisits, box/trunk collision,
canopy occlusion, and matching Blender exports. For real worker/asset/render checks,
run `await (await import('./tests/browser/town.js')).runTownChecks()` from
`index.html`'s devtools.

## House interiors (`cubegen/interior.js`, `game/doors.js`, `render/interior.js`)

The houses with a door (inn, blacksmith, pet shop) each have an inside: a map of its own
under the key `interior:<building>` (`world/town.js interiorKey`), outside the cube grid.
It has no WFC tile, faces, neighbours, glass box, minimap cell or enemies, counts as town
(depth 0, the town song, no town portal casting) and is generated in the worker on first
use, like a cube.

- **Proportions:** the room is the house's walled body (`body` in `BUILDINGS`) at one shared
  scale (`INTERIOR_SCALE`, 3.8 cells per model unit), so the inn (13 × 11) stays bigger than
  the blacksmith (10 × 10) and the pet shop (10 × 9). Storeys fit the 1.1-unit character
  instead of the models' scale: the inn's ground storey is 3 units, the others' 2.5.
- **Orientation:** the room stands the way the house does in town, which turns with the
  exit. The front wall faces where the house's front faces and holds the door where the
  model has it along the front, so walking in keeps your direction.
- **Upstairs:** the inn has a gallery along its back wall (its real upper storey), the
  others a loft under the gable. A wooden stair climbs the house's right-hand wall to it;
  a railing runs along the open edge and invisible rails line the stair.
- **Walls all round:** box colliders just outside the floor, with a stone footing and
  plaster in a timber frame, windows on the back (upstairs) and right (downstairs) walls.
  There is no floor outside them, but no way to get there: you cannot fall out.
- **Doors:** walking into a door (`core/doors.js atDoor`: on its side, within its width,
  against its face, pushing towards it) takes you through at once, with a fade and a creak
  (`door` sound). You arrive on the other door's doorstep (`DOORSTEP`, 0.75), facing the way
  you walked. Each arrival starts a visit. Town doors lead in (`map.doors`, `to` the
  interior); the door inside leads back to its house. The interiors behind a cube's doors
  are prefetched.
- **Cutaway:** the walls on the camera's side come away entirely, down to the floor, with
  everything mounted on them (`uWallBox`/`uFrontKinds` in `render/cutshader.js`: inside
  houses only the walls' own `stone` mesh, not the floors, stair or railing). The door
  stands in front of that band, so it stays. Walls cast no shadows. No two faces in the
  interior share a plane, so nothing z-fights, also not in the cut.

`npm test` covers which houses have interiors, walking into every town door for all four
exits, proportions, orientation matching the outside, running into every wall, the stair
and both doors (`tests/interior.test.js`). From the browser's devtools,
`await (await import('./tests/browser/interior.js')).runInteriorChecks()` walks in and out
of every house over four seeds and checks the cut walls.

## Wave function collapse (`world/tiles.js`, `world/wfc.js`)

Each cube collapses to a **tile** with four side sockets:

- `L`: lowland.
- `H`: highland, meaning the ground reaches the first layer.
- `W`: lowland with a river crossing the face.

Tile kinds are meadow (`LLLL`), highland (`HHHH`), slope (L and H mixed), river (two `W`),
lake (one or more `W`) and gorge (both `H` and `W`).

The tile set covers all 81 socket combinations, so collapsing a cube next to any set of
collapsed neighbors always succeeds. There is no backtracking and never a contradiction.
Uniform tiles weigh more, which grows regions; the mixed tiles appear where regions meet.

Each depth is its own puzzle: domains and layer counts only look at the four side
neighbours, never up or down. A depth collapses **in one go**, the first time any of its
cubes is prepared: its layout's cubes plus their side neighbours (the neighbours carry the
faces between a room and the rock around it), lowest entropy first. Each cube draws from its
own random stream (world seed plus cube key), and the region is fixed by the layout, which
only depends on the seed. So the tiles depend on the seed alone, **not on the order of
exploration**: walking a depth backwards, prefetching other portals or generating depth 9
before depth 2 gives the same world. That is 17–42 cubes per depth, a few
milliseconds. Cubes outside a depth's layout are refused (`World.prepare` throws) rather
than collapsed on the fly, which would bring the order dependence back.
`tests/wfc.test.js` covers this.

### Later: an unbounded world

This only works because every depth is bounded (`world/layout.js`): the whole region a depth
can ever need is known up front. Portals that lead off the planned route into endless wilds
would need a different scheme. The plan is a hybrid:

- The planned region still collapses first, in one go. Off-route cubes only ever border
  tiles that are already fixed, so the route stays a function of the seed.
- The wilds pick each **face's** socket from world-space noise fields (rivers as a noise
  contour sampled at cube corners, highland from a threshold field) and derive the cube's
  tile from its four faces. The tile set covers all 81 socket combinations, so this always
  fits, needs no search and does not depend on the order. Where the wilds touch the planned
  region, the region's sockets win.
- Rules that read the layout (`voidAllowed`, cascades, spouts, side portals, guardians)
  need their own order-independent equivalents off the route, e.g. a per-face hash for
  portals.

We tried noise sockets for the planned route too: it made the world coherent at map scale
but dull at room scale. Over 40 seeds, 68% of rooms had the same kind as the room before
(WFC: 46%) and only 28% had mixed edges (WFC: 53%), so it is meant for the wilds only.
Lazily continuing the WFC into the wilds would also work, but then the wilds depend on the
exploration order again; reproducing them would need the collapse order or the tiles saved.

## Faces (`world/faces.js`)

A face is decided once, by whichever of its two cubes is prepared first, and stored under
the cube on its low side. Its layout comes from the face's own random stream.

**Side faces** carry:
- **Ground profile:** 16 levels sampled from world-space noise (`core/wnoise.js`) in the
  socket's height band. Both cubes pin their edge cells to the profile and blend inwards.
- **Corner vertices:** where four faces meet, the vertex gets one height from the four
  sockets there, so corner cells match too.
- **River crossing** (on `W`): all rivers flow at one world level (`RIVER_SURF`), and the
  fluid is fixed per stratum.
- **Portal:** position along the face, layer and level. Layers sit at world-fixed levels
  (`LAYER_BASE = [0, 10, 16, 22]`), so a layer-2 gate lines up on both sides.

**Vertical faces** carry a down/up portal: a well in the upper cube, a ring on the top layer
of the lower cube.

Which faces carry portals is decided by the depth's layout (see below), not per cube.

## Layout: the spiral down (`world/layout.js`)

Which cubes exist and how they connect depends only on the world seed:

- **Depth 0:** the town (0,0,0) and safe merchant camp start a 7–14-room route to the first well.
- **Depths 1–19:** seeded routes through a two-cube-wide ring around the axis. Each route
  contains 7–14 rooms, including the up ring and well. The next route starts below the well.
- **Ring size:** the radius still shrinks with depth (3 → 2 → 1), but route length no
  longer shrinks with it. Bounded path search preserves the room budget on small rings.
- **Depth 20:** the core, with a 7–9-room entry-to-centre route and no further descent.
- **Branches:** optional one-room detours fit within 14 total rooms per depth. No portal
  loops or discovered-face shortcuts can bypass undiscovered route rooms or guardians.
- **Guardians:** every well has a stronger descent guardian (future boss placeholder),
  with one or two mandatory side guardian arenas on its approach.

Layer counts are part of the WFC state. A collapsing cube's count is drawn towards its
neighbours' counts, so tall regions form. A face's portal sits on any layer both cubes
have, half the time the highest one (guardian faces always on the ground). Over 40 seeds
that gives L0 54%, L1 28%, L2 15%, L3 4%.

## Void and relief

- **Void:** a cube may have columns with no ground at all, open to the depth below. This is
  only allowed where the cube below exists in the next depth's layout (`world/voids.js`).
- **How much:** the amount comes from the theme. It is large for the sky islands (depths 1–3)
  and the abyss (19), small for crevasses and sinkholes in between.
- **Shape:** the void field is world-space noise, and face profiles carry `VOID` cells, so
  open areas line up across faces.
- **What stays solid:** portal pads, the ground around them and rivers. Upper slabs over
  void float without pillars.
- **Falling in:** you fall into the cube below (`game/fall.js`) with the vertical slide. You
  come out at the same spot, 5 units over the ground. If it is void there too, you keep
  falling. For now a fall is no way into a cube: the first landing (or leaving the world)
  costs full fall damage (`FALL_DAMAGE`, 60 HP) and puts you back in the cube the fall
  started in, at its last safe spot, or at its entry if the landing killed you.
- **Relief:** themes also have a `relief` that stretches highland faces (up to level ~18 in
  the snowy peaks) and makes hills and plateaus taller.

## Falls into the cube below (`world/cascades.js`, `cubegen/cascades.js`)

- **The look:** a pool in one cube spills over the edge of its void and pours out through
  the bottom of the glass box. In the cube below, the stream comes in through the top of
  the box into a catch pool at the same spot. Falling through the void there lands you in
  that pool.
- **Decision:** the shared vertical face decides it from world data only (void field,
  layout, the face's own random stream), so either cube may be generated first. A fall
  needs:
  - void allowed in the upper cube;
  - a void cell inside the inner 8×8 with solid ground on the side it flows from;
  - a cell at least 5 away from the wells and rings of both cubes and from the upper
    cube's own catch pool.

  Chance 45%. The fluid is the depth's river fluid 60% of the time, otherwise its fluid mix.
- **Upper cube:** forces the void cell open and floods a small pool beside it. Neither gets
  slabs above it.
- **Lower cube:** clears the void around the spot, floods the catch pool and keeps slabs
  off it. The sheet's column is claimed, so no structure crosses it.
- **Open shaft:** the 3×3 around the fall cell (and for inflows around the cell upstream)
  stays free of slabs on every layer, so the water never seems to pass through a floor.
- **Results:** about 7% of cubes, mostly in the sky islands and the abyss. Over 8 worlds,
  all 270 falls have a matching end in the cube below.

## Falls across a side face (`world/spouts.js`, `cubegen/spouts.js`)

- **The look:** a stream on an upper layer of one cube runs to a side face and over it onto
  a short lip in the neighbour. From the lip's inner edge it falls into a pool on the
  ground there.
- **Face record:** the side face holds the spout: `{ pos, layer, from, type }`.
  - Both cubes must exist and have the layer.
  - The spot keeps 5 cells from the face's portal and clear of its river crossing.
  - The ground under the lip lies at least 7 levels below the layer.
  - Falls through the void in either cube keep their shafts.
  - Cave walls open around it.
  - Chance 30%. It has its own random stream, so the other face decisions do not change.
- **Source cube:** a strip of the layer 3 wide and 5 deep from the face, with a channel down
  its middle. The surface is a level under the banks, with a bank at the back.
- **Receiving cube:** a 3×1 lip on its outer ring at the same level, the catch pool just
  inside, and open air between them.
- **Matching edges:** spout slabs are pad-like (`prot` 99: flat, kept, no structures
  through them), so the layer lines up across the face just as at upper-layer portal pads.
  Over 3 worlds, no upper-layer edge cell differs on any of 1943 faces.
- **How many:** about one cube in ten gets one.

## Gorge spans (`world/spans.js`, `cubegen/span.js`)

On the sky-island depths (themes with `spans`, now depths 1 and 2) some rooms are joined by
one long bridge over a valley.

- **The look:** a straight line of cubes. A room at one end, one or two gorge cubes, and at
  the other end the next room on the route or a lonely island. The valley runs across the
  line: a ledge along the room it starts from, a sheer drop to a floor just over the river,
  the far bank. The bridge leaves from a pad at the face and lands on a pad at the far face.
  Between two gorge cubes it rests on a rock pinnacle standing at the shared face.
- **Levels:** every crossing face has a deck level. A span either stays level over the valley
  (headland to headland, levels 10–15) or comes down from the top tier to the ground: a
  headland at level 14–20 (18–22 over two gorge cubes) to a bank at level 4–6. Over two
  cubes the pinnacle stands halfway. A high crossing is a headland: the room's edge rises to
  it, so the bridge leaves from a cliff top instead of a floating slab.
- **Islands:** a branch that goes straight out from a route room: one or two gorge cubes,
  then an island plateau (levels 5–12) in the valley. Nothing else touches the gorge or the
  island, so the bridge is the only way in. The island usually gets the depth's rare reward
  site (sites prefer branch rooms far from the route).
- **Over the sky:** half the spans with no other room beside their gorge (and no room may be
  placed beside it later) cross bottomless sky instead (`sky`): the valley is void, the rock
  pinnacle rises out of nothing and the island floats. The pads stand right at the edge (no
  ground is made solid around them, `portals.js`); falling off is falling out of the world.
- **Planning:** `planSpans` runs on its own random stream after the horde, before branches.
  On the route it looks for straight runs of the spine with one or two inner cubes, none of
  them a guardian or the horde room, gorge cells two cubes apart. A depth gets at most two
  spans (`spans` in the theme: chance, max, route, island). Gorge cubes get role `span`, no
  reward sites and half the population.
- **World:** the WFC pins span cubes before collapsing the depth: one layer, sockets from the
  deck levels (`H` from level 8), `W` on the sides of the gorge cube with the river. They
  never have void and nothing falls into them from above. `spanProfile` (`profile.js`) gives
  the gorge cubes' side faces the valley's cross-section, so the valley runs on into the
  cubes beside it; corners inside the span lie on the valley floor (`spanVertex`). Crossing
  faces get the pad at the deck level (3 cells, ground portals), shoulders a level lower on a
  headland or the island's edge, and the same position along the face (`faces.js`), so the
  bridge runs straight.
- **Generator:** gorge cubes and islands have their own archetypes (`shapeGorge`,
  `shapeIsland`). The valley floor ramps up to low room ends, so falling off never leaves you
  in a pit, and is kept a head's height under the deck. The bridge is not searched for:
  `spanBridge` hands the route search a ready move from pad to pad (both ways), 12 cells
  long and as steep as the levels say. It is placed like any bridge, in one style for the
  whole span (from the theme's weights), with a deeper sag for rope and tall trestles under
  plank and iron. Invisible side rails keep you on it like on every bridge.
- **Discovery as usual:** a span's cubes show only once visited, like every other cube. Each
  crossing is a portal, so the gorge, the far bank and the island come into view one cube at
  a time as you cross.
- **Dev:** `/span [n]` jumps to the start of the world's next (or n-th) span.
- **Checks:** `tests/spans.test.js` covers the plan (straight, in budget, unguarded, islands
  apart), the pads on both sides of every crossing, matching ground on every face of every
  span cube, one bridge per gorge cube clear of the ground, every portal leading on, and the
  same cubes whatever the exploration order; the character walks every bridge both ways and
  pushing sideways halfway across keeps it on the deck. Over 200 seeds all 1274 span cubes and
  their rooms generate, in 1.28 attempts on average.

## Cube archetypes (`cubegen/archetypes.js`)

Every cube gets a big shape on top of the blended ground. The shaping fades out towards the
faces, so the outer ring still matches the neighbours.

| Archetype | Shape |
|---|---|
| plain | nothing extra |
| chasm | a winding split across the cube with raised rims |
| spire | a tall needle on a raised base |
| sinkhole | a round pit with a raised rim |
| archipelago | islands |
| mesa | one big flat-topped block |
| crater | a ring wall around a lake of the depth's fluid |
| gorge, island | only in gorge spans (above) |

Chasms, sinkholes and archipelagos open to the void where the world allows it. Elsewhere
they hold the depth's fluid instead: a river gorge, an acid canal or a lava sea.

The archetype is chosen by the theme's weights (`arche`), scaled by how the WFC kind leans:
highland towards mesa and spire, lake towards archipelago and crater, gorge towards chasm.
The town and its road stay plain. In dev mode, `?arche=<name>` forces one archetype
everywhere.

Structures: a stair never runs right beside a bridge at a similar height, and timber legs
under plank bridges never stand where another structure passes underneath.

## Caves (depth 5 and deeper)

- **Chamber walls:** cave cubes are enclosed by rock walls. A side face's `wall` (in
  `world/profile.js`) is shared by both cubes. Each cube raises its outer ring to the wall
  height (levels 17–23) and the ring inside it to a rough half-height foot.
- **Openings:** walls open around portals and river crossings. Corners come from the shared
  vertex point, so the four faces meeting there agree.
- **Pillars:** one to three rock columns rise to the top level in every cave cube.
- **Walls down:** the faces towards the camera are cut down to just over the character in the
  cutaway shader (`frontWall` in `render/cutshader.js`). The cut rock shows as a flat
  cross-section, like a cutaway model.

## Themes per world (`themes/index.js`, `themes/caves.js`, `themes/depth.js`)

The depths are cut into **slots**. A slot starts at a depth and lasts until the next one, and
offers one or more themes. Every world picks one theme per slot from its seed
(`worldThemes(seed)`, its own random stream per slot, each theme equally likely):

| Depths | Themes (the first is the classic one) |
|---|---|
| 0 | Meadow islands (the town and its road, always) |
| 1–2 | Meadow islands, Cloud kingdom, Lagoon isles, Karst terraces |
| 3 | Snowy peaks, Prayer highlands |
| 4 | Badlands, Salt flats |
| 5–6 | Root caves |
| 7–8 | Frozen caves, Sunken grotto |
| 9–10 | Fungal swamp, Honey hive |
| 11–12 | Spider nests, Ossuary |
| 13–14 | Crystal mines, Dwarven forge |
| 15–16 | Buried ruins, Jungle cenote |
| 17–18 | Volcanic depths |
| 19–20 | Obsidian abyss |

- **Where it is read:** the picks live on the layouts (`world.layout.themes`, each depth's
  `layout.theme`). The worker reads a depth's theme from there (WFC weights, void, relief,
  cave walls, fluids of falls and spouts, reward sites); a spec and its map carry the theme's
  id as `biome` (its prop set), and everything that draws or sounds a map reads it back with
  `themeOf(map)` (palette, props, footsteps, ambience, music, names). The light follows the
  world's picks (`lightAt(depth, themes)`).
- **The rooms stay the same:** the slots' themes agree on `cave`, and what shapes the layout
  (the gorge spans) belongs to the slot, not the theme. So which rooms a world has does not
  depend on its picks, and a world saved before keeps its rooms (it may look different).
- **Same per depth:** the enemy rosters (`DEPTH_SPAWNS`) go by depth, and each alternative
  plays the song of its slot's classic theme for now.
- **Dev:** `?theme=clouds,forge` (with `?dev=1`) picks those themes for their depths.
  `new World(seed, { themes: ['mines'] })` does the same in tests.
- **Checks:** `tests/themes.test.js`: the picks (stable, even, the town always in the meadows),
  every theme complete (structures, arenas, site recipes, its own props), the same rooms
  whatever the picks, and every alternative generating its depths dressed from its own set.

## Themed structures (`themes/builds.js`, `render/bridges.js`)

- **Materials per theme:** each theme (by its prop set) names the stone, wood, rope and iron
  its structures are made of. Stairs, landings, bridges, fences and ladders use shades of
  those. Examples: grey stone and dark wood in the peaks, sandstone in the badlands and
  ruins, mossy wood in the swamp, basalt and iron in the volcanic depths.
- **Bridge styles:**
  - stone arches (only over ground close below);
  - plank bridges;
  - rope bridges: spaced slats, a post at each end, rope hand lines, deeper sag, no legs;
  - iron bridges: a flat girder deck with railings and bracing.
- **Style mix:** each theme weights the styles. Rope bridges are common in the sky islands
  and spider nests, iron in the mines, volcanic depths and abyss, stone in the ruins.

## Ladders and jumps (`cubegen/climbs.js`, `physics/climb.js`)

Routes can now also use these moves:

- **Ladder:** up or down a cliff face of 3–14 levels between neighbouring columns. The
  ladder stands in the lower cell against the higher column's wall.
  - Both floor edges are pinned flat, so the ladder meets them exactly, and fences stay off
    them.
  - The ladder claims the space in front of the wall.
  - You get on by pushing into the wall at its foot, or by walking over the edge above it.
  - Pushing towards the wall climbs, pulling away climbs down, and Space lets go.
  - At the top you step onto the upper floor.
  - There is no climb animation yet: the walk cycle stands in.
- **Jump:** over one or two cells of open drop (or void).
  - The target is at most 1 level higher and at most 2 lower. Over two cells it must be
    exactly 2 lower, for the time in the air.
  - There must be level run-up ground behind the take-off.
  - The air over the gap is claimed, so no structure crosses it.
  - Jumping while moving is a leap of at least 3.4 units/s.
  - Routes keep a take-off waypoint for the test bots.

## Props (`render/props.js`, `render/propplace.js`)

Decoration comes from `assets/props.glb` (133 models), `assets/clutter.glb`
(222 additional models) and `assets/themes.glb` (274 models for the alternative themes, see
[the theme library](assets/themes.md)). Each theme names its prop set (`props`); neutral `any_*` rocks are
tinted with the theme's rock colour. Placement runs on the main thread when a cube's meshes
are built, seeded by the cube. One factor, `CLUTTER` in `core/propcatalog.js` (0.75), scales
every scatter pass below, the guardian arenas' cover and loose things and the town's ground
cover; authored set pieces keep their count.

- **Ground props:** on dry floors without structures, only where they fit under the floor
  above.
- **Blocking props** (trees, boulders, columns): never in or next to route columns or near
  portals. They get round colliders (`map.blockers`) that the player and the spiders respect.
- **Ceiling props:** not placed; slab undersides are never visible from the camera.
- **Wall props:** fit within exposed cliff faces.
- **Cover:** a separate dense, non-blocking pass on dry terrain, including routes and
  slopes; tilted to the floor normal. Glowing cover is emissive only.
- **Shore:** only beside fluids; **water props:** only on matching fluid surfaces.
- **Lip props:** drape over cliff tops with sufficient hanging clearance.
- **Signature assets:** reserved for deliberate destination recipes, not uniform scatter.
  So are the theme library's landmarks (bigger than a cell; reward sites place them, see
  below) and string segments (`line`, which nothing places yet).

They are drawn as one instanced mesh per prop (and per material part), with per-cube
material clones so they fade and get cut with their cube. Props with `sway` bend in the
wind in the vertex shader. Up to six glowing props per cube add light sources for the pool.

## Reward sites (`world/sites.js`, `cubegen/sites.js`)

Each stratum budgets four optional destinations, preferring branch cubes: two basic,
one uncommon, and one rare (occasionally exceptional). Prestige and site identity are
fixed before terrain retries and are independent of asset loading. Larger prestige
reserves more space; difficulty/encounter selection is a separate concern.

The rare (or exceptional) one is built around one of the theme's **landmarks**
(`assets/themes.glb`, see [the theme library](assets/themes.md#landmarks)), chosen with the plan:
the next depth of the same theme gets the theme's next landmark. The site is laid out by the
landmark's role: a shrine with the chest in front of it, a gate with the chest behind it (the
way in leads through), a camp or monument beside the chest. Landmarks face the approach and
stand on quarter turns. Their colliders (boxes derived from the mesh) block the site's cells
the character could not stand on, and of two free neighbours with a wall between them the one
nearer the wall, so the route search only uses ground the character can walk; under a
landmark's overhangs no structure is built. The map gets the colliders, occluders for the
cutaway and `rewardSites[].landmark` (its place, turn and flag anchors). Landmarks also show
in the low-detail surroundings. Over 3 worlds, 56 of 57 landmark sites come about
(`tests/landmarks.test.js`).

Mines have storage rooms, galleries and excavation pits; ruins have burial alcoves,
halls and courtyards. The generator reserves their interior footprints before slabs,
shapes terrain, routes to an interaction approach and back onward, then validates the
final slopes, fences and structural blockers. Required portal routes remain intact.
Upper-layer destinations leave shared rivers and cascade shafts undisturbed.

`map.rewardSites` exposes stable spawn IDs, prestige, setting, reward anchors and
approach/floor records. `sitePlacements` contains deliberate dressing and the sites'
chests, with worker-authored `staticBlockers`. Chests are collidable; clicking one
walks up and opens it, and it spills its loot ([loot.md](loot.md#chests)). Ambient blockers and clutter stay out of these reserved spaces.
Optional placements that cannot fit are reported in `siteFailures`, never downgraded.

See [the generation plan](generation-plan.md) for subsequent biome/district work.
Run `await (await import('./tests/browser/generation.js')).runGenerationChecks()`
in game devtools for real worker, asset, shader and collision checks.

## Generator changes

- Input is a spec (`world.spec(k)`) instead of a seed. Retries vary the seed but never the spec.
- Ground blends from the four face profiles into local detail, hills and plateaus.
- Upper-layer slabs are kept off the outer ring except at portal pads.
- Ramps and pools never modify the outer ring.
- Rivers start at their face crossings and meet at a junction. A lone river ends in a pool;
  lake cubes get a lake.
- Every fluid is walled in: whatever lies next to it reaches its surface, except where a fall
  spills on purpose (`cubegen/contain.js`). Face cells beside a river crossing are never
  void. On the ground, void or low cells next to water become banks (`bankGround`). Ground
  pools keep a dry rim instead of touching other water or the void. Upper pools and stream
  channels thicken their bank slabs down to their own bed, or are skipped. A last pass
  before routing turns any fluid that still stands above its neighbour into ground up to its
  surface (`containFluids`). `tests/fluids.test.js` checks it with the renderer's heights;
  corner smoothing may still sag a bank by up to a level.
- Routing is described in "The way down" below. Moves already used are cheap, so routes
  share paths. Each route is kept for test bots and the path overlay (P).
- Drops are capped at 8 levels (deeper ones ragdoll you) and need an extra level of headroom.
- Lake cubes and half of the underground cubes get floating islands (no pillars).

## Guardian descents

Every descent at depths 0–19 has an amber descent guardian, explicitly marked as a
future boss placeholder. Every approach also has one or two hot-pink sideways guardians.
Their dry arenas contain twice the normal local population. Guardian death alone
permanently unlocks the corresponding red side gate or well for the current run.
Defenders coordinate to intercept the approach while it lives.
See [guardian mechanics, generation and checks](guardians.md).

## The way down (`cubegen/route.js`, `cubegen/reach.js`, `cubegen/escape.js`)

The world guarantees that from anywhere you can arrive, you can get to depth 20.

- **Exits:** the layout gives every cube an exit, the portal one step closer to the well
  down along the depth's portal links (`layout.exit`). The well cube's exit is the well, the
  town's is its road, and the core leads to its centre. Exits depend only on the seed.
- **Routes:** a required route from every other portal (the spawn and the up ring included)
  to the exit, then a best-effort route from the exit back to each portal. Drops and
  downhill jumps are one-way, so a portal may only be reachable from one side.
- **Optional structures:** structures needed only by the ways back or escapes are left out
  when they do not fit, together with the routes that needed them.
- **Final check:** after smoothing and fences, `reachTo` rebuilds what the character can
  physically do:
  - walk level ground and slopes, jump up one level, drop down any cliff without a fence;
  - swim, and climb out of water up to two levels;
  - use the built structures both ways.

  Every portal must reach the exit, and no route may pass a floor whose smoothed corner
  leaves less than the character's height under the slab above. Otherwise the attempt is
  retried.
- **No jump after a drop:** a route never jumps right after dropping the same way, because
  the fall carries you into the gap.
- **Fall landings:** `fallMask` marks where you can fall in from the cube above (its void
  field, a cell wider). Up to six landings there that do not lead to the exit get an escape
  route (stairs, ladders, bridges). The map's `safe` flags mark floors that lead on.
  `fallPoint` moves any dry landing that still does not (sealed pits) to the nearest one
  that does. Landings in a fluid are kept (and fatal), with a dry death entry nearby.
- **Before:** routes ran from the first portal to the others, so drops made them one-way
  in the wrong direction. 7.7% of portals could not reach the way on, and none of 12 test
  worlds could be finished; four of them trapped you in the town. Now 64 of 64 test worlds
  reach depth 20 from the town (Node check over all 21 depths, about 3 ms per cube, 1.07
  attempts per cube on average).

## Cutaway (`game/cut.js`, `render/section.js`, `render/cutshader.js`, `render/ghosts.js`)

- **When and how deep:** rays from the character to the camera find what hides it, and the
  cut height drops just below that (`game/cut.js`).
- **The shape:** a nine-cornered polygon on a circle 2.8 units around the character on
  screen. The corners sit at irregular angles and the shape turns slowly (0.18 rad/s). The
  edge is hard; there is no dither.
- **What gets cut:** everything above the cut height, closer to the camera than the
  character and inside the shape, is discarded.
- **What you see instead:**
  - The back faces of cut solids show as a flat section cap, one colour per kind of solid:
    the rock strata at the cut height, the structure stone or the wood, a little darker than
    a lit floor. One colour keeps the inner faces from reading as a see-through hollow.
  - Fluids get flat caps.
  - What was removed (terrain, structures, props) is drawn again as very faint glass: a
    twin of every cut solid that shares its geometry, draws only inside the cutaway, writes
    no depth and grows a little more opaque at grazing angles, so the shapes read. There is
    one glass material per cube, because fading patches materials per cube.

## Travel and what you see (`game/travel.js`)

Walking into a portal does not cut to black. The next cube is built beside the current one
(or `CUBE_H + BASE` below or above it). Both slide past the fixed camera while the
character walks through the gate, falls down the well or rises up the ring.

Wells down and rings up have to charge first: the player must stay in the circle for
0.75 s going down or 1.5 s going up (`portalChargeDuration`, `game/portals.js`) while a
white bar fills over the portal (`render/portalbar.js`). Stepping out resets the charge.

The new cube is active from the first frame. The player moves in its coordinates plus the
slide offset, so when the slide ends the offset is zero and nothing jumps. The section cut
is off during the slide.

A side portal into a cube that is not drawn yet (no low-detail proxy on screen) would have
the character walk over nothing until the new cube fades in. Instead a dark blue cloud
spills out of the gate as the travel starts (also covering a cube still generating). The
new cube then fades in 0.4 s later than usual (`CLOUD_DELAY`): the walk keeps its pace and
the character waits on the cloud for that long. The cloud dissolves over 0.45 s once a
quarter of the new cube is there, if need be after the slide has ended
(`render/portalcloud.js`). Cubes whose proxy is visible cross-fade on their own and get no
cloud.

Respawn entries are separate from live crossing positions: airborne crossings still
preserve height and motion, but their saved entry is snapped to dry, supported ground
(`physics/respawn.js`). Death, recovery and returns from falls revalidate the point,
including body clearance and support around the feet. Unsafe entries move to the
nearest valid floor or structure rather than repeating a fall through the void.
Run `await (await import('./tests/browser/respawn.js')).runRespawnChecks()` to check
void/non-finite entries and both death and recovery after a fall.

### Town portal (`game/townportal.js`)

The Town Portal Scroll (quick bar slot 1) opens a two-way portal to town:

- **Casting:** using it starts a 5 s cast (`CAST_TIME`, `core/townportal.js`). A violet bar
  floats over the player and fills the scroll's quick bar slot. Moving, jumping, a mouse order,
  attacking, taking damage, being knocked over, falling, swimming, climbing, travel, opening the
  inventory or using the scroll again cancels it. It cannot be cast in town; anywhere else
  (merchant camp and guardian rooms included) it can.
- **The pad:** a finished cast opens the portal on free ground around the player, best 1.6
  cells in front, else nearer, farther (up to 2.7) or to the side, down to right beside them
  (just out of its trigger; `padOffsets`, `core/townportal.js`). Its whole disc (radius 0.62)
  must be dry, flat, supported, on the player's level, off the cube's own portal pads and
  reachable in a straight line, so a 1.5 x 1.5 cell spot is enough. The room is checked when
  the scroll is used: if nowhere fits, "No room for a portal here" and no cast starts (and
  again when the cast ends). The run keeps one portal, `run.townPortal = { key, depth, pad, back }`, where
  `back` is the exact spot the player cast it from. Casting again moves it.
- **Town end:** the town plan reserves a fixed spot for it, east of the plaza
  (`TOWN_PORTAL_SPOT`, `world/town.js`, rotated with the exit). Clutter keeps off it and town
  generation checks that it is dry and reachable (`map.town.portal`).
- **Going through:** either end works like a well. Stand in it for 1 s (with the white charge
  bar) and the screen fades (no slide, the cubes are not neighbours). You arrive in town 1.4
  cells from its end, towards the plaza, and the portal stays open. Through the town end you
  arrive exactly where you cast it, and **both ends close**. Each arrival starts a new visit
  (`enterCube(c, null, null, at)`), so a death respawns you at the arrival point.
- **Drawing:** `render/markers.js townPortalFx` draws a violet swirl under a light column. It is
  added to a built cube (`render/world.js setTownPortal`) on casting, rebuilds and travel,
  fades with its cube and uses a pooled light. Respawn points keep off it. The minimap shows a
  violet dot at both ends and "portal open: depth N".
- A new world (`N`) closes it.

Run `await (await import('./tests/browser/townportal.js')).runTownPortalChecks()` to check the
quick bar, assignment, the cast and its interruptions, both trips and closing.

### Opened side connections

A shared side face opens as soon as the cubes on both sides have been discovered
(`discoveredFaces` in `core/boundaries.js`), whether or not it has a gate or that gate
has been crossed. Neighbouring rooms reached by different routes can be walked between.
Opening is tracked explicitly by `faceKey` for the current world. A progression section
is a route room plus its branches (`routeIndex`). Two sections without a portal between
them join only over ground already covered (`sectionsJoined`): every route room between
them discovered, and none of their forward exits still guarded. So a route that bends
back alongside itself opens up once walked, but rooms first reached by a fall or the town
portal cannot skip unseen rooms or guardians. Locked guardian faces never open through
discovery. Discovering a cube or unlocking a gate re-checks every discovered cube, since
either can join sections elsewhere. On an opened face both gates and both dividing glass
panes disappear; cube outlines remain. Re-entry, mesh rebuilds and low-detail proxies use
the same opened-face state.

An opened side face triggers the same cube slide wherever the player approaches it,
regardless of the original portal's position or layer. The arrival preserves the
position along the face, height and motion, with the body placed a little inside the
next cube. Destination solids still block passage. A boundary lock prevents immediate
bounce-back. The minimap marks opened connections as green lines along their faces;
unopened portals retain gold/cyan markers, or red crossed seals while guardian-locked.

Cubes remain separate simulation spaces: player collision is cube-local, and enemies
cannot cross their boundaries. Generation, portal metadata, routing and arrival-safety
logic are unchanged; opened connections simply add paths. Down/up travel always uses
portals, except falling through voids, and never opens a side connection. Starting a
new world clears all opened faces.

Checks: `npm test` includes shared-face identity, full-face triggering, arrival
coordinates and enemy containment. From the browser's devtools, run
`await (await import('./tests/browser/boundary.js')).runBoundaryChecks()` for
all four side orientations, rendering/revisits, airborne travel, blocked destinations,
generation failure, reset, gated neighbours discovered by another route and vertical travel. `runModifierKeyChecks()` in that
module checks the Ctrl (walk) and Shift (auto-attack) modifiers and input clearing; the movement
ramp and auto-attack themselves are checked by `runControlChecks()` in `tests/browser/combat.js`.

While sliding, the old cube dissolves out and the new one dissolves in (`render/fade.js`).
The dissolve is an ordered-dither discard per cube, so depth and sorting stay intact.

The cube you leave cross-fades into its low-detail proxy, and the cube you enter out of
its proxy (if you had been there). The two use complementary dither patterns, so one draws
exactly the pixels the other drops. Every cube, full or proxy, sits in its own glass box
(`render/glass.js`) that moves and fades with it (`game/travelfx.js`), with panes omitted
on opened side connections.

The minimap and the low-detail surroundings only show cubes you have visited; prefetching
never discovers a cube. Surroundings include diagonals and distant cubes on the active
stratum, within 48 world units (three cube widths) of the player's horizontal position.
Distance is measured to cube bounds, with an eight-unit dither fade at the outer edge.
`core/viewdistance.js` holds the radius and discovery selection.

`render/neighbors.js` merges terrain/wood and fluids into render-only proxies, without
props, enemies, lights or shadows. Whole-cube bounds are frustum-culled after the camera
updates, including both sets during travel; fully fogged cubes are skipped too. A separate
culling parent preserves travel's fade visibility. Foreground proxy solids/fluids use the
screen-space cutaway region to reveal the player, independent of the active cube's cut
height; this reveal is disabled during travel.

Merged proxy geometry uses an LRU cache keyed by worker geometry identity, with a
64-entry / 32 MiB budget. Live proxies pin their geometry (so the live set can exceed the
budget); unused entries are evicted and world resets clear the cache. Each proxy retains
independent materials for fades. Refreshes and travel reuse overlapping proxies rather
than merging/drawing duplicate geometry or fading the surroundings out and back in.

Checks: `npm test` covers discovery, stratum filtering, conservative selection and distance
fades. Run `await (await import('./tests/browser/neighbor.js')).runNeighborChecks()`
for geometry/material ownership, refresh/revisit reuse, opened panes, frustum rotation,
distance culling, fade isolation, shader compilation, travel rebasing and cache eviction.
`runExpandedTravelChecks()` in the same module verifies continuous proxy reuse and cleanup
during real travel through a fully explored stratum.

## Off the main thread (`world/worker.js`, `world/client.js`)

The world lives in a module worker. That covers WFC, faces, map generation and the cube
geometry (`render/cubegeo.js`, which builds typed arrays per layer). The main thread
receives each map by structured clone (the object graph survives) and the geometry as
transferred buffers, and only wraps them into meshes. The surroundings view merges those
buffers once per cached cube; the merged arrays are additional memory.

After entering a cube, the cubes behind its portals are prefetched, so travel usually
starts at once. If a cube is not ready, the player waits in the portal and a
"generating" spinner shows.

Point lights come from a fixed pool (`render/lightpool.js`). A changing light count made
three.js recompile every lit shader on each cube change, which was the biggest stutter.

## Results

- **Edge continuity:** over 400 face pairs, ground height and fluid match on every edge cell,
  corners included. Slab presence and portal positions match too.
- **Generation:** about 3 ms per cube. Over 1000 cubes, most succeed on the first attempt
  and the worst took 5.
- **Routes:** a bot walks every route (portal to exit, the ways back, escapes). 1487 of
  1488 routes pass (780 cubes, 40 worlds).
- **Rendering (original four-neighbor baseline):** active cube plus four low-detail
  neighbors at 60 fps, 57 draw calls. Expanded surroundings are distance/frustum/fog culled;
  draw count now depends on exploration, camera orientation and zoom.

## Known issues / open questions

- **Stuck route:** 1 cube in 1000 has a route the character cannot walk. Corner smoothing
  pulls a slab corner below its own underside. This is an old smoothing quirk that the
  world-fixed layer levels make a bit more likely.
- **Corner vertices:** the height rule ("H if more than two of the four sockets are H") is
  arbitrary. Highland corners can show small dips.
- **Vertical portals:** they only need to line up loosely; a pad that would overlap another
  portal moves to a free spot in that cube.
- **Not persisted:** spiders respawn when you re-enter a cube. Nothing is saved to disk.
- **Not visible yet:** depth has no look of its own (fog, darkness, palette); only the
  river fluid changes.
