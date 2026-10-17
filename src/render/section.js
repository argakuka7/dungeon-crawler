// Cutaway: a slowly turning nine-cornered shape on screen around the character (cutshader.js).
// Inside it, everything above the cut height on the camera's side of the character (a
// vertical plane through it, facing the camera) is discarded; nothing behind the character is
// touched, however high it reaches. Cut solids show their insides: back
// faces are drawn as a flat cap, and the cut-away part as faint glass (ghosts.js). The cap
// has one colour per kind of solid (rock strata at the cut height, structure stone, wood), so
// the inner faces seen through the cut read as a single flat lid.
// Cut fluids get flat caps.
import * as THREE from 'three';
import { N, LH, CUBE_H } from '../core/constants.js';
import { GeoBuilder } from './builder.js';
import { C, gradient } from './palette.js';
import { FLUID_LOOK } from './materials.js';
import { themeOf } from '../themes/depth.js';
import { buildOf } from '../themes/builds.js';
import { scene, camera, renderer } from './scene.js';
import { U, inject, turnShape, CUT_KINDS } from './cutshader.js';
import { WALL_CUT, CUT_HEIGHT } from './interior.js';
import { showGhosts } from './ghosts.js';

const RADIUS = 2.8;   // world units around the character

// how much darker a cap is than an unshadowed floor of the same colour
const CAP_SHADE = 0.68;

const CAP_UNIFORM = { rock: 'uCapRock', stone: 'uCapStone', wood: 'uCapWood' };

// a material that gets cut away; caps ('rock' | 'stone' | 'wood'): its back faces show as
// the flat cap in that kind's colour, lit like an upward-facing floor (sky + sun, no
// shadows), a little darker; ghost: the cut-away part is drawn again as glass (ghosts.js)
export function cutMaterial(mat, caps = false, ghost = !!caps) {
  if (caps) { mat.side = THREE.DoubleSide; mat.shadowSide = THREE.BackSide; }
  mat.userData.ghost = ghost;
  return inject(mat, fs => {
    fs = fs.replace('#include <clipping_planes_fragment>', 'if (cutRegion(true) > 0.5 || frontWall()) discard;\n#include <clipping_planes_fragment>');
    // cap-only faces (palette.js CAP_ONLY) are not drawn from the front
    if (caps) fs = fs.replace('#include <clipping_planes_fragment>', `#ifdef USE_COLOR
        if (gl_FrontFacing && vColor.r + vColor.g + vColor.b < 1e-4) discard;
      #endif
      #include <clipping_planes_fragment>`);
    if (caps) fs = fs.replace('#include <opaque_fragment>', `if (!gl_FrontFacing) {
        vec3 capUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), capIrr = vec3(0.0);
        #if NUM_HEMI_LIGHTS > 0
          for (int i = 0; i < NUM_HEMI_LIGHTS; i++) capIrr += getHemisphereLightIrradiance(hemisphereLights[i], capUp);
        #endif
        #if NUM_DIR_LIGHTS > 0
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) capIrr += directionalLights[i].color * max(dot(capUp, directionalLights[i].direction), 0.0);
        #endif
        outgoingLight = BRDF_Lambert(${CAP_UNIFORM[caps]}) * capIrr * ${CAP_SHADE.toFixed(3)};
      }
      #include <opaque_fragment>`);
    return fs;
  }, caps ? 'cut-caps-' + caps : 'cut', caps ? CUT_KINDS[caps] : 3);
}

// fluid caps: a flat quad at the cut height for every fluid cell it passes through, drawn
// only inside the cutaway
const fluidCaps = new THREE.Mesh(new THREE.BufferGeometry(), inject(new THREE.MeshBasicMaterial({ vertexColors: true }),
  fs => fs.replace('#include <clipping_planes_fragment>', 'if (cutRegion(false) < 0.5) discard;\n#include <clipping_planes_fragment>'), 'cut-fluid-cap'));
scene.add(fluidCaps);
const capColor = t => C(FLUID_LOOK[t].cap);

const tmp = new THREE.Vector3(), right = new THREE.Vector3();
let key = '', capKey = '';

