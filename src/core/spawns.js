// Which enemies live at each depth and how many. docs/depths.md explains the plan.
// Each cube draws its population from its depth's row with its own seeded stream, so the
// terrain and the per-species placement streams (game/enemyspawn.js) are unaffected.
//   roster: [species, chance, lo, hi, pack, kinds]
//     chance: that the species is in a cube at all (1: always, unless `mix` cuts it)
//     lo..hi: how many when it is; pack: the largest group it spawns in (1: on its own)
//     kinds: which of the species' kinds (ENEMY_KINDS in core/enemies.js) and how often, as
//       { kind: weight }; each pack draws one (game/enemyspawn.js). Default: the species itself.
//       Stronger kinds take over deeper down, and each theme leans on the kinds that suit it.
//   mix: the most species one cube holds. If more roll present, the extra ones are dropped:
//     always-present species are kept first, the others in a random order weighted by chance.
//   The lead: one present species (picked by chance) dominates the cube. It draws its count
//     from the top half of its range, every other species from the bottom half.
// Ranged species (Fire-face, Triangle, Shraps, Spicy, Wolla, Wolk) stay at a few per cube; the melee ones, the spiders
// above all, come in larger and larger packs further down.
import { mulberry32, hash32 } from './util.js';
import { ENEMY_KINDS } from './enemies.js';

export const D = (mix, ...roster) => ({ mix, roster: roster.map(([type, chance, lo, hi, pack = 1, kinds = { [type]: 1 }]) =>
  ({ type, chance, lo, hi, pack, kinds })) });

