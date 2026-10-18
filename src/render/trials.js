// What a trial room shows (docs/trials.md): its parts (the flood's button on the summit, made in
// code until the parts' assets come in), the rising fluid (one surface clipped to the cube's box:
// the room fills like an aquarium) and the tide lines on the glass that warn of it.
// buildTrialView adds them to a cube being built (render/world.js); game/trials.js sets the level
// and the parts' state every frame.
import * as THREE from 'three';
import { N, BASE, LH } from '../core/constants.js';
import { EDGE_CORNERS, edgePts } from '../core/constants.js';
import { fluidMaterial, FLUID_LOOK, solidMaterial } from './materials.js';
import { TRIALS } from '../core/trials.js';
import { GeoBuilder } from './builder.js';
import { gradient } from './palette.js';
import { cutMaterial } from './section.js';
import { themeOf } from '../themes/depth.js';
import { soft, rand, emit } from './particles.js';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

// the button: a stone pedestal with a glowing knob on top
function button(p, color) {
  const g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ color: 0x8c8f99, roughness: 0.85, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 8), stone);
  base.position.y = 0.35; base.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.08, 8), stone);
  cap.position.y = 0.74;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 }));
  knob.position.y = 0.78;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 24), glow(color, 0.35));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04;
  const light = new THREE.PointLight(color, 2.5, 4, 2);
  light.position.y = 1.1;
  g.add(base, cap, knob, halo, light);
  g.position.set(p.x, p.y, p.z);
  return { obj: g, knob, halo, light };
}

const IRON = () => new THREE.MeshStandardMaterial({ color: 0x4a4d55, roughness: 0.55, metalness: 0.6, flatShading: true });
const STONE = () => new THREE.MeshStandardMaterial({ color: 0x8c8f99, roughness: 0.85, flatShading: true });

// a pressure plate: a stone slab, its rune glowing once it holds
function plate(p, color) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8), STONE());
  slab.position.y = 0.04; slab.receiveShadow = true;
  const rune = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 4), glow(color, 0.5));
  rune.rotation.x = -Math.PI / 2; rune.rotation.z = Math.PI / 4; rune.position.y = 0.085;
  g.add(slab, rune);
  g.position.set(p.x, p.y, p.z);
  return { obj: g, rune, color: new THREE.Color(color) };
}
// a portcullis across a gap (across the way through, side: the way), w cells wide; it rises open
function portcullis(p) {
  const g = new THREE.Group(), w = p.w ?? 1, bars = new THREE.Group(), iron = IRON();
  for (let i = 0; i <= 4 * w; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), iron);
    b.position.set(-w / 2 + 0.06 + i * (w - 0.12) / (4 * w), 1.1, 0); b.castShadow = true; bars.add(b);
  }
  for (const y of [0.5, 1.3, 2.05]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.08), iron); r.position.y = y; bars.add(r); }
  const stone = STONE();
  for (const x of [-w / 2 - 0.08, w / 2 + 0.08]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.3), stone); post.position.set(x, 1.3, 0); post.castShadow = true; g.add(post); }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.32, 0.2, 0.32), stone); lintel.position.y = 2.65; g.add(lintel);
  g.add(bars);
  g.position.set(p.x, p.y, p.z);
  if (p.side >= 2) g.rotation.y = 0; else g.rotation.y = Math.PI / 2;
  return { obj: g, bars, open: 0, want: 0 };
}
// a lever on a stone block: its handle leans one way or the other (the reset lever: red knob)
function lever(p, color) {
  const g = new THREE.Group(), base = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.3), STONE());
  base.position.y = 0.175; base.castShadow = true;
  const arm = new THREE.Group(), stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), IRON());
  stick.position.y = 0.35;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: p.type === 'reset' ? 0xd04030 : color, roughness: 0.5 }));
  knob.position.y = 0.72;
  arm.add(stick, knob); arm.position.y = 0.32;
  g.add(base, arm);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.yaw ?? 0;
  return { obj: g, arm, angle: -0.6, want: -0.6 };
}
// a cage round a vault's chest: bars on all four sides; it sinks into the ground open
function cage(a) {
  const g = new THREE.Group(), bars = new THREE.Group(), iron = IRON();
  for (let s = 0; s < 4; s++) for (let i = 0; i < 5; i++) {
    const t = -0.5 + i * 0.25, [x, z] = [[t, -0.55], [t, 0.55], [-0.55, t], [0.55, t]][s];
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), iron); b.position.set(x, 0.65, z); bars.add(b);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 1.16), iron); top.position.y = 1.32; bars.add(top);
  g.add(bars);
  g.position.set(a.x, a.y, a.z);
  return { obj: g, bars, open: 0, want: 0 };
}

