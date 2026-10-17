// The cutaway's shader side: uniforms shared by every cut material and the region test that
// gets injected into them. The cut outline is a nine-cornered polygon on a circle around the
// character (corners at irregular angles), turning slowly.
import * as THREE from 'three';

// learn: drawing.html#cut-how (see learn/README.md)
const CORNERS = 9, TURN = 0.18;   // rad/s
const JITTER = [0.05, -0.22, 0.17, -0.08, 0.26, -0.15, 0.1, -0.27, 0.2];   // in corner steps

export const U = {
  uCutY: { value: 1e3 }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: 1 },
  // uSide: the vertical plane through the character facing the camera (nx, nz, n . character)
  uAspect: { value: 1 }, uSide: { value: new THREE.Vector3() }, uRes: { value: new THREE.Vector2(1, 1) },
  uFront: { value: new THREE.Vector4() }, uWallY: { value: 1e3 },
  // the walls that come down: within uWallBand inside the box (x0, x1, z0, z1)
  uWallBox: { value: new THREE.Vector4(0, 16, 0, 16) }, uWallBand: { value: 2.2 },
  // which kinds of material come down with them: rock, stone, wood, the rest (see inject)
  uFrontKinds: { value: new THREE.Vector4(1, 1, 1, 1) },
  // walls of the box the camera is not beyond (+x, -x, +z, -z): they can hide nothing inside
  // it, so the cutaway leaves them alone (house interiors only)
  uBack: { value: new THREE.Vector4() },
  // section cap colours (section.js)
  uCapRock: { value: new THREE.Color() }, uCapStone: { value: new THREE.Color() }, uCapWood: { value: new THREE.Color() },
  uPoly: { value: Array.from({ length: CORNERS }, () => new THREE.Vector2()) },
};

// corners on the unit circle, counter-clockwise
export function turnShape(time) {
  U.uPoly.value.forEach((v, i) => { const a = (i + JITTER[i]) / CORNERS * Math.PI * 2 + time * TURN; v.set(Math.cos(a), Math.sin(a)); });
}
turnShape(0);

// 1 inside the cutaway, 0 outside; y-test optional
// learn: drawing.html#cut-how (see learn/README.md)
const REGION = `
  bool inPoly(vec2 p) {
    for (int i = 0; i < ${CORNERS}; i++) {
      vec2 a = uPoly[i], b = uPoly[(i + 1) % ${CORNERS}];
      if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0.0) return false;
    }
    return true;
  }
  // distances to the box's walls (+x, -x, +z, -z), within the band if below uWallBand
  vec4 wallDist() {
    return vec4(uWallBox.y - vCutW.x, vCutW.x - uWallBox.x, uWallBox.w - vCutW.z, vCutW.z - uWallBox.z);
  }
  bool backWall() {
    if (uFrontKinds[CUT_KIND] < 0.5) return false;
    vec4 d = wallDist();
    float b = uWallBand;
    return any(bvec4(d.x < b && uBack.x > 0.5, d.y < b && uBack.y > 0.5, d.z < b && uBack.z > 0.5, d.w < b && uBack.w > 0.5));
  }
  float cutRegion(bool testY) {
    if (testY && vCutW.y <= uCutY) return 0.0;
    if (backWall()) return 0.0;
    // only what is on the camera's side of the character (seen from above), never what is
    // behind it, however high it reaches (no slack: a wall or pillar standing just behind the
    // character's plane hides nothing of it and must keep its upper part)
    if (dot(vCutW.xz, uSide.xy) <= uSide.z) return 0.0;
    vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
    return inPoly((ndc - uCenter) * vec2(uAspect, 1.0) / uRadius) ? 1.0 : 0.0;
  }
  // caves and house interiors: the walls on the sides towards the camera are cut down
  // (+x, -x, +z, -z flags)
  bool frontWall() {
    if (vCutW.y <= uWallY || uFrontKinds[CUT_KIND] < 0.5) return false;
    vec4 d = wallDist();
    float b = uWallBand;
    return any(bvec4(d.x < b && uFront.x > 0.5, d.y < b && uFront.y > 0.5, d.z < b && uFront.z > 0.5, d.w < b && uFront.w > 0.5));
  }`;

// patch a built-in material: world position / view depth varyings, uniforms, region test;
// fragCode edits the fragment shader (where to discard); kind: the material's kind for
// uFrontKinds (0 rock, 1 stone, 2 wood, 3 anything else)
export const CUT_KINDS = { rock: 0, stone: 1, wood: 2 };
export function inject(mat, fragCode, key, kind = 3) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vCutW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n#if defined(USE_BATCHING)\n  vCutW = (modelMatrix * batchingMatrix * vec4(transformed, 1.0)).xyz;\n#elif defined(USE_INSTANCING)\n  vCutW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\n  vCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = `varying vec3 vCutW;\nuniform float uCutY, uRadius, uAspect, uWallY, uWallBand;\nuniform vec2 uCenter, uRes;\nuniform vec3 uSide;\nuniform vec4 uFront, uWallBox, uFrontKinds, uBack;\n#define CUT_KIND ${kind}\nuniform vec3 uCapRock, uCapStone, uCapWood;\nuniform vec2 uPoly[${CORNERS}];\n`
      + REGION + '\n' + fragCode(sh.fragmentShader);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
