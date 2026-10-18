// Gusto's fight as rules (game/gusto.js runs it; his profiles are in core/enemies.js, GUSTO
// and GUSTO_SPLIT). docs/bosses.md tells the whole fight.
//
// Phase 1: he grabs and throws, and spits Custo triangles: a summon fills up to three of them.
// At half his health he stops (no blow takes him below it) and splits: for `splitTime` nothing
// hurts him while he shudders, then three of him appear, apart, away from the players. Two are
// his proxies: they look the same, fight the same (grab, vortex, summon) and show his health,
// but any hit, however small, makes one go up in a cloud.
// Phase 2: he summons up to two triangles at a time. Once both proxies are gone he can still be
// hit for `window` seconds, then he vanishes, and `gone` seconds later he and two new proxies
// appear somewhere else. Only he can die, and his death takes his proxies and triangles along.
export const GUSTO_FIGHT = Object.freeze({
  split: 0.5,             // the share of his health he splits at
  splitTime: 1.8,         // s he shudders before the three of him appear
  minions: [3, 2],        // the most Custo triangles at once, phase 1 / 2: a summon fills up to that
  summonCool: [7, 8],     // s from one summon to the next, phase 1 / 2
  firstSummon: 1.5,       // s before his first summon
  proxies: 2,
  window: 1,              // s he can still be hit after his last proxy went
  gone: 1.3,              // s he is away
  appear: 0.5,            // s nothing hurts the three after they appear
  apart: 3,               // cells: the least between the three and from the players, where the arena allows
  leave: 0.5,             // s a proxy or a triangle he takes along lingers, gone, before it is let go
});

// the health he splits at (and cannot be taken below before)
export const splitHp = maxHp => Math.ceil(maxHp * GUSTO_FIGHT.split);
// how many Custo triangles a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, GUSTO_FIGHT.minions[phase - 1] - alive);
// where a grab holds the caught body at attack time t (model space: x, up, forward), along the
// clip's grip path (core/enemies.js GUSTO, `grab`)
export function gripAt(grab, hitAt, t) {
  const g = grab.grip, u = Math.max(0, (t - hitAt) / grab.step), i = Math.min(g.length - 1, Math.floor(u));
  const j = Math.min(g.length - 1, i + 1), k = Math.min(1, u - i);
  return g[i].map((v, n) => v + (g[j][n] - v) * k);
}
