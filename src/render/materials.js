// How every cube part looks (render/parts.js): one table of looks, from which the materials of
// the active cube ('full': PBR, cut, shadowed, animated) and of the low-detail proxies ('proxy':
// Lambert, darker, batched) are both made, so the two cannot disagree about what a part is.
// Also the fluids' section cap colours (section.js), splash foam (falls.js), surface motion
// (world.js) and the scrolling waterfall textures.
import * as THREE from 'three';
import { WATER, LAVA, ACID } from '../core/constants.js';
import { mulberry32 } from '../core/util.js';
import { CELL_TEX, TILE, CELLS_PER_UNIT } from './watercells.js';
import { FALL_WIDTH } from './parts.js';

// motion: bob (world units) at rate (rad/s) and phase, or an emissive pulse around base;
// fall: the sheet pouring over an edge, base / streak colours of its texture, speed of the
// streaks (texture repeats a second); glow: the texture lights itself; cells: instead of the
// texture, the cartoon look of the fluid's cells streaming down it (fallCellMaterial: veins in
// `line`, faster streaks in `light`, `flow` world units a second); cells: the surface
// drawn as drifting cartoon cells (cellMaterial) in the colour, darker swirls in `dark`, the
// gaps between them in `line`, glowing by `glow`, more opaque (lineOpacity), rising and falling
// in long slow waves by up to `swell` (world units)
export const FLUID_LOOK = {
  [WATER]: { color: 0x2c9ad8, emissive: 0x08304e, emissiveIntensity: 1, opacity: 0.7, roughness: 0.55, metalness: 0,
    cells: { dark: 0x0c7cc0, line: 0xc8f2ff, glow: 0.25, lineOpacity: 0.92, swell: 0.045 },
    cap: '#1f5d99', foam: 0xeaf6ff, motion: { bob: 0.008, rate: 1.6, phase: 0 },
    fall: { base: '#3f8fe0', streak: '#eaf7ff', emissive: 0x0a2a4a, emissiveIntensity: 1, opacity: 0.82, glow: false, speed: 1.5,
      cells: { line: 0xd6f8ff, light: 0x7cc4f2, glow: 0.3, flow: 4.5 } } },
  [LAVA]: { color: 0xff6a00, emissive: 0xff3a00, emissiveIntensity: 1.2, opacity: 1, roughness: 0.6, metalness: 0,
    cap: '#c2410a', foam: 0xffc06a, motion: { pulse: 0.3, base: 1.1, rate: 3 },
    fall: { base: '#ff5a00', streak: '#ffd27a', emissive: 0xff4a00, emissiveIntensity: 1.3, opacity: 1, glow: true, speed: 0.5 } },
  [ACID]: { color: 0x7dff3a, emissive: 0x3a9a10, emissiveIntensity: 0.8, opacity: 0.82, roughness: 0.3, metalness: 0,
    cap: '#4f9a24', foam: 0xd8ff9a, motion: { bob: 0.02, rate: 2.3, phase: 1 },
    fall: { base: '#66e030', streak: '#eaffc8', emissive: 0x2a7a10, emissiveIntensity: 1, opacity: 0.85, glow: false, speed: 1.5 } },
};

// The surroundings are drawn darker than the cube you are in: solids (and props) take this
// tint, fluids and glows this share of their colour and light.
export const PROXY = { tint: 0x5f6672, fluid: 0.6, glow: 0.6 };

// emissive strength of a surface at `time` (the active cube pulses lava; proxies too)
export function fluidGlow(t, time) {
  const L = FLUID_LOOK[t], m = L.motion;
  return m.pulse ? m.base + Math.sin(time * m.rate) * m.pulse : L.emissiveIntensity;
}

const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// detail: 'full' (the active cube) or 'proxy' (the surroundings)
export function solidMaterial(detail) {
  return detail === 'full' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    : new THREE.MeshLambertMaterial({ vertexColors: true, color: PROXY.tint });
}

