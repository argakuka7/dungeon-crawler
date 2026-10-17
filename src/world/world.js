// The world: a lazily grown set of cubes. Preparing a cube collapses its whole depth (WFC, once
// per depth), decides its faces, and then generates its map from a spec built out of those faces.
import { hash32 } from '../core/util.js';
import { worldNoise } from '../core/wnoise.js';
import { generate } from '../cubegen/index.js';
import { WFC } from './wfc.js';
import { key, parse, step, faceKey, hashKey } from './coords.js';
import { decideFaces, LAYER_BASE } from './faces.js';
import { worldThemes } from '../themes/depth.js';
import { makeLayouts } from './layout.js';
import { voidAllowed, fallMask } from './voids.js';
import { isTown, isMerchantCamp, isClearing, enemyFreeAt, isInterior } from './town.js';
import { generateInterior } from '../cubegen/interior.js';
import { spanSpec } from './spans.js';
import { buildOf } from '../themes/builds.js';

// how much each WFC kind leans towards an archetype (times the theme's weights)
const LEAN = { highland: { mesa: 2, spire: 2, archipelago: 0.3 }, lake: { archipelago: 3, crater: 2 }, gorge: { chasm: 3 },
  river: { chasm: 1.5, archipelago: 0.5 }, meadow: { plain: 1.5 }, slope: { mesa: 1.5 } };
// learn: random.html#pick-code (see learn/README.md)
function archetype(theme, kind, R) {
  const w = Object.entries(theme.arche).map(([a, v]) => [a, v * (LEAN[kind]?.[a] ?? 1)]);
  let r = R() * w.reduce((s, [, v]) => s + v, 0);
  for (const [a, v] of w) if ((r -= v) < 0) return a;
  return 'plain';
}

export class World {
  // opts.arche: force one archetype everywhere (dev); opts.themes: theme ids that win every depth
  // they may appear at (dev, tests; themes/depth.js worldThemes)
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.opts = opts;
    this.layout = makeLayouts(seed, worldThemes(seed, opts.themes || []));   // depth -> which cubes exist and how they connect
    this.themes = this.layout.themes;   // the world's themes, by stretches of depths
    this.wfc = new WFC(seed, this.layout);
    this.noise = worldNoise(seed);
    this.faces = new Map();
    this.cubes = new Map();
    this.start = key(0, 0, 0);
  }

  // learn: architecture.html#cube-journey (see learn/README.md)
  prepare(k) {
    const d = -parse(k)[1];
    if (!this.layout(d).exists.has(k)) throw new Error(`${k} is not part of depth ${d}`);
    this.wfc.collapseDepth(d);
    decideFaces(this, k);
  }

  // learn: architecture.html#cube-journey (see learn/README.md)
  spec(k) {
    const [X, Y, Z] = parse(k), t = this.wfc.tiles.get(k), theme = this.layout(-Y).theme;
    const span = spanSpec(this.layout(-Y), k, buildOf(theme).bridges);
    const faces = [0, 1, 2, 3].map(d => {
      const f = this.faces.get(faceKey(k, d));
      return { sock: t.sock[d], profile: Int16Array.from(f.profile), river: f.river, portal: f.portal, wall: f.wall, spout: f.spout,
        clearingBoundary: isClearing(k, this.seed) || isClearing(step(k, d), this.seed) };
    });
    const portals = [];
    faces.forEach((f, d) => { if (f.portal) portals.push({ dir: d, ...f.portal }); });
    for (const d of [4, 5]) {
      const f = this.faces.get(faceKey(k, d));
      if (f?.portal) portals.push({ dir: d, ...f.portal });
    }
    return {
      key: k, X, Y, Z, kind: t.kind, exit: this.layout(-Y).exit.get(k) ?? null, K: t.K, B: LAYER_BASE.slice(0, t.K), faces, portals,
      spawn: k === this.start, town: isTown(k), merchantCamp: isMerchantCamp(k, this.seed), enemyFree: enemyFreeAt(k), noise: this.noise, depth: -Y, cave: theme.cave, walled: theme.cave || !!theme.walls,
      biome: theme.props, guardian: this.layout(-Y).guardians.get(k) || null,
      horde: this.layout(-Y).hordes.get(k) || null, populationScale: this.layout(-Y).populationScale.get(k) ?? 1,
      routeIndex: this.layout(-Y).routeIndex.get(k), route: this.layout(-Y).route,
      gateKeys: [0, 1, 2, 3].map(d => this.layout(-Y).gateFaces.get(faceKey(k, d)) || null),
      roomRole: this.layout(-Y).roles.get(k), rewardSites: this.layout(-Y).sitePlans.get(k) || [],
      fluid: theme.river, fluidMix: theme.fluids, voidOK: voidAllowed(this, k), fallIn: fallMask(this, k),
      outflow: this.faces.get(faceKey(k, 4))?.fall || null, inflow: this.faces.get(faceKey(k, 5))?.fall || null, relief: theme.relief,
      // islands without pillars: lakes, the sky islands near the top and the abyss
      floating: !isClearing(k, this.seed) && (t.kind === 'lake' || ((-Y <= 3 || -Y >= 19) && this.wfc.rng(k, 0xf10a7)() < 0.5)),
      seed: hash32(this.seed ^ hashKey(k)),
      archetype: span ? span.role : -Y === 0 ? 'plain' : this.opts.arche || archetype(theme, t.kind, this.wfc.rng(k, 0xa7c4)), span,
    };
  }

  // the generated cube (built on first use); house interiors are not part of the grid
  cube(k) {
    let c = this.cubes.get(k);
    if (!c && isInterior(k)) {
      // turned the way the house stands in town (the town turns with its exit)
      const door = this.cube(this.start).map.doors.find(d => d.to === k);
      if (!door) throw new Error('No door leads to ' + k);
      c = { key: k, map: generateInterior({ key: k, seed: hash32(this.seed ^ hashKey(k)) }, [door.nx, door.nz]), visits: 0 };
      this.cubes.set(k, c);
    }
    if (!c) {
      this.prepare(k);
      c = { key: k, map: generate(this.spec(k)), visits: 0 };
      this.cubes.set(k, c);
    }
    return c;
  }
}
