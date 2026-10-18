// Mouse orders, Diablo style: click the floor to walk there, click an enemy to go and hit
// it (with a bow, crossbow or staff: until it is in range and in sight, then shoot), click an item on the floor (or its label) to go and pick it up, click a treasure chest to
// go and open it, click a villager who trades to walk up and trade (core/shops.js). Holding the button
// keeps walking towards the cursor / keeps attacking. WASD cancels.
// Orders steer only; the speed (run, or walk with Ctrl) is up to update.js.
// Walks follow the floor graph where there is one (floors, stairs, bridges and landings; to
// the reachable one closest to the target), cutting corners where the way is clear, else head
// straight for the target.
import { CHAR_H, CHAR_R, N } from '../core/constants.js';
import { combatStats, inReachBand } from '../core/combat.js';
import { lineOfFire } from './shots.js';
import { walkable, neighbors, groundY } from '../physics/enemynav.js';
import { containsXZ } from '../core/blockers.js';
import { player, state } from './state.js';
import { pointer, pickFloor, hoveredEnemy } from './pointer.js';
import { queueAttack } from './sword.js';
import { groundAt } from '../physics/collide.js';
import { lootHere, takePickup, canReachPickup } from './loot.js';
import { canReachChest, openChest } from './chests.js';
import { TRADE_REACH } from '../core/shops.js';
import { openShop } from './inventory.js';
import { absent } from '../core/enemies.js';

// kind: 'move' (to x, z) | 'attack' (enemy) | 'pickup' (a pickup) | 'chest' (a reward site) |
// 'trade' (a villager); path: floors to follow, i: the next one
export const order = { kind: null, x: 0, z: 0, floor: null, enemy: null, pickup: null, chest: null, villager: null, path: null, i: 1, repath: 0, stuck: 0, lx: 0, lz: 0, hold: 0 };

export function clearOrder() { order.kind = null; order.enemy = null; order.pickup = null; order.chest = null; order.villager = null; order.path = null; }
// Teleports/travel invalidate cube-local targets; a held click must not recreate them.
export function clearMouseInput() { clearOrder(); pointer.down = false; pointer.mode = null; }

const floorOf = s => s && s.kind !== 'pillar' ? s : null;

// can the player walk through floor f: headroom, and the body fits in the middle of the cell
function passable(f) {
  if (!walkable(f, CHAR_H, true)) return false;
  const y = groundY(f, f.x + 0.5, f.z + 0.5);
  return !(state.map.blockers?.[f.c] || []).some(b => b.bottom < y + CHAR_H && b.top > y + 0.1
    && containsXZ(b, f.x + 0.5, f.z + 0.5, CHAR_R + 0.03));
}
// breadth-first over the floor graph; ends at `to`, or the reached floor closest to it
function route(from, to) {
  const prev = new Map([[from, null]]), d2 = f => (f.x - to.x) ** 2 + (f.z - to.z) ** 2;
  let front = [from], best = from;
  for (let n = 0; n < 2 * N && front.length && !prev.has(to); n++) {
    const next = [];
    for (const f of front) for (const g of neighbors(f, CHAR_H, passable)) {
      if (prev.has(g)) continue;
      prev.set(g, f); next.push(g);
      if (d2(g) < d2(best)) best = g;
    }
    front = next;
  }
  const path = [];
  for (let f = prev.has(to) ? to : best; f; f = prev.get(f)) path.unshift(f);
  return path;
}
function plan(floor) {
  const from = floorOf(player.support);
  order.path = null; order.i = 1;
  if (!from || !floor || from === floor) return;
  const path = route(from, floor);
  if (path.length < 2) return;
  order.path = path; order.cells = new Set(path.map(f => f.c));
  const end = path[path.length - 1];
  if (end !== floor && order.kind === 'move') { order.x = end.x + 0.5; order.z = end.z + 0.5; }   // as close as it gets
}
// is the straight walk from the player to (x, z) on the path's cells (body width included)?
function clearTo(x, z) {
  const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.2);
  const px = -dz / (d || 1) * 0.22, pz = dx / (d || 1) * 0.22;
  for (let i = 1; i <= n; i++) {
    const sx = player.x + dx * i / n, sz = player.z + dz * i / n;
    for (const [ox, oz] of [[0, 0], [px, pz], [-px, -pz]]) {
      const cx = Math.floor(sx + ox), cz = Math.floor(sz + oz);
      if (cx < 0 || cz < 0 || cx >= N || cz >= N || !order.cells.has(cz * N + cx)) return false;
    }
  }
  return true;
}
function begin(kind) {
  if (order.kind !== kind) Object.assign(order, { stuck: 0, lx: player.x, lz: player.z });
  order.kind = kind;
}

// hit: a pickFloor() result
export function orderMove(hit) {
  begin('move');
  Object.assign(order, { x: hit.x, z: hit.z, floor: floorOf(hit.s), enemy: null, pickup: null, repath: 1e9 });
  plan(order.floor);
}
export function orderAttack(e) {
  begin('attack');
  Object.assign(order, { enemy: e, pickup: null, path: null, repath: 0 });
}
// p: a pickup in this cube
export function orderPickup(p) {
  begin('pickup');
  Object.assign(order, { x: p.x, z: p.z, floor: floorOf(groundAt(p.x, p.z, p.y + 0.3, 0).s), enemy: null, pickup: p, repath: 1e9 });
  plan(order.floor);
  if (canReachPickup(p)) { takePickup(p); clearOrder(); }   // already there
}
// site: a reward site with a closed chest; walk to the spot in front of it
export function orderChest(site) {
  begin('chest');
  const at = site.approach ?? site.anchor;
  Object.assign(order, { x: at.x, z: at.z, floor: floorOf(groundAt(at.x, at.z, at.y + 0.3, 0).s), enemy: null, pickup: null, chest: site, repath: 1e9 });
  plan(order.floor);
  if (canReachChest(site)) { openChest(site); clearOrder(); }
}