// --- the grid puzzles' parts (mirror, braziers, channels) ---------------------------------------
const BEAM_Y = 0.75;   // how high over the field the beam runs
// a mirror on a turntable: a pane at 45 degrees, turned the other way by its bit
function mirrorPart(p) {
  const g = new THREE.Group(), stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.18, 10), STONE());
  stand.position.y = 0.09;
  const turn = new THREE.Group(), pane = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xd8e6f0, roughness: 0.08, metalness: 0.9 }));
  pane.position.y = BEAM_Y; pane.castShadow = true;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.08), IRON()); frame.position.y = BEAM_Y - 0.34;
  turn.add(pane, frame);
  g.add(stand, turn);
  g.position.set(p.x, p.y, p.z);
  return { obj: g, turn, angle: 0 };
}
// the emitter (a crystal that shines its beam) and the receiver (a crystal that lights when hit)
function crystal(p, color) {
  const g = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 6), STONE());
  base.position.y = 0.25;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }));
  gem.position.y = BEAM_Y;
  const light = new THREE.PointLight(color, 1, 3, 2); light.position.y = BEAM_Y;
  g.add(base, gem, light);
  g.position.set(p.x, p.y, p.z);
  return { obj: g, gem, light };
}
// a brazier: a bowl on a stand, its flame when lit
function brazierPart(p) {
  const g = new THREE.Group(), iron = IRON();
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 6), iron); leg.position.y = 0.3;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.2, 10, 1, true), iron); bowl.position.y = 0.66; bowl.material.side = THREE.DoubleSide;
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.27, 10), new THREE.MeshStandardMaterial({ color: 0x2a1a14, emissive: 0x401000 }));
  coals.rotation.x = -Math.PI / 2; coals.position.y = 0.7;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
  flame.position.y = 0.98;
  const light = new THREE.PointLight(0xff9040, 2.2, 4, 2); light.position.y = 1.1;
  g.add(leg, bowl, coals, flame, light);
  g.position.set(p.x, p.y, p.z);
  return { obj: g, flame, light, lit: null };
}
// a channel tile: a stone slab with its grooves (unturned: I along x, L to +x and +z, T to +x, -x
// and +z), the water in them when wet; turned a quarter clockwise per bit
function tilePart(p) {
  const g = new THREE.Group(), turn = new THREE.Group(), slab = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.1, 0.96), STONE());
  slab.position.y = 0.05; slab.receiveShadow = true;
  const water = new THREE.MeshStandardMaterial({ color: 0x2e86de, emissive: 0x0a2a4a, transparent: true, opacity: 0.85 });
  const groove = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 1 });
  const arms = { I: [0, 1], L: [0, 2], T: [0, 1, 2] }[p.shape], wet = [];
  for (const d of [...arms, 'c']) {
    const [w, l, x, z] = d === 'c' ? [0.26, 0.26, 0, 0] : d < 2 ? [0.5, 0.26, d ? -0.24 : 0.24, 0] : [0.26, 0.5, 0, 0.24];
    const gr = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, l), groove); gr.position.set(x, 0.105, z); turn.add(gr);
    const wa = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.02, l * 0.8), water); wa.position.set(x, 0.12, z); wa.visible = false; turn.add(wa); wet.push(wa);
  }
  g.add(slab, turn);
  g.position.set(p.x, p.y, p.z);
  return { obj: g, turn, wet, angle: 0 };
}
// the spout (a pipe pouring onto the field) and the wheel (it turns while the water drives it)
function spoutPart(p, lava) {
  const g = new THREE.Group(), pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), IRON());
  pipe.rotation.z = Math.PI / 2; pipe.position.y = 0.35;
  const stream = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.14), new THREE.MeshStandardMaterial({ color: lava ? 0xff6a00 : 0x3f8fe0, emissive: lava ? 0xff3a00 : 0x0a2a4a }));
  stream.position.set(0.35, 0.18, 0);
  g.add(pipe, stream);
  g.position.set(p.x, p.y, p.z); g.rotation.y = [Math.PI, 0, Math.PI / 2, -Math.PI / 2][p.side];
  return { obj: g };
}
function wheelPart(p) {
  const g = new THREE.Group(), wheel = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.8 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), wood); wheel.add(rim);
  for (let i = 0; i < 6; i++) { const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.2), wood); paddle.position.set(Math.cos(i * Math.PI / 3) * 0.42, Math.sin(i * Math.PI / 3) * 0.42, 0); paddle.rotation.z = i * Math.PI / 3; wheel.add(paddle); }
  wheel.position.y = 0.5;
  g.add(wheel);
  g.position.set(p.x, p.y, p.z); g.rotation.y = p.side < 2 ? 0 : Math.PI / 2;
  return { obj: g, wheel, spin: 0 };
}
// the carved lines between linked braziers
function linkLines(pz) {
  const pts = [], at = new Map(pz.parts.filter(p => p.type === 'brazier').map(p => [p.i, p]));
  pz.field.links.forEach((list, i) => { for (const j of list) if (j > i) { const a = at.get(i), b = at.get(j); pts.push(a.x, a.y + 0.03, a.z, b.x, b.y + 0.03, b.z); } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.8 }));
}

