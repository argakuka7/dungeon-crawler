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

On every depth but the town and the core, some rooms may be joined by one long bridge over a
valley. How often, and how, is up to the depth's theme (`spans` in `themes/index.js`): most
often on the sky islands, the peaks and the badlands, now and then in the caves.

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
- **Over the sky:** some of the spans with no other room beside their gorge (and no room may be
  placed beside it later) cross bottomless sky instead (`sky`: half of them on the meadows, more
  over the clouds, fewer in the lagoons, none on the ground of the badlands or in the caves but
  the abyss): the valley is void, the rock pinnacle rises out of nothing and the island floats. The pads stand right at the edge (no
  ground is made solid around them, `portals.js`); falling off is falling out of the world.
- **Planning:** `planSpans` runs on its own random stream after the horde, before branches.
  On the route it looks for straight runs of the spine with one or two inner cubes, none of
  them a guardian or the horde room, gorge cells two cubes apart. A depth gets at most `max`
  spans (`spans` in the theme: chance, max, route, island, sky, deck; two on the surface, one in
  a cave). Gorge cubes get role `span`, no reward sites and half the population.
- **In the caves:** the faces carry the caves' rock walls (17–24 levels high), so the decks stay
  lower there (`deck`: at most level 15 instead of 22); the headlands and the top tier scale
  down with it.
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
  in a pit, and is kept a head's height under the deck. Where a river's bank has to come up
  under a low deck anyway, no way of the route search leads onto or off it. The bridge is not
  searched for: `spanBridge` hands the route search a ready move from pad to pad (both ways),
  12 cells long and as steep as the levels say. It is placed like any bridge, in one style for
  the whole span (from the theme's weights), with a deeper sag for rope and tall trestles
  under plank and iron. Invisible side rails keep you on it like on every bridge.
- **Discovery as usual:** a span's cubes show only once visited, like every other cube. Each
  crossing is a portal, so the gorge, the far bank and the island come into view one cube at
  a time as you cross.
- **Dev:** `/span [n]` jumps to the start of the world's next (or n-th) span.
- **Checks:** `tests/spans.test.js` covers the plan (on every depth but the town and the core,
  straight, in budget, unguarded, islands apart, sky and deck as the theme says), the pads on both sides of every crossing, matching ground on every face of every
  span cube, one bridge per gorge cube clear of the ground, every portal leading on, and the
  same cubes whatever the exploration order; the character walks every bridge both ways and
  pushing sideways halfway across keeps it on the deck. Over 200 seeds all 4472 span cubes and
  their rooms generate, in 1.26 attempts on average (over 1000 seeds, all 22965).

## Big heights: tablelands, pinnacles, great shafts (`world/heights.js`, `cubegen/heights.js`)

Planned with the layout from the seed alone, on their own random stream (after the spans,
before the branches), as often as the theme says (`heightsOf`: `heights` in the theme can
override the defaults; the canyon has more).

- **Tableland:** three rooms in a row on the route (never its ends, nothing guarded, no horde,
  not beside a span), at most one per depth:
  - **ascent:** you come in at the foot of an escarpment. A shelf at the shelf level `hi`
    (17–20 under the sky, 13–15 under rock walls) runs along its far side to the plateau; the
    cliff stands at `cu` along the way through, often with a terrace halfway up along part of
    it. The route climbs it with stairs and ladders.
  - **plateau:** high ground all round, a few knolls.
  - **descent:** down from the plateau's edge, one of three:
    - **plunge:** a soft landing (3 by 2 cells, the theme's `soft` colour: hay, sand, snow,
      moss, web, ash) right under the edge, 11 or more levels down. The route leaps
      (`drop` onto a `soft` floor, any depth; `plunge` on the move when deeper than an
      ordinary drop). Landing on something soft never hurts or knocks you over
      (`landingSpeed` in `physics/move.js`). A ladder usually stands beside it for the way
      back.
    - **great shaft:** a hole (radius 2.6–3.2) open to the depth below, a ramp winding down
      round it from the plateau's side (the long way round, railed) to a cut leading out to
      the exit, and a rim up high everywhere else. Nothing may cross the hole (`noCross`: no
      stairs, bridges, landings or jumps over it). Only where the depth below has an ordinary
      room right under it (`shaftOf`); otherwise the planned shaft becomes a plunge. That
      room gets a dry, flat basin under the hole (`shaftBottom`), knows you may fall in there
      (`fallMask`), and is drawn under the shaft as a proxy before it is visited, so you look
      down into it (`visitedNeighbors`, `dy: -1`). Falling in is a fall into the cube below
      like any other.
    - **stairs:** a cliff with a terrace, climbed down like the ascent is climbed up.
  - **faces:** the plateau's faces are all at `hi` (and its corners), so the pads between the
    three rooms are up there. The ascent's and descent's side faces carry the escarpment's
    cross-section, so the cliff runs on into the rock beside them; the faces the route comes
    in and goes out by keep their own profile, and where they are side faces a cove opens at
    the foot of the cliff round the pad. The WFC pins the three cubes with one layer (high
    sockets towards the plateau). No void, no branches off them.
  - **the route:** in a plunge's or a shaft's descent, every other way down off the shelf
    costs 40 more, so the route leaps or winds down the ramp (`descentRoute`).
- **Pinnacle:** in one of the depth's discovery rooms (a reward site not built round a
  landmark; no river), a needle of rock: a top of radius 2.3 (19–21 levels under the sky,
  14–16 under rock walls, and at least ten over its foot), a railed ramp once round it, a flat
  ring at its foot. The reward site is its top. Stairs, ladders and bridges onto the needle
  cost 40 more, so the way up winds round it (`pinnacleRoute`).
