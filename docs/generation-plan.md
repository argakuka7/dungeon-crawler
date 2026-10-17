# Generation plan: deliberate destinations and deeper-biome variety

Status: first implementation slice complete. Library integration, attachment passes,
seeded site budgets, worker-safe collider metadata, reward-site routing, chest previews,
and the six mine/ruin settings are implemented. Broader biome layouts, multi-cube
districts, encounters, chest interaction and loot population remain follow-up work.

## Goal

Generate the importance of a destination first, then build a place that deserves
it. Deeper biomes should differ in spatial organization, traversal and coherent
asset arrangements—not merely palette, darkness and randomly scattered props.

A destination is a **reward site**, not a chest position. It may eventually host a
chest, shrine, resource cache, special encounter or other discovery. Its setting
and approach should work before reward gameplay is implemented.

## Available assets

- `assets/props.glb`: 133 existing decoration models, already loaded.
- `assets/clutter.glb`: 222 additional models (111 types, two variants), now loaded.
- Clutter covers 11 biomes, neutral `any`, and cave-wide storytelling `relics`.
- Existing item exports include an animated (Open/Close) treasure chest, potions and gemstones.

The new library provides ground cover, shoreline props, cliff-lip drapes and
fluid-surface props, plus substantial destination dressing. Preserve its
`cover`, `shore`, `fluid` and `drop` metadata in addition to existing prop hints.
See [the clutter inventory](assets/clutter.md) for the full contract.

## Destination contract

Assign site intent at the world-layout/spec level, independently of generation
retries and asset-loading timing. Suggested fields:

- Stable `id`, derived from world seed, cube key and site slot—not floor IDs.
- `prestige`: basic, uncommon, rare or exceptional.
- Biome-specific setting/template and intended role.
- Approach requirements: detour, ascent, crossing, descent or chamber sequence.
- Optional encounter profile, separate from prestige.
- Reserved reward anchor, approach space and dressing footprint.

Generation emits the realized anchor, approach, placements and relevant gameplay
metadata. Reward selection happens separately and can remain absent initially.
Prestige is not the existing asset `priority` field, which only controls scatter
weights. Prestige also does not imply difficulty: an exceptional sanctuary may
be peaceful, and a dangerous room need not contain premium treasure.

| Prestige | Spatial investment |
|---|---|
| Basic | Small alcove or short side branch |
| Uncommon | Distinct side room, raised shelf or modest crossing |
| Rare | Dedicated approach, recognizable reveal and framed destination |
| Exceptional | Landmark organizing much of a cube; multi-cube treatment later |

Important sites should often be visible before accessible: hint → approach →
payoff. Use geometry, lighting and asset arrangements to communicate significance,
not a required UI rarity marker. Do not measure quality by distance alone.

## Asset placement: two complementary systems

### Ambient clutter

Use restrained, spatially coherent scatter for gravel, litter, moss, chips,
vegetation and other background detail. Add dedicated passes for:

- Cover on suitable dry terrain and supported route surfaces; avoid floating or
  intersecting pieces on slopes and structure decks.
- Shore props on dry ground adjacent to an appropriate fluid.
- Water props at the matching fluid surface, respecting clearance.
- Lip props at cliff tops with sufficient hanging clearance.
- Low-weight cave relics where context permits.

Glowing cover is emissive only; it must not consume the point-light budget.

### Deliberate arrangements

Use named recipes for recognizable compositions. Keep signature props out of
unrestricted scatter initially: altars, ritual circles, weapon graveyards,
collapsed arches, frozen adventurers, and similar storytelling focal points.
Assign them to site or encounter recipes; they are not all rare by definition.

| Setting | Useful existing/new dressing |
|---|---|
| Abandoned expedition | Remains, pack, campfire, shield, signpost, torch sconce |
| Mine cache/worksite | Aligned rails/supports, sacks, carts, pickaxe, lanterns, ore veins |
| Burial sanctuary | Sarcophagus, altar, urns, tablets, reliefs, braziers/censers |
| Spider nursery/cache | Eggs, cocoons, floor/wall webs, husks, webbed crate |
| Abyss ritual site | Ritual circle, rune stones, wall runes, chains, broken altar |

Recipes vary completeness and condition: intact, abandoned, collapsed, overgrown.
Reserve the reward anchor and interaction clearance; decorative clutter must not
hide the reward or obstruct its approach.

## Implementation sequence

### 1. Integrate the library and placement contract

- Load clutter alongside ordinary props with explicit readiness handling.
- Preserve new metadata and implement attachment-specific placement rules.
- Separate ambient eligibility from recipe-only signature assets.
- Keep shared lightweight asset bounds/collider metadata available to generation;
  generation must not depend on Three.js objects or downloaded GLBs.
- Use suitable colliders for arrangements. A mine support frame needs separate
  post colliders if players are meant to walk through it; a solid cylinder is not
  sufficient. Small arches and basalt props are dressing, not walkable terrain.

