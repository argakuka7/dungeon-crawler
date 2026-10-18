// The world's quests while playing (core/quests.js has the rules, docs/quests.md the design).
// The quest log is the world's (state.run.quests), shared by everyone in it: playing together the
// host's game keeps it and decides (the authority), the guests are told the log as it changes
// (relay.quests, net/session.js) and ask the host for what they do (relay.questAct). Alone, our
// game is the authority.
//
// What happens in the world comes in as events (questEvent): a cube visited (game/flow.js), a
// horde broken (game/enemies.js), standing beside a landmark (updateQuests looks), a guardian's
// gate open (the gates are looked at every half second). A quest handed in pays everyone in the
// game: the host pays itself and tells the others (relay.questReward), each game pays its own
// player once (grant).
import { player, state, setStatus } from './state.js';
import { online, relay } from '../net/online.js';
import { log } from './log.js';
import { sfx } from '../audio/sfx.js';
import { awardXP } from '../core/progression.js';
import { addCopper, addInstance, autoBar, fits, formatCoins } from '../core/inventory.js';
import { ITEMS } from '../core/items.js';
import { dropAtFeet } from './loot.js';
import { giverOf, giverName, meet, refreshOffers, settle, questEvent as noteEvent, accept, archive, restart, handIn, wantsLandmark,
  progressOf, restoreProgress, checkQuestLog, checkRewards, packQuestLog, LANDMARK_REACH } from '../core/quests.js';
import { cleanText } from '../core/chronicle.js';
import { pickUpQuestItems, questWorldChanged, bountiesHere } from './questworld.js';
import { allEnemies, addEnemies, mirroring } from './enemies.js';
import { rebuildWorld } from './flow.js';

const CHECK_EVERY = 0.5;   // s (real time): the gates looked at, offers brought up to date, a landmark looked for
// seen: the quests' states as last told (in run seenIn); sent: the log as last given out
let checkIn = 0, seen = null, seenIn = null, sent = null, sentVersion = -1;
// the quests paid here already (quest id, per world): a reward comes once
const granted = new Set();

export const questLog = () => state.run.quests;
// do we decide about the quests (alone, or the host), or does the host (a guest)?
export const questAuthority = () => online.role !== 'guest';
const ctx = () => ({ seed: state.cubes.seed, layout: state.cubes.layout, gates: state.run.unlockedGates, chests: state.run.chests,
  defeated: state.run.defeated, now: Date.now() });
// what the goals are checked against (core/quests.js goalDone)
const facts = () => ({ gates: state.run.unlockedGates, chests: state.run.chests, defeated: state.run.defeated });
const live = () => state.mode === 'play' && !!state.cubes && !!state.run?.quests;

// --- what happens ---------------------------------------------------------------------------------

// Something happened in the world (core/quests.js questEvent): the authority notes it, a guest
// tells the host
export function questEvent(ev) {
  if (!live()) return;
  if (!questAuthority()) { relay.questAct?.({ act: 'event', ev }); return; }
  const paid = noteEvent(questLog(), ev, facts(), Date.now());
  for (const q of paid) payEveryone(q);
  share();
}

// What the players do with a quest: 'accept', 'archive', 'unarchive', 'restart', 'handIn'. A guest
// asks the host. true: done (or asked).
export function questAct(act, id) {
  if (!live()) return false;
  if (!questAuthority()) { relay.questAct?.({ act, id }); return true; }
  const done = doAct(act, id);
  share();
  return done;
}
function doAct(act, id) {
  const L = questLog(), gates = facts();
  switch (act) {
    case 'accept': return accept(L, id, gates);
    case 'archive': return archive(L, id, true, gates);
    case 'unarchive': return archive(L, id, false, gates);
    case 'restart': return restart(L, id, gates);
    case 'meet': return meet(L, id) && refreshOffers(L, ctx(), [id]);
    case 'handIn': {
      const q = handIn(L, id, Date.now());
      if (q) payEveryone(q);
      return !!q;
    }
  }
  return false;
}

// The host: what a guest asked for (net/session.js)
export function guestQuestAct(m) {
  if (!questAuthority() || !live() || !m || typeof m !== 'object') return;
  if (m.act === 'event' && m.ev && typeof m.ev === 'object') {
    const { kind, depth, key } = m.ev;
    if (['visit', 'horde', 'landmark'].includes(kind)) questEvent({ kind, depth: Number.isInteger(depth) ? depth : undefined, key: typeof key === 'string' ? key : undefined });
    if (['found', 'rescued'].includes(kind) && typeof m.ev.quest === 'string') questEvent({ kind, quest: m.ev.quest });
  } else if (typeof m.id === 'string' && ['accept', 'archive', 'unarchive', 'restart', 'handIn', 'meet'].includes(m.act)) { doAct(m.act, m.id); share(); }
}

// A guest: the host's quest log (net/session.js); fresh: it comes with the welcome (nothing to
// tell about it: it is not news)
export function takeQuestLog(packed, fresh = false) {
  if (!state.run) return;
  state.run.quests = checkQuestLog(packed);
  if (fresh) seen = null;
  share();
}

// --- paying -------------------------------------------------------------------------------------

