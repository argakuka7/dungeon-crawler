// Reserve destinations before slabs/routing. Site prestige is fixed by the world spec;
// only the arrangement changes on a terrain retry. All coordinates are attachment-space.
import { N, LH, HEAD, MAX_L, CHAR_H, CHAR_R } from '../core/constants.js';
import { idx, hash32, mulberry32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { propMetadata } from '../core/propcatalog.js';
import { PRESTIGE } from '../world/sites.js';
import { search, take } from './route.js';
import { reachTo } from './reach.js';

export const RECIPES = {
  mines: { storage: ['sacks', 'plank_stack', 'lantern'], gallery: ['sacks', 'pickaxe_in_rock', 'lantern'],
    excavation: ['ore_pile', 'tipped_cart', 'crystal_cluster'] },
  ruins: { burial: ['sarcophagus', 'urn', 'brazier'], hall: ['column_base', 'stone_tablet', 'brazier'],
    courtyard: ['altar', 'obelisk_broken', 'urn'] },
  roots: ['moss_rock', 'mushroom_cluster', 'cave_fern'], frozen: ['frozen_adventurer', 'ice_crystal', 'ice_pillar'],
  swamp: ['fungal_tree', 'puffballs', 'glow_mushroom'], nests: ['webbed_crate', 'egg_sac', 'bone_pile'],
  volcanic: ['fire_crystal', 'scorched_bones', 'obsidian_shard'], abyss: ['broken_altar', 'void_crystal', 'ritual_circle'],
  meadow: ['fairy_ring', 'fern', 'berry_bush'], peaks: ['expedition_flag', 'alpine_flowers', 'ice_crystal'],
  badlands: ['rib_cage', 'agave', 'broken_wagon_wheel'],
  clouds: ['rainbow_crystal', 'sky_nest', 'storm_jar'], lagoon: ['buried_chest', 'tiki_torch', 'driftwood'],
  karst: ['rice_sheaves', 'stone_lantern', 'banana_plant'], highlands: ['butter_lamps', 'mani_stones', 'chorten_small'],
  saltflats: ['pink_halite', 'salt_cones', 'salt_bricks'], grotto: ['giant_clam', 'jelly_lantern', 'sunken_anchor'],
  hive: ['wax_candles', 'honey_pot', 'comb_mound'], ossuary: ['candelabra', 'funeral_urn', 'sarcophagus'],
  forge: ['crucible', 'ingot_stack', 'anvil_block'], cenote: ['copal_bowl', 'orchid_rock', 'jade_idol'],
};
const rotate = (u, v, yaw) => [[u, v], [-v, u], [-u, -v], [v, -u]][yaw];
const at = (site, u, v) => { const [dx, dz] = rotate(u, v, site.turn); return idx(site.cx + dx, site.cz + dz); };
const heightAt = (site, u, v) => {
  const { setting, rank, rx, rz, level } = site;
  if (rank && (setting === 'excavation' || setting === 'courtyard') && Math.abs(u) < rx && Math.abs(v) < rz - 1)
    return level - (setting === 'excavation' ? 4 : 2);
  if (rank && ['hall', 'burial', 'gallery'].includes(setting) && v >= rz - 1) return level + 2;
  return level;
};

export function reserveSites(ctx) {
  ctx.sites = []; ctx.siteFailures = []; ctx.siteSpace = new Map();
  const occupied = new Set();
  for (const intent of ctx.spec.rewardSites || []) {
    const rank = PRESTIGE.indexOf(intent.prestige);
    if (rank < 0) throw Error('Unknown site prestige: ' + intent.prestige);
    let rx = [1, 2, 2, 3][rank], rz = [1, 1, 2, 2][rank];
    if (intent.setting === 'gallery' || intent.setting === 'hall') [rx, rz] = [rz, rx];
    const R = mulberry32(hash32(ctx.seed ^ intent.seed)), candidates = [];
    const portalCells = new Set(ctx.portals.flatMap(p => p.cells));
    for (const layer of [...new Set([ctx.K - 1, 0])]) for (let turn = 0; turn < 4; turn++) {
      for (let cz = 2; cz < N - 2; cz++) for (let cx = 2; cx < N - 2; cx++) {
        const site = { ...intent, rank, rx, rz, cx, cz, turn, layer }, cells = [];
        for (let v = -rz; v <= rz; v++) for (let u = -rx; u <= rx; u++) {
          const [dx, dz] = rotate(u, v, turn), x = cx + dx, z = cz + dz;
          if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) { cells.length = 0; break; }
          cells.push({ c: idx(x, z), u, v });
        }
        if (cells.length !== (rx * 2 + 1) * (rz * 2 + 1)) continue;
        if (cells.some(({ c }) => occupied.has(c) || portalCells.has(c) || ctx.sky.has(c)
          || ctx.spouts.some(s => s.cells.includes(c)))) continue;
        if (!layer && cells.some(({ c }) => ctx.fluid0[c] || ctx.void0[c])) continue;
        // Top-layer platforms preserve fluids/void below; never crush existing ground.
        site.level = layer ? ctx.B[layer] : Math.min(12, Math.max(4,
          Math.round(cells.reduce((sum, { c }) => sum + ctx.lvl0[c], 0) / cells.length)));
        if (cells.some(({ c, u, v }) => {
          const h = heightAt(site, u, v);
          return h < 2 || h > MAX_L || (layer && !ctx.void0[c]
            && Math.max(ctx.lvl0[c], ctx.surf0[c]) + HEAD > h - 2);
        })) continue;
        const distance = Math.min(...ctx.portals.map(p => Math.hypot(cx - p.c % N, cz - Math.floor(p.c / N))));
        if (distance < 2 + rank * 0.6) continue;
        candidates.push({ site, cells, score: distance + R() * 3 + (layer ? rank * 2 : 0) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates[0];
    if (!selected) { ctx.siteFailures.push({ id: intent.id, prestige: intent.prestige, reason: 'no footprint' }); continue; }
    const { site, cells } = selected;
    site.cells = cells.map(p => p.c); site.anchorCell = at(site, 0, rz); site.accessCell = at(site, 0, rz - 1);
    site.dressing = [];
    for (const { c, u, v } of cells) {
      occupied.add(c);
      ctx.siteSpace.set(c, { site, top: heightAt(site, u, v), layer: site.layer });
      if (!site.layer) ctx.lvl0[c] = heightAt(site, u, v);
    }
    ctx.sites.push(site);
  }
}

// Called while floors are still unindexed, before optional fluids/supports change them.
export function prepareSites(ctx) {
  for (const site of ctx.sites) {
    site.floor = ctx.layerFloor(site.anchorCell, site.layer);
    site.access = ctx.layerFloor(site.accessCell, site.layer);
    const recipe = RECIPES[site.biome], bases = Array.isArray(recipe) ? recipe : recipe?.[site.setting] || [];
    const R = mulberry32(site.seed);
    const positions = [[-site.rx, site.rz], [site.rx, site.rz], [-site.rx, -site.rz]];
    const add = (name, c, s, yaw) => {
      const p = propMetadata.get(name), f = ctx.layerFloor(c, site.layer);
      if (!p || !f || p.attach !== 'ground') return;
      const above = ctx.nextAbove(f);
      if (above && above.bottom * LH < f.top * LH + p.maxY * s + CHAR_H) return;
      if (p.blocking) { f.siteBlocked = true; f.siteBlockTop = f.top + Math.ceil(p.maxY * s / LH); }
      f.siteDressing = true;
      site.dressing.push({ name, c, s, yaw, blocking: !!p.blocking });
    };
    add('treasure_chest', site.anchorCell, 0.8, -site.turn * Math.PI / 2 + Math.PI);
    positions.forEach(([u, v], i) => {
      // Basic alcoves get a chest and one non-blocking detail; larger sites get a composition.
      const name = `${site.biome}_${bases[i]}_${R() < 0.5 ? 'a' : 'b'}`, p = propMetadata.get(name);
      if (site.rank || (i === 0 && !p?.blocking)) add(name, at(site, u, v), 0.9, -site.turn * Math.PI / 2);
    });
    if (site.rank && site.setting === 'gallery') {
      for (let v = -site.rz; v < site.rz - 1; v++)
        add('mines_rail_piece_a', at(site, site.rx, v), 1, -site.turn * Math.PI / 2);
    }
    if (site.rank >= 2 && site.setting === 'hall') {
      for (const u of [-site.rx, site.rx]) for (const v of [-site.rz + 1, site.rz - 1])
        add('ruins_broken_column_a', at(site, u, v), 0.9, -site.turn * Math.PI / 2);
    }
  }
}

// Both directions are required, unlike the generator's one-way exit guarantee.
export function routeSites(ctx) {
  for (const site of ctx.sites) {
    const entry = ctx.portalFloors.find(f => f !== ctx.hub) || ctx.hub || ctx.portalFloors[0];
    const exit = ctx.hub || entry;
    const approach = entry && search(ctx, entry, site.access, ctx.jitter, ctx.have);
    const back = exit && search(ctx, site.access, exit, ctx.jitter, ctx.have);
    site.connected = !!approach && !!back;
    if (site.connected) {
      take(ctx, approach); take(ctx, back);
      site.entry = entry; site.exitFloor = exit;
    }
  }
  // These are not disposable decorative routes: structural placement must fit them.
  if (ctx.sites.some(site => site.connected)) ctx.reqMoves = ctx.moves.length;
}

export function finishSites(ctx) {
  const rewardSites = [], placements = [], blockers = Array.from({ length: N * N }, () => []);
  for (const site of ctx.sites) {
    const reachable = site.connected && reachTo(ctx, site.access, true)?.has(site.entry.id)
      && reachTo(ctx, site.exitFloor, true)?.has(site.access.id);
    const accessClear = site.access && !ctx.pieces[site.access.c].length && !ctx.pieces[site.floor.c].length
      && !site.access.fluid && !site.floor.fluid
      && Math.max(...site.access.cs) - Math.min(...site.access.cs) < 0.2
      && Math.max(...site.floor.cs) - Math.min(...site.floor.cs) < 0.2
      && Math.abs(floorY(site.floor, 0.5, 0.5) - floorY(site.access, 0.5, 0.5)) < 0.1;
    if (!reachable || !accessClear) {
      ctx.siteFailures.push({ id: site.id, prestige: site.prestige, reason: 'approach or return blocked' });
      continue;
    }
    for (const q of site.dressing) {
      const f = ctx.layerFloor(q.c, site.layer), p = propMetadata.get(q.name);
      const y = floorY(f, 0.5, 0.5);
      const placement = { name: q.name, x: f.x + 0.5, y, z: f.z + 0.5, yaw: q.yaw, s: q.s, site: site.id };
      placements.push(placement);
      if (q.blocking) {
        const b = { x: placement.x, z: placement.z, r: p.radius * q.s, bottom: y, top: y + p.maxY * q.s };
        // Conservative cell indexing includes character-radius overlap near cell edges.
        for (let z = Math.max(0, Math.floor(b.z - b.r - CHAR_R)); z <= Math.min(N - 1, Math.floor(b.z + b.r + CHAR_R)); z++)
          for (let x = Math.max(0, Math.floor(b.x - b.r - CHAR_R)); x <= Math.min(N - 1, Math.floor(b.x + b.r + CHAR_R)); x++) blockers[idx(x, z)].push(b);
      }
    }
    const anchor = { x: site.floor.x + 0.5, y: floorY(site.floor, 0.5, 0.5), z: site.floor.z + 0.5, yaw: -site.turn * Math.PI / 2 + Math.PI };
    rewardSites.push({ id: site.id, seed: site.seed, prestige: site.prestige, biome: site.biome,
      setting: site.setting, form: site.form, encounter: site.encounter, spawn: site.spawn, layer: site.layer,
      cells: site.cells, anchor, floor: site.floor.id, accessFloor: site.access.id,
      entryFloor: site.entry.id, exitFloor: site.exitFloor.id,
      approach: { x: site.access.x + 0.5, y: floorY(site.access, 0.5, 0.5), z: site.access.z + 0.5 } });
  }
  ctx.stats.sites = rewardSites.length; ctx.stats.requestedSites = (ctx.spec.rewardSites || []).length;
  return { rewardSites, sitePlacements: placements, staticBlockers: blockers, siteFailures: ctx.siteFailures,
    siteReservations: ctx.sites.flatMap(site => site.cells.map(c => ({ c, layer: site.layer }))) };
}
