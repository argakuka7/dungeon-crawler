// Totnar's fight (core/totnar.js has the rules, docs/bosses.md tells it): this cube's Totnar and
// his minions (the snapping skulls his thrown skulls become, the twig spiders and the bramble
// Stunders he summons), all in one list (`totnars`), so they fight, collide, travel and get shown
// to friends like any enemy. Each Totnar has a fight of its own here: { e (him), shed (s left of
// losing a skull), cool (s to his next summon), gloom (s until he changes the light), minions }.
// A dev spawn (game/devspawn.js) gets one too.
//
// On him: `stage` (1 to 3: three skulls down to one; render/enemies.js hides the lost ones) and
// `dark` (1 while he keeps the arena dark: game/enemies.js makes the cube dark, render/look.js).
// Movement and attacks are the shared enemy AI's (game/enemyai.js, the roll too): the fight
// says which attacks may start (`barred`), carries out a summon (`summon`) and the gloom (`cast`)
// at their hit frames, brings a thrown skull to life where it lands (`landed`,
// game/projectiles.js), and takes his skulls off. While a skull bursts off (mode 'split') the AI
// leaves him be.
import { state, setStatus } from './state.js';
import { TOTNAR, ENEMY_KINDS, makeEnemy } from '../core/enemies.js';
import { TOTNAR_FIGHT as G, stageFloor, summonCount, spell, barred } from '../core/totnar.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { groundY } from '../physics/enemynav.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, fitting, leave, minionFloors, minion, sweep } from './bossfight.js';
import { summonFx } from './juice.js';

export let totnars = [];
let fights = [];
const MINIONS = { spiders: 'totspider', stunders: 'totstunder' };

export function resetTotnars() {
  removeEnemyViews(totnars);
  totnars = []; fights = [];
  addTotnars(enemySpots(state.map, TOTNAR).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? TOTNAR, i)));
}
// Totnars to fight: this cube's, or spawned with the dev tools
export function addTotnars(list) {
  for (const e of list) {
    Object.assign(e, { stage: 1, dark: 0, hpFloor: stageFloor(e.profile.hp, 1) });
    const f = { e, shed: 0, cool: G.firstSummon, gloom: G.firstDark, minions: [], n: 0,
      nonce: Math.random().toString(36).slice(2, 7), over: false };
    e.barred = barred(1, false, false);
    e.summon = a => summon(f, a);
    e.cast = () => gloom(f);
    e.landed = pr => skull(f, pr);
    fights.push(f); totnars.push(e);
  }
}
export function detachTotnars() { const list = totnars; totnars = []; fights = []; return list; }

export function updateTotnars(dt) {
  for (const f of fights) run(f, dt);
  for (const e of totnars) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(totnars.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  totnars = sweep(totnars, dt);
  fights = fights.filter(f => totnars.includes(f.e));
}

function run(f, dt) {
  const e = f.e;
  f.minions = f.minions.filter(m => living(m) && totnars.includes(m));
  if (e.mode === 'dead') {   // his minions go with him, and the light comes back
    if (!f.over) { f.over = true; e.dark = 0; f.minions.forEach(m => leave(m, G.leave)); f.minions = []; }
    return;
  }
  // the snapping skulls crumble after a while (not in the middle of a bite)
  for (const m of f.minions) if (m.type === 'snapskull' && (m.age = (m.age ?? 0) + dt) > G.skullLife && m.mode !== 'attack') leave(m, G.leave);
  if (e.mode === 'split') {   // a skull bursting off; then back into the fight, with the new stage's attacks
    if ((f.shed -= dt) > 0) return;
    engage(e);
  }
  if (e.mode === 'chase' || e.mode === 'attack') { f.cool -= dt; f.gloom -= dt; }   // (in the fight)
  const room = e.stage === 2 ? summonCount('spiders', count(f, 'totspider')) : e.stage === 3 ? summonCount('stunders', count(f, 'totstunder')) : 0;
  e.barred = barred(e.stage, f.gloom <= 0, f.cool <= 0 && room > 0);
  if (e.stage < 3 && e.hp <= e.hpFloor) shed(f);
}
const count = (f, type) => f.minions.filter(m => m.type === type).length;

// down to the next stage's share of his health: a skull bursts off (and a shell of his sticks,
// render/enemies.js), nothing hurts him meanwhile, and the light comes back
function shed(f) {
  const e = f.e;
  e.stage++;
  Object.assign(e, { hpFloor: stageFloor(e.profile.hp, e.stage), mode: 'split', speed: 0, path: null, shield: G.shedTime + 0.3, dark: 0 });
  f.shed = G.shedTime; f.cool = G.shedTime + G.firstSummon; f.gloom = G.shedTime + G.shedLight;
  if (e.stage === 3) for (const m of f.minions) if (m.type === 'snapskull') leave(m, G.leave);   // (no more thrown skulls)
  setStatus(e.stage === 2 ? `${e.profile.label} loses a skull! Now he rolls` : `${e.profile.label} loses another skull! A storm gathers`);
}
// the gloom's hit frame: dark if it was light, light if it was dark, for a while
function gloom(f) {
  const e = f.e;
  e.dark = e.dark ? 0 : 1;
  f.gloom = spell(!!e.dark, Math.random());
}
// a summon's hit frame: twig spiders (or bramble Stunders) pour out of him, as many as fill up to
// the most, on free floors around him
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], n = summonCount(a.name, count(f, kind.type));
  f.cool = G.summonCool;
  if (!n) return;
  const list = minionFloors(e, kind, n, totnars.filter(living), { ahead: 1.6, within: 5 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.5 + Math.random() * 1.2;
    return m;
  });
  totnars.push(...list); f.minions.push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'leaves');
}
// a skull he threw landed (hit a player, the level, or flew its range out): it comes to life on
// the nearest free floor there, unless enough of them are about already
function skull(f, pr) {
  const e = f.e, kind = ENEMY_KINDS[pr.spec.becomes];
  if (!kind || e.mode === 'dead' || e.stage >= 3 || count(f, kind.type) >= G.skulls) return;
  const l = Math.hypot(pr.vx, pr.vz) || 1, x = pr.x - pr.vx / l * 0.35, z = pr.z - pr.vz / l * 0.35;
  const others = totnars.filter(living);
  const s = fitting(kind).map(g => ({ g, d: Math.hypot(g.x + 0.5 - x, g.z + 0.5 - z), dy: Math.abs(groundY(g, g.x + 0.5, g.z + 0.5) - pr.y) }))
    .filter(({ g, d, dy }) => d < 1.6 && dy < 2.2 && others.every(o => Math.hypot(o.x - g.x - 0.5, o.z - g.z - 0.5) > o.profile.radius + kind.radius))
    .sort((a, b) => a.d + a.dy * 0.5 - b.d - b.dy * 0.5)[0]?.g;
  if (!s) return;
  const m = minion(e, `${e.id}:skull:${f.nonce}${++f.n}`, kind, s, Math.atan2(pr.vx, pr.vz), f.n);
  m.cool = 0.6; m.age = 0;
  totnars.push(m); f.minions.push(m);
}
