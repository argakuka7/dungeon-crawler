// Keyboard, mouse and wheel. Modal input never enters the game queue.
// The player always runs; holding Ctrl walks. Holding Shift auto-attacks enemies the weapon
// can reach (and does nothing without one, or with a flask in hand). Space jumps.
// Mouse: click the floor to walk there, click an enemy to attack it (hold for more), click an
// item on the floor to pick it up, click a treasure chest to open it, click a villager who
// trades to go and trade. With a flask in hand (game/throws.js) a click throws it at the cursor
// instead, whatever is there. F or Enter: the action key, opens the chest the player stands
// next to (else F goes to a friend, Enter opens the chat). I (or V): the inventory, with the floor in reach beside the bag
// when something lies there (game/inventory.js); X: item labels. 1-6: the quick bar (game/
// quickbar.js). Touch (game/touch.js) feeds the same paths: its stick moves like the keys, its
// action button holds like Shift, and a tap on the game clicks there without walking.
import { stepZoom } from '../core/zoom.js';
import { player, state, view, setStatus } from './state.js';
import { spawnEntry, nextCube } from './flow.js';
import { knockDown } from './ragdoll.js';
import { toggleInventory, setInventoryOpen } from './inventory.js';
import { controls, clearInput } from './inputstate.js';
import { helpOpen, setHelpOpen, toggleHelp } from './help.js';
import { requestCollect } from './loot.js';
import { pointer, pickFloor, aimPoint, hoveredEnemy, pointAt, updatePointer } from './pointer.js';
import { orderMove, orderAttack, orderPickup, orderChest, clearOrder, orderTrade } from './orders.js';
import { hoveredPickup, hoveredChest, hoveredVillager, toggleLabels, updateLootLabels } from './lootlabels.js';
import { queueAttack } from './sword.js';
import { softTarget, combatStats, readiedFlask } from '../core/combat.js';
import { throwTarget } from './throws.js';
import { lineOfFire } from './shots.js';
import { clearLine } from '../physics/enemynav.js';
import { allEnemies } from './enemies.js';
import { toggleMusic } from '../audio/music.js';
import { barKey } from './quickbar.js';
import { setMenuOpen, toggleMenu } from './escmenu.js';
import { goToFriend } from '../net/session.js';
import { useAction } from './chests.js';
import { screenToWorld, WALK_BELOW } from '../core/stick.js';
export { clearInput };

const { keys } = controls;
const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
const WALK = ['ControlLeft', 'ControlRight'], ATTACK = ['ShiftLeft', 'ShiftRight'];

addEventListener('keydown', e => {
  if (e.metaKey || e.altKey) return;
  // typing a name or a code (the Esc menu): only Escape is ours
  if (e.target?.tagName === 'INPUT' && e.target.type === 'text') {
    if (e.code === 'Escape' && state.menuOpen) { setMenuOpen(false); e.preventDefault(); }
    return;
  }
  // the main menu (game/menu.js) has its own keys
  if (state.mode === 'menu') return;
  // the Esc menu is open: Esc and O close it, the game gets no keys
  if (state.menuOpen) {
    if ((e.code === 'Escape' || e.code === 'KeyO') && !e.repeat) setMenuOpen(false);
    if (!['Tab', 'Enter', 'Space'].includes(e.code)) e.preventDefault();   // (the buttons keep Tab, Enter and Space)
    return;
  }
  // Ctrl is the walk modifier: track it and the movement keys (and keep Ctrl+S / Ctrl+D /
  // Ctrl+A from saving, bookmarking or selecting), leave every other Ctrl shortcut alone
  if (e.ctrlKey) {
    if (!state.inventoryOpen && (WALK.includes(e.code) || MOVE.includes(e.code))) { keys.add(e.code); e.preventDefault(); }
    return;
  }
  if (e.code === 'KeyI') { if (!e.repeat) { setHelpOpen(false); toggleInventory(); } e.preventDefault(); return; }
  if (e.code === 'KeyV') { if (!e.repeat) { setHelpOpen(false); toggleInventory(); } e.preventDefault(); return; }
  if (e.code === 'Escape' && state.inventoryOpen) { setInventoryOpen(false); e.preventDefault(); return; }
  // 1-6: the quick bar (with the inventory open: put the selected item there); not while typing
  const bar = /^Digit([1-6])$/.exec(e.code);
  if (bar && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) { if (!e.repeat) barKey(bar[1] - 1); e.preventDefault(); return; }
  if (state.inventoryOpen) return;
  // by key, not code: ? and / sit on different keys across layouts
  if (e.key === '?' || e.key === '/') { if (!e.repeat) toggleHelp(); e.preventDefault(); return; }
  if (e.code === 'Escape' && helpOpen()) { setHelpOpen(false); e.preventDefault(); return; }
  // Esc with nothing else open, and O: the menu (play together is in it)
  if (e.code === 'Escape' || e.code === 'KeyO') { if (!e.repeat) toggleMenu(); e.preventDefault(); return; }
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') { controls.jumpPressed = true; e.preventDefault(); }
  // a tap between two frames still swings (holding is handled every frame in update.js)
  if (ATTACK.includes(e.code) && !state.transitioning) autoAttack();
  if (e.code === 'KeyM') setStatus(toggleMusic() ? 'Music on' : 'Music off');
  if (e.code === 'KeyQ') view.yawTarget -= Math.PI / 2;
  if (e.code === 'KeyE') view.yawTarget += Math.PI / 2;
  if (e.code === 'KeyC') requestCollect();
  if (e.code === 'KeyR') { spawnEntry(); setStatus('Respawned where you came in'); }
  if (e.code === 'KeyN' && state.dev) nextCube();   // (new worlds come from the main menu)
  if (e.code === 'KeyX') toggleLabels();
  // F: the action key (open the chest beside us; Enter too, game/console.js), else playing
  // together: over to the friend
  if (e.code === 'KeyF' && !useAction()) goToFriend();
  if (e.code === 'KeyK' || e.code === 'KeyL') { view.zoomTarget = stepZoom(view.zoomTarget, e.code === 'KeyK' ? -1 : 1); e.preventDefault(); }
  if (e.code === 'KeyB' && !player.ragdoll) knockDown({ push: 3, hop: 2.5, reason: 'Whoops!' });
  if (e.code === 'KeyP') { state.showPath = !state.showPath; if (state.world) state.world.pathLine.visible = state.showPath; }
  if (e.code.startsWith('Arrow')) e.preventDefault();
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
export const autoAttackHeld = () => !state.inventoryOpen && !state.transitioning && (controls.attackHeld || ATTACK.some(k => keys.has(k)));
// Ctrl, or the touch stick pushed only a little
export const wantsWalk = () => WALK.some(k => keys.has(k)) || (controls.stick.m > 0 && controls.stick.m < WALK_BELOW);
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
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  const s = controls.stick;
  if (s.m > 0) { ix += s.x; iy += s.y; }
  return screenToWorld(ix, iy, view.yaw);
}
export function takeJump() { const j = controls.jumpPressed; controls.jumpPressed = false; return j; }
