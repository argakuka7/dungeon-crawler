// What the game does to Foggery's model on top of his clips (render/enemies.js; his fight:
// game/foggery.js). The model holds both his forms (blender/foggery.py): the frog (the `frog` bone)
// and the ball (the `ball` bone), each clip showing one and scaling the other away; while he
// curls up (mode 'split' at stage 1) the frog shrinks and spins away and the ball swells up in a
// puff of steam. An eye he threw (his `eyes`, 0 .. 1) is scaled away and grows back. While his
// shield holds (`guard`, and while he calls his cats: the summon is warded) a shell of glowing
// segments turns round the ball, flickering; once it breaks it bursts into shards.
import * as THREE from 'three';
import { FOGGERY_FIGHT } from '../core/foggery.js';
import { attackOf } from '../core/enemies.js';
import { glow, soft, emit, rand } from './particles.js';
import { sfx } from '../audio/sfx.js';
import { player } from '../game/state.js';

const HIDDEN = 0.001, BALL_Y = 0.86, SHIELD_R = 0.9;
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const geometry = new THREE.SphereGeometry(SHIELD_R, 40, 20);
const SHARDS = ['#fff3c0', '#ffc84a', '#ff9a3a'], STEAM = ['#f6ece4', '#ecd6cb', '#faf3f0'];

function shieldMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color('#ffc04a') } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vView;
      void main() {
        vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    // segments in rings of latitude, each ring turning its own way (the sketch's dashed circle)
    fragmentShader: `uniform float uTime; uniform float uAlpha; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vP; varying vec3 vView;
      void main() {
        vec3 p = normalize(vP);
        float lat = asin(clamp(p.y, -1.0, 1.0)) / 3.14159 + 0.5, band = floor(lat * 7.0);
        float lon = atan(p.z, p.x) / 6.28318 + 0.5 + uTime * (mod(band, 2.0) < 1.0 ? 0.08 : -0.06);
        float dash = step(0.25, fract(lon * 9.0)) * step(0.12, fract(lat * 7.0)) * step(fract(lat * 7.0), 0.88);
        float rim = pow(1.0 - abs(dot(normalize(vN), vView)), 2.0);
        float a = uAlpha * (0.12 + 0.8 * rim) * (0.35 + 0.65 * dash) * (0.85 + 0.15 * sin(uTime * 9.0 + band));
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

export function makeFoggeryLook(model, group) {
  const bone = n => model.getObjectByName(n);
  const mesh = new THREE.Mesh(geometry, shieldMaterial());
  mesh.position.y = BALL_Y; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 6;
  group.add(mesh);
  return { frog: bone('frog'), ball: bone('ball'), eyes: ['eye.L', 'eye.R'].map(n => bone(THREE.PropertyBinding.sanitizeNodeName(n))),
    shield: mesh, shown: 0, guard: 0, morph: false, sizzle: 0 };
}
export function disposeFoggeryLook(f) { f.shield.removeFromParent(); f.shield.material.dispose(); }

export function foggeryLook(v, e, dt) {
  const f = v.fog, stage = e.stage ?? 1;
  // curling up into his ball
  if (e.mode === 'split' && stage === 1) {
    const T = FOGGERY_FIGHT.morphTime, k = e.t / T;
    if (!f.morph) { f.morph = true; sfx('morph', { at: e, pitch: 1.4 }); }
    f.frog?.scale.setScalar(Math.max(HIDDEN, 1 - ease(k / 0.6)));
    f.frog?.rotateY(dt * 14 * ease(k / 0.6));
    f.ball?.scale.setScalar(Math.max(HIDDEN, ease((k - 0.35) / 0.65)));
    if (Math.hypot(e.x - player.x, e.z - player.z) < 20) for (let i = Math.floor(60 * dt + Math.random()); i > 0; i--) {
      const a = rand(0, Math.PI * 2), r = rand(0.2, 0.9);
      emit(soft, e.x + Math.cos(a) * r, e.y + rand(0.2, 1.4), e.z + Math.sin(a) * r, { v: [Math.cos(a) * 0.6, rand(0.4, 1.2), Math.sin(a) * 0.6],
        life: rand(0.6, 1.1), size: rand(0.25, 0.45), grow: 1.3, color: STEAM[i % 3], alpha: 0.45, drag: 1 });
    }
  } else if (f.morph) {
    f.morph = false;
    if (f.frog) { f.frog.scale.setScalar(HIDDEN); f.frog.rotation.set(0, 0, 0); }
    if (f.ball) f.ball.scale.setScalar(1);
    emit(glow, e.x, e.y + BALL_Y, e.z, { life: 0.35, size: 2, grow: 1.2, color: '#ffc8a0', alpha: 0.7 });
  }
  // his eyes: a thrown one grows back
  if (stage === 1) f.eyes.forEach((b, i) => b?.scale.setScalar(Math.max(HIDDEN, ease(e.eyes?.[i] ?? 1))));
  // his shield
  const a = e.mode === 'attack' ? attackOf(e) : null, guard = e.mode !== 'dead' && stage > 1 && (!!e.guard || !!a?.ward);
  if (f.guard && !guard && e.mode !== 'dead') shatter(e);
  f.guard = guard;
  f.shown += ((guard ? 1 : 0) - f.shown) * Math.min(1, dt * (guard ? 3 : 10));
  f.shield.visible = f.shown > 0.01;
  if (f.shield.visible) {
    const u = f.shield.material.uniforms;
    u.uTime.value += dt; u.uAlpha.value = f.shown;
    // (following the ball as it bobs and squashes)
    if (f.ball) { f.ball.getWorldPosition(f.shield.position); f.shield.parent.worldToLocal(f.shield.position); }
    f.shield.scale.setScalar(0.9 + 0.1 * f.shown);
  }
}
function shatter(e) {
  const y = e.y + BALL_Y;
  emit(glow, e.x, y, e.z, { life: 0.3, size: 2.4, grow: 1.4, color: '#ffd27a', alpha: 0.8 });
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2), u = rand(-1, 1), w = Math.sqrt(1 - u * u), s = rand(2, 5);
    emit(glow, e.x + Math.cos(a) * w * SHIELD_R, y + u * SHIELD_R, e.z + Math.sin(a) * w * SHIELD_R, { v: [Math.cos(a) * w * s, u * s + 1, Math.sin(a) * w * s],
      life: rand(0.4, 0.8), size: rand(0.06, 0.12), color: SHARDS[i % 3], alpha: 0.95, gravity: 6, drag: 1.2 });
  }
}
