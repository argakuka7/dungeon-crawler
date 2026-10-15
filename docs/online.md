# Playing together

Status: step 1 of 4 is implemented (walking around together). Two players, co-op.

## How it works now

- **O** opens the "Play together" panel (`src/net/lobby.js`). The host gets a four letter
  room code (no I or O) and a link (`?join=CODE`); the guest types the code or opens the link.
- `src/net/transport.js`: PeerJS (`vendor/peerjs/`, loaded only when hosting or joining).
  The host registers `cube-crawler-<CODE>` with the public PeerJS broker. The guest connects
  to it, and from then on the browsers talk directly over a WebRTC data channel (reliable,
  ordered, JSON). `?net=local` uses a BroadcastChannel between tabs of one browser instead:
  for testing without a network.
- `src/net/session.js`: the guest says `hello`, the host answers `welcome` with its world
  seed. The guest starts that world and keeps its character (level, bag, gear). The world's
  progress (gates, floor loot, chests) starts fresh, as in any new world. Every world is the
  same for the same seed, whatever the order cubes are visited in (`world/wfc.js`), so no
  map goes over the wire. Only the host starts new worlds (N); the guest follows.
- Both send `me` 20 times a second: cube, position, the character's 14 bone rotations
  (`render/partner.js capturePose`), weapon model, worn things, health and level. The
  other side draws them as a tinted figure, ~110 ms in the past, blending the two messages
  around that moment (`src/net/sync.js Timeline`). Animation, attacks, ragdolls and get-ups
  all come along with the bones; nothing is animated twice.
- Both always stay in the same cube. Every trip of your own (portal, door, town portal, an
  open face) counts one more than any trip before; when the two are in different cubes, the
  one with the lower count fades over to the other (`sync.js shouldFollow`), beside them and
  locked out of any portal they arrive in (`game/portals.js lockPortalsHere`). On the same
  count the guest gives way. Nobody follows while the other is travelling, generating or
  falling.
- A second guest is turned away (`full`), another version too (`version`, `PROTOCOL` in
  `src/net/protocol.js`). Leaving sends `bye`; 12 s of silence counts as gone. The host's
  room stays open for a new guest.

Each side still has its own enemies, loot and chests in step 1: the friend fights monsters
you cannot see.

## Next steps

2. **Fighting together.** Enemies only on the host (their ids are seeded and the same on
   both sides: `core/enemies.js enemyRoll`). Enemy AI targets the nearest living player
   instead of `player` (`game/enemyai.js`, `enemycombat.js`, `projectiles.js`, `defence.js`,
   `hordes.js`). The host sends enemy snapshots, the guest shows them and sends its own hits
   (`hit`); the host sends damage to the guest (`hurt`). Both must wait for the props before
   spawning (`game/flow.js` re-spawns enemies when they arrive late).
3. **Rewards.** A kill gives both players XP. Loot is per player: on `kill` each side rolls
   its own drop locally (`dropLoot`), so floor loot never needs syncing. Gates, defeated
   guardians, chests and opened faces are the host's.
4. **Rounding off.** Downed and revive instead of `die()` resetting the cube while the other
   still plays; the inventory and the Guide's pause stop only your own input, not the world;
   hit pause only as a look; reconnecting.