- **Kept cells:** what these shapes depend on (`ctx.keep`) gets no slabs, sites, hordes, pools
  or stream falls.
- **Dev:** `/height <ascent|plateau|descent|shaft|pinnacle|tunnel>` jumps to the next one.
- **Checks:** `tests/heights.test.js`: the plan (seeded, on the route, clear of guardians,
  hordes and spans, no branches), the faces (the plateau high all round, the pads up there,
  the same whichever cube decides them), every tableland of 8 worlds generating with the route
  climbing, crossing and coming down (leaping onto something soft in a plunge), the shaft's
  open hole, its ramp and the dry basin below, the pinnacle's site on top reached by the ramp,
  and the character landing softly after a plunge.

## Tunnels (`cubegen/tunnel.js`)

A short tunnel the way leads through: a ridge of rock across the cube, between the two portals
farthest apart (one on the ground), with a passage two cells wide and 3–6 long bored through
it at ground level and a flat apron at each mouth. In caves and canyons the ridge runs from
wall to wall, so the tunnel is the way; on the surface it falls away towards the faces, a hill
with a tunnel. 25% of the cubes on the surface, 40% under rock walls (45% in the canyon) may
get one: not in the town, guardian arenas, spans, height pieces, horde rooms, or where rivers
run, falls come or go, or spouts pour; and only where the ridge fits clear of the pads.

- **The roof** is a floor of its own (`roof`, layer 0) over the passage floor, solid from two
  units over it (`ROOF`, 4 levels) up to the ridge's top. The character walks under it; the
  cutaway takes it for a slab (`game/cutinfo.js`) and opens it around you.
- **Nothing in the way:** no structure stands in the passage or on the aprons (`noCross`),
  slabs and pools keep off the ridge.
- Over 3 worlds, more than half the tunnels lie on a route (the others are passed by a route
  on another layer).

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
| ascent, plateau, descent, pinnacle | only for the big height pieces (above) |

Chasms, sinkholes and archipelagos open to the void where the world allows it. Elsewhere
they hold the depth's fluid instead: a river gorge, an acid canal or a lava sea.

The archetype is chosen by the theme's weights (`arche`), scaled by how the WFC kind leans:
highland towards mesa and spire, lake towards archipelago and crater, gorge towards chasm.
The town and its road stay plain. In dev mode, `?arche=<name>` forces one archetype
everywhere.

Structures: a stair never runs right beside a bridge at a similar height, and timber legs
under plank bridges never stand where another structure passes underneath.

## Caves (depth 7 and deeper) and the canyon (5–6)

- **Chamber walls:** cave cubes are enclosed by rock walls. A side face's `wall` (in
  `world/profile.js`) is shared by both cubes. Each cube raises its outer ring to the wall
  height (levels 17–23) and the ring inside it to a rough half-height foot.
- **Openings:** walls open around portals and river crossings. Corners come from the shared
  vertex point, so the four faces meeting there agree.
- **The canyon:** its theme has `walls`: the same rock walls along the faces (`walled` on the
  spec and the map), under the open sky. The route winds through a sandstone gorge.
- **Pillars:** one to three rock columns rise to the top level in every cave cube.
- **Walls down:** the faces towards the camera are cut down to just over the character in the
  cutaway shader (`frontWall` in `render/cutshader.js`), in caves and canyons (`map.walled`). The cut rock shows as a flat
  cross-section, like a cutaway model.

