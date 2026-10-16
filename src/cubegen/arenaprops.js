// Guardian arena clutter, generated with the terrain so spawns and navigation see it.
// Each arena type decides where clutter goes (by role). The biome's palette decides which
// props fill each role.
// Blocking props in the fight zone stand alone in their cell and must never split the zone.
// Doorways, the guardian's spot and the entrance-to-guardian lane stay free.
import { N, DIRS, OPP, EDGE_CORNERS } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { propMetadata } from '../core/propcatalog.js';
import { segDist } from './arenashapes.js';

const L = (set, names) => names.split(' ').map(b => set + '_' + b);
const RUBBLE = [...L('ruins', 'rubble'), ...L('any', 'stone_chips gravel_patch')];
const REMAINS = L('relics', 'sword_in_ground broken_shield adventurer_remains abandoned_pack sword_in_ground');
const TILES = L('ruins', 'broken_tiles broken_tiles sand_drift');
const COLUMN = 'ruins_broken_column', BRAZIER = 'ruins_brazier', TORCH = 'relics_torch_sconce';

// cover: ground cover; small: loose non-blocking objects; tree: tall growth; debris: low
// blockers; stone: standing stones; wall / lip: cliff faces and the edges above them;
// bones: biome remains; ritual: a henge's centre
const PALETTES = {
  meadow: { cover: L('meadow', 'grass_tuft clover_patch daisies flowers fern'),
    small: [...L('meadow', 'bush berry_bush mushroom_small sapling'), ...L('any', 'rock pebbles')],
    tree: L('meadow', 'tree_round tree_tall'), debris: [...L('meadow', 'fallen_log stump'), 'any_boulder'],
    stone: L('ruins', 'obelisk_broken'), wall: L('any', 'rock_outcrop'), lip: L('meadow', 'grass_drape'),
    bones: [], ritual: 'meadow_fairy_ring' },
  peaks: { cover: L('peaks', 'frost_grass snow_patch alpine_flowers'),
    small: [...L('peaks', 'snow_rock snow_lump frozen_bush ice_shard'), 'any_rock'],
    tree: L('peaks', 'pine_snow pine_small dead_pine_snag'), debris: ['any_boulder', 'peaks_dead_pine_snag'],
    stone: L('ruins', 'obelisk_broken'), wall: L('any', 'rock_outcrop'), lip: L('peaks', 'snow_cornice'),
    bones: [], ritual: 'abyss_ritual_circle', flag: 'peaks_expedition_flag' },
  badlands: { cover: [...L('badlands', 'dry_grass cracked_mud'), 'any_gravel_patch'],
    small: [...L('badlands', 'prickly_pear dry_shrub agave broken_wagon_wheel'), 'any_rock'],
    tree: L('badlands', 'dead_tree cactus'), debris: [...L('badlands', 'rib_cage termite_mound'), 'any_boulder'],
    stone: L('badlands', 'sandstone_pillar'), wall: L('any', 'rock_outcrop'), lip: L('badlands', 'dry_root_drape'),
    bones: L('badlands', 'bleached_skull'), ritual: 'abyss_ritual_circle' },
  roots: { cover: L('roots', 'moss_patch leaf_litter cave_fern'),
    small: L('roots', 'moss_rock mushroom_cluster burrow_mound'),
    tree: [...L('roots', 'root_arch'), 'any_stalagmite'], debris: ['any_boulder', 'roots_root_arch'],
    stone: ['any_stalagmite', 'ruins_obelisk_broken'], wall: L('roots', 'root_web'), lip: L('roots', 'root_drape'),
    bones: [], ritual: 'meadow_fairy_ring' },
  frozen: { cover: L('frozen', 'frost_crust ice_chips'),
    small: L('frozen', 'ice_crystal frozen_spider_cocoon'),
    tree: L('frozen', 'ice_pillar'), debris: ['frozen_frozen_adventurer', 'any_boulder'],
    stone: L('frozen', 'ice_pillar'), wall: L('frozen', 'frost_crystals'), lip: L('frozen', 'frozen_drape'),
    bones: [], ritual: 'abyss_ritual_circle' },
  swamp: { cover: L('swamp', 'moss_carpet slime_puddle tiny_glowcaps puffballs'),
    small: L('swamp', 'pitcher_plant spore_pod reeds glow_mushroom'),
    tree: L('swamp', 'fungal_tree mangrove_roots'), debris: ['swamp_mangrove_roots', 'any_boulder'],
    stone: L('ruins', 'obelisk_broken'), wall: L('swamp', 'mushroom_shelf'), lip: L('swamp', 'hanging_moss'),
    bones: [], ritual: 'meadow_fairy_ring' },
  nests: { cover: L('nests', 'web_floor husk_scraps'),
    small: L('nests', 'egg_sac shed_exoskeleton bone_pile'),
    tree: L('nests', 'web_pillar'), debris: ['nests_webbed_crate', 'any_boulder'],
    stone: L('nests', 'web_pillar'), wall: L('nests', 'cobweb_corner wall_eggs web_sheet'), lip: [],
    bones: L('nests', 'bone_pile'), ritual: 'abyss_ritual_circle' },
  mines: { cover: L('mines', 'coal_scatter ore_chips'),
    small: L('mines', 'ore_pile sacks pickaxe_in_rock crystal_cluster'),
    tree: ['any_stalagmite'], debris: L('mines', 'barrel crate ore_cart tipped_cart wheelbarrow plank_stack'),
    stone: ['any_stalagmite'], wall: L('mines', 'ore_vein wall_lantern'), lip: [],
    bones: [], ritual: 'abyss_ritual_circle' },
  ruins: { cover: L('ruins', 'broken_tiles sand_drift rubble'),
    small: L('ruins', 'urn stone_tablet'),
    tree: L('ruins', 'broken_column'), debris: L('ruins', 'toppled_column column_base statue_head sarcophagus'),
    stone: L('ruins', 'obelisk_broken broken_column'), wall: L('ruins', 'wall_relief'), lip: [],
    bones: [], ritual: 'abyss_ritual_circle' },
  volcanic: { cover: L('volcanic', 'cinders pumice_chips'),
    small: L('volcanic', 'magma_rock obsidian_shard ash_vent fire_crystal'),
    tree: L('volcanic', 'charred_tree'), debris: ['volcanic_basalt_columns', 'any_boulder'],
    stone: L('volcanic', 'basalt_columns'), wall: L('any', 'rock_outcrop'), lip: [],
    bones: L('volcanic', 'scorched_bones'), ritual: 'abyss_ritual_circle' },
  abyss: { cover: L('abyss', 'void_flakes'), small: L('abyss', 'rune_stone void_crystal'),
    tree: L('abyss', 'bone_spire obsidian_spike'), debris: L('abyss', 'hovering_rock broken_altar weapon_graveyard'),
    stone: L('abyss', 'obsidian_spike bone_spire'), wall: L('abyss', 'wall_runes wall_shackles'), lip: L('abyss', 'dangling_chains'),
    bones: [], ritual: 'abyss_ritual_circle' },
};

