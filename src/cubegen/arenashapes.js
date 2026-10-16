// Guardian arena terrain. Each type turns the arena frame (entrance, guardian, gate and the
// cells that must stay flat) into relative levels and a fight zone:
//   rel:   levels above or below the entrance level (interior cells only)
//   zone:  1 where the fight happens (the encounter floors); everything else is scenery
//   crisp: a level change at this cell is a step, not a slope (terraces, walls)
//   ramp:  overrides crisp, so terraces stay connected by slopes
//   marks: where the type wants its focal clutter (cubegen/arenaprops.js)
// Scenery is never walkable from the zone: guardian.js raises it into walls or rails it off.
import { N } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inner = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
function each(fn) {
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z));
}
export function segDist(px, pz, [ax, az], [bx, bz]) {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
  const t = l ? clamp(((px - ax) * vx + (pz - az) * vz) / l, 0, 1) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
const polyDist = (x, z, pts) => Math.min(...pts.slice(1).map((p, i) => segDist(x, z, pts[i], p)));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const blank = () => ({ rel: new Int8Array(N * N), zone: new Uint8Array(N * N),
  crisp: new Uint8Array(N * N), ramp: new Uint8Array(N * N), marks: {} });
// Space for the doubled population: busy arenas get wider floors.
const roomy = fr => fr.need > 44 ? 1 : fr.need > 26 ? .5 : 0;

// Neighbouring active cells end up at most one level apart (slopes, never cliffs).
// Fixed cells keep their level; the rest yield to them.
export function relax(rel, active, fixed) {
  for (let it = 0; it < 60; it++) {
    let changed = false;
    each((x, z, c) => {
      if (!active[c] || fixed[c]) return;
      let lo = -99, hi = 99;
      for (const [dx, dz] of DIRS4) {
        const n = idx(x + dx, z + dz);
        if (!inner(x + dx, z + dz) || !active[n]) continue;
        lo = Math.max(lo, rel[n] - 1); hi = Math.min(hi, rel[n] + 1);
      }
      const v = Math.max(lo, Math.min(hi, rel[c]));
      if (v !== rel[c]) { rel[c] = v; changed = true; }
    });
    if (!changed) break;
  }
}

// Crisp zone cells the entrance cannot reach (by the links guardian.js will make) soften
// into slopes, so a broken lip or terrace never strands part of the zone.
export function settle(s, fr) {
  for (let pass = 0; pass < 6; pass++) {
    const seen = new Uint8Array(N * N), start = idx(...fr.E), queue = [start];
    seen[start] = 1;
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i], ax = a % N, az = (a / N) | 0;
      for (const [dx, dz] of DIRS4) {
        const b = idx(ax + dx, az + dz);
        if (!inner(ax + dx, az + dz) || !s.zone[b] || seen[b]) continue;
        const dh = Math.abs(s.rel[a] - s.rel[b]);
        if (dh === 0 || dh === 1 && ((!s.crisp[a] && !s.crisp[b]) || s.ramp[a] || s.ramp[b])) { seen[b] = 1; queue.push(b); }
      }
    }
    let changed = false;
    each((x, z, c) => { if (s.zone[c] && !seen[c] && s.crisp[c]) { s.crisp[c] = 0; changed = true; } });
    if (!changed) return s;
  }
  return s;
}

function finish(s, fr, lo = -2, hi = 3) {
  each((x, z, c) => {
    if (fr.flat[c]) { s.zone[c] = 1; s.rel[c] = 0; s.crisp[c] = 0; }
    else if (s.zone[c]) s.rel[c] = clamp(s.rel[c], lo, hi);
  });
  return s;
}
// A spot at least `gap` cells from the entrance, the guardian and the flat pads.
function openSpot(fr, gap, tries = 40, edge = 3) {
  for (let i = 0; i < tries; i++) {
    const x = edge + Math.floor(fr.R() * (N - 2 * edge)), z = edge + Math.floor(fr.R() * (N - 2 * edge));
    if (Math.hypot(x - fr.E[0], z - fr.E[1]) >= gap && Math.hypot(x - fr.U[0], z - fr.U[1]) >= gap
      && !fr.flat[idx(x, z)]) return [x, z];
  }
  return null;
}
const middle = (fr, pull = .5) => lerp(lerp(fr.E, fr.U, .5), [7.5, 7.5], pull);

