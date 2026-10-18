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
// (the enemies stand still meanwhile: what is checked here is the trials)
state.devPassive = true;
const seals = () => state.world.portalFx.filter(f => f.obj.userData.portal.kind === 'side').map(f => f.obj.children.at(-1).visible);

// A slide puzzle (in a vault where one is: ?trial=slide puts one in a branch and one on the
// route of every depth): onto the ice through its gap, slid along its own solution with the keys,
// solved; a vault's chest opens only then.
export async function runSlideChecks(role = 'branch') {
  const { slideStop } = await import('../../src/core/trials.js');
  const { chestInReach } = await import('../../src/game/chests.js');
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === 'slide' && t.role === role));
  check(state.dev && all.length, 'load the game with ?dev=1&trial=slide');
  const t = all[0];
  await goTrial('slide', t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the puzzle room');
  const m = state.map.trial.puzzles[0], F = m.field, SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  check(state.trial.phase === 'idle' && !sealedIn(), 'a puzzle never seals');
  const site = state.map.rewardSites[0];
  if (role === 'branch') {
    Object.assign(player, { x: site.approach.x, y: site.approach.y, z: site.approach.z, vx: 0, vz: 0 });
    await delay(200);
    check(!chestInReach(), 'the vault\'s chest is shut until it is solved');
  }
  // in through the gap, then the solution, one push each
  const g = m.entryGap;
  Object.assign(player, { x: g % 16 + 0.5, y: m.deck.level * 0.5, z: Math.floor(g / 16) + 0.5, vx: 0, vz: 0 });
  const now = () => [Math.floor(player.x) - m.deck.x0, Math.floor(player.z) - m.deck.z0];
  let at = slideStop(F, F.entry.x, F.entry.z, F.entry.side ^ 1);   // stepping in slides straight on
  player.autoDir = SD[F.entry.side ^ 1];
  await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, 'onto the ice', 3000);
  player.autoDir = null;
  await delay(300);
  for (const d of m.check.solution) {
    player.autoDir = SD[d]; await delay(120); player.autoDir = null;
    at = slideStop(F, at[0], at[1], d);
    await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, `a slide to ${at}`, 3000);
    await delay(200);
  }
  await until(() => state.trial.phase === 'resolved', 'solved on the goal plate', 3000);
  check(state.run.unlockedGates.has(t.gate), 'its gate into the run');
  if (role === 'branch') {
    Object.assign(player, { x: site.approach.x, y: site.approach.y, z: site.approach.z, vx: 0, vz: 0 });
    await delay(300);
    check(chestInReach(), 'the vault\'s chest opens now');
  } else check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return ['solved', role];
}

// A sunken room (?trial=sunken): in from up high, every stage's slide solved in turn along its
// solution, the water sinking a stage each time, the next platform dry; drained, the way on open.
export async function runSunkenChecks() {
  const { slideStop } = await import('../../src/core/trials.js');
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === 'sunken'));
  check(state.dev && all.length, 'load the game with ?dev=1&trial=sunken');
  const t = all.find(x => x.stages.length === 3) ?? all[0];
  await goTrial('sunken', t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the sunken room');
  const m = state.map.trial, SD = [[1, 0], [-1, 0], [0, 1], [0, -1]], out = [];
  check(Math.abs(player.y - 8) < 0.6, 'in from up high');
  for (const [i, pz] of m.puzzles.entries()) {
    check(state.trial.stage === i, `at stage ${i}`);
    const level = trialFluid()?.y;
    check(level != null && level < pz.deck.level * 0.5 && level > (m.puzzles[i + 1]?.deck.level ?? 0) * 0.5, `the water between platform ${i} and the next`);
    if (pz.kind !== 'slide') {   // a grid puzzle: its parts as its solver says, then off its field
      const { puzzleMoves } = await import('../../src/game/trials.js');
      for (const [part, n] of puzzleMoves(pz, state.trial)) {
        const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: part.x + dx * 0.8, z: part.z + dz * 0.8 }));
        const spot = spots.find(q => !m.parts.some(o => o !== part && Math.hypot(o.x - q.x, o.z - q.z) < 0.6)) ?? spots[0];
        Object.assign(player, { x: spot.x, y: part.y, z: spot.z, vx: 0, vz: 0, yaw: Math.atan2(part.x - spot.x, part.z - spot.z) });
        await delay(80);
        for (let k = 0; k < n; k++) { useAction(); await delay(30); }
      }
      const D = pz.deck;
      Object.assign(player, { x: D.x0 - 0.5, y: D.level * 0.5, z: D.z0 - 0.5, vx: 0, vz: 0 });
      await until(() => state.trial.stage === i + 1 || state.trial.phase === 'resolved', `stage ${i} solved`, 3000);
      await delay(4500);
      out.push(`stage ${i} (${pz.kind})`);
      continue;
    }
    const F = pz.field, g = pz.entryGap, now = () => [Math.floor(player.x) - pz.deck.x0, Math.floor(player.z) - pz.deck.z0];
    Object.assign(player, { x: g % 16 + 0.5 + SD[F.entry.side][0], y: pz.deck.level * 0.5, z: Math.floor(g / 16) + 0.5 + SD[F.entry.side][1], vx: 0, vz: 0 });
    let at = slideStop(F, F.entry.x, F.entry.z, F.entry.side ^ 1);
    player.autoDir = SD[F.entry.side ^ 1];
    await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, `onto the ice of stage ${i}`, 4000);
    player.autoDir = null;
    await delay(300);
    for (const d of pz.check.solution) {
      player.autoDir = SD[d]; await delay(120); player.autoDir = null;
      at = slideStop(F, at[0], at[1], d);
      await until(() => `${now()}` === `${at}` && Math.hypot(player.vx, player.vz) < 0.1, `a slide to ${at}`, 3000);
      await delay(200);
    }
    await until(() => state.trial.stage === i + 1 || state.trial.phase === 'resolved', `stage ${i} solved`, 3000);
    await delay(4500);   // the water sinks
    out.push(`stage ${i} (slide)`);
  }
  check(state.trial.phase === 'resolved' && state.run.unlockedGates.has(t.gate) && !trialFluid(), 'drained, resolved');
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return [...out, 'drained'];
}

