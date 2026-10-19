// Shapes drawn over the world for teaching and debugging (game/teach.js, game/lenses.js): flat
// slices and rings on the ground, squares of the grid, tubes along a way, arrows, pins and text
// labels. They are in cube coordinates, drawn over everything (no depth test, so walls never hide
// them) and never touch the game.
// Directions are the game's yaw: 0 looks along +z, and yaw a points at (sin a, cos a).
import * as THREE from 'three';
import { scene } from './scene.js';
import { BODY } from './fonts.js';

export const overlay = new THREE.Group();
overlay.name = 'overlay';
scene.add(overlay);

const ORDER = 1250;   // over the world and its effects, under the damage numbers (1300)
const UP = new THREE.Vector3(0, 1, 0);

export function material(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
}
function mesh(geometry, color, opacity, order = 0) {
  const m = new THREE.Mesh(geometry, material(color, opacity));
  m.renderOrder = ORDER + order;
  m.userData.opacity = opacity;   // what fade() scales
  return m;
}

// a flat band of a ring on the ground from radius r0 to r1, from yaw a0 to a1
function bandGeometry(r0, r1, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 32))), pos = [], index = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, s = Math.sin(a), c = Math.cos(a);
    pos.push(s * r0, 0, c * r0, s * r1, 0, c * r1);
    if (i) index.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setIndex(index);
}
// a thin flat strip on the ground from (x0, z0) to (x1, z1)
function stripGeometry(x0, z0, x1, z1, w) {
  const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * w / 2, nz = (x1 - x0) / l * w / 2;
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    x0 + nx, 0, z0 + nz, x0 - nx, 0, z0 - nz, x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz], 3)).setIndex([0, 1, 2, 1, 3, 2]);
}

// A slice of a disc on the ground around its group's origin, looking along +z (turn the group to
// aim it): radius r, `half` its half-angle (Math.PI: the whole disc), from radius r0 (a ring).
// A see-through fill with a stronger rim. Returns a group.
export function fan(r, { half = Math.PI, r0 = 0, color = '#ffffff', fill = 0.18, rim = 0.85, width = 0.05 } = {}) {
  const g = new THREE.Group(), whole = half >= Math.PI - 1e-6;
  if (fill > 0) g.add(mesh(bandGeometry(r0, r, -half, half), color, fill));
  if (rim > 0) {
    g.add(mesh(bandGeometry(Math.max(r0, r - width), r, -half, half), color, rim, 1));
    if (r0 > width) g.add(mesh(bandGeometry(r0, r0 + width, -half, half), color, rim, 1));
    if (!whole) for (const a of [-half, half])
      g.add(mesh(stripGeometry(Math.sin(a) * r0, Math.cos(a) * r0, Math.sin(a) * r, Math.cos(a) * r, width), color, rim, 1));
  }
  return g;
}

// one square of the grid, its corner at the group's origin: a fill and a rim
export function square({ size = 1, color = '#ffffff', fill = 0.25, rim = 0.9, width = 0.05 } = {}) {
  const g = new THREE.Group(), s = size, w = width;
  const plane = new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2).translate(s / 2, 0, s / 2);
  if (fill > 0) g.add(mesh(plane, color, fill));
  if (rim > 0) for (const [a, b, c, d] of [[0, w / 2, s, w / 2], [0, s - w / 2, s, s - w / 2], [w / 2, 0, w / 2, s], [s - w / 2, 0, s - w / 2, s]])
    g.add(mesh(stripGeometry(a, b, c, d, w), color, rim, 1));
  return g;
}

// a round tube through points [{ x, y, z }, ...] (world positions), with an arrow head at the end
export function tube(points, { color = '#ffffff', width = 0.07, opacity = 0.9, head = false } = {}) {
  const g = new THREE.Group(), pts = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  for (let i = pts.length - 1; i > 0; i--) if (pts[i].distanceTo(pts[i - 1]) < 1e-4) pts.splice(i, 1);
  if (pts.length < 2) return g;
  const end = pts.at(-1), dir = end.clone().sub(pts.at(-2)), last = dir.length();
  const headLen = head ? Math.min(width * 4, last * 0.6) : 0;
  if (head) pts[pts.length - 1] = end.clone().addScaledVector(dir.normalize(), -headLen);
  const path = new THREE.CurvePath();
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
  g.add(mesh(new THREE.TubeGeometry(path, Math.max(1, pts.length - 1) * 4, width / 2, 8), color, opacity));
  if (head) {
    const cone = mesh(new THREE.ConeGeometry(width * 1.8, headLen, 12).translate(0, -headLen / 2, 0), color, opacity, 1);
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(UP, dir);
    g.add(cone);
  }
  return g;
}

// a pin standing on its group's origin: a point hovering over a small ring on the ground
export function pin({ color = '#ffcf4a', height = 1.1 } = {}) {
  const g = fan(0.22, { r0: 0.12, color, fill: 0.5, rim: 0.9, width: 0.04 });
  const head = mesh(new THREE.ConeGeometry(0.16, 0.36, 4).rotateX(Math.PI).translate(0, height, 0), color, 0.95, 2);
  const stem = mesh(new THREE.CylinderGeometry(0.015, 0.015, height - 0.18, 6).translate(0, (height - 0.18) / 2, 0), color, 0.6, 2);
  g.add(head, stem);
  return g;
}

// words on a dark bubble, always facing the camera; size: world height of one line
export function label(text, { color = '#ffe4ae', size = 0.26, background = '#1b1710' } = {}) {
  const lines = String(text).split('\n'), px = 40, pad = 14, canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  const font = `bold ${px}px ${BODY}`;
  ctx.font = font;
  canvas.width = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + pad * 2;
  canvas.height = lines.length * px * 1.2 + pad * 2;
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = background; ctx.globalAlpha = 0.82;
  ctx.beginPath(); ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, 14); ctx.fill();
  ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = color;
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, pad + px * 1.2 * (i + 0.5)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, fog: false }));
  const h = size * (lines.length * 1.2 + pad * 2 / px);
  sprite.scale.set(h * canvas.width / canvas.height, h, 1);
  sprite.center.set(0.5, 0);   // its bottom edge sits on the point
  sprite.renderOrder = ORDER + 3;
  sprite.userData.opacity = 1;
  return sprite;
}

// recolour every part of a drawing (keeps their opacity)
export function tint(obj, color) {
  const c = new THREE.Color(color);
  obj.traverse(o => { if (o.material && !o.isSprite) o.material.color.copy(c); });
}
// scale every part's opacity by k (for pulsing and fading)
export function fade(obj, k) {
  obj.traverse(o => { if (o.material) o.material.opacity = (o.userData.opacity ?? 1) * k; });
}
export function dispose(obj) {
  obj.removeFromParent();
  obj.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
}
