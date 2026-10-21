// In devtools (?dev=1): await (await import('./tests/browser/renew.js')).runRenewChecks()
// Renew's whole fight in his arena (docs/bosses.md): the fight starts and the room's clock runs; at
// the end of each of the first three health bars he gathers time and rewinds it: the hero is carried
// back along the way they went (nothing hurts anybody meanwhile) to where they stood when the phase
// began, with the health they had, and an echo of them walks again; he takes up his next weapon
// (a bow, a morning star, a twin morning star), casts spiders and then Fire-faces out of the sky,
// and the light goes. At the end of his last bar he rewinds once more and rises away as a ghost;
// his loot (a flail among it) falls out of the sky, the echoes fight on a while and fade, and the
// light comes back.
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { damageEnemy } from '../../src/core/combat.js';
import { attackOf } from '../../src/core/enemies.js';
import { projectiles } from '../../src/game/projectiles.js';
import { RENEW_FIGHT } from '../../src/core/renew.js';
import { ITEMS } from '../../src/core/items.js';
import { allEnemies, updateEnemies } from '../../src/game/enemies.js';
import { updatePlayer } from '../../src/game/update.js';
import { queueAttack } from '../../src/game/sword.js';
import { rewindInfo, echoesNow } from '../../src/game/rewind.js';
import { goBoss } from '../../src/game/dev.js';
import { spawnAt } from '../../src/game/flow.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { characterReady } from '../../src/render/character.js';
import { floorY } from '../../src/core/surfaces.js';
import { gateLocked } from '../../src/core/guardians.js';

const check = (value, message) => { if (!value) throw Error(message); };
const step = (dt, also) => { updatePlayer(dt); updateEnemies(dt); also(); };
const run = (seconds, also = () => {}, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) step(dt, also); };
const until = (seconds, done, also = () => {}, dt = 1 / 30) => {
  for (let t = 0; t < seconds; t += dt) { step(dt, also); if (done()) return t; }
  return Infinity;
};
const boss = () => allEnemies().find(e => e.boss === 'renew');
const lootHere = () => state.run.loot.get(state.cubeKey)?.length ?? 0;
const minions = type => allEnemies().filter(e => e.type === type && e.mode !== 'gone' && e.mode !== 'dead');
const tough = () => { player.hp = Math.max(player.hp, 1); player.maxHp = Math.max(player.maxHp, 1e6); if (player.hp < 1e5) player.hp = 1e6; };
// the hero runs to and fro and swings at him now and then: something to rewind, and an echo to make
function busy(t) {
  const k = Math.floor(t / 1.2) % 2 ? 1 : -1;
  player.autoDir = [k, 0];
  if (Math.random() < 0.05) queueAttack(boss());
}

