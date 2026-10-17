// Where falls land: splash rings, and point lights over lava. The sheets themselves are part of
// the cube's geometry (render/parts.js), drawn by the cube and its proxy alike.
import * as THREE from 'three';
import { N, LH, LAVA, DIRS } from '../core/constants.js';
import { FLUID_LOOK } from './materials.js';
import { cutMaterial } from './section.js';

// a splash ring where a fall lands (render/parts.js fallSheets has the sheet)
export function buildFalls(m, group) {
  const splashes = [], lights = [];
  for (const f of m.falls) {
    const [dx, dz] = DIRS[f.d], bx = f.c % N, bz = (f.c / N) | 0;
    const yTop = f.top * LH - 0.04, yBot = f.bot * LH - 0.08, h = yTop - yBot;
    const ex = dx > 0 ? bx : dx < 0 ? bx + 1 : bx + 0.5, ez = dz > 0 ? bz : dz < 0 ? bz + 1 : bz + 0.5;
    if (f.out) continue;   // pours out through the bottom of the cube: no splash here
    const foam = FLUID_LOOK[f.type].foam;
    const splash = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.05, 14),
      cutMaterial(new THREE.MeshBasicMaterial({ color: foam, transparent: true, opacity: 0.55, depthWrite: false })));
    splash.position.set(ex + dx * 0.3, yBot + 0.06, ez + dz * 0.3);
    splash.renderOrder = 10 * f.layer + 4;
    group.add(splash); splashes.push(splash);
    if (f.type === LAVA) {
      const l = new THREE.PointLight(0xff5a1a, 6, 6, 2);
      l.position.set(ex + dx * 0.6, yBot + h * 0.4, ez + dz * 0.6);
      lights.push(l); group.add(l);
    }
  }
  return { splashes, lights };
}

// a few glows over lava bodies (at most 4 lights in total)
export function lavaLights(m, group, lights) {
  for (const f of m.floors) {
    if (f.fluid !== LAVA) continue;
    const x = f.x + 0.5, z = f.z + 0.5, y = f.surf * LH + 0.7;
    if (lights.some(l => Math.hypot(l.position.x - x, l.position.z - z, l.position.y - y) < 4) || lights.length >= 4) continue;
    const l = new THREE.PointLight(0xff5a1a, 6, 6, 2);
    l.position.set(x, y, z);
    lights.push(l); group.add(l);
  }
}
