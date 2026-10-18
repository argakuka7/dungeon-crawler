// The Quests tab of the inventory (game/inventory.js has the panel and its tabs; U opens it on
// this tab). On the left the quests going on, done or archived (a filter); when the panel was
// opened by talking to a villager who gives quests, what they have comes first: an offer to take,
// a quest to hand in. On the right the selected quest: who gave it, its story, its goals, its
// reward, and what can be done with it: Accept, Hand in (only to its giver), Archive / Unarchive,
// Restart (a failed quest, from the beginning). Everything goes through game/quests.js, which asks
// the host when playing together.
import { ITEMS } from '../core/items.js';
import { formatCoins } from '../core/inventory.js';
import { rarityOf } from '../core/gear/rarities.js';
import { displayName } from '../core/gear/stats.js';
import { GIVERS, giverOf, giverQuests, questLists, stateText, stageText, depthName, giverName, carried } from '../core/quests.js';
import { questLog, questAct } from './quests.js';
import { state } from './state.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// filter: which list shows; selected: the quest shown on the right (its id); tracked: the quest
// followed in the corner (null: the newest one going on), this player's own choice
let filter = 'active', selected = null, signature = '', talker = null, onChange = () => {}, tracked = null;

// the panel opened (talking to villager v, or not): the giver's news is selected first
export function openQuests(v = null) {
  talker = giverOf(v) ? v : null;
  selected = null; signature = '';
  const news = talker && giverQuests(questLog(), giverOf(talker)).find(q => q.state === 'ready' || q.state === 'offered');
  if (news) selected = news.id;
  if (!selected) filter = 'active';
}
export const closeQuests = () => { talker = null; };
// game/inventory.js: redraw when something here changed
export function onQuestChange(fn) { onChange = fn; }

const entry = (q, on) => {
  const mark = q.state === 'offered' ? '!' : q.state === 'ready' ? '?' : q.state === 'failed' ? '✗' : q.state === 'done' ? '✓' : '·';
  return `<button class="quest-entry ${q.state}${on ? ' selected' : ''}" role="option" aria-selected="${on}" data-quest="${esc(q.id)}">`
    + `<span class="mark">${mark}</span><span><b>${esc(q.title)}</b><small>${esc(stateText(q))}</small></span></button>`;
};
const itemLine = i => {
  const def = ITEMS[i.itemId], color = i.gen ? ` style="color:${rarityOf(i).css}"` : '';
  return `<li${color}>${esc(i.gen ? `${displayName(i)} (${rarityOf(i).name} ${def.name})` : `${def.name}${i.count > 1 ? ` ×${i.count}` : ''}`)}</li>`;
};

export function drawQuests() {
  const L = questLog();
  if (!L) return;
  const lists = questLists(L), mine = talker ? giverQuests(L, giverOf(talker)) : [];
  const all = [...mine, ...lists.active, ...lists.done, ...lists.archived];
  if (selected && !L.list.some(q => q.id === selected && (q.state !== 'offered' || mine.includes(q)))) selected = null;
  if (!selected) selected = (mine[0] ?? lists[filter][0])?.id ?? null;
  const next = `${L.version}:${filter}:${selected}:${talker?.name}:${tracked}`;
  if (next === signature) return;
  signature = next;
  const focus = document.activeElement?.dataset?.quest;
  // what the villager has
  $('quests-talk').hidden = !talker;
  if (talker) {
    const g = { title: talker.title ?? GIVERS[talker.name]?.title ?? talker.name };
    const say = mine.some(q => q.state === 'ready') ? 'You are back! Did you do what I asked?'
      : mine.some(q => q.state === 'offered') ? 'I could use some help...' : mine.length ? 'How is it going?' : 'Nothing for you just now. Come back when you have been further down.';
    $('quests-talk').innerHTML = `<h2>${esc(g.title)}</h2><p>${esc(say)}</p>`
      + (mine.length ? `<div class="quest-entries" role="listbox" aria-label="${esc(g.title)}'s quests">${mine.map(q => entry(q, q.id === selected)).join('')}</div>` : '');
  }
  // the list
  for (const b of $('quests-filter').querySelectorAll('[data-filter]')) {
    const f = b.dataset.filter, n = lists[f].length;
    b.setAttribute('aria-pressed', String(f === filter));
    b.textContent = `${{ active: 'Going on', done: 'Done', archived: 'Archived' }[f]}${n ? ` (${n})` : ''}`;
  }
  const shown = lists[filter].filter(q => !mine.includes(q));
  $('quests-list').innerHTML = shown.length ? shown.map(q => entry(q, q.id === selected)).join('')
    : `<div class="quest-empty">${{ active: mine.length ? 'Nothing else going on.' : 'No quests going on. Talk to the villagers in town and in the merchant camp: a ! over one means a quest for you.',
      done: 'No quests done yet.', archived: 'Nothing archived. Archive a quest to put it away; it waits here until you bring it back.' }[filter]}</div>`;
  // the selected quest
  const q = all.find(x => x.id === selected) ?? null;
  $('quests-details-inner').innerHTML = q ? details(q) : '<h2>Quests</h2><p class="quest-text">Select a quest to read it.</p>';
  if (focus) (document.querySelector(`#quests-body [data-quest="${CSS.escape(focus)}"]`))?.focus();
}