export async function runRenewChecks() {
  return paused(async () => {
    const out = [];
    await goBoss('renew');
    await Promise.all([loadSpecies(['spider', 'fireface']), characterReady]);
    const map = state.map, b = boss();
    check(b && b.profile.figure && b.stage === 1 && b.profile.weapon === RENEW_FIGHT.weapons[0], 'Renew in his arena, a sword in his hand');
    check(map.arena && map.guardian.boss === 'renew' && gateLocked(map, state.run), 'his arena, its gate locked');
    state.devPassive = false; state.enemyGrace = 0;
    player.maxHp = player.hp = 1e6;
    // close to him: the fight starts, and the room's clock runs
    const f = map.floors.filter(g => g.encounter && Math.hypot(g.x + 0.5 - b.x, g.z + 0.5 - b.z) > 2.5 && Math.hypot(g.x + 0.5 - b.x, g.z + 0.5 - b.z) < 3.5)[0];
    spawnAt(f.x + 0.5, floorY(f, 0.5, 0.5), f.z + 0.5);
    check(until(8, () => b.on, tough) < Infinity, 'the fight starts');
    const start = { x: player.x, z: player.z, hp: player.hp };
    let t = 0;
    run(6, () => { tough(); busy(t += 1 / 30); b.shield = 0.1; });   // (swinging at him, but not ending his bar yet)
    player.autoDir = null;
    check(b.clock > 5 && rewindInfo().frames > 80, `the room's time runs, the tape records it: ${b.clock.toFixed(1)} s, ${rewindInfo().frames} frames`);
    check(Math.hypot(player.x - start.x, player.z - start.z) > 0.3 || player.hp !== start.hp, 'the hero went somewhere');
    out.push(`phase 1 fought for ${b.clock.toFixed(1)} s`);

    // the end of his first bar: he gathers time, then it runs back
    player.hp = 5e5; b.shield = 0;
    damageEnemy(b, b.hp);
    check(b.hp === 1 && b.mode !== 'dead', 'no blow takes him past the end of his bar');
    check(until(1, () => b.mode === 'split', tough) < Infinity, 'he gathers time');
    check(until(RENEW_FIGHT.windup + 0.5, () => b.rewinding) < Infinity, 'time runs back');
    check(player.flipping?.kind === 'rewind' && document.body.classList.contains('rewinding'), 'the hero is carried back, the view pale');
    const hpThen = player.hp;
    check(!damageEnemy(b, 50), 'nothing hurts him while time runs back');
    let backwards = 0, wasClock = b.clock;
    const took = until(RENEW_FIGHT.rewind.max + 1, () => b.stage === 2, () => { if (b.clock < wasClock) backwards++; wasClock = b.clock; });
    check(took < Infinity && backwards > 20, `it ran back (${backwards} steps) and he took up his next weapon`);
    check(b.profile.weapon === 'weapon_bow_hunting' && b.hp === b.profile.hp && b.clock < 0.1, 'phase 2: a bow, his health whole again');
    check(!player.flipping && !document.body.classList.contains('rewinding'), 'the hero walks again');
    check(Math.hypot(player.x - start.x, player.z - start.z) < 0.3, `back where the hero stood when it began: ${Math.hypot(player.x - start.x, player.z - start.z).toFixed(2)}`);
    check(player.hp > hpThen, 'with the health they had then');
    check(rewindInfo().echoes === 1, 'and their echo walks again');
    const ghost = echoesNow()[0].ghosts.find(g => g.boss === 'renew');
    check(ghost && ghost.profile.weapon === RENEW_FIGHT.weapons[0], 'and so does his ghost, his sword in hand');
    check(until(1, () => ghost.mode !== 'gone', tough) < Infinity, 'fighting the echo as he fought the hero');
    out.push(`rewound in ${took.toFixed(1)} s`);
    // where the hero's blade went through in phase 1, the echo's goes through again: standing there hurts
    const strike = echoesNow()[0].strikes.find(s => s.t > b.clock + 0.3);
    if (strike) {
      player.lastHurt = null;
      const there = () => { player.ragdoll = null; player.getUp = null; spawnAt(strike.x, strike.y, strike.z); };
      const hit = until(strike.t - b.clock + 0.5, () => player.lastHurt?.reason === 'Struck by your own echo!', there);
      check(hit < Infinity, 'the echo\'s blow hurts the hero');
      out.push(`the echo struck at ${strike.t.toFixed(1)} s`);
    } else out.push('(the hero struck no blow to do again)');

    // phase 2: the bow; spiders cast out of the sky; it gets darker
    const fell = until(20, () => minions('renspider').length > 0, tough);
    check(fell < Infinity, 'he casts spiders');
    check(minions('renspider').some(m => m.falling), 'they fall out of the sky');
    check(until(3, () => minions('renspider').every(m => !m.falling), tough) < Infinity, 'and land');
    check(state.dusk > 0.24, `dusk falls: ${state.dusk.toFixed(2)}`);
    run(2, tough);
    out.push(`spiders after ${fell.toFixed(1)} s: ${minions('renspider').length}`);
    // too close to him with his bow: he leaps back (or runs backwards)
    const keepsAway = () => {
      let leapt = false, far = 0;
      for (let i = 0; i < 4; i++) {
        const near = map.floors.filter(g => g.encounter && Math.hypot(g.x + 0.5 - b.x, g.z + 0.5 - b.z) < 1.6 && Math.hypot(g.x + 0.5 - b.x, g.z + 0.5 - b.z) > 0.8)[0];
        if (near) spawnAt(near.x + 0.5, floorY(near, 0.5, 0.5), near.z + 0.5);
        const was = Math.hypot(player.x - b.x, player.z - b.z);
        run(1.2, () => { tough(); leapt ||= b.mode === 'attack' && attackOf(b).name === 'leap'; });
        far = Math.max(far, Math.hypot(player.x - b.x, player.z - b.z) - was);
      }
      return { leapt, far };
    };
    const bowAway = keepsAway();
    check(bowAway.leapt || bowAway.far > 1, `he keeps away with his bow: leapt ${bowAway.leapt}, ${bowAway.far.toFixed(1)} cells`);
    // far off: arrows
    const far = map.floors.filter(g => g.encounter && Math.abs(Math.hypot(g.x + 0.5 - b.x, g.z + 0.5 - b.z) - 5) < 0.6)[0];
    spawnAt(far.x + 0.5, floorY(far, 0.5, 0.5), far.z + 0.5);
    const shot = until(12, () => projectiles.some(p => p.kind === 'arrow'), tough);
    check(shot < Infinity, 'he shoots arrows');
    out.push(`kept away with his bow: ${bowAway.leapt ? 'leap' : 'ran'}; arrow after ${shot.toFixed(1)} s`);

    // the end of his second bar: rewound again, the spiders gone, two echoes, a morning star
    damageEnemy(b, b.hp);
    check(until(RENEW_FIGHT.windup + RENEW_FIGHT.rewind.max + 2, () => b.stage === 3, tough) < Infinity, 'rewound again');
    run(1, tough);
    check(!minions('renspider').length, 'the spiders were not there when phase 2 began');
    check(b.profile.weapon === 'weapon_flail_morningstar' && rewindInfo().echoes === 2, 'phase 3: a morning star, and two echoes');
    check(until(12, () => echoesNow()[1].ghosts.some(g => g.type === 'renspider' && g.mode !== 'gone'), tough) < Infinity,
      'the ghosts of the spiders fight the second echo');
    check(until(25, () => minions('renface').length > 0, tough) < Infinity, 'he casts Fire-faces');
    check(state.dusk > 0.49, `night falls: ${state.dusk.toFixed(2)}`);
    // close to him: he swings it at the hero
    const swings = () => {
      const near = map.floors.filter(g => g.encounter && Math.hypot(g.x + 0.5 - b.x, g.z + 0.5 - b.z) < 1.4 && Math.hypot(g.x + 0.5 - b.x, g.z + 0.5 - b.z) > 0.7)[0];
      if (near) spawnAt(near.x + 0.5, floorY(near, 0.5, 0.5), near.z + 0.5);
      player.lastHurt = null;
      return until(8, () => /morning star/.test(player.lastHurt?.reason ?? ''), () => { tough(); player.ragdoll = null; player.getUp = null; });
    };
    const smashed = swings();
    check(smashed < Infinity, 'his morning star strikes the hero');

    // the end of his third bar: a twin morning star, three echoes
    damageEnemy(b, b.hp);
    check(until(RENEW_FIGHT.windup + RENEW_FIGHT.rewind.max + 2, () => b.stage === 4, tough) < Infinity, 'rewound a third time');
    check(b.profile.weapon === 'weapon_flail_twin' && rewindInfo().echoes === 3, 'phase 4: a twin morning star, and three echoes');
    check(!minions('renface').length, 'the Fire-faces were not there when phase 3 began');
    const battered = swings();
    check(battered < Infinity, 'his twin morning star strikes the hero');
    out.push(`morning star struck after ${smashed.toFixed(1)} s, the twin after ${battered.toFixed(1)} s`);

    // the end of his last bar: time runs back once more, but he does not come back: he rises away
    // into the sky as a ghost, then he is gone and his loot falls out of the sky; the echoes and
    // ghosts fight on a while, harmless, and fade
    const echoes = rewindInfo().echoes;
    damageEnemy(b, b.hp);
    check(b.hp === 1 && b.mode !== 'dead', 'no blow ends him: time runs back once more');
    check(until(RENEW_FIGHT.windup + 0.5, () => b.rewinding, tough) < Infinity, 'it runs back');
    check(until(RENEW_FIGHT.rewind.max + 1, () => !b.rewinding, tough) < Infinity && b.rising && b.stage === 4, 'and he rises instead of fighting on');
    check(rewindInfo().echoes === echoes + 1 && !player.flipping, 'the last phase\'s echo walks too, the hero free');
    const ground = b.rising.from, loot = lootHere();
    run(RENEW_FIGHT.ascend.time / 2, tough);
    check(b.y > ground + 2 && b.mode !== 'dead', `up into the sky: ${(b.y - ground).toFixed(1)} cells`);
    check(until(RENEW_FIGHT.ascend.time, () => b.mode === 'dead', tough) < Infinity && b.ascended, 'then he is gone');
    run(0.2);
    check(lootHere() > loot, 'his loot falls out of the sky');
    check(state.run.loot.get(state.cubeKey).some(p => ITEMS[p.itemId]?.weapon?.kind === 'flail'), 'a flail among it');
    check(!gateLocked(map, state.run), 'his death opens the well');
    const hp = player.hp = player.maxHp;
    run(1);
    check(rewindInfo().echoes > 0 && state.dusk === 0, 'the echoes fight on, the light comes back');
    check(player.hp >= hp, 'harmless now');
    run(RENEW_FIGHT.outro + 1, () => { player.ragdoll = null; });
    check(rewindInfo().echoes === 0 && !minions('renspider').length, 'and fade');
    return out;
  });
}
