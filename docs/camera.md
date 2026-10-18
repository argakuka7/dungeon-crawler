# The camera: overview and close view

The game has two views. The **overview** (the default) looks down at 44° from far away with a
narrow lens (28°), so the whole cube shows like a model on a table; zoomed in it follows the
hero. The **close view** sits behind the hero with a wide lens (60°). It is meant for finding
the way through tunnels, caves and the deep, where the overview's cutaway gets busy, and it
works everywhere: cubes, tunnels, house interiors, while travelling.

## The camera key (`game/camerakey.js`, `core/view.js`)

The `camera` action (core/keybinds.js, the View group) is on **Tab** and **C** by default;
both can be rebound in the settings. Browsers deliver Tab to the page, and the game keeps it from
moving the focus; menus, the inventory and the chat keep their own Tab. C is there in case
Tab is taken anyway.

- **Tap** (let go within `TAP_MS`, 250 ms, without turning the view): switches between the
  overview and the close view. The choice sticks: it is a setting (`crawler.settings`
  `camera`, also in the settings menu under Graphics) and nothing switches it back on its own.
- **Hold and move the mouse:** turns the view while the key is down. Turning starts once the
  mouse moved `ORBIT_PX` (4 px), without waiting for the hold. Right turns the view to the
  right; in the close view up and down tilt it (`PITCH_MIN` to `PITCH_MAX`). The cursor hides
  and what it pointed at stays (game/pointer.js), so hovering and clicking do not drift.
  Letting go after turning never switches the view.
- **The overview settles on a side:** it keeps looking diagonally from one of four sides (the
  ones Q / E turn between); after the mouse turned it, letting go eases it to the nearest one
  (`snapYaw`). Switching from the close view to the overview does the same.
- Key repeats are ignored; losing the window (blur) ends the turning without switching; the
  mouse does not turn the view with the inventory, the menu or "Leave the fight?" open.
- No pointer lock: the browser would show its banner on every hold, and Chrome refuses to lock
  again for a moment after Esc.

Q / E still turn by a quarter in both views; the zoom keys and the wheel keep their five
presets, which in the close view set the arm's length (`closeDistance`: about 1.5 to 4 units).
WASD always moves relative to the camera, so in the close view W runs away from it.

## The close view (`game/camera.js`)

- **The arm:** from a pivot at the hero's shoulders (`ANCHOR`, under a low ceiling a little
  below it), `pitch` over the level, looking at a point `AHEAD` past the pivot. Points along
  the arm are probed: terrain, structures and blockers (`physics/collide.js insideSolid`), and
  what hides the hero from the overview too (tree crowns, roofs: `core/blockers.js
  viewBlockedAt`). Out of the cube there is nothing else, but in a house everything beyond the
  room counts (its walls are only drawn). The arm stops `CLEAR` short of the first hit, comes
  in at once and goes out again gently.
- **Fluids** have no underside: the camera stays over their surface.
- **Travelling** the player and the cubes slide together and the map is already the new
  cube's: the arm keeps its length until the travel is over.
- **The hero fades** when the arm gets very short (from 1 down to 0.55 units), and stops
  writing depth then; what it wears and holds stays.
- **No cutaway:** the camera stays out of the solids, so `game/cut.js` cuts nothing and the
  walls of caves, canyons and houses stay up (`setCut(..., walls = false)`), and the
  neighbours' reveal is off (`cullNeighbors`).
- **The player's bar** (render/playerbar.js) would cover the middle of the screen over the
  hero: it sits at the bottom, over the quick bar, a step in front of the camera.
- **Blending:** switching moves the camera, its direction and its lens from one view to the
  other in `BLEND_TIME` (0.4 s). Past halfway it counts as the close view (`closeView()`): the
  cut, the walls, the bar and the neighbours switch there. The main menu always shows the
  overview.

## Not yet

- The backdrop (sky, stars) is fixed to the screen; turning the close view leaves it in place.
- Sounds pan by where they are on the screen; one behind the camera pans to the wrong side.
- Enemies' silhouettes through walls show as in the overview, larger up close.
- Touch has no camera key yet (its turn buttons and pinch work in both views).

## Checks

- `tests/view.test.js`: the sides the overview settles on, the arm's lengths, the pitch limits,
  the tap / hold decision and the default keys.
- `tests/browser/camera.js` (`runCameraChecks()`): the keys, turning, settling, losing the
  window, the close view's cut and walls and lens, the arm out of the solids all around the
  hero in a cave, the player's bar. The other browser checks run in the overview
  (`paused()` in tests/browser/combat.js sets it and puts the setting back).