const variants = new Map();
function variantsOf(base) {
  if (!variants.has(base)) variants.set(base, propMetadata.has(base) ? [base]
    : ['a', 'b', 'c'].map(v => base + '_' + v).filter(n => propMetadata.has(n)));
  return variants.get(base);
}

// arena: { type, shape, floors, frame, R, biome, tint, clutter } -> { placements, blockers, blocked }
export function dressArena(arena) {
  const { type, shape, floors, frame: fr, R, tint, clutter: k } = arena;
  const pal = PALETTES[arena.biome] || PALETTES.meadow;
  const out = [], blockers = [], blocked = new Set(), taken = new Set();
  const zone = floors.filter(f => f.encounter), scenery = floors.filter(f => f.arenaCell && !f.encounter);
  const start = floors[idx(...fr.E)];
  const nb = (f, d) => inb(f.x + DIRS[d][0], f.z + DIRS[d][1]) ? floors[idx(f.x + DIRS[d][0], f.z + DIRS[d][1])] : null;
  const nextTo = (f, test) => [0, 1, 2, 3].some(d => { const g = nb(f, d); return g && test(g); });
  const edgeZone = zone.filter(f => nextTo(f, g => g.arenaCell && !g.encounter));
  const rim = scenery.filter(f => nextTo(f, g => g.encounter));
  // the doorways, the guardian's spot and its lane stay clear of blockers
  const keep = f => fr.flat[f.c] || f.prot || segDist(f.x, f.z, fr.E, fr.U) < .8;
  const slope = f => Math.max(...f.cs) - Math.min(...f.cs);
  const pick = list => {
    const names = list.filter(Boolean).flatMap(variantsOf);
    return names.length ? names[Math.floor(R() * names.length)] : null;
  };
  const shuffle = list => { list = [...list]; for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };

  // every free zone cell is still reachable from the entrance
  function connected() {
    const seen = new Set([start]), queue = [start];
    for (let i = 0; i < queue.length; i++) for (const g of queue[i].link)
      if (g && g.encounter && !blocked.has(g.c) && !seen.has(g)) { seen.add(g); queue.push(g); }
    return zone.every(f => blocked.has(f.c) || seen.has(f));
  }

  function add(name, x, y, z, s, yaw = R() * Math.PI * 2, normal) {
    out.push({ name, x, y, z, yaw, s, tint: name.startsWith('any_') ? tint : null, ...(normal ? { normal } : {}) });
  }
  // a prop on floor f; blocking ones in the zone are checked against the floor graph
  function put(f, list, { gap = 2, scale = .85 + R() * .3, yaw, center = false } = {}) {
    const name = pick(list), p = name && propMetadata.get(name);
    if (!p || p.attach !== 'ground' || taken.has(f.c)) return false;
    let s = scale;
    if (p.blocking) {
      if (f.encounter) {
        if (keep(f) || slope(f) > .3) return false;
        for (const c of blocked) if (Math.max(Math.abs(c % N - f.x), Math.abs(((c / N) | 0) - f.z)) < gap) return false;
        blocked.add(f.c);
        if (!connected()) { blocked.delete(f.c); return false; }
      }
      s = Math.min(s, .44 / Math.max(.01, p.radius * .85));
    }
    const r = p.blocking ? p.radius * s * .85 : Math.max(0, .45 - p.radius * s);
    const room = center ? 0 : Math.max(0, p.blocking ? .5 - r - .03 : r);
    const fx = .5 + (R() - .5) * 2 * room, fz = .5 + (R() - .5) * 2 * room, y = floorY(f, fx, fz) - .02;
    add(name, f.x + fx, y, f.z + fz, s, yaw);
    taken.add(f.c);
    if (p.blocking) blockers.push({ x: f.x + fx, z: f.z + fz, r, bottom: y, top: y + p.maxY * s });
    return true;
  }
  // ground cover, several per cell, tilted with the slope
  function cover(cells, rate, list) {
    for (const f of cells) for (let n = 0; n < 2; n++) {
      if (R() >= (n ? rate * .5 : rate)) break;
      const name = pick(list), p = name && propMetadata.get(name);
      if (!p || p.blocking || p.attach !== 'ground') continue;
      const s = .7 + R() * .35, room = Math.max(0, .9 - 2 * p.radius * s);
      const fx = .5 + (R() - .5) * room, fz = .5 + (R() - .5) * room, e = .01;
      const dx = (floorY(f, fx + e, fz) - floorY(f, fx - e, fz)) / (2 * e);
      const dz = (floorY(f, fx, fz + e) - floorY(f, fx, fz - e)) / (2 * e);
      add(name, f.x + fx, floorY(f, fx, fz) + .008, f.z + fz, s, undefined, [-dx, 1, -dz]);
    }
  }
  const scatter = (cells, n, list, opts) => {
    let placed = 0;
    for (const f of shuffle(cells)) { if (placed >= n) break; if (put(f, list, opts)) placed++; }
    return placed;
  };
  const near = (cells, [x, z], r) => cells.filter(f => Math.hypot(f.x - x, f.z - z) <= r);
  const closest = (cells, [x, z]) => [...cells].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const n = v => Math.round(v * k);
  const open = zone.filter(f => !f.prot);

  // cliff faces seen from the zone, and the edges above them
  function faces(wallRate, lipRate, walls = pal.wall, lips = pal.lip) {
    for (const f of floors) {
      if (!f.arenaCell) continue;
      for (let d = 0; d < 4; d++) {
        const g = nb(f, d);
        if (!g || f.link[d] || !g.encounter) continue;
        const [a, b] = EDGE_CORNERS[d], [na, nb2] = EDGE_CORNERS[OPP[d]];
        const top = Math.min(f.cs[a], f.cs[b]), low = Math.max(g.cs[na], g.cs[nb2]), drop = top - low;
        if (drop < .9) continue;
        const t = .3 + R() * .4, [ex, ez] = [[1, t], [0, t], [t, 1], [t, 0]][d];
        const yaw = Math.atan2(-DIRS[d][0], -DIRS[d][1]), s = .85 + R() * .3;
        if (R() < lipRate) {
          const name = pick(lips), p = name && propMetadata.get(name);
          if (p?.attach === 'lip' && (p.drop ?? 0) * s + .2 < drop) add(name, f.x + ex, top, f.z + ez, s, yaw);
        }
        if (drop >= 1.2 && R() < wallRate) {
          const name = pick(walls), p = name && propMetadata.get(name), y = low + drop * .5;
          if (p?.attach === 'wall' && y + p.minY * s >= low && y + p.maxY * s + .1 <= top) add(name, f.x + ex, y, f.z + ez, s, yaw);
        }
      }
    }
  }
  // a pair of braziers just beside the gate pad: the lit way on, under its seal
  function gateLights() {
    const [gx, gz] = fr.G;
    scatter(open.filter(f => { const d = Math.hypot(f.x - gx, f.z - gz); return d > 1.9 && d < 2.9; }), 2, [BRAZIER]);
  }
  const remains = (cells, count) => scatter(cells, count, [...REMAINS, ...pal.bones]);
  const nearGuard = near(open, fr.U, 5);

  switch (type) {
    case 'hills': {
      cover(zone, .8, [...pal.cover, ...pal.cover, 'any_gravel_patch']);
      for (const c of shape.marks.peaks || []) {
        const f = floors[c];
        if (!put(f, [...pal.tree, ...pal.stone], { gap: 1 })) put(f, ['any_cairn', pal.flag]);
      }
      scatter(open, n(3), pal.debris);
      scatter(open, 9, [...pal.small, 'any_cairn']);
      remains(nearGuard, 3);
      faces(.15, .25);
      break;
    }
    case 'gorge': {
      cover(zone, .55, [...pal.cover, ...RUBBLE]);
      scatter(edgeZone, n(5), ['any_boulder', ...pal.debris]);
      scatter(edgeZone, 8, ['any_rock', 'any_pebbles', ...pal.small]);
      cover(scenery, .45, pal.cover);
      for (const f of scenery) if (R() < .22) put(f, [...pal.tree, ...pal.tree, ...pal.small, ...pal.stone]);
      remains(open, 3);
      faces(.4, .4);
      break;
    }
    case 'colosseum': {
      cover(zone, .65, [...TILES, ...RUBBLE]);
      const { center: [cx, cz] } = shape.marks, ang = f => Math.atan2(f.z - cz, f.x - cx);
      rim.sort((a, b) => ang(a) - ang(b)).forEach((f, i) => {
        if (i % 3 === 0) put(f, [COLUMN], { center: true });
        else if (i % 6 === 2) put(f, [BRAZIER]);
        else if (R() < .4) put(f, [...RUBBLE, 'ruins_urn']);
      });
      for (const f of scenery) if (!taken.has(f.c) && R() < .22) put(f, ['ruins_rubble', 'ruins_urn', 'ruins_statue_head', ...pal.small]);
      cover(scenery, .3, [...RUBBLE, ...pal.cover]);
      scatter(edgeZone, n(2), ['abyss_weapon_graveyard', 'ruins_toppled_column']);
      remains(open, 6);
      gateLights();
      faces(.45, .15, [TORCH, 'ruins_wall_relief', ...pal.wall]);
      break;
    }
    case 'dais': {
      cover(zone, .5, [...TILES, ...pal.cover]);
      const court = closest(open, shape.marks.court)[0];
      if (court) {
        put(court, [pal.ritual], { center: true });
        scatter(near(open, [court.x, court.z], 2.3).filter(f => f !== court), 2, [BRAZIER]);
      }
      // obelisks flank the ramp where it meets the throne
      const cheb = f => Math.max(Math.abs(f.x - fr.U[0]), Math.abs(f.z - fr.U[1]));
      const flank = open.filter(f => cheb(f) === 3 && !shape.ramp[f.c] && nextTo(f, g => shape.ramp[g.c]));
      scatter(flank, n(2), [...pal.stone, 'ruins_obelisk_broken'], { gap: 1, center: true });
      scatter(open.filter(f => cheb(f) === 2 && Math.abs(f.x - fr.U[0]) === 2 && Math.abs(f.z - fr.U[1]) === 2), 2, [BRAZIER]);
      const ledges = open.filter(f => nextTo(f, g => g.encounter && g.top !== f.top && !f.link.includes(g)));
      scatter(ledges, 7, ['ruins_urn', 'ruins_stone_tablet', ...pal.small]);
      rim.forEach((f, i) => { if (i % 2 === 0) put(f, [COLUMN], { center: true }); else if (R() < .5) put(f, RUBBLE); });
      cover(scenery, .4, [...TILES, ...pal.cover]);
      remains(nearGuard, 3);
      faces(.4, .2, ['ruins_wall_relief', TORCH, ...pal.wall]);
      break;
    }
    case 'henge': {
      cover(zone, .85, [...pal.cover, ...pal.cover, 'any_gravel_patch']);
      const stones = (shape.marks.stones || []).map(c => floors[c]).filter(f => f.encounter);
      stones.forEach((f, i) => { if (k >= 1 || (k > 0 && i % 2 === 0)) put(f, [...pal.stone, 'ruins_obelisk_broken'], { gap: 2, center: true }); });
      const mid = closest(open, shape.marks.center)[0];
      if (mid && !(k > 0 && put(mid, ['ruins_altar'], { gap: 1, center: true }))) put(mid, [pal.ritual], { center: true });
      scatter(near(open, shape.marks.center, shape.marks.rad + .8).filter(f => Math.hypot(f.x - shape.marks.center[0], f.z - shape.marks.center[1]) > shape.marks.rad - .8),
        4, ['any_cairn']);
      scatter(open, 6, pal.small);
      remains(nearGuard, 2);
      gateLights();
      faces(.15, .25);
      break;
    }
    case 'crater': {
      cover(zone, .6, [...pal.cover, ...pal.cover, ...RUBBLE, ...(arena.biome === 'volcanic' ? [] : ['volcanic_cinders'])]);
      scatter(open, n(5), ['ruins_toppled_column', 'any_boulder', 'abyss_weapon_graveyard', ...pal.debris]);
      scatter(open, 1, ['relics_old_campfire']);
      remains(open, 10);
      scatter(open, 6, [...pal.small, 'badlands_broken_wagon_wheel']);
      faces(.2, .25);
      break;
    }
    case 'grove': {
      cover(zone, 1, [...pal.cover, ...pal.cover, ...pal.small]);
      for (const c of shape.marks.clusters || []) {
        const at = [c % N, (c / N) | 0], trees = 1 + Math.round((1 + R() * 2) * k);
        scatter(near(open, at, 1.6), Math.min(trees, k ? 4 : 1), pal.tree, { gap: 1 });
      }
      scatter(open, n(2), pal.debris);
      scatter(open, 14, pal.small);
      remains(nearGuard, 2);
      faces(.2, .3);
      break;
    }
    case 'courtyard': {
      cover(zone, .75, [...TILES, ...TILES, ...pal.cover]);
      const ends = rim.filter(f => [0, 1, 2, 3].filter(d => { const g = nb(f, d); return g && g.arenaCell && !g.encounter; }).length <= 1);
      for (const f of ends) put(f, [COLUMN], { center: true });
      for (const f of scenery) if (!taken.has(f.c) && R() < .4) put(f, [...RUBBLE, ...pal.cover]);
      cover(scenery, .3, pal.cover);
      scatter(open, 5, ['ruins_urn', 'ruins_stone_tablet']);
      scatter(open, n(2), ['ruins_statue_head', 'ruins_toppled_column', 'ruins_column_base']);
      scatter(near(open, shape.marks.center, 2.5), 2, [BRAZIER]);
      remains(open, 2);
      gateLights();
      faces(.35, .35, ['ruins_wall_relief', TORCH, ...pal.wall]);
      break;
    }
  }
  return { placements: out, blockers, blocked };
}
