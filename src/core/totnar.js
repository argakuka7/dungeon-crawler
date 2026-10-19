// Totnar's fight as rules (game/totnar.js runs it; his profile is core/enemies.js TOTNAR).
// docs/bosses.md tells the whole fight.
//
// Three stages, one for each skull he still has. No blow takes him below the next stage's
// share of his health (`stages`); there he loses a skull (and a shell of his sticks): for
// `shedTime` nothing hurts him while it bursts off, the light comes back, and he fights on with
// the next stage's attacks (`attacks`):
//   1 (three skulls)  he throws skulls (each comes to life where it lands: a snapping skull) and
//                     makes it dark
//   2 (two skulls)    as before, and he pours out twig spiders by the dozen and rolls at you
//   3 (one skull)     lightning out of the sky instead, and bramble Stunders
// The light: all fight long he makes it dark (the gloom, a cast) and, after a while, light
// again (the same cast), each time the dark or the light has lasted its while (`dark`, `light`).
// When he loses a skull it is light at once, for `shedLight` s at least.
export const TOTNAR_FIGHT = Object.freeze({
  stages: [2 / 3, 1 / 3],   // the share of his health he loses a skull at: into stage 2, into stage 3
  shedTime: 1.6,            // s a skull bursts off him, nothing hurting him meanwhile
  attacks: [['throw', 'gloom'], ['throw', 'gloom', 'spiders', 'roll'], ['storm', 'gloom', 'stunders']],
  firstDark: 3,             // s into the fight before he first makes it dark
  light: [5, 9],            // s the light lasts (least, most) before he makes it dark again
  dark: [8, 13],            // s the dark lasts before he lets the light back
  shedLight: 6,             // s it stays light after he lost a skull
  skulls: 4,                // the most snapping skulls about at once
  skullLife: 7,             // s a snapping skull lasts, then it crumbles (core/enemies.js SNAP_SKULL)
  minions: { spiders: 11, stunders: 2 },   // the most twig spiders / bramble Stunders: a summon fills up to that
  summonCool: 9,            // s from one summon to the next
  firstSummon: 1.5,         // s into a stage before its first summon
  leave: 0.5,               // s a minion he takes along (or a crumbled skull) lingers, gone, before it is let go
});
const ALL = ['throw', 'gloom', 'spiders', 'roll', 'storm', 'stunders'];

// the health below which no blow takes him in stage `stage` (0 in the last)
export const stageFloor = (maxHp, stage) => stage <= TOTNAR_FIGHT.stages.length ? Math.ceil(maxHp * TOTNAR_FIGHT.stages[stage - 1]) : 0;
// how many minions a summon (`spiders` or `stunders`) brings with `alive` of them about
export const summonCount = (name, alive) => Math.max(0, (TOTNAR_FIGHT.minions[name] ?? 0) - alive);
// how long the dark (dark: true) or the light lasts this time, for r in 0..1
export function spell(dark, r) {
  const [a, b] = dark ? TOTNAR_FIGHT.dark : TOTNAR_FIGHT.light;
  return a + (b - a) * r;
}
// The attacks he may not start now (names): those of the other stages; the gloom unless it is
// due, and then nothing else; a summon unless it is due.
export function barred(stage, gloomDue, summonDue) {
  const mine = new Set(TOTNAR_FIGHT.attacks[stage - 1]);
  if (gloomDue) return new Set(ALL.filter(n => n !== 'gloom' || !mine.has(n)));
  return new Set(ALL.filter(n => !mine.has(n) || n === 'gloom' || !summonDue && (n === 'spiders' || n === 'stunders')));
}
