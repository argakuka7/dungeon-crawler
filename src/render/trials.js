// What a trial room shows (docs/trials.md): its parts, the rising fluid (one surface clipped to
// the cube's box: the room fills like an aquarium) and the tide lines on the glass that warn of it.
// The parts are models: the trials' library (assets/trials.glb, blender/trials.py; loaded with
// the cube's prop sets, render/propplace.js), each part of pieces that move on their own (a
// lever's arm, a gate's bars, a flame), and the props it borrows (the ruins' brazier, the mines'
// crate: TRIAL_PROPS). buildTrialView adds them to a cube being built (render/world.js);
// game/trials.js sets the level and the parts' state every frame.
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
import { props } from './props.js';
import { TRIAL_PROPS } from './propplace.js';
import { flameSet } from './flames.js';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

// --- the models ----------------------------------------------------------------------------------
// The materials of the cube being built: one per material of the library, cloned for the cube
// like the props' (render/props.js); a piece that changes colour gets its own.
let shared = new Map();
const cut = m => shared.get(m) ?? shared.set(m, cutMaterial(m.clone())).get(m);
const isGlow = m => m.name.endsWith('_glow');
// A piece of the trials' library or a borrowed prop (its catalog geometry): its mesh, or a group
// of its meshes (a glowing part is a mesh of its own: userData.glow). own: its own materials;
// mat: drawn with this one. Not loaded (yet: the cube is built again once it is, game/flow.js):
// an empty mesh, so the setters still find a material.
function piece(name, { own = false, mat = null } = {}) {
  const parts = props.byName.get(name)?.parts;
  if (!parts) return new THREE.Mesh(new THREE.BufferGeometry(), mat ?? new THREE.MeshStandardMaterial());
  const meshes = parts.map(part => {
    const m = new THREE.Mesh(part.geometry, mat ?? (own ? cutMaterial(part.material.clone()) : cut(part.material)));
    m.userData.sharedGeo = true;   // the catalog owns the geometry
    m.userData.glow = isGlow(part.material);
    m.castShadow = !m.userData.glow; m.receiveShadow = true;
    return m;
  });
  if (meshes.length === 1) return meshes[0];
  const g = new THREE.Group();
  g.add(...meshes);
  return g;
}
// what a piece turns round (its extras), in its part
const pivotOf = name => props.byName.get(name)?.pivot ?? [0, 0, 0];
// cut off beyond a plane (a gate's bars where they rise into the lintel, a cage below the ground)
function clipTo(obj, plane) {
  obj.traverse(o => { if (o.material) { o.material.clippingPlanes = [plane]; o.material.clipShadows = true; } });
}
const at = (g, p) => { g.position.set(p.x, p.y, p.z); return g; };

// the button (and the parts built like one: the lightning rod, the vent valve): its model with
// a glowing knob in its cup (rest: the knob's height; pressed it sinks), a halo on the ground
function button(p, color, model = 'trial_button', knobAt = [0, 0.74, 0]) {
  const g = new THREE.Group(), knob = piece('trial_knob', { own: true });
  knob.material.color.set(color); knob.material.emissive.set(color); knob.material.emissiveIntensity = 1.4;
  knob.position.set(...knobAt);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 24), glow(color, 0.35));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04;
  const light = new THREE.PointLight(color, 2.5, 4, 2);
  light.position.set(knobAt[0], knobAt[1] + 0.35, knobAt[2]);
  g.add(piece(model), knob, halo, light);
  return { obj: at(g, p), knob, halo, light, rest: knobAt[1] };
}