## Themes per world (`themes/index.js`, `themes/caves.js`, `themes/depth.js`)

Every theme names the depths it may appear at (`depths`: first and last). Every world picks
one theme per depth from its seed (`worldThemes(seed)`, its own random stream per depth): with
`STICK` (0.55) a depth keeps the theme of the depth above if that one may appear there too,
otherwise it picks again, each of the depth's themes equally likely. So themes come in
stretches of a few depths, and a world may go from the meadows to the lagoons halfway down.
The town's meadows (depth 0) do not carry over. The picks are kept as stretches
(`[{ at, theme }]`, each lasting until the next).

| Depths | Themes |
|---|---|
| 0 | Meadow islands (the town and its road, always: `TOWN`) |
| 1–2 | Meadow islands, Cloud kingdom, Lagoon isles, Karst terraces |
| 3 | Snowy peaks, Prayer highlands |
| 4 | Badlands, Salt flats |
| 5–6 | Deep canyon (walled in like a cave, under the sky) |
| 7–8 | Root caves |
| 9–10 | Frozen caves, Sunken grotto |
| 11–12 | Fungal swamp, Honey hive |
| 13 | Jungle cenote |
| 14–15 | Spider nests, Ossuary |
| 16 | Crystal mines, Dwarven forge |
| 17 | Buried ruins |
| 18 | Volcanic depths |
| 19–20 | Obsidian abyss |

- **Where it is read:** the picks live on the layouts (`world.layout.themes`, each depth's
  `layout.theme`). The layout reads a depth's gorge spans from it; the worker reads the rest
  from there (WFC weights, void, relief, cave walls, fluids of falls and spouts, reward sites);
  a spec and its map carry the theme's id as `biome` (its prop set), and everything that draws
  or sounds a map reads it back with `themeOf(map)` (palette, props, footsteps, ambience,
  music, names). A map without a theme is a bug: `themeOf` throws. The light follows the
  world's picks (`lightAt(depth, themes)`, blended between the starts of the stretches); with no
  world yet (the menu before its first cube) it is the town's.
- **Light in three bands:** light under the sky (0–6), medium in the sunlit caves (7–13), dark
  in the deep (14–20). Each theme's `light` belongs to its band; its `lamp` (0, about a half, 1)
  sets how bright the character's own light is (`render/look.js`).
- **What the theme changes:** the themes of a depth agree on `cave`. The route, its guardians
  and hordes depend on the seed alone; the gorge spans (and with them where the branches go)
  are the theme's.
- **Same per depth:** the enemy rosters (`DEPTH_SPAWNS`) go by depth, and the themes added later
  play the song of the first theme of their depths for now.
- **Dev:** `?theme=clouds,forge` (with `?dev=1`) makes those themes win every depth they may
  appear at. `new World(seed, { themes: ['mines'] })` does the same in tests.
- **Checks:** `tests/themes.test.js`: the picks (stable, even per depth, in stretches as often as
  `STICK` says, every theme coming up, the town always in the meadows), every depth's themes
  agreeing on `cave`, every theme complete (depths, structures, arenas, site recipes, spans,
  its own props), the same route whatever the picks, and every theme generating its depths
  dressed from its own set.

## Themed structures (`themes/builds.js`, `render/bridges.js`)

- **Materials per theme:** each theme (by its prop set) names the stone, wood, rope, iron and
  (where it builds ice bridges) ice its structures are made of. Stairs, landings, bridges,
  fences and ladders use shades of those; natural rock arches take the ground's own rock and
  grass. Examples: grey stone and dark wood in the peaks, sandstone in the badlands and
  ruins, mossy wood in the swamp, basalt and iron in the volcanic depths.
- **Bridge styles** (`BRIDGE_STYLES`):

  | Style | Look | Where |
  |---|---|---|
  | `stone` | arched deck with parapets, piers between the arches | dry ground close below; never over the sky |
  | `plank` | sagging planks, posts with rope rails, timber legs | anywhere |
  | `rope` | spaced slats, a post at each end, rope hand lines, deep sag, no legs | anywhere |
  | `iron` | flat girder deck, railings, bracing | anywhere |
  | `log` | three logs side by side reaching onto the banks, lashed, a rope hand line | ordinary bridges of 1–4 cells, never a span |
  | `chain` | plank deck hung by rods from two chains between iron towers | 3 cells or more, room for the towers over both ends |
  | `ice` | a slab of ice, shards along its edges, icicles under it | anywhere |
  | `rockarch` | one rough natural arch of the ground's rock, grass on top, its feet on the ground | like `stone`; on a span only a level one |
  | `flags` | a rope bridge with tall poles and strings of prayer flags along and across it | room for the poles over both ends |

