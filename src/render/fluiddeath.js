// Death-in-fluid effects layered over the ordinary ragdoll: a splash and bubbles for
// water, embers, smoke and a charred body for lava, fizzing bubbles, vapour and a
// dissolving body for acid, using the shared particle pool (particles.js). The body tint
// is restored as soon as the ragdoll that died is gone (respawn, travel, reset).
import * as THREE from 'three';
import { WATER, LAVA, ACID } from '../core/constants.js';
import { glow, soft, emit, rand, ring, particleCount } from './particles.js';
import { character } from './character.js';
import { player } from '../game/state.js';
import { WIND } from './materials.js';
import { surfaceY } from './surface.js';

// per fluid: an entry burst and a continuous emission while the effect runs
const STYLES = {
  [WATER]: {
    tint: null, duration: 1.6,
    burst(x, y, z) {
      for (let i = 0; i < 34; i++) {
        const [dx, dz] = ring(.25), a = Math.atan2(dz, dx), s = rand(.6, 1.6);
        emit(soft, x + dx, y, z + dz, { v: [Math.cos(a) * s, rand(2.2, 4), Math.sin(a) * s], life: rand(.5, .8),
          size: rand(.07, .12), color: i % 3 ? '#e8f6ff' : '#9fd2ff', alpha: .9, gravity: 11 });
      }
      emit(soft, x, y + .02, z, { life: .6, size: .7, grow: 1.6, color: '#f2fbff', alpha: .55 });
    },
    tick(x, y, z, k) {
      if (Math.random() < 9 * k) { const [dx, dz] = ring(.3);
        emit(soft, x + dx, y, z + dz, { v: [0, rand(.25, .5), 0], life: rand(.3, .6), size: rand(.05, .09), color: '#e8f6ff', alpha: .8 }); }
    },
  },
  [LAVA]: {
    tint: { color: '#1a0f0a', emissive: '#ff4a10', light: '#ff6a20', fade: false }, duration: 2.2,
    burst(x, y, z) {
      for (let i = 0; i < 46; i++) {
        const [dx, dz] = ring(.3), a = Math.atan2(dz, dx), s = rand(.4, 1.4);
        emit(glow, x + dx, y, z + dz, { v: [Math.cos(a) * s, rand(2, 4.5), Math.sin(a) * s], life: rand(.6, 1.2),
          size: rand(.06, .12), color: i % 4 ? '#ffb030' : '#fff0a0', gravity: 7, drag: .6 });
      }
      emit(glow, x, y + .05, z, { life: .45, size: 1.1, grow: 1.4, color: '#ff7a20', alpha: .8 });
    },
    tick(x, y, z, k) {
      if (Math.random() < 26 * k) { const [dx, dz] = ring(.35);
        emit(glow, x + dx, y + .05, z + dz, { v: [0, rand(.8, 2), 0], spread: .6, life: rand(.5, 1.1), size: rand(.04, .08),
          color: Math.random() < .3 ? '#fff0a0' : '#ff9a30', gravity: -.4, drag: .8 }); }
      if (Math.random() < 9 * k) { const [dx, dz] = ring(.3);
        emit(soft, x + dx, y + .2, z + dz, { v: [0, rand(.5, .9), 0], spread: .25, life: rand(1.2, 1.8), size: rand(.25, .4),
          grow: .5, color: Math.random() < .5 ? '#3a3330' : '#57504a', alpha: .5, drag: .5 }); }
    },
  },
  [ACID]: {
    tint: { color: '#a8ff70', emissive: '#3aff20', light: '#8fff5a', fade: true }, duration: 2.2,
    burst(x, y, z) {
      for (let i = 0; i < 30; i++) {
        const [dx, dz] = ring(.25), a = Math.atan2(dz, dx), s = rand(.5, 1.3);
        emit(soft, x + dx, y, z + dz, { v: [Math.cos(a) * s, rand(1.8, 3.4), Math.sin(a) * s], life: rand(.5, .8),
          size: rand(.07, .11), color: i % 3 ? '#9dff4a' : '#e2ffb0', alpha: .9, gravity: 10 });
      }
      emit(glow, x, y + .03, z, { life: .5, size: .9, grow: 1.4, color: '#6aff2a', alpha: .6 });
    },
    tick(x, y, z, k) {
      if (Math.random() < 30 * k) { const [dx, dz] = ring(.4);
        emit(glow, x + dx, y + .02, z + dz, { v: [0, rand(.3, .8), 0], spread: .2, life: rand(.3, .7), size: rand(.04, .09),
          color: Math.random() < .4 ? '#eaffc0' : '#7dff3a', alpha: .9 }); }
      if (Math.random() < 10 * k) { const [dx, dz] = ring(.3);
        emit(soft, x + dx, y + .15, z + dz, { v: [0, rand(.4, .8), 0], spread: .3, life: rand(1, 1.6), size: rand(.25, .4),
          grow: .6, color: '#c8f0a0', alpha: .35, drag: .5 }); }
    },
  },
};

