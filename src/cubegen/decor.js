// Decorative extras off the route: a few stairs and bridges that lead nowhere in particular.
// Never onto a spiral's ramp, a lone peak or a trial's ground (their ways up are the ramp and the ladder), nor in a
// large area onto the rim (once both sides are visited its inner faces open, and that would be a
// way into the next cube).

export function addDecor(ctx, canPlace, place) {
  const { ri, floors, movesFrom } = ctx;
  if (ctx.spec.sparse) return;   // a mostly empty set piece (cubegen/setpieces.js)
  // (nor onto a trial's own ground, cubegen/trials/: the flood's summit is climbed by its ramp)
  const off = f => !f.landing && (ctx.ramp?.has(f.c) || ctx.peakTop?.has(f.c) || (ctx.spec.area && ctx.border(f)) || ctx.trialKeep?.has(f.c));
  let ds = ri(1, 3), db = ri(0, 2), tries = 0;
  while ((ds > 0 || db > 0) && tries++ < 300) {
    const f = floors[ri(0, floors.length - 1)];
    if (f.fluid || f.prot) continue;
    const mvs = movesFrom(f, false).filter(m => ((m.kind === 'stair' && ds > 0) || (m.kind === 'bridge' && db > 0)) && !off(m.from) && !off(m.to));
    if (!mvs.length) continue;
    const m = mvs[ri(0, mvs.length - 1)];
    if (!canPlace(m)) continue;
    place(m);
    if (m.kind === 'stair') ds--; else db--;
  }
}