// cap colours for the theme of `map`: rock is the cliff strata band at height y (as on the
// cliff walls, see walls.js), stone and wood are the theme's structure materials
function capColors(map, y) {
  const theme = themeOf(map), band = Math.max(0, Math.floor(y)), k = theme.props + ':' + band;
  if (k === capKey) return;
  capKey = k;
  const build = buildOf(theme);
  U.uCapRock.value.copy(gradient(theme.side, band / LH)).multiplyScalar(0.94);
  U.uCapStone.value.set(build.stone);
  U.uCapWood.value.set(build.wood);
}
// y = height of the cut (Infinity for none), (px, py, pz) = the point to keep visible
export function setCut(y, map, px, py, pz) {
  const on = y < CUBE_H;
  turnShape(performance.now() / 1000);
  U.uCutY.value = on ? y : 1e3;
  showGhosts(on);   // the cut-away part as glass: only drawn inside a cut (ghosts.js)
  // cave walls (and the walls of a house, inside) on the camera's side come down to a little
  // over the character
  // inside a house they go entirely, down to the floor, with what hangs on them (not the door)
  const inside = map?.interior, room = inside?.room, t = inside?.wall ?? 0;
  // (only the walls' own mesh there: not the floors, the stair or the railing beside them)
  if (room) { U.uWallBox.value.set(room.x0 - t, room.x1 + t, room.z0 - t, room.z1 + t); U.uWallBand.value = t + WALL_CUT; U.uFrontKinds.value.set(0, 1, 0, 0); }
  else { U.uWallBox.value.set(0, N, 0, N); U.uWallBand.value = 2.2; U.uFrontKinds.value.set(1, 1, 1, 1); }
  const box = U.uWallBox.value, walled = !!map?.cave || !!room;
  const cx = camera.position.x - (box.x + box.y) / 2, cz = camera.position.z - (box.z + box.w) / 2;
  U.uFront.value.set(walled && cx > 6 ? 1 : 0, walled && cx < -6 ? 1 : 0, walled && cz > 6 ? 1 : 0, walled && cz < -6 ? 1 : 0);
  // a room's walls whose inner face the camera is not beyond: no line of sight from the camera
  // into the room crosses them, so the cutaway must not open holes in them
  const cp = camera.position;
  if (room) U.uBack.value.set(cp.x < room.x1 ? 1 : 0, cp.x > room.x0 ? 1 : 0, cp.z < room.z1 ? 1 : 0, cp.z > room.z0 ? 1 : 0);
  else U.uBack.value.set(0, 0, 0, 0);
  U.uWallY.value = inside ? inside.door.y + CUT_HEIGHT : py + 1;
  camera.updateMatrixWorld();
  renderer.getDrawingBufferSize(U.uRes.value);
  U.uAspect.value = camera.aspect;
  // horizontal direction towards the camera (the camera looks down at the character)
  camera.getWorldDirection(tmp);
  const len = Math.hypot(tmp.x, tmp.z), nx = len > 1e-4 ? -tmp.x / len : 0, nz = len > 1e-4 ? -tmp.z / len : 0;
  U.uSide.value.set(nx, nz, nx * px + nz * pz);
  tmp.set(px, py, pz).project(camera);
  U.uCenter.value.set(tmp.x, tmp.y);
  // radius: project a point RADIUS to the side of the character
  right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(RADIUS).add(new THREE.Vector3(px, py, pz)).project(camera);
  U.uRadius.value = Math.hypot((right.x - tmp.x) * camera.aspect, right.y - tmp.y);
  capColors(map, on ? y : py + 1);

  const k = on ? y.toFixed(3) : 'off';
  if (k === key && map === fluidCaps.userData.map) return;
  key = k; fluidCaps.userData.map = map;
  const b = new GeoBuilder();
  if (on && map) for (const f of map.floors) {
    if (!f.fluid || f.top * LH >= y || f.surf * LH - 0.06 <= y) continue;
    b.quad([f.x, y, f.z], [f.x + 1, y, f.z], [f.x + 1, y, f.z + 1], [f.x, y, f.z + 1], [0, 1, 0], capColor(f.fluid));
  }
  fluidCaps.geometry.dispose();
  fluidCaps.geometry = b.build();
}
