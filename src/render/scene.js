// Renderer, scene, lights and camera.
import * as THREE from 'three';
import { N } from '../core/constants.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// The canvas fills the window by CSS (style.css, #view), so it can never be wider or taller than
// the page: on an iPad a canvas bigger than the page for a moment (turning it, the keyboard) made
// Safari change its zoom, and nothing turned it back. Its drawing buffer follows the layout
// viewport: not innerWidth / innerHeight, which in Safari are the visual viewport (smaller while
// the keyboard is up or the page is zoomed, stale while an iPad turns).
export const viewSize = () => ({ w: document.documentElement.clientWidth || innerWidth, h: document.documentElement.clientHeight || innerHeight });
export function fitView() {
  const { w, h } = viewSize();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
renderer.domElement.id = 'view';
renderer.setSize(viewSize().w, viewSize().h, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // soft since r182 (PCFSoftShadowMap is gone)
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 1e4, 2e4);   // always present (adding fog later recompiles shaders)

// the backdrop (sky gradient, clouds, stars) is in sky.js

// learn: drawing.html#camera (see learn/README.md)
export const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 500);

// learn: drawing.html#light (see learn/README.md)
export const hemi = new THREE.HemisphereLight(0xdfeaff, 0x3a3020, 1.1);
scene.add(hemi);
// learn: drawing.html#light (see learn/README.md)
export const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
sun.position.set(N / 2 - 12, 34, N / 2 + 8);
sun.target.position.set(N / 2, 0, N / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

addEventListener('resize', fitView);
// and whenever the canvas itself changes size: iOS settles the sizes late after a turn
new ResizeObserver(() => fitView()).observe(renderer.domElement);
