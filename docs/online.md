# Playing together

Status: implemented: exploring together or apart, fighting together, sharing the rewards,
being helped up and getting back in. Up to four players, co-op.

## Connecting

- **O** opens the "Play together" panel (`src/net/lobby.js`). The host gets a four letter
  room code (no I or O) and a link (`?join=CODE`); up to three guests type the code or open
  the link. The room stays open while there is room.
- `src/net/transport.js`: PeerJS (`vendor/peerjs/`, loaded only when hosting or joining).
  The host registers `cube-crawler-<CODE>` with the public PeerJS broker. Each guest
  connects to it, and from then on talks to the host directly over a WebRTC data channel
  (reliable, ordered, JSON). `?net=local` uses a BroadcastChannel between tabs of one browser
  instead: for testing without a network.
- **A star:** the guests are only connected to the host, which passes on what they say to
  each other. Every player has a number (slot): the host 0, the guests 1 to 3 in the order
  they came (`MAX_PLAYERS` in `src/net/protocol.js`). A guest's message goes to everyone
  else, unless it says `to` (a number or a list); the host stamps who it is `from` and passes
  on only the types in `RELAYED`, so a guest cannot speak for the host or for someone else.
  Only the host has to be reachable, and only it holds a connection to each player.
- `src/net/session.js`: a guest says `hello`, the host answers `welcome` with the guest's
  number, the players there, its world seed, and what it defeated and opened so far, and
  tells the others (`joined`; `left` when one goes). The guest starts that world and keeps
  its character (level, bag, gear); floor loot and chests are its own. Every world is the
  same for the same seed, whatever the order cubes are visited in (`world/wfc.js`), so no
  map goes over the wire. Only the host starts new worlds (N); the guests follow.
- Everyone sends `me` 20 times a second: cube, position, the character's 14 bone rotations
  (`render/partner.js capturePose`), weapon model, worn things, health and level. The
  others draw them as a figure in the player's colour (`PLAYER_COLORS` in
  `src/net/online.js`: the same on every screen), ~110 ms in the past, blending the two
  messages around that moment (`src/net/sync.js Timeline`). Animation, attacks, ragdolls and
  get-ups all come along with the bones; nothing is animated twice. The host passes `me` on
  at once to players in the same cube and when it changes cubes, else only every 500 ms
  (`FAR_EVERY`): far away it is only needed for the minimap.
- Each explores where they like. Each friend is a dot in their colour on the minimap (or a
  line under it: another depth, in a house). **F** fades you over to a friend, beside them and
  locked out of any portal you arrive in (`session.js goToFriend`, `game/portals.js
  lockPortalsHere`); F again goes to the next friend.
- A fifth player is turned away (`full`), another version too (`version`, `PROTOCOL` in
  `src/net/protocol.js`). Leaving sends `bye`; 12 s of silence counts as gone. The host's
  room stays open for new guests. When the host leaves, the game is over for everyone.
- A guest that lost the connection (no `bye`) tries to get back in, every 3 s, ten times.
  Its `hello` carries the page's `pid`: when the host still holds the old, broken connection
  of the same player, it swaps it for the new one instead of turning it away, and a player
  that comes back gets its number back while it is free. Same seed: the guest keeps its world
  and goes on where it was.

## Who runs the enemies

- A cube's enemies are run by one game, the **runner**: of the players in the cube, the one
  with the lowest number (`protocol.js runnerOf`), so the host's while the host is in it.
  Alone in a cube a player runs its own enemies, like playing alone. The others in the cube
  are **viewers**: shown the runner's enemies (`net/foes.js Runner`, `Viewer`).
