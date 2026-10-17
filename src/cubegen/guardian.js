// A deliberate side/descent arena: shared boundary terrain, one ground entrance, a dry
// fight zone shaped by one of the arena types (cubegen/arenashapes.js) and dressed with
// generated clutter (cubegen/arenaprops.js), and a sealed onward exit. The doorways and the
// guardian's spot stay flat. Every free zone floor connects without jumps, and the zone
// holds the doubled population; an arena that cannot falls back to a plainer one.
import { N, LH, DIRS, MAX_L } from '../core/constants.js';
import { idx, edgeKey, clamp, mulberry32, hash32, makeNoise } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { indexBlockers } from '../core/blockers.js';
import { population } from '../core/spawns.js';
import { themeOf } from '../themes/depth.js';
import { createContext } from './context.js';
import { groundHeights } from './ground.js';
import { placePortals } from './portals.js';
import { SHAPES } from './arenashapes.js';
import { dressArena } from './arenaprops.js';

const inner = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
const FLAT = { rel: new Int8Array(N * N), zone: new Uint8Array(N * N).fill(1),
  crisp: new Uint8Array(N * N), ramp: new Uint8Array(N * N), marks: {} };

// Floors, links and corner heights for one arena shape.
function buildFloors(ctx, base, shape, level) {
  const { prot0 } = ctx, floors = [];
  for (let c = 0; c < N * N; c++) {
    const x = c % N, z = (c / N) | 0, cell = inner(x, z);
    const top = !cell ? base[c] : prot0[c] ? level : clamp(level + shape.rel[c], 2, MAX_L);
    const f = ctx.mk(c, top, 0, 0);
    f.id = c; f.prot = prot0[c]; f.arenaCell = cell; f.encounter = cell && !!shape.zone[c];
    floors.push(f);
  }
  const at = (x, z) => x >= 0 && z >= 0 && x < N && z < N ? floors[idx(x, z)] : null;
  // Scenery beside the zone is a wall (two levels up at least), never a ledge to climb.
  for (const f of floors) if (f.arenaCell && !f.encounter) {
    const tops = DIRS.map(([dx, dz]) => at(f.x + dx, f.z + dz)).filter(g => g?.encounter).map(g => g.top);
    if (tops.length && f.top > Math.max(...tops) - 2) f.top = Math.min(MAX_L, Math.max(f.top, Math.max(...tops) + 2));
  }
  const linked = (f, g) => {
    if (!f.arenaCell || !g.arenaCell) return f.top === g.top && (!f.arenaCell || f.encounter) && (!g.arenaCell || g.encounter);
    if (f.encounter !== g.encounter) return false;
    const dh = Math.abs(f.top - g.top);
    if (dh === 0) return true;
    if (dh > 1) return false;
    return (!shape.crisp[f.c] && !shape.crisp[g.c]) || !!shape.ramp[f.c] || !!shape.ramp[g.c];
  };
  for (const f of floors) f.link = DIRS.map(([dx, dz]) => { const g = at(f.x + dx, f.z + dz); return g && linked(f, g) ? g : null; });
  // Corners blend linked floors into slopes. Border cells and pads stay exactly flat.
  const pinned = f => !f.arenaCell || f.prot;
  for (const f of floors) {
    if (pinned(f)) { f.cs = Array(4).fill(f.top * LH); f.split = f.c % 2; continue; }
    f.cs = [0, 1, 2, 3].map(k => {
      const X = f.x + (k & 1), Z = f.z + (k >> 1), group = [f];
      for (let i = 0; i < group.length; i++) for (const g of group[i].link)
        if (g && (g.x === X - 1 || g.x === X) && (g.z === Z - 1 || g.z === Z) && !group.includes(g)) group.push(g);
      const pins = group.filter(pinned);
      if (pins.length) return pins.reduce((s, g) => s + g.top, 0) / pins.length * LH;
      const mean = group.reduce((s, g) => s + g.top, 0) / group.length * LH;
      return mean + ((hash32(X * 7919 + Z * 104729 + Math.round(mean * 8) * 31337) % 1000) / 1000 - .5) * .06;
    });
    f.split = Math.abs(f.cs[0] - f.cs[3]) <= Math.abs(f.cs[1] - f.cs[2]) ? 0 : 1;
  }
  return floors;
}

