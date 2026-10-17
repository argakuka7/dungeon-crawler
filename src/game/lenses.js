// Lenses: the game's own rules drawn over the world (render/overlay.js), switched on to show why
// something happens (game/teach.js, the Teacher). Every frame they draw from the real state with
// the real functions (inSwordArc, notices, the planned paths), so what a lens shows is what the
// game does.
//   sword      the reach and angle of the weapon in hand: dim while ready, yellow in the wind-up,
//              red while the blade can hit (inSwordArc); enemies it would hit now get a red ring
//   awareness  how each enemy notices the player (notices): its aggro ahead, half that behind,
//              the circle it hears in, its state (mode) over its head, and a line of sight to the
//              player when it is close: red when it would notice, grey when it would not
//   paths      the way each enemy plans to go (e.path, found by findPath), where a hunting one
//              last saw the player (e.seen, a "?") and, going home, its home
//   grid       the squares of the cube's floors, with their x,z on every fourth one
//   route      the routes through the cube (as the P key shows them)
import * as THREE from 'three';
import { combatStats, inSwordArc } from '../core/combat.js';
import { topOf } from '../core/surfaces.js';
import { groundY } from '../physics/enemynav.js';
import { overlay, fan, tube, pin, label, tint, fade, dispose } from '../render/overlay.js';
import { player, state } from './state.js';
import { allEnemies } from './enemies.js';
import { AHEAD, BEHIND, HEAR, WARY, notices } from './enemyai.js';

export const LENSES = ['sword', 'awareness', 'paths', 'grid', 'route'];
const on = new Map();   // lens -> { of: Set of enemies, or null for all }
const root = new THREE.Group();
root.name = 'lenses';
overlay.add(root);

// drawn things, rebuilt only when what they look like changes (`key`); unused ones go
const views = new Map();   // id -> { obj, key, frame }
let frame = 0;
function view(id, key, build) {
  let v = views.get(id);
  if (v && v.key !== key) { dispose(v.obj); v = null; }
  if (!v) { v = { obj: build(), key }; views.set(id, v); root.add(v.obj); }
  v.frame = frame;
  return v.obj;
}
const ids = new WeakMap();
let serial = 0;
const idOf = e => { if (!ids.has(e)) ids.set(e, ++serial); return ids.get(e); };

// a straight bar from a to b: one unit cylinder, stretched and turned
const UP = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), B = new THREE.Vector3();
function bar(id, a, b, color, width = 0.04, opacity = 0.85) {
  const obj = view(id, `${color}:${width}:${opacity}`, () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, 1, 6).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false }));
    m.renderOrder = 1252;
    return m;
  });
  A.set(a.x, a.y, a.z); B.set(b.x, b.y, b.z).sub(A);
  obj.position.copy(A); obj.scale.set(1, B.length(), 1); obj.quaternion.setFromUnitVectors(UP, B.normalize());
}

const MOOD = { idle: '#7dffa0', walk: '#7dffa0', home: '#7dd3ff', search: '#c49cff', alert: '#ffb347', chase: '#ff5a4a',
  attack: '#ff2a2a', defend: '#ffd34a', hide: '#5ad1c4' };
const UNAWARE = new Set(['idle', 'walk', 'home', 'search']);
const living = () => allEnemies().filter(e => e.mode !== 'dead');
const chosen = name => { const of = on.get(name)?.of; return living().filter(e => !of || of.has(e)); };

function sword() {
  const s = player.sword, stats = s.active ? s.stats : combatStats(player);
  if (!stats || player.hp <= 0) return;
  const yaw = s.active ? s.yaw : player.yaw;
  const phase = !s.active ? 'ready' : s.t < stats.activeStart ? 'windup' : s.t <= stats.activeEnd ? 'hit' : 'recover';
  const half = stats.ranged ? 0.03 : stats.arc;
  const g = view('sword', `${stats.range}:${half}`, () => fan(stats.range, { half, fill: 0.2 }));
  g.position.set(player.x, player.visY + 0.05, player.z);
  g.rotation.y = yaw;
  tint(g, { ready: '#9fd3ff', windup: '#ffd34a', hit: '#ff4a3a', recover: '#9fd3ff' }[phase]);
  fade(g, { ready: 0.7, windup: 1.2, hit: 2, recover: 0.4 }[phase]);
  if (stats.ranged) return;
  // the enemies the blade would hit if it swung now: the real test, with a swing at its first hitting moment
  const probe = { x: player.x, y: player.y, z: player.z, sword: { active: true, stats, t: stats.activeStart, yaw, hits: new Set() } };
  for (const e of living()) {
    if (Math.hypot(e.x - player.x, e.z - player.z) > stats.range + e.profile.radius + 2) continue;
    const r = e.profile.radius, hit = inSwordArc(probe, e);
    const ring = view(`sword:${idOf(e)}`, `${r}`, () => fan(r, { fill: 0.3, width: 0.06 }));
    ring.position.set(e.x, e.y + 0.06, e.z);
    tint(ring, hit ? '#ff4a3a' : '#ffffff');
    fade(ring, hit ? 1 : 0.35);
  }
}