- **Style mix:** each theme weights the styles (`BUILDS[theme].bridges`):

  | Theme | Bridges | Theme | Bridges |
  |---|---|---|---|
  | meadow | stone 1, plank 1, rope 1, log 2 | roots | log 3, plank 1, rope 1, stone 1 |
  | clouds | rope 3, chain 1, stone 1 | frozen | ice 3, stone 1, plank 1 |
  | lagoon | plank 2, rope 2, log 1 | grotto | plank 1, rope 1, rockarch 2, log 1 |
  | karst | stone 2, rockarch 2, plank 1, rope 1 | swamp | log 2, plank 2, rope 1 |
  | peaks | stone 2, rope 1, flags 1, chain 1, ice 1 | hive | plank 2, rope 1, stone 1 |
  | highlands | flags 3, rope 1, stone 1, log 1 | cenote | rope 2, stone 1, log 1, rockarch 1 |
  | badlands | plank 2, rockarch 2, stone 1, rope 1 | nests | rope 3, plank 1 |
  | saltflats | plank 2, stone 1, rockarch 1 | ossuary | stone 3, plank 1 |
  | canyon | rope 2, plank 1, rockarch 2 | mines | plank 2, iron 2, chain 1, stone 1 |
  | ruins | stone 3, plank 1 | forge | iron 2, chain 2, stone 1 |
  | volcanic | iron 2, rockarch 2, chain 1, stone 1 | abyss | iron 1, chain 2, stone 2 |

- **Where a style may go:** `BRIDGE_STYLES` (`themes/builds.js`) says for each style what it
  sounds like underfoot, how far it sags, what holds it up (piers, timber legs or nothing) and
  where it fits: only over dry ground close below (arches), across the open sky or not, on a
  span or not (and only a level one), how long an ordinary bridge it makes, and how high its
  towers or poles stand. Those only go where nothing is over both ends (`roomOver` in
  `cubegen/shape.js`: no floor, structure or landmark overhang); a span's cubes have one
  layer, so nothing is over a span's ends. A bridge picks among the theme's styles that fit,
  by weight (plank if none does); the generator, the span planner and the footsteps all read
  the same table. Bridges of any style may cross lava.
- **Dev:** `?bridge=<style>` (with `?dev=1`; `new World(seed, { bridge })` in tests) builds
  every bridge in that style wherever it fits. `/bridge [style] [depth]` stands you at the
  next bridge (of that style) from this depth (or that one) on down.
- **Checks:** `tests/builds.test.js`: every style has a builder and a surface, every theme
  has a style that fits wherever a bridge goes, picks keep to the styles that fit, the new
  styles only where they fit in generated worlds (lengths, spans, room for towers, no legs)
  and drawn, and themes building their own (logs in the roots, ice in the frozen caves,
  flags in the highlands).

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

### Getting unstuck (`physics/unstuck.js`, `game/roomportal.js`)

- **Wedged:** the controller should never walk the body into anything, but knockbacks, gusts,
  ragdolls, moving villagers, jumps into low blockers and concave corners (the rim probes of
  `canMove` can leave the body overlapping two walls, so every move fails) still wedge it.
  The body counts as wedged with something solid through its middle (`blockedAt` up to 0.45,
  so a low ceiling over the head does not count) or when it cannot move 0.06 in any of the
  four directions. Not while rising or falling, on a ladder, in a ragdoll, between cubes or in
  a fall through cubes. After 0.3 s (`WEDGED_TIME`) it is put on the nearest spot it stands
  freely on, within 2 cells, on its level, a step up or on top of what it is stuck in (1.5 up
  or down at most), preferring floors that lead out of the cube (`map.safe`); with none of those
  close by, at the last safe spot; failing that the nearest free spot at all. No countdown
  and no message.
- **The last safe spot** (`player.safe`, `physics/hazards.js`) is only taken from floors that
  lead out of the cube (`map.safe`), never from the bottom of a pit.
