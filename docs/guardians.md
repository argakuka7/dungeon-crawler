# Guardian gates and descent boss placeholders

Every descent at depths 0–19 is guarded. Each route also contains **one or two
mandatory sideways guardians**, selected by the world seed. The core (depth 20)
has an up portal but no further descent or guardians.

## Pacing and topology

`world/layout.js` builds a **7–14-room route**, counting the entry and descent
rooms, on every stratum, including the surface. The core's entry-to-centre route
is 7–9 rooms. Optional one-room branches fit inside a maximum of 14 total rooms
per stratum. The safe town → merchant camp → countryside prefix is preserved.

Side arenas have one entrance and one onward side gate; descent arenas have one
entrance and a well. There are no portal loops around arenas. Discovered adjacent
rooms only open full-face shortcuts within a route section or along real portal
links: non-linked sections remain sealed. Discovery through a fall cannot open a
locked guardian face. Lock checks apply to portal charging, full-face crossings
and direct/debug travel. Up portals remain usable; the approach permits retreat.

## Recognizable encounter tiers

Each species has two distinct registered kinds, excluded from ordinary rosters:

| Tier | Kind table | Indicators | Hook |
|---|---|---|---|
| Side guardian | `GUARDIAN_KINDS` | Hot-pink body/glow, pink HP bar, `◆ Side guardian` label | `guardianRole: 'side'` |
| Descent guardian | `DESCENT_GUARDIAN_KINDS` | Amber body/glow, wider amber HP bar, `♛ Descent guardian` label | `guardianRole: 'descent'`, `bossPlaceholder: true` |

A species may replace the pink and amber look with its own (`guardianLooks` on its profile,
[enemy-kinds.md](enemy-kinds.md#guardians)): the Wolk's guardians are a grey and a shining
silver cloud. The HP bar and the label keep the tier's colour.

`map.guardian.role` and `.bossPlaceholder`, spawn/enemy fields, kind profiles, and
onward marker `userData` expose these identifiers. The descent tier is explicitly
reserved for later replacement by a custom boss; no boss-specific AI exists yet.

Each tier sets level-1 floors (`GUARDIAN_TIERS` in `core/enemies.js`), so the promoted
species decides how a guardian fights, not how strong it is:

| Tier | Level | HP | Damage per second | XP | Poise | Drops |
|---|---|---|---|---:|---:|---|
| Side | depth + 1 | ≥ 550, ≥ 3.5× the species' | ≥ 9, ≥ 1.15× its blows | 260 | 1.4 s | a weapon (Uncommon+, Rare+ from level 10), a potion |
| Descent | depth + 2 | ≥ 1000, ≥ 6.5× the species' | ≥ 11.5, ≥ 1.45× its blows | 650 | 2 s | two weapons (Rare+ from level 5, Epic+ from 14), two potions |

Damage per second (`threat`) averages a species' blows over its attack cycle, so a quick
spider and a slow Triangle are about as dangerous. Every descent guardian outlasts every side
guardian at the same level and deals at least 20% more per second than its species' side
guardian. On the road out of town (depth 0) both stand at the road's level. At full damage per
second a side guardian takes about 6 s, a descent guardian about 12 s ([balance.md](balance.md)).
Poise: after a stagger, lighter blows do not stagger a guardian again for that long, so it
strikes back even under a stream of blows. Movement and attack timing remain species-specific.
Rewards scale with level.

## Encounter and persistence

- Double the ordinary seeded local population and promote exactly one member.
  Shared arena placement keeps bodies separate and fits the whole roster.
- The guardian stands two cells before its exit, facing inward. Defenders intercept
  advances, rally when it is hurt, and cannot all be lured towards the entrance.
- The locked exit glows red with a crossed seal, on side gates as well as wells.
  The minimap also marks locked exits red. Killing ordinary enemies is insufficient.
- Guardian death alone removes the seal and unlocks the gate for the current run.
  Death rollback, revisits, returns from below and late asset rebuilds never restore
  it. Ordinary kills retain visit/death rollback behaviour; a new run resets both.

`game/defence.js` coordinates intentions; existing species AI still owns movement
and attacks. At most a third of defenders can be drawn towards the entrance.
Committed attack wind-ups are not cancelled. Unlocking removes defence intentions.

## Generation

`cubegen/guardian.js` builds a dry single-layer arena, with both side pads forced
to the same ground level on both sides of their shared faces. All combat positions
connect without jumps, ladders, cramped slabs, rivers or blocking clutter. Rails
protect lower perimeter terrain. Void and waterfall shafts are disabled in arenas.

`map.guardian` retains the floor, position, approach, exit and portal ID.
`map.gateKeys` associates shared side faces with persistent gate identities;
`run.unlockedGates` stores unlocks independently of generated terrain.

## Checks

```sh
npm test
```

Layout tests sample 1,000 seeds across all depths, including full-discovery
shortcuts and each side guardian's mandatory cut. Arena tests cover both tiers,
shared pads, navigation/spacing, population, strength, retreat and persistence.
Browser checks exercise workers, assets, shaders, seals, charging and real travel:

```js
await (await import('./tests/browser/guardians.js')).runGuardianChecks();
await (await import('./tests/browser/guardians.js')).runSideGuardianChecks();
```