export const DEPTH_SPAWNS = [
  /*  0 road out of town */ D(1, ['snake', 1, 1, 2]),
  /*  1 meadow islands */ D(2, ['snake', 1, 2, 4], ['stunder', .2, 1, 1], ['wolk', .25, 1, 1]),
  /*  2 meadow islands */ D(3, ['snake', 1, 2, 5, 1, { snake: 4, sandviper: 1 }], ['spider', .6, 2, 4, 2], ['stunder', .25, 1, 1],
    ['wolk', .35, 1, 2]),
  /*  3 snowy peaks */ D(3, ['spider', 1, 8, 14, 3, { frostspider: 3, spider: 1 }], ['stunder', .5, 1, 2, 1, { froststunder: 1 }], ['shraps', .2, 1, 1],
    ['wolk', .4, 1, 2], ['triangle', .12, 1, 1]),
  /*  4 badlands */ D(3, ['snake', 1, 3, 6, 2, { sandviper: 3, snake: 1, bloodviper: .5 }], ['spider', .8, 4, 8, 3, { spider: 2, redback: .5 }],
    ['stunder', .6, 1, 2, 1, { stonestunder: 1, stunder: 1 }]),
  /*  5 deep canyon */ D(3, ['snake', 1, 4, 7, 2, { sandviper: 3, snake: 1, bloodviper: .5 }], ['spider', .8, 5, 9, 3, { spider: 2, redback: .5 }],
    ['stunder', .6, 1, 2, 1, { stonestunder: 2, stunder: 1 }], ['wolk', .35, 1, 2], ['wolla', .25, 1, 2, 1, { stormwolla: 1, wolla: 1 }]),
  /*  6 deep canyon */ D(3, ['snake', 1, 5, 8, 2, { sandviper: 2, snake: 1, bloodviper: 1 }], ['spider', .8, 6, 10, 3, { spider: 2, redback: 1 }],
    ['stunder', .6, 1, 3, 1, { stonestunder: 2, stunder: 1 }], ['wolk', .4, 1, 2], ['wolla', .35, 1, 2, 1, { stormwolla: 1, wolla: 1 }],
    ['octonaut', .15, 1, 1]),
  /*  7 root caves */ D(3, ['spider', 1, 7, 12, 3, { spider: 3, bogspider: 1, redback: .5 }], ['snake', .8, 4, 7, 2, { snake: 1, sandviper: 2, bloodviper: .5 }],
    ['stunder', .6, 1, 2, 1, { stunder: 2, stonestunder: 1 }], ['wolla', .35, 1, 2], ['octonaut', .2, 1, 1]),
  /*  8 root caves */ D(3, ['spider', 1, 8, 13, 3, { spider: 3, bogspider: 1, redback: 1 }], ['snake', .8, 4, 8, 2, { snake: 1, sandviper: 2, bloodviper: 1 }],
    ['stunder', .6, 1, 3, 1, { stunder: 2, stonestunder: 1 }], ['wolla', .45, 1, 2], ['octonaut', .25, 1, 2]),
  /*  9 frozen caves, sunken grotto */ D(3, ['octonaut', 1, 3, 4], ['shraps', .8, 1, 3], ['spider', .8, 6, 10, 3, { frostspider: 3, spider: 1 }],
    ['stunder', .5, 1, 2, 1, { froststunder: 1 }], ['snake', .3, 3, 5, 2, { frostadder: 3, snake: 1 }]),
  /* 10 frozen caves, sunken grotto */ D(3, ['octonaut', 1, 3, 5, 2, { octonaut: 3, coraloctonaut: 1 }], ['shraps', .9, 2, 3], ['spider', .8, 7, 12, 4, { frostspider: 3, spider: 1 }],
    ['stunder', .6, 1, 2, 1, { froststunder: 2, stonestunder: 1 }], ['triangle', .15, 1, 1]),
  /* 11 fungal swamp, honey hive */ D(3, ['snake', 1, 6, 10, 3, { venomadder: 2, snake: 2, bloodviper: 1 }], ['octonaut', .8, 2, 4, 2, { bogoctonaut: 3, octonaut: 1 }],
    ['spicy', .6, 1, 2], ['wolla', .35, 1, 2, 1, { bogwolla: 3, wolla: 1 }],
    ['spider', .6, 6, 10, 4, { bogspider: 3, spider: 1 }], ['stunder', .25, 1, 2]),
  /* 12 fungal swamp, honey hive */ D(3, ['snake', 1, 7, 12, 3, { venomadder: 2, snake: 1, bloodviper: 1 }], ['octonaut', .8, 3, 5, 2, { bogoctonaut: 3, octonaut: 1 }],
    ['spicy', .8, 1, 3], ['wolla', .5, 1, 2, 1, { bogwolla: 3, wolla: 1 }],
    ['spider', .6, 8, 12, 4, { bogspider: 3, spider: 1 }], ['fireface', .1, 1, 1]),
  /* 13 jungle cenote */ D(3, ['snake', 1, 8, 12, 3, { venomadder: 1, bloodviper: 2, shadowmamba: .5 }], ['octonaut', .8, 3, 5, 2, { coraloctonaut: 2, bogoctonaut: 1 }],
    ['spicy', .6, 1, 2], ['triangle', .4, 1, 2, 1, { emeraldtriangle: 2, triangle: 1 }], ['wolla', .3, 1, 2, 1, { stormwolla: 1, bogwolla: 1 }],
    ['spider', .3, 10, 14, 4, { bogspider: 1, redback: 1 }]),
  /* 14 spider nests, ossuary */ D(3, ['spider', 1, 18, 26, 6, { spider: 3, bogspider: 1, redback: 1.5 }], ['stunder', .5, 1, 2, 1, { stunder: 1, stonestunder: 1 }],
    ['octonaut', .3, 1, 2, 1, { octonaut: 1, bogoctonaut: 1, coraloctonaut: .5 }], ['snake', .3, 4, 6, 3, { venomadder: 1, bloodviper: 1 }],
    ['spicy', .25, 1, 2]),
  /* 15 spider nests, ossuary */ D(3, ['spider', 1, 20, 28, 7, { spider: 2, bogspider: 1, redback: 2 }], ['stunder', .6, 1, 3, 1, { stunder: 1, stonestunder: 1 }],
    ['octonaut', .4, 1, 2, 1, { octonaut: 1, bogoctonaut: 1, coraloctonaut: .5 }], ['triangle', .15, 1, 1]),
  /* 16 crystal mines, dwarven forge */ D(3, ['triangle', 1, 2, 3, 1, { emeraldtriangle: 2, triangle: 1 }], ['stunder', .7, 1, 3, 1, { stonestunder: 1 }],
    ['octonaut', .7, 2, 5, 2, { octonaut: 1, coraloctonaut: 1 }], ['wolla', .5, 1, 3, 1, { stormwolla: 2, bogwolla: 1 }],
    ['spider', .5, 10, 14, 4, { spider: 2, frostspider: 1, redback: 1 }], ['firecat', .1, 1, 1]),
  /* 17 buried ruins */ D(3, ['triangle', .8, 1, 3, 1, { triangle: 1, emeraldtriangle: 1, crimsontriangle: 1 }], ['octonaut', .8, 3, 6, 2, { coraloctonaut: 2, bogoctonaut: 1 }],
    ['snake', .6, 10, 14, 4, { bloodviper: 2, shadowmamba: 1.5 }], ['firecat', .5, 2, 3, 2], ['spider', .4, 10, 16, 5, { redback: 1, spider: 1 }]),
  /* 18 volcanic depths */ D(4, ['fireface', 1, 1, 3], ['firecat', 1, 3, 5, 2], ['shraps', .7, 1, 3, 1, { fireshraps: 1 }],
    ['stunder', .6, 1, 3, 1, { magmastunder: 1 }], ['snake', .4, 10, 14, 4, { shadowmamba: 2, bloodviper: 1 }],
    ['wolla', .4, 1, 2, 1, { emberwolla: 1 }], ['spider', .25, 14, 20, 6, { redback: 1 }]),
  /* 19 obsidian abyss */ D(3, ['fireface', 1, 2, 3], ['firecat', 1, 5, 8, 3], ['shraps', .4, 1, 2, 1, { fireshraps: 1 }],
    ['triangle', .6, 1, 2, 1, { crimsontriangle: 2, triangle: 1 }], ['wolla', .4, 1, 2, 1, { emberwolla: 2, stormwolla: 1 }],
    ['stunder', .4, 1, 2, 1, { magmastunder: 2, stonestunder: 1 }]),
  /* 20 the core */ D(4, ['firecat', 1, 5, 9, 3], ['fireface', 1, 2, 4], ['triangle', .8, 2, 3, 1, { crimsontriangle: 2, triangle: 1 }],
    ['stunder', .5, 2, 3, 1, { magmastunder: 2, stonestunder: 1 }], ['spider', .3, 18, 26, 8, { redback: 2, spider: 1 }]),
];
export const spawnsAt = depth => DEPTH_SPAWNS[Math.min(DEPTH_SPAWNS.length - 1, Math.max(0, depth | 0))];

