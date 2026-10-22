// "You died": a death asks what next (game/flow.js die). Respawn (Enter, R) puts you back where
// you came in, as a death always did (the cube as it was then); Main menu does the same and then
// quits to the main menu (game/menu.js; hosting with friends in the game, it asks a second time,
// as the Esc menu does). Esc opens the Esc menu over it. Alone the world waits meanwhile
// (state.js worldPaused); playing together it goes on, your body lies where it fell (game/update.js).
import { player, state } from './state.js';
import { clearInput } from './inputstate.js';
import { clearMouseInput } from './orders.js';
import { setInventoryOpen } from './inventory.js';
import { quitToMenu } from './menu.js';
import { savedHero } from './save.js';
import { clearEffects } from '../core/potions.js';
import { online, together } from '../net/online.js';
import { tr } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
const overlay = $('death-overlay');
const CONFIRM_MS = 4000;
let quitUntil = 0;   // the main menu button asks again until then (hosting friends)

export const deathAsked = () => !!state.deathAsk;

// died of `cause` (a message, or nothing known): back() does what a death does once answered
export function askRespawn(cause, back) {
  if (state.deathAsk) return;
  state.deathAsk = { back };
  quitUntil = 0;
  $('death-cause').textContent = cause ? tr(cause) : '';
  render();
  if (state.inventoryOpen) setInventoryOpen(false);
  overlay.hidden = false;
  clearInput(); clearMouseInput();   // nothing walks on by itself meanwhile
}

function render() {
  const sure = performance.now() < quitUntil;
  $('death-menu').classList.toggle('confirm', sure);
  $('death-menu').textContent = sure ? tr('Quit? Your friends drop out') : savedHero() ? tr('Save and quit to the menu') : tr('Quit to the menu');
}

function close() {
  const ask = state.deathAsk;
  state.deathAsk = null;
  overlay.hidden = true;
  document.activeElement?.blur?.();   // back to the game: keys play again
  return ask;
}

// respawn (true) or quit to the main menu (false); either way the death is undone first
export function answerDeath(respawn) {
  if (!state.deathAsk) return;
  if (!respawn && online.role === 'host' && together() && performance.now() >= quitUntil) {
    quitUntil = performance.now() + CONFIRM_MS;
    render();
    setTimeout(render, CONFIRM_MS + 50);
    return;
  }
  close().back();
  if (!respawn) quitToMenu();   // (it waits for the way back to finish: game/menu.js)
}

// the world goes (game/flow.js newWorld, endWorld) before it was answered: the question goes,
// and you are alive again for what comes next
export function forgetDeath() {
  if (!state.deathAsk) return;
  close();
  if (player.hp <= 0) { player.hp = player.maxHp; clearEffects(player); }
}

$('death-respawn').onclick = () => answerDeath(true);
$('death-menu').onclick = () => answerDeath(false);
