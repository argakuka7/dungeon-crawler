// The controls overlay (the help key, ?). It does not pause the game. The keys it shows are the
// ones the settings give (game/settings.js), drawn anew whenever they change.
import { state } from './state.js';
import { keysOf, nameOf, keyLabel, onSettingsChange } from './settings.js';
import { BAR_ACTIONS } from '../core/keybinds.js';

const overlay = document.getElementById('help-overlay');
const list = document.getElementById('help-keys'), closeHint = document.getElementById('help-close');
if (state.dev) for (const el of overlay.querySelectorAll('.dev-only')) el.hidden = false;

// keys: the actions whose keys it shows (several: each one's first key; one: both keys), or the
// words for a mouse control; esc: Esc comes first; also: after the keys; {id} in the text: that
// action's first key
const ROWS = [
  { keys: ['moveUp', 'moveLeft', 'moveDown', 'moveRight'], text: 'run (hold {walk} to walk)' },
  { keys: ['jump'], text: 'jump' },
  { keys: 'click floor', text: 'walk there (hold to keep following the cursor; not in the close view)' },
  { keys: 'click enemy', text: 'go and attack it (hold to keep attacking)' },
  { keys: 'mouse, close view', text: 'look around (the mouse is captured; Esc gives it back and opens the menu)' },
  { keys: 'click, close view', text: 'attack where the crosshair is (hold to keep attacking); a chest, item or villager under it and in reach: use it' },
  { keys: 'right click, close view', text: 'lock on to the enemy under the crosshair or ahead (flick the mouse sideways: the next one; again: let go); nothing there: the camera turns behind you' },
  { keys: ['attack'], text: 'hold to auto-attack enemies within reach (not with a flask in hand)' },
  { keys: ['turnLeft', 'turnRight'], text: 'rotate the view' },
  { keys: ['camera'], text: 'tap: the close view behind your hero, or back to the overview; hold and move the mouse: turn the overview (it settles on the nearest side)' },
  { keys: ['zoomIn', 'zoomOut'], also: 'wheel', text: 'zoom in / out (5 levels; in the close view: nearer to the hero or farther)' },
  { keys: 'click item / label', text: 'walk there and pick it up (weapons are only taken this way or from the inventory)' },
  { keys: 'click chest', text: 'walk up and open it' },
  { keys: ['action'], text: 'action: open the treasure chest next to you, else talk to the villager next to you (quests, or their wares), else collect coins and items within four cells' },
  { keys: 'click villager', text: 'walk up and talk: take their quests, hand in the ones done, trade (the alchemist in the merchant camp sells potions). A ! over them: a quest for you; a ?: one to hand in' },
  { keys: ['labels'], text: 'show the names of all items on the floor' },
  { keys: ['inventory'], text: 'inventory, with the items on the floor around you beside it: take them, or drop from the bag' },
  { keys: ['quests'], text: 'the quests (the second tab of the inventory): what you have taken on, done and put away' },
  { keys: BAR_ACTIONS, text: 'quick bar: use an item, drink a potion ({bar2} at the start), take a flask in hand (again: put it away) or equip a weapon (in the inventory: put the selected item there)' },
  { keys: 'click, flask in hand', text: 'throw it where the arc points' },
  { keys: ['knockOver'], text: 'knock over' },
  { keys: ['respawn'], text: 'respawn where you came in' },
  { keys: ['path'], text: 'show the generator path' },
  { keys: ['music'], text: 'music on / off' },
  { keys: ['menu'], esc: true, text: 'the menu: play together with up to three friends, the settings (music, volumes, keys), save and quit (alone, the game waits meanwhile)' },
  { keys: ['chat'], text: 'chat (playing together, your friends read it); the box keeps what happened' },
  { keys: ['command'], text: 'type a command (<kbd>/help</kbd> lists them, <kbd>Tab</kbd> completes)' },
  { keys: ['help'], text: 'this help' },
];

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const kbd = name => `<kbd>${esc(name)}</kbd>`;
const first = id => keysOf(id).find(k => k !== null) ?? null;
function keysCell({ keys, esc: withEsc, also }) {
  if (typeof keys === 'string') return esc(keys);
  const names = keys.length > 1 ? keys.map(first).filter(k => k !== null).map(k => kbd(nameOf(k))).join('')
    : keysOf(keys[0]).filter(k => k !== null).map(k => kbd(nameOf(k))).join(' / ');
  const parts = [withEsc && kbd('Esc'), names, also].filter(Boolean);
  return parts.length ? parts.join(' / ') : '<i>no key</i>';
}
const fill = text => text.replace(/\{(\w+)\}/g, (_, id) => (first(id) ? kbd(nameOf(first(id))) : 'its key'));
function render() {
  list.innerHTML = ROWS.map(r => `<dt>${keysCell(r)}</dt><dd>${fill(r.text)}</dd>`).join('');
  const help = keyLabel('help', { both: false });
  closeHint.innerHTML = `${help ? `${kbd(help)} / ` : ''}${kbd('Esc')} to close`;
}
render();
onSettingsChange(render);

export const helpOpen = () => !overlay.hidden;
export function setHelpOpen(open) { overlay.hidden = !open; }
export const toggleHelp = () => setHelpOpen(overlay.hidden);
