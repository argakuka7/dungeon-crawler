// Which kind of arena each guardian fights in (terrain: cubegen/arenashapes.js). Seeded per
// depth on its own stream, so routes and terrain are unaffected. Within a depth no two arenas
// share a type. Descents lean to the grander arenas, side gates to the wilder ones.
import { mulberry32, hash32 } from '../core/util.js';

export const ARENA_WEIGHTS = {
  descent: { colosseum: 3, dais: 3, crater: 2, henge: 2, courtyard: 2, gorge: 1, hills: 1, grove: 1 },
  side: { hills: 3, gorge: 3, henge: 2, grove: 2, crater: 2, courtyard: 2, colosseum: 1, dais: 1 },
};
// Underground, open woods and rolling meadows are rarer; ravines and ruined yards commoner.
const CAVE = { grove: .6, hills: .7, gorge: 1.3, courtyard: 1.3 };

export function planArenas(seed, layout) {
  const R = mulberry32(hash32(seed ^ Math.imul(layout.depth + 1, 0x2c1b3c6d) ^ 0xa4e9a));
  const cave = layout.theme.cave, used = new Set();
  for (const g of layout.guardians.values()) {
    const options = Object.entries(ARENA_WEIGHTS[g.role]).filter(([t]) => !used.has(t))
      .map(([t, w]) => [t, w * (cave ? CAVE[t] ?? 1 : 1)]);
    let r = R() * options.reduce((s, [, w]) => s + w, 0), type = options[0][0];
    for (const [t, w] of options) if ((r -= w) < 0) { type = t; break; }
    g.arena = type; used.add(type);
  }
  return layout;
}
