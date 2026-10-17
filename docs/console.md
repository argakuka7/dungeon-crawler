# The chat box: chronicle, chat and console

Status: implemented. One box, bottom left, for what happened (the chronicle), what the players
say to each other (chat) and the commands (the console).

## The box

- **Enter** opens it to type (the action key is F or right Ctrl, `game/action.js`). A line is chat; a line that starts with `/` is a command.
  **`** (the key left of 1, `^` on a German keyboard; by `e.code`, so any layout) opens it with
  the `/` already typed. **Esc** closes the list of suggestions first, then the box. Enter on an
  empty line closes it too, and so does running a command (Enter opens it again). The game goes on while it is open (it does not pause).
- While typing, the game's keys are not the game's (`game/console.js` stops them at the field;
  the keys held to walk are let go when it opens). Clicks in the box keep the field focused; a
  click into the world closes it. The wheel scrolls the box, not the camera.
- Closed, a new line shows for `SHOW_FOR` (12 s) and fades; open, the whole chronicle scrolls,
  filtered by **All / Chat / Events**. A death's line opens to its record when clicked.
- Under the lines, the game's last word (`setStatus`: "Inventory is full", "Horde awakened!") shows
  for a moment. It is not kept: the chronicle keeps what matters.
- **Up / Down** move through the suggestions while they show (the list wraps and scrolls; up to
  50). Without suggestions (an empty line, chat, after Esc) they go through the lines typed
  before (the last 50, kept in `localStorage` across reloads: `cube-crawler-history`); once
  going through those, they go on through them.

## The chronicle

`src/core/chronicle.js` (pure) and `src/game/log.js` (the session's diary). An entry is plain data:
`{ id, kind, data, who, at, time }`; the words are made when it is shown (`describe`), so the same
entry reads "You died" on our screen and "Anna died" on a friend's. It is kept for the visit only:
a reload starts a new diary, a new world adds a separator line. At most `LOG_LIMIT` (200) entries.

| kind | when | data | told to friends |
|---|---|---|---|
| `death` | we died (`game/flow.js die`) | the death record | yes |
| `down` / `up` | knocked out / helped up, playing together (`game/downed.js`) | `{ cause, by }` / `{ by }` | yes |
| `level` | a level up (`game/enemies.js awardKills`) | `{ level }` | yes |
| `guardian` | a guardian defeated, its gate open | `{ label, level, depth }` | yes |
| `depth` | the first time at a depth in this world (`game/flow.js settleIn`) | `{ depth, place }` | yes |
| `loot` | a rare (or better) weapon picked up (`game/loot.js`) | `{ name, rarity }` | epic and better |
| `kill` | enemies defeated; kills within `MERGE_TIME` (6 s) are one line | `{ count, xp }` | no |
| `horde` | a horde woke up | `{}` | no |
| `trade` | bought something (`game/inventory.js`) | `{ item, price }` | no |
| `party` | someone joined or left (`net/session.js`) | `{ text }` | (each sees it) |
| `world` | a new world began | `{ seed }` | no |
| `chat` | someone said something | `{ text }` | always |
| `system` / `dev` | what the console says / a developer command did | `{ text, error? }` | no |

**The death record** (`deathRecord`): the cause (the last blow's reason, `player.lastHurt`,
"bitten by a Redback"), the enemy behind it (`by`: its name, level, whether a guardian), the depth
and its place, the cube, the weapon in hand, our level and how long into the session. Every blow
carries its enemy along (`game/enemycombat.js attacker`, set on strikes, projectiles and beams;
it travels with a `hurt` over the network too), and so do the fire and the poison it leaves;
`knockDown`, `hurt` and the fluids note the last one as `player.lastHurt`.

## Chat and news when playing together

Two messages (`src/net/protocol.js`, `PROTOCOL` 8), relayed by the host like the others:

- `chat { text }`: a typed line, to everyone. At most `CHAT_MAX` (160) characters of plain text
  (`cleanText`). The host passes on at most `CHAT_BURST` (5) lines of a guest per `CHAT_WINDOW`
  (5 s) and drops the rest (`chatAllowed`). It shows in the box in the speaker's colour
  (`PLAYER_COLORS`) and over their head for a few seconds (`console.js speech`).
- `news { kind, data }`: what happened to a player that the others care about (the "told to
  friends" column). The receiver checks it (`cleanNews`: only those kinds, only their fields, of
  the right types, short) and writes it into its own chronicle with `who`.

Alone, a chat line is kept all the same; the box says once that nobody else hears it.

## Commands

`src/core/commands.js` (pure: the registry, words, matching, completing, reading),
`src/game/commands.js` (the argument types and the commands everyone has),
`src/game/devcommands.js` (the developer commands, only with `?dev=1`; without it they do not
exist, not even in the suggestions).

Everyone: `/help [command]`, `/seed`, `/clear` (empties the box), `/who`.

Developer (`?dev=1`):

| command | what |
|---|---|
| `/spawn <enemy> [level] [count] [front\|cursor]` | enemies into this cube (no level: this depth's) |
| `/kill`, `/remove` | every enemy here dies (XP and loot) / goes (none) |
| `/passive [on\|off]` | enemies stand still and never attack (no argument: toggle) |
| `/goto <down\|up>`, `/find <down\|up>` | take the nearest way down / up (PgDn / PgUp), or stand next to it (G) |
| `/go <east\|west\|south\|north>` | into the next cube (Alt + WASD) |
| `/horde [depth]` | a depth's wild horde (H) |
| `/span [n]` | the start of a gorge span's long bridge: the next one, or the n-th (docs/world.md) |
| `/bridge [style] [depth]` | the next bridge (of that style) from this depth (or that one) on down (docs/world.md) |
| `/ladder [style] [depth]` | the foot of the next ladder (of that style) from this depth (or that one) on down (docs/world.md) |
| `/height <kind>` | the next tableland ascent, plateau or descent, great shaft, pinnacle, spiral or hairpin (in at its foot), lone peak, great lake or tunnel (docs/world.md) |
| `/newworld [seed]` | a new world (N), not saved; a saved hero comes along as it is |
| `/menu` | save and quit to the main menu |
| `/give <item> [count]` | things into the bag (a weapon: a common one, equipped) |
| `/weapon <weapon> [rarity] [level] [drop]` | roll a weapon and equip it, or drop it at your feet (default rare, item level 8) |
| `/wear <thing\|off>` | headwear on or off |
| `/gold <amount>`, `/heal`, `/level <n>` | the hero |
| `/music <mood\|auto>` | hold one mood of the music |
| `/saves` | the saved heroes and worlds, and what is being saved now |
| `/save <hero>` | save as this hero (overwritten, or a new one) in this world (a new saved world unless it is saved already, now the hero's world); from then on it saves itself |
| `/load <hero> [world\|new]` | play a saved hero in a saved world (no world: the hero's own one, else a new one) |
| `/delete <hero\|world>` | delete a saved hero or world |

The spawn row of the dev panel, its J key and the inventory's "Developer weapons" section are
gone: these commands replace them.

### Completing

An argument has a type. Types with a list of values (`item`, `weapon`, `wearable`, `enemy`,
`rarity`, `depth`, `mood`, the saves `hero`, `savedworld` and `save`, and small fixed ones
like `way`, `dir`, `toggle`) take their values from the game's own tables (`ITEMS`,
`ENEMY_KINDS`, `RARITIES`, the store of saves ...), so new ones complete without any change
here. `int` and `text` take what is typed.

What was typed is matched against a value's id and its name, ignoring case (`score`):

1. the very one (the name, the id, or the id without `item_` / `weapon_` / `wear_` / `held_`): 100
2. the name starts with it (`rec` → Recurve Bow): 80
3. every typed word starts a word of the name, in order (`gr he` → Greater health potion): 60;
   of the id: 55
4. the id starts with it (`flask_f` → `item_flask_fire`): 50
5. its letters come in this order (`grsw` → Greatsword): 30 from the first letter, else 20

Best first; equally good ones: the shorter name, then as listed (with nothing typed: as listed).

A list argument may take several words: as many as together still fit something, while enough
are left for the arguments that must follow (`/give health potion 2`, `/spawn fire shraps 4`).
Completion knows this too: the next word goes on with the item while they still fit.

While typing a command the box shows the suggestions (up to 50, 8 at a time, scrolling) (icon, name, dimmed id, a hint: the
rarity's colour, a depth's theme), how the command goes with the argument being typed underlined,
and greyed out after the cursor the rest of the highlighted value (or what it is). **Tab** puts
the highlighted value (its id) in place of the word. **Enter** runs the line: an argument that
clearly fits one value (the only one, or a better fit than any other) is read as that one, so
`/give gr he` + Enter works without Tab; when it could be several, the box says which. A
suggestion picked with Up / Down is taken by Enter as well (`/height`, Down to `spiral`, Enter).

## Files and checks

- `src/core/chronicle.js`, `src/core/commands.js`: pure; `tests/console.test.js`.
- `src/game/log.js`: the chronicle of this visit; `logDeath`, `noteDepth`.
- `src/game/console.js`: the box; `src/game/commands.js`, `src/game/devcommands.js`: the commands.
- `src/net/session.js`: `chat` and `news`.
- `tests/browser/console.js`: keys, completion, commands, history, deaths and depths in the
  chronicle (`?dev=1`: `await (await import('/tests/browser/console.js')).runConsoleChecks()`).
- `window.__game.chat`: `open(text)`, `close()`, `say(text)`, `run(line)`, `chronicle`.