// what a quest carries, each thing once with how many
function carrying(q) {
  const n = new Map();
  for (const id of carried(q)) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].map(([id, k]) => `<li>${esc(ITEMS[id].name)}${k > 1 ? ` ×${k}` : ''}</li>`).join('');
}
function details(q) {
  const atGiver = !!talker && giverOf(talker) === q.giver, r = q.rewards, who = giverName(q), where = q.from?.where ?? GIVERS[q.giver]?.where ?? '';
  const goals = q.stages.map((s, i) => `<li class="${s.done ? 'done' : i === q.stage && q.state === 'active' ? 'now' : ''}">${esc(stageText(s))}</li>`).join('');
  const rewards = [`<li>+${r.xp} XP</li>`, r.copper ? `<li>${formatCoins(r.copper)}</li>` : '', ...r.items.map(itemLine),
    q.payout === 'self' ? '<li>and whatever the treasure holds</li>' : ''].join('');
  const back = q.payout === 'return' ? `Go back to ${who}${where ? ` (${where})` : ''} to hand it in.` : '';
  const hint = q.archived ? 'Archived: put away. It counts nothing until you bring it back.'
    : q.state === 'ready' && !atGiver ? `Done! ${back}`
    : q.state === 'offered' ? (q.payout === 'return' ? `When it is done, come back to ${who} for the reward.` : '')
    : q.state === 'failed' ? 'It failed. Restart it to try again from the beginning.'
    : q.state === 'done' ? 'Complete: everyone in the game got the reward.' : '';
  const buttons = [
    q.state === 'offered' && atGiver ? '<button class="main" data-act="accept">Accept</button>' : '',
    q.state === 'ready' && atGiver && !q.archived ? '<button class="main" data-act="handIn">Hand in</button>' : '',
    q.state === 'failed' && !q.archived ? '<button class="main" data-act="restart">Restart</button>' : '',
    q.state === 'active' && !q.archived ? `<button data-act="track">${tracked === q.id ? 'Following' : 'Follow'}</button>` : '',
    q.state !== 'offered' && !q.archived ? '<button data-act="archive">Archive</button>' : '',
    q.archived ? '<button data-act="unarchive">Unarchive</button>' : '',
  ].join('');
  return `<h2>${esc(q.title)}</h2>`
    + `<div class="quest-meta">From ${esc(who)} · ${esc(depthName(q.depth))} · ${q.difficulty}</div>`
    + `<p class="quest-text">${esc(q.text)}</p>`
    + `<h3>Goal</h3><ul class="quest-goals">${goals}</ul>`
    + (carried(q).length ? `<h3>Carrying</h3><ul class="quest-rewards">${carrying(q)}</ul>` : '')
    + `<h3>Reward</h3><ul class="quest-rewards">${rewards}</ul>`
    + (hint ? `<p class="quest-hint">${esc(hint)}</p>` : '')
    + (buttons ? `<div class="quest-actions">${buttons}</div>` : '');
}

// clicks: pick a quest, a filter, or do something with the selected quest
$('quests-body').addEventListener('click', e => {
  const pickQ = e.target.closest('[data-quest]'), f = e.target.closest('[data-filter]'), act = e.target.closest('[data-act]');
  if (pickQ) selected = pickQ.dataset.quest;
  else if (f) { filter = f.dataset.filter; selected = null; }
  else if (act && selected) {
    const id = selected;
    if (act.dataset.act === 'track') { tracked = tracked === id ? null : id; signature = ''; onChange(); drawTracker(); return; }
    questAct(act.dataset.act, id);
    // an archived quest leaves the list it was in: show it where it went now
    if (act.dataset.act === 'archive') filter = 'archived';
    else if (act.dataset.act === 'unarchive') filter = 'active';
    else if (act.dataset.act === 'accept') filter = 'active';
  } else return;
  signature = '';
  onChange();
});
// The quest followed, in the corner: the one chosen (Follow), else the newest one going on
const box = $('quest-track');
let shownTrack = '';
// (the minimap marks where it wants you, game/minimap.js)
export function followedQuest() {
  const L = questLog(), live = state.mode === 'play' && !!L;
  const going = live ? L.list.filter(q => (q.state === 'active' || q.state === 'ready' || q.state === 'failed') && !q.archived) : [];
  return going.find(x => x.id === tracked) ?? going.at(-1) ?? null;
}
export function drawTracker() {
  const q = followedQuest();
  const text = q ? `<b>${esc(q.title)}</b>${esc(stateText(q))}` : '';
  if (text === shownTrack) return;
  shownTrack = text;
  box.hidden = !q;
  box.innerHTML = text;
}

// up and down move through the quests
$('quests-body').addEventListener('keydown', e => {
  if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
  const all = [...$('quests-body').querySelectorAll('[data-quest]')], i = all.indexOf(document.activeElement);
  if (i < 0) return;
  const next = all[i + (e.code === 'ArrowDown' ? 1 : -1)];
  if (next) { e.preventDefault(); next.focus(); next.click(); }
});
