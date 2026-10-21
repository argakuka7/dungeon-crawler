// Health bars and level labels floating over the player and the enemies. All of them that sit
// over a body are drawn over the world (onTop: no depth test), so neither terrain nor the hero
// ever hides them.
import * as THREE from 'three';
import { DISPLAY } from './fonts.js';

const INDICATOR_SCALE = 1.15;
const LABEL_SCALE = INDICATOR_SCALE * 1.15;   // level / name labels a touch larger than the bars
const barGeo = new THREE.PlaneGeometry(1, 1);
const mats = new Map();
const mat = (color, onTop) => {
  const k = color + ':' + onTop;
  if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial(onTop
    ? { color, side: THREE.DoubleSide, transparent: true, depthTest: false, forceSinglePass: true }   // drawn over the world
    : { color, side: THREE.DoubleSide }));
  return mats.get(k);
};

// a bar (back plate + fill) of width w; set(f) fills it to f in 0..1
export function makeBar({ w = 0.66, h = 0.07, color = 0xf2a449, back = 0x231f25, onTop = false } = {}) {
  const group = new THREE.Group(), plate = new THREE.Mesh(barGeo, mat(back, onTop)), fill = new THREE.Mesh(barGeo, mat(color, onTop));
  const fw = w - 0.04, fh = h - 0.025;
  plate.scale.set(w, h, 1); fill.scale.set(fw, fh, 1); fill.position.z = 0.001;
  group.add(plate, fill);
  group.scale.setScalar(INDICATOR_SCALE);
  if (onTop) { plate.renderOrder = 1200; fill.renderOrder = 1201; }
  return { group, set(f) { f = Math.min(1, Math.max(0, f)); fill.scale.x = fw * f; fill.position.x = -fw / 2 * (1 - f); } };
}

// "Lv N" (or "<title> · Lv N") as a sprite; setLevel(n, title) redraws it only when the text
// changes (title: the one it was made with, unless given: null for none)
export function makeLevelLabel(level, { color = '#ffe4ae', onTop = false, title = null } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false, depthTest: !onTop }));
  sprite.scale.set(.7 * LABEL_SCALE, .175 * LABEL_SCALE, 1);
  if (onTop) sprite.renderOrder = 1202;
  const made = title;
  let shown = null;
  sprite.setLevel = (n, title = made) => {
    const text = title ? `${title} · Lv ${n}` : `Lv ${n}`;
    if (text === shown) return;
    shown = text;
    ctx.font = `bold 48px ${DISPLAY}`;
    // as wide as the text needs; a texture once uploaded keeps its size, so a new width needs a
    // new one
    const width = Math.ceil(Math.max(256, ctx.measureText(text).width + 24));
    if (width !== canvas.width) {
      canvas.width = width;
      sprite.material.map.dispose(); sprite.material.map = new THREE.CanvasTexture(canvas);
    } else ctx.clearRect(0, 0, canvas.width, canvas.height);
    sprite.scale.x = canvas.width / 256 * .7 * LABEL_SCALE;
    ctx.font = `bold 48px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const x = canvas.width / 2;
    ctx.lineWidth = 10; ctx.strokeStyle = '#171c25'; ctx.strokeText(text, x, 32);
    ctx.fillStyle = color; ctx.fillText(text, x, 32);
    sprite.material.map.needsUpdate = true;
  };
  sprite.setLevel(level);
  return sprite;
}

// a line of text floating over a figure (drawn over the world); setText(text, color) redraws it
// when it changed, null hides it
export function makeNote() {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 1202; sprite.visible = false;
  let shown = null;
  sprite.setText = (text, color = '#ffe4ae') => {
    sprite.visible = !!text;
    if (!text || text + color === shown) return;
    shown = text + color;
    ctx.font = `bold 44px ${DISPLAY}`;
    canvas.width = Math.ceil(ctx.measureText(text).width + 24); canvas.height = 64;
    ctx.font = `bold 44px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = '#171c25'; ctx.strokeText(text, canvas.width / 2, 32);
    ctx.fillStyle = color; ctx.fillText(text, canvas.width / 2, 32);
    texture.needsUpdate = true;
    sprite.scale.set(canvas.width / 256 * .8 * INDICATOR_SCALE, .2 * INDICATOR_SCALE, 1);
  };
  return sprite;
}

// the "!" over an enemy that has just noticed the player (one texture for all of them)
let alertMaterial = null;
export function makeAlertMark() {
  if (!alertMaterial) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = `bold 56px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = '#171c25'; ctx.strokeText('!', 32, 34);
    ctx.fillStyle = '#ffcf4a'; ctx.fillText('!', 32, 34);
    alertMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false, depthTest: false });
  }
  const sprite = new THREE.Sprite(alertMaterial);
  sprite.visible = false; sprite.renderOrder = 1202;   // over the world, like the labels
  return sprite;
}
