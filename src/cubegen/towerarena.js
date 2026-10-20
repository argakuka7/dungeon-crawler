// Foggery's arena (core/bosses.js BOSS_ARENAS.foggery, docs/bosses.md): a caldera full of lava
// with a great round tower in the middle (core/foggery.js TOWER). A rim of rock all round holds the
// lava in; the doorway is a gap in it, and a stone bridge leads from it over the lava to the
// tower. A ramp winds round the tower's core from the caldera's floor to its top, flat where the
// bridge joins it and for a stretch at the top (the landing: with the core, the top of the
// tower). The ramp and the bridge have low stone parapets; the top has none (the platforms float
// round it, core/foggery.js PLATFORMS). The well lies on the caldera's floor in a far corner,
// under the lava until he is beaten (game/tide.js drains it).
import { N, LH, DIRS, OPP, EDGE_CORNERS, HEAD, LAVA } from '../core/constants.js';
import { idx, edgeKey, hash32, mulberry32, makeNoise } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { indexBlockers } from '../core/blockers.js';
import { TOWER, PLATFORMS, SLOTS, rampTurns, rampHeight, rampMarks, puzzleStart } from '../core/foggery.js';
import { placePortals, edgeCell } from './portals.js';

const TAU = Math.PI * 2;
const wrapTurn = a => a - Math.floor(a + 0.5);
const flat = top => Array(4).fill(top * LH);
// how closely two floors' edges must meet to be one walkable surface (units)
const MEET = 0.26;