// tide lines: marks on the glass all round, every few levels up to where the water will stop
function tideLines(tl) {
  const pts = [], e = 0.03;
  for (let l = tl.from + 3; l <= tl.to; l += 3) {
    const y = l * LH;
    pts.push(e, y, e, N - e, y, e, N - e, y, e, N - e, y, N - e, N - e, y, N - e, e, y, N - e, e, y, N - e, e, y, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45, depthWrite: false }));
}

// a seal across an open face (its portal's gate is gone, the face open): a red curtain with a
// cross, where the portal was
function barrier(p) {
  const g = new THREE.Group(), red = 0xff3547;
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), glow(red, 0.28));
  curtain.material.side = THREE.DoubleSide; curtain.position.y = 1.1;
  g.add(curtain);
  for (const yaw of [-0.6, 0.6]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.1), glow(red, 0.9));
    bar.material.side = THREE.DoubleSide; bar.rotation.z = yaw; bar.position.set(0, 1.1, 0.01); g.add(bar);
  }
  const out = 0.06, pos = [[N - out, p.z + 0.5], [out, p.z + 0.5], [p.x + 0.5, N - out], [p.x + 0.5, out]][p.dir];
  g.position.set(pos[0], p.y, pos[1]);
  if (p.dir < 2) g.rotation.y = Math.PI / 2;
  g.visible = false;
  return g;
}

// a crust cell of the crumbling floor (cubegen/trials/collapse.js): its column of rock, drawn
// on its own (render/floors.js leaves it out) round its centre, so it can shake and fall
function crustCell(m, f, theme) {
  const b = new GeoBuilder(), cs = f.cs, y0 = f.bottom * LH, cx = f.x + 0.5, cz = f.z + 0.5;
  const avg = (cs[0] + cs[1] + cs[2] + cs[3]) / 4, top = gradient(theme.top, avg / LH).multiplyScalar(0.92);
  const P = [[-0.5, cs[0], -0.5], [0.5, cs[1], -0.5], [-0.5, cs[2], 0.5], [0.5, cs[3], 0.5]];
  b.tri(P[0], P[1], P[3], top, [0, 1, 0]); b.tri(P[0], P[3], P[2], top, [0, 1, 0]);
  for (let d = 0; d < 4; d++) {
    const [a, c] = EDGE_CORNERS[d], [p0, p1] = edgePts(f.x, f.z, d), side = gradient(theme.side, avg / LH).multiplyScalar(d & 1 ? 0.8 : 0.9);
    const A = [p0[0] - cx, cs[a], p0[1] - cz], B = [p1[0] - cx, cs[c], p1[1] - cz];
    b.quad([A[0], y0, A[2]], [B[0], y0, B[2]], B, A, [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][d], side);
  }
  const mesh = new THREE.Mesh(b.build(), cutMaterial(solidMaterial('full')));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.set(cx, 0, cz);
  return mesh;
}

