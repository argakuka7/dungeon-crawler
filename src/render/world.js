// Builds (and animates) all meshes for one generated map.
import * as THREE from 'three';
import { scene } from './scene.js';
import { FLUID_LOOK, fluidGlow, scrollFalls, WIND } from './materials.js';
import { partMeshes } from './partmeshes.js';
import { buildCubeParts } from './cubegeo.js';
import { buildFalls, lavaLights } from './falls.js';
import { addGhosts } from './ghosts.js';
import { buildMarkers, townPortalFx } from './markers.js';
import { adoptLights, releaseLights, trackLight, untrackLight } from './lightpool.js';
import { makeFadable, adoptFade } from './fade.js';
import { makeGlass, setGlassFaces } from './glass.js';
import { buildProps, propSetLoaded } from './props.js';
import { openedChest, tickChests } from './chests.js';
import { placeProps, propSetsOf } from './propplace.js';
import { buildVillagers, tickVillagers } from './villagers.js';
import { themeOf } from '../themes/depth.js';
import { ownShadowDepth } from './skinned.js';

export function disposeWorld(world) {
  if (!world) return;
  scene.remove(world.group);
  releaseLights(world.group);
  world.group.traverse(o => { if (!o.userData.sharedGeo) o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(m => m.userData.keep || m.dispose()); });
}

// geo: the cube's parts (from the worker, cubegeo.js buildCubeParts); built here if missing; townPad: the end
// of the open town portal standing in this cube (core/townportal.js townPadIn); opened: the ids
// of the reward sites whose chests are open (run.chests)
export function buildWorld(m, showPath, seen, geo = buildCubeParts(m), open = [], locked = !!m.guardian, townPad = null, opened = null) {
  const group = new THREE.Group();
  const fluidMeshes = partMeshes(geo, group, m.interior ? ['stone'] : []);
  const { splashes, lights } = buildFalls(m, group);
  lavaLights(m, group, lights);
  const markers = buildMarkers(m, group, showPath, seen, open, locked);
  // decoration (also sets the colliders of blocking props on the map); missingSets: the prop
  // sets not loaded yet, whose props are not drawn (game/flow.js builds the cube again for them)
  const placed = placeProps(m, themeOf(m)), missingSets = propSetsOf(m, themeOf(m)).filter(s => !propSetLoaded(s));
  m.blockers = placed.blockers.map((list, i) => [...(m.staticBlockers?.[i] || []), ...list]);
  buildProps(placed.out.map(q => opened?.has(q.site) ? openedChest(q) : q), group);
  const villagers = buildVillagers(m.villagers, group);
  addGhosts(group);
  const glass = makeGlass(1, open);
  glass.visible = !m.interior;   // inside a house: walls, no glass box
  group.add(glass);
  adoptLights(group);
  makeFadable(group);
  ownShadowDepth(group);   // the props' instanced meshes
  scene.add(group);
  const world = { group, glass, fluidMeshes, splashes, lights, villagers, missingSets, ...markers };
  setTownPortal(world, townPad);
  return world;
}

// Show the town portal standing at pad in a built cube (null: none), replacing one elsewhere.
export function setTownPortal(world, pad) {
  if (!world) return;
  const i = world.portalFx.findIndex(f => f.obj.userData.portal.kind === 'town'), old = world.portalFx[i];
  const at = old?.obj.userData.portal;
  if (old && pad && at.x === pad.x && at.y === pad.y && at.z === pad.z) return;
  if (old) {
    world.portalFx.splice(i, 1);
    world.group.remove(old.obj);
    untrackLight(old.light);
    old.obj.traverse(o => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
  }
  if (!pad) return;
  const fx = townPortalFx(pad);
  fx.obj.remove(fx.light);   // a pool light source (render/lightpool.js), not a scene light
  world.group.add(fx.obj);
  adoptFade(world.group, fx.obj);
  trackLight(fx.light, fx.obj, world.group);
  world.portalFx.push(fx);
}

// The departing cube is already built when its first side connection opens.
export function setWorldOpenFaces(world, open) {
  setGlassFaces(world.glass, open);
  for (const fx of world.portalFx) {
    const p = fx.obj.userData.portal;
    if (p.kind === 'side' && open[p.dir]) fx.obj.visible = false;
  }
}

export function setGuardianGate(world, locked) {
  for (const fx of world?.portalFx || []) fx.setLocked?.(locked);
}

// per-frame animation of fluids, waterfalls, lights and the portal
export function animateWorld(world, dt, time) {
  for (const m of world.fluidMeshes) {
    const t = m.userData.fluid, motion = FLUID_LOOK[t].motion;
    if (motion.bob) m.position.y = Math.sin(time * motion.rate + motion.phase) * motion.bob;
    else m.material.emissiveIntensity = fluidGlow(t, time);
  }
  scrollFalls(dt);
  WIND.value = time;
  world.splashes.forEach((s, i) => { const k = 1 + Math.sin(time * 9 + i) * 0.08; s.scale.set(k, 1, k); });
  for (const l of world.lights) l.intensity = 5 + Math.sin(time * 4 + l.position.x) * 1.5;
  for (const p of world.portalFx) p.tick(time);
  tickChests(dt);
  tickVillagers(world.villagers, dt, time);
}
