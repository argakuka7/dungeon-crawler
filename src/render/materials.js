// How every cube part looks (render/parts.js): one table of looks, from which the materials of
// the active cube ('full': PBR, cut, shadowed, animated) and of the low-detail proxies ('proxy':
// Lambert, darker, batched) are both made, so the two cannot disagree about what a part is.
// Also the fluids' section cap colours (section.js), splash foam (falls.js), surface motion
// (world.js) and the scrolling waterfall textures.
import * as THREE from 'three';
import { WATER, LAVA, ACID } from '../core/constants.js';
import { mulberry32 } from '../core/util.js';

// motion: bob (world units) at rate (rad/s) and phase, or an emissive pulse around base;
// fall: the sheet pouring over an edge, base / streak colours of its texture, speed of the
// streaks (texture repeats a second); glow: the texture lights itself
export const FLUID_LOOK = {
  [WATER]: { color: 0x2e86de, emissive: 0x0a2a4a, emissiveIntensity: 1, opacity: 0.72, roughness: 0.15, metalness: 0.1,
    cap: '#1f5d99', foam: 0xeaf6ff, motion: { bob: 0.025, rate: 1.6, phase: 0 },
    fall: { base: '#3f8fe0', streak: '#eaf7ff', emissive: 0x0a2a4a, emissiveIntensity: 1, opacity: 0.85, glow: false, speed: 1.5 } },
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

export function fallMaterial(t, detail) {
  const F = FLUID_LOOK[t].fall;
  const common = { map: fallTex[t], transparent: true, opacity: F.opacity, depthWrite: false, emissiveMap: F.glow ? fallTex[t] : null };
  if (detail === 'full') return new THREE.MeshStandardMaterial({ ...common, roughness: 0.3, emissive: F.emissive, emissiveIntensity: F.emissiveIntensity });
  return new THREE.MeshLambertMaterial({ ...common, color: dim(0xffffff, PROXY.fluid), emissive: dim(F.emissive, PROXY.fluid),
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
  for (const [t, tex] of Object.entries(fallTex)) tex.offset.y += dt * FLUID_LOOK[t].fall.speed;
}
