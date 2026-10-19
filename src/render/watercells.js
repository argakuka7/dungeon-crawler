// The cartoon fluids' patterns (materials.js cellMaterial), drawn once a frame into small tiling
// textures instead of for every pixel of fluid on screen, one for each look (CELLS):
//   water: rounded cells whose centres wander (so they swell, shrink and change shape), wobbly
//     outlines, gaps of varying width between them, and a finer, faster pattern of darker
//     swirls inside, broken up
//     r: the gaps, as a distance field around 0.5 (over: in a gap; the shader thresholds it,
//     sharp at any zoom), g: the swirls the same way, b: where the swirls are not broken up (0..1)
//   crust (lava): big, slow, soft cells of molten rock, and blotches of dark crust on it that
//     grow, drift a little and melt away again
//     r: how far into its cell (0 at the edge, 1 in the middle; the shader bands it), g: the
//     crust as a distance field around 0.5, b: each cell's own tone (0..1)
//   sludge (acid): water's cells, slower and thicker, with bubbles rising and popping
//     r, g, b like water's, a: the bubbles' rings as a distance field around 0.5
// Everything in them repeats every `tile` cells (the hashes and noises wrap at whole periods), so
// the textures tile seamlessly. A look's texture is drawn only while something showed it lately
// (its materials' onBeforeRender: useCells).
import * as THREE from 'three';
import { renderer } from './scene.js';

const SIZE = 512;   // texels

const COMMON = `
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
    // the water's cells and swirls at p (tile T), time tm: r, g, b (see above)
    vec3 cells(vec2 p, float T, float tm, float gap) {
      // a slow wobble of the whole pattern, so the outlines are never straight (11 / T: the noise
      // repeats 11 times a tile)
      vec2 s = p * (11.0 / T);
      p += vec2(noise(s + tm * 0.13, 11.0), noise(s - tm * 0.11 + 7.0, 11.0)) * 0.55;
      float b = border(p + vec2(tm * 0.05, tm * 0.03), T, tm * 0.55, 0.14);
      float w = gap + 0.035 * noise(p * (28.0 / T) + tm * 0.2, 28.0);
      // the swirls: borders of a finer (20 a tile), faster pattern, thick, broken up
      vec2 r = p * (17.0 / T);
      vec2 q = p * (20.0 / T) + vec2(noise(r - tm * 0.17, 17.0), noise(r + tm * 0.15 + 3.0, 17.0)) * 0.7;
      float b2 = border(q - vec2(tm * 0.04, tm * 0.06), 20.0, tm * 0.8 + 2.0, 0.3);
      float keep = smoothstep(0.38, 0.52, noise(q * (16.0 / 20.0) + 11.0, 16.0));
      return vec3(clamp(0.5 - (b - w) * 2.0, 0.0, 1.0), clamp(0.5 + (0.13 - b2) * 2.0, 0.0, 1.0), keep);
    }
`;

