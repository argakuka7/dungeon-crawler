// Level flow: the world of cubes, entering a cube, travelling through portals, spawning and
// taking damage.
import { DIRS } from '../core/constants.js';
import { isFaceOpen, openedSides, discoveredFaces } from '../core/boundaries.js';
import { showNeighbors, clearNeighbors, clearNeighborCache } from '../render/neighbors.js';
import { discoveredCubes } from '../core/viewdistance.js';
import { WorldClient } from '../world/client.js';
import { step } from '../world/coords.js';
import { buildWorld, disposeWorld, setWorldOpenFaces } from '../render/world.js';
import { groundAt } from '../physics/collide.js';
import { respawnPoint } from '../physics/respawn.js';
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { showStats, flash, fadeOut, fadeIn, whenReady } from './hud.js';
import { resetCut } from './cut.js';
import { resetEnemies, mirroring, detachEnemies } from './enemies.js';
import { removeEnemyViews } from '../render/enemies.js';
import { cancelSword } from './sword.js';
import { drawMinimap } from './minimap.js';
import { whenPropsReady } from '../render/props.js';
import { townAssetsReady } from '../render/townassets.js';
import { villagersReady } from '../render/villagers.js';
import { createPlayerStats, createRun, takeDamage } from '../core/progression.js';
import { clearEffects } from '../core/potions.js';
import { restoreDefeated, gateLocked, guardianLockMessage } from '../core/guardians.js';
import { syncEquippedWeapon } from './equipment.js';
import { clearInput } from './inputstate.js';
import { lootMark, forgetLoot, takeLoot } from './loot.js';
import { townPadIn } from '../core/townportal.js';
import { cancelCast } from './townportal.js';
import { isInterior } from '../world/town.js';
import { online, relay } from '../net/online.js';
import { log, logDeath, noteDepth } from './log.js';

export function spawnAt(x, y, z) {
  cancelSword(true); cancelCast();
  Object.assign(player, { x, y, z, vy: 0, vx: 0, vz: 0, visY: y, grounded: true, swimming: false, support: null, ragdoll: null, down: null, getUp: null, fluidDeath: 0, stun: 0, climb: null, burning: null, chilled: null, toxic: null, gust: null, shocked: 0 });
  player.safe = respawnPoint({ x, y, z });
  const gr = groundAt(x, z, y + 0.05, 0);
  player.support = gr.s;
  if (gr.s) player.layer = gr.s.kind ? gr.s.run.layer : gr.s.layer;
  resetCut();
}

// where you stand after coming through portal p: a step inside side portals, next to the
// centre of wells and rings (so you do not fall straight back through)
export function arrivalPoint(p) {
  const [x, z] = p.kind === 'side' ? [p.x + 0.5 - DIRS[p.dir][0], p.z + 0.5 - DIRS[p.dir][1]]
    : p.kind === 'spawn' ? [p.x + 0.5, p.z + 0.5] : [p.x + 1.5, p.z + 0.5];
  const y = groundAt(x, z, p.y + 0.3, 0).h;
  return respawnPoint({ x, z, y: Number.isFinite(y) ? y : p.y });
}

// back to where you came into this cube (after a death: the potions you drank wore off)
export function spawnEntry() {
  const a = state.arrival = respawnPoint(state.arrival);
  spawnAt(a.x, a.y, a.z);
  player.hp = player.maxHp;
  clearEffects(player);
}

export function hurt(amount, reason, by = null) {
  player.lastHurt = { reason, by };
  takeDamage(player, amount, state.time);
  flash();
  if (player.hp <= 0) { setStatus('You died (' + reason + ') - back to where you came in'); die(); }
  else { setStatus(reason); recover(); }
}

