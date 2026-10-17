// In index.html: await (await import('./tests/browser/generation.js')).runGenerationChecks()
// Real worker, GLTFLoader, instancing, shaders and collision. Restores the active game afterward.
import * as THREE from 'three';
import { paused } from './combat.js';
import { state, player } from '../../src/game/state.js';
import { props, propsReady, buildProps } from '../../src/render/props.js';
import { placeProps } from '../../src/render/propplace.js';
import { buildWorld, disposeWorld } from '../../src/render/world.js';
import { renderer, scene, camera } from '../../src/render/scene.js';
import { blockedAt } from '../../src/physics/collide.js';
import { makeLayouts } from '../../src/world/layout.js';
import { themeOf } from '../../src/themes/depth.js';

const check = (value, message) => { if (!value) throw Error(message); };
export async function runGenerationChecks() {
  await propsReady;
  return paused(async () => {
    const oldMap = state.map, hero = { ...player }, result = [];
    const layouts = makeLayouts(state.cubes.seed);
    try {
      check([...props.byName.values()].filter(p => p.cube_crawler_clutter).length === 222, 'load all new clutter');
      const glowingCover = [...props.byName.values()].find(p => p.cover && p.light);
      const g = new THREE.Group();
      buildProps([{ name: glowingCover.name, x: 0, y: 0, z: 0, yaw: 0, s: 1, normal: [-0.2, 1, 0] }], g);
      check(!g.children.some(o => o.isPointLight), 'glowing cover must be emissive only');
      g.traverse(o => { if (o.material) o.material.dispose(); });
      for (const depth of [16, 17, 19]) {
        const key = layouts(depth).sitePlans.keys().next().value;
        const c = await state.cubes.get(key), m = state.map = c.map;
        let world;
        try {
          world = buildWorld(m, false, {}, c.geo);
          const placed = placeProps(m, themeOf(m));
          check(m.rewardSites.length || m.siteFailures.length, 'worker preserves site records or explicit failure');
          for (const site of m.rewardSites) {
            check(m.safe[site.accessFloor], 'site approach leads onward');
            Object.assign(player, { h: 0.85, r: 0.22, y: site.approach.y });
            check(!blockedAt(site.approach.x, site.approach.z, site.approach.y, 0.3), 'interaction approach clears actual colliders');
            check(blockedAt(site.anchor.x, site.anchor.z, site.anchor.y, 0.3), 'chest has an actual collider');
            check(placed.out.filter(p => p.site === site.id && p.name === 'treasure_chest').length === 1, 'one chest per site');
          }
          if (m.rewardSites.length) check(world.group.getObjectByName('treasure_chest'), 'chest model is instantiated');
          renderer.compile(scene, camera);
          result.push({ key, sites: m.rewardSites.map(s => `${s.prestige}/${s.setting}`), failures: m.siteFailures,
            placed: placed.out.length, newClutter: placed.out.filter(p => props.byName.get(p.name)?.cube_crawler_clutter).length });
        } finally { disposeWorld(world); }
      }
      return result;
    } finally { state.map = oldMap; Object.assign(player, hero); }
  });
}
