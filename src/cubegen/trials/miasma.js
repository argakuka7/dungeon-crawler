// The sinking fog (docs/trials.md, `miasma`): a walled room of two layers; you come in up high
// (the entry portal on the top layer) onto a terrace, and the vent valve stands in a pit at the
// room's bottom, as far from the entry as fits. The fog fills the room from above and sinks; the
// route search builds the way down (cubegen/trials/index.js finishMiasma fits the fog to it).
import { N } from '../../core/constants.js';
import { idx } from '../../core/util.js';
import { edgeCell } from '../portals.js';

export function shapeMiasma(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'miasma', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / sinking fog`;
  const entry = spec.portals.find(p => p.dir === spec.trial.entry), exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!entry || !exit || !entry.layer) return;
  // the terrace: three rows in from the entry's face, five wide, at the entry's height
  const terrace = [];
  for (let t = entry.pos - 2; t <= entry.pos + 2; t++) for (let j = 1; j <= 3; j++) {
    const c = edgeCell(entry.dir, Math.max(1, Math.min(N - 2, t)), j);
    if (!terrace.includes(c)) terrace.push(c);
  }
  for (const c of terrace) { void0[c] = 0; lvl0[c] = entry.level; ctx.keep.add(c); }
  // the pit: 3 x 3, its floor two levels under the lowest ground round it, far from the entry and
  // off the exit's pad
  const [ex, ez] = [edgeCell(entry.dir, entry.pos, 1) % N, (edgeCell(entry.dir, entry.pos, 1) / N) | 0];
  const [xx, xz] = [edgeCell(exit.dir, exit.pos, 1) % N, (edgeCell(exit.dir, exit.pos, 1) / N) | 0];
  const spots = [];
  for (let z = 3; z <= N - 4; z++) for (let x = 3; x <= N - 4; x++) {
    const far = Math.max(Math.abs(x - ex), Math.abs(z - ez)), off = Math.max(Math.abs(x - xx), Math.abs(z - xz));
    if (far < 6 || off < 4) continue;
    spots.push({ x, z, score: far + R() * 3 });
  }
  if (!spots.length) return;
  spots.sort((a, b) => b.score - a.score);
  const { x: px, z: pz } = spots[0], pit = [], round = [];
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) (Math.max(Math.abs(dx), Math.abs(dz)) <= 1 ? pit : round).push(idx(px + dx, pz + dz));
  const low = Math.max(2, Math.min(exit.level, ...round.map(c => lvl0[c])) - 2);
  for (const c of pit) { void0[c] = 0; lvl0[c] = low; ctx.keep.add(c); }
  for (const c of round) { void0[c] = 0; lvl0[c] = Math.max(lvl0[c], low + 2); }
  ctx.trialKeep = new Set([...terrace, ...pit]);
  Object.assign(ctx.trialBuild, { failed: false, terrace, pit, valve: { c: idx(px, pz), level: low }, keep: [...ctx.trialKeep] });
}

// the goal of the way down: the valve's floor in the middle of the pit
export const miasmaGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.valve.c, 0);