function awareness() {
  const ahead = Math.acos(AHEAD);
  for (const e of chosen('awareness')) {
    const id = idOf(e), a = e.profile.aggro, unaware = UNAWARE.has(e.mode);
    const color = unaware && e.wary ? '#ffe14a' : MOOD[e.mode] ?? '#d8d2c4';
    const g = view(`aware:${id}`, `${a}`, () => {
      const g = new THREE.Group(), back = fan(a * BEHIND, { half: Math.PI - ahead, fill: 0.1 });
      back.rotation.y = Math.PI;
      g.add(fan(a, { half: ahead, fill: 0.14 }), back, fan(HEAR, { fill: 0.06, rim: 0.5, width: 0.03 }));
      return g;
    });
    g.position.set(e.x, e.y + 0.04, e.z);
    g.rotation.y = e.yaw;
    tint(g, color);
    fade(g, unaware ? 1 : 0.5);
    const text = e.mode + (e.mode === 'alert' ? '!' : unaware && e.wary ? '?' : '');
    const tag = view(`aware-tag:${id}`, text + color, () => label(text, { color, size: 0.22 }));
    tag.position.set(e.x, e.y + e.profile.bodyHeight + 0.3, e.z);
    // its line of sight to the player, when the player is near enough for it to matter
    const d = Math.hypot(player.x - e.x, player.z - e.z);
    if (unaware && d < Math.max(a * WARY, HEAR) + 1 && Math.abs(player.y - e.y) < 2.5) {
      const seen = notices(e);
      bar(`aware-sight:${id}`, { x: e.x, y: e.y + Math.min(e.profile.bodyHeight, 1) * 0.8, z: e.z },
        { x: player.x, y: player.y + 0.6, z: player.z }, seen ? '#ff4a3a' : '#9aa3b0', 0.035, seen ? 0.9 : 0.45);
    }
  }
}

const centre = f => ({ x: f.x + 0.5, y: groundY(f, f.x + 0.5, f.z + 0.5) + 0.08, z: f.z + 0.5 });
function paths() {
  for (const e of chosen('paths')) {
    const id = idOf(e), color = MOOD[e.mode] ?? '#d8d2c4';
    if (e.path?.length > 1)
      view(`path:${id}`, `${e.path.map(f => f.id ?? `${f.x},${f.z}`).join(' ')}:${color}`,
        () => tube(e.path.map(centre), { color, width: 0.08, opacity: 0.8, head: true }));
    if (e.seen && (e.mode === 'chase' || e.mode === 'search' || e.mode === 'alert' || e.mode === 'hide')) {
      const p = view(`path-seen:${id}`, color, () => { const g = pin({ color }), q = label('?', { color, size: 0.22 }); q.position.y = 1.35; g.add(q); return g; });
      p.position.set(e.seen.x, e.seen.y, e.seen.z);
    }
    if (e.mode === 'home' && e.home) {
      const h = view(`path-home:${id}`, 'home', () => fan(0.45, { r0: 0.3, color: MOOD.home, fill: 0.3 }));
      Object.assign(h.position, centre(e.home));
    }
  }
}

function grid() {
  const m = state.map;
  view('grid', state.cubeKey, () => {
    const g = new THREE.Group(), pts = [];
    for (const f of m.floors) {
      const c = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => new THREE.Vector3(f.x + u, topOf(f, u, v) + 0.03, f.z + v));
      for (let i = 0; i < 4; i++) pts.push(c[i], c[(i + 1) % 4]);
      if (f.x % 4 === 0 && f.z % 4 === 0) {
        const tag = label(`${f.x},${f.z}`, { color: '#cfe8ff', size: 0.13 });
        tag.position.set(f.x + 0.5, topOf(f, 0.5, 0.5) + 0.05, f.z + 0.5);
        g.add(tag);
      }
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    lines.renderOrder = 1240;
    g.add(lines);
    return g;
  });
}

const DRAW = { sword, awareness, paths, grid };

// switch a lens on or off; of: only these enemies (one, or a list) for awareness and paths
export function lens(name, enable = true, { of = null } = {}) {
  if (!LENSES.includes(name)) throw new Error(`There is no lens "${name}". Lenses: ${LENSES.join(', ')}`);
  if (enable) on.set(name, { of: of ? new Set([of].flat()) : null });
  else on.delete(name);
  if (name === 'route') {
    state.showPath = !!enable;
    if (state.world) state.world.pathLine.visible = state.showPath;
  }
  return lensesOn();
}
export const lensesOn = () => [...on.keys()];
export function resetLenses() { for (const name of lensesOn()) lens(name, false); }

// once per frame, after the camera; hidden: while travelling between cubes
export function tickLenses(hidden) {
  frame++;
  root.visible = !hidden && !!state.map;
  if (root.visible) for (const name of on.keys()) DRAW[name]?.();
  for (const [id, v] of views) if (v.frame !== frame && !(hidden && on.size)) { dispose(v.obj); views.delete(id); }
}