// The cube as you came in. A death puts it back: the enemies you defeated since return and
// the coins they dropped (and you did not pick up yet) go.
// learn: memory.html#death (see learn/README.md)
export function beginVisit() {
  state.visit = { key: state.cubeKey, defeated: new Set(state.run.defeated), loot: lootMark() };
}
function restoreVisit(v) {
  if (!v) return;
  restoreDefeated(state.run, v.defeated);
  forgetLoot(v.key, v.loot);
}

// died: back to where you came in, in the cube as it was then (after a fall through cubes:
// the cube the fall started in). The chronicle notes what did it (game/log.js logDeath).
// learn: memory.html#death (see learn/README.md)
export function die() {
  sfx('death');
  logDeath();
  backAfterDeath();
}
function backAfterDeath() {
  if (state.fallFrom) { returnFromFall(true); return; }
  // playing together the cube stays as it is while a friend fights on in it (and the enemies
  // we are shown are another player's anyway, src/net/foes.js)
  if (mirroring() || online.buddies.some(b => b.here && !b.out && b.hp > 0)) { spawnEntry(); return; }
  restoreVisit(state.visit);
  resetEnemies();
  spawnEntry();
}

// back on your feet at the last safe spot (after a fall through cubes: in the cube the fall
// started in)
export function recover() {
  if (state.fallFrom) { returnFromFall(false); return; }
  const a = respawnPoint(player.safe);
  spawnAt(a.x, a.y, a.z);
}

// For now you only enter a cube through a portal: a fall through the void ends back in the
// cube it started in, at its last safe spot (or its entry, if the landing killed you).
function returnFromFall(dead) {
  const f = state.fallFrom, cubes = state.cubes;
  state.fallFrom = null;
  state.transitioning = true;
  cancelSword(true);
  fadeOut();
  setTimeout(() => whenReady(cubes.get(f.key)).then(c => {
    if (state.cubes !== cubes) return;
    if (dead) restoreVisit(f.visit);
    enterCube(c, null, f);
    if (dead) spawnEntry();
    else { const a = respawnPoint(f.safe); spawnAt(a.x, a.y, a.z); }
    state.transitioning = false;
  }, () => {
    if (state.cubes !== cubes) return;
    state.transitioning = false;
    if (dead) backAfterDeath(); else recover();   // stay in this cube
  }), 380);
}

// Discovering a cube opens side faces towards cubes already discovered. It can also join
// two sections elsewhere (the room between them was the last one missing), so all
// discovered cubes are checked again.
export function discover(c) {
  if (!c.visits++) relay.visited?.(c.key);   // playing together: the friend's map shows it too
  return openDiscoveredFaces();
}

// Playing together, the friend discovered cube k (net/session.js): it is discovered here too,
// on the minimap and for the faces it opens (once its map is here: it may still have to be made)
// learn: network.html#apart (see learn/README.md)
export function shareVisit(k) {
  const cubes = state.cubes;
  cubes.get(k).then(c => {
    if (state.cubes !== cubes || c.visits) return;
    c.visits = 1;
    if (openDiscoveredFaces() && state.world) setWorldOpenFaces(state.world, openedSides(state.openedFaces, state.cubeKey));
    updateNeighbors(); drawMinimap();
  }, () => {});
}
export const visitedKeys = () => [...state.cubes.cubes.values()].filter(c => c.visits).map(c => c.key);

// Playing together, the friend opened these side faces (a gate they went through, a portal
// that became an open wall): open here too, so either can walk across where the other did
// learn: network.html#apart (see learn/README.md)
export function shareFaces(keys) {
  const before = state.openedFaces.size;
  for (const k of keys) state.openedFaces.add(k);
  if (state.openedFaces.size === before) return;
  if (state.world) setWorldOpenFaces(state.world, openedSides(state.openedFaces, state.cubeKey));
  updateNeighbors(); drawMinimap();
}

function openDiscoveredFaces() {
  const before = state.openedFaces.size, cubes = state.cubes.cubes;
  for (const c of cubes.values()) if (!isInterior(c.key)) for (const f of discoveredFaces(cubes, c, state.run)) state.openedFaces.add(f);
  return state.openedFaces.size !== before;
}

