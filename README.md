# Cube Crawler

A browser dungeon crawler made of 16x16-cell cubes stacked into themed depths.
Plain ES modules and a vendored three.js; no build step.

**[Play it in your browser](https://mitsuhiko.github.io/dungeon-crawler/)**

<p>
  <img src="learn/img/town.jpg" alt="The town cube" width="49%">
  <img src="learn/img/fight.jpg" alt="Fighting on a floating island" width="49%">
</p>

This game is AI generated and was made together with my kids. It comes with interactive live
docs that explain how the game works, from the big ideas down to the real code:
**[read the guide](https://mitsuhiko.github.io/dungeon-crawler/learn/)**.

## Layout

- `index.html`, `style.css`, `src/`: the game.
  - `src/core/`: pure rules and data (constants, combat, items, inventory, ...);
    `src/core/gear/` is the weapon generator (rarities, affixes, names, drops; `docs/loot.md`).
  - `src/world/`: the world graph and everything shared between cubes (layout, WFC, faces,
    falls across faces, sites, town plan), plus the worker that owns it.
  - `src/cubegen/`: builds one cube's map from the spec `world/` hands it. Files named like
    a `world/` file (`cascades`, `spouts`, `sites`, `town`) carve that shared decision into the cube.
  - `src/themes/`: per-depth data: palettes, lighting, generator settings, structure materials.
  - `src/physics/`, `src/render/`, `src/game/`: movement, drawing and game state/flow.
    `src/game/teach.js` (`window.__game.teach`) draws over the world, shows the game's rules
    (lenses), pauses / steps / slows time and tunes numbers with a way back, for the guide's tutor.
  - `src/net/`: playing together (O in the game, up to four players): a room code, PeerJS
    between the host and each guest, the others' poses, following each other through portals
    and one player's enemies shown to the others in its cube (`docs/online.md`).
  - Saves (`src/core/save.js`, `src/game/save.js`): up to three heroes and eight worlds,
    apart, in `localStorage`; a hero goes into any world, a friend's too (`docs/saves.md`).
  - The chat box (Enter, bottom left; `src/game/console.js`): the chronicle of what happened,
    chat when playing together, and commands after a `/` that complete the game's items and
    enemies; with `?dev=1` the developer commands (`` ` ``, `/help`; `docs/console.md`).
- `assets/`: exported game data (GLB models, item icons, manifests). The game
  loads assets only from here (and music from `music/`). These files are generated; do not edit them by hand.
- `music/`: hand-written Scrimshaw scores the game plays (`docs/music.md`). Before writing
  or changing a song, read `music/README.md` for the style, the layers and the format.
- `blender/`: authoring sources: Blender scripts and `.blend` files that export
  into `assets/`, Blender test scripts in `blender/tests/`, renders in `blender/previews/`.
- `tests/`: `node --test` unit tests; `tests/browser/` holds integration checks
  that run from the game's devtools console.
- `tools/`: dev server, the prop metadata generator, the enemy kinds preview
  (`/tools/kinds.html`, see `docs/enemy-kinds.md`), the depth population measurement, the
  weapon drop tables (`node tools/loot-table.mjs`) and the balance simulation
  (`node tools/balance.mjs`, see `docs/balance.md`).
- `docs/`: design notes; `docs/assets/` documents the asset libraries.
- `learn/`: an interactive guide for children (about 12), in English and German, from the
  big ideas down to the real code (`/learn/` on the dev server), with an AI tutor on every page
  (`learn/tutor/`, needs an API key, see `learn/README.md`). Code it
  explains carries a `// learn: ...` marker. After changing such code, run
  `npm run learn` (`npm test` runs it too): it names the slides to review; then
  `npm run learn -- --stamp`, or `-- --defer` to note them as outdated. See `learn/README.md`.
- `vendor/three/`: three.js and the addons in use; `vendor/scrimshaw/`: the music score parser and synth;
  `vendor/peerjs/`: PeerJS for playing together, loaded only when someone hosts or joins;
  `vendor/pi-durable/`: Pi's durable agent harness and model access for the tutor, one bundle built
  by `node tools/vendor-pi-durable.mjs <pi checkout>`.

## Running

```sh
npm run serve            # uv run --no-project tools/serve.py [port]
# http://localhost:8000/?seed=123   (?dev=1 for dev tools: ` opens their commands)
# ?touch=1 forces the touch controls (docs/touch.md)
# with RADIUS_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY set, the guide's tutor uses it through the server
npm test
```

In a git worktree the server and tests take `assets/` from the main checkout;
see `docs/combat.md`.

## Re-exporting assets

```sh
Blender -b --python blender/props.py          # likewise character, spider, stunder, snake, octonaut,
                                              # fireface, triangle, firecat, shraps, spicy, sword
Blender -b --python blender/clutter.py        # libraries: clutter, items, town, town_trees
Blender -b --python blender/tests/test_clutter.py
npm run prop-metadata                         # after props/clutter changes
Blender -b --python blender/loadout.py        # the player with each kind of weapon and the
                                              # villagers (previews; -- --mounts solves the mounts
                                              # of weapons and worn / held things)
```
