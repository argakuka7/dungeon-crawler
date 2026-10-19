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

// camDist: distance from the camera to what it looks at (fog is placed around that); themes: the
// world's theme picks (themes/depth.js worldThemes); dark: how far into a boss's darkness (0..1)
export function applyLook(depth, camDist, themes = NO_WORLD, dark = 0) {
  const { a, b, t } = lightAt(depth, themes), k = dark * dark * (3 - 2 * dark);
  hemi.color.copy(mix(a.hemi[0], b.hemi[0], t)).lerp(night.hemi[0], k);
  hemi.groundColor.copy(mix(a.hemi[1], b.hemi[1], t)).lerp(night.hemi[1], k);
  hemi.intensity = lerp(lerp(a.hemi[2], b.hemi[2], t), NIGHT.hemi[2], k);
  sun.color.copy(mix(a.sun[0], b.sun[0], t)).lerp(night.sun, k);
  sun.intensity = lerp(lerp(a.sun[1], b.sun[1], t), NIGHT.sun[1], k);
  for (let i = 0; i < 4; i++) sky[i].copy(mix(skyStop(a.sky, i), skyStop(b.sky, i), t)).lerp(night.sky[i], k);
  setSkyLook(sky[0], sky[1], sky[2], sky[3], lerp(lerp(a.stars ?? 0, b.stars ?? 0, t), NIGHT.stars, k));
  // fog: nothing at 0, at 1 the far half of the cube disappears into the dark
  const f = lerp(lerp(a.fog, b.fog, t), NIGHT.fog, k);
  scene.fog.color.copy(sky[1]);
  scene.fog.near = f > 0.01 ? camDist - 6 : 1e4;
  scene.fog.far = f > 0.01 ? camDist + 6 + 70 * (1 - f) : 2e4;
  if (character.ready) {
    const lamp = lerp(lampAt(depth, themes), NIGHT.lamp, k);
    character.light.intensity = lerp(1.2, 3, lamp);
    character.light.distance = lerp(3.5, 8, lamp);
  }
}
