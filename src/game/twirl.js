// Caught in a twister (the Tornado's, game/twisters.js): a blow with a `twirl` ({ lift, spin }:
// game/enemycombat.js hitPlayer hands it over) lifts the player up where they were caught and spins
// them round and round for `spin` s (core/twisters.js twirlAt), held there like in a grab
// (player.held: no moving, striking or getting hurt by anything else), then flings them down
// the way the twister was going: the blow lands then, through the armor alone (no shield stops the
// wind), and knocks them down. Playing together, the game of the player it caught carries it out.
import { player, setStatus } from './state.js';
import { twirlAt } from '../core/twisters.js';
import { ignite } from '../core/projectiles.js';
import { knockDown } from './ragdoll.js';
import { cancelSword } from './sword.js';
import { canMove } from '../physics/canmove.js';
import { insideSolid } from '../physics/collide.js';
import { playerHurtFx, twirlFx } from './juice.js';
import { armorOnly } from './armor.js';
import { tr } from '../i18n/i18n.js';

const ok = (v, lo, hi) => Number.isFinite(v) && v > lo && v < hi;
// blow: the twister's (with its `twirl`); it goes the way (nx, nz)
export function twirlPlayer(blow, nx, nz) {
  const t = blow.twirl, l = Math.hypot(nx, nz);
  if (!ok(t?.lift, 0, 4) || !ok(t?.spin, 0, 4) || !(l > 0.01)) { knockDown({ damage: blow.damage, hop: blow.hop, reason: blow.reason, by: blow.by }); return; }
  cancelSword();
  Object.assign(player, { held: { twirl: { lift: t.lift, spin: t.spin }, t: 0, x: player.x, y: player.y, z: player.z, yaw: player.yaw,
    blow, nx: nx / l, nz: nz / l }, vx: 0, vy: 0, vz: 0, gust: null, pull: null, climb: null, getUp: null });
  twirlFx(player, 'caught');
  setStatus(tr(blow.reason));
}

// every step while twirled (game/update.js): up and round, then flung
export function tickTwirl(dt) {
  const h = player.held;
  h.t += dt;
  if (h.t >= h.twirl.spin) { fling(h); return; }
  const { up, angle, swing } = twirlAt(h.twirl, h.t);
  const x = h.x + Math.cos(angle) * swing, z = h.z + Math.sin(angle) * swing, dx = x - player.x, dz = z - player.z;
  if (dx && canMove(player.x + dx, player.z, 'x', Math.sign(dx))) player.x += dx;
  if (dz && canMove(player.x, player.z + dz, 'z', Math.sign(dz))) player.z += dz;
  const y = h.y + up;
  if (!insideSolid(player.x, player.z, y + player.h)) player.y = Math.max(player.y, y);   // (never up into a ceiling)
  player.yaw = h.yaw + angle;
  player.vx = player.vy = player.vz = 0;
  player.grounded = false;
  twirlFx(player, 'spin', dt);
}

function fling(h) {
  const blow = armorOnly(h.blow), p = player;
  p.held = null;
  p.vx = h.nx * blow.knock; p.vz = h.nz * blow.knock; p.vy = 1.5;
  playerHurtFx(Math.min(blow.damage, p.hp), p.x - h.nx, p.z - h.nz);
  if (blow.burn && p.hp > blow.damage) { p.burning = { ...ignite(blow.burn, blow.reason), by: blow.by ?? null }; p.chilled = null; }
  twirlFx(p, 'fling');
  knockDown({ damage: blow.damage, hop: blow.hop, reason: blow.reason, by: blow.by });
}