// tile: cells a texture spans; perUnit: cells a world unit
const STYLES = {
  water: { tile: 12, perUnit: 1.6, main: `
    void main() {
      float T = 12.0;
      gl_FragColor = vec4(cells(vUv * T, T, uTime, 0.045), 1.0);
    }` },
  crust: { tile: 8, perUnit: 0.9, main: `
    // the cell a point is in: its hash (the same cells as border's)
    float cellTone(vec2 x, float per, float t) {
      vec2 n = floor(x), f = fract(x);
      float md = 8.0, id = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j)), o = 0.5 + 0.38 * sin(t + 6.2831 * hash2(mod(n + g, per))), r = g + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; id = hash2(mod(n + g, per) + 5.3).x; }
      }
      return id;
    }
    // blotches of crust: some of the points of a lattice (P a tile) grow one, lumpy, drifting a
    // little, and let it melt away again (radius r0..r1, the big ones rarer); a distance field
    // round 0.5 (over: crust)
    float blobs(vec2 q, float P, float t, float chance, float r0, float r1) {
      vec2 n = floor(q), f = fract(q);
      float v = -1.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j)), cell = mod(n + g, P), h = hash2(cell), h2 = hash2(cell + 9.1);
        if (h.x > chance) continue;
        float ph = fract(t * (0.035 + 0.05 * h.y) + h2.x * 7.0);
        float life = smoothstep(0.0, 0.3, ph) * (1.0 - smoothstep(0.6, 1.0, ph));
        vec2 at = g + 0.25 + 0.5 * h2 + 0.1 * vec2(sin(t * 0.3 + h.y * 6.28), cos(t * 0.27 + h.x * 6.28));
        vec2 d = f - at;
        float a = atan(d.y, d.x), wob = 0.2 * sin(a * 3.0 + h2.y * 6.28 + t * 0.2) + 0.1 * sin(a * 5.0 + h.x * 6.28 - t * 0.15);
        v = max(v, mix(r0, r1, h2.y * h2.y) * life * (1.0 + wob) - length(d));
      }
      return clamp(0.5 + v * 4.0, 0.0, 1.0);
    }
    void main() {
      float T = 8.0, tm = uTime * 0.18;
      vec2 p = vUv * T, s = p;
      p += vec2(noise(s + tm * 0.13, 8.0), noise(s - tm * 0.11 + 7.0, 8.0)) * 0.35;
      vec2 q = p + vec2(tm * 0.05, tm * 0.03);
      float b = border(q, T, tm * 0.55, 0.3);
      float spots = max(blobs(vUv * 9.0, 9.0, uTime, 0.55, 0.14, 0.46), blobs(vUv * 23.0 + 0.37, 23.0, uTime * 1.3, 0.3, 0.1, 0.3));
      gl_FragColor = vec4(clamp(b / 0.42, 0.0, 1.0), spots, cellTone(q, T, tm * 0.55), 1.0);
    }` },
  sludge: { tile: 12, perUnit: 1.3, main: `
    void main() {
      float T = 12.0, P = 18.0;
      vec3 c = cells(vUv * T, T, uTime * 0.55, 0.06);
      // bubbles: some of the points of a lattice (P a tile) blow one up, round and round
      vec2 q = vUv * P, n = floor(q), f = fract(q);
      float a = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j)), h = hash2(mod(n + g, P));
        if (h.x > 0.26) continue;
        float ph = fract(uTime * (0.25 + 0.3 * h.y) + h.x * 9.0);
        vec2 at = g + 0.3 + 0.4 * hash2(mod(n + g, P) + 3.7);
        float rad = mix(0.05, 0.38, sqrt(ph)), wid = 0.06 * (1.0 - ph) + 0.02, d = length(f - at);
        a = max(a, clamp(0.5 + (wid - abs(d - rad)) * 5.0, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, ph)));
      }
      gl_FragColor = vec4(c, a);
    }` },
};

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
const bakeScene = new THREE.Scene(), bakeCamera = new THREE.Camera();
bakeScene.add(quad);

// per look: { tex (uniform), tile, perUnit, used (the frame it was last shown in) }
export const CELLS = {};
for (const [name, s] of Object.entries(STYLES)) {
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: COMMON + s.main,
  });
  CELLS[name] = { tex: { value: target.texture }, tile: s.tile, perUnit: s.perUnit, used: -Infinity, target, material };
}
// (the water's, for what rides on it: render/falls.js)
export const CELL_TEX = CELLS.water.tex, TILE = CELLS.water.tile, CELLS_PER_UNIT = CELLS.water.perUnit;

// a material that shows a look's pattern: drawn while it is shown (and the frame after)
let frame = 0;
export function useCells(mat, style) {
  const before = mat.onBeforeRender;
  mat.onBeforeRender = (...args) => { CELLS[style].used = frame; before?.apply(mat, args); };
  return mat;
}

// draw the patterns at `time` (once a frame, before the scene): those shown lately, and all of
// them the first time
let last = null;
export function bakeCells(time) {
  if (time === last) return;
  const first = last === null;
  last = time;
  frame++;
  const prev = renderer.getRenderTarget();
  for (const c of Object.values(CELLS)) {
    if (!first && frame - c.used > 2) continue;
    c.material.uniforms.uTime.value = time;
    quad.material = c.material;
    renderer.setRenderTarget(c.target);
    renderer.render(bakeScene, bakeCamera);
  }
  renderer.setRenderTarget(prev);
}
