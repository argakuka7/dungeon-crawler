// Touch controls (docs/touch.md): on from the first touch of the screen (or with ?touch=1;
// ?touch=0 keeps them off), as body.touch. The left of the screen is a floating stick: where
// the thumb lands, it pushes the way to move (a little: walk, further: run). On the right the
// action button attacks while held (as Shift); with a flask in hand it is a stick that aims
// the throw (core/stick.js aimReach): let go to throw, back to the middle to call it off, and a
// tap throws at the best enemy in range. The jump button sits beside it. A turn button at each
// side of the screen turns the view a quarter (as Q and E). On the game itself a tap does what
// a click does, except walking (an enemy, an item, a chest, a villager), a long press collects
// what is around (as C), and two fingers pinch to zoom. The quick bar moves to the top with a
// bag button (game/quickbar.js, style.css).
import { stickVector, pinchStep } from '../core/stick.js';
import { stepZoom } from '../core/zoom.js';
import { readiedFlask } from '../core/combat.js';
import { equippedItem } from '../core/inventory.js';
import { ITEMS } from '../core/items.js';
import { renderer } from '../render/scene.js';
import { player, state, view } from './state.js';
import { controls } from './inputstate.js';
import { tapGame, quickThrow, autoAttack } from './input.js';
import { requestCollect } from './loot.js';
import { throwTarget } from './throws.js';
import { queueAttack } from './sword.js';

const STICK_R = 56, AIM_R = 72;   // px the thumb goes out to for a full push
const TAP_TIME = 300;             // ms: a touch let go sooner (without moving) is a tap
const LONG_PRESS = 450;           // ms held still: collect
const SLOP = 12;                  // px a finger may wander and still tap or long-press

const $ = id => document.getElementById(id);
const root = $('touch'), zone = $('touch-stick'), ring = $('touch-ring'), knob = $('touch-knob'),
  action = $('touch-action'), aimKnob = $('touch-action-knob'), icon = action.querySelector('img'),
  jump = $('touch-jump'), hold = $('touch-hold'), turnLeft = $('touch-turn-left'), turnRight = $('touch-turn-right'),
  canvas = renderer.domElement;
const now = () => performance.now();
const place = (el, x, y) => { el.style.transform = `translate(${x}px, ${y}px)`; };
// the knob dx, dy px off its middle, kept within r
const nudge = (el, dx, dy, r) => { const d = Math.hypot(dx, dy), k = d > r ? r / d : 1; place(el, dx * k, dy * k); };

const forced = new URLSearchParams(location.search).get('touch');
let on = false;
export const touchMode = () => on;
function enable() {
  if (on || forced === '0') return;
  on = true;
  document.body.classList.add('touch');
  root.hidden = false;
}
const coarse = matchMedia('(pointer: coarse)');
if (forced === '1' || coarse.matches) enable();
coarse.addEventListener('change', () => { if (coarse.matches) enable(); });
addEventListener('pointerdown', e => { if (e.pointerType === 'touch') enable(); }, true);

// --- the stick ----------------------------------------------------------------------------------

let stick = null;   // { id, x, y (where it landed), t0, moved }
zone.addEventListener('pointerdown', e => {
  if (stick) return;
  e.preventDefault();
  zone.setPointerCapture(e.pointerId);
  stick = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: now(), moved: false };
  place(ring, e.clientX, e.clientY); place(knob, 0, 0);
  ring.hidden = false;
});
zone.addEventListener('pointermove', e => {
  if (e.pointerId !== stick?.id) return;
  const dx = e.clientX - stick.x, dy = e.clientY - stick.y;
  if (Math.hypot(dx, dy) > SLOP) stick.moved = true;
  nudge(knob, dx, dy, STICK_R);
  Object.assign(controls.stick, stickVector(dx, dy, STICK_R));
});
function endStick(e) {
  if (e.pointerId !== stick?.id) return;
  const s = stick;
  stick = null; ring.hidden = true;
  Object.assign(controls.stick, { x: 0, y: 0, m: 0 });
  // a quick touch that pushed nothing: a tap on the game under it
  if (e.type === 'pointerup' && !s.moved && now() - s.t0 < TAP_TIME) tapGame(e.clientX, e.clientY);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, endStick);

// --- the action button: attack, or aim the flask in hand ------------------------------------------

