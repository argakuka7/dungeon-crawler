// All built structures: stairs, landings, bridges and visible fences.
import { buildStair, buildLanding } from './stairs.js';
import { BRIDGES, buildPlankBridge } from './bridges.js';
import { POST, RAIL } from './palette.js';
import { buildLadder } from './ladders.js';

export function buildStructures(m, layers) {
  for (const r of m.runs) {
    const L = layers[r.layer];
    if (r.kind === 'landing') buildLanding(r, L);
    else if (r.kind === 'stair') buildStair(r, L);
    else (BRIDGES[r.style] || buildPlankBridge)(r, L);
  }
  for (const l of m.ladders || []) buildLadder(l, layers[l.layer]);
  // wooden fences: posts follow the surface, rails are sloped beams
  for (const f of m.fenceList) {
    if (!f.show) continue;
    const W = layers[f.layer].wood;
    for (const [px, py, pz] of f.pts) W.box(px - 0.045, py, pz - 0.045, px + 0.045, py + 0.5, pz + 0.045, POST, POST);
    for (let s = 0; s + 1 < f.pts.length; s++) {
      const p = f.pts[s], q = f.pts[s + 1];
      for (const ry of [0.2, 0.4]) W.beam([p[0], p[1] + ry, p[2]], [q[0], q[1] + ry, q[2]], 0.05, 0.06, RAIL);
    }
  }
}
