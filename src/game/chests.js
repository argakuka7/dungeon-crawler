// Treasure chests at the cube's reward sites (map.rewardSites, docs/world.md): hover one to see
// it (game/lootlabels.js), click it to walk up and open it (game/orders.js), or stand next to it
// and press the action key (F or Enter, useAction). It spills its loot
// (core/chests.js) in front of it once the lid is open and stays open for the run (run.chests). What it spilled is
// `kept`: a death does not take it away, as the chest does not close again either. Playing
// together a chest opens for everyone: the loot is the opener's roll (game/loot.js), and the
// others see the lid open (shareChest).
import { player, state, setStatus } from './state.js';
import { chestLoot } from '../core/chests.js';
import { favoredKind } from '../core/combat.js';
import { showChestOpen } from '../render/chests.js';
import { spill } from './loot.js';
import { sfx } from '../audio/sfx.js';

const OPEN_REACH = 1.2;   // cells from the chest's centre the player opens it from

// the closed chests in this cube
export const closedChests = () => (state.map?.rewardSites ?? []).filter(s => s.anchor && !state.run.chests.has(s.id));
export const canReachChest = site => Math.hypot(site.anchor.x - player.x, site.anchor.z - player.z) <= OPEN_REACH
  && Math.abs(site.anchor.y - player.y) <= 0.8;

// the closed chest the player stands next to (the nearest one), if any
export function chestInReach() {
  let best = null, bestD = Infinity;
  for (const s of closedChests()) {
    const d = Math.hypot(s.anchor.x - player.x, s.anchor.z - player.z);
    if (d < bestD && canReachChest(s)) { best = s; bestD = d; }
  }
  return best;
}

// The action key (F or Enter, game/input.js and game/console.js): open the chest next to the
// player. False when there is nothing to do, so the key can do what it does otherwise.
export function useAction() {
  if (state.mode !== 'play' || state.transitioning || state.inventoryOpen || player.down || player.ragdoll) return false;
  const site = chestInReach();
  return site ? openChest(site) : false;
}

export function openChest(site) {
  if (state.run.chests.has(site.id) || state.run.dropped.has(`c:${site.id}`) || !state.map) return false;
  state.run.chests.add(site.id);
  // the loot only comes out once the lid is all the way open
  const opening = showChestOpen(state.world, site.id);
  const { copper, items } = chestLoot(site, state.map.depth, state.map.seed, favoredKind(player));
  const a = site.anchor, front = site.approach ?? a;
  spill(`c:${site.id}`, front, copper, items, { kept: true }, { x: a.x, y: a.y + 0.6, z: a.z }, opening);
  sfx('chest', { at: a });
  setStatus('You opened a treasure chest');
  return true;
}

// Playing together, another player opened chest `id` (net/session.js): open here too (the
// lid opens if we are there; elsewhere it is open once we come)
export function shareChest(id) {
  if (state.run.chests.has(id)) return;
  state.run.chests.add(id);
  const site = state.map?.rewardSites?.find(s => s.id === id);
  if (!site) return;
  showChestOpen(state.world, id);
  if (site.anchor) sfx('chest', { at: site.anchor });
}
