// Browser checks for the trial rooms (docs/trials.md), in the real game with the real worker.
// Load the game with ?dev=1&trial=flood, then from the devtools console:
//   await (await import('./tests/browser/trials.js')).runTrialChecks()
// Into the room before, through its portal into a flood, armed by stepping off the pad, sealed in
// (portals, open faces, both scrolls refuse), drowned, back in the room before beside the portal,
// in again to a room as built, and resolved with the button.
import { player, state } from '../../src/game/state.js';
import { goTrial, takePortal } from '../../src/game/dev.js';
import { hurt } from '../../src/game/flow.js';
import { checkPortals } from '../../src/game/portals.js';
import { useTownPortal } from '../../src/game/townportal.js';
import { useRoomPortal } from '../../src/game/roomportal.js';
import { pendingAction, useAction } from '../../src/game/action.js';
import { sealedIn } from '../../src/game/trials.js';
import { portalLocked } from '../../src/core/guardians.js';
import { trialFluid } from '../../src/physics/fluid.js';
import { DIRS } from '../../src/core/constants.js';

const check = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, what, ms = 8000) {
  for (let t = 0; t < ms && !test(); t += 50) await delay(50);
  check(test(), `timed out: ${what}`);
}
const seals = () => state.world.portalFx.filter(f => f.obj.userData.portal.kind === 'side').map(f => f.obj.children.at(-1).visible);

export async function runTrialChecks(kind = 'flood') {
  const results = [];
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === kind));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  const t = all[0];
  // the room before, facing the portal into the trial room
  await goTrial(kind, t.depth);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  const q = state.map.portals.find(p => p.dir === t.fromDir);
  check(state.map.trialFaces[t.fromDir] === kind, 'the room before knows the trial behind its portal');
  results.push('room before');
  // in through its portal
  takePortal(q);
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the trial room');
  check(state.trial?.phase === 'idle' && !sealedIn(), 'the trial waits, idle');
  check(portalLocked(state.map, state.run, { dir: t.exit }), 'the exit is locked until resolved');
  // stepping off the pad arms it, and seals every portal
  const [ax, az] = DIRS[t.fromDir];
  player.autoDir = [ax, az];
  await until(() => state.trial.phase !== 'idle', 'armed by stepping off the pad', 4000);
  player.autoDir = null;
  check(sealedIn(), 'sealed while armed');
  await delay(300);
  check(seals().every(Boolean), 'every portal shows its seal');
  // nothing takes you out: the entry portal, the scrolls
  const entry = state.map.portals.find(p => p.dir === t.fromDir ^ 1);
  Object.assign(player, { x: entry.x + 0.5, z: entry.z + 0.5, y: entry.y, vx: DIRS[entry.dir][0], vz: DIRS[entry.dir][1] });
  state.portalLock = 0; state.boundaryLock = -1;
  checkPortals(DIRS[entry.dir][0], DIRS[entry.dir][1], 0.1);
  check(!state.transitioning, 'the entry portal refuses while sealed');
  check(!useTownPortal() && !useRoomPortal(), 'the scrolls refuse while sealed');
  results.push('sealed');
  // dying in it: back in the room before, beside the portal, facing it, the trial room put back
  await delay(200);
  hurt(player.hp + 1, 'a test');
  await until(() => !state.transitioning && state.cubeKey === t.from, 'back in the room before after dying');
  check(player.hp === player.maxHp, 'at full health');
  const back = state.map.portals.find(p => p.dir === t.fromDir);
  check(Math.hypot(player.x - back.x - 0.5, player.z - back.z - 0.5) > 1, 'beside the portal, not on it');
  check(Math.abs(Math.sin(player.yaw) - DIRS[t.fromDir][0]) < 0.01 && Math.abs(Math.cos(player.yaw) - DIRS[t.fromDir][1]) < 0.01, 'facing it');
  check(!trialFluid(), 'no water here');
  results.push('died, back before');
  // walking in again: the room as built
  takePortal(back);
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the trial room again');
  check(state.trial.phase === 'idle', 'idle again');
  // resolved by the button on the summit (flood)
  if (kind === 'flood') {
    const b = state.map.trial.button;
    Object.assign(player, { x: b.x + 0.6, y: b.y, z: b.z, vx: 0, vz: 0 });
    await delay(150);
    check(pendingAction()?.kind === 'part', 'the button is in reach');
    useAction();
    check(state.trial.phase === 'resolved' && state.run.unlockedGates.has(t.gate), 'resolved, its gate open');
    check(!portalLocked(state.map, state.run, { dir: t.exit }) && !sealedIn(), 'the way on is open');
    await delay(300);
    check(seals().every(s => !s), 'no seals left');
    results.push('resolved');
  }
  // resolved by stepping onto the exit apron, the keystone (collapse): armed first, the crust
  // falling behind
  if (kind === 'collapse') {
    player.autoDir = [ax, az];
    await until(() => state.trial.phase !== 'idle', 'armed again', 4000);
    player.autoDir = null;
    await until(() => state.trial.phase === 'running', 'running', 5000);
    const k = state.map.trial.keystone;
    Object.assign(player, { x: k.x, y: k.y + 0.05, z: k.z, vx: 0, vz: 0 });
    await until(() => state.trial.phase === 'resolved', 'the keystone holds', 3000);
    check(state.run.unlockedGates.has(t.gate) && !sealedIn(), 'resolved, its gate open');
    results.push('resolved');
  }
  return results;
}