// The terrain works when every zone floor, the guardian and the gate are reachable on foot.
function terrainOK(floors, start, ends) {
  const seen = new Set([start]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const g of queue[i].link)
    if (g && (g.encounter || g.prot) && !seen.has(g)) { seen.add(g); queue.push(g); }
  return ends.every(f => seen.has(f)) && floors.every(f => !f.encounter || seen.has(f));
}

// Free zone floors where the spawner may place bodies, with room to spare.
function roomFor(floors, blocked, entrance, gate, need) {
  const free = floors.filter(f => f.encounter && !blocked.has(f.c)
    && Math.hypot(f.x - entrance.x, f.z - entrance.z) >= 4 && Math.hypot(f.x - gate.x, f.z - gate.z) >= 1.8).length;
  return free >= need + Math.max(8, Math.ceil(need * .35));
}

export function generateGuardian(spec) {
  const exit = spec.guardian.exit ?? spec.exit, role = spec.guardian.role ?? 'descent';
  const entry = spec.portals.find(p => p.dir < 4 && p.dir !== exit);
  const onward = spec.portals.find(p => p.dir === exit);
  if (!entry || !onward || spec.portals.length !== 2 || entry.layer || onward.layer
    || exit < 4 && entry.level !== onward.level)
    throw new Error('Guardian arena needs one ground entrance and one level onward exit');
  const ctx = createContext(spec.seed);
  ctx.spec = spec; ctx.K = 1; ctx.B = [0];
  groundHeights(ctx);
  const [dx, dz] = DIRS[exit < 4 ? exit ^ 1 : entry.dir], level = entry.level;
  // Wells sit opposite the entrance; side exits retain their shared face position.
  const gx = dx ? dx > 0 ? 4 : N - 5 : N / 2;
  const gz = dz ? dz > 0 ? 4 : N - 5 : N / 2;
  ctx.spec = { ...spec, portals: [entry, exit < 4 ? onward : { dir: 4, x: gx, z: gz }] };
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    ctx.lvl0[idx(x, z)] = level; ctx.void0[idx(x, z)] = 0;
  }
  placePortals(ctx);
  // Ordinary wells clamp their height; every arena exit shares the entrance level.
  ctx.portals[1].level = level;
  for (const c of ctx.portals[1].cells) ctx.lvl0[c] = level;
  const base = Int16Array.from(ctx.lvl0);

  // The frame every arena type is drawn around (cell coordinates).
  const xz = c => [c % N, (c / N) | 0], inward = (p, d) => [p[0] - DIRS[d][0], p[1] - DIRS[d][1]];
  const [ex, ez] = xz(ctx.portals[0].c), [px, pz] = xz(ctx.portals[1].c);
  const U = [px + dx * 2, pz + dz * 2];
  const flat = new Uint8Array(N * N);
  const flatten = (x, z, r) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (inner(x + a, z + b)) flat[idx(x + a, z + b)] = 1; };
  for (const p of ctx.portals) for (const c of p.cells) flatten(...xz(c), 1);
  flatten(U[0], U[1], 1);
  let need = 0;
  for (const [, p] of population({ seed: spec.seed, depth: spec.depth, guardian: true })) need += p.count;
  const R = mulberry32(hash32(spec.seed ^ 0xa7e4a));
  const frame = { level, need, flat, R, noise: makeNoise(R), noise2: makeNoise(R),
    E: inward([ex, ez], entry.dir), U, G: exit < 4 ? inward([px, pz], exit) : [px, pz] };

  const requested = spec.guardian.arena && SHAPES[spec.guardian.arena] ? spec.guardian.arena : 'hills';
  const theme = themeOf(spec), tint = theme.side[1][1];
  let arena = null;
  for (const type of [...new Set([requested, 'hills', 'crater'])]) {
    const shape = SHAPES[type](frame), floors = buildFloors(ctx, base, shape, level);
    const start = floors[idx(ex, ez)], guard = floors[idx(...U)], gate = floors[idx(px, pz)];
    if (!terrainOK(floors, start, [guard, gate])) continue;
    for (const clutter of [1, .5, 0]) {
      const dress = dressArena({ type, shape, floors, frame, R, biome: spec.biome, tint, clutter });
      if (!roomFor(floors, dress.blocked, start, gate, need)) continue;
      arena = { type, shape, floors, dress };
      break;
    }
    if (arena) break;
  }
  if (!arena) {   // the plain flat arena of old: always fits
    const floors = buildFloors(ctx, base, FLAT, level);
    arena = { type: 'plain', shape: FLAT, floors, dress: dressArena({ type: 'hills', shape: FLAT, floors, frame, R, biome: spec.biome, tint, clutter: 0 }) };
  }
  const { floors, dress } = arena;
  for (const f of floors) ctx.cols[f.c].push(f);

  const portals = ctx.portals.map(p => ({ id: p.id, kind: p.kind, dir: p.dir, layer: 0, cells: p.cells,
    x: p.c % N, z: Math.floor(p.c / N), y: level * LH, floor: floors[p.c] }));
  const gate = portals[1], entrance = portals[0];
  const guardFloor = floors[idx(...U)];
  const guardian = { role, bossPlaceholder: role === 'descent', exit,
    floor: guardFloor, x: guardFloor.x + .5, z: guardFloor.z + .5,
    y: floorY(guardFloor, .5, .5), yaw: Math.atan2(dx, dz), approach: [dx, dz], portalId: portals[1].id };
  const prev = new Map([[entrance.floor, null]]), queue = [entrance.floor];
  for (let i = 0; i < queue.length; i++) for (const g of queue[i].link)
    if (g && !prev.has(g) && !dress.blocked.has(g.c)) { prev.set(g, queue[i]); queue.push(g); }
  if (!prev.has(guardFloor) || !prev.has(portals[1].floor)) throw new Error('Disconnected guardian arena');
  const path = [];
  for (let f = portals[1].floor; f; f = prev.get(f)) path.unshift(f);
  const moves = path.slice(1).map((to, i) => ({ kind: 'walk', from: path[i], to, cells: [], cost: 1,
    d: DIRS.findIndex(([x, z]) => path[i].x + x === to.x && path[i].z + z === to.z) }));
  // Rails keep fights out of lower ground beside the zone: perimeter pockets two levels
  // down, and any lower scenery, without altering the neighbouring cube's terrain.
  const fences = new Map(), fenceList = [];
  for (const f of floors) if (f.encounter) DIRS.forEach(([ox, oz], d) => {
    const other = floors[idx(f.x + ox, f.z + oz)];
    if (other.encounter || other.top >= f.top - (other.arenaCell ? 0 : 1)) return;
    const pts = [.07, .5, .93].map(t => {
      const fx = d === 0 ? .93 : d === 1 ? .07 : t, fz = d === 2 ? .93 : d === 3 ? .07 : t;
      return [f.x + fx, floorY(f, fx, fz), f.z + fz];
    });
    const ys = pts.map(p => p[1]), rail = { pts, ymin: Math.min(...ys), ymax: Math.max(...ys), layer: 0, show: true };
    fenceList.push(rail); fences.set(edgeKey(f.x, f.z, other.x, other.z), [rail]);
  });
  const staticBlockers = indexBlockers(dress.blockers);
  ctx.stats.layers = 1; ctx.stats.mode = `guardian arena (${arena.type})`; ctx.stats.fences = fenceList.length;
  return { seed: spec.seed, attempts: 1, K: 1, B: [0], cols: ctx.cols, floors,
    pieces: Array.from({ length: N * N }, () => []), runs: [], falls: [], ladders: [],
    fences, fenceList, stats: ctx.stats, moves, portals, exit, guardian,
    arena: { type: arena.type, requested },
    routeIndex: spec.routeIndex, route: spec.route, gateKeys: spec.gateKeys,
    safe: Uint8Array.from(floors, f => prev.has(f) ? 1 : 0),
    kind: spec.kind, archetype: 'arena', roomRole: `${role}-guardian`, biome: spec.biome,
    key: spec.key, depth: spec.depth, cave: !!spec.cave, walled: !!spec.walled, enemyFree: false,
    rewardSites: [], siteFailures: [], sitePlacements: [], siteReservations: [],
    arenaPlacements: dress.placements, staticBlockers, blockers: staticBlockers,
    routes: [path, [...path].reverse()].map(p => p.map(f => ({ x: f.x + .5, y: floorY(f, .5, .5) + .12, z: f.z + .5 }))),
  };
}
