# Touch controls

On phones and tablets the game plays with the thumbs (`src/game/touch.js`, the numbers in
`src/core/stick.js`). They switch on with the first touch of the screen, or on a device whose
main pointer is coarse; `?touch=1` forces them on (to try them with a mouse), `?touch=0` keeps
them off. On, the body has the `touch` class and the layout changes with it (`style.css`).

## Layout

- **Left: the stick.** Wherever the thumb lands in the lower left, a stick appears under it.
  Pushing moves the way it points, turned with the view like WASD. A little push walks (like
  Ctrl), further runs. A quick touch there without pushing is a tap on the game.
- **Right: the action button.** It shows the equipped weapon. Held, it attacks whatever the
  weapon can reach, like holding Shift, preferring enemies the stick points at. A tap swings
  once.
- **With a flask in hand** the action button shows the flask and turns into a stick that aims
  it: drag out from the button, the arc shows where it lands (the further out, the further,
  up to the flask's range), and let go to throw. Dragging back into the middle before letting
  go calls the throw off. A tap without dragging throws at the best enemy in range and in sight,
  or straight ahead.
- **Jump** is the smaller button beside it.
- **The quick bar** moves to the top, with a bag button at its end that opens the inventory.
  The potions at work show below it; the minimap gets smaller.
- The stick and buttons hide while the inventory is open.

## On the game

- **Tap**: what a click does, except walking: an enemy is attacked, an item picked up, a chest
  opened, a villager traded with; with a flask in hand it is thrown there. A tap on the floor
  does nothing.
- **Long press** (about half a second, held still): collects coins and items around, like C.
  A ring fills under the finger.
- **Two fingers**: pinch to zoom (one step each time they are a quarter further apart or
  closer), twist to turn the view a quarter (each 35 degrees).

Help, music, playing together and respawning have no touch controls yet.
