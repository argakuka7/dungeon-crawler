// Short-lived text rising over the world: damage numbers and what was picked up. Drawn over
// everything. `at` is a point, or a function returning one (to follow a moving thing).
import * as THREE from 'three';
import { scene } from './scene.js';
import { DISPLAY } from './fonts.js';

const live = [];
const point = new THREE.Vector3();

// size: world height of the text; drift: sideways wander so stacked numbers do not overlap
export function floatText(text, at, { color = '#ffd56a', size = 0.24, life = 1.1, rise = 0.6, drift = 0, pop = 0 } = {}) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  ctx.font = `bold 30px ${DISPLAY}`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 16; canvas.height = 48;
  ctx.font = `bold 30px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = '#171c25'; ctx.strokeText(text, canvas.width / 2, 24);
  ctx.fillStyle = color; ctx.fillText(text, canvas.width / 2, 24);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, depthWrite: false }));
  sprite.renderOrder = 1300;
  scene.add(sprite);
  live.push({ sprite, at, t: 0, life, rise, drift, pop, w: size * canvas.width / canvas.height, h: size });
}

export function tickFloatText(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const f = live[i];
    f.t += dt;
    const p = typeof f.at === 'function' ? f.at(point) : f.at;
    // a quick pop in size, then rise and fade
    const k = 1 + f.pop * Math.max(0, 1 - f.t / 0.15);
    f.sprite.position.set(p.x + f.drift * f.t, p.y + f.rise * f.t, p.z);
    f.sprite.scale.set(f.w * k, f.h * k, 1);
    f.sprite.material.opacity = Math.min(1, (f.life - f.t) / 0.4);
    if (f.t < f.life) continue;
    scene.remove(f.sprite); f.sprite.material.map.dispose(); f.sprite.material.dispose();
    live.splice(i, 1);
  }
}
