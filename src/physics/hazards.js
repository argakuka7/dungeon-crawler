// Fluids (drown / burn / dissolve), waterfalls, health regeneration and the respawn point.
import { LH, LAVA, ACID, DIRS } from '../core/constants.js';
import { floorY } from '../core/surfaces.js';
import { takeDamage, regenerate } from '../core/progression.js';
import { player, state } from '../game/state.js';
import { hurt } from '../game/flow.js';
import { knockDown, dieInFluid } from '../game/ragdoll.js';
import { inFluid, fluidSurface } from './fluid.js';
import { startFall, landFall } from '../game/fall.js';
import { poisonPlayer } from '../game/enemycombat.js';
import { toxinOf, ACID_TOXIN } from '../core/status.js';

// returns false when the player got respawned. Entering any fluid is fatal; walking
// is kept off fluid edges (and holes into the void) by canMove, so only jumps, falls and
// knockbacks get here.
function fluids(gr) {
  player.swimming = false; player.fluid = 0;
  const fluid = inFluid(gr, player.y);
  if (fluid) { dieInFluid(fluid, fluidSurface(gr)); return false; }
  return true;
}

// standing in a waterfall: the current pushes you out; lava and acid falls hurt (acid poisons)
function falls(dt, ci) {
  for (const f of state.map.falls) {
    if (ci !== f.c) continue;
    const lx = player.x - Math.floor(player.x), lz = player.z - Math.floor(player.z);
    const dist = [lx, 1 - lx, lz, 1 - lz][f.d], lat = f.d < 2 ? lz : lx;
    if (dist > 0.45 || lat < 0.06 || lat > 0.94 || player.y > f.top * LH || player.y < f.bot * LH - 0.5) continue;
    if (f.type === LAVA) { knockDown({ damage: 50, reason: 'Burned by a lavafall!', respawn: 'safe' }); return false; }
    if (f.type === ACID) {
      takeDamage(player, 40 * dt, state.time);
      if (!player.toxic) poisonPlayer(toxinOf(ACID_TOXIN, player.maxHp), 'Poisoned by acid');
      if (!state.statusMsg) state.statusMsg = 'Acid rain!';
      if (player.hp <= 0) { knockDown({ reason: 'Dissolved by acid' }); return false; }
    }
    player.vx += DIRS[f.d][0] * 9 * dt; player.vz += DIRS[f.d][1] * 9 * dt;
    if (!player.grounded) player.vy -= 12 * dt;
  }
  return true;
}

export function applyHazards(dt, gr) {
  // below the cube: through the void into the cube below, or out of the world
  if (player.y < -1.5 && startFall()) return false;
  if (player.y < -3) { if (state.fallFrom) landFall(); else hurt(25, 'Fell out of the cube'); return false; }
  if (state.time > state.statusUntil) state.statusMsg = '';
  if (!fluids(gr) || !falls(dt, gr.i)) return false;
  if (!player.swimming && player.grounded) regenerate(player, dt, state.time);

  // remember a safe spot to respawn at: one that still leads out of the cube (map.safe), not
  // the bottom of a pit you fell into
  player.safeTimer += dt;
  if (player.grounded && !player.swimming && gr.s && !gr.s.kind && !gr.s.fluid && player.safeTimer > 0.4
    && (!state.map.safe || state.map.safe[gr.s.id])) {
    player.safeTimer = 0;
    player.safe = { x: gr.s.x + 0.5, y: floorY(gr.s, 0.5, 0.5), z: gr.s.z + 0.5 };
  }
  return true;
}
