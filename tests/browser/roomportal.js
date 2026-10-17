// Browser integration checks for getting unstuck: a body wedged in a tree trunk or a wall
// steps out of it, and the room portal scroll takes you back to where you came into the cube.
// Resets to a fresh seed-3 run before and after. From the devtools console:
//   await (await import('./tests/browser/roomportal.js')).runRoomPortalChecks()
import { player, state } from '../../src/game/state.js';
import { newWorld, enterCube, spawnAt } from '../../src/game/flow.js';
import { updatePlayer } from '../../src/game/update.js';
import { clearInput } from '../../src/game/input.js';
import { updateQuickbar } from '../../src/game/quickbar.js';
import { dropFromBag } from '../../src/game/loot.js';
import { ROOM_PORTAL, ROOM_PORTAL_CAST } from '../../src/core/items.js';
import { barEntry } from '../../src/core/inventory.js';
import { embedded, WEDGED_TIME } from '../../src/physics/unstuck.js';
import { groundAt } from '../../src/physics/collide.js';
import { paused } from './combat.js';
import { N } from '../../src/core/constants.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const press = code => {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
};
const DUNGEON = '0,0,-2';
const steps = (n, dt = 0.1) => { for (let i = 0; i < n && !state.transitioning; i++) updatePlayer(dt); };
async function settled() {
  for (let i = 0; i < 100 && state.transitioning; i++) await delay(20);
  check(!state.transitioning, 'The room portal timed out');
}
// a dry floor cell centre at least `away` from p that the body stands freely on
function spotAwayFrom(p, away) {
  for (const f of state.map.floors) {
    const x = f.x + 0.5, z = f.z + 0.5, g = groundAt(x, z, 99, 0);
    if (g.s !== f || f.fluid || !state.map.safe[f.id] || Math.hypot(x - p.x, z - p.z) < away) continue;
    spawnAt(x, g.h, z);
    if (!embedded()) return { x, y: g.h, z };
  }
  throw Error('No free spot away from the entry');
}

export async function runRoomPortalChecks() {
  const results = [];
  await newWorld(3); clearInput();
  try {
    await paused(async () => {
      const inv = player.inventory, scroll = inv.slots.find(s => s?.itemId === ROOM_PORTAL.id);
      updateQuickbar();
      check(barEntry(inv, 5)?.slot === scroll && !document.querySelectorAll('#quickbar .qb-slot')[5].querySelector('img').hidden,
        'A run starts with the room portal scroll on quick bar slot 6');
      check(!dropFromBag(scroll.instanceId) && inv.slots.includes(scroll), 'The scroll cannot be dropped');
      results.push('scroll on 6 / bound');

      enterCube(await state.cubes.get(DUNGEON), 2);
      const entry = { ...state.arrival };
      press('Digit6');
      check(!state.cast && state.statusMsg === 'You are where you came in already', 'No cast at the entry itself');

      // wedged in a trunk: out after WEDGED_TIME, onto free ground close by
      const at = spotAwayFrom(entry, 4), trunk = { x: at.x, z: at.z, r: 0.4, bottom: at.y, top: at.y + 3 };
      const cells = [];
      for (let cz = Math.floor(at.z - 0.4); cz <= Math.floor(at.z + 0.4); cz++)
        for (let cx = Math.floor(at.x - 0.4); cx <= Math.floor(at.x + 0.4); cx++) cells.push(state.map.blockers[cz * N + cx]);
      for (const c of cells) c.push(trunk);
      try {
        spawnAt(at.x + 0.1, at.y, at.z);
        check(embedded(), 'A trunk through the body wedges it');
        steps(Math.floor(WEDGED_TIME / 0.1) - 1);
        check(Math.abs(player.x - at.x - 0.1) < 1e-9, 'Not moved at once');
        steps(3);
        check(!embedded() && Math.hypot(player.x - at.x, player.z - at.z) >= 0.6 && Math.hypot(player.x - at.x, player.z - at.z) < 1.5,
          'Out beside the trunk: ' + JSON.stringify([player.x - at.x, player.z - at.z]));
      } finally {
        for (const c of cells) c.splice(c.indexOf(trunk), 1);
      }
      results.push('wedged in a trunk: steps out');

      // the scroll: interrupts, then back to the entry, as you are
      const away = spotAwayFrom(entry, 4);
      press('Digit6');
      check(state.cast?.kind === 'roomPortal' && state.cast.duration === ROOM_PORTAL_CAST, 'Using the scroll starts its cast');
      updateQuickbar();
      check(document.querySelectorAll('#quickbar .qb-slot')[5].classList.contains('casting'), 'The bar shows the cast');
      player.autoDir = [1, 0]; updatePlayer(1 / 60); player.autoDir = null;
      check(!state.cast, 'Moving interrupts the cast');
      spawnAt(away.x, away.y, away.z);
      press('Digit6'); steps(5);
      player.lastDamageAt = state.time + 0.01; steps(1);
      check(!state.cast, 'Being hurt interrupts the cast');
      player.lastDamageAt = -Infinity;
      press('Digit6'); steps(5); press('Digit6');
      check(!state.cast, 'Using it again cancels the cast');
      player.hp = 40; player.lastDamageAt = state.time - 0.001;   // hurt just now: no regeneration, no interrupt
      press('Digit6'); steps(ROOM_PORTAL_CAST * 10 - 2);
      check(state.cast && !state.transitioning, 'It waits for the whole cast');
      steps(3);
      check(state.transitioning, 'A finished cast takes you');
      await settled();
      check(state.cubeKey === DUNGEON && Math.hypot(player.x - entry.x, player.z - entry.z) < 0.05 && Math.abs(player.y - entry.y) < 0.05,
        'Back where you came in');
      check(player.hp === 40 && inv.slots.includes(scroll), 'Health as it was, and the scroll is kept');
      steps(20);
      check(state.cubeKey === DUNGEON && !state.transitioning, 'Arriving beside the entry does not send you on');
      results.push(`${ROOM_PORTAL_CAST} s cast / interrupts (move, hurt, key) / back to the entry`);
    });
  } finally {
    player.autoDir = null;
    await newWorld(3); clearInput();
  }
  return results;
}
