// In devtools (?dev=1): await (await import('./tests/browser/foggery.js')).runFoggeryChecks()
// Foggery's whole fight in his caldera (docs/bosses.md): he wakes when the player steps onto the
// bridge, the lava rises and he climbs his tower; at two thirds he curls up into his ball and his
// Fire-cats guard him (nothing hurts him while one lives); once the lava is at its highest the
// platforms rise out of it; at a third the lava floods the top and
// only the platforms are safe; falling into the lava costs a quarter of one's health and magic
// takes one out; his death drains the lava for good and opens the well.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { LH } from '../../src/core/constants.js';
import { damageEnemy } from '../../src/core/combat.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { updateMovers } from '../../src/game/movers.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { moversNow } from '../../src/physics/collide.js';
import { floorY } from '../../src/core/surfaces.js';
import { gateLocked } from '../../src/core/guardians.js';
import { TOWER, PLATFORMS, FOGGERY_FIGHT } from '../../src/core/foggery.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updateMovers(dt); updatePlayer(dt); updateEnemies(dt); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'foggery');
const lava = () => (state.tide ?? -Infinity) * LH;
const tough = () => { player.hp = player.maxHp = 1e6; player.ragdoll = null; };
// stand on the top of the tower, a little away from him
function onTop() {
  const b = boss(), tops = state.map.floors.filter(f => f.tower === 'top')
    .sort((p, q) => Math.abs(Math.hypot(p.x + .5 - b.x, p.z + .5 - b.z) - 2.2) - Math.abs(Math.hypot(q.x + .5 - b.x, q.z + .5 - b.z) - 2.2));
  const f = tops[0];
  spawnAt(f.x + .5, floorY(f, .5, .5), f.z + .5);
}
function onPlatform() {
  const m = moversNow()[0];
  spawnAt((m.x0 + m.x1) / 2, m.y1, (m.z0 + m.z1) / 2);
}

export async function runFoggeryChecks() {
  return paused(async () => {
    const out = [];
    await goBoss('foggery');
    await loadSpecies(['foggery', 'fireface', 'firecat']);
    const map = state.map, b = boss();
    check(map.tower && map.arena.type === 'tower' && b, 'his caldera, and him on the bridge');
    check(state.map.cols[Math.floor(b.z) * 16 + Math.floor(b.x)].some(f => f.tower === 'bridge'), 'he stands on the bridge');
    tough(); state.enemyGrace = 0;
    // the lava at rest, then rising once he wakes
    run(0.5, tough);
    const rest = lava();
    check(Math.abs(rest - TOWER.lava.rest * LH) < 0.3, 'the lava at rest: ' + rest);
    damageEnemy(b, 1);
    run(20, tough);
    check(lava() > rest + 1, 'the lava rises: ' + lava());
    out.push(`lava ${rest.toFixed(1)} -> ${lava().toFixed(1)} after 20 s`);
    check(!moversNow().length, 'no platforms before the lava is at its highest');
    // he climbs to the top (the player waits up there)
    onTop();
    const climbed = until(80, () => b.f?.tower === 'top', tough);
    check(climbed < 80, `he climbs to the top: on ${b.f?.tower} at ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}`);
    out.push(`on top after ${(20 + climbed).toFixed(0)} s`);
    run(45, tough);
    check(Math.abs(lava() - TOWER.lava.high * LH) < 0.2, 'the lava stops under the top: ' + lava());
    check(moversNow().length === PLATFORMS.count && moversNow().every(m => Math.abs(m.y1 - PLATFORMS.top * LH) < 1e-6), 'the platforms have risen out of it');
    // two thirds: he curls up into his ball and calls his cats
    damageEnemy(b, b.hp);
    check(b.hp === b.hpFloor, 'no blow takes him below two thirds');
    until(4, () => b.stage === 2, tough);
    check(b.stage === 2 && b.profile.type === 'foggeryball', 'curled up into his ball');
    until(6, () => b.guard && allEnemies().filter(e => e.summoned && e.type === 'fogcat' && e.mode !== 'dead').length === 2, tough);
    const cats = allEnemies().filter(e => e.type === 'fogcat' && e.mode !== 'dead');
    check(cats.length === 2 && b.guard, 'two Fire-cats guard him: ' + cats.length);
    const hp = b.hp;
    damageEnemy(b, 10); check(b.hp === hp, 'the shield holds while a cat lives');
    for (const c of cats) damageEnemy(c, c.hp);
    run(0.5, tough);
    check(!b.guard, 'both dead: the shield is down');
    run(1, tough);
    damageEnemy(b, 10); check(b.hp < hp, 'and he can be hurt');
    const catsUp = () => allEnemies().filter(e => e.type === 'fogcat' && e.mode !== 'dead').length === 2;
    const again = until(14, () => b.guard, tough);
    check(again > FOGGERY_FIGHT.catsAgain - 2 && again < 12, 'new cats after a while: ' + again);
    until(4, catsUp, tough);
    check(catsUp(), 'two new cats');
    out.push(`cats again after ${(again + 1.5).toFixed(1)} s`);
    // a third: the lava floods the top; the platforms hold
    for (const c of allEnemies().filter(e => e.type === 'fogcat')) damageEnemy(c, c.hp);
    run(1, tough);
    damageEnemy(b, b.hp);
    check(b.hp === b.hpFloor, 'no blow takes him below a third');
    onPlatform();
    until(4, () => b.stage === 3, tough);
    run(8, tough);
    check(b.stage === 3 && b.anchored, 'phase 3: he floats over the drowned tower');
    // his minions walk on the lava, never under it
    let under = null;
    run(6, () => { tough(); for (const e of allEnemies()) if (e !== b && e.mode !== 'dead' && e.y < lava() - 0.05) under = `${e.type} at ${e.y.toFixed(2)}`; });
    check(!under, 'his minions walk on the lava: ' + under);
    // the platforms keep moving
    const was = moversNow().map(m => m.x0 + ',' + m.z0).join(' ');
    run(PLATFORMS.every * 2, tough);
    check(moversNow().map(m => m.x0 + ',' + m.z0).join(' ') !== was, 'the platforms keep moving');
    check(lava() > TOWER.top * LH, 'the lava over the top: ' + lava());
    check(player.y > lava(), 'the player safe on a platform');
    // into the lava: a quarter of one's health, and back onto safe ground
    player.hp = player.maxHp = 400;
    spawnAt(TOWER.mid + 0.5, lava() - 0.5, TOWER.mid + 0.5);
    run(0.2);
    check(player.hp === 300 && player.y > lava(), `burned, and pulled out: ${player.hp} at ${player.y.toFixed(2)} (lava ${lava().toFixed(2)})`);
    out.push('lava rescue: 400 -> 300, onto a platform');
    tough();
    // his death drains the lava and opens the well
    until(10, () => b.mode === 'dead', () => {
      tough();
      for (const c of allEnemies().filter(e => e.type === 'fogcat' && e.mode !== 'dead')) damageEnemy(c, c.hp);
      if (!b.guard && b.mode !== 'attack') damageEnemy(b, b.hp);
    });
    check(b.mode === 'dead', 'he dies (once his cats are dead)');
    run(12, tough);
    check(state.tide === null, 'the lava is gone: ' + state.tide);
    check(!gateLocked(map, state.run), 'the well is open');
    out.push('dead: lava drained, well open');
    return out;
  });
}