export function buildTrialView(m, group) {
  const t = m.trial;
  if (!t) return null;
  const color = new THREE.Color(TRIALS[t.kind].color);
  const view = { kind: t.kind, parts: new Map(), water: null, tide: null, level: null, phase: null, barriers: new Map(), crust: null,
    plates: new Map(), gates: new Map(), levers: new Map(), cage: null, grid: new Map(), beams: new Map(), driven: new Set() };
  if (t.crust) {
    const theme = themeOf(m);
    view.crust = new Map(t.crust.map(q => {
      const f = m.floors[q.f], mesh = crustCell(m, f, theme);
      group.add(mesh);
      return [q.c, { mesh, f, state: 'whole', t: 0, base: mesh.material.color.clone() }];
    }));
  }
  for (const p of m.portals) if (p.kind === 'side') { const b = barrier(p); group.add(b); view.barriers.set(p.dir, b); }
  for (const p of t.parts || []) {
    if (p.type === 'button') { const b = button(p, color); group.add(b.obj); view.parts.set(p.id, b); }
    if (p.type === 'plate') { const b = plate(p, color); b.puzzle = p.puzzle ?? 0; group.add(b.obj); view.plates.set(p.id, b); }
    if (p.type === 'gate') { const b = portcullis(p); b.puzzle = p.puzzle ?? 0; group.add(b.obj); view.gates.set(p.id, b); }
    if (p.type === 'lever' || p.type === 'reset') { const b = lever(p, color); group.add(b.obj); view.levers.set(p.id, b); }
    const grid = p.type === 'mirror' ? mirrorPart(p) : p.type === 'emitter' ? crystal(p, 0xffe060) : p.type === 'receiver' ? crystal(p, 0x6080a0)
      : p.type === 'brazier' ? brazierPart(p) : p.type === 'tile' ? tilePart(p) : p.type === 'spout' ? spoutPart(p, t.fluid === 2) : p.type === 'wheel' ? wheelPart(p) : null;
    if (grid) { grid.part = p; group.add(grid.obj); view.grid.set(p.id, grid); }
  }
  for (const pz of t.puzzles || []) {
    if (pz.kind === 'braziers') group.add(linkLines(pz));
    if (pz.kind === 'mirror') { const beam = new THREE.Group(); group.add(beam); view.beams.set(pz.index, { group: beam, key: '' }); }
  }
  // a vault (a puzzle in a branch room): a cage round its reward site's chest
  const site = t.role === 'branch' && (m.rewardSites || [])[0];
  if (site) { view.cage = cage(site.anchor); group.add(view.cage.obj); }
  if (t.kind === 'flood' || t.kind === 'sunken') {
    const fluid = t.fluid, water = new THREE.Mesh(new THREE.BoxGeometry(N - 0.04, 1, N - 0.04), fluidMaterial(fluid, 'full'));
    water.material.side = THREE.DoubleSide;
    water.userData.fluid = fluid; water.visible = false; water.renderOrder = 5;
    water.position.set(N / 2, 0, N / 2);
    group.add(water);
    view.water = water;
    if (t.timeline) { view.tide = tideLines(t.timeline); group.add(view.tide); }
  }
  return view;
}

// the fluid's surface at y (world units; null: none), the trial's phase (the tide lines show while idle)
export function setTrialWater(world, y, phase) {
  const v = world?.trialView;
  if (!v) return;
  v.level = y; v.phase = phase;
  if (v.tide) v.tide.visible = phase === 'idle' || phase === 'armed';
  if (!v.water) return;
  v.water.visible = y != null && y > -BASE + 0.01;
  if (!v.water.visible) return;
  const h = y + BASE;
  v.water.scale.y = h; v.water.position.y = -BASE + h / 2;
}