// A grid puzzle (?trial=mirror, braziers or channels): its parts used as its own solver says (each
// from beside it, with the action key's choice checked), then off the field (a body blocks a beam):
// solved, the way on open.
export async function runGridChecks(kind) {
  const { puzzleMoves } = await import('../../src/game/trials.js');
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === kind && t.role === 'route'));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  const t = all[0];
  await goTrial(kind, t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the puzzle room');
  const pz = state.map.trial.puzzles[0];
  check(state.trial.phase === 'idle' && portalLocked(state.map, state.run, { dir: t.exit }), 'unsolved, the way on shut');
  let used = 0;
  for (const [part, n] of puzzleMoves(pz, state.trial)) {
    // stand beside it (the nearest free spot of the four), and the action key wants it
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: part.x + dx * 0.8, z: part.z + dz * 0.8 }));
    const spot = spots.find(q => !state.map.trial.parts.some(o => o !== part && Math.hypot(o.x - q.x, o.z - q.z) < 0.6)) ?? spots[0];
    Object.assign(player, { x: spot.x, y: part.y, z: spot.z, vx: 0, vz: 0, yaw: Math.atan2(part.x - spot.x, part.z - spot.z) });
    await delay(80);
    check(pendingAction()?.target?.id === part.id, `the action key on ${part.id}`);
    for (let k = 0; k < n; k++) { useAction(); used++; await delay(30); }
  }
  // off the field, onto the walkway beside it
  const D = pz.deck;
  Object.assign(player, { x: D.x0 - 0.5, y: D.level * 0.5, z: D.z0 - 0.5, vx: 0, vz: 0 });
  await until(() => state.trial.phase === 'resolved', 'solved', 3000);
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return [kind, `${used} uses`];
}

// Crates (?trial=crates) or the two plates (?trial=plates): the reset lever puts a pushed crate back,
// then the solver's pushes, each by walking into the crate from behind it; (the two plates: then
// standing on the other plate) solved, the way on open
export async function runCratesChecks(kind = 'crates') {
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === kind && t.role === 'route'));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  const t = all[0];
  await goTrial(kind, t.depth, t.key);
  await until(() => !state.transitioning && state.cubeKey === t.from, 'into the room before');
  takePortal(state.map.portals.find(p => p.dir === t.fromDir));
  await until(() => !state.transitioning && state.cubeKey === t.key, 'into the puzzle room');
  const pz = state.map.trial.puzzles[0], F = pz.field, D = pz.deck, SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const crate = i => state.trial.bits[pz.parts.find(p => p.type === 'crate' && p.i === i).id];
  const push = async (i, d) => {
    const c = crate(i), bx = D.x0 + c % F.w - SD[d][0] + 0.5, bz = D.z0 + Math.floor(c / F.w) - SD[d][1] + 0.5;
    Object.assign(player, { x: bx, y: D.level * 0.5, z: bz, vx: 0, vz: 0 });
    player.autoDir = SD[d];
    await until(() => crate(i) !== c, `crate ${i} pushed ${d}`, 3000);
    player.autoDir = null;
    await delay(150);
  };
  // a push, then the reset lever
  const [i0, d0] = pz.check.solution[0], before = crate(i0);
  await push(i0, d0);
  const lever = pz.parts.find(p => p.type === 'reset');
  Object.assign(player, { x: lever.x, y: lever.y, z: lever.z, vx: 0, vz: 0 });
  await delay(100);
  check(pendingAction()?.target?.type === 'reset', 'the reset lever in reach');
  useAction();
  check(crate(i0) === before, 'the reset lever puts the crates back');
  for (const [i, d] of pz.check.solution) await push(i, d);
  if (kind === 'plates') {   // the other plate: someone stands on it
    const other = F.plates.find(c => !pz.parts.some(p => p.type === 'crate' && state.trial.bits[p.id] === c));
    Object.assign(player, { x: D.x0 + other % F.w + 0.5, y: D.level * 0.5, z: D.z0 + Math.floor(other / F.w) + 0.5, vx: 0, vz: 0 });
  }
  await until(() => state.trial.phase === 'resolved', 'solved', 3000);
  check(!portalLocked(state.map, state.run, { dir: t.exit }), 'the way on is open');
  return [kind, `${pz.check.solution.length} pushes`];
}

export async function runTrialChecks(kind = 'flood') {
  const results = [];
  const all = [];
  for (let d = 1; d < 20; d++) all.push(...state.cubes.layout(d).trials.filter(t => t.kind === kind));
  check(state.dev && all.length, `load the game with ?dev=1&trial=${kind}`);
  const t = all[0];
  // the room before, facing the portal into the trial room
  await goTrial(kind, t.depth, t.key);
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
  const entry = state.map.portals.find(p => p.dir === (t.fromDir ^ 1));
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
