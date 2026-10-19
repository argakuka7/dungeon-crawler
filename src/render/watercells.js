// The cartoon water's pattern (materials.js cellMaterial), drawn once a frame into a small tiling
// texture instead of for every pixel of water on screen: rounded cells whose centres wander (so
// they swell, shrink and change shape), wobbly outlines, gaps of varying width between them, and
// a finer, faster pattern of darker swirls inside, broken up. Everything in it repeats every TILE
// cells (the hashes and noises wrap at whole periods), so the texture tiles seamlessly.
//   r: the gaps, as a distance field around 0.5 (over: in a gap; the shader thresholds it, sharp
//      at any zoom), g: the swirls the same way, b: where the swirls are not broken up (0..1)
import * as THREE from 'three';
import { renderer } from './scene.js';

export const TILE = 12;          // cells the texture spans
export const CELLS_PER_UNIT = 1.6;
const SIZE = 512;                // texels

const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
  depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true,
});
export const CELL_TEX = { value: target.texture };

const material = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }
    // value noise repeating every \`per\` lattice steps
    float noise(vec2 p, float per) {
      vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      float a = hash2(mod(i, per)).x, b = hash2(mod(i + vec2(1, 0), per)).x;
      float c = hash2(mod(i + vec2(0, 1), per)).x, d = hash2(mod(i + vec2(1, 1), per)).x;
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    // distance to the nearest cell border (cells repeating every \`per\`), rounded at the corners
    // (smooth minimum: k); the centres wander with t
    float border(vec2 x, float per, float t, float k) {
      vec2 n = floor(x), f = fract(x), mg = vec2(0.0), mr = vec2(0.0);
      float md = 8.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j)), o = 0.5 + 0.38 * sin(t + 6.2831 * hash2(mod(n + g, per))), r = g + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; mr = r; mg = g; }
      }
      md = 8.0;
      for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        vec2 g = mg + vec2(float(i), float(j)), o = 0.5 + 0.38 * sin(t + 6.2831 * hash2(mod(n + g, per))), r = g + o - f;
        if (dot(mr - r, mr - r) > 1e-5) {
          float d = dot(0.5 * (mr + r), normalize(r - mr)), h = clamp(0.5 + 0.5 * (d - md) / k, 0.0, 1.0);
          md = mix(d, md, h) - k * h * (1.0 - h);
        }
      }
      return md;
    }
    void main() {
      float tm = uTime, T = ${TILE.toFixed(1)};
      vec2 p = vUv * T;
      // a slow wobble of the whole pattern, so the outlines are never straight (11 / T: the noise
      // repeats 11 times a tile)
      vec2 s = p * (11.0 / T);
      p += vec2(noise(s + tm * 0.13, 11.0), noise(s - tm * 0.11 + 7.0, 11.0)) * 0.55;
      float b = border(p + vec2(tm * 0.05, tm * 0.03), T, tm * 0.55, 0.14);
      float w = 0.045 + 0.035 * noise(p * (28.0 / T) + tm * 0.2, 28.0);
      // the swirls: borders of a finer (20 a tile), faster pattern, thick, broken up
      vec2 r = p * (17.0 / T);
      vec2 q = p * (20.0 / T) + vec2(noise(r - tm * 0.17, 17.0), noise(r + tm * 0.15 + 3.0, 17.0)) * 0.7;
      float b2 = border(q - vec2(tm * 0.04, tm * 0.06), 20.0, tm * 0.8 + 2.0, 0.3);
      float keep = smoothstep(0.38, 0.52, noise(q * (16.0 / 20.0) + 11.0, 16.0));
      gl_FragColor = vec4(clamp(0.5 - (b - w) * 2.0, 0.0, 1.0), clamp(0.5 + (0.13 - b2) * 2.0, 0.0, 1.0), keep, 1.0);
    }`,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
quad.frustumCulled = false;
const bakeScene = new THREE.Scene(), bakeCamera = new THREE.Camera();
bakeScene.add(quad);

// draw the pattern at `time` (once a frame, before the scene)
let last = null;
export function bakeCells(time) {
  if (time === last) return;
  last = time;
  material.uniforms.uTime.value = time;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(bakeScene, bakeCamera);
  renderer.setRenderTarget(prev);
}