// 1. Rolling hills: soft noise, one or two broad mounds and a gentle dip, slopes everywhere.
function hills(fr) {
  const s = blank(), { R, noise } = fr, h = new Float32Array(N * N), bumps = [];
  for (let i = 0, n = 1 + (R() < .6 ? 1 : 0); i < n; i++) {
    const at = openSpot(fr, 4);
    if (at) bumps.push({ at, amp: 2.6 + R() * 1.8, rad: 2.8 + R() * 1.8 });
  }
  const dip = openSpot(fr, 3.5);
  if (dip) bumps.push({ at: dip, amp: -2, rad: 2.4 + R() });
  each((x, z, c) => {
    h[c] = (noise(x * .24, z * .24) - .5) * 3.6;
    for (const b of bumps) h[c] += b.amp * Math.max(0, 1 - (Math.hypot(x - b.at[0], z - b.at[1]) / b.rad) ** 2);
    s.rel[c] = Math.round(h[c]); s.zone[c] = 1;
  });
  finish(s, fr, -2, 4);
  relax(s.rel, s.zone, fr.flat);
  s.marks.peaks = bumps.filter(b => b.amp > 0).map(b => idx(b.at[0], b.at[1]));
  return s;
}

// 2. Gorge: a winding channel between cliffs from the entrance to the guardian and gate.
function gorge(fr) {
  const s = blank(), { R, noise, noise2 } = fr;
  const [ux, uz] = [fr.U[0] - fr.E[0], fr.U[1] - fr.E[1]], len = Math.hypot(ux, uz) || 1;
  const bend = (R() < .5 ? -1 : 1) * (1.5 + R() * 2.2);
  const M = middle(fr, .2).map((v, i) => clamp(v + (i ? ux : -uz) / len * bend, 3, N - 4));
  const pts = [fr.E, M, fr.U, fr.G], half = 2.7 + roomy(fr);
  each((x, z, c) => {
    const d = polyDist(x, z, pts), w = half + (noise(x * .3 + 11, z * .3 + 5) - .5) * 1.6;
    if (d <= w || fr.flat[c]) {
      s.zone[c] = 1;
      s.rel[c] = Math.round((noise(x * .35, z * .35) - .5) * 1.8) + (d > w - 1.1 ? 1 : 0);
    } else s.rel[c] = Math.min(8, 3 + Math.round((d - w) * .7 + noise2(x * .3, z * .3) * 2.5));
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  s.marks.path = pts;
  return s;
}

// 3. Colosseum: a flat oval of sand inside rings of stepped seating, entered through cuts.
function colosseum(fr) {
  const s = blank(), C = middle(fr, .55), bonus = roomy(fr) * .8;
  const [ux, uz] = [fr.U[0] - fr.E[0], fr.U[1] - fr.E[1]], len = Math.hypot(ux, uz) || 1;
  const ax = [ux / len, uz / len], rx = 5.4 + fr.R() * .5 + bonus, ry = 4.6 + fr.R() * .5 + bonus;
  each((x, z, c) => {
    const px = x - C[0], pz = z - C[1];
    const a = px * ax[0] + pz * ax[1], b = -px * ax[1] + pz * ax[0];
    const q = Math.sqrt((a / rx) ** 2 + (b / ry) ** 2);
    const lane = Math.min(segDist(x, z, fr.E, C), segDist(x, z, fr.G, C));
    if (q <= 1 || lane <= 1.3) { s.zone[c] = 1; return; }
    s.rel[c] = 2 + Math.min(4, Math.floor((q - 1) * Math.min(rx, ry))); s.crisp[c] = 1;
  });
  s.marks = { center: C, axis: ax, rx, ry };
  return finish(s, fr);
}

// 4. Throne dais: square terraces step down from the guardian's throne into a sunken court
// and back up to the entrance landing; a central ramp joins them, galleries flank the court.
function dais(fr) {
  const s = blank(), W = 4.6 + roomy(fr);
  const cheb = (x, z, p) => Math.max(Math.abs(x - p[0]), Math.abs(z - p[1]));
  each((x, z, c) => {
    const du = cheb(x, z, fr.U), de = cheb(x, z, fr.E), lane = segDist(x, z, fr.E, fr.U);
    const throne = du <= 2 ? 0 : du <= 3 ? -1 : -2, landing = de <= 1 ? 0 : de <= 2 ? -1 : -2;
    const level = Math.max(throne, landing);
    if (lane > W && level === -2) { s.rel[c] = lane > W + 2 ? 3 : 2; s.crisp[c] = 1; return; }
    s.zone[c] = 1; s.rel[c] = level; s.crisp[c] = 1; s.ramp[c] = lane <= 1.05 ? 1 : 0;
  });
  finish(s, fr);
  // Terrace pockets the ramp misses join the terrace above them.
  for (const lv of [-2, -1]) {
    const seen = new Uint8Array(N * N);
    each((x, z, c) => {
      if (seen[c] || !s.zone[c] || s.rel[c] !== lv) return;
      const part = [c], reach = { ok: false };
      seen[c] = 1;
      for (let i = 0; i < part.length; i++) {
        const px = part[i] % N, pz = (part[i] / N) | 0;
        if (s.ramp[part[i]] || fr.flat[part[i]]) reach.ok = true;
        for (const [dx, dz] of DIRS4) {
          const n = idx(px + dx, pz + dz);
          if (!inner(px + dx, pz + dz) || !s.zone[n]) continue;
          if (s.ramp[n] && Math.abs(s.rel[n] - lv) <= 1) reach.ok = true;
          if (!seen[n] && s.rel[n] === lv) { seen[n] = 1; part.push(n); }
        }
      }
      if (!reach.ok) for (const p of part) s.rel[p] = lv + 1;
    });
  }
  s.marks = { court: lerp(fr.E, fr.U, .5) };
  return settle(s, fr);
}

// 5. Henge: a ring of standing stones on a low berm, gentle ground inside.
function henge(fr) {
  const s = blank(), { R, noise } = fr, C = middle(fr, .6), rad = 4.1 + R() * .5 + roomy(fr) * .4;
  each((x, z, c) => {
    const d = Math.hypot(x - C[0], z - C[1]);
    s.zone[c] = 1;
    s.rel[c] = d < rad - 1.2 ? 0 : Math.round((noise(x * .3, z * .3) - .5) * 1.8)
      + (d > rad + 1.5 && d < rad + 2.8 ? 1 : 0);
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  const n = 7 + Math.floor(R() * 3), turn = R() * Math.PI * 2, stones = [];
  for (let i = 0; i < n; i++) {
    const a = turn + i / n * Math.PI * 2;
    const x = Math.round(C[0] + Math.cos(a) * rad), z = Math.round(C[1] + Math.sin(a) * rad);
    if (inner(x, z)) stones.push(idx(x, z));
  }
  s.marks = { center: C, stones: [...new Set(stones)], rad };
  return s;
}

// 6. Crater: a shallow bowl under a raised rim, crossed by an old trench ridge.
function crater(fr) {
  const s = blank(), { R, noise } = fr, C = middle(fr, .6), rad = 4.4 + R() * .6 + roomy(fr) * .5;
  const ang = R() * Math.PI, rx = Math.cos(ang), rz = Math.sin(ang);
  const gaps = [0, 1, 2].map(i => R() * Math.PI * 2 + i * 2.1);
  each((x, z, c) => {
    const d = Math.hypot(x - C[0], z - C[1]) / rad, e = d + (noise(x * .4, z * .4) - .5) * .25;
    let v = e < .4 ? -2 : e < .7 ? -1 : e < .9 ? 0 : e < 1.05 ? 1 : e < 1.3 ? 2 : 1;
    if (d < .8 && Math.abs(-(x - C[0]) * rz + (z - C[1]) * rx) < .6) v += 1;
    s.zone[c] = 1; s.rel[c] = v;
    // the rim is a crisp lip, crossed by a few slipped gaps and the doorway lanes
    if (e >= .9 && e < 1.3) {
      const a = Math.atan2(z - C[1], x - C[0]);
      const gap = gaps.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < .3);
      s.crisp[c] = 1;
      s.ramp[c] = gap || segDist(x, z, fr.E, C) < 1.3 || segDist(x, z, fr.U, C) < 1.3 ? 1 : 0;
    }
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  s.marks = { center: C, rad };
  return settle(s, fr);
}

// 7. Grove: gentle ground with clumps of trees, some on low knolls.
function grove(fr) {
  const s = blank(), { R, noise } = fr, clusters = [];
  for (let i = 0, n = 3 + Math.floor(R() * 2); i < 40 && clusters.length < n; i++) {
    const at = openSpot(fr, 3, 1, 2);
    if (at && segDist(at[0], at[1], fr.E, fr.U) >= 2.4
      && clusters.every(k => Math.hypot(k.at[0] - at[0], k.at[1] - at[1]) >= 4)) clusters.push({ at, knoll: R() < .5 });
  }
  each((x, z, c) => {
    s.zone[c] = 1;
    s.rel[c] = Math.round((noise(x * .28, z * .28) - .5) * 2.2);
    for (const k of clusters) if (k.knoll && Math.hypot(x - k.at[0], z - k.at[1]) < 1.8) s.rel[c] += 1;
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  s.marks = { clusters: clusters.map(k => idx(k.at[0], k.at[1])) };
  return s;
}

// 8. Courtyard: a ruined walled yard, broken by the entrance and gate lanes, a few breaches
// and short wall stubs for cover.
function courtyard(fr) {
  const s = blank(), { R } = fr, C = [7.5, 7.5];
  const x0 = 3 + Math.floor(R() * 2), x1 = N - 4 - Math.floor(R() * 2);
  const z0 = 3 + Math.floor(R() * 2), z1 = N - 4 - Math.floor(R() * 2);
  const walls = new Set();
  for (let x = x0; x <= x1; x++) { walls.add(idx(x, z0)); walls.add(idx(x, z1)); }
  for (let z = z0; z <= z1; z++) { walls.add(idx(x0, z)); walls.add(idx(x1, z)); }
  // breaches: two random gaps, two cells wide
  const ring = [...walls];
  for (let i = 0; i < 2; i++) {
    const c = ring[Math.floor(R() * ring.length)], x = c % N, z = (c / N) | 0;
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) walls.delete(idx(x + dx, z + dz));
  }
  // stubs inside the yard
  for (let i = 0, made = 0; i < 20 && made < 2; i++) {
    const x = x0 + 2 + Math.floor(R() * Math.max(1, x1 - x0 - 3)), z = z0 + 2 + Math.floor(R() * Math.max(1, z1 - z0 - 3));
    if (Math.hypot(x - fr.U[0], z - fr.U[1]) < 3 || segDist(x, z, fr.E, fr.U) < 1.6) continue;
    const [dx, dz] = R() < .5 ? [1, 0] : [0, 1];
    walls.add(idx(x, z)); walls.add(idx(x + dx, z + dz)); made++;
  }
  each((x, z, c) => {
    const lane = Math.min(segDist(x, z, fr.E, C), segDist(x, z, fr.G, C), segDist(x, z, fr.E, fr.U));
    if (walls.has(c) && lane > 1.4 && !fr.flat[c]) {
      s.rel[c] = fr.noise(x * .7, z * .7) < .4 ? 2 : 3; s.crisp[c] = 1;
    } else s.zone[c] = 1;
  });
  s.marks = { center: C, rect: [x0, z0, x1, z1] };
  return finish(s, fr);
}

export const SHAPES = { hills, gorge, colosseum, dais, henge, crater, grove, courtyard };
export const ARENA_TYPES = Object.keys(SHAPES);