export function towerArena({ spec, ctx, entry, role, base }) {
  const T = TOWER, door = entry.level, R = mulberry32(hash32(spec.seed ^ 0x70e4a));
  ctx.spec = { ...spec, portals: [entry] };
  placePortals(ctx);
  const pad = ctx.portals[0], d = pad.dir;
  // local (j steps in from the doorway's side, t along it) -> the cell
  const at = (j, t) => edgeCell(d, t, j), xz = c => [c % N, (c / N) | 0];
  // the bridge joins the ramp on the doorway's side; the ramp turns one way or the other
  const [ox, oz] = DIRS[d], junction = Math.atan2(oz, ox), spin = R() < 0.5 ? 1 : -1;
  const radius = (x, z) => Math.hypot(x + 0.5 - T.mid, z + 0.5 - T.mid);
  const inPit = (x, z) => x >= T.pit[0] && z >= T.pit[0] && x < T.pit[1] && z < T.pit[1];
  const isRim = (x, z) => x >= 1 && z >= 1 && x <= N - 2 && z <= N - 2 && !inPit(x, z);
  const portalCells = new Set(pad.cells);
  // the bridge: two cells wide from the doorway to the ramp (over its rows, and along the rim to
  // the middle rows if the doorway is off to a side)
  const bridge = new Set();
  for (let t = Math.min(pad.pos - 1, 6); t <= Math.max(pad.pos + 1, 8); t++) for (let j = 2; j <= 3; j++) bridge.add(at(j, t));
  // the well: a 3 x 3 pad on the caldera's floor in a far corner
  const wt = R() < 0.5 ? 3 : 12, wellC = at(12, wt), well = [];
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) well.push(at(12 + a, wt + b));
  const wellId = pad.id + 1;
  const noise = makeNoise(R);

  const cols = Array.from({ length: N * N }, () => []), floors = [];
  const add = (c, top, bottom, cs, extra = {}) => {
    const f = ctx.mk(c, top, bottom, 0);
    Object.assign(f, { cs, split: Math.abs(cs[0] - cs[3]) <= Math.abs(cs[1] - cs[2]) ? 0 : 1, arenaCell: true, encounter: false }, extra);
    cols[c].push(f);
    return f;
  };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = idx(x, z), r = radius(x, z);
    if (portalCells.has(c)) { add(c, door, 0, flat(door), { prot: pad.id, arenaCell: false }); continue; }
    if (!inPit(x, z) && !isRim(x, z)) { add(c, base[c], 0, flat(base[c]), { arenaCell: false }); continue; }
    if (isRim(x, z)) {   // the rim: rough rock, higher than the lava ever rises
      const top = T.rim[0] + Math.round(noise(x * 0.45, z * 0.45) * (T.rim[1] - T.rim[0]));
      add(c, top, 0, flat(top), { rim: true });
      continue;
    }
    const ground = () => add(c, T.ground, 0, flat(T.ground), { paint: 'ash', ground: true, prot: well.includes(c) ? wellId : 0 });
    if (r < T.core) { add(c, T.top, 0, flat(T.top), { paint: 'basalt', encounter: true, tower: 'top' }); continue; }
    if (r < T.ring) {   // the ramp: once each turn it passes over the cell
      const mid = Math.atan2(z + 0.5 - T.mid, x + 0.5 - T.mid);
      let below = null;
      for (const u of rampTurns(mid, junction, spin, door)) {
        const cs = [0, 1, 2, 3].map(k => {
          const a = Math.atan2(z + (k >> 1) - T.mid, x + (k & 1) - T.mid);
          return rampHeight(u + wrapTurn(spin * (a - mid) / TAU), door) * LH;
        });
        const lo = Math.min(...cs) / LH, hi = Math.max(...cs) / LH;
        let bottom = Math.max(0, Math.floor(lo) - T.slab);
        if (!below && bottom < T.ground + HEAD) bottom = 0;   // (low down: solid to the floor)
        else if (!below) ground();
        const top = Math.round(hi), landing = cs.every(v => Math.abs(v - T.top * LH) < 1e-6);
        below = add(c, top, bottom, cs, { paint: 'basalt', encounter: true, ramp: u, tower: landing ? 'top' : 'ramp' });
      }
      if (!below) ground();
      continue;
    }
    ground();
    if (bridge.has(c)) add(c, door, door - T.slab, flat(door), { paint: 'basalt', encounter: true, tower: 'bridge' });
  }
  for (const col of cols) col.sort((a, b) => a.top - b.top);
  for (const col of cols) floors.push(...col);
  floors.forEach((f, i) => { f.id = i; });

  // links: neighbouring floors whose edges meet
  const edge = (f, dd) => EDGE_CORNERS[dd].map(k => f.cs[k]);
  for (const f of floors) f.link = DIRS.map(([dx, dz], dd) => {
    const x = f.x + dx, z = f.z + dz;
    if (x < 0 || z < 0 || x >= N || z >= N) return null;
    const mine = edge(f, dd);
    let best = null, gap = MEET;
    for (const g of cols[idx(x, z)]) {
      const theirs = edge(g, OPP[dd]), off = Math.max(Math.abs(mine[0] - theirs[0]), Math.abs(mine[1] - theirs[1]));
      if (off < gap) { best = g; gap = off; }
    }
    return best;
  });

  // parapets along the ramp and the bridge where they drop away (not round the top)
  const fences = new Map(), fenceList = [];
  for (const f of floors) if (f.tower === 'ramp' || f.tower === 'bridge') DIRS.forEach(([dx, dz], dd) => {
    if (f.link[dd]) return;
    const x = f.x + dx, z = f.z + dz, mine = edge(f, dd), lo = Math.min(...mine);
    // a wall there (the core, a turn of the ramp above): none needed
    if (cols[idx(x, z)].some(g => g.bottom * LH < lo + 0.5 && Math.max(...edge(g, OPP[dd])) > lo + 0.3)) return;
    const pts = [0.07, 0.5, 0.93].map(t => {
      const fx = dd === 0 ? 0.93 : dd === 1 ? 0.07 : t, fz = dd === 2 ? 0.93 : dd === 3 ? 0.07 : t;
      return [f.x + fx, floorY(f, fx, fz), f.z + fz];
    });
    const ys = pts.map(p => p[1]), rail = { pts, ymin: Math.min(...ys), ymax: Math.max(...ys), layer: 0, show: true, style: 'stone' };
    fenceList.push(rail);
    const k = edgeKey(f.x, f.z, x, z);
    fences.set(k, [...fences.get(k) ?? [], rail]);
  });

  const top = c => cols[c].at(-1);
  const entrance = { id: pad.id, kind: 'side', dir: d, layer: 0, cells: pad.cells, x: pad.c % N, z: Math.floor(pad.c / N), y: door * LH, floor: cols[pad.c][0] };
  const wellFloor = cols[wellC].find(f => f.ground);
  const down = { id: wellId, kind: 'down', dir: 4, layer: 0, cells: well, x: wellC % N, z: Math.floor(wellC / N), y: T.ground * LH, floor: wellFloor };
  const portals = [entrance, down];
  // he stands on the bridge by the tower, facing the doorway
  const guardFloor = top(at(3, Math.max(6, Math.min(8, pad.pos)))), goal = cols[idx(T.mid, T.mid)].at(-1);
  const boss = role === 'descent' ? spec.guardian.boss ?? null : null;
  const guardian = { role, bossPlaceholder: !boss, boss, exit: 4, floor: guardFloor, x: guardFloor.x + .5, z: guardFloor.z + .5,
    y: floorY(guardFloor, .5, .5), yaw: Math.atan2(ox, oz), approach: [-ox, -oz], portalId: wellId };
  // the way from the doorway to the well: over the bridge, down the ramp, across the floor
  const prev = new Map([[entrance.floor, null]]), queue = [entrance.floor];
  for (let i = 0; i < queue.length; i++) for (const g of queue[i].link) if (g && !prev.has(g)) { prev.set(g, queue[i]); queue.push(g); }
  if (!prev.has(guardFloor) || !prev.has(wellFloor) || !prev.has(goal)) throw new Error('Disconnected tower arena');
  const path = [];
  for (let f = wellFloor; f; f = prev.get(f)) path.unshift(f);
  const moves = path.slice(1).map((to, i) => ({ kind: 'walk', from: path[i], to, cells: [], cost: 1,
    d: DIRS.findIndex(([x, z]) => path[i].x + x === to.x && path[i].z + z === to.z) }));

  // the platforms: their slots, the ones touching the top, where they start
  const isTop = g => g.tower === 'top';
  const touch = SLOTS.flatMap((s, k) => {
    for (let b = 0; b < PLATFORMS.size; b++) for (let a = 0; a < PLATFORMS.size; a++) for (const [dx, dz] of DIRS) {
      const x = s.x + a + dx, z = s.z + b + dz;
      if (x >= 0 && z >= 0 && x < N && z < N && cols[idx(x, z)].some(isTop)) return [k];
    }
    return [];
  });
  const movers = { seed: hash32(spec.seed ^ 0x9a7f0), start: puzzleStart(touch, R), touch, top: PLATFORMS.top * LH, thick: PLATFORMS.thick };
  const L = T.lava;
  const tower = { door, junction, spin, top: T.top, goal: { x: goal.x, z: goal.z }, marks: rampMarks(door) };

  ctx.stats.layers = 1; ctx.stats.mode = 'guardian arena (tower)';
  const staticBlockers = indexBlockers([]);
  return { seed: spec.seed, attempts: 1, K: 1, B: [0], cols, floors,
    pieces: Array.from({ length: N * N }, () => []), runs: [], falls: [], ladders: [],
    fences, fenceList, stats: ctx.stats, moves, portals, exit: 4, guardian,
    arena: { type: 'tower', requested: 'tower' },
    // his lava (game/tide.js): at rest it fills the caldera's floor, he raises it (core/foggery.js
    // LAVA); beaten, it is gone (`gone`, the level it drains to)
    tide: { rest: L.rest, high: L.high, gone: L.gone, fluid: LAVA, box: [T.pit[0], T.pit[0], T.pit[1], T.pit[1]], follow: 2.6, defeat: 'drain' },
    tower, movers,
    routeIndex: spec.routeIndex, route: spec.route, gateKeys: spec.gateKeys, trialFaces: spec.trialFaces || [null, null, null, null],
    safe: Uint8Array.from(floors, f => prev.has(f) ? 1 : 0),
    kind: spec.kind, archetype: 'arena', roomRole: `${role}-guardian`, biome: spec.biome,
    key: spec.key, depth: spec.depth, cave: !!spec.cave, walled: true, enemyFree: false,
    rewardSites: [], siteFailures: [], sitePlacements: [], siteReservations: [], spots: [],
    arenaPlacements: [], staticBlockers, blockers: staticBlockers,
    routes: [path, [...path].reverse()].map(p => p.map(f => ({ x: f.x + .5, y: floorY(f, .5, .5) + .12, z: f.z + .5 }))),
  };
}
