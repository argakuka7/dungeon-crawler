// Keyboard, mouse and wheel. Modal input never enters the game queue.
// Keys are actions (core/keybinds.js), each on the keys the settings give it (game/settings.js);
// the keys named here are the defaults. Esc is always the menu (and closes what is open).
// The player always runs; holding left Ctrl walks. Holding Shift auto-attacks enemies the weapon
// can reach (and does nothing without one, or with a flask in hand). Space jumps.
// Mouse: click the floor to walk there, click an enemy to attack it (hold for more), click an
// item on the floor to pick it up, click a treasure chest to open it, click a villager who
// trades to go and trade. With a flask in hand (game/throws.js) a click throws it at the cursor
// instead, whatever is there. F or right Ctrl: the action key (game/action.js): open the chest
// beside the player, else trade with the villager beside them, else collect what lies around
// (Enter is the chat, game/console.js). I (or V): the inventory, with the floor in reach beside the bag
// when something lies there (game/inventory.js); X: item labels. 1-6: the quick bar (game/
// quickbar.js; while the teleport scroll asks where to, they pick there: game/teleportmenu.js). Touch (game/touch.js) feeds the same paths: its stick moves like the keys, its
// action button holds like Shift, its use button is the action key, and a tap on the game
// clicks there without walking.
import { stepZoom } from '../core/zoom.js';
import { player, state, view, setStatus } from './state.js';
import { spawnEntry, nextCube } from './flow.js';
import { knockDown } from './ragdoll.js';
import { toggleInventory, setInventoryOpen } from './inventory.js';
import { controls, clearInput } from './inputstate.js';
import { helpOpen, setHelpOpen, toggleHelp } from './help.js';
import { pointer, pickFloor, aimPoint, hoveredEnemy, pointAt, updatePointer } from './pointer.js';
import { orderMove, orderAttack, orderPickup, orderChest, clearOrder, orderTrade } from './orders.js';
import { hoveredPickup, hoveredChest, hoveredVillager, toggleLabels, updateLootLabels } from './lootlabels.js';
import { queueAttack } from './sword.js';
import { softTarget, combatStats, readiedFlask } from '../core/combat.js';
import { throwTarget } from './throws.js';
import { lineOfFire } from './shots.js';
import { clearLine } from '../physics/enemynav.js';
import { allEnemies } from './enemies.js';
import { toggleMusic, keysOf, bindings, actionsOf } from './settings.js';
import { settingsOpen } from './settingsmenu.js';
import { actionsFor, isChar, isModifier, BAR_ACTIONS, MOVE_ACTIONS } from '../core/keybinds.js';
import { barKey } from './quickbar.js';
import { teleportMenuOpen, closeTeleportMenu, pickTeleport } from './teleportmenu.js';
import { setMenuOpen, toggleMenu } from './escmenu.js';
import { useAction } from './action.js';
import { screenToWorld, WALK_BELOW } from '../core/stick.js';
export { clearInput };

const { keys } = controls;
const typed = new Map();   // code -> the character it typed last (for keys bound by character)

// is any of the action's keys held?
export function held(id) {
  return keysOf(id).some(k => k !== null && (isChar(k) ? [...keys].some(c => typed.get(c) === k) : keys.has(k)));
}
// a chord with Ctrl or Alt held that the game does not hold as one of its keys, or with Cmd:
// the browser's or the system's shortcut (Ctrl+L), not the game's
const ours = (a, b) => [a, b].some(c => keys.has(c) && actionsFor(bindings(), c, null).length);
const foreign = e => e.metaKey || (e.ctrlKey && !ours('ControlLeft', 'ControlRight')) || (e.altKey && !ours('AltLeft', 'AltRight'));