const SALT = 0x3e1a5c7;
// the cube's population: species -> { count, pack, lead, kinds }; species not in it are absent.
// map.spawns (a row like the ones above) replaces the depth's row, for test arenas.
export function population(map) {
  if (map.enemyFree) return new Map();
  // a boss's arena (core/bosses.js): the boss alone; `also`: the kinds it brings along (its minions)
  const boss = map.guardian?.boss && ENEMY_KINDS[map.guardian.boss];
  if (boss) return new Map([[boss.species, { count: 1, pack: 1, lead: true, kinds: { [boss.type]: 1 },
    also: (boss.attacks ?? []).flatMap(a => a.summon ? [a.summon.kind] : []) }]]);
  if (map.horde) {
    const { kind, count } = map.horde, base = ENEMY_KINDS[kind];
    const ordinary = population({ ...map, horde: null, populationScale: 1 });
    const budget = [...ordinary.values()].reduce((sum, p) => {
      const weights = Object.entries(p.kinds), total = weights.reduce((n, [, w]) => n + w, 0);
      return sum + p.count * weights.reduce((n, [k, w]) => n + ENEMY_KINDS[k].xp * w, 0) / total;
    }, 0);
    return new Map([[base.species, { count, pack: count, lead: true, kinds: { [kind]: 1 },
      swarm: true, rewardScale: Math.min(1, budget / (count * base.xp)) }]]);
  }
  const R = mulberry32(hash32(map.seed ^ SALT)), row = map.spawns ?? spawnsAt(map.depth || 0);
  const rolled = [];
  for (const e of row.roster) if (R() < e.chance) rolled.push({ e, key: e.chance >= 1 ? 1 + R() : R() ** (1 / e.chance) });
  let present = rolled.sort((a, b) => b.key - a.key).slice(0, row.mix).map(r => r.e);
  if (!present.length) present = [row.roster[0]];
  let w = R() * present.reduce((n, e) => n + e.chance, 0), lead = present[present.length - 1];
  for (const e of present) if ((w -= e.chance) < 0) { lead = e; break; }
  return new Map(present.map(e => {
    const mid = (e.lo + e.hi) / 2, lo = e === lead ? Math.ceil(mid) : e.lo, hi = e === lead ? e.hi : Math.floor(mid);
    const rolledCount = lo + Math.floor(R() * (hi - lo + 1));
    const count = Math.max(1, Math.round(rolledCount * (map.populationScale ?? 1)));
    return [e.type, { count: count * (map.guardian ? 2 : 1), pack: e.pack, lead: e === lead, kinds: e.kinds }];
  }));
}

// the species a cube's enemies can be: its population's and the kinds its packs draw from (a
// guardian and a horde are of these too, game/enemyspawn.js); their models are loaded before
// the cube is entered (render/cubeassets.js)
export function speciesIn(map) {
  const out = new Set();
  for (const [type, spec] of population(map))
    for (const k of [type, ...Object.keys(spec.kinds ?? {}), ...spec.also ?? []]) if (ENEMY_KINDS[k]) out.add(ENEMY_KINDS[k].species);
  return [...out];
}
