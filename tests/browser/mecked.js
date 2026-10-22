// In devtools (?dev=1): await (await import('./tests/browser/mecked.js')).runMeckedChecks()
// The Mecked (core/enemies.js MECKED) in the enemies' test room: its bite, and its grab: caught,
// held up in front of it where nothing else hurts, bitten at each of the grab's bites (a Bog
// mecked's bites poison), then shoved away on its feet; and a Mecked that is made to let go
// early drops the player.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { goTestRoom, leaveTestRoom } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { spawnEnemies, clearEnemies } from '../../src/game/devspawn.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { groundY } from '../../src/physics/enemynav.js';
import { idx } from '../../src/core/util.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) { updatePlayer(dt); updateEnemies(dt); } };
// make e start attack `name` just before its hit frame
function strike(e, name, before = 0.02) {
  const i = e.profile.attacks.findIndex(a => a.name === name), a = e.profile.attacks[i];
  Object.assign(e, { mode: 'attack', attack: i, t: a.hitAt - before, bit: false, attacks: e.attacks + 1, stun: 0, cool: 0 });
  return a;
}

export async function runMeckedChecks() {
  return paused(async () => {
    const hero = { ...player }, out = {};
    try {
      await goTestRoom('enemies', 11);
      await loadSpecies(['mecked']);
      clearEnemies();
      const map = state.map, x = 8.5, z = 6.5, f = map.cols[idx(Math.floor(x), Math.floor(z))].at(-1), low = groundY(f, x, z);
      // a Mecked a step in front of the player, facing them
      const fresh = type => {
        clearEnemies();
        spawnAt(x, low, z); player.yaw = 0;
        Object.assign(player, { hp: player.maxHp, held: null, ragdoll: null, toxic: null, stun: 0 });
        const [e] = spawnEnemies(type, { level: 11, at: { x, y: low, z: z + 0.8 } });
        Object.assign(e, { x, z: z + 0.8, y: low, yaw: Math.PI, mode: 'chase', cool: 9 });
        state.enemyGrace = 0;
        return e;
      };

      // the bite: a blow like any other
      let e = fresh('mecked');
      let hp = player.hp;
      strike(e, 'bite'); run(0.1);
      check(player.hp < hp && !player.held, 'bitten');
      out.bite = hp - player.hp;

      // the grab: caught, lifted, nothing else hurts it, bitten twice, then shoved away on its feet
      e = fresh('mecked'); hp = player.hp;
      const grab = strike(e, 'grab'), g = grab.grab;
      run(0.15);
      check(player.held?.e === e, 'caught');
      run(0.3);
      check(player.held && player.y > low + 0.15, 'held up off the floor');
      check(Math.hypot(player.x - e.x, player.z - e.z) < 0.8, 'held in front of it');
      check(player.hp === hp, 'no harm before the first bite');
      const marks = [];
      for (const at of g.bites) { run(at - e.t + 0.05); marks.push(player.hp); }
      check(marks[0] < hp && marks[1] < marks[0] && player.held, 'bitten at each bite, still held');
      out.bites = [hp - marks[0], marks[0] - marks[1]];
      run(g.throwAt - e.t + 0.05);
      check(!player.held && !player.ragdoll, 'let go, on its feet');
      const away = player.vx * Math.sin(e.yaw) + player.vz * Math.cos(e.yaw);
      check(away > 1, 'shoved away from it');
      run(1.5);
      check(player.grounded && !player.ragdoll, 'lands on its feet');

      // a Bog mecked's bites poison, even while it holds you
      e = fresh('bogmecked');
      strike(e, 'grab'); run(0.15);
      check(player.held?.e === e, 'caught by a Bog mecked');
      run(e.profile.attacks[1].grab.bites[0] - e.t + 0.05);
      check(player.toxic, 'its bite poisons');

      // made to let go early (a stagger): dropped
      e = fresh('mecked');
      strike(e, 'grab'); run(0.15);
      check(player.held?.e === e, 'caught again');
      e.mode = 'chase'; e.stun = 0.5;
      run(1 / 30);
      check(!player.held && player.ragdoll, 'dropped when it lets go');
      out.ok = true;
      return out;
    } finally {
      clearEnemies();
      player.held = null; player.ragdoll = null; player.toxic = null;
      await leaveTestRoom();
      Object.assign(player, hero);
    }
  });
}