- **Room Portal Scroll** (quick bar slot 6, bound, never used up): the way out of a place you
  cannot leave on foot. Using it starts a 3 s cast (`ROOM_PORTAL_CAST`, `core/items.js`) that
  moving, jumping, a mouse order, attacking, taking damage, being knocked over, travel,
  opening the inventory or using it again cancels, as does falling more than 1 or drifting
  more than 1 cell away. Unlike the town portal it needs no firm ground (it works in a pit,
  on a ladder, or wedged), and it works in town and houses too. Then the screen fades and you
  stand where you came into this cube (`state.arrival`), with your health and conditions as
  they were; the cube is not reset as on a death. Portals and open faces at the arrival point
  wait until you step out of them (`lockPortalsHere`).

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
never discovers a cube. The one exception is the room under a great shaft, seen through its
hole a stratum down (see "Big heights"; `runShaftViewChecks()` in `tests/browser/neighbor.js`). Surroundings include diagonals and distant cubes on the active
stratum, within 48 world units (three cube widths) of the player's horizontal position.
Distance is measured to cube bounds, with an eight-unit dither fade at the outer edge.
`core/viewdistance.js` holds the radius and discovery selection.

A cube is drawn from parts (`render/parts.js`): terrain, structure stone, wood, a surface per
fluid and the falls of each fluid. The worker packs each part once: merged over the layers,
indexed and quantized (Int16 positions at 1/1024 units, Int8 normals, Uint16 colours, all padded
to four components): about 20 bytes a vertex and 1.6 vertices a triangle instead of 36 bytes and
three. The active cube (`render/partmeshes.js`) and its proxy draw the same parts, and both take
their materials from one table of looks (`render/materials.js`: 'full' is PBR, cut, shadowed and
animated, 'proxy' is Lambert and darker). So lava stays lava and acid stays acid out there,
falls pour there too, and a new part or fluid shows in both or neither.

`render/neighbors.js` draws every proxy as instances in shared `BatchedMesh`es, one per part
plus one for all landmarks (the only props shown; their glowing parts still glow), without
enemies, lights or shadows. Every proxy's glass box is one instanced draw for the panes and one
for the outlines (`render/glass.js glassBatch`). All the surroundings take at most a dozen draw
calls, however many cubes they are. A proxy's fades (travel dissolve, inverted cross-fade and
distance) live per instance in a small data texture of each batch; its `group` is a stand-in
holding those values and the position travel moves, and `cullNeighbors` writes them into the
batches once a frame (disposing proxies writes at once too: the main menu draws without culling,
and the glass of a world just left must not stay). Whole-cube bounds are frustum-culled there after the camera updates,
including both sets during travel; fully fogged cubes are skipped too. Proxy solids and fluids
use the screen-space cutaway region to reveal the player, independent of the active cube's cut
height; this reveal is disabled during travel. Proxies are pushed back a little in depth
(polygon offset): a cube and its neighbour both have a cliff wall on their shared face, and the
proxy's must lose there, or it fights the section caps seen through a cut. Lava pulses in proxies as in the cube you are in;
the falls' textures stream in both.

Proxy geometry uses an LRU cache keyed by worker geometry identity, with a 64-entry / 32 MiB
budget (of packed parts). Live proxies pin their geometry (so the live set can exceed the
budget); unused entries leave the batches and world resets clear the cache. Batches compact
their space before they grow. Refreshes and travel reuse overlapping proxies rather than
uploading duplicate geometry or fading the surroundings out and back in.

Checks: `npm test` covers discovery, stratum filtering, conservative selection, distance
fades and the parts (`tests/parts.test.js`: every builder layer is a part, packing keeps every
triangle in place, falls, transfer). Run `await (await import('./tests/browser/neighbor.js')).runNeighborChecks()`
for shared batches and geometry, per-proxy fades, fluid looks, refresh/revisit reuse, opened
panes, frustum rotation, distance culling, fade isolation, shader compilation, travel rebasing
and cache eviction. `runExpandedTravelChecks()` in the same module verifies continuous proxy
reuse and cleanup during real travel through a fully explored stratum, and
`runPartParityChecks()` that every cube generated so far draws the same parts full and as a
proxy. `runProxyIntegrityChecks(trips, explore)` travels sideways, down and up (through explored
or new cubes) and jumps between cubes, checking after each step and while sliding that only
discovered cubes of the live sets are drawn, each instance active with its own geometry, placed,
faded and shown as its proxy, the batches' draw lists and contents match, the glass boxes are
exactly the shown proxies', and nothing stays drawn after leaving the world.

## Off the main thread (`world/worker.js`, `world/client.js`)

The world lives in a module worker. That covers WFC, faces, map generation and the cube
geometry (`render/cubegeo.js` builds typed arrays per layer, `render/parts.js` packs them into
parts). The main thread receives each map by structured clone (the object graph survives) and
the parts as transferred buffers, and only wraps them into meshes; the proxies' batches copy
them once per cached cube.

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