// the crust as the trial says (states: cell -> 'whole' | 'shaking' | 'gone'): a cell shakes, cracks
// and drops dust, then falls away into the basin; resolved, the fallen ones rise back whole
export function setCrust(world, states, dt, resolved = false) {
  const v = world?.trialView;
  if (!v?.crust) return;
  for (const [c, cell] of v.crust) {
    const want = resolved ? 'whole' : states.get(c) ?? 'whole', m = cell.mesh;
    if (want === 'gone' && cell.state !== 'falling' && cell.state !== 'gone') { cell.state = 'falling'; cell.t = 0; dust(m, 10); }
    else if (want === 'whole' && (cell.state === 'falling' || cell.state === 'gone')) { cell.state = 'rising'; cell.t = 0; }
    else if (want === 'shaking' && cell.state === 'whole') { cell.state = 'shaking'; cell.t = 0; }
    else if (want === 'whole' && cell.state === 'shaking') cell.state = 'whole';
    cell.t += dt;
    const p = m.position;
    if (cell.state === 'shaking') {
      const k = Math.min(1, cell.t / 1.5);
      p.x = cell.f.x + 0.5 + Math.sin(cell.t * 60) * 0.035 * k; p.z = cell.f.z + 0.5 + Math.cos(cell.t * 53) * 0.035 * k; p.y = 0;
      m.material.color.copy(cell.base).multiplyScalar(1 - 0.35 * k);
      if (Math.random() < dt * 6) dust(m, 1);
    } else if (cell.state === 'falling') {
      p.y = -6 * cell.t * cell.t; m.rotation.x = cell.t * 0.6; m.rotation.z = cell.t * 0.4;
      if (cell.t > 1.4) { cell.state = 'gone'; m.visible = false; }
    } else if (cell.state === 'rising') {
      m.visible = true; m.rotation.set(0, 0, 0);
      const k = Math.min(1, cell.t / 1.2);
      p.set(cell.f.x + 0.5, -4 * (1 - k) * (1 - k), cell.f.z + 0.5);
      m.material.color.copy(cell.base);
      if (k >= 1) cell.state = 'whole';
    } else if (cell.state === 'whole') { p.set(cell.f.x + 0.5, 0, cell.f.z + 0.5); m.material.color.copy(cell.base); }
  }
}
function dust(mesh, n) {
  const at = new THREE.Vector3();
  mesh.getWorldPosition(at);
  const top = Math.max(...mesh.geometry.attributes.position.array.filter((_, i) => i % 3 === 1));
  for (let i = 0; i < n; i++) emit(soft, at.x + rand(-0.5, 0.5), at.y + top, at.z + rand(-0.5, 0.5),
    { v: [0, 0.4, 0], spread: 0.6, life: 1.1, size: 0.22, grow: 1.5, color: '#b8a888', alpha: 0.55, gravity: -0.2, drag: 1 });
}

// The grid puzzles as their bits say (game/trials.js): mirrors turned, braziers lit, tiles turned and
// wet, the beam along its way (shown: puzzle index -> { beam: { cells, lit } } | { wet, wheel })
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, depthWrite: false });
export function setGridParts(world, m, s, shown) {
  const v = world?.trialView;
  if (!v || !s) return;
  for (const [id, g] of v.grid) {
    const p = g.part, bit = s.bits?.[id] ?? 0, info = shown.get(p.puzzle ?? 0);
    if (p.type === 'mirror') g.angle += (((bit ? -1 : 1) * Math.PI / 4) - g.angle) * 0.3, g.turn.rotation.y = g.angle;
    else if (p.type === 'brazier' && g.lit !== !!bit) { g.lit = !!bit; g.flame.visible = g.lit; g.light.visible = g.lit; }
    else if (p.type === 'tile') {
      g.angle += (-bit * Math.PI / 2 - g.angle) * 0.3; g.turn.rotation.y = g.angle;
      const wet = !!info?.wet?.has(p.i);
      for (const w of g.wet) w.visible = wet;
    } else if (p.type === 'receiver') { const lit = !!info?.beam?.lit; g.gem.material.emissiveIntensity = lit ? 2.5 : 0.4; g.light.intensity = lit ? 3 : 0.3; }
    else if (p.type === 'wheel') g.driven = !!info?.wheel;
  }
  for (const [i, b] of v.beams) {
    const beam = shown.get(i)?.beam, pz = m.puzzles[i];
    if (!beam || !pz) continue;
    const key = beam.cells.map(c => c.join(',')).join(' ') + beam.lit;
    if (key === b.key) continue;
    b.key = key;
    for (const c of [...b.group.children]) { c.geometry.dispose(); b.group.remove(c); }
    const D = pz.deck, y = D.level * 0.5 + BEAM_Y, em = pz.parts.find(p => p.type === 'emitter');
    const pts = [[em.x, em.z], ...beam.cells.map(([x, z]) => [D.x0 + x + 0.5, D.z0 + z + 0.5])];
    if (!beam.stopped) { const [ex, ez] = beam.end; pts.push([D.x0 + ex + 0.5, D.z0 + ez + 0.5]); }
    for (let k = 1; k < pts.length; k++) {
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), beamMat);
      seg.position.set((ax + bx) / 2, y, (az + bz) / 2); seg.rotation.z = Math.PI / 2; seg.rotation.y = -Math.atan2(bz - az, bx - ax);
      b.group.add(seg);
    }
  }
}

