// Entry point: load the first cube and run the frame loop.
import * as THREE from 'three';
import { renderer, scene, camera } from './render/scene.js';
import { animateWorld } from './render/world.js';
import { animateCharacter } from './render/animator.js';
import { generate } from './cubegen/index.js';
import { groundAt } from './physics/collide.js';
import { player, state, setStatus, worldPaused } from './game/state.js';
import { loadCube } from './game/flow.js';
import { updatePlayer } from './game/update.js';
import { updateCamera } from './game/camera.js';
import { updateCut } from './game/cut.js';
import { updateHud } from './game/hud.js';
import { updateConsole, openChat, closeChat, say } from './game/console.js';
import { runCommand } from './game/commands.js';
import { chronicle } from './game/log.js';
import { updateInventory } from './game/inventory.js';
import { devSwapWeapon, devDropWeapon, devWear } from './game/equipment.js';
import { updateLightPool, focusPoint } from './render/lightpool.js';
import { tickNeighbors, cullNeighbors } from './render/neighbors.js';
import { tickProps } from './render/props.js';
import { tickFluidDeath } from './render/fluiddeath.js';
import { applyLook } from './render/look.js';
import { tickSky } from './render/sky.js';
import { updatePlayerBar } from './render/playerbar.js';
import { updatePortalBar } from './render/portalbar.js';
import { updateCastBar } from './render/castbar.js';
import { updateQuickbar } from './game/quickbar.js';
import { updateTouch } from './game/touch.js';
import { updateLoot } from './game/loot.js';
import { updateLootLabels } from './game/lootlabels.js';
import { tickFloatText } from './render/floattext.js';
import { tickParticles } from './render/particles.js';
import { tickPortalCloud } from './render/portalcloud.js';
import { timeScale } from './game/juice.js';
import { gameTime, pace } from './game/pace.js';
import { teach, tickTeach } from './game/teach.js';
import { updatePointer } from './game/pointer.js';
import { depthOf } from './themes/depth.js';
import { goHorde } from './game/dev.js';
import { spawnEnemies, killEnemies, clearEnemies } from './game/devspawn.js';
import { updateSpiders, spiders } from './game/spiders.js';
import { stunders } from './game/stunders.js';
import { snakes } from './game/snakes.js';
import { octonauts } from './game/octonauts.js';
import { fireFaces } from './game/firefaces.js';
import { triangles } from './game/triangles.js';
import { fireCats } from './game/firecats.js';
import { shraps } from './game/shraps.js';
import { spicies } from './game/spicy.js';
import { projectiles } from './game/projectiles.js';
import { beams } from './game/beams.js';
import { tickBurning } from './render/burning.js';
import { tickChill } from './render/chilled.js';
import { tickStatuses } from './render/statuses.js';
import { updateEffects } from './game/effects.js';
import { updateAim } from './game/throws.js';
import { updateEnemies, allEnemies } from './game/enemies.js';
import { updateMusic, forceMood } from './game/music.js';
import { updateFootsteps } from './game/footsteps.js';
import { updateSounds } from './game/sounds.js';
import { updateAmbience } from './game/ambience.js';
import { musicInfo } from './audio/music.js';
import { travelling, updateTravel, drawTravelEnemies } from './game/travel.js';
import { updateOnline, hostGame, joinGame, leaveGame, sessionStatus } from './net/session.js';
import { online } from './net/online.js';

const clock = new THREE.Clock();

