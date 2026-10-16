// Debug tools, only with ?dev in the URL:
//   click a portal: take it            G: go to the nearest way down on this depth
//   H: try this depth's wild horde
//   PageDown / PageUp: go down / up a depth right away (finding the well / ring first)
//   Alt + WASD / arrows: go to the adjacent cube on that side of the screen
// None of them wait for guardians: locked portals are taken anyway (the gate stays locked).
// The console's developer commands (game/devcommands.js: /find, /goto, /horde, /arena, /go) do the same.
import * as THREE from 'three';
import { camera, renderer } from '../render/scene.js';
import { step } from '../world/coords.js';
import { boundaryArrival } from '../core/boundaries.js';
import { state, player, view, setStatus } from './state.js';
import { whenReady } from './hud.js';
import { startTravel } from './travel.js';
import { enterCube, arrivalPoint, spawnAt } from './flow.js';
import { clearMouseInput } from './orders.js';
import { takeTownPortal } from './townportal.js';

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const D = [[1, 0], [-1, 0], [0, 1], [0, -1]], NAMES = ['east', 'west', 'south', 'north'];

export function takePortal(q) {
  if (state.transitioning || state.inventoryOpen || q.kind === 'spawn') return;
  if (q.kind === 'town') { takeTownPortal(); return; }
  clearMouseInput();
  const [x, z] = q.kind === 'side' ? [q.x + 0.5 + D[q.dir][0] * 0.3, q.z + 0.5 + D[q.dir][1] * 0.3] : [q.x + 0.5, q.z + 0.5];
  Object.assign(player, { x, z, y: q.y, visY: q.y, vx: 0, vy: 0, vz: 0, grounded: true, ragdoll: null });
  startTravel(q, { force: true });
}

function portalAt(e) {
  if (state.inventoryOpen || !state.world || e.target !== renderer.domElement) return null;
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(state.world.portalFx.map(f => f.obj), true)[0];
  for (let o = hit?.object; o; o = o.parent) if (o.userData.portal) return o.userData.portal;
  return null;
}

// breadth-first through the portals of this depth until a cube with a `kind` portal turns up
async function findCube(kind) {
  const seen = new Set([state.cubeKey]), queue = [state.cubeKey];
  while (queue.length && seen.size < 120) {
    const k = queue.shift(), c = await state.cubes.get(k);
    if (c.map.portals.some(p => p.kind === kind)) return c;
    c.info.faces.forEach((f, d) => {
      const n = step(k, d);
      if (d < 4 && f?.portal && !seen.has(n)) { seen.add(n); queue.push(n); }
    });
  }
  return null;
}

// to the nearest way `kind` ('up' or 'down') on this depth: take it, or stand next to it
export async function goTo(kind, take) {
  if (state.transitioning || state.inventoryOpen) return;
  clearMouseInput();
  state.transitioning = true;
  const c = await whenReady(findCube(kind)).catch(() => null);
  state.transitioning = false;
  if (!c) { setStatus(`No way ${kind} found on this depth`); return; }
  if (c.key !== state.cubeKey) enterCube(c, c.map.portals.find(p => p.kind !== 'spawn')?.dir ?? null);
  const q = state.map.portals.find(p => p.kind === kind);
  if (take) { takePortal(q); return; }
  const a = arrivalPoint(q);
  spawnAt(a.x, a.y, a.z);
  setStatus(`Next to the way ${kind}`);
}

