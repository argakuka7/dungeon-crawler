# Villagers and the things characters wear

![The villagers, standing in their hold poses](../blender/previews/loadout-villagers-front.png)

Villagers are humans like the player: the same clay figure (`assets/character.glb`), tinted,
standing at their trades in the two clearings. What sets them apart is what they wear on the
head and hold in their hands. Those things are ordinary items (`core/items.js WEARABLES`), so
any character can wear them; for now only the villagers do (and the player through a dev hook).

| Villager | Where (`world/town.js VILLAGERS`) | Wears and holds |
|---|---|---|
| innkeeper | on the inn's porch, beside the door | a towel over the left forearm |
| groom | in front of the stable's horses | a coil of rope |
| smith | at the anvil under the blacksmith's lean-to | welding mask, hammer and pliers |
| keeper | by the pet shop's rabbit pen | a feed bag |
| alchemist | in front of the potion tent (merchant camp) | wizard hat |
| enchanter | in front of the herb tent (merchant camp) | headscarf, a floating crystal ball |

There is no enchanting tent yet; the enchanter keeps the herb stall (`town_merchant_b`). The
alchemist trades: hovered, she has a gold label and a click walks up to her to buy potions
([potions.md](potions.md), `core/shops.js`).

## Wearing things

`core/items.js` defines the wearables: category `wearable` (headwear) or `held`, and a `slot`
(`OUTFIT_SLOTS`: `head`, `right`, `left`), one thing per slot (`outfitOf` checks an outfit).
Each has a model in `assets/items/` like any item, and `glow` for the ones with a
shining part (the crystal ball, the pliers' hot billet). They have no stats or uses yet.

Their models come from `blender/items.py` (`WEARS` there) and say in their extras how they go on
(see [assets/items.md](assets/items.md)): the `socket` bone (`head`, `hand.R`, `hand.L`), the
rotation and offset from that bone's root (`mount_quat_gltf`, `mount_offset_gltf`), the arm's
`hold` pose and, for the crystal ball, `float` (how high it hovers over the fist).
`blender/loadout.py --mounts` solves the mounts from how each thing should sit (`WEAR_AIMS`).

A hold is a still clip of one arm in `character.glb`, `Hold<Name>` (`CARRIES` in
`blender/character.py`): the towel's forearm level in front like a waiter's, the crystal ball's
hand raised before the chest, the smith's tools held ready, the rope a little away from the leg,
the feed bag held out in front.

`render/figure.js` is the shared part: it loads the rig once (the player's
`render/character.js` sets up on the same load), clones figures with their own skeletons
(`createFigure`), poses them standing with their carrying arms in their holds (`poseFigure`),
and puts things on and takes them off (`wear`, `takeOff`, `dress`). Anything with `bones` and
`worn` can wear things, the player's character included. Floating things bob and turn over the
hand, glowing parts pulse (`animateWorn`).

On the player, `__game.devWear('wear_wizard_hat')` (with `?dev=1`) puts on headwear and
`__game.devWear(null)` takes it off. Held things are not for the player yet: its hands carry the
weapon, and its animator has no carry poses.

## Villagers in the clearings

`VILLAGERS` places each villager next to a building, in the building's own frame (like its
`parts`), facing a way of their own, with a clay tint and an outfit. The clearing plan
(`clearingPlan`) turns them with their building into the cube, and puts a circle collider
(`VILLAGER_R`, a body's radius) where each one stands, before the clutter is placed, so props
keep clear of them and the walkability checks see them. The map carries them as `villagers`.

`render/villagers.js` builds them into the cube's group (`render/world.js`), so they fade and
slide with it and go with it. Each frame they stand, breathe, shift their weight and look about;
when the player comes within 3.2 cells they turn the head and, up to about 45°, the body towards
them. A glowing thing carries a small light (taken over by the light pool). The game waits for
the rig and the villagers' things before the first cube; if they fail to load, the clearings
are built without villagers.

`npm test` checks that the villagers stand where their spec says, on dry ground, as colliders
that nothing else overlaps, and that the player can walk up to each one from the town's spawn
or the camp's gate (`tests/town.test.js`); and that every wearable's model sits on the bone of its slot with a
hold clip in the rig (`tests/assets.test.js`). `Blender -b --python blender/loadout.py --
--villagers` renders the picture above.
