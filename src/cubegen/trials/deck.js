// A puzzle's deck (docs/trials.md "Puzzles"): a flat field of w x h cells at one level, a rim
// round it (RIM levels up: nobody climbs or jumps it) with gaps where the puzzle says (its entry,
// its goal's gate), and a walkway two cells wide round that, all kept (no slabs, sites, pools or
// props) and nothing built onto the rim or the field (the puzzle is the only way in).
//   deck: { x0, z0 (the field's first cell), w, h, level, field: [cells], rim: [cells], walk: [cells],
//           cell(x, z) (field coordinates -> cube cell), side(towards) (the rim side nearest a point) }
import { N } from '../../core/constants.js';
import { idx, clamp } from '../../core/util.js';

export const RIM = 3;
const SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// the cube cell just outside the field's side `side` at position t along it (a rim cell)
export const rimCell = (d, side, t) => {
  const [x, z] = [[d.w, t], [-1, t], [t, d.h], [t, -1]][side];
  return idx(d.x0 + x, d.z0 + z);
};
// the field cell at the edge of side `side` at position t
export const edgeOf = (d, side, t) => [[d.w - 1, t], [0, t], [t, d.h - 1], [t, 0]][side];

// Lay a deck of w x h into the room, as far from the portals' pads as it fits; null: none fits.
// towards: the point (cells) the entry side should face (the way in)
export function placeDeck(ctx, w, h, towards) {
  const { lvl0, void0, R } = ctx;
  const pads = ctx.spec.portals.filter(p => p.dir < 4).map(p => [[N - 2, p.pos], [1, p.pos], [p.pos, N - 2], [p.pos, 1]][p.dir]);
  const options = [];
  // the rim (w + 2 by h + 2) inside cells 2..13 (the walkway round it inside 1..14 where it can)
  for (let rz = 2; rz + h + 1 <= 13; rz++) for (let rx = 2; rx + w + 1 <= 13; rx++) {
    const cx = rx + (w + 2) / 2, cz = rz + (h + 2) / 2;
    const near = Math.min(...pads.map(([px, pz]) => Math.max(Math.abs(px - cx) - (w + 2) / 2, Math.abs(pz - cz) - (h + 2) / 2)));
    if (near < 2) continue;
    options.push({ rx, rz, score: near + R() * 2 });
  }
  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score);
  const { rx, rz } = options[0], x0 = rx + 1, z0 = rz + 1;
  const field = [], rim = [], walk = [];
  for (let z = rz - 2; z <= rz + h + 3; z++) for (let x = rx - 2; x <= rx + w + 3; x++) {
    if (x < 1 || z < 1 || x > N - 2 || z > N - 2) continue;
    const inField = x >= x0 && z >= z0 && x < x0 + w && z < z0 + h, inRim = x >= rx && z >= rz && x <= rx + w + 1 && z <= rz + h + 1;
    (inField ? field : inRim ? rim : walk).push(idx(x, z));
  }
  const all = [...field, ...rim, ...walk];
  const level = clamp(Math.round(all.reduce((s, c) => s + lvl0[c], 0) / all.length), 3, 10);
  // (the walkway is flat ground like any other: a vault's reward site may stand on it)
  for (const c of all) { void0[c] = 0; lvl0[c] = level; if (!walk.includes(c)) ctx.keep.add(c); }
  for (const c of rim) lvl0[c] = level + RIM;
  const deck = { x0, z0, w, h, level, field, rim, walk, cell: (x, z) => idx(x0 + x, z0 + z) };
  // the side of the field facing a point
  deck.side = ([px, pz]) => {
    const cx = x0 + w / 2, cz = z0 + h / 2, dx = px - cx, dz = pz - cz;
    return Math.abs(dx) / w > Math.abs(dz) / h ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3);
  };
  ctx.trialKeep = new Set(all);
  ctx.noBuild = new Set([...field, ...rim]);   // (nothing built onto the rim or the field)
  ctx.noFence = new Set([...field, ...rim]);
  return deck;
}

// open a gap in the rim beside field cell (x, z) on side `side` (back down to the deck's level)
export function openGap(ctx, deck, x, z, side) {
  const [dx, dz] = SD[side], c = idx(deck.x0 + x + dx, deck.z0 + z + dz);
  ctx.lvl0[c] = deck.level;
  ctx.noBuild.delete(c);
  return c;
}

// a puzzle room's ways: no structure onto the rim or the field (walks and drops only)
export function deckRoute(ctx) {
  const movesFrom = ctx.movesFrom, no = f => !f.landing && ctx.noBuild?.has(f.c);
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => m.kind === 'walk' || m.kind === 'drop' || (!no(f) && !no(m.to)
    && !m.cells.some(c => ctx.noBuild.has(c))));
}
