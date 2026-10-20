// What the game moves on a boss's bones on top of his clips (render/enemies.js; the kids' guide
// shows the bosses with the same, learn/demos/bosses.js): Gusto's tentacles shaking, Totnar's
// ball of sticks rolling and the parts he has lost by his stage scaled away. Bone work only: no
// scene, no particles, no sound.
import * as THREE from 'three';

const wobble = new THREE.Quaternion(), spin = new THREE.Quaternion();
const AXIS = new THREE.Vector3(1, 0, 0), AXIS2 = new THREE.Vector3(0, 0, 1);

// the tentacle bones of a model (named tentacle<i>_<j>: tentacle i, j bones out from the body)
export function findTentacles(model) {
  const out = [];
  model.traverse(o => { const m = o.isBone && /^tentacle(\d+)_(\d+)$/.exec(o.name); if (m) out.push({ bone: o, i: +m[1], j: +m[2] }); });
  return out;
}
// the tentacles' own frantic shaking at time t, on top of the clip's pose: each its own way, the
// tips most; k: how hard (0 still)
export function shakeTentacles(tentacles, t, k) {
  for (const { bone, i, j } of tentacles) {
    const amp = k * (0.2 + 0.14 * j);
    const a = amp * (Math.sin(t * (11 + i * 1.3) + i * 2.1 + j * 0.9) + 0.5 * Math.sin(t * (23 + i * 0.7) + i));
    const b = amp * (Math.sin(t * (13 + i * 0.9) + i * 1.3 + j * 1.4) + 0.4 * Math.sin(t * (29 - i) + 2 * i));
    bone.quaternion.multiply(wobble.setFromAxisAngle(AXIS, a)).multiply(wobble.setFromAxisAngle(AXIS2, b));
  }
}

// what a model loses by stage (a profile's `shed`: { stage: bone names }): [{ stage, bones }]
export function findShed(model, shed) {
  if (!shed) return null;
  return Object.entries(shed).map(([stage, names]) => ({ stage: +stage, bones: names.map(n => model.getObjectByName(n)).filter(Boolean) }));
}
// what it has lost by `stage`, scaled away (after the clip's pose: the clip may scale them back)
export function hideShed(shed, stage) {
  for (const s of shed ?? []) if (s.stage <= stage) for (const b of s.bones) b.scale.setScalar(1e-4);
}

// the bone that rolls (`brush`; a profile that `tumble`s: radius) and the axis it rolls about in
// its own frame: the model's +x (a forward roll), found in the rest pose
export function findBall(model, radius) {
  const bone = radius ? model.getObjectByName('brush') : null;
  if (!bone) return null;
  model.updateMatrixWorld(true);
  return { bone, axis: new THREE.Vector3(1, 0, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize() };
}
// the ball turned by `angle` (radians) on top of the clip's pose
export function turnBall(ball, angle) { ball.bone.quaternion.multiply(spin.setFromAxisAngle(ball.axis, angle)); }