let press = null;   // { id, x, y (the button's middle), t0, aimed }
action.addEventListener('pointerdown', e => {
  if (press || state.inventoryOpen) return;
  e.preventDefault();
  action.setPointerCapture(e.pointerId);
  const r = action.getBoundingClientRect();
  press = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2, t0: now(), aimed: false };
  action.classList.add('down');
  if (readiedFlask(player)) Object.assign(controls.aim, { active: true, x: 0, y: 0, m: 0 });
  else { controls.attackHeld = true; if (!state.transitioning) autoAttack(); }   // a tap still swings
});
action.addEventListener('pointermove', e => {
  if (e.pointerId !== press?.id || !controls.aim.active) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y, v = stickVector(dx, dy, AIM_R);
  if (v.m > 0) press.aimed = true;
  nudge(aimKnob, dx, dy, AIM_R);
  Object.assign(controls.aim, v);
});
function endPress(e) {
  if (e.pointerId !== press?.id) return;
  const p = press, aim = controls.aim;
  press = null;
  action.classList.remove('down'); place(aimKnob, 0, 0);
  controls.attackHeld = false;
  if (!aim.active) return;
  // let go out on the stick: throw there; a tap: at the best enemy; back in the middle: not at all
  if (e.type === 'pointerup' && aim.m > 0) { const t = throwTarget(); if (t) queueAttack(t.enemy ?? t); }
  else if (e.type === 'pointerup' && !p.aimed && now() - p.t0 < TAP_TIME) quickThrow();
  Object.assign(aim, { active: false, x: 0, y: 0, m: 0 });
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) action.addEventListener(type, endPress);

jump.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!state.inventoryOpen && !state.transitioning) controls.jumpPressed = true;
});

// the turn buttons: a quarter turn of the view, the left one as Q, the right one as E
for (const [button, way] of [[turnLeft, -1], [turnRight, 1]]) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!state.inventoryOpen) view.yawTarget += way * Math.PI / 2;
  });
}

// --- fingers on the game: tap, long press, pinch ---------------------------------------------------

const fingers = new Map();   // pointerId -> { x, y, x0, y0, t0, tap }
let pressTimer = 0, gesture = null;   // gesture: { d } of two fingers when last stepped

function pair() {
  const [a, b] = fingers.values();
  return { d: Math.hypot(b.x - a.x, b.y - a.y) };
}
function startHold(f) {
  place(hold, f.x, f.y);
  hold.classList.remove('done', 'on');
  void hold.offsetWidth;   // restart the fill
  hold.classList.add('on');
  pressTimer = setTimeout(() => {
    pressTimer = 0; f.tap = false;
    hold.classList.remove('on');
    if (state.inventoryOpen || state.transitioning) return;
    requestCollect();
    hold.classList.add('done');
    navigator.vibrate?.(15);
  }, LONG_PRESS);
}
function stopHold() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = 0;
  hold.classList.remove('on');
}

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const f = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: now(), tap: true };
  fingers.set(e.pointerId, f);
  if (fingers.size === 1) { startHold(f); return; }
  // a second finger: no tap, no long press, but a pinch with the first two
  stopHold();
  for (const g of fingers.values()) g.tap = false;
  if (fingers.size === 2) gesture = pair();
});
canvas.addEventListener('pointermove', e => {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  f.x = e.clientX; f.y = e.clientY;
  if (f.tap && Math.hypot(f.x - f.x0, f.y - f.y0) > SLOP) { f.tap = false; stopHold(); }
  if (!gesture || fingers.size !== 2 || state.inventoryOpen) return;
  const p = pair(), zoom = pinchStep(p.d / gesture.d);
  if (zoom) { view.zoomTarget = stepZoom(view.zoomTarget, zoom); gesture.d = p.d; }
});
function endFinger(e) {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  fingers.delete(e.pointerId);
  if (fingers.size < 2) gesture = null;
  if (fingers.size === 0) stopHold();
  if (e.type === 'pointerup' && f.tap && !fingers.size && now() - f.t0 < TAP_TIME) tapGame(e.clientX, e.clientY);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endFinger);

// --- every frame -------------------------------------------------------------------------------

let shown = '';
// hidden while the inventory is open; the action button shows the weapon, or the flask in hand
export function updateTouch() {
  if (!on) return;
  root.hidden = state.inventoryOpen;
  const flask = readiedFlask(player), weapon = equippedItem(player.inventory), def = flask || (weapon && ITEMS[weapon.itemId]);
  const next = `${def?.icon}:${!!flask}`;
  if (next === shown) return;
  shown = next;
  icon.hidden = !def;
  if (def) icon.src = def.icon;
  action.classList.toggle('flask', !!flask);
  action.classList.toggle('empty', !def);
  action.setAttribute('aria-label', flask ? `Aim and throw ${flask.name}` : 'Attack');
}
