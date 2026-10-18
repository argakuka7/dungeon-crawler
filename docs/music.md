# Music

Songs are plain-text [Scrimshaw](https://tools.simonwillison.net/scrimshaw-jukebox) scores in
`music/<name>.scrim`, played by a Web Audio synth in the browser. There is no build step: the
game fetches the score and compiles it when it is first needed. The parser and synth are
vendored in `vendor/scrimshaw/` (Apache-2.0, from Simon Willison's tools).

**Writing a song?** Start with `music/README.md`: the game's musical style, how to build the
layers, a format cheat sheet and a full example score.

Music is off by default; the settings (in the Esc menu and the main menu) or M turn it on and
off, and set its volume apart from the sound effects' (`src/game/settings.js`, kept in
`crawler.settings`; the music plays into its own bus of `src/audio/context.js`).

| File | Role |
|---|---|
| `src/audio/context.js` | the AudioContext shared with the sound effects, made on the first key or click |
| `src/audio/score.js` | compiles a score and reads its moods (pure, tested in node) |
| `src/audio/music.js` | the player: schedules notes ahead, loops, switches songs, fades voices between moods |
| `src/game/music.js` | picks the song (`songFor`) and the mood from the game state; `forceMood` holds one (`__game.musicMood`) |

## Editing

`tools/player.html` (`npm run serve`, then `/tools/player.html`) plays every score with the
game's synth: pick a song on the left (or `#overworld` in the URL), switch
moods, click a voice to mute it or shift-click to solo it, click the bar to seek; a piano roll
shows what plays. It reloads the score each time you pick it, so edit, then pick the song again.

Or paste a score into the jukebox page to hear it, see it as a piano roll and get errors per
line, then copy it back. Its "Read guide" section documents the format; in short, settings,
then `voice NAME INSTRUMENT [vol= pan= rev= ...]`, then `pattern` blocks with one line per
voice (`|` separates bars, a step per note plus one per `-`), then `play` (once) and `loop`
(forever). `npm test` compiles every score in `music/` and fails on any error.

## Moods

The game picks one of six moods and each score names the voices that play in it, in
`# mood NAME: voices` comments (`music/README.md` explains the syntax and the fallbacks). Moods are not
levels: a calmer-sounding set can replace a fuller one, so a mood can take voices away.

| Mood | When (`src/game/music.js`) | Holds after its reason is gone |
|---|---|---|
| `explore` | nothing below applies | |
| `treasure` | a reward site's chest (`map.rewardSites[].anchor`) within 6 cells and 3 up or down | 1 s |
| `sense` | a live enemy within 8 cells and 3 up or down | 2 s |
| `rise` | an enemy in `chase` or `attack` | 3 s |
| `fight` | an enemy in `chase` or `attack` within 4 cells; or blows within the last 6 s (an enemy in `attack`, its hp dropping, yours dropping) while an enemy is after you or sensed | 4 s |
| `boss` | a guardian in `chase` or `attack`, or hurt and within 12 cells | 5 s |

The highest mood that applies wins and takes over at once; a calmer one takes over only
after the current one's hold time.

Voices that are out are not scheduled at all. A joining voice comes in on the first sixteenth
at least 40 ms away. Its notes from there up to what the scheduler has already done (0.3 s
ahead) are played at once, and a note already sounding plays its remainder from the join,
so a switch is heard within about 0.2 s. A leaving voice fades out from the next beat.

## Songs

Each theme names its song (`music:` in `src/themes/`); the town and the merchant camp
(`map.enemyFree`) play `town` and depth 20 plays `core` (`songFor` in `src/game/music.js`).
`SONGS` in `src/themes/index.js` lists them all, for the test and `tools/player.html`; the
test also checks that every score in `music/` is one of them.

| Song | Depths | Key, tempo, meter | Sound | `sense` drums |
|---|---|---|---|---|
| `town` | town, merchant camp | G major, 100, 3/4 | clarinet and echo, guitar, accordion off-beats, upright bass; explore and treasure only | — |
| `overworld` | 0–2 meadow | E Dorian, 80 | marimba ostinato against the bar, music box echo, flute, bassoon | timpani, toms, shaker |
| `peaks` | 3 snowy peaks | B Dorian, 56, 6/8 | oboe and echo, harp with added seconds, high pad, bell | timpani, triangle, bodhran |
| `badlands` | 4 badlands, 5–6 deep canyon | A minor, Andalusian (Am G F E), 84 | whistled flute with a dotted-eighth echo, guitar, trumpet in the fight | woodblock gallop, low tom, shaker |
| `roots` | 7–8 root caves | D Dorian, 76 | clarinet and echo, pizz ostinato in 3+3+2, fretless bass, music box drips | timpani, bodhran, woodblock |
| `frozen` | 9–10 frozen caves, sunken grotto | F# minor, 72, 3/4 | low flute and echo, celesta arpeggios, vibes, a Phrygian G | timpani, rim, triangle |
| `swamp` | 11–12 fungal swamp, honey hive | G minor sevenths, 84, swung | oboe, bassoon, bubbling marimba, sliding fretless bass | conga, tumba, guiro |
| `nests` | 14–15 spider nests, ossuary | C minor with Db and Bdim, 100 | fiddle, scurrying harpsichord, low wordless choir | hi-hat ticking, tom heartbeat, timpani |
| `mines` | 16 crystal mines, dwarven forge | C Lydian, then A minor, 90 | flute and echo, vibes arpeggios, glockenspiel, hammering fretless bass | woodblock pickaxe, triangle, toms |
| `ruins` | 13 jungle cenote, 17 buried ruins | D Phrygian dominant, 70 | oboe and echo, harp, a choir drone on D and A; organ for a guardian | timpani, bodhran, rim |
| `volcanic` | 18 volcanic depths | C Phrygian, 84 | horn over a hammering pizz ostinato, tuba, an anvil bell; thunder for a guardian | taiko toms, timpani |
| `abyss` | 19 obsidian abyss | minor chords a tritone apart over an E pedal, 60 | choir, bell tolls, a broken music box | heartbeat, thunder, timpani, toms |
| `core` | 20 the core | E harmonic minor, 70 | the overworld's tune in minor, harp, organ, tuba, bell | timpani, toms |

Every song but the town has all six moods. Combat keeps the exploration tempo and meter,
but replaces gentle motion with two combat-only voices: `drive` (an accented, short-gated
ostinato) and `war` (denser battle drums with four-bar fills). Horns re-articulate the tune,
brass attacks on the downbeat, and crashes have more weight. These layers also stay in
`boss`, under its choir, organ or gong; no combat arrangement exceeds 12 active voices.
The exploration, treasure, sense and rise arrangements are unchanged, and town stays peaceful.

The tunes share the game's motif, scale degrees 1 2 3 5 4 (the overworld's E F# G B A), in
each song's own mode.
