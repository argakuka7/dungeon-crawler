// Where falls land: splash rings, and point lights over lava. The sheets themselves are part of
// the cube's geometry (render/parts.js), drawn by the cube and its proxy alike.
import * as THREE from 'three';
import { N, LH, LAVA, DIRS } from '../core/constants.js';
import { FLUID_LOOK, swellGLSL, WIND } from './materials.js';
import { CELLS, useCells } from './watercells.js';
import { paletteOf } from './fluidpal.js';
import { palRow } from '../themes/fluids.js';
import { cutMaterial } from './section.js';
import { FALL_WIDTH } from './parts.js';

// What rides on the water where a cartoon fall lands (FLUID_LOOK rides): a crown of foam
// round the foot of the sheet, its top edge in peaks that rise and fall, and on the pool a ragged
// patch of foam with arcs of ripples spreading from it downstream, breaking up and fading as they
// go, and a trail of foam streaming off downstream, spreading and thinning out. In the cube's
// coordinates, rising and falling with the pool's swell (materials.js), in the foam colour of
// the pool's palette (render/fluidpal.js), its pattern the fluid's (watercells.js CELLS).
// (rides edits a cut material: the cut's inject replaces what was there before it)
const TAU = Math.PI * 2;
function rides(mat, name, S, style, fragment) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  useCells(mat, style);
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    sh.uniforms.uCellTime = WIND; sh.uniforms.uCellTex = CELLS[style].tex;
    sh.vertexShader = 'uniform float uCellTime;\nvarying vec2 vRideUv;\nvarying vec2 vRideP;\n' + swellGLSL(S) + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vRideUv = uv; vRideP = position.xz;
      transformed.y += swellY(position.xz, uCellTime);`);
    sh.fragmentShader = 'uniform float uCellTime;\nuniform sampler2D uCellTex;\nvarying vec2 vRideUv;\nvarying vec2 vRideP;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float tm = uCellTime; ${fragment} }`);
  };
  mat.customProgramCacheKey = () => key + '-' + name + '-' + style;   // (programs are shared by key)
  return mat;
}
function foamCrown(cx, y, cz, dx, foam, S, style) {
  // an open ring, wide across the sheet, shallow out from the cliff; u round it, v up
  const g = new THREE.CylinderGeometry(1, 1, 0.42, 28, 1, true).translate(0, 0.21, 0);
  g.scale(dx ? 0.36 : FALL_WIDTH * 0.62, 1, dx ? FALL_WIDTH * 0.62 : 0.36).translate(cx, y - 0.06, cz);
  const mat = rides(cutMaterial(new THREE.MeshBasicMaterial({ color: foam, transparent: true, depthWrite: false, side: THREE.DoubleSide })), 'crown', S, style, `
    float u = vRideUv.x * ${TAU.toFixed(4)}, v = vRideUv.y;
    float peak = 0.3 + 0.7 * (0.5 + 0.5 * sin(u * 9.0 + tm * 4.0)) * (0.6 + 0.4 * sin(u * 5.0 - tm * 2.7 + 1.0));
    float av = fwidth(v) + 1e-4;
    diffuseColor.a = 1.0 - smoothstep(peak - av, peak + av, v);
    diffuseColor.rgb *= mix(vec3(0.78, 0.9, 1.0), vec3(1.0), smoothstep(0.1, 0.35, v));
    if (diffuseColor.a < 0.01) discard;`);
  return new THREE.Mesh(g, mat);
}
const TRAIL = 4.5;   // world units the foam streams off downstream
function ripples(cx, y, cz, dx, dz, foam, S, style) {
  // from R behind the foot to TRAIL downstream, R to either side
  const R = 1.45, along = R + TRAIL, mid = (TRAIL - R) / 2;
  const g = new THREE.PlaneGeometry(dx ? along : R * 2, dx ? R * 2 : along, dx ? 12 : 6, dx ? 6 : 12).rotateX(-Math.PI / 2)
    .translate(cx + dx * mid, y, cz + dz * mid);
  const T = (CELLS[style].tile / CELLS[style].perUnit).toFixed(4);
  const mat = rides(cutMaterial(new THREE.MeshBasicMaterial({ color: foam, transparent: true, depthWrite: false })), 'ripples', S, style, `
    vec2 d = vRideP - vec2(${cx.toFixed(3)}, ${cz.toFixed(3)}), dir = vec2(${dx.toFixed(1)}, ${dz.toFixed(1)});
    float r = length(d), ang = atan(d.y, d.x), down = dot(d / max(r, 1e-3), dir);
    float ar = fwidth(r) + 1e-4;
    // the trail: the cells' gaps stretched along the stream, flowing off, spreading and thinning
    float al = dot(d, dir), ac = dot(d, vec2(-dir.y, dir.x));
    vec4 c = texture2D(uCellTex, vec2(ac * 0.9 / ${T}, (al - tm * 1.1) * 0.35 / ${T}) + 0.41);
    float wide = 0.35 + al * 0.22, at = fwidth(c.r) * 0.7 + 1e-3;
    float trail = smoothstep(0.5 - at, 0.5 + at, c.r + 0.12 * smoothstep(1.2, 0.3, al))
      * smoothstep(0.2, 0.6, al) * smoothstep(${TRAIL.toFixed(1)}, 1.2, al) * smoothstep(wide, wide * 0.6, abs(ac));
    // the foam where it lands
    float a = trail;
    a = max(a, 1.0 - smoothstep(0.42 - ar, 0.42 + ar, r + 0.06 * sin(ang * 6.0 + tm * 3.0) + 0.03 * sin(ang * 13.0 - tm * 5.0)));
    // the arcs, downstream (and a little round the sides), broken up, thinning and fading as they spread
    for (int i = 0; i < 3; i++) {
      float fi = float(i), ph = fract(tm * 0.55 + fi / 3.0), rad = 0.45 + ph * 0.9, wid = 0.045 * (1.0 - ph) + 0.012;
      float band = 1.0 - smoothstep(wid - ar, wid + ar, abs(r + 0.04 * sin(ang * 7.0 + fi * 2.0 + tm) - rad));
      float broken = smoothstep(0.15, 0.3, 0.5 + 0.5 * sin(ang * 3.0 + fi * 1.7 + ph * 2.0));
      a = max(a, band * broken * smoothstep(-0.35, 0.15, down) * (1.0 - ph * ph));
    }
    diffuseColor.a = a;
    if (a < 0.01) discard;`);
  return new THREE.Mesh(g, mat);
}