// a pressure plate: a stone slab, its rune glowing once it holds
function plate(p, color) {
  const g = new THREE.Group(), rune = piece('trial_plate_rune', { mat: glow(color, 0.5) });
  g.add(piece('trial_plate'), rune);
  return { obj: at(g, p), rune, color: new THREE.Color(color) };
}
// a portcullis across a gap (across the way through, side: the way), w cells wide: stone posts,
// a lintel, the iron grate (a piece a cell) that rises open into the lintel's slot
const SLOT = 2.55;   // the lintel's underside: the grate is cut off above it
function portcullis(p) {
  const g = new THREE.Group(), w = p.w ?? 1, bars = new THREE.Group(), clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  for (let i = 0; i < w; i++) {
    const x = -w / 2 + 0.5 + i, grate = piece('trial_portcullis_bars', { own: true }), lintel = piece('trial_portcullis_lintel');
    grate.position.x = lintel.position.x = x;
    bars.add(grate); g.add(lintel);
  }
  for (const s of [-1, 1]) {   // (the right-hand post turned round: its groove faces the grate)
    const post = piece('trial_portcullis_post'), end = piece('trial_portcullis_lintel');
    post.position.x = s * (w / 2 + 0.12); if (s > 0) post.rotation.y = Math.PI;
    end.position.x = s * (w / 2 + 0.14); end.scale.x = 0.3;
    g.add(post, end);
  }
  clipTo(bars, clip);
  g.add(bars);
  if (p.side < 2) g.rotation.y = Math.PI / 2;
  return { obj: at(g, p), bars, clip, open: 0, want: 0 };
}
// a lever on a stone block: its arm leans one way or the other (the reset lever: red knob)
function lever(p, color) {
  const g = new THREE.Group(), arm = new THREE.Group(), knob = piece('trial_lever_knob', { own: true });
  knob.material.color.set(p.type === 'reset' ? 0xd04030 : color);
  arm.add(piece('trial_lever_arm'), knob);
  arm.position.set(...pivotOf('trial_lever_arm'));
  g.add(piece('trial_lever'), arm);
  g.rotation.y = p.yaw ?? 0;
  return { obj: at(g, p), arm, angle: -0.6, want: -0.6 };
}
// a cage round a vault's chest; it sinks into the ground open
function cage(a) {
  const g = new THREE.Group(), bars = piece('trial_cage', { own: true }), clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  clipTo(bars, clip);
  g.add(bars);
  return { obj: at(g, a), bars, clip, open: 0, want: 0 };
}

// --- the grid puzzles' parts (mirror, braziers, crates, runes) -----------------------------------
const BEAM_Y = 0.75;   // how high over the field the beam runs
// a mirror on a turntable: a pane at 45 degrees, turned the other way by its bit
function mirrorPart(p) {
  const g = new THREE.Group(), turn = new THREE.Group();
  const glass = cutMaterial(new THREE.MeshStandardMaterial({ color: 0xe8f2fa, emissive: 0x5a7486, roughness: 0.2, metalness: 0.25 }));
  turn.add(piece('trial_mirror_frame'), piece('trial_mirror_pane', { mat: glass }));
  g.add(piece('trial_mirror'), turn);
  return { obj: at(g, p), turn, angle: 0 };
}
// the emitter (a crystal that shines its beam) and the receiver (a crystal that lights when hit)
function crystal(p, color, model) {
  const g = new THREE.Group(), gem = piece('trial_gem', { own: true });
  gem.material.color.set(color); gem.material.emissive.set(color); gem.material.emissiveIntensity = 0.8;
  const light = new THREE.PointLight(color, 1, 3, 2); light.position.y = BEAM_Y;
  g.add(piece(model), gem, light);
  return { obj: at(g, p), gem, light };
}
// A fire (a brazier, the cold's great fire, the beacon): its model and the light it gives; its
// flame is one of the room's flames (render/flames.js), where the model's own stood (the ruins'
// brazier's, taken out of it) or where its flame piece would (trials.glb, at its pivot). Out it
// has no flame and gives no light; game/trials.js lights it, the flame flares up and the light
// flickers with it.
let fires = null;
function fire(p, { model, flame = null, scale = 1, light = 2.2, reach = 4, high = 1.1 }) {
  const g = new THREE.Group(), body = piece(model);
  body.scale.setScalar(scale);
  const glowing = new THREE.PointLight(0xff9040, 0, reach, 2); glowing.position.y = high;
  g.add(body, glowing);
  const f = props.byName.get(flame ?? model)?.flames?.[0], off = flame ? pivotOf(flame) : [0, 0, 0], k = flame ? 1 : scale;
  const i = fires.specs.length, seed = (p.x * 1.7 + p.z * 2.3) % 6.28;
  fires.specs.push(f ? { x: p.x + off[0] + f.x * k, y: p.y + off[1] + f.y * k, z: p.z + off[2] + f.z * k, w: f.w * k, h: f.h * k, power: 0, seed }
    : { x: p.x, y: p.y, z: p.z, w: 0, h: 0, power: 0, seed });   // (not loaded yet: the cube is built again)
  fires.lights.push({ light: glowing, gain: light, i, seed });
  return { obj: at(g, p), flame: i, lit: false };
}
const brazierPart = p => fire(p, { model: TRIAL_PROPS.brazier, scale: 1.25 });
const greatFire = p => fire(p, { model: 'trial_great_fire', flame: 'trial_great_fire_flame', light: 3, reach: 8, high: 1.2 });
const beaconPart = p => fire(p, { model: 'trial_beacon', flame: 'trial_beacon_flame', light: 3.2, reach: 7, high: 2.1 });
const FIRES = new Set(['brazier', 'warm', 'fire', 'beacon']);