Deliverable: richer environmental detail without breaking routes or light budgets.

### 2. Build the reward-site pipeline

- Allocate a seeded site budget per stratum using the spine and branch graph,
  rather than rolling independently on every floor.
- Distinguish ordinary sites, rare optional branches and exceptional landmarks.
  Guarantee major spatial landmarks, not necessarily exceptional loot every depth.
- Reserve sites and approaches before generic features consume their space.
- Shape terrain/slabs, route through required anchors, then validate and decorate.
- Emit stable spawn records even before chest interaction exists.

Ordering: site intent → reservations → terrain/slabs → routing → structural
placement and validation → dressing → optional gameplay population.

An optional site must be reachable from its designated approach and permit return
or continuation to the main route. Existing `safe` flags alone prove only that a
floor can reach the exit. Preserve the portal-to-exit guarantee and fall escapes.
Include structural dressing blockers in validation; do not introduce them after
reachability checks. Never require a reward, key or interaction to finish a run.

Retries preserve site identity and prestige. Try compatible templates/arrangements
rather than rerolling rewards or silently downgrading exceptional sites. Bound
attempts and report unfulfilled placements explicitly.

### 3. First vertical slice: mines and ruins

Implement six recognizable settings with terrain shaped for their role:

- Mines: gallery, excavation pit, storage room.
- Ruins: hall, courtyard, burial alcove.

Initially keep special geometry inside the cube and preserve shared faces,
portals, rivers and cascade shafts. Use existing traversal mechanics. Realize
alcove, overlook and sanctuary sites at different prestige levels using these
settings. Test destination appearance with markers first, then chest models.

### 4. Expand biome identity and traversal

- Roots: winding passages, grottos and root-covered shelves.
- Frozen: basins, crevasses and overlooking balconies.
- Swamp: branching acid channels, low islands and dry causeways.
- Nests: central nursery chambers, perimeter ledges and short rope spans.
- Volcanic: fissures, basalt terraces, ridges and calderas.
- Abyss: sparse platforms, ring balconies and a distinct final core.

Introduce biome/site-specific traversal preferences, not altered physics:
industrial stairs/ladders in mines, broad stone stairs in ruins, short rope spans
in nests, elevated lava crossings, vertical abyss approaches. Optional shortcuts
may be demanding; the required route remains reliable. Vary barrier appearance
so ancient ruins and lava chambers do not default to wooden cliff fences.

### 5. Districts, population and interaction

- Assign entrance, connector, landmark, optional branch and descent-room roles
  across a stratum. Extend coherent features across faces only with shared specs.
- Populate sites with deterministic rewards; add chest interaction and stable
  opened/claimed state for the run. Reload persistence is a separate feature.
- Add biome/site-driven encounters, with approach and reward clearances.
- Consider dynamic hazards only afterward: webs, ice, vent eruptions, etc.
  Moving/collapsing geometry and progression locks are outside the first slice.

## Validation and acceptance

- Shared boundaries, portal routes and fall escapes remain valid across seeds.
- Sites are reachable and have an onward/return route after all blockers exist.
- Site intent stays fixed across retries and exploration order (the WFC tiles are
  order-independent too).
- No overlapping reservations, blocked reward anchors or inaccessible approaches.
- Correct fluid/shore/lip placement and no floating cover or insufficient headroom.
- Track actual versus requested sites, retry counts and generation time by biome.
- Browser checks for framing, cutaway, approach readability, lighting and travel.
  Terrain landmarks should survive low-detail neighbor rendering, which omits props
  except the reward sites' landmarks (`render/neighbors.js`).

## Implemented first slice

- `world/sites.js`: four destination intents per stratum (one rare/exceptional,
  one uncommon, two basic), preferring branches and avoiding entrance/descent cubes.
- `cubegen/sites.js`: reserved footprints, shaped floors/platforms, flat reward anchors,
  deliberate recipes, and required approach/return routing. Gallery rails align;
  ruin halls add paired column remains. Higher prestige receives more space.
- `map.rewardSites`: stable IDs, prestige, setting, anchor, interaction approach and
  associated floor IDs. `siteFailures` reports placements that could not be realized.
- `map.sitePlacements` and `staticBlockers`: worker-authored dressing and chest previews.
  Chests are visible and collidable but do not yet open or award loot.
- Up to 24 terrain attempts seek optional sites once a valid cube exists; missing
  sites are reported without downgrading or preventing a valid cube from returning.
- All attachment passes are implemented. Cover tilts to the local floor normal;
  neither ambient cover nor ordinary blockers intrude on site reservations.
- The checked-in metadata can be regenerated with
  `npm run prop-metadata` after asset exports.

Validation: `npm test`. Browser checks:
`await (await import('./tests/browser/generation.js')).runGenerationChecks()`.

Remaining work follows stages 4–5 above. Spatial compositions and reveal quality
will need continued visual tuning; current room roles are labels for future
stratum-wide organization, not new world topology.