// a splash ring where a fall lands (render/parts.js fallSheets has the sheet), or the cartoon
// foam and ripples
export function buildFalls(m, group) {
  const splashes = [], lights = [];
  for (const f of m.falls) {
    const [dx, dz] = DIRS[f.d], bx = f.c % N, bz = (f.c / N) | 0;
    const yTop = f.top * LH - 0.04, yBot = f.bot * LH - 0.08, h = yTop - yBot;
    const ex = dx > 0 ? bx : dx < 0 ? bx + 1 : bx + 0.5, ez = dz > 0 ? bz : dz < 0 ? bz + 1 : bz + 0.5;
    if (f.out) continue;   // pours out through the bottom of the cube: no splash here
    const L = FLUID_LOOK[f.type], pal = paletteOf(f.pal?.[1] ?? palRow(m.depth ?? 0, f.type, 0)), foam = pal.hex.foam, cells = L.cells;
    if (L.rides) {
      // the pool's surface (render/floors.js fluidVolume) and the foot of the sheet (parts.js)
      const surf = f.bot * LH - 0.06, cx = ex + dx * 0.32, cz = ez + dz * 0.32;
      const crown = foamCrown(cx, surf, cz, dx, foam, cells, L.style), rip = ripples(cx, surf + 0.015, cz, dx, dz, foam, cells, L.style);
      crown.renderOrder = 10 * f.layer + 5; rip.renderOrder = 10 * f.layer + 4;
      group.add(crown, rip);
      continue;
    }
    const splash = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.05, 14),
      cutMaterial(new THREE.MeshBasicMaterial({ color: foam, transparent: true, opacity: 0.55, depthWrite: false })));
    splash.position.set(ex + dx * 0.3, yBot + 0.06, ez + dz * 0.3);
    splash.renderOrder = 10 * f.layer + 4;
    group.add(splash); splashes.push(splash);
    if (f.type === LAVA) {
      const l = new THREE.PointLight(lavaGlow(pal), 6, 6, 2);
      l.position.set(ex + dx * 0.6, yBot + h * 0.4, ez + dz * 0.6);
      lights.push(l); group.add(l);
    }
  }
  return { splashes, lights };
}

// the light lava gives off: its palette's glow, a little towards the classic orange
const lavaGlow = pal => new THREE.Color().setRGB(...pal.emissive).lerp(new THREE.Color(0xff5a1a), 0.4);
// a few glows over lava bodies (at most 4 lights in total)
export function lavaLights(m, group, lights) {
  for (const f of m.floors) {
    if (f.fluid !== LAVA) continue;
    const x = f.x + 0.5, z = f.z + 0.5, y = f.surf * LH + 0.7;
    if (lights.some(l => Math.hypot(l.position.x - x, l.position.z - z, l.position.y - y) < 4) || lights.length >= 4) continue;
    const l = new THREE.PointLight(lavaGlow(paletteOf(f.pal ?? palRow(m.depth ?? 0, LAVA, 0))), 6, 6, 2);
    l.position.set(x, y, z);
    lights.push(l); group.add(l);
  }
}
