// How dark it is: sky, hemisphere light, sun, fog and the character's own light follow the
// (fractional) depth, blended between the starts of the world's theme stretches. Below the
// ground the character's light grows with the theme's `lamp` (about half in the sunlit caves,
// full in the dark deep), since local lights are all there is.
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

// camDist: distance from the camera to what it looks at (fog is placed around that); themes: the
// world's theme picks (themes/depth.js worldThemes)
export function applyLook(depth, camDist, themes = NO_WORLD) {
  const { a, b, t } = lightAt(depth, themes);
  hemi.color.copy(mix(a.hemi[0], b.hemi[0], t));
  hemi.groundColor.copy(mix(a.hemi[1], b.hemi[1], t));
  hemi.intensity = lerp(a.hemi[2], b.hemi[2], t);
  sun.color.copy(mix(a.sun[0], b.sun[0], t));
  sun.intensity = lerp(a.sun[1], b.sun[1], t);
  for (let i = 0; i < 4; i++) sky[i].copy(mix(skyStop(a.sky, i), skyStop(b.sky, i), t));
  setSkyLook(sky[0], sky[1], sky[2], sky[3], lerp(a.stars ?? 0, b.stars ?? 0, t));
  // fog: nothing at 0, at 1 the far half of the cube disappears into the dark
  const f = lerp(a.fog, b.fog, t);
  scene.fog.color.copy(sky[1]);
  scene.fog.near = f > 0.01 ? camDist - 6 : 1e4;
  scene.fog.far = f > 0.01 ? camDist + 6 + 70 * (1 - f) : 2e4;
  if (character.ready) {
    const lamp = lampAt(depth, themes);
    character.light.intensity = lerp(1.2, 3, lamp);
    character.light.distance = lerp(3.5, 8, lamp);
  }
}