// A gate unlocked in the cube we are in may join sections discovered earlier.
export function refreshOpenFaces() {
  if (!openDiscoveredFaces() || !state.world) return;
  setWorldOpenFaces(state.world, openedSides(state.openedFaces, state.cubeKey));
  updateNeighbors(); drawMinimap();
}

// which portals lead somewhere already explored
export const portalSeen = (k, m) => Object.fromEntries(m.portals.map(p => [p.id, p.kind !== 'spawn' && !!state.cubes.cubes.get(step(k, p.dir))?.visits]));

// enter cube c (a ready cube from the world client), arriving through its portal on face
// `from` (null: the spawn pad). `back`: returning to a cube left by a fall, with the
// entry and visit it had then (see game/fall.js). `at`: arriving at that point instead (the
// town portal, game/townportal.js)
// learn: architecture.html#cube-journey (see learn/README.md)
export function enterCube(c, from = null, back = null, at = null) {
  const k = c.key;
  if (!back) discover(c);
  state.cubeKey = k; state.map = c.map; state.lookDepth = c.map.depth;
  disposeWorld(state.world);
  state.world = buildWorld(c.map, state.showPath, portalSeen(k, c.map), c.geo, openedSides(state.openedFaces, k), gateLocked(c.map, state.run), townPadIn(c.map, state.run), state.run.chests);
  if (back) {
    const { arrival, portalLock, boundaryLock, visit } = back;
    Object.assign(state, { arrival, portalLock, boundaryLock, visit });
  } else if (at) {
    state.arrival = { x: at.x, y: at.y, z: at.z };
    state.portalLock = 0; state.boundaryLock = -1;
    beginVisit();
  } else {
    const p = c.map.portals.find(q => from === null ? q.kind === 'spawn' : q.dir === from);
    state.arrival = arrivalPoint(p);
    state.portalLock = isFaceOpen(state.openedFaces, k, p.dir) ? 0 : p.id;
    state.boundaryLock = p.kind === 'side' ? p.dir : -1;
    beginVisit();
  }
  resetEnemies();
  const hp = player.hp;
  state.arrival = respawnPoint(state.arrival);
  spawnAt(state.arrival.x, state.arrival.y, state.arrival.z);
  player.hp = hp;
  settleIn();
  fadeIn();
}

// HUD, minimap and neighbours for the cube we are in now
// learn: architecture.html#cube-journey (see learn/README.md)
export function settleIn(neighbors = true) {
  const c = state.cubes.cubes.get(state.cubeKey);
  showStats(c.map, state.cubeKey, state.cubes.seed, c.visits);
  noteDepth(c.map, state.cubes.seed);   // the first time this deep: into the chronicle
  drawMinimap();
  if (neighbors) showNeighbors(visitedNeighbors(state.cubeKey));
  if (gateLocked(state.map, state.run)) setStatus(guardianLockMessage(state.map));
  // get the cubes behind our portals (and doors) ready in the background
  state.cubes.prefetch([...c.map.portals.filter(p => p.kind !== 'spawn').map(p => step(state.cubeKey, p.dir)),
    ...(c.map.doors || []).map(d => d.to)]);
}

// Discovered cubes within the render budget, on the active stratum only.
export function visitedNeighbors(k) {
  if (!state.showNeighbors || isInterior(k)) return [];   // inside a house: nothing around
  return discoveredCubes(state.cubes.cubes, k)
    .map(c => ({ ...c, open: openedSides(state.openedFaces, c.key) }));
}

export function updateNeighbors() {
  // Travel owns detached proxy sets; do not build a third set while it runs.
  if (!state.transitioning) showNeighbors(visitedNeighbors(state.cubeKey));
}

