// "Leave the fight?" in real guardian arenas (game/leavefight.js), run from index.html's devtools:
// await (await import('./tests/browser/leavefight.js')).runLeaveFightChecks()
// Gusto's arena and a side arena: a push out does not leave or ask, steering out asks and pauses,
// Stay keeps you in until you step away, Leave goes through, and a dead guardian lets you go.
import { N, DIRS } from '../../src/core/constants.js';
import { step } from '../../src/world/coords.js';
import { player, state, worldPaused } from '../../src/game/state.js';
import { enterCube, spawnAt } from '../../src/game/flow.js';
import { checkPortals } from '../../src/game/portals.js';
import { travelling, updateTravel } from '../../src/game/travel.js';
import { answerLeave } from '../../src/game/leavefight.js';
import { createRun } from '../../src/core/progression.js';
import { paused } from './combat.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const press = code => dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const shown = () => !document.getElementById('leave-overlay').hidden;

function atFace(entry, distance) {
  const d = entry.dir, along = (d < 2 ? entry.z : entry.x) + 0.5;
  spawnAt(d === 0 ? N - distance : d === 1 ? distance : along, entry.y, d === 2 ? N - distance : d === 3 ? distance : along);
  player.autoDir = null; player.vx = player.vz = 0;
}
async function slide() {
  for (let i = 0; i < 100 && state.transitioning && !travelling(); i++) await delay(20);
  check(travelling(), 'leaving starts the slide');
  for (let i = 0; i < 180 && travelling(); i++) updateTravel(1 / 60);
  check(!travelling() && !state.transitioning, 'the slide ends');
}

export async function runLeaveFightChecks() {
  return paused(async () => {
    const results = [], run = state.run;
    try {
      const L = state.cubes.layout(0);
      for (const role of ['descent', 'side']) {
        state.run = createRun();
        const key = [...L.guardians].find(([, g]) => g.role === role)[0], c = await state.cubes.get(key);
        const entry = c.map.portals[0], [nx, nz] = DIRS[entry.dir];
        enterCube(c, entry.dir);
        state.portalLock = 0; state.boundaryLock = -1;
        // pushed out: no question, no crossing
        atFace(entry, 0.3); player.vx = nx * 10; player.vz = nz * 10;
        check(!checkPortals(0, 0, 0.016) && !state.leaveAsk && !state.transitioning, `${role}: a push does not ask or leave`);
        player.stun = 0.5;
        check(!checkPortals(nx, nz, 0.016) && !state.leaveAsk, `${role}: stunned, steering does not ask`);
        player.stun = 0;
        // steered out: asks, the world waits, keys answer
        check(!checkPortals(nx, nz, 0.016) && state.leaveAsk?.dir === entry.dir && shown(), `${role}: steering out asks`);
        check(worldPaused(), `${role}: alone the world waits`);
        press('KeyN');
        check(!state.leaveAsk && !shown() && state.cubeKey === key && state.boundaryLock === entry.dir, `${role}: N stays`);
        check(!checkPortals(nx, nz, 0.016) && !state.leaveAsk, `${role}: no second question at the same face`);
        atFace(entry, 2); checkPortals(0, 0, 0.016);
        check(state.boundaryLock === -1 && !state.portalLock, `${role}: stepping away lets it ask again`);
        atFace(entry, 0.3);
        check(!checkPortals(nx, nz, 0.016) && state.leaveAsk, `${role}: asks again`);
        if (role === 'descent') {
          press('Enter');
          await slide();
          check(state.cubeKey === step(key, entry.dir), 'Enter leaves the arena');
        } else {
          answerLeave(false);
          state.run.unlockedGates.add(c.map.key);   // the guardian is dead
          state.boundaryLock = -1; state.portalLock = 0;
          check(checkPortals(nx, nz, 0.016) && !state.leaveAsk, 'a dead guardian lets you go without asking');
          await slide();
        }
        results.push({ role, key, pushStays: true, asks: true, stays: true, leaves: true });
      }
      return results;
    } finally {
      if (state.leaveAsk) answerLeave(false);
      state.run = run;
    }
  });
}
