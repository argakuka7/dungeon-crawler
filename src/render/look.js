// How dark it is: sky, hemisphere light, sun, fog and the character's own light follow the
// (fractional) depth, blended between the starts of the world's theme stretches. Below the
// ground the character's light grows with the theme's `lamp` (about half in the sunlit caves,
// full in the dark deep), since local lights are all there is. A boss can make it night
// (`dark`).
import * as THREE from 'three';
import { scene, hemi, sun } from './scene.js';
import { setSkyLook } from './sky.js';
import { character } from './character.js';
import { lightAt, lampAt } from '../themes/depth.js';
import { TOWN } from '../themes/index.js';

const ca = new THREE.Color(), cb = new THREE.Color();
const mix = (a, b, t) => ca.set(a).lerp(cb.set(b), t);
const lerp = (a, b, t) => a + (b - a) * t;
const sky = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
// sky: [top, bottom, haze, tint]; haze and tint default to top and bottom
const skyStop = (s, i) => s[i] ?? s[i - 2];

// no world yet (the menu before its first cube): the town's light
const NO_WORLD = [{ at: 0, theme: TOWN }];
// A boss's darkness (Totnar, game/totnar.js): the night it turns the cube into, whatever the
// depth. The sky and the sun all but go out and the far side sinks into the dark; what still
// shines is the fires, the glowing things and the character's own light, at its brightest.
const NIGHT = { sky: ['#04060c', '#010204', '#0b0f1c', '#08091a'], stars: 1, hemi: ['#56648c', '#08070c', 0.1],
  sun: ['#6878a8', 0.05], fog: 0.45, lamp: 1.15 };
const night = { sky: NIGHT.sky.map(c => new THREE.Color(c)), hemi: NIGHT.hemi.slice(0, 2).map(c => new THREE.Color(c)), sun: new THREE.Color(NIGHT.sun[0]) };

// Flip's fight (game/flipworld.js): the sky as dark as it goes, only the stars, round his box
// floating in nothing (the box itself lit as before: only the sky and the fog go)
const VOID = ['#000000', '#000000', '#020207', '#010104'].map(c => new THREE.Color(c)), VOID_STARS = 0.7;

// Renew's fight (game/rewind.js): as it goes on the light goes, whatever the depth: first a sunset
// (the sky orange under violet, the light warm and low), then nightfall (the sky deep violet, stars
// out, the far side sinking into the dark; the character's light at its brightest).
const SUNSET = { sky: ['#2e2456', '#ff9858', '#d8705c', '#ffb878'], stars: 0.2, hemi: ['#ffb894', '#3a2434', 0.6], sun: ['#ff8a4a', 0.75], fog: 0.2, lamp: 0.75 };
const NIGHTFALL = { sky: ['#07061a', '#2a0f36', '#1a0b26', '#3e1440'], stars: 1, hemi: ['#6a5c9c', '#0c0812', 0.16], sun: ['#8a64b8', 0.1], fog: 0.45, lamp: 1.15 };
const toColors = L => ({ ...L, sky: L.sky.map(c => new THREE.Color(c)), hemi: [new THREE.Color(L.hemi[0]), new THREE.Color(L.hemi[1]), L.hemi[2]], sun: [new THREE.Color(L.sun[0]), L.sun[1]] });
const sunset = toColors(SUNSET), nightfall = toColors(NIGHTFALL);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dc = { sky: [0, 1, 2, 3].map(() => new THREE.Color()), hemi: [new THREE.Color(), new THREE.Color()], sun: new THREE.Color() };
// the dusk's light at d (0 .. 1): { w: how much of the theme's light it takes the place of, the colours }
function duskLight(d) {
  const u = smoothstep(0.4, 1, d);
  for (let i = 0; i < 4; i++) dc.sky[i].copy(sunset.sky[i]).lerp(nightfall.sky[i], u);
  dc.hemi[0].copy(sunset.hemi[0]).lerp(nightfall.hemi[0], u); dc.hemi[1].copy(sunset.hemi[1]).lerp(nightfall.hemi[1], u);
  dc.sun.copy(sunset.sun[0]).lerp(nightfall.sun[0], u);
  return { w: smoothstep(0, 0.45, d), sky: dc.sky, hemi: dc.hemi, hemiI: lerp(SUNSET.hemi[2], NIGHTFALL.hemi[2], u), sun: dc.sun,
    sunI: lerp(SUNSET.sun[1], NIGHTFALL.sun[1], u), stars: lerp(SUNSET.stars, NIGHTFALL.stars, u), fog: lerp(SUNSET.fog, NIGHTFALL.fog, u),
    lamp: lerp(SUNSET.lamp, NIGHTFALL.lamp, u) };
}

// camDist: distance from the camera to what it looks at (fog is placed around that); themes: the
// world's theme picks (themes/depth.js worldThemes); dark: how far into a boss's darkness (0..1)
// mist: 0..1, a boss's fog rolling in (Squarlo growing): the far side fades into pale grey;
// gone: 0..1, how far the world round Flip's box has gone (VOID); dusk: 0..1, how far Renew's
// fight has fallen into the night (duskLight)
const MIST = new THREE.Color('#d6dfe4');
export function applyLook(depth, camDist, themes = NO_WORLD, dark = 0, mist = 0, gone = 0, dusk = 0) {
  const { a, b, t } = lightAt(depth, themes), k = dark * dark * (3 - 2 * dark), D = duskLight(dusk), w = D.w;
  hemi.color.copy(mix(a.hemi[0], b.hemi[0], t)).lerp(D.hemi[0], w).lerp(night.hemi[0], k);
  hemi.groundColor.copy(mix(a.hemi[1], b.hemi[1], t)).lerp(D.hemi[1], w).lerp(night.hemi[1], k);
  hemi.intensity = lerp(lerp(lerp(a.hemi[2], b.hemi[2], t), D.hemiI, w), NIGHT.hemi[2], k);
  sun.color.copy(mix(a.sun[0], b.sun[0], t)).lerp(D.sun, w).lerp(night.sun, k);
  sun.intensity = lerp(lerp(lerp(a.sun[1], b.sun[1], t), D.sunI, w), NIGHT.sun[1], k);
  const v = gone * gone * (3 - 2 * gone);
  for (let i = 0; i < 4; i++) sky[i].copy(mix(skyStop(a.sky, i), skyStop(b.sky, i), t)).lerp(D.sky[i], w).lerp(night.sky[i], k).lerp(VOID[i], v);
  setSkyLook(sky[0], sky[1], sky[2], sky[3], lerp(lerp(lerp(lerp(a.stars ?? 0, b.stars ?? 0, t), D.stars, w), NIGHT.stars, k), VOID_STARS, v));
  // fog: nothing at 0, at 1 the far half of the cube disappears into the dark
  const m = mist * mist * (3 - 2 * mist), f = Math.max(lerp(lerp(lerp(a.fog, b.fog, t), D.fog, w), NIGHT.fog, k), 0.85 * m);
  scene.fog.color.copy(sky[1]).lerp(MIST, m);
  scene.fog.near = f > 0.01 ? camDist - 6 : 1e4;
  scene.fog.far = f > 0.01 ? camDist + 6 + 70 * (1 - f) : 2e4;
  if (character.ready) {
    const lamp = lerp(lerp(lampAt(depth, themes), D.lamp, w), NIGHT.lamp, k);
    // (it hangs ~2.3 over the feet, render/character.js: brighter and farther reaching than it
    // was at the chest, for about the same light on the floor around, less at the feet)
    character.light.intensity = lerp(2.1, 5.2, lamp);
    character.light.distance = lerp(4.5, 10, lamp);
  }
}