// what a press does (the hold actions are read every frame: inputDir, wantsWalk, autoAttackHeld;
// the inventory, the quick bar, the help and the menu are handled before, as they work with
// panels open)
const PRESS = {
  jump: () => { controls.jumpPressed = true; },
  // a tap between two frames still swings (holding is handled every frame in update.js)
  attack: () => { if (!state.transitioning) autoAttack(); },
  music: () => setStatus(toggleMusic() ? 'Music on' : 'Music off'),
  turnLeft: () => { view.yawTarget -= Math.PI / 2; },
  turnRight: () => { view.yawTarget += Math.PI / 2; },
  respawn: () => { spawnEntry(); setStatus('Respawned where you came in'); },
  labels: () => toggleLabels(),
  action: () => useAction(),   // chest, villager, collect, else nothing
  zoomIn: () => { view.zoomTarget = stepZoom(view.zoomTarget, -1); },
  zoomOut: () => { view.zoomTarget = stepZoom(view.zoomTarget, 1); },
  knockOver: () => { if (!player.ragdoll) knockDown({ push: 3, hop: 2.5, reason: 'Whoops!' }); },
  path: () => { state.showPath = !state.showPath; if (state.world) state.world.pathLine.visible = state.showPath; },
};

addEventListener('keydown', e => {
  // typing in a field: only Escape is ours
  if (e.target?.tagName === 'INPUT' && e.target.type === 'text') {
    if (e.code === 'Escape' && state.menuOpen) { setMenuOpen(false); e.preventDefault(); }
    return;
  }
  // the main menu (game/menu.js) has its own keys, the settings (game/settingsmenu.js) too
  if (state.mode === 'menu' || settingsOpen()) return;
  const acts = isModifier(e.code) || !foreign(e) ? actionsOf(e) : [];
  const is = id => acts.includes(id);
  // the Esc menu is open: Esc and the menu key close it, the game gets no keys
  if (state.menuOpen) {
    if ((e.code === 'Escape' || is('menu')) && !e.repeat) setMenuOpen(false);
    if (!['Tab', 'Enter', 'Space'].includes(e.code)) e.preventDefault();   // (the buttons keep Tab, Enter and Space)
    return;
  }
  if (!isModifier(e.code) && foreign(e)) {
    // Ctrl held but not as one of the game's keys: moving still goes on (Ctrl+S, Ctrl+D and
    // Ctrl+A neither save, bookmark nor select), every other shortcut is left alone
    const move = actionsOf(e).some(id => MOVE_ACTIONS.includes(id));
    if (move && e.ctrlKey && !e.metaKey && !e.altKey && !state.inventoryOpen) { keys.add(e.code); typed.set(e.code, e.key); e.preventDefault(); }
    return;
  }
  if (is('inventory')) { if (!e.repeat) { setHelpOpen(false); toggleInventory(); } e.preventDefault(); return; }
  if (e.code === 'Escape' && state.inventoryOpen) { setInventoryOpen(false); e.preventDefault(); return; }
  // the quick bar (with the inventory open: put the selected item there); not while typing
  // (the teleport scroll asking where to, game/teleportmenu.js: the keys pick there; Esc closes it)
  const bar = BAR_ACTIONS.findIndex(is);
  if (bar >= 0 && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) {
    if (!e.repeat) { if (teleportMenuOpen()) pickTeleport(bar); else barKey(bar); }
    e.preventDefault(); return;
  }
  if (e.code === 'Escape' && teleportMenuOpen()) { closeTeleportMenu(); e.preventDefault(); return; }
  if (state.inventoryOpen) return;
  if (is('help')) { if (!e.repeat) toggleHelp(); e.preventDefault(); return; }
  if (e.code === 'Escape' && helpOpen()) { setHelpOpen(false); e.preventDefault(); return; }
  // Esc with nothing else open, and the menu key: the menu (play together and the settings are in it)
  if (e.code === 'Escape' || is('menu')) { if (!e.repeat) toggleMenu(); e.preventDefault(); return; }
  keys.add(e.code); typed.set(e.code, e.key);
  if (acts.length || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  for (const id of acts) PRESS[id]?.();
  if (e.code === 'KeyN' && state.dev) nextCube();   // (new worlds come from the main menu)
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', clearInput);
// Ctrl+click is a right click on macOS: no context menu over the game
addEventListener('contextmenu', e => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });
// no picture or link dragged off by accident (style.css stops text selection)
addEventListener('dragstart', e => e.preventDefault());
// Auto-attack (Shift): attack the best enemy the weapon can reach (a blade's reach, a shot's
// range), the hovered one first, else the closest, preferring those ahead of the movement keys
// or the facing. Never at the air and never walking up: without an enemy that close (and, for
// a shot, in sight) it does nothing. AUTO_REACH: the wind-up's step-in still connects a little
// beyond blade reach. Mouse orders carry on.
const AUTO_REACH = 0.15;
const bladeSees = e => clearLine(player.x, player.y + 0.4, player.z, e.x,
  Math.max(e.y + 0.1, Math.min(player.y + 0.4, e.y + e.profile.bodyHeight - 0.05)), e.z);
export function autoAttack() {
  if (readiedFlask(player)) return null;   // flasks are only ever thrown with a click
  const hovered = hoveredEnemy(), [dx, dz] = inputDir(), stats = combatStats(player);
  const visible = stats?.ranged ? e => lineOfFire(player, e, stats) : bladeSees;
  const yaw = dx || dz ? Math.atan2(dx, dz) : player.yaw;
  const target = (hovered && softTarget(player, [hovered], yaw, visible, AUTO_REACH))
    || softTarget(player, allEnemies(), yaw, visible, AUTO_REACH);
  if (target) queueAttack(target);
  return target;
}
// a tap on the action button with a flask in hand (game/touch.js): at the best enemy in range
// and in sight, else straight ahead
export function quickThrow() {
  if (!readiedFlask(player) || state.transitioning || state.inventoryOpen) return;
  const [dx, dz] = inputDir(), yaw = dx || dz ? Math.atan2(dx, dz) : player.yaw;
  queueAttack(softTarget(player, allEnemies(), yaw, bladeSees));
}
export const autoAttackHeld = () => !state.inventoryOpen && !state.transitioning && (controls.attackHeld || held('attack'));
// the walk key (left Ctrl), or the touch stick pushed only a little
export const wantsWalk = () => held('walk') || (controls.stick.m > 0 && controls.stick.m < WALK_BELOW);
addEventListener('pointerdown', e => {
  // touches are game/touch.js's (a tap comes back through tapGame)
  if (e.button !== 0 || e.pointerType === 'touch' || e.target.tagName !== 'CANVAS' || state.transitioning || state.inventoryOpen) return;
  e.preventDefault();
  pointer.down = true;
  click(true);
});
// a tap on the game at (x, y) px (game/touch.js): a click there, except that the floor does not
// walk; nothing stays hovered afterwards
export function tapGame(x, y) {
  if (state.transitioning || state.inventoryOpen) return;
  pointAt(x, y); updatePointer(); updateLootLabels();
  pointer.down = false;
  click(false);
  pointer.inside = false;
}
// what a click on the game does: with a flask in hand, throw it there; else go for the enemy,
// villager, item or chest under the cursor, or (walk) walk to the floor there
function click(walk) {
  if (readiedFlask(player)) {
    pointer.mode = null; clearOrder();
    const target = throwTarget();
    if (target) queueAttack(target.enemy ?? target);
    return;
  }
  const enemy = hoveredEnemy();
  if (enemy) { pointer.mode = 'attack'; orderAttack(enemy); return; }
  const villager = hoveredVillager();
  if (villager) { pointer.mode = null; orderTrade(villager); return; }
  const item = hoveredPickup();
  if (item) { pointer.mode = null; orderPickup(item); return; }
  const chest = hoveredChest();
  if (chest) { pointer.mode = null; orderChest(chest); return; }
  if (!walk) { pointer.mode = null; return; }
  pointer.mode = 'move';
  const hit = pickFloor();
  if (hit) orderMove(hit);
  else {   // off the map: head that way
    const a = aimPoint();
    if (a) orderMove({ x: a.x, z: a.z, s: null });
  }
}
addEventListener('wheel', e => {
  if (!state.inventoryOpen && !state.menuOpen && state.mode === 'play') view.zoomTarget = stepZoom(view.zoomTarget, Math.sign(e.deltaY));
}, { passive: true });

// desired direction in world space (WASD or the touch stick, relative to the camera)
export function inputDir() {
  if (state.inventoryOpen) return [0, 0];
  if (player.autoDir) return player.autoDir;
  let ix = 0, iy = 0;
  if (held('moveUp')) iy += 1;
  if (held('moveDown')) iy -= 1;
  if (held('moveRight')) ix += 1;
  if (held('moveLeft')) ix -= 1;
  const s = controls.stick;
  if (s.m > 0) { ix += s.x; iy += s.y; }
  return screenToWorld(ix, iy, view.yaw);
}
export function takeJump() { const j = controls.jumpPressed; controls.jumpPressed = false; return j; }
