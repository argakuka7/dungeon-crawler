// Structure geometry: heights from the smoothed floors at both ends, bridge styles,
// sag, bases of stairs / landings and supporting pillars.
import { LH, SHEAD, OPP, EDGE_CORNERS } from '../core/constants.js';
import { runY } from '../core/surfaces.js';
import { buildOf } from '../themes/builds.js';
import { themeAt } from '../themes/depth.js';
import { spanSag } from './span.js';

export function shapeStructures(ctx) {
  const { R, cols, pieces, runs, pathFloors } = ctx;
  // the depth's bridge styles by weight (stone arches only over ground close below)
  const weights = Object.entries(buildOf(themeAt(ctx.spec.depth ?? 0)).bridges);
  const bridgeStyle = (solid, R) => {
    const w = weights.filter(([s]) => solid || s !== 'stone');
    let r = R() * w.reduce((a, [, v]) => a + v, 0);
    for (const [s, v] of w) if ((r -= v) < 0) return s;
    return 'plank';
  };
  const edgeY = (n, d) => { if (n.landing) return n.top * LH; const [a, b] = EDGE_CORNERS[d]; return (n.cs[a] + n.cs[b]) / 2; };
  const floorBelow = (c, y) => { let g = null; for (const f of cols[c]) if (f.top * LH <= y + 0.01) g = f; return g; };
  const groundY = g => g ? (g.fluid ? g.surf * LH : Math.min(...g.cs)) : 0;
  const pathCols = new Set(pathFloors.map(f => f.c));
  const pillar = (run, c, cx, cz, hx, hz, bottom, top) => {
    if (top - bottom < 0.05) return;
    const p = { kind: 'pillar', c, run, x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, bottom, top };
    pieces[c].push(p); (run.pillars ||= []).push(p);
  };
  const pieceEnds = p => {
    if (p.kind === 'landing') { p.y0 = p.y1 = p.run.y0; return; }
    const neg = p.dx < 0 || p.dz < 0;
    p.y0 = runY(p, neg ? 1 : 0, neg ? 1 : 0); p.y1 = runY(p, neg ? 0 : 1, neg ? 0 : 1);
  };

  for (const r of runs) {
    if (r.kind === 'landing') { r.c = r.cells[0]; r.y0 = r.y1 = r.ymid = r.from.top * LH; }
    else { r.y0 = edgeY(r.from, r.d); r.y1 = edgeY(r.to, OPP[r.d]); r.ymid = (r.y0 + r.y1) / 2; }
  }
  for (const r of runs) r.pieces.forEach(pieceEnds);

  for (const r of runs) {
    if (r.kind === 'landing') {
      const y = r.y0, sup = floorBelow(r.c, y - 0.5), p = r.pieces[0];
      const supported = sup && y - sup.top * LH < SHEAD * LH;
      p.base = supported ? groundY(sup) : y - 0.35;
      if (!supported && !pathCols.has(r.c)) pillar(r, r.c, 0.5, 0.5, 0.17, 0.17, groundY(sup), y - 0.35);
      continue;
    }
    const k = r.k;
    if (r.kind === 'bridge') {
      // stone arches over solid ground nearby, otherwise a (sagging) plank bridge
      const deckLo = Math.min(r.y0, r.y1) - 0.25;
      const below = r.pieces.map(p => floorBelow(p.c, deckLo));
      const solid = below.every(g => g && !g.fluid && deckLo - groundY(g) < 4)
        && r.pieces.every(p => !pathCols.has(p.c) && !pieces[p.c].some(q => q.run !== r && q.kind !== 'pillar' && Math.min(q.y0, q.y1) < deckLo));
      r.style = bridgeStyle(solid, R);
      if (r.style === 'plank' && k >= 2) r.sag = Math.min(0.22, 0.05 * k);
      if (r.style === 'rope' && k >= 2) r.sag = Math.min(0.4, 0.09 * k);   // rope bridges hang deeper
      if (r.span) { r.style = ctx.spec.span.style; r.sag = spanSag(r.style, k); }   // a span's long bridge (span.js)
      if (r.sag) r.pieces.forEach(pieceEnds);
    }
    r.pieces.forEach(p => {
      const lo = Math.min(p.y0, p.y1), sup = floorBelow(p.c, lo);
      p.ground = groundY(sup);
      p.supported = r.kind === 'stair' && !!sup && lo - sup.top * LH < SHEAD * LH;
      p.base = p.supported ? p.ground : lo - 0.4;
    });
    if (r.kind !== 'bridge') continue;
    // supports under bridges: stone piers between arches, timber legs under long plank spans
    if (r.style === 'stone') {
      const nArch = Math.ceil(k / 3);
      r.splits = [];
      for (let i = 1; i < nArch; i++) r.splits.push(Math.round(i * k / nArch) - 0.5);
      for (const s of r.splits) {
        const p = r.pieces[Math.floor(s)];
        pillar(r, p.c, 0.5, 0.5, r.dx ? 0.2 : 0.42, r.dx ? 0.42 : 0.2, p.ground, runY(p, 0.5, 0.5) - 0.3);
      }
    } else if (r.span && r.style !== 'rope' && !ctx.spec.span.sky) {   // tall trestles under a span's long bridge
      for (const j of [Math.round(k / 3), Math.round(2 * k / 3)]) {
        const p = r.pieces[j];
        for (const w of [-0.36, 0.36]) pillar(r, p.c, 0.5 + (r.dz ? w : 0), 0.5 + (r.dx ? w : 0), 0.09, 0.09, p.ground, runY(p, 0.5, 0.5) - 0.2);
      }
    } else if (k >= 3 && r.style !== 'rope' && !r.span) {   // rope bridges just hang
      r.pieces.forEach((p, j) => {
        const top = runY(p, 0.5, 0.5) - 0.2;
        // not where another structure passes underneath (the legs would stand in its way)
        const under = pieces[p.c].some(q => q.run !== r && q.kind !== 'pillar' && Math.min(q.y0, q.y1) < top);
        if (j % 2 === 1 && top - p.ground < 3.5 && !pathCols.has(p.c) && !under)
          for (const w of [-0.38, 0.38]) pillar(r, p.c, 0.5 + (r.dz ? w : 0), 0.5 + (r.dx ? w : 0), 0.06, 0.06, p.ground, top);
      });
    }
  }
}