// learn: architecture.html#conductor #main-js, loop.html#frame-code #one-tick #pause #smoothing (see learn/README.md)
function frame() {
  const elapsed = Math.min(clock.getDelta(), 1 / 30), dt = worldPaused() ? 0 : gameTime(elapsed) * timeScale(elapsed);
  updatePointer();   // the enemy under the cursor (with last frame's camera)
  state.time += dt;
  if (dt > 0 && travelling()) updateTravel(dt);
  else if (dt > 0 && state.map && !state.transitioning) { updatePlayer(dt); if (!state.transitioning) updateEnemies(dt); }

  // smooth out small vertical snaps (steps), but not falls
  player.visY += (player.y - player.visY) * Math.min(1, dt * 25);
  if (Math.abs(player.y - player.visY) > 1.5 || player.ragdoll) player.visY = player.y;
  animateCharacter(dt, state.time);
  updateFootsteps();   // on the cycle the animator just advanced
  updateSounds(dt); updateAmbience(dt);
  tickFluidDeath(dt);
  tickBurning(dt); tickChill(dt); tickStatuses(allEnemies(), dt);
  drawTravelEnemies(dt);
  updateLoot(dt, state.time);
  tickFloatText(dt);
  tickParticles(dt);
  tickPortalCloud(dt);
  tickNeighbors(dt);
  tickProps(state.time);
  if (state.world) animateWorld(state.world, dt, state.time);
  updateHud(player, state.map);
  updateConsole();   // the chat box: the chronicle and the game's last word (game/console.js)
  updateInventory();
  updateQuickbar(); updateEffects(); updateTouch();
  updateCamera(pace.paused ? elapsed : dt);   // paused by the Guide (game/pace.js): the view still turns
  if (!state.transitioning) updateCut(dt);   // after the camera: the cut depends on what the camera can see
  updateLootLabels();   // after the camera too: labels sit over their items
  updateAim(allEnemies());   // the arc a flask in hand would fly (game/throws.js)
  tickTeach();   // what the Guide draws over the world (game/teach.js)
  // the look follows the depth smoothly (also while sliding down / up)
  if (state.cubeKey) state.lookDepth += (depthOf(state.cubeKey) - state.lookDepth) * Math.min(1, dt * 2.5);
  applyLook(state.lookDepth, camera.position.distanceTo(focusPoint(player.x, player.visY, player.z)));
  updateLightPool(focusPoint(player.x, player.visY + 1, player.z));
  cullNeighbors(player.x, player.z, !state.transitioning, state.showNeighbors, player.visY + (player.swimming ? 0.6 : 0.3));
  updatePlayerBar();
  updateOnline();   // playing together: send our pose, follow, show the partner (net/session.js)
  updatePortalBar();
  updateCastBar();
  updateMusic(elapsed);
  tickSky(performance.now() / 1000);   // real time: the stars shimmer on while paused
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

loadCube();
setStatus('Welcome to town. Follow the path through the grove to leave.');
// debug / test hooks
window.__game = {
  get map() { return state.map; }, player, generate, loadCube, updatePlayer, groundAt,
  get transitioning() { return state.transitioning; }, get spiders() { return spiders; }, updateSpiders, state,
  get stunders() { return stunders; }, get snakes() { return snakes; }, get octonauts() { return octonauts; },
  get fireFaces() { return fireFaces; }, get triangles() { return triangles; }, get fireCats() { return fireCats; }, get shraps() { return shraps; }, get spicies() { return spicies; },
  get projectiles() { return projectiles; }, get beams() { return beams; },
  get enemies() { return allEnemies(); }, updateEnemies,
  musicInfo, musicMood: forceMood,   // musicMood('boss') holds a mood to listen to it, musicMood() lets go
  net: { online, hostGame, joinGame, leaveGame, status: sessionStatus },   // playing together (net/session.js)
  chat: { open: openChat, close: closeChat, say, run: runCommand, chronicle },   // the chat box (game/console.js)
  teach,   // drawings, lenses, pause / slow / step, tuning with a way back (game/teach.js)
  devSwapWeapon: state.dev ? devSwapWeapon : undefined, devDropWeapon: state.dev ? devDropWeapon : undefined,
  devWear: state.dev ? devWear : undefined,   // devWear('wear_wizard_hat'), devWear(null)
  ...(state.dev && { spawnEnemy: spawnEnemies, killEnemies, clearEnemies, goHorde }),   // (the console's /spawn, /kill ...)
};
frame();