export function fluidMaterial(t, detail) {
  const L = FLUID_LOOK[t], clear = L.opacity < 1;
  const common = { transparent: clear, opacity: L.opacity, depthWrite: !clear };
  if (detail === 'full') return new THREE.MeshStandardMaterial({ ...common, color: L.color, emissive: L.emissive,
    emissiveIntensity: L.emissiveIntensity, roughness: L.roughness, metalness: L.metalness });
  return new THREE.MeshLambertMaterial({ ...common, color: dim(L.color, PROXY.fluid), emissive: dim(L.emissive, PROXY.fluid),
    emissiveIntensity: L.emissiveIntensity });
}

// (a fall is one ribbon, render/parts.js fallSheets: seen from both sides)
export function fallMaterial(t, detail) {
  const F = FLUID_LOOK[t].fall, tex = F.cells ? null : fallTex[t], color = F.cells ? F.base : 0xffffff;
  const common = { map: tex, transparent: true, opacity: F.opacity, depthWrite: false, side: THREE.DoubleSide, emissiveMap: F.glow ? tex : null };
  if (detail === 'full') return new THREE.MeshStandardMaterial({ ...common, color, roughness: 0.3, emissive: F.emissive, emissiveIntensity: F.emissiveIntensity });
  return new THREE.MeshLambertMaterial({ ...common, color: dim(color, PROXY.fluid), emissive: dim(F.emissive, PROXY.fluid),
    emissiveIntensity: F.emissiveIntensity });
}

// The wind that flutters what hangs (prayer flags): its time, advanced by render/world.js
export const WIND = { value: 0 };

// a solid's material that swings each vertex with the wind as far as its uv's u says (0: fixed,
// 1: the hanging end), along a gusty wind across the cube, rippling with the place it is at.
// scale: the part's position units (render/parts.js packs positions in units of the cube's scale)
export function swayMaterial(mat, scale) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    sh.uniforms.uWind = WIND;
    sh.uniforms.uSwayScale = { value: scale };
    sh.vertexShader = 'uniform float uWind, uSwayScale;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 wp = position.xyz * uSwayScale;
        float ph = uWind * 4.2 + wp.x * 2.9 + wp.z * 2.3 - wp.y * 1.3, gust = 0.75 + 0.25 * sin(uWind * 0.7 + wp.x * 0.2);
        vec3 push = vec3(0.62, 0.12, 0.78) * (sin(ph) * 0.045 + sin(ph * 2.3 + 1.7) * 0.018) * gust;
        transformed += push * uv.x / uSwayScale;
      }`);
  };
  mat.customProgramCacheKey = () => key + '-sway';
  return mat;
}

// The cartoon look of a fluid's surface (FLUID_LOOK cells), like Wind Waker's sea: on its top,
// rounded cells that wander and change shape, light gaps between them, darker swirls inside;
// its sides keep the plain colour. The pattern is drawn once a frame into a tiling texture
// (watercells.js); here it is only looked up (through a slow wobble that hides the tiling) and
// thresholded. It is laid out in the cube's own coordinates (the position attribute, in units
// of the part's scale), so it stays put when the cubes slide during travel and matches between
// a cube and its proxy. A chained shader edit like swayMaterial (after the cut's inject). The
// colours go in as ratios to the material's own, so the proxies' darker fluids stay as much darker.
// the swell at p (the cube's coordinates, world units) at time tm: -1..1, times cells.swell
// (also what rides on the water: render/falls.js)
export const SWELL = `
  float swell(vec2 p, float tm) {
    return 0.5 * sin(dot(p, vec2(0.55, 0.3)) + tm * 1.1) + 0.3 * sin(dot(p, vec2(-0.25, 0.62)) + tm * 0.83 + 1.3)
      + 0.2 * sin(dot(p, vec2(0.8, -0.45)) + tm * 1.47 + 2.1);
  }