// a villager (state.map.villagers) close enough to trade with
export const canTrade = v => Math.hypot(v.x - player.x, v.z - player.z) <= TRADE_REACH && Math.abs(v.y - player.y) <= 0.8;
// v: a villager with a shop; walk to the spot in front of them
export function orderTrade(v) {
  begin('trade');
  const x = v.x + Math.sin(v.yaw) * 0.85, z = v.z + Math.cos(v.yaw) * 0.85;
  Object.assign(order, { x, z, floor: floorOf(groundAt(x, z, v.y + 0.3, 0).s), enemy: null, pickup: null, chest: null, villager: v, repath: 1e9 });
  plan(order.floor);
  if (canTrade(v)) { clearOrder(); openShop(v); }
}

// the held button: keep walking to the cursor, or pick the next enemy under it
export function holdPointer(dt) {
  if (!pointer.down || state.transitioning || state.inventoryOpen) return;
  if (pointer.mode === 'move' && (order.hold -= dt) <= 0) {
    order.hold = 0.12;
    const hit = pickFloor();
    if (hit) orderMove(hit);
  } else if (pointer.mode === 'attack' && order.kind !== 'attack' && hoveredEnemy()) orderAttack(hoveredEnemy());
}

// this frame's steering { dx, dz }, or null without an order; in reach of the target
// it stands and swings instead
export function followOrder(dt) {
  if (!order.kind) return null;
  if (state.transitioning || player.ragdoll || player.climb || player.hp <= 0) { clearOrder(); return null; }
  let tx = order.x, tz = order.z;
  if (order.kind === 'attack') {
    const e = order.enemy;
    if (!e || absent(e)) { clearOrder(); return null; }
    // a blade needs the enemy in reach at about our height; a shot, in range and in sight
    const stats = combatStats(player), reach = (stats?.range ?? 0.85) + e.profile.radius - 0.08;
    const near = Math.hypot(e.x - player.x, e.z - player.z) <= reach;
    if (near && (stats?.ranged ? inReachBand(player, e, stats) && lineOfFire(player, e, stats) : Math.abs(e.y - player.y) < 0.7)) {
      queueAttack(e);
      if (!pointer.down) clearOrder();   // a click is one swing; holding keeps swinging
      return { dx: 0, dz: 0 };
    }
    tx = e.x; tz = e.z;
    if ((order.repath -= dt) <= 0) { order.repath = 0.3; plan(floorOf(e.f)); }
  }
  if (order.kind === 'pickup') {
    const p = order.pickup;
    if (p.fly || !lootHere().includes(p)) { clearOrder(); return null; }   // someone (C, a death) took it
    if (canReachPickup(p)) { takePickup(p); clearOrder(); return { dx: 0, dz: 0 }; }
  }
  if (order.kind === 'chest') {
    if (state.run.chests.has(order.chest.id)) { clearOrder(); return null; }
    if (canReachChest(order.chest)) { openChest(order.chest); clearOrder(); return { dx: 0, dz: 0 }; }
  }
  if (order.kind === 'trade' && canTrade(order.villager)) { const v = order.villager; clearOrder(); openShop(v); return { dx: 0, dz: 0 }; }
  // the next floor on the path (skipping those we already reached), the target at the end
  let wx = tx, wz = tz;
  const path = order.path;
  if (path) {
    const at = path.indexOf(player.support);
    if (at >= order.i) order.i = at + 1;
    while (order.i < path.length - 1 && Math.hypot(path[order.i].x + 0.5 - player.x, path[order.i].z + 0.5 - player.z) < 0.4) order.i++;
    // cut corners: aim for the furthest point ahead that is a straight, clear walk away
    const point = k => k >= path.length - 1 ? [tx, tz] : [path[k].x + 0.5, path[k].z + 0.5];
    while (order.i < path.length - 1 && clearTo(...point(order.i + 1))) order.i++;
    if (order.i < path.length - 1) [wx, wz] = point(order.i);
  }
  const left = Math.hypot(tx - player.x, tz - player.z);
  if ((order.kind === 'move' || order.kind === 'chest' || order.kind === 'trade') && left < 0.08) { clearOrder(); return { dx: 0, dz: 0 }; }
  // give up when walking into something for a while
  if (player.sword.active || player.stun > 0 || Math.hypot(player.x - order.lx, player.z - order.lz) > 0.2) {
    order.stuck = 0; order.lx = player.x; order.lz = player.z;
  } else if ((order.stuck += dt) > 0.6) { clearOrder(); return null; }
  const dx = wx - player.x, dz = wz - player.z, d = Math.hypot(dx, dz) || 1;
  const ease = order.kind === 'move' || order.kind === 'chest' || order.kind === 'trade' ? Math.min(1, Math.max(0.25, left / 0.5)) : 1;   // settle onto the spot
  return { dx: dx / d * ease, dz: dz / d * ease };
}
