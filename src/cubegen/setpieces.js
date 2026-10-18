// The set-piece cubes (world/heights.js planSetPiece): mostly empty rooms built round one thing
// (spec.sparse: few props, render/propplace.js).
//   peak   a flat field with a steep block of rock in the middle; a ladder goes up it to the
//          discovery on top (stairs, ramps and bridges onto it cost more: setPieceRoute)
//   lake   water from shore to shore; the route keeps to the dry shore round it (every fluid is
//          deadly), and a discovery waits on an islet, reached by a bridge
// Neither has slabs (one layer) or cave pillars.
import { N, MAX_L } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';

const inner = fn => { for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z)); };
const ring = (x, z) => Math.min(x, z, N - 1 - x, N - 1 - z);   // 0 on the cube's outer ring

// learn: world.html#heights (see learn/README.md)
export function shapePeak(ctx) {
  const { spec, lvl0, void0 } = ctx, p = spec.peak, top = ctx.peakTop;
  const onTop = (x, z) => x >= p.x && z >= p.z && x < p.x + p.side && z < p.z + p.side;
  const off = (x, z) => Math.max(p.x - x, x - (p.x + p.side - 1), p.z - z, z - (p.z + p.side - 1));   // cells from the block
  let sum = 0, n = 0;
  inner((x, z, i) => { if (!onTop(x, z)) { sum += lvl0[i]; n++; } });
  const foot = clamp(Math.round(sum / n), 3, 8), level = ctx.pinnacleTop = Math.min(MAX_L - 1, foot + p.rise);
  inner((x, z, i) => {
    void0[i] = 0;
    if (onTop(x, z)) { lvl0[i] = level; top.add(i); ctx.keep.add(i); return; }
    // a flat ring round its foot (where the ladder stands), the rest of the field worn flat (not the
    // foot of a cave's walls)
    if (off(x, z) <= 1) { lvl0[i] = foot; ctx.keep.add(i); }
    else if (ring(x, z) >= 2) lvl0[i] = clamp(lvl0[i], foot - 1, foot + 1);
  });
  ctx.stats.mode = spec.kind + ' / lone peak';
}

// the way up the peak is its ladder: stairs, bridges and jumps onto or off the top cost more; over
// the lake's water nothing jumps (a missed jump is a fall into it: the islet's way is a bridge,
// a stair onto or off it costs more)
export function setPieceRoute(ctx) {
  const movesFrom = ctx.movesFrom, isle = f => ctx.islet?.has(f.c);
  if (ctx.spec.lake) ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => m.kind !== 'jump')
    .map(m => m.kind === 'stair' && isle(m.to) !== isle(f) ? { ...m, cost: m.cost + 40 } : m);
  if (!ctx.peakTop?.size) return;
  const on = f => ctx.peakTop.has(f.c);
  // (both ways: a stair down off the top would be a way up too)
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).map(m => ['ladder', 'walk', 'drop'].includes(m.kind) || on(m.to) === on(f)
    ? m : { ...m, cost: m.cost + 40 });
}

// learn: world.html#heights (see learn/README.md)
export function shapeLake(ctx) {
  const { spec, lvl0, void0, noise } = ctx, islet = spec.lake.islet, shore = [];
  inner((x, z, i) => { if (ring(x, z) === 2) shore.push(lvl0[i]); });
  // the islet stands about as high as the shore, so a bridge reaches it
  const level = clamp(Math.round(shore.reduce((a, b) => a + b, 0) / shore.length), 4, 10);
  const away = (x, z) => islet ? Math.hypot(x + 0.5 - islet.x - 0.5, z + 0.5 - islet.z - 0.5) : Infinity;
  inner((x, z, i) => {
    void0[i] = 0; ctx.keep.add(i);   // (no pools on the shore)
    const d = away(x, z);
    if (d < (islet?.r ?? 0)) { lvl0[i] = level; ctx.islet.add(i); return; }
    // water from three cells in (four in places), and all round the islet
    if (ring(x, z) >= 3 + (noise(x * 0.4 + 11, z * 0.4 + 5) > 0.62 ? 1 : 0) || d < (islet ? islet.r + 1.5 : 0)) { lvl0[i] = 0; ctx.seaCells.push(i); }
  });
  ctx.isletLevel = level;
  ctx.stats.mode = spec.kind + ' / great lake' + (islet ? ' with an islet' : '');
}