`;
export function cellMaterial(mat, t) {
  const S = FLUID_LOOK[t].cells;
  if (!S) return mat;
  const base = new THREE.Color(FLUID_LOOK[t].color), ratio = hex => new THREE.Color(hex).multiply(new THREE.Color(1 / base.r, 1 / base.g, 1 / base.b));
  const uniforms = { uCellTime: WIND, uCellTex: CELL_TEX, uCellDark: { value: ratio(S.dark) },
    uCellLine: { value: ratio(S.line) }, uCellGlow: { value: S.glow }, uCellOpacity: { value: S.lineOpacity } };
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    Object.assign(sh.uniforms, uniforms);
    // the cube's own coordinates in texture tiles (the matrix's scale is the part's)
    const tile = (TILE / CELLS_PER_UNIT).toFixed(4);
    // the swell: whole columns rise and fall together (a few long, slow sines over the cube), so
    // the sides of the fluid's boxes keep meeting; the matrix's scale y undone (the trial's water
    // is scaled to its depth)
    sh.vertexShader = 'uniform float uCellTime;\nvarying vec2 vCellP;\nvarying vec3 vCellN;\nvarying float vCellWave;\n' + SWELL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #if defined(USE_BATCHING)
          mat4 cellM = modelMatrix * batchingMatrix;
        #else
          mat4 cellM = modelMatrix;
        #endif
        vec2 cw = position.xz * length(cellM[0].xyz);
        vCellWave = swell(cw, uCellTime);
        transformed.y += vCellWave * ${S.swell.toFixed(3)} / length(cellM[1].xyz);
        vCellP = cw / ${tile};
        vCellN = normal;
      }`);
    sh.fragmentShader = 'varying vec2 vCellP;\nvarying vec3 vCellN;\nvarying float vCellWave;\nuniform float uCellTime, uCellGlow, uCellOpacity;\nuniform vec3 uCellDark, uCellLine;\nuniform sampler2D uCellTex;\n'
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float cellLine = 0.0;
      {
        float top = smoothstep(0.6, 0.9, abs(normalize(vCellN).y)), tm = uCellTime;
        vec2 p = vCellP;
        p += 0.012 * vec2(sin(p.y * 1.7 + tm * 0.21) + sin(p.y * 4.3 - p.x * 1.1), sin(p.x * 1.9 - tm * 0.17) + sin(p.x * 3.7 + p.y * 1.3));
        vec4 c = texture2D(uCellTex, p);
        float aa = fwidth(c.r) * 0.7 + 1e-3, aa2 = fwidth(c.g) * 0.7 + 1e-3;
        cellLine = smoothstep(0.5 - aa, 0.5 + aa, c.r) * top;
        // inside the cells only (well away from the gaps)
        float dark = smoothstep(0.5 - aa2, 0.5 + aa2, c.g) * c.b * smoothstep(0.44, 0.32, c.r) * top;
        diffuseColor.rgb *= mix(mix(vec3(1.0), uCellDark, dark), uCellLine, cellLine) * (1.0 + 0.07 * vCellWave * top);
        diffuseColor.a = mix(diffuseColor.a, uCellOpacity, cellLine);
      }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * cellLine * uCellGlow;`);
  };
  mat.customProgramCacheKey = () => key + '-cells';
  return mat;
}

// A fall in the cartoon look (FLUID_LOOK fall.cells): the fluid's cells (watercells.js),
// stretched long, stream down it as white veins, fainter light streaks faster over them; its
// sides are eaten away in a wobble with a white rim, a band of foam where it curls over the lip
// (its lower edge ragged), and it fades in where it leaves the pool. The sheet ripples a little
// (along its normal). By its uvs (render/parts.js fallSheets), so the proxies' falls flow alike.
// A chained shader edit (after the cut's inject), colours as ratios like cellMaterial's.
export function fallCellMaterial(mat, t) {
  const F = FLUID_LOOK[t].fall, S = F.cells;
  if (!S) return mat;
  const base = new THREE.Color(F.base), ratio = hex => new THREE.Color(hex).multiply(new THREE.Color(1 / base.r, 1 / base.g, 1 / base.b));
  const uniforms = { uCellTime: WIND, uCellTex: CELL_TEX, uFallLine: { value: ratio(S.line) }, uFallLight: { value: ratio(S.light) },
    uFallGlow: { value: S.glow } };
  const T = (TILE / CELLS_PER_UNIT).toFixed(4), W = FALL_WIDTH.toFixed(3), V = '0.7';
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'uniform float uCellTime;\nvarying vec2 vFallUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #if defined(USE_BATCHING)
          float fallS = length((modelMatrix * batchingMatrix)[0].xyz);
        #else
          float fallS = length(modelMatrix[0].xyz);
        #endif
        vFallUv = uv;
        float s = uv.y / ${V};
        transformed += normal * 0.022 * sin(s * 2.6 - uCellTime * 9.0 + uv.x * 2.0) * smoothstep(0.3, 0.9, s) / fallS;
      }`);
    sh.fragmentShader = 'uniform float uCellTime, uFallGlow;\nuniform vec3 uFallLine, uFallLight;\nuniform sampler2D uCellTex;\nvarying vec2 vFallUv;\n'
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float fallWhite = 0.0;
      {
        float u = vFallUv.x, s = vFallUv.y / ${V}, tm = uCellTime;
        // the sides, eaten away in a wobble
        float e = min(u, 1.0 - u) * ${W}, side = u < 0.5 ? 0.0 : 1.7;
        float cut = 0.02 + 0.018 * sin(s * 9.0 - tm * 7.0 + side) + 0.012 * sin(s * 23.0 - tm * 11.0 + side * 2.3);
        if (e < cut) discard;
        float ae = fwidth(e) + 1e-4, rim = 1.0 - smoothstep(cut + 0.05 - ae, cut + 0.05 + ae, e);
        // the cells, stretched long, streaming down; faster streaks over them
        vec4 c1 = texture2D(uCellTex, vec2(u * ${W} * 1.3 / ${T}, (s - tm * ${S.flow.toFixed(2)}) * 0.3 / ${T}));
        vec4 c2 = texture2D(uCellTex, vec2(u * ${W} * 2.0 / ${T} + 0.31, (s - tm * ${(S.flow * 1.6).toFixed(2)}) * 0.18 / ${T} + 0.53));
        float a1 = fwidth(c1.r) * 0.7 + 1e-3, a2 = fwidth(c2.g) * 0.7 + 1e-3;
        float vein = smoothstep(0.5 - a1, 0.5 + a1, c1.r), streak = smoothstep(0.5 - a2, 0.5 + a2, c2.g) * c2.b;
        // foam where it curls over the lip, its lower edge ragged
        float lipEdge = 0.62 + 0.07 * sin(u * 17.0 + tm * 3.0) + 0.04 * sin(u * 31.0 - tm * 5.0), al = fwidth(s) + 1e-4;
        float lip = smoothstep(0.18, 0.28, s) * (1.0 - smoothstep(lipEdge - al, lipEdge + al, s));
        fallWhite = max(max(vein, rim), lip);
        diffuseColor.rgb *= mix(mix(vec3(1.0), uFallLight, streak * 0.7), uFallLine, fallWhite);
        diffuseColor.a = mix(diffuseColor.a, 0.95, fallWhite) * smoothstep(0.0, 0.22, s);
      }`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * fallWhite * uFallGlow;`);
  };
  mat.customProgramCacheKey = () => key + '-fallcells';
  return mat;
}

