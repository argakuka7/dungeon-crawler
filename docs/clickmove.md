# Click to move

The game plays with the mouse alone, Diablo style (`src/game/orders.js`): click the floor to walk
there, an enemy to go and hit it, an item, chest, villager or trial part to go and use it. Holding
the button keeps walking towards the cursor. WASD (or the touch stick) takes over at once. Taps
on a touch screen are the same orders.

## The way

`src/physics/playernav.js` finds the way, from the node the hero stands on to the one clicked.
The nodes are the floor graph the enemies walk (floors, stair and bridge pieces, landings:
`physics/floornav.js`). Some steps only the hero takes:

- **Ladders** (`map.ladders`): up from the floor at its foot, down from the floor at its top.
- **Jumps** (`src/physics/leaps.js`): over a gap of up to three cells, up onto a ledge too high
  to walk up, and down off one (walked off slowly, or jumped).

The cheapest way wins, counted in cells walked. A ladder costs its height at climbing speed and a
jump a little extra, so the hero walks where walking is about as short. When the target cannot
be reached, the walk ends on the reached node closest to it, with height counting like distance.

## Which jumps

Jumps are not guessed from heights. They are found by making them with the hero's own physics
(`physics/move.js`), in the cube he is in. A jump is a run-up along the middle of the take-off
cell, the jump where along the cell it was found to work, and straight on in the air, braking
back over the landing cell. It only counts if it lands on its floor every time, softly (no
sitting down), and keeps standing there. It also has to work from a little off the middle, a
little late, and at a lower frame rate. Over what kills (a fluid too deep to wade, or nothing at
all) it has to work with wider margins too.

Jumps are found per map, floor by floor as the way's search reaches them, and per what the hero
can do now. A leaping potion jumps higher, a swiftness potion or light boots leap further, a
chill runs slower. Once found, they are kept.

No jump or drop crosses a visible fence, and walking off a ledge does not cross an invisible
rail either.

## Along the way

- **Walking** cuts corners where the straight line keeps to the way's nodes, walking from one to
  the next as the floor graph links them. So it never gets onto a stair or bridge from its side,
  never walks under a bridge it means to cross, and never walks up a cliff between two rows of
  the way. It stops cutting before a ladder or a jump.
- **Ladders**: to the middle of the cell in front of it (or above it), then into the wall (or out
  over the edge) until `physics/climb.js` takes hold, and on up (or down). A mouse order only
  takes hold of the ladder its way climbs: walking past another never climbs it.
- **Jumps**: to where the run-up starts, then along the cell, jumping at the take-off. Jumps
  always run, even with Ctrl held.
- A jump or ladder that does not work out (it landed elsewhere, or did not take hold) is left
  out of that walk from then on, and the way is planned anew. If the hero is pushed off the way,
  it is planned anew from where he stands.
- New clicks while a jump or climb is under way (holding the button) wait until it is over.

## Trying it out

`/testroom leaps` (with `?dev=1`) has a trench to jump, a ledge to jump onto, a tower with a
ladder, a gap two cells wide down to low ground, steps back up and a pit left by its ladder.
`tests/clickmove.test.js` walks it, the `climb` room's ladders and random clicks in generated
cubes. `tests/browser/clickmove.js` plays the same clicks through the game's own update.