- Every game works it out for itself from the others' last `me` (`session.js
  updateRunner`). When a player with a lower number comes into a cube (and the runner there
  was there first, a second or more), the old runner hands its enemies over as they are
  (`handover`: positions, health, fighting or not) and is shown the new runner's from then on;
  the new runner's freshly spawned ones take those over (`game/enemies.js adoptEnemies`).
  The other viewers follow the new runner (`Viewer.follow`). When the runner leaves (or its
  connection goes), the next lowest number there takes them over the same way, from what it
  was shown.
- A kill apart tells the other games the enemy is gone (`defeated`), and a guardian's gate
  opens for everyone; the XP and loot are only the killer's.

## One map for both

- Discovered cubes are shared (`visited`, from `game/flow.js discover`): what anyone found is
  on every minimap and counts for the faces discovery opens (`shareVisit`; a cube the friend
  found is made here first if it is not yet).
- Open side faces are shared too (`faces`, `shareFaces`): where one walked across (a gate gone,
  a portal turned into an open wall), the others can as well.
- Joining (and getting back in) both send what they have: the host in `welcome`, a guest that
  keeps its world after a lost connection in `visited` and `faces`.

## Fighting together

- In a cube together the enemies live on the runner. Its AI goes after any player there
  (`game/party.js`): each enemy picks the nearest one that can be hurt (`chooseTarget`), keeps
  it unless another is clearly nearer (2 cells) and never switches in the middle of an
  attack; whoever hits it becomes its target. Unaware enemies notice any player. A guardian's
  room and a horde mind the player nearest to them. Every other player there is a stand-in
  body on the runner (`body` of each player in `session.js`), updated from its latest `me`
  (position, floor, down or not).
- A viewer has no enemies of its own (`game/enemies.js mirrorEnemies`). The runner sends a
  `roster` of its cube's enemies (ids, levels, profiles: plain data) to each viewer new
  there, to all when they change, and to one that asks (`want`, after coming into a cube or
  dying; asked again after a second without an answer), and `foes` 15 times a second: one row
  per enemy (`protocol.js rowOf`). Viewers show them ~110 ms in the past, like the other
  players (`src/net/foes.js Viewer`).
- A viewer fights what it is shown with its own weapons and rules. Its hits and statuses go to
  the runner (`hit`, `afflict`, via `net/online.js relay` from `game/sword.js hitEnemy` and
  `game/statuses.js`), which applies them (no hit pause or camera kick for a friend's hits).
  For 1.5 s the viewer's own result beats older rows from the runner; a death it saw first
  stays.
- Blows on a viewer (bites, projectiles, beams) are decided on the runner against its
  stand-in and sent to that player only (`hurt`); it applies them like any blow
  (`game/enemycombat.js hitPlayer`). The runner's projectiles fly for the viewers too
  (`shot`, `landed`), beams shine there from the rows. Everyone in a cube sees the others'
  arrows, bolts, spells and flasks fly (`arrow`, `flask`): only the thrower's side hurts
  anything with them.
- While together the inventory does not stop the world (`game/state.js worldPaused`): your
  own input stops, the others and the enemies go on.

## Rewards

- Every kill in a cube together gives each player there its XP (scaled by their own level) and
  its coins and drops: each game sees the enemy die and runs its own `awardKills`
  (`game/enemies.js`). Loot is rolled and dropped in each game for that player alone, so it
  never goes over the wire and nobody takes another's. A guardian killed opens its gate for
  everyone.
- Chests are each player's own too: each can open each chest once.
- When a runner's cube comes back (it died with nobody else there on their feet, see below),
  its viewers forget those kills as well, so they can be earned again.

## Downed and helped up

- A fatal blow on dry land, with a friend in the cube and on their feet, leaves you lying
  where you fell (`game/downed.js`): the ragdoll stays, enemies leave you be. Any friend
  helps you up by standing within 1.3 cells for 2 s; you get up with 30% of your health.
  After 30 s, or when no friend is left in the cube on their feet, you are back at the
  entry (R gives up at once). Notes over the figures say what is going on (`me.ko`).
- Playing together a death never resets the cube (`game/flow.js die`) while a friend is still
  fighting in it, and a viewer's enemies are the runner's anyway. Only the runner dying with
  nobody on their feet beside them resets it, for everyone there.
- Time runs alike for everyone: the Guide cannot pause or slow it while together
  (`game/pace.js`).

## Not done

- Dev-spawned enemies stay with the game that spawned them: they are not handed over.
- The host cannot pass the game on: when it leaves, the others play on alone.
- Guests only reach each other through the host, which doubles the trip between two of them.