let fx = null, saved = null;

// the shared character material is tinted in place; remember what to restore
function tintBody(t) {
  const m = character.mesh?.material;
  if (!m || saved) return;
  saved = { color: m.color.clone(), emissive: m.emissive?.clone(), emissiveIntensity: m.emissiveIntensity, opacity: m.opacity,
    light: character.light && { color: character.light.color.clone(), intensity: character.light.intensity },
    shadow: character.mesh.castShadow,
    ghost: character.mesh.parent?.children.find(o => o !== character.mesh && o.isSkinnedMesh)?.material };
  saved.ghostOpacity = saved.ghost?.opacity;
  fx.tint = { ...t, color: new THREE.Color(t.color), emissive: new THREE.Color(t.emissive), light: new THREE.Color(t.light) };
}

function restoreBody() {
  const m = character.mesh?.material;
  if (m && saved) {
    m.color.copy(saved.color); if (m.emissive) m.emissive.copy(saved.emissive);
    m.emissiveIntensity = saved.emissiveIntensity; m.opacity = saved.opacity;
    if (saved.light) { character.light.color.copy(saved.light.color); character.light.intensity = saved.light.intensity; }
    if (saved.ghost) saved.ghost.opacity = saved.ghostOpacity;
    character.mesh.castShadow = saved.shadow;
    if (character.sword) character.sword.visible = true;
  }
  saved = null;
}

export function fluidDeathFx(fluid, x, surface, z, ragdoll) {
  restoreBody();
  const style = STYLES[fluid] || STYLES[ACID];
  // (on the surface as it is drawn, rising and falling with the tide: render/surface.js)
  const at = () => surfaceY(fluid, surface, WIND.value) + .02;
  fx = { style, ragdoll, t: 0, at, x, z, tint: null };
  style.burst(x, at(), z);
  if (style.tint && ragdoll && character.ready) tintBody(style.tint);
}

function animateBody() {
  const m = character.mesh.material, t = fx.tint, k = Math.min(1, fx.t / .7);
  m.color.copy(saved.color).lerp(t.color, k);
  if (m.emissive) {
    const flicker = .75 + .25 * Math.sin(fx.t * 23) * Math.sin(fx.t * 7.3);
    m.emissive.copy(t.emissive); m.emissiveIntensity = Math.max(0, 1 - fx.t / fx.style.duration) * 1.6 * flicker;
  }
  if (saved.light) { character.light.color.copy(t.light);
    character.light.intensity = 5.2 * Math.max(0, 1 - fx.t / fx.style.duration); }   // (look.js: as bright as deep down)
  if (t.fade) {   // dissolve: fade out after the first moments
    const a = Math.max(0, 1 - Math.max(0, fx.t - .5) / 1.3);
    m.opacity = saved.opacity * a;
    if (saved.ghost) saved.ghost.opacity = saved.ghostOpacity * a;
    character.mesh.castShadow = saved.shadow && a > .4;
    if (character.sword) character.sword.visible = a > .3;
  }
}

export function tickFluidDeath(dt) {
  if (!fx) return;
  fx.t += dt;
  const alive = fx.ragdoll && player.ragdoll === fx.ragdoll;
  if (alive) { fx.x = player.x; fx.z = player.z; }
  if (saved && !alive) restoreBody();
  else if (saved) animateBody();
  if (fx.t < fx.style.duration && (alive || !fx.ragdoll)) fx.style.tick(fx.x, fx.at(), fx.z, dt);
  else if (!saved) fx = null;
}

// for checks: what is running right now
export const fluidDeathState = () => ({ fluid: fx ? +Object.keys(STYLES).find(k => STYLES[k] === fx.style) : 0,
  particles: particleCount(), tinted: !!saved });