// a heavy crate: the mines' crate, a cell big
function cratePart(p) {
  const g = new THREE.Group(), box = piece(TRIAL_PROPS.crate);
  box.scale.setScalar(1.75);
  g.add(box);
  return { obj: at(g, p) };
}
// The glowing lines between linked braziers: a ring round each brazier's foot and a strip from
// ring to ring for every link. The brazier in reach lights up its ring, its strips and the rings
// of those it would light or put out with it (setGridParts).
const LINK_DIM = { color: 0xffa040, opacity: 0.35 }, LINK_HOT = { color: 0xffe0a0, opacity: 0.95 };
const floorMat = ({ color, opacity }) => Object.assign(glow(color, opacity), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
function linkLines(pz) {
  const group = new THREE.Group(), dim = floorMat(LINK_DIM), hot = floorMat(LINK_HOT);
  const at = new Map(pz.parts.filter(p => p.type === 'brazier').map(p => [p.i, p])), links = pz.field.links;
  let near = Infinity;   // the nearest two braziers: how big a ring fits
  links.forEach((list, i) => { for (const j of list) near = Math.min(near, Math.hypot(at.get(i).x - at.get(j).x, at.get(i).z - at.get(j).z)); });
  const r = Math.min(0.55, near * 0.35), w = 0.07, rings = new Map(), strips = [];
  for (const [i, p] of at) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 40), dim);
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y + 0.03, p.z);
    group.add(ring); rings.set(i, ring);
  }
  links.forEach((list, i) => {
    for (const j of list) {
      if (j < i && links[j].includes(i)) continue;   // (one strip for a link both ways)
      const a = at.get(i), b = at.get(j), len = Math.hypot(b.x - a.x, b.z - a.z) - 2 * r;
      if (len <= 0) continue;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, w * 1.6).rotateX(-Math.PI / 2), dim);   // (flat, along x)
      strip.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      strip.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.03, (a.z + b.z) / 2);
      group.add(strip); strips.push({ i, j, mesh: strip });
    }
  });
  return { group, rings, strips, dim, hot, near: undefined };
}
// the brazier in reach (its part id, or null) lit up with its links
function setLinks(lk, pz, nearId) {
  const p = nearId && pz.parts.find(q => q.id === nearId && q.type === 'brazier'), i = p ? p.i : -1;
  if (lk.near === i) return;
  lk.near = i;
  const flips = new Set(i < 0 ? [] : [i, ...pz.field.links[i]]);
  for (const [k, ring] of lk.rings) ring.material = flips.has(k) ? lk.hot : lk.dim;
  for (const s of lk.strips) s.mesh.material = (s.i === i && flips.has(s.j)) || (s.j === i && flips.has(s.i)) ? lk.hot : lk.dim;
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

// a glyph carved and lit: a texture of the glyph in `color` on a dark stone face
const glyphTextures = new Map();
function glyphTexture(glyph, color = '#e8d8ff') {
  const k = glyph + color;
  if (glyphTextures.has(k)) return glyphTextures.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3640'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = color; g.font = 'bold 44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 32, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  glyphTextures.set(k, tex);
  return tex;
}
// a runestone: a standing stone, its glyph on the panels front and back; lit once pressed in turn
function runestone(p) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: glyphTexture(p.glyph), emissive: 0x000000, emissiveMap: glyphTexture(p.glyph), roughness: 0.8 }));
  face.position.set(0, 0.72, 0.151);
  const back = face.clone(); back.material = face.material.clone(); back.rotation.y = Math.PI; back.position.z = -0.151;
  g.add(piece('trial_runestone'), face, back);
  return { obj: at(g, p), face: [face, back], lit: null };
}
// the carved tablet (a rune room's clue, in another room): a slab on a plinth with the glyphs in order
function tablet(c) {
  const g = new THREE.Group();
  g.add(piece('trial_tablet'));
  c.glyphs.forEach((gl, i) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshBasicMaterial({ map: glyphTexture(gl, '#f0d890') }));
    q.position.set((i - (c.glyphs.length - 1) / 2) * 0.16, 0.68, 0.061); g.add(q);
  });
  return at(g, c);
}
export function buildTrialView(m, group) {
  const t = m.trial;
  shared = new Map(); fires = { specs: [], lights: [] };
  for (const c of m.clues || []) group.add(tablet(c));
  if (!t) return null;
  const color = new THREE.Color(TRIALS[t.kind].color);
  const view = { kind: t.kind, parts: new Map(), water: null, tide: null, level: null, phase: null, barriers: new Map(), crust: null,
    plates: new Map(), gates: new Map(), levers: new Map(), cage: null, grid: new Map(), beams: new Map(), links: new Map() };
  // the crumbling crust
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
    if (p.type === 'rod') { const b = button(p, color, 'trial_rod', [0, 0.68, 0.2]); group.add(b.obj); view.parts.set(p.id, b); }
    if (p.type === 'valve') { const b = button(p, color, 'trial_valve', [0, 0.89, 0]); group.add(b.obj); view.parts.set(p.id, b); }
    if (p.type === 'beacon') {   // its ring marked on the ground
      const ring = new THREE.Mesh(new THREE.RingGeometry(t.ring.r - 0.06, t.ring.r + 0.06, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(t.ring.x, t.ring.y + 0.04, t.ring.z); group.add(ring);
    }
    if (p.type === 'portcullis') { const b = portcullis({ ...p, side: p.side }); b.puzzle = -1; b.chase = true; group.add(b.obj); view.gates.set(p.id, b); }
    if (p.type === 'plate') { const b = plate(p, color); b.puzzle = p.puzzle ?? 0; b.cell = p.cell; group.add(b.obj); view.plates.set(p.id, b); }
    if (p.type === 'gate') { const b = portcullis(p); b.puzzle = p.puzzle ?? 0; group.add(b.obj); view.gates.set(p.id, b); }
    if (p.type === 'lever' || p.type === 'reset') { const b = lever(p, color); group.add(b.obj); view.levers.set(p.id, b); }
    const grid = p.type === 'mirror' ? mirrorPart(p) : p.type === 'emitter' ? crystal(p, 0xffe060, 'trial_emitter') : p.type === 'receiver' ? crystal(p, 0x6080a0, 'trial_receiver')
      : p.type === 'brazier' || p.type === 'warm' ? brazierPart(p) : p.type === 'fire' ? greatFire(p) : p.type === 'beacon' ? beaconPart(p)
        : p.type === 'crate' ? cratePart(p) : p.type === 'runestone' ? runestone(p) : null;
    if (grid) { grid.part = p; group.add(grid.obj); view.grid.set(p.id, grid); }
  }
  for (const pz of t.puzzles || []) {
    if (pz.kind === 'braziers') { const lk = linkLines(pz); group.add(lk.group); view.links.set(pz.index, lk); }
    if (pz.kind === 'mirror') { const beam = new THREE.Group(); group.add(beam); view.beams.set(pz.index, { group: beam, key: '' }); }
  }
  // the siege's mouths: dark arches the waves come out of
  for (const mo of t.mouths || []) { const g = at(piece('trial_mouth'), mo); g.rotation.y = mo.yaw; group.add(g); }
  if (fires.specs.length) { view.fires = flameSet(fires.specs, fires.lights); group.add(view.fires.mesh); }
  if (t.kind === 'chase') { view.hunter = hunterMesh(); group.add(view.hunter); }
  // a vault (a puzzle in a branch room): a cage round its reward site's chest
  const site = t.role === 'branch' && (m.rewardSites || [])[0];
  if (site) { view.cage = cage(site.anchor); group.add(view.cage.obj); }
  if (t.kind === 'miasma') {
    const fog = new THREE.Group(), haze = new THREE.Mesh(new THREE.BoxGeometry(N - 0.04, 1, N - 0.04),
      new THREE.MeshBasicMaterial({ color: 0x9adf50, transparent: true, opacity: 0.22, depthWrite: false }));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(N - 0.04, N - 0.04), new THREE.MeshBasicMaterial({ color: 0xb8f070, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    sheet.rotation.x = -Math.PI / 2;
    haze.renderOrder = 6; sheet.renderOrder = 6;
    fog.add(haze, sheet); fog.position.set(N / 2, 0, N / 2); fog.visible = false;
    haze.position.x = sheet.position.x = 0;
    group.add(fog);
    view.fog = fog; view.fogTop = (t.timeline.top + 8) * LH;
  }
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

// the hunter (chase): a hulking shadow with burning eyes where the clock says (h: core/trials.js
// hunterAt, null: not out); crushed (the trial resolved) it is gone
export function setHunter(world, h, crushed) {
  const v = world?.trialView;
  if (!v?.hunter) return;
  v.hunter.visible = !!h && !crushed;
  if (!v.hunter.visible) return;
  v.hunter.position.set(h.x, h.y, h.z);
  v.hunter.rotation.y = h.yaw;
  const t = performance.now() / 1000;
  v.hunter.children[0].position.y = 1.05 + Math.abs(Math.sin(t * 7)) * 0.08;
}
function hunterMesh() {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x1a1218, roughness: 0.9 });
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 10), dark); torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), dark); head.position.set(0, 0.8, 0.12);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  for (const x of [-0.11, 0.11]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat); e.position.set(x, 0.86, 0.38); body.add(e); }
  for (const x of [-0.55, 0.55]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.8, 4, 8), dark); arm.position.set(x, -0.1, 0.15); arm.rotation.x = -0.5; body.add(arm); }
  body.add(torso, head);
  const light = new THREE.PointLight(0xff3020, 1.2, 3, 2); light.position.set(0, 1.9, 0.5);
  g.add(body, light); g.scale.setScalar(1.6); g.visible = false;
  return g;
}
// the storm's wind (phase: 'calm' | 'warning' | 'gust' | 'lull'; eye: the hill's middle, cells):
// streaks tearing outwards off the hill and round it, a few in the warning, many in the gust
export function setStorm(world, phase, eye, dt) {
  const v = world?.trialView;
  if (!v || !eye || (phase !== 'warning' && phase !== 'gust')) return;
  const n = (phase === 'gust' ? 70 : 14) * dt;
  for (let k = n; k > 0; k--) {
    if (k < 1 && Math.random() > k) break;
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3, ux = Math.cos(a), uz = Math.sin(a), speed = phase === 'gust' ? 9 : 5;
    emit(soft, eye.x + ux * r, 2 + Math.random() * 8, eye.z + uz * r, { v: [(ux - uz * 0.4) * speed, 0, (uz + ux * 0.4) * speed], spread: 0.3,
      life: 1.2, size: 0.12, grow: 4, color: '#e8ecff', alpha: phase === 'gust' ? 0.5 : 0.3, gravity: 0, drag: 0 });
  }
}