// the cartoon looks a part's material gets after its cut (cellMaterial, fallCellMaterial)
export function fluidLook(mat, part) {
  return part.kind === 'fluid' ? cellMaterial(mat, part.fluid) : part.kind === 'fall' ? fallCellMaterial(mat, part.fluid) : mat;
}

// part: an entry of render/parts.js PARTS
export function partMaterial(part, detail) {
  if (part.kind === 'solid') return solidMaterial(detail);
  if (part.kind === 'fluid') return fluidMaterial(part.fluid, detail);
  return fallMaterial(part.fluid, detail);
}

// streaky textures for falling fluids (offset scrolled every frame, scrollFalls)
function makeFallTex(base, streak) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d'), R = mulberry32(7);
  g.fillStyle = base; g.fillRect(0, 0, 32, 64);
  g.fillStyle = streak;
  for (let i = 0; i < 46; i++) {
    g.globalAlpha = 0.2 + R() * 0.55;
    const x = Math.floor(R() * 32), y = Math.floor(R() * 64), w = 1 + Math.floor(R() * 2), h = 6 + Math.floor(R() * 22);
    g.fillRect(x, y, w, h); g.fillRect(x, y - 64, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const fallTex = Object.fromEntries(Object.entries(FLUID_LOOK).map(([t, L]) => [t, makeFallTex(L.fall.base, L.fall.streak)]));
// shared by every cube and proxy: their falls stream at once
export function scrollFalls(dt) {
  for (const [t, tex] of Object.entries(fallTex)) tex.offset.y -= dt * FLUID_LOOK[t].fall.speed;   // (v runs down the sheet)
}
