// In devtools (?dev=1): await (await import('./tests/browser/tornado.js')).runTornadoChecks()
// The Tornado (core/enemies.js TORNADO) in the enemies' test room: its two twisters spin up over its
// hands, are let go at the hit frame and cross where the player stood; one catches the player,
// lifts them and spins them round (nothing else hurts them meanwhile), then flings them down;
// stepping aside dodges them. Its hop carries it back through the air on a twister of its own (no
// blade reaches it up there) and leaves one behind; its slam carries it onto the player and
// knocks them down. A Fire tornado's twisters set you on fire.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { goTestRoom, leaveTestRoom } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { spawnEnemies, clearEnemies } from '../../src/game/devspawn.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { twisters } from '../../src/game/twisters.js';
import { groundY } from '../../src/physics/enemynav.js';
import { airborne } from '../../src/core/enemies.js';
import { idx } from '../../src/core/util.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, dt = 1 / 30, each = null) => { for (let t = 0; t < seconds; t += dt) { updatePlayer(dt); updateEnemies(dt); each?.(); } };
// make e start attack `name` now
function start(e, name) {
  const i = e.profile.attacks.findIndex(a => a.name === name), a = e.profile.attacks[i];
  Object.assign(e, { mode: 'attack', attack: i, t: 0, bit: false, attacks: e.attacks + 1, stun: 0, cool: 0 });
  return a;
}
const mine = e => twisters.filter(w => w.e === e && !w.gone);

export async function runTornadoChecks() {
  return paused(async () => {
    const hero = { ...player }, out = {};
    try {
      await goTestRoom('enemies', 4);
      await loadSpecies(['tornado']);
      clearEnemies();
      const map = state.map, x = 8.5, z = 4.5, f = map.cols[idx(Math.floor(x), Math.floor(z))].at(-1), low = groundY(f, x, z);
      // a Tornado `ahead` cells in front of the player, facing them
      const fresh = (type, ahead) => {
        clearEnemies();
        spawnAt(x, low, z); player.yaw = 0;
        Object.assign(player, { hp: player.maxHp, held: null, ragdoll: null, burning: null, stun: 0, vx: 0, vz: 0 });
        const [e] = spawnEnemies(type, { level: 4, at: { x, y: low, z: z + ahead } });
        Object.assign(e, { x, z: z + ahead, y: low, yaw: Math.PI, mode: 'chase', cool: 9 });
        state.enemyGrace = 0;
        return e;
      };

      // the twisters: two spin up over its hands, are let go at the hit frame and cross on the player
      let e = fresh('tornado', 3.2);
      const twin = start(e, 'twin'), w = twin.twister;
      run(w.form + 0.1);
      check(mine(e).length === 2 && mine(e).every(t => t.kind === 'hand'), 'two twisters spin up over its hands');
      const hp = player.hp;
      run(twin.hitAt - e.t + 0.05);
      check(mine(e).every(t => t.kind === 'loose') && mine(e).length === 2, 'let go');
      const [a, b] = mine(e);
      check(Math.sign(a.x - x) !== Math.sign(b.x - x), 'one on either side');
      let caught = 0, lifted = 0;
      run(2.2, 1 / 30, () => { if (player.held?.twirl) { caught++; lifted = Math.max(lifted, player.y - low); } });
      check(caught > 0, 'a twister caught the player');
      check(lifted > 0.6, `lifted up (${lifted.toFixed(2)})`);
      check(player.hp < hp, 'flung down and hurt');
      out.twin = hp - player.hp;
      run(2.5);

      // stepping aside as they are let go dodges them
      e = fresh('tornado', 3.2);
      start(e, 'twin');
      run(twin.hitAt + 0.05);
      player.x += 1.6;   // (a step aside)
      const dodged = player.hp;
      let held = false;
      run(2.2, 1 / 30, () => { held ||= !!player.held; });
      check(!held && player.hp === dodged, 'sidestepped');

      // the hop: up and back on a twister, out of reach of a blade, one left behind where it took off
      e = fresh('tornado', 1.1);
      const hop = start(e, 'hop'), from = { x: e.x, z: e.z };
      run(hop.ride.from + 0.25);
      check(airborne(e) && e.y > low + 0.4, 'up in the air');
      check(mine(e).some(t => t.kind === 'stay' && Math.hypot(t.x - from.x, t.z - from.z) < 0.4), 'a twister stays where it took off');
      run(hop.hitAt - e.t + 0.05);
      check(!airborne(e) && Math.abs(e.y - low) < 0.05, 'down again');
      check(Math.hypot(e.x - from.x, e.z - from.z) > 1.5, 'carried away');
      check(Math.hypot(e.x - player.x, e.z - player.z) > 2.2, 'away from the player');

      // the slam: onto the player, who is knocked down
      e = fresh('tornado', 3);
      const slam = start(e, 'slam');
      let high = 0;
      run(slam.hitAt + 0.1, 1 / 30, () => { high = Math.max(high, e.y - low); });
      check(high > 0.8, 'rode up high');
      check(Math.hypot(e.x - player.x, e.z - player.z) < 0.9, 'came down on the player');
      check(player.ragdoll, 'knocked down');
      run(3);

      // a Fire tornado's twisters burn
      e = fresh('firetornado', 3.2);
      const fire = start(e, 'twin');
      let burnt = false;
      run(fire.hitAt + 2.4, 1 / 30, () => { burnt ||= !!player.burning; });
      check(burnt, 'set on fire');
      out.ok = true;
      return out;
    } finally {
      clearEnemies();
      player.held = null; player.ragdoll = null; player.burning = null;
      await leaveTestRoom();
      Object.assign(player, hero);
    }
  });
}