// the sinking fog's underside at y (world units; null: none): a sickly haze from there up, its
// underside a denser sheet
export function setTrialFog(world, y) {
  const v = world?.trialView;
  if (!v?.fog) return;
  v.fog.visible = y != null;
  if (y == null) return;
  const top = v.fogTop, h = Math.max(0.05, top - y);
  v.fog.children[0].scale.y = h; v.fog.children[0].position.y = y + h / 2;
  v.fog.children[1].position.y = y;
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

// The grid puzzles as their bits say (game/trials.js): mirrors turned, braziers lit, crates pushed,
// the beam along its way (shown: puzzle index -> { beam: { cells, lit } } | { held })
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, depthWrite: false });
export function setGridParts(world, m, s, shown, nearId = null) {
  const v = world?.trialView;
  if (!v || !s) return;
  for (const [i, lk] of v.links) if (m.puzzles?.[i]) setLinks(lk, m.puzzles[i], nearId);
  for (const [id, g] of v.grid) {
    const p = g.part, bit = s.bits?.[id] ?? 0, info = shown.get(p.puzzle ?? 0);
    if (p.type === 'mirror') g.angle += (((bit ? -1 : 1) * Math.PI / 4) - g.angle) * 0.3, g.turn.rotation.y = g.angle;
    else if (FIRES.has(p.type)) {   // (the cold's: lit for good once resolved; the beacon once lit; its flame and light: render/flames.js)
      const lit = p.type === 'brazier' ? !!bit : p.type === 'beacon' ? s.phase !== 'idle' : s.phase === 'resolved' || (p.type === 'warm' && !!bit);
      if (g.lit !== lit) { g.lit = lit; v.fires?.power(g.flame, lit ? 1 : 0); }
    }
    else if (p.type === 'receiver') { const lit = !!info?.beam?.lit; g.gem.material.emissiveIntensity = lit ? 2.5 : 0.4; g.light.intensity = lit ? 3 : 0.3; }
    else if (p.type === 'runestone') {   // lit: pressed in turn so far (the order's first n)
      const pz = m.puzzles[p.puzzle ?? 0], n = s.bits?.[`${pz.id}:n`] ?? 0, lit = s.phase === 'resolved' || pz.field.order.slice(0, n).includes(p.i);
      if (g.lit !== lit) { g.lit = lit; for (const f of g.face) f.material.emissive.set(lit ? 0xc0a0ff : 0x000000); }
    } else if (p.type === 'crate') {   // where its bit says (a field cell), slid there
      const pz = m.puzzles[p.puzzle ?? 0], F = pz.field, D = pz.deck;
      const x = D.x0 + bit % F.w + 0.5, z = D.z0 + Math.floor(bit / F.w) + 0.5, o = g.obj.position;
      o.x += (x - o.x) * 0.25; o.z += (z - o.z) * 0.25;
    }
  }
  // a crate puzzle's plates glow while held
  for (const [id, pl] of v.plates) {
    const held = shown.get(pl.puzzle)?.held;
    if (held && !(s.phase === 'resolved' || (s.stage ?? 0) > pl.puzzle)) pl.rune.material.color.set(held.has(pl.cell) ? 0xffe070 : pl.color);
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
  for (const [, g] of v.gates) {
    // (the chase's portcullis: up, but down on the hunter for a moment once the lever is pulled)
    g.want = g.chase ? (solved && s.done < 1.5 ? 0 : 1) : done(g.puzzle) ? 1 : 0;
    if (immediate) g.open = g.want;
  }
  for (const [id, l] of v.levers) { l.want = s.bits?.[id] ? 0.6 : -0.6; if (immediate) l.angle = l.want; }
  if (v.cage) { v.cage.want = solved ? 1 : 0; if (immediate) v.cage.open = v.cage.want; }
  for (const [, b] of v.parts) {
    const done = s.phase === 'resolved';
    if (b.done === done) continue;
    b.done = done;
    b.knob.position.y = done ? b.rest - 0.06 : b.rest;
    const c = new THREE.Color(done ? 0x6cff8a : TRIALS[v.kind].color);
    b.knob.material.color.copy(c); b.knob.material.emissive.copy(c); b.halo.material.color.copy(c); b.light.color.copy(c);
  }
}

const slot = new THREE.Vector3();
export function tickTrialView(world, time) {
  const v = world?.trialView;
  if (!v) return;
  // a gate's grate rises into its lintel (cut off at its slot); a cage sinks into the ground
  for (const [, g] of v.gates) {
    g.open += (g.want - g.open) * 0.06; g.bars.position.y = g.open * 2.1;
    g.clip.constant = g.obj.localToWorld(slot.set(0, SLOT, 0)).y;
  }
  for (const [, l] of v.levers) { l.angle += (l.want - l.angle) * 0.25; l.arm.rotation.z = l.angle; }
  for (const [, g] of v.grid) {
    if (g.part.type === 'emitter') g.gem.rotation.y = time;
  }
  if (v.cage) {
    v.cage.open += (v.cage.want - v.cage.open) * 0.05; v.cage.bars.position.y = -v.cage.open * 1.35; v.cage.obj.visible = v.cage.open < 0.98;
    v.cage.clip.constant = -v.cage.obj.localToWorld(slot.set(0, 0, 0)).y;
  }
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
