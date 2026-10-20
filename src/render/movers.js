// The platforms floating round Foggery's tower (game/movers.js moves them, physics/collide.js
// keeps them): slabs of dark basalt two cells square, a seam of glowing lava round their sides and
// a ring of runes glowing on top, and under them the glow of the magic that keeps them up. None
// shows until they rise out of the lava (game/movers.js); each frame they go where the physics has
// them.
import * as THREE from 'three';
import { PLATFORMS } from '../core/foggery.js';
import { moversNow } from '../physics/collide.js';
import { cutMaterial } from './section.js';

const S = PLATFORMS.size, INSET = 0.03;
export function buildMoverView(m, group) {
  const thick = m.movers.thick, root = new THREE.Group();
  const stone = cutMaterial(new THREE.MeshStandardMaterial({ color: '#57504b', roughness: 0.92 }), 'self', false);
  const seam = cutMaterial(new THREE.MeshStandardMaterial({ color: '#3a2a22', emissive: '#ff6a1a', emissiveIntensity: 1.3, roughness: 0.8 }), 'self', false);
  const rune = cutMaterial(new THREE.MeshBasicMaterial({ color: '#ffb050', transparent: true, opacity: 0.75 }), false, false);
  const slab = new THREE.BoxGeometry(S - 2 * INSET, thick, S - 2 * INSET).translate(S / 2, -thick / 2, S / 2);
  const band = new THREE.BoxGeometry(S - 2 * INSET + 0.02, 0.05, S - 2 * INSET + 0.02).translate(S / 2, -thick * 0.55, S / 2);
  const ring = new THREE.RingGeometry(0.52, 0.6, 32).rotateX(-Math.PI / 2).translate(S / 2, 0.006, S / 2);
  const glyphs = new THREE.RingGeometry(0.24, 0.29, 6).rotateX(-Math.PI / 2).translate(S / 2, 0.006, S / 2);
  const glow = new THREE.CircleGeometry(0.85, 24).rotateX(Math.PI / 2).translate(S / 2, -thick - 0.02, S / 2);
  const under = cutMaterial(new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), false, false);
  const meshes = m.movers.start.map(() => {
    const g = new THREE.Group(), s = new THREE.Mesh(slab, stone);
    s.castShadow = true; s.receiveShadow = true;
    g.add(s, new THREE.Mesh(band, seam), new THREE.Mesh(ring, rune), new THREE.Mesh(glyphs, rune), new THREE.Mesh(glow, under));
    root.add(g);
    return g;
  });
  group.add(root);
  return { root, meshes, rune, under, top: m.movers.top };
}
export function tickMoverView(view, time) {
  if (!view) return;
  const list = moversNow();
  view.meshes.forEach((g, i) => {
    const o = list[i];
    g.visible = !!o;
    if (o) g.position.set(o.x0, o.y1, o.z0);
  });
  view.rune.opacity = 0.6 + 0.2 * Math.sin(time * 2.3);
  view.under.opacity = 0.28 + 0.1 * Math.sin(time * 3.1);
}