function payEveryone(q) {
  relay.questReward?.(q.id, q.rewards, q.title);
  grant(q.id, q.rewards, q.title);
}
// A guest: the host says a quest was handed in: our reward (net/session.js)
export function questRewarded(id, rewards, title) {
  if (typeof id === 'string' && id.length <= 60) grant(id, checkRewards(rewards), cleanText(title, 80) || 'a quest');
}
// pay our player for quest `id` (once): XP, coins, and the items into the bag (or at our feet
// when it is full)
function grant(id, rewards, title) {
  const key = `${state.cubes?.seed}:${id}`;
  if (granted.has(key)) return;
  granted.add(key);
  const levels = rewards.xp ? awardXP(player, rewards.xp) : 0;
  if (rewards.copper) addCopper(player.inventory, rewards.copper);
  for (const item of rewards.items) {
    const it = structuredClone(item);
    if (fits(player.inventory, it) && addInstance(player.inventory, it)) { if (ITEMS[it.itemId].use) autoBar(player.inventory, it.itemId); }
    else if (state.map) dropAtFeet(it);
  }
  const coins = rewards.copper ? formatCoins(rewards.copper) : '';
  log('quest', { title, what: 'done', xp: rewards.xp, coins });
  setStatus(`Quest complete: ${title} · +${rewards.xp} XP${coins ? ` · ${coins}` : ''}`);
  sfx('coin', { pitch: 0.8 });
  if (levels) { log('level', { level: player.level }, { share: true }); sfx('levelUp'); }
}

// --- a death puts the cube back (game/flow.js) ------------------------------------------------

export const questMark = () => state.run?.quests ? progressOf(state.run.quests) : null;
export function restoreQuests(mark) {
  if (mark && questAuthority() && state.run?.quests) restoreProgress(state.run.quests, mark);
}

// --- every frame ----------------------------------------------------------------------------------

// tell what changed about the quests: a quest taken, its goals done, failed (a reward is told
// when it is paid)
function announce(L) {
  const now = new Map(L.list.map(q => [q.id, q.state]));
  if (seen && seenIn === state.run) for (const q of L.list) {
    const was = seen.get(q.id);
    if (!was || was === q.state) continue;
    const giver = giverName(q);
    if (q.state === 'active' && was === 'offered') { log('quest', { title: q.title, what: 'taken' }); setStatus(`Quest taken: ${q.title}`); }
    else if (q.state === 'active' && was === 'failed') log('quest', { title: q.title, what: 'restarted' });
    else if (q.state === 'ready') { log('quest', { title: q.title, what: 'ready', giver }); setStatus(`Quest done: ${q.title} · back to ${giver}`); sfx('unlock'); }
    else if (q.state === 'failed') { log('quest', { title: q.title, what: 'failed' }); setStatus(`Quest failed: ${q.title}`); }
  }
  seen = now; seenIn = state.run;
}

let landmarkSaid = '';
// main.js, every frame
export function updateQuests(dt) {
  if (!live()) return;
  const L = questLog();
  if ((checkIn -= dt) <= 0) {
    checkIn = CHECK_EVERY;
    if (questAuthority()) {
      for (const q of settle(L, facts(), Date.now())) payEveryone(q);
      refreshOffers(L, ctx());
    }
    // standing beside a landmark a quest wants
    const site = state.map && !state.transitioning && wantsLandmark(L, state.cubeKey)
      && (state.map.rewardSites ?? []).find(s => s.landmark && s.anchor);
    if (site && Math.hypot(site.anchor.x - player.x, site.anchor.z - player.z) <= LANDMARK_REACH && Math.abs(site.anchor.y - player.y) < 2.5
      && landmarkSaid !== `${state.cubeKey}:${L.version}`) {
      landmarkSaid = `${state.cubeKey}:${L.version}`;
      questEvent({ kind: 'landmark', key: state.cubeKey });
    }
    // somebody lost found, a chest opened, a quest taken: the cube as it is now
    if (state.map && !state.transitioning && questWorldChanged()) rebuildWorld();
    // a bounty waiting here (where we run the enemies): on its hiding place
    if (state.map && !state.transitioning && !mirroring()) {
      const here = new Set(allEnemies().map(e => e.id)), missing = bountiesHere().filter(e => !here.has(e.id));
      if (missing.length) addEnemies(missing);
    }
  }
  pickUpQuestItems(questEvent);
  share();
}
// what changed is told: on our screen, and (the authority) to the others
function share() {
  const L = questLog();
  if (!L || L.version === sentVersion && sent === L) return;
  sentVersion = L.version; sent = L;
  announce(L);
  if (questAuthority()) relay.quests?.(packQuestLog(L));
}
// a guest just came in: the log goes out again (net/session.js)
export const questLogPacked = () => state.run?.quests ? packQuestLog(state.run.quests) : null;

// --- talking to a giver ---------------------------------------------------------------------------

// talking to somebody a quest is looking for (game/questworld.js): found! They thank you
export function rescue(v) {
  if (!v?.lost || !live()) return false;
  setStatus(`${v.name}: Thank you! I will go back now. Here, take this.`);
  questEvent({ kind: 'rescued', quest: v.lost });
  return true;
}

// what talking to villager v is about: their offers brought up to date first (the authority)
export function talkQuests(v) {
  const giver = giverOf(v);
  if (!giver || !live()) return giver;
  if (!questLog().met.includes(giver) && v.giver) questAct('meet', giver);   // somebody out in the world: met now
  if (questAuthority()) refreshOffers(questLog(), ctx(), [giver]);
  return giver;
}