// Jump to a real worker-generated encounter for playtesting, without changing the run.
export async function goHorde(depth = state.map?.depth ?? 0) {
  if (state.transitioning || state.inventoryOpen) return;
  if (!Number.isInteger(depth) || depth < 0 || depth > 20) throw new RangeError('Invalid horde depth');
  const cubes = state.cubes, key = cubes.layout(depth).hordes.keys().next().value;
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(key));
    if (state.cubes !== cubes) return;
    enterCube(c, c.map.portals[0].dir);
    setStatus(`Wild horde · depth ${depth} · ${c.map.horde.count} enemies`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// Jump into a guardian arena of a kind (world/arenas.js), the nearest depth first; with no
// kind, this depth's way down. The gate stays locked: it is the real arena.
export async function goArena(type, depth = state.map?.depth ?? 0) {
  if (state.transitioning || state.inventoryOpen) return;
  const cubes = state.cubes, order = Array.from({ length: 20 }, (_, i) => i)
    .sort((a, b) => Math.abs(a - depth) - Math.abs(b - depth) || a - b);
  let key = null;
  for (const d of type ? order : [Math.min(depth, 19)]) {
    for (const [k, g] of cubes.layout(d).guardians) if (!type || g.arena === type) { key = k; break; }
    if (key) break;
  }
  if (!key) { setStatus(`No ${type} arena in this world`); return; }
  clearMouseInput(); state.transitioning = true;
  try {
    const c = await whenReady(cubes.get(key));
    if (state.cubes !== cubes) return;
    enterCube(c, c.map.portals[0].dir);
    setStatus(`Guardian arena · ${c.map.arena.type} · depth ${c.map.depth}`);
  } finally { if (state.cubes === cubes) state.transitioning = false; }
}

// The cube faces sit on the screen diagonals, so the screen direction is turned an eighth
// clockwise first: W is the upper-right face, D the lower-right, S the lower-left, A the upper-left.
const SCREEN = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyD: [1, 0], ArrowRight: [1, 0], KeyA: [-1, 0], ArrowLeft: [-1, 0] };
export function screenFace([ix, iy], yaw = view.yawTarget) {
  const rx = (ix + iy) / Math.SQRT2, ry = (iy - ix) / Math.SQRT2;
  const wx = Math.cos(yaw) * rx - Math.sin(yaw) * ry, wz = -Math.sin(yaw) * rx - Math.cos(yaw) * ry;
  let best = 0;
  for (let d = 1; d < 4; d++) if (D[d][0] * wx + D[d][1] * wz > D[best][0] * wx + D[best][1] * wz) best = d;
  return best;
}

// Through the side portal if there is one (the real slide), otherwise straight in, at the
// nearest safe spot to where we stand along the shared face.
export async function goAdjacent(d) {
  if (state.transitioning || state.inventoryOpen) return;
  const k = step(state.cubeKey, d);
  if (!state.cubes.layout(state.map.depth).exists.has(k)) { setStatus(`No cube to the ${NAMES[d]}`); return; }
  const q = state.map.portals.find(p => p.kind === 'side' && p.dir === d);
  if (q) { takePortal(q); return; }
  clearMouseInput();
  const cubes = state.cubes, source = state.cubeKey, at = boundaryArrival(player, d);
  state.transitioning = true;
  const c = await whenReady(cubes.get(k)).catch(() => null);
  state.transitioning = false;
  if (state.cubes !== cubes || state.cubeKey !== source) return;
  if (!c) { setStatus(`The cube to the ${NAMES[d]} failed to generate`); return; }
  enterCube(c, null, null, at);
  setStatus(`Jumped ${NAMES[d]}`);
}

if (state.dev) {
  addEventListener('click', e => { const q = portalAt(e); if (q) takePortal(q); });
  addEventListener('mousemove', e => { document.body.style.cursor = portalAt(e) ? 'pointer' : ''; });
  addEventListener('keydown', e => {
    if (e.repeat || state.inventoryOpen || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && SCREEN[e.code]) { e.preventDefault(); goAdjacent(screenFace(SCREEN[e.code])); return; }
    if (e.code === 'KeyG') goTo('down', false);
    if (e.code === 'KeyH') goHorde().catch(err => setStatus(err.message));
    if (e.code === 'PageDown') { e.preventDefault(); goTo('down', true); }
    if (e.code === 'PageUp') { e.preventDefault(); goTo('up', true); }
  });
}