// the props library may arrive after the first cube was built: build that cube again
whenPropsReady(() => {
  if (!state.world || state.transitioning) return;
  const c = state.cubes.cubes.get(state.cubeKey);
  disposeWorld(state.world);
  state.world = buildWorld(c.map, state.showPath, portalSeen(state.cubeKey, c.map), c.geo, openedSides(state.openedFaces, state.cubeKey), gateLocked(c.map, state.run), townPadIn(c.map, state.run), state.run.chests);
  // Props add blockers after a late load. Re-select safe, seeded spawn sites.
  cancelSword(); resetEnemies();
});

// keepPlayer: the player keeps their character (level, bag, gear); joining a friend's world
// (src/net/session.js), or a saved hero (game/save.js). restore: a saved world's progress
// (game/save.js restoreOf): { name, run, faces, visited, spot }; spot: { cube, arrival } where to
// come in (else the town's spawn pad)
export function newWorld(seed = (Math.random() * 1e9) >>> 0, { keepPlayer = state.keepHero, restore = null } = {}) {
  clearNeighbors(); clearNeighborCache();
  state.cubes?.dispose();
  const params = new URLSearchParams(location.search);
  // dev: ?arche=<archetype> everywhere, ?theme=clouds,forge picks those themes for their depths
  state.cubes = new WorldClient(seed, { arche: state.dev && params.get('arche'),
    themes: state.dev && params.get('theme') ? params.get('theme').split(',') : [] });
  state.openedFaces.clear(); state.boundaryLock = -1; state.fallFrom = null;
  state.transitioning = true;
  cancelSword(true);
  clearInput();
  if (!keepPlayer) Object.assign(player, createPlayerStats(state.dev));
  state.run = createRun(); state.inventoryOpen = false;
  if (restore) restoreRun(restore);
  log('world', restore?.name ? { seed, name: restore.name } : { seed });
  // a saved spot whose cube does not come (the generator changed): the town instead
  const cubes = state.cubes, spot = restore?.spot;
  const first = spot ? cubes.get(spot.cube).catch(() => cubes.get(cubes.start)) : cubes.get(cubes.start);
  // the villagers are a nicety: a failure to load them (logged) does not hold the game up
  return whenReady(Promise.all([first, townAssetsReady, syncEquippedWeapon(),
    villagersReady.catch(() => null)]))
    .then(([c]) => {
      if (state.cubes !== cubes) return;
      if (spot && c.key === spot.cube) enterCube(c, null, null, spot.arrival); else enterCube(c);
      state.transitioning = false;
      if (restore) for (const k of restore.visited) shareVisit(k);   // the map comes back, nearest first
    });
}

// a saved world's progress into the fresh run (newWorld)
function restoreRun({ run, faces }) {
  const r = state.run;
  for (const id of run.defeated) r.defeated.add(id);
  for (const k of run.gates) r.unlockedGates.add(k);
  for (const id of run.chests) r.chests.add(id);
  for (const s of run.dropped) r.dropped.add(s);
  r.townPortal = run.townPortal;
  takeLoot(run.loot);
  for (const k of faces) state.openedFaces.add(k);
}

// Back to the main menu (game/menu.js): the world goes, and nothing of it stays in the scene
export function endWorld() {
  cancelSword(true); cancelCast(); clearInput();
  removeEnemyViews(detachEnemies());
  clearNeighbors(); clearNeighborCache();
  disposeWorld(state.world); state.world = null;
  state.cubes?.dispose(); state.cubes = null;
  Object.assign(state, { map: null, cubeKey: '', arrival: null, visit: null, fallFrom: null, cast: null, portalCharge: null,
    portalLock: 0, boundaryLock: -1, inventoryOpen: false, transitioning: false, run: createRun() });
  state.openedFaces.clear();
}

export function nextCube() {
  if (state.transitioning) return;
  if (online.role === 'guest') { setStatus('Only the host starts a new world'); return; }
  state.transitioning = true;
  fadeOut();
  setTimeout(() => newWorld().then(() => setStatus('A new world')), 380);
}
export const loadCube = () => newWorld(state.baseSeed);
