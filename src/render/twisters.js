// The Tornado's twisters (game/twisters.js): its TornadoTwister prop (blender/tornado.py) in the
// thrower's kind's colours, see-through, spinning fast about its axis and swaying, with dust (a
// fiery kind's embers) whirling round its foot. One over a hand is small and grows, standing on
// the hand's tip (the bone, as the clip moves it); let go, it drops onto the floor and stands full
// size; a ride's reaches from the floor up under the Tornado's feet; one that caught someone spins
// harder round them; blowing away, it frays out wider and fades.
import * as THREE from 'three';
import { scene } from './scene.js';
import { emit, soft, glow, rand } from './particles.js';
import { tornadoModel } from './tornadomodel.js';
import { kindColors, recolor } from './recolor.js';
import { player } from '../game/state.js';

const OPACITY = 0.82, SPIN = 11, TALL = 1.3, WIDE = 1.3;   // (drawn a little bigger than what it catches)
const DUST = ['#d6cfbf', '#bdb4a2', '#ece6da'];
const tip = new THREE.Vector3();
const bones = ['tip.L', 'tip.R'].map(n => THREE.PropertyBinding.sanitizeNodeName(n));

function makeView(w) {
  const src = tornadoModel.props?.TornadoTwister;
  if (!src) { tornadoModel.load(); return null; }
  const colors = kindColors(w.profile, tornadoModel), owned = [];
  const own = m => {
    const c = recolor(m.clone(), colors);
    Object.assign(c, { transparent: true, opacity: OPACITY, depthWrite: false });
    owned.push(c);
    return c;
  };
  const group = new THREE.Group(), mesh = src.clone();
  mesh.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material); o.castShadow = false; } });
  group.add(mesh);
  scene.add(group);
  return { group, mesh, owned, angle: Math.random() * 6, seed: Math.random() * 9 };
}
// where a twister over a hand stands: on the tip of the hand, as the clip has it
function handAt(w, off) {
  const bone = w.e.view?.model?.getObjectByName(bones[w.i]);
  if (!bone) return tip.set(w.x + off.x, w.y + off.y + 0.05, w.z + off.z);
  bone.getWorldPosition(tip);
  return tip.setY(tip.y + 0.02);
}
export function drawTwisters(list, dt, off = { x: 0, y: 0, z: 0 }) {
  for (const w of list) {
    const v = w.view || (w.view = makeView(w));
    if (!v) continue;
    const g = v.group, s = w.e.profile.size ?? 1, fade = Math.min(1, w.fade), grow = w.grow;
    let height = (w.spec.height ?? 1.1) * TALL * s, width = WIDE * s, spin = SPIN;
    if (w.kind === 'hand') {
      g.position.copy(handAt(w, off));
      height = width = (0.22 + 0.2 * grow) * s;
    } else {
      g.position.set(w.x + off.x, (w.kind === 'loose' && w.drop !== undefined ? Math.max(w.y, w.drop) : w.y) + off.y, w.z + off.z);
      if (w.kind === 'ride') { height = Math.max(0.35, w.top - w.y + 0.2 * s); width = 1.15 * s; }
      height *= 0.15 + 0.85 * grow; width *= 0.4 + 0.6 * grow;
      if (w.caught) { spin = SPIN * 1.6; width *= 1.25; height = Math.max(height, (w.spec.lift ?? 1.2) + 1.1); }
    }
    v.angle += spin * dt;
    g.rotation.set(0.08 * Math.sin(w.t * 3.1 + v.seed), v.angle, 0.08 * Math.sin(w.t * 2.3 + 2 * v.seed));
    g.scale.set(width * (1 + 0.8 * fade), height * (1 - 0.3 * fade), width * (1 + 0.8 * fade));
    for (const m of v.owned) m.opacity = OPACITY * (1 - fade);
    dust(w, v, g, dt, width, fade);
  }
}
// dust (a fiery kind's embers) whirling round its foot and up it
function dust(w, v, g, dt, width, fade) {
  if (w.kind === 'hand' || fade >= 1 || Math.hypot(w.x - player.x, w.z - player.z) > 16) return;
  const sparks = w.profile?.sparks, p = g.position;
  for (let n = Math.floor((w.caught ? 60 : 30) * dt + Math.random()); n > 0; n--) {
    const a = rand(0, Math.PI * 2), r = rand(0.15, 0.35) * width, up = rand(0, 0.4);
    emit(soft, p.x + Math.cos(a) * r, p.y + 0.05 + up, p.z + Math.sin(a) * r, { v: [-Math.sin(a) * 2.6 * width, rand(0.4, 1.4), Math.cos(a) * 2.6 * width],
      life: rand(0.3, 0.55), size: rand(0.08, 0.16), grow: 1.2, color: DUST[n % 3], alpha: 0.45 * (1 - fade), drag: 2 });
  }
  if (sparks) for (let n = Math.floor(18 * dt + Math.random()); n > 0; n--) {
    const a = rand(0, Math.PI * 2), r = rand(0.1, 0.3) * width;
    emit(glow, p.x + Math.cos(a) * r, p.y + rand(0.1, 1), p.z + Math.sin(a) * r, { v: [-Math.sin(a) * 2, rand(0.6, 1.6), Math.cos(a) * 2],
      life: rand(0.3, 0.6), size: rand(0.04, 0.08), color: sparks[n % sparks.length], gravity: -0.5, drag: 1 });
  }
}
export function removeTwisterViews(list) {
  for (const w of list) if (w.view) {
    scene.remove(w.view.group);
    w.view.owned.forEach(m => m.dispose());
    w.view = null;
  }
}
