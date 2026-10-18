// Gusto's grab (core/enemies.js GUSTO, the attack with a `grab`): caught at the attack's hit
// frame (game/enemycombat.js strikePlayer, a blow with `grab`: the enemy's id), the player is
// held in its hands: no moving, striking or getting hurt by anything else, carried along the
// clip's grip path (core/gusto.js gripAt). At the throw time it throws them down in front of
// itself: then the blow lands, and they go over as a ragdoll and get up as after any knock-down.
// There is no wriggling free; only a stagger (a heavy blow, a friend's) or its death makes it
// let go, and the player drops unhurt.
// Playing together the grab is a blow like any other: the game of the player it caught carries
// it out, after the enemy as it is shown there (net/foes.js).
import { player, setStatus } from './state.js';
import { allEnemies } from './enemies.js';
import { attackOf } from '../core/enemies.js';
import { gripAt } from '../core/gusto.js';
import { muzzleAt } from '../core/beams.js';
import { knockDown } from './ragdoll.js';
import { cancelSword } from './sword.js';
import { canMove } from '../physics/canmove.js';
import { groundAt } from '../physics/collide.js';
import { STEP } from '../core/constants.js';
import { playerHurtFx } from './juice.js';
import { sfx } from '../audio/sfx.js';

// the grab under way, if the enemy still holds on: its attack's grab spec
function holding(h) {
  const e = h.e, a = e.mode === 'attack' && e.attacks === h.attacks ? attackOf(e) : null;
  return a?.grab && allEnemies().includes(e) ? a : null;
}

// blow: the grab's (game/enemycombat.js hitPlayer); from (fx, fz)
export function grabPlayer(blow, fx, fz) {
  const e = allEnemies().find(x => x.id === blow.grab);
  if (!e || !holding({ e, attacks: e.attacks })) {   // it let go already: knocked over, as it would be thrown
    knockDown({ damage: blow.damage, hop: blow.hop, reason: blow.reason, by: blow.by });
    return;
  }
  cancelSword();
  Object.assign(player, { held: { e, attacks: e.attacks, blow, fx, fz }, vx: 0, vy: 0, vz: 0, gust: null, climb: null, getUp: null });
  sfx('grab', { at: player });
  setStatus(`${e.profile.label} grabbed you!`);
}

// every step while held (game/update.js): carried along, then thrown or let go
export function tickHeld() {
  const h = player.held, a = holding(h), e = h.e;
  if (!a) { player.held = null; knockDown({ hop: 1 }); return; }   // let go: dropped, unhurt
  const g = a.grab;
  if (e.t >= g.throwAt) { throwPlayer(e, g, h.blow); return; }
  const size = e.profile.size ?? 1, at = muzzleAt(e, gripAt(g, a.hitAt, e.t).map(v => v * size));
  // towards the hands, sliding along walls rather than into them
  const dx = at.x - player.x, dz = at.z - player.z;
  if (dx && canMove(player.x + dx, player.z, 'x', Math.sign(dx))) player.x += dx;
  if (dz && canMove(player.x, player.z + dz, 'z', Math.sign(dz))) player.z += dz;
  const y = at.y - g.hold * size;
  player.y = Math.max(y, groundAt(player.x, player.z, y, STEP).h);   // never into the floor
  player.vx = player.vy = player.vz = 0;
  player.grounded = false;
}

function throwPlayer(e, g, blow) {
  player.held = null;
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  player.vx = fx * g.throw; player.vz = fz * g.throw; player.vy = -2;
  playerHurtFx(Math.min(blow.damage, player.hp), e.x, e.z);
  knockDown({ damage: blow.damage, hop: blow.hop, reason: blow.reason, by: blow.by });
}
