// Dissolving whole cubes in and out: every material in a cube gets an ordered-dither discard
// driven by the cube's fade value (1 = solid, 0 = gone). Dithering instead of transparency
// keeps depth writes and sorting intact. Materials must not be shared between cubes.
// Inverted, a group draws exactly the pixels a normal group with the same value drops: two
// versions of one cube cross-fade without gaps or overlap.
// learn: drawing.html#shader-code (see learn/README.md)
const DITHER = `
  if (uFade < 0.999 || uFadeInv > 0.5 || uRangeFade < 0.999) {
    const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    float threshold = (B[q.x + q.y * 4] + 0.5) / 16.0;
    bool keep = threshold < uFade;
    if (keep == (uFadeInv > 0.5) || threshold >= uRangeFade) discard;
  }`;
// the same test on other GLSL values: the batched proxies keep their fades per instance, not in
// materials of their own (render/neighbors.js, render/glass.js)
export const dither = (fade, inv, range) => DITHER.replaceAll('uFadeInv', inv).replaceAll('uRangeFade', range).replaceAll('uFade', fade);

function patch(mat, u, inv, range) {
  if (mat.userData.fadeU) return;
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uFade = u; sh.uniforms.uFadeInv = inv; sh.uniforms.uRangeFade = range;
    sh.fragmentShader = 'uniform float uFade, uFadeInv, uRangeFade;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + DITHER);
  };
  mat.customProgramCacheKey = () => key + '|fade';
  mat.userData.fadeU = u;
  mat.needsUpdate = true;
}

export function makeFadable(group, value = 1) {
  const u = { value }, inv = { value: 0 }, range = { value: 1 };
  group.userData.fadeU = u; group.userData.fadeInv = inv; group.userData.rangeFadeU = range;
  group.traverse(o => { if (o.material) for (const m of [].concat(o.material)) patch(m, u, inv, range); });
  setFade(group, value);
}

// a part added to an already fadable cube later (the town portal) fades along with it
export function adoptFade(group, obj) {
  const { fadeU: u, fadeInv: inv, rangeFadeU: range } = group.userData;
  if (u) obj.traverse(o => { if (o.material) for (const m of [].concat(o.material)) patch(m, u, inv, range); });
}

// Distance fading is independent of travel's complementary dissolve.
export function setRangeFade(group, value) { group.userData.rangeFadeU.value = value; }

// faded-out parts stop casting shadows halfway through; invert: show what `f` would hide
export function setFade(group, f, invert = false) {
  const shown = invert ? 1 - f : f;
  group.userData.fade = shown;
  group.userData.fadeU.value = f;
  group.userData.fadeInv.value = invert ? 1 : 0;
  group.visible = shown > 0.002;
  const cast = shown > 0.5;
  if (group.userData.cast !== cast) {
    group.userData.cast = cast;
    group.traverse(o => { if (o.isMesh) { if (o.userData.cast0 === undefined) o.userData.cast0 = o.castShadow; o.castShadow = cast && o.userData.cast0; } });
  }
}
