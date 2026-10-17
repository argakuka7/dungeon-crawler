// Colours used by the world meshes.
import * as THREE from '../../vendor/three/three.core.js';   // plain path, no renderer: also loads in the world worker
import { WATER, LAVA } from '../core/constants.js';
import { buildOf } from '../themes/builds.js';
import { TOWN } from '../themes/index.js';

export const C = s => new THREE.Color(s);

// vertex colour of faces that only exist as a section cap: drawn when seen from behind (inside a
// cut solid), discarded when seen from the front (section.js)
export const CAP_ONLY = C('#000000');

export function gradient(stops, v) {
  if (v <= stops[0][0]) return new THREE.Color(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return new THREE.Color(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), t);
    }
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

// terrain: tops by height (in levels), rock strata on the sides; set per depth (usePalette)
export let TOP_STOPS, SIDE_STOPS, LIP, UNDERSIDE, BEDROCK;
export function usePalette(theme) {
  TOP_STOPS = theme.top; SIDE_STOPS = theme.side;
  LIP = C(theme.lip); UNDERSIDE = C(theme.under); BEDROCK = theme.bed.map(C);
  useBuild(buildOf(theme));
}
export const fluidBed = t => C(t === WATER ? '#7d6f52' : t === LAVA ? '#2b1d1a' : '#3e4a2a');
export const fluidBank = t => C(t === WATER ? '#c9b98a' : t === LAVA ? '#3a2a22' : '#a4a64a');

// structures: shades of the theme's stone, wood, rope and iron (themes/builds.js)
export let STONE, STONE2, CHEEK, CAP, SOFFIT, PIER, WOOD, WOOD2, BEAM, ROPE, POST, RAIL, IRON, IRON2;
function useBuild(b) {
  const s = k => C(b.stone).multiplyScalar(k), w = k => C(b.wood).multiplyScalar(k);
  [STONE, STONE2, CHEEK, CAP, SOFFIT, PIER] = [1, 0.92, 0.69, 0.8, 0.54, 0.73].map(s);
  [WOOD, WOOD2, BEAM, POST, RAIL] = [1, 0.88, 0.58, 0.69, 0.87].map(w);
  ROPE = C(b.rope); IRON = C(b.iron); IRON2 = C(b.iron).multiplyScalar(0.7);
}

usePalette(TOWN);   // until a cube says otherwise
