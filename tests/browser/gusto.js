// In devtools: await (await import('./tests/browser/gusto.js')).runGustoChecks()
// Gusto's whole fight in his real arena (the first descent): his summons, the grab and throw,
// the split at half health, the proxies, the window, vanishing and coming back, and his death.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { makeLayouts } from '../../src/world/layout.js';
import { createRun } from '../../src/core/progression.js';
import { damageEnemy } from '../../src/core/combat.js';
import { gateLocked } from '../../src/core/guardians.js';
import { GUSTO_FIGHT } from '../../src/core/gusto.js';
import { allEnemies, updateEnemies, drawEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { enterCube, spawnAt } from '../../src/game/flow.js';
import { groundY, walkable } from '../../src/physics/enemynav.js';
import { loadSpecies } from '../../src/render/enemies.js';

const check = (value, message) => { if (!value) throw Error(message); };
const run = (seconds, dt = 1 / 30, also = () => {}) => { for (let t = 0; t < seconds; t += dt) { updateEnemies(dt); also(dt); } };
// make e start attack `name` just before its hit frame
function strike(e, name, before = 0.02) {
  const i = e.profile.attacks.findIndex(a => a.name === name), a = e.profile.attacks[i];
  Object.assign(e, { mode: 'attack', attack: i, t: a.hitAt - before, bit: false, attacks: e.attacks + 1, stun: 0 });
  return a;
}

export async function runGustoChecks() {
  return paused(async () => {
    const oldCube = state.cubes.cubes.get(state.cubeKey), hero = { ...player };
    const saved = Object.fromEntries(['run', 'arrival', 'visit', 'portalLock', 'portalCharge', 'boundaryLock', 'transitioning', 'inventoryOpen', 'fallFrom', 'enemyGrace', 'statusMsg', 'statusUntil'].map(k => [k, state[k]]));
    const opened = new Set(state.openedFaces), key = makeLayouts(state.cubes.seed)(0).down;
    const c = await state.cubes.get(key), visits = c.visits;
    try {
      state.run = createRun(); state.transitioning = state.inventoryOpen = false; state.fallFrom = null;
      const entry = c.map.portals.find(p => p.kind === 'side');
      enterCube(c, entry.dir);
      await loadSpecies(['gusto', 'triangle']);
      const map = state.map, list = allEnemies(), gusto = list[0];
      check(list.length === 1 && gusto.boss === 'gusto' && gusto.guardianGate === map.key, 'Gusto alone guards the first descent');
      drawEnemies(0);
      check(gusto.view?.bar.visible && gusto.view.label.visible && gusto.view.tentacles.length === 24, 'his bar, label and tentacles');
      player.hp = player.maxHp = 1e5; state.enemyGrace = 0;
      const ahead = d => [gusto.x + Math.sin(gusto.yaw) * d, gusto.z + Math.cos(gusto.yaw) * d];
      const stand = d => { const [x, z] = ahead(d); spawnAt(x, gusto.y, z); player.vx = player.vz = 0; };
      stand(1.3);

      // phase 1: a summon brings three Custo triangles
      strike(gusto, 'summon'); run(0.1);
      let minions = allEnemies().filter(e => e.summoned);
      check(minions.length === 3 && minions.every(e => e.type === 'custotriangle' && e.mode === 'chase'), 'three Custo triangles: ' + minions.length);
      drawEnemies(0);
      check(minions.every(e => e.view && e.view.size === 0.5), 'half-size triangles');
      for (const m of minions) { m.mode = 'idle'; m.stun = 99; }   // (out of the way for now)

      // the grab: caught, carried, thrown
      stand(1.3); gusto.yaw = Math.atan2(player.x - gusto.x, player.z - gusto.z);
      const grab = strike(gusto, 'grab'), hp = player.hp;
      run(0.1, 1 / 30, dt => updatePlayer(dt));
      check(player.held?.e === gusto, 'caught in his hands');
      const low = player.y;
      run(0.5, 1 / 30, dt => updatePlayer(dt));
      check(player.held && player.y > low + 0.6, 'lifted up');
      check(player.hp === hp, 'nothing hurts while held');
      run(grab.grab.throwAt - gusto.t + 0.05, 1 / 30, dt => updatePlayer(dt));
      check(!player.held && player.ragdoll && player.hp < hp, 'thrown down, and that hurts');
      player.ragdoll = null; player.hp = player.maxHp;

      // half his health: no further, then the split
      damageEnemy(gusto, gusto.hp * 10);
      check(gusto.hp === Math.ceil(gusto.profile.hp / 2), 'no blow takes him below half his health');
      run(0.05);
      check(gusto.mode === 'split' && !damageEnemy(gusto, 10), 'he splits, and cannot be hurt meanwhile');
      run(GUSTO_FIGHT.splitTime + 0.1);
      let proxies = allEnemies().filter(e => e.proxy);
      check(proxies.length === 2 && gusto.mode !== 'split' && gusto.profile.phase === 2, 'three of him');
      check([gusto, ...proxies].every(e => e.profile.attacks.some(a => a.gust?.kind === 'vortex')), 'all three blow vortexes');
      run(GUSTO_FIGHT.appear);
      damageEnemy(gusto, 10); run(0.05);
      check(proxies.every(p => p.hp === gusto.hp && p.profile.hp === gusto.profile.hp), 'the proxies show his health');
      drawEnemies(0);
      check(proxies.every(p => p.view?.label.visible), 'and look the same');

      // proxies: one touch and gone, no XP; he can be hit a moment after the last, then vanishes
      const xp = player.xp;
      damageEnemy(proxies[0], 1); run(0.05);
      check(proxies[0].mode === 'dead' && player.xp === xp, 'a proxy goes at a touch, for nothing');
      damageEnemy(proxies[1], 1); run(0.5);
      const before = gusto.hp;
      check(damageEnemy(gusto, 5) && gusto.hp === before - 5, 'still there a moment after the last proxy');
      run(GUSTO_FIGHT.window);
      while (gusto.mode === 'attack') run(0.1);
      run(0.05);
      check(gusto.mode === 'gone' && !damageEnemy(gusto, 5), 'then gone');
      drawEnemies(0);
      check(!gusto.view.group.visible, 'and not to be seen');
      run(GUSTO_FIGHT.gone + 0.1);
      const fresh = allEnemies().filter(e => e.proxy && e.mode !== 'dead');
      check(gusto.mode !== 'gone' && fresh.length === 2 && fresh.every(p => !proxies.includes(p)), 'back, with two new proxies');
      check([gusto, ...fresh].every(e => walkable(e.f, e.profile.height) && Math.abs(groundY(e.f, e.x, e.z) - e.y) < 0.01), 'on floors');
      check([gusto, ...fresh].every((a, i, all) => all.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > 1.4)), 'apart');

      // phase 2 summons fill up to two
      for (const m of minions) m.stun = 0;
      for (const m of minions) damageEnemy(m, m.hp);
      run(0.05);
      strike(fresh[0], 'summon'); run(0.1);
      minions = allEnemies().filter(e => e.summoned && e.mode !== 'dead' && e.mode !== 'gone');
      check(minions.length === 2, 'a proxy summons two: ' + minions.length);

      // his death takes the rest along and opens the gate
      check(gateLocked(map, state.run), 'locked while he lives');
      run(GUSTO_FIGHT.appear);
      damageEnemy(gusto, gusto.hp); run(0.05);
      check(!gateLocked(map, state.run), 'his death opens the descent');
      run(GUSTO_FIGHT.leave + 0.1);
      check(!allEnemies().some(e => (e.proxy || e.summoned) && e.mode !== 'dead'), 'his proxies and triangles go with him');
      return { summoned: 3, grabbed: true, split: true, reshuffled: true, gate: true };
    } finally {
      player.held = null;
      state.run = saved.run; state.openedFaces = opened; c.visits = visits;
      enterCube(oldCube, null, { arrival: saved.arrival, visit: saved.visit,
        portalLock: saved.portalLock, boundaryLock: saved.boundaryLock });
      Object.assign(state, saved); Object.assign(player, hero);
    }
  });
}
