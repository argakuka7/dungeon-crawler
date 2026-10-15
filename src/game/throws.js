// The player's flasks (core/throws.js) in the current cube: in flight, bursting, and what the
// fire and toxic ones leave behind for a while: a burning patch, a poison cloud. With a flask
// in hand (core/inventory.js readied) a click throws it at the cursor (game/input.js) and the
// arc it would fly is shown (render/throws.js). Nothing here hurts the player. Travel and level
// resets clear them all. Playing together, the friend's flasks fly and burst here too (`ghost`),
// but what they do to the enemies is the friend's to do.
import { player, state, setStatus } from './state.js';
import { insideSolid, groundAt } from '../physics/collide.js';
import { clearLine } from '../physics/enemynav.js';
import { damageEnemy, readiedFlask } from '../core/combat.js';
import { launchFlask, stepFlask, releasePoint, clampTarget, arcOf, burstVictims, inArea } from '../core/throws.js';
import { slotOf, removeItem, readiedItem } from '../core/inventory.js';
import { startCooldown } from '../core/potions.js';
import { hitEnemy } from './sword.js';
import { afflictEnemy } from './statuses.js';
import { flaskFx } from './juice.js';
import { pickFloor, aimPoint, hoveredEnemy, pointer } from './pointer.js';
import { syncEquippedWeapon } from './equipment.js';
import { relay } from '../net/online.js';
import { drawFlasks, removeFlaskViews, drawAreas, removeAreaViews, drawArc } from '../render/throws.js';

export let flasks = [], areas = [];
const solid = (x, y, z) => insideSolid(x, z, y);

// What a throw would aim at: the enemy under the cursor (its feet), else the floor under it,
// else the cursor's point at the player's height; null off the game.
export function throwTarget() {
  const e = hoveredEnemy();
  if (e) return { x: e.x, y: e.y, z: e.z, enemy: e };
  const hit = pickFloor();
  if (hit) return { x: hit.x, y: hit.y, z: hit.z };
  const a = aimPoint(player.y);
  return a && { x: a.x, y: player.y, z: a.z };
}
// where a throw at `target` (an enemy, a point, or null: straight ahead) comes down, in range
function landing(p, target, range, yaw) {
  const to = target ?? { x: p.x + Math.sin(yaw) * range * 0.6, y: p.y, z: p.z + Math.cos(yaw) * range * 0.6 };
  return clampTarget(p.x, p.z, { x: to.x, y: to.y, z: to.z }, range);
}

// The throw with stats `stats` lets its flask go at `target`, from p turned to `yaw`: one
// fewer in the bag, and that kind's cooldown starts. The last one gone, the weapon comes back.
export function throwFlask(p, stats, target, yaw) {
  const inv = p.inventory, slot = slotOf(inv, stats.flask);
  if (!slot) return null;
  removeItem(inv, slot.instanceId, 1);
  startCooldown(p, stats.flask, state.time);
  const f = launchFlask(releasePoint(p, yaw), landing(p, target, stats.range, yaw), stats);
  flasks.push(f);
  flaskFx(f, 'launch');
  relay.toss?.(f);
  if (!readiedItem(inv)) { syncEquippedWeapon(); setStatus('That was the last one'); }
  return f;
}

// the flask bursts where it is: it hurts, burns or poisons the enemies around (in sight of the
// burst), and a fire or toxic one leaves its patch or cloud on the floor below
function burst(f, enemies) {
  const s = f.stats, at = { x: f.x, y: f.y, z: f.z };
  for (const { e, share } of f.ghost ? [] : burstVictims(at, s.radius, enemies)) {
    if (!clearLine(at.x, at.y + 0.25, at.z, e.x, e.y + e.profile.bodyHeight * 0.5, e.z)) continue;
    if (s.blast) {
      const before = e.hp, damage = Math.max(1, Math.round(s.blast * share));
      if (damageEnemy(e, damage)) hitEnemy(e, { damage, crit: false }, before, e.x - at.x, e.z - at.z, s.burn ? 0.4 : 1.8);
    }
    if (s.burn) afflictEnemy(e, 'burning', s.burn);
    if (s.toxin) afflictEnemy(e, 'toxic', s.toxin);
  }
  if (!f.ghost) state.enemyGrace = 0;   // you started it
  const floor = groundAt(at.x, at.z, at.y + 0.3, 0).h;
  const y = Number.isFinite(floor) && at.y - floor < 2.5 ? floor : null;
  const ghost = !!f.ghost;
  if (y !== null && s.patch) areas.push({ kind: 'fire', status: 'burning', spec: s.burn, x: at.x, y, z: at.z, r: s.radius * 0.8, t: 0, time: s.patch, ghost });
  if (y !== null && s.cloud) areas.push({ kind: 'toxic', status: 'toxic', spec: s.toxin, x: at.x, y, z: at.z, r: s.radius, t: 0, time: s.cloud, ghost });
  flaskFx(f, 'burst');
}

export function updateThrows(dt, enemies) {
  if (state.inventoryOpen || state.transitioning) return;
  if (flasks.length) flasks = flasks.filter(f => {
    const end = stepFlask(f, dt, enemies, solid);
    f.spin += dt * 9;
    if (!end) return true;
    if (end !== 'lost') burst(f, enemies);
    removeFlaskViews([f]);
    return false;
  });
  // what walks into a burning patch catches fire, what stands in a cloud is poisoned (a status
  // already running is left to run, core/status.js)
  for (const a of areas) {
    a.t += dt;
    if (!a.ghost) for (const e of enemies)
      if (!e[a.status] && e.mode !== 'dead' && inArea(a, e.x, e.y, e.z, e.profile.radius)) afflictEnemy(e, a.status, a.spec);
  }
  if (areas.some(a => a.t >= a.time)) {
    removeAreaViews(areas.filter(a => a.t >= a.time));
    areas = areas.filter(a => a.t < a.time);
  }
}
// the friend's flask (what relay.toss sent): it flies and bursts here, harmlessly
export function ghostFlask(f) {
  const g = { ...f, ghost: true };
  flasks.push(g);
  flaskFx(g, 'launch');
}
export function drawThrows(dt, off) { drawFlasks(flasks, dt, off); drawAreas(areas, dt, off); }
export function clearThrows() { removeFlaskViews(flasks); removeAreaViews(areas); flasks = []; areas = []; }

// every frame: the arc a click would throw the flask in hand along, or none
export function updateAim(enemies) {
  const flask = readiedFlask(player);
  if (!flask || !state.map || state.inventoryOpen || state.transitioning || !pointer.inside || player.ragdoll || player.climb || player.swimming
      || (player.sword.active && player.sword.fired)) { drawArc(null); return; }
  const target = throwTarget();
  if (!target) { drawArc(null); return; }
  const range = flask.flask.range, yaw = Math.atan2(target.x - player.x, target.z - player.z);
  const to = landing(player, target, range, yaw), arc = arcOf(releasePoint(player, yaw), to, enemies, solid);
  drawArc({ ...arc, radius: flask.flask.radius, color: flask.flask.color, clamped: !!to.clamped });
}
