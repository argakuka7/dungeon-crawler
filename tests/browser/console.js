// Browser integration checks for the chat box (game/console.js): opening and closing it with
// the keys, typing that does not play, completing and running commands, history, the
// chronicle (deaths, depths, kills) and chat. Resets to a fresh seed-3 run before and after.
// With ?dev=1, from the devtools console:
//   await (await import('/tests/browser/console.js')).runConsoleChecks()
import { player, state } from '../../src/game/state.js';
import { newWorld } from '../../src/game/flow.js';
import { clearInput } from '../../src/game/input.js';
import { controls } from '../../src/game/inputstate.js';
import { hitPlayer } from '../../src/game/enemycombat.js';
import { allEnemies } from '../../src/game/enemies.js';
import { chronicle, clearChronicle } from '../../src/game/log.js';
import { chatOpen, closeChat, openChat } from '../../src/game/console.js';
import { runCommand } from '../../src/game/commands.js';
import { countOf } from '../../src/core/inventory.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const $ = id => document.getElementById(id);
const key = (code, key = code, target = window) => target.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
const input = () => $('chat-input');
function type(text) {
  const el = input();
  el.value += text;
  el.setSelectionRange(el.value.length, el.value.length);
  el.dispatchEvent(new Event('input'));
}
const popup = () => [...$('chat-popup').children].map(li => li.querySelector('.label').textContent);
const last = () => chronicle.entries.at(-1);

export async function runConsoleChecks() {
  check(state.dev, 'Run with ?dev=1');
  const results = [];
  await newWorld(3); clearInput(); clearChronicle();
  try {
    // Enter opens the box to chat; the keys type instead of playing
    key('Enter');
    check(chatOpen() && document.activeElement === input() && input().value === '', 'Enter must open the box, empty');
    const at = [player.x, player.z, state.showPath];
    key('KeyW', 'w', input()); key('KeyP', 'p', input());
    check(!controls.keys.has('KeyW') && state.showPath === at[2], 'Typing must not walk or toggle the game');
    key('Escape', 'Escape', input());
    check(!chatOpen(), 'Esc must close the box');
    results.push('Enter opens, typing does not play, Esc closes');

    // ` opens it with the / typed: the commands are offered, Tab takes one
    key('Backquote', '`');
    check(chatOpen() && input().value === '/', '` must open the box with a /');
    check(popup()[0] === 'clear' && popup().includes('weapon'), 'All the commands must be offered, in order: ' + popup());
    key('ArrowDown', 'ArrowDown', input()); key('ArrowDown', 'ArrowDown', input());
    check($('chat-popup').children[2].classList.contains('on'), 'Down must move through the suggestions');
    key('ArrowUp', 'ArrowUp', input()); key('ArrowUp', 'ArrowUp', input()); key('ArrowUp', 'ArrowUp', input());
    check($('chat-popup').lastElementChild.classList.contains('on') && input().value === '/', 'Up from the first must wrap to the last, not leave the suggestions');
    type('gi');
    check(popup()[0] === 'give', '"gi" must offer /give first: ' + popup());
    key('Tab', 'Tab', input());
    check(input().value === '/give ', 'Tab must take /give: ' + JSON.stringify(input().value));
    check(!$('chat-usage').hidden && $('chat-usage').querySelector('b')?.textContent === '<item>', 'The usage must show the item is next');
    type('gr he');
    check(popup()[0] === 'Greater health potion', 'Several words must find the Greater health potion: ' + popup());
    const potions = countOf(player.inventory, 'item_potion_health_greater');
    key('Enter', 'Enter', input());
    await delay(30);
    check(countOf(player.inventory, 'item_potion_health_greater') === potions + 1, 'Enter must run /give with the best fit');
    check(!chatOpen() && $('chat-popup').hidden, 'After a command the box and its suggestions must close');
    openChat('');
    key('ArrowUp', 'ArrowUp', input());
    check(input().value === '/give gr he', 'Up must bring the last line back: ' + input().value);
    const typed = JSON.parse(localStorage.getItem('cube-crawler-history'));
    key('ArrowUp', 'ArrowUp', input());
    check(input().value === (typed.at(-2) ?? typed.at(-1)), 'Going through the history goes on through it, not into the suggestions');
    key('Escape', 'Escape', input()); key('Escape', 'Escape', input());
    check(!chatOpen(), 'Esc, Esc must close the popup and then the box');
    results.push('` opens commands / Tab completes names and items / Enter runs the best fit / history');

    // what goes wrong is said, not thrown
    await runCommand('/give long');
    check(last().kind === 'system' && /could be/.test(last().data.text), 'An unclear item must be asked about: ' + last().data.text);
    await runCommand('/nothing');
    check(/no command/.test(last().data.text), 'An unknown command must be named');
    check(!await runCommand('/spawn redback', { dev: false }), 'Without the dev tools the developer commands must not exist');
    results.push('mistakes and missing dev tools are told in the box');

    // the developer commands do what they say
    check(await runCommand('/spawn redback 5 2'), '/spawn must run');
    check(allEnemies().filter(e => e.id.startsWith('dev:') && e.level === 5).length === 2, '/spawn must spawn two level-5 redbacks');
    const xp = player.xp;
    await runCommand('/kill');
    await delay(100);
    check(player.xp > xp && chronicle.entries.some(e => e.kind === 'kill'), '/kill must pay XP and the kill go into the chronicle');
    await runCommand('/passive on'); check(state.devPassive, '/passive on');
    await runCommand('/passive'); check(!state.devPassive, '/passive again wakes them up');
    await runCommand('/level 5'); check(player.level === 5 && player.hp === player.maxHp, '/level 5');
    results.push('/spawn, /kill, /passive, /level');

    // the chronicle: a new depth, and a death with what did it
    await runCommand('/goto down');
    for (let i = 0; i < 150 && (state.transitioning || !state.map.depth); i++) await delay(50);
    check(chronicle.entries.some(e => e.kind === 'depth' && e.data.depth === state.map.depth), 'Reaching a new depth must go into the chronicle');
    hitPlayer({ damage: 9999, knock: 1, knockDown: true, hop: 2, reason: 'Bitten by a Redback!', by: { label: 'Redback', level: 7 } },
      player.x + 1, player.z, -1, 0);
    for (let i = 0; i < 200 && !chronicle.entries.some(e => e.kind === 'death'); i++) await delay(50);
    const death = chronicle.entries.find(e => e.kind === 'death');
    check(death && death.data.cause === 'bitten by a Redback' && death.data.by?.level === 7 && death.data.level === 5
      && death.data.depth === state.map.depth && death.data.weapon, 'The death record: ' + JSON.stringify(death?.data));
    check([...$('chat-log').children].some(li => li.classList.contains('k-death') && /You died: bitten by a Redback \(Lv 7\)/.test(li.textContent)),
      'The death must show in the box');
    results.push('depths and deaths with their cause go into the chronicle');

    // chat alone: kept all the same
    key('Enter'); type('hello'); key('Enter', 'Enter', input());
    check(!chatOpen() && chronicle.entries.some(e => e.kind === 'chat' && e.data.text === 'hello' && !e.who), 'A chat line must be kept');
    results.push('chat lines are kept');
    return results;
  } finally { closeChat(); clearInput(); state.devPassive = false; await newWorld(3); }
}
