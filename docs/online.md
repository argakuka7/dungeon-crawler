# Playing together

Status: implemented: exploring together or apart, fighting together, sharing the rewards,
being helped up and getting back in. Two players, co-op.

## Connecting

- **O** opens the "Play together" panel (`src/net/lobby.js`). The host gets a four letter
  room code (no I or O) and a link (`?join=CODE`); the guest types the code or opens the link.
- `src/net/transport.js`: PeerJS (`vendor/peerjs/`, loaded only when hosting or joining).
  The host registers `cube-crawler-<CODE>` with the public PeerJS broker. The guest connects
  to it, and from then on the browsers talk directly over a WebRTC data channel (reliable,
  ordered, JSON). `?net=local` uses a BroadcastChannel between tabs of one browser instead:
  for testing without a network.
- `src/net/session.js`: the guest says `hello`, the host answers `welcome` with its world
  seed, with what it defeated and opened so far. The guest starts that world and keeps its
  character (level, bag, gear); floor loot and chests are its own. Every world is the
  same for the same seed, whatever the order cubes are visited in (`world/wfc.js`), so no
  map goes over the wire. Only the host starts new worlds (N); the guest follows.
- Both send `me` 20 times a second: cube, position, the character's 14 bone rotations
  (`render/partner.js capturePose`), weapon model, worn things, health and level. The
  other side draws them as a tinted figure, ~110 ms in the past, blending the two messages
  around that moment (`src/net/sync.js Timeline`). Animation, attacks, ragdolls and get-ups
  all come along with the bones; nothing is animated twice.
- Each explores where they like. The friend is a blue dot on the minimap (or a line under
  it: another depth, in a house). **F** fades you over to them, beside them and locked out of
  any portal you arrive in (`session.js goToFriend`, `game/portals.js lockPortalsHere`).
- A second guest is turned away (`full`), another version too (`version`, `PROTOCOL` in
  `src/net/protocol.js`). Leaving sends `bye`; 12 s of silence counts as gone. The host's
  room stays open for a new guest.
- A guest that lost the connection (no `bye`) tries to get back in, every 3 s, ten times.
  Its `hello` carries the page's `pid`: when the host still holds the old, broken connection
  of the same player, it swaps it for the new one instead of turning it away. Same seed:
  the guest keeps its world and goes on where it was.

## Who runs the enemies

- A cube's enemies are run by one game: the host's while the host is in it, else the game of
  whoever is there (each explores with its own enemies, like playing alone).
- When the host comes into the guest's cube (the guest was there first, a second or more),
  the guest hands its enemies over as they are (`handover`: positions, health, fighting or
  not) and is shown the host's from then on; the host's freshly spawned ones take those over
  (`game/enemies.js adoptEnemies`). When the host leaves the guest in a cube (or the
  connection goes), the guest takes them over the same way, from what it was shown.
- A kill apart tells the other game the enemy is gone (`defeated`), and a guardian's gate opens
  for both; the XP and loot are only the killer's.

## One map for both

- Discovered cubes are shared (`visited`, from `game/flow.js discover`): what either found is
  on both minimaps and counts for the faces discovery opens (`shareVisit`; a cube the friend
  found is made here first if it is not yet).
- Open side faces are shared too (`faces`, `shareFaces`): where one walked across (a gate gone,
  a portal turned into an open wall), the other can as well.
- Joining (and getting back in) both send what they have: the host in `welcome`, a guest that
  keeps its world after a lost connection in `visited` and `faces`.

## Fighting together

- In a cube together the enemies live on the host. Its AI goes after either player (`game/party.js`): each
  enemy picks the nearer one that can be hurt (`chooseTarget`), keeps it unless the other is
  clearly nearer (2 cells) and never switches in the middle of an attack; whoever hits it
  becomes its target. Unaware enemies notice either player. A guardian's room and a horde mind
  the player nearer to them. The guest is a stand-in body on the host (`friend` in
  `session.js`), updated from its latest `me` (position, floor, down or not).
- The guest has no enemies of its own while the host is here (`game/enemies.js mirrorEnemies`). The
  host sends a `roster` of its cube's enemies (ids, levels, profiles: plain data) when they
  change or the guest asks (`want`, after coming into a cube or dying), and `foes` 15 times a
  second: one row per enemy (`protocol.js rowOf`). The guest shows them ~110 ms in the past,
  like the partner (`src/net/foes.js Guest`).
- The guest fights what it is shown with its own weapons and rules. Its hits and statuses go to
  the host (`hit`, `afflict`, via `net/online.js relay` from `game/sword.js hitEnemy` and
  `game/statuses.js`), which applies them (no hit pause or camera kick for a friend's hits).
  For 1.5 s the guest's own result beats older rows from the host; a death it saw first stays.
- Blows on the guest (bites, projectiles, beams) are decided on the host against the stand-in
  and sent over (`hurt`); the guest applies them like any blow (`game/enemycombat.js
  hitPlayer`). The host's projectiles fly on the guest's side too (`shot`, `landed`), beams
  shine there from the rows. Both sides see each other's arrows, bolts, spells and flasks fly
  (`arrow`, `flask`): only the thrower's side hurts anything with them.
- While together the inventory does not stop the world (`game/state.js worldPaused`): your
  own input stops, the friend and the enemies go on.

## Rewards

- Every kill in a cube together gives both players its XP (scaled by their own level) and its coins and drops:
  each side sees the enemy die and runs its own `awardKills` (`game/enemies.js`). Loot is
  rolled and dropped on each side for that player alone, so it never goes over the wire and
  nobody takes the other's. A guardian killed opens its gate on both sides.
- Chests are each player's own too: both can open each chest once.
- When the host's cube comes back (the host died alone, see below), the guest forgets those
  kills as well, so both can earn them again.

## Downed and helped up

- A fatal blow on dry land, with the friend in the cube and on their feet, leaves you lying
  where you fell (`game/downed.js`): the ragdoll stays, enemies leave you be. The friend
  helps you up by standing within 1.3 cells for 2 s; you get up with 30% of your health.
  After 30 s, or when the friend leaves the cube or goes down too, you are back at the
  entry (R gives up at once). Notes over both figures say what is going on (`me.ko`).
- Playing together a death never resets the cube (`game/flow.js die`): the friend is still
  fighting in it, and the guest's enemies are the host's anyway. Only the host dying with
  nobody on their feet beside them resets it, for both.
- Time runs alike for both: the Guide cannot pause or slow it while together
  (`game/pace.js`).

## Not done

- Dev-spawned enemies come along, enemies in a cube the friend is not in do not matter.
- More than two players.