// the seals across open faces (open: which faces are open, by dir): shown on the sealed ones
export function setTrialBarriers(world, dirs, open) {
  const v = world?.trialView;
  if (!v) return;
  for (const [dir, b] of v.barriers) b.visible = dirs.includes(dir) && !!open[dir];
}

// the parts as the trial's state says (a pressed button sinks and goes green; a solved puzzle's
// plate glows, its gates rise, its cage sinks)
export function setTrialParts(world, s, immediate = false) {
  const v = world?.trialView;
  if (!v || !s) return;
  const solved = s.phase === 'resolved', done = i => solved || (s.stage ?? 0) > i;   // (game/trials.js puzzleSolved)
  for (const [, pl] of v.plates) pl.rune.material.color.set(done(pl.puzzle) ? 0x6cff8a : pl.color);
  for (const [, g] of v.gates) { g.want = done(g.puzzle) ? 1 : 0; if (immediate) g.open = g.want; }
  for (const [id, l] of v.levers) { l.want = s.bits?.[id] ? 0.6 : -0.6; if (immediate) l.angle = l.want; }
  if (v.cage) { v.cage.want = solved ? 1 : 0; if (immediate) v.cage.open = v.cage.want; }
  for (const [, b] of v.parts) {
    const done = s.phase === 'resolved';
    if (b.done === done) continue;
    b.done = done;
    b.knob.position.y = done ? 0.72 : 0.78;
    const c = new THREE.Color(done ? 0x6cff8a : TRIALS[v.kind].color);
    b.knob.material.color.copy(c); b.knob.material.emissive.copy(c); b.halo.material.color.copy(c); b.light.color.copy(c);
  }
}

export function tickTrialView(world, time) {
  const v = world?.trialView;
  if (!v) return;
  for (const [, g] of v.gates) { g.open += (g.want - g.open) * 0.06; g.bars.position.y = g.open * 2.1; }
  for (const [, l] of v.levers) { l.angle += (l.want - l.angle) * 0.25; l.arm.rotation.z = l.angle; }
  for (const [, g] of v.grid) {
    if (g.part.type === 'wheel' && g.driven) g.wheel.rotation.z -= 0.04;
    if (g.part.type === 'brazier' && g.lit) { g.flame.scale.y = 1 + Math.sin(time * 9 + g.part.i) * 0.12; g.light.intensity = 2 + Math.sin(time * 7 + g.part.i) * 0.4; }
    if (g.part.type === 'emitter') g.gem.rotation.y = time;
  }
  if (v.cage) { v.cage.open += (v.cage.want - v.cage.open) * 0.05; v.cage.bars.position.y = -v.cage.open * 1.35; v.cage.obj.visible = v.cage.open < 0.98; }
  for (const [, pl] of v.plates) pl.rune.material.opacity = 0.45 + Math.sin(time * 2.6) * 0.2;
  for (const [, b] of v.parts) {
    const pulse = b.done ? 0.2 : 0.5 + Math.sin(time * 3.2) * 0.25;
    b.halo.material.opacity = pulse; b.light.intensity = b.done ? 1 : 2 + Math.sin(time * 3.2) * 0.8;
  }
  if (v.tide?.visible) v.tide.material.opacity = 0.3 + Math.sin(time * 2) * 0.15;
  if (v.water?.visible) {
    const t = v.water.userData.fluid, motion = FLUID_LOOK[t].motion;
    if (!motion.bob) v.water.material.emissiveIntensity = FLUID_LOOK[t].emissiveIntensity * (1 + Math.sin(time * 2) * 0.1);
  }
}
