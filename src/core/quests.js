// Quests (docs/quests.md). Pure: no DOM, no game state, so it is tested in node; game/quests.js
// runs it, net/session.js shares it, core/save.js keeps it with the world.
//
// The quest log belongs to the world, not to a hero: everyone in a world plays the same quests.
//   { list, next, deepest, broken, version }
//   list:    the quests, offered ones included (newest last)
//   next:    { [giver]: n } how many quests each giver has made (the next one's number)
//   deepest: the deepest depth anyone got to in this world (what `reach` quests ask for)
//   broken:  the cube keys of the hordes broken (what `horde` quests ask for)
//   version: goes up with every change (what the panel and the others watch)
//
// A quest:
//   { id, giver, n, kind, depth, difficulty, target, title, text, stages, stage, payout,
//     rewards: { xp, copper, items }, state, archived, created, finished }
//   stages: [{ goal, depth, key?, text, done }], one after another; `stage` is the current one
//   payout: 'return' (back to the giver, who pays) or 'spot' (paid where the last goal is done)
//   state:  'offered' | 'active' | 'ready' (to hand in) | 'done' | 'failed'
//   archived: put away by the players (a soft abandon): hidden, and it counts no progress
//
// What a giver offers is made from the world's seed, the giver and its number
// (hash(seed, giver, n)), checked against the world as it is (`ctx`, below): every target is
// one the layout has and nobody has done yet. The quest is kept whole once made, so a changed
// generator leaves the quests taken alone.
//
// ctx: { seed, layout: depth -> the depth's layout (world/layout.js makeLayouts), gates: the
// guardian gates open (run.unlockedGates), now: Date.now() }
import { mulberry32, hash32 } from './util.js';
import { hashString } from './gear/drops.js';
import { rollWeapon } from './gear/generate.js';
import { RARITY } from './gear/rarities.js';
import { validGen } from './loot.js';
import { rollPotions } from './potions.js';
import { ITEMS } from './items.js';
import { CHESTS } from './chests.js';
import { depthLevel, grown, GROWTH, ENEMY_KINDS } from './enemies.js';
import { xpToNext } from './progression.js';
import { bossAt } from './bosses.js';
import { PROP_METADATA } from './propmetadata.js';
import { ROLES, residentOf, isNpcGiver, spotOfGiver, keyOfSpot } from './npcs.js';

const MAX_DEPTH = 20;   // themes/depth.js MAX_DEPTH
export const STATES = ['offered', 'active', 'ready', 'done', 'failed'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
// offers a giver shows at a time
export const MAX_OFFERS = 1;
// how close (cells) to a landmark's chest counts as standing beside it
export const LANDMARK_REACH = 3.5;

// Who gives quests, and which kinds they lean towards (weights). The six villagers of the town
// and the merchant camp (world/town.js VILLAGERS, by name); and the people living at the seats
// and camps out in the world (core/npcs.js), 'npc:' + their spot's id, who ask about their own
// depth and the one below. A giver once talked to (log.met) makes offers like the villagers.
export const GIVERS = {
  innkeeper: { title: 'Innkeeper', where: 'on the inn\'s porch in town', kinds: { reach: 3, horde: 2, landmark: 1 } },
  groom: { title: 'Groom', where: 'at the stable in town', kinds: { reach: 2, landmark: 2, guardian: 1 } },
  smith: { title: 'Smith', where: 'at the anvil in town', kinds: { guardian: 3, horde: 2 } },
  keeper: { title: 'Pet keeper', where: 'by the pet shop in town', kinds: { landmark: 3, reach: 1, horde: 1 } },
  alchemist: { title: 'Alchemist', where: 'in the merchant camp', kinds: { landmark: 2, guardian: 1, horde: 1 } },
  enchanter: { title: 'Enchanter', where: 'in the merchant camp', kinds: { landmark: 3, reach: 2, guardian: 1 } },
};
export const giverOf = villager => villager?.giver ?? (GIVERS[villager?.name] ? villager.name : null);
export const isGiver = g => !!GIVERS[g] || isNpcGiver(g);

// What a giver is to the quests: { name (in a sentence: 'the Innkeeper', 'Ada the hermit'),
// title (on its own: 'Innkeeper', 'Ada the hermit'), where, kinds, depths(log) }; null: nobody
export function giverProfile(giver, ctx) {
  if (GIVERS[giver]) return { ...GIVERS[giver], name: `the ${GIVERS[giver].title}`, depths: log => window(log) };
  const id = spotOfGiver(giver), key = id && keyOfSpot(id);
  if (!key) return null;
  const depth = -Number(key.split(',')[1]), plan = ctx.layout(depth)?.spots?.get(key)?.find(s => s.id === id), npc = residentOf(plan);
  if (!npc) return null;
  return { title: npc.title, name: npc.title, where: plan.kind === 'camp' ? `at the camp on ${depthName(depth)}` : `on ${depthName(depth)}`,
    kinds: ROLES[npc.role].kinds, depths: () => range(depth, depth + 1) };
}
// how a quest names its giver: in a sentence, on its own
export const giverName = q => q.from?.name ?? `the ${GIVERS[q.giver]?.title ?? 'giver'}`;
export const giverTitle = q => q.from?.title ?? GIVERS[q.giver]?.title ?? 'Giver';

export const createQuestLog = () => ({ list: [], next: {}, deepest: 0, broken: [], met: [], version: 0 });
// talked to giver g for the first time: from now on it makes offers (refreshOffers)
export function meet(log, g) {
  if (GIVERS[g] || !isNpcGiver(g) || log.met.includes(g)) return false;
  log.met.push(g); log.version++;
  return true;
}

// --- words ----------------------------------------------------------------------------------------

const cap = s => s[0].toUpperCase() + s.slice(1);
const ORDINAL = ['first', 'second', 'third', 'fourth'];
export const depthName = d => d === 0 ? 'the road out of town' : `depth ${d}`;
const themeName = (ctx, d) => d === 0 ? 'the meadows' : `the ${ctx.layout(d).theme.name.toLowerCase()}`;
const plural = label => /s$/.test(label) ? label : `${label}s`;
// a landmark's name as said: 'meadow_windmill_a' -> 'windmill'
export function landmarkName(name) {
  const base = PROP_METADATA.find(p => p.name === name)?.base ?? String(name).replace(/^[a-z]+_|_[a-z]$/g, '');
  return base.replace(/_/g, ' ');
}
const pick = (R, xs) => xs[Math.floor(R() * xs.length)];

// --- the kinds of quests ---------------------------------------------------------------------------

// Each kind: targets(ctx, log, depths) -> what it could be about now, at those depths ({ id,
// depth, ... }), and quest(t,
// ctx, R, giver) -> its words and stages. A target's `id` is what two quests may not share.
const KINDS = {
  // get down to a depth nobody has been to yet
  reach: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.filter(d => d > log.deepest && d <= log.deepest + 2).map(depth => ({ id: `reach:${depth}`, depth })),
    quest(t, ctx, R) {
      const place = themeName(ctx, t.depth);
      return {
        title: `Down to depth ${t.depth}`,
        text: pick(R, [
          `Travellers talk about ${place}, down on depth ${t.depth}. Nobody I know has been there. Go and see, and come back to tell me what it is like.`,
          `I have heard of ${place}, deep down on depth ${t.depth}. Will you go there for me? Then come back and tell me all about it.`,
        ]),
        stages: [{ goal: 'reach', depth: t.depth, text: `Reach depth ${t.depth} (${place})` }],
      };
    },
  },
  // stand beside the landmark of a depth (its grand reward site, world/sites.js)
  landmark: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.filter(d => d > 0).flatMap(depth => [...ctx.layout(depth).sitePlans]
      .filter(([, plans]) => plans[0]?.landmark).map(([key, plans]) => ({ id: `landmark:${key}`, depth, key, landmark: plans[0].landmark }))),
    quest(t, ctx, R) {
      const name = landmarkName(t.landmark), place = themeName(ctx, t.depth);
      return {
        title: `The ${name}`,
        text: pick(R, [
          `Somewhere in ${place} on depth ${t.depth} there is a ${name}. My grandmother told me about it. Find it, stand beside it, and come back to tell me it is really there.`,
          `They say a ${name} stands in ${place}, on depth ${t.depth}. I would love to know what it looks like. Find it for me and come back.`,
        ]),
        target: { landmark: t.landmark },
        stages: [{ goal: 'landmark', depth: t.depth, key: t.key, text: `Find the ${name} on depth ${t.depth}` }],
      };
    },
  },
  // beat a guardian (core/guardians.js): its gate opens
  guardian: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.flatMap(depth => {
      const L = ctx.layout(depth), side = [...L.guardians].filter(([, g]) => g.role === 'side')
        .sort(([a], [b]) => L.route.indexOf(a) - L.route.indexOf(b)).map(([k]) => k);
      return [...L.guardians].filter(([k]) => !ctx.gates.has(k)).map(([key, g]) => ({ id: `guardian:${key}`, depth, key,
        role: g.role, boss: bossAt(depth, g.role), nth: side.indexOf(key), sides: side.length }));
    }),
    quest(t, ctx, R) {
      const where = depthName(t.depth), boss = t.boss && cap(t.boss);
      if (t.role === 'descent') return {
        title: boss ? `Beat ${boss}` : `The guardian of the well`,
        text: boss ? `${boss} guards the way down from ${where}, and nobody gets past. Beat ${boss}, and come back to tell me the way is open.`
          : pick(R, [`The way down from ${where} is guarded by something big. Beat the guardian of the well and come back to tell me.`,
            `A guardian sits by the well at the end of ${where}. Nobody gets down while it is there. Beat it, then come back.`]),
        target: { role: t.role },
        stages: [{ goal: 'guardian', depth: t.depth, key: t.key, text: `Defeat ${boss ?? 'the descent guardian'} on ${where}` }],
      };
      const which = t.sides > 1 ? `the ${ORDINAL[t.nth] ?? 'next'} guardian` : 'the guardian';
      return {
        title: `A gate on ${where}`,
        text: pick(R, [
          `On ${where} a guardian blocks the way through. ${t.sides > 1 ? `There are ${t.sides} of them; I mean ${which} you come to.` : ''} Beat it so the way is open for everyone, then come back.`,
          `${cap(which)} on ${where} has scared off everyone who went that way. Beat it, and come back to tell me.`,
        ]).replace(/\s+/g, ' '),
        target: { role: t.role, nth: t.nth },
        stages: [{ goal: 'guardian', depth: t.depth, key: t.key, text: `Defeat ${which} on ${where}` }],
      };
    },
  },
  // break a depth's horde (world/hordes.js): every one of it defeated
  horde: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.flatMap(depth => [...ctx.layout(depth).hordes]
      .map(([key, h]) => ({ id: `horde:${key}`, depth, key, enemy: h.kind }))),
    quest(t, ctx, R) {
      const them = plural(ENEMY_KINDS[t.enemy]?.label ?? 'enemy').toLowerCase(), where = depthName(t.depth);
      return {
        title: `A horde of ${them}`,
        text: pick(R, [
          `A whole horde of ${them} has gathered on ${where}. Left alone they only get bolder. Break it up, and come back to tell me.`,
          `People coming back from ${where} talk of a horde of ${them}. Scatter them, every last one, then come back.`,
        ]),
        target: { enemy: t.enemy },
        stages: [{ goal: 'horde', depth: t.depth, key: t.key, text: `Break the horde of ${them} on ${where}` }],
      };
    },
  },
};
export const QUEST_KINDS = Object.keys(KINDS);

const range = (a, b) => Array.from({ length: Math.max(0, Math.min(b, MAX_DEPTH) - a + 1) }, (_, i) => a + i);
// the depths quests are about: one above how far anyone got, down to two below it
const window = log => range(Math.max(0, log.deepest - 1), log.deepest + 2);
// how likely each depth is, by how far below the deepest it is
const DEPTH_WEIGHT = { '-1': 1, 0: 3, 1: 3, 2: 1 };

// --- what a goal needs ----------------------------------------------------------------------------

// is the stage's goal done in the world as it is? (a landmark only by being there: `done`)
export function goalDone(stage, log, gates) {
  if (stage.done) return true;
  switch (stage.goal) {
    case 'reach': return log.deepest >= stage.depth;
    case 'guardian': return gates.has(stage.key);
    case 'horde': return log.broken.includes(stage.key);
    default: return false;
  }
}

// --- rewards --------------------------------------------------------------------------------------

// XP: a share of the level's cost at the quest's depth, more for harder quests; coins like a
// chest (basic, uncommon, rare); items: potions, a weapon half the time, a weapon from Uncommon up
export const REWARD = { xpShare: 0.07, factor: { easy: 0.6, medium: 1, hard: 1.6 }, chest: { easy: 'basic', medium: 'uncommon', hard: 'rare' } };
export function questRewards(R, depth, difficulty) {
  const level = depthLevel(depth), xp = Math.round(REWARD.xpShare * xpToNext(level) * REWARD.factor[difficulty]);
  const [lo, hi] = CHESTS[REWARD.chest[difficulty]].copper.map(c => Math.round(grown(c, GROWTH.coins, level)));
  const copper = lo + Math.floor(R() * (hi - lo + 1));
  const items = [];
  if (difficulty === 'hard') items.push(rollWeapon(R, level + 1, { floor: RARITY.uncommon.rank, luck: 0.3 }), ...rollPotions(R, level, 1));
  else if (difficulty === 'medium' && R() < 0.5) items.push(rollWeapon(R, level, { floor: RARITY.uncommon.rank, luck: 0.2 }));
  else items.push(...rollPotions(R, level, difficulty === 'medium' ? 2 : 1));
  return { xp, copper, items };
}

// --- making offers --------------------------------------------------------------------------------

const weighted = (R, list, weight) => {
  const total = list.reduce((n, x) => n + weight(x), 0);
  let r = R() * total;
  for (const x of list) if ((r -= weight(x)) < 0) return x;
  return list.at(-1);
};
// the targets the quests have already (whatever became of them): never two quests about one thing
const takenTargets = log => new Set(log.list.map(q => q.target?.id).filter(Boolean));

// The next quest of `giver` (null: there is nothing for it to ask now). Its number is
// log.next[giver]; the log is not changed (offer does that).
export function makeQuest(log, ctx, giver) {
  const g = giverProfile(giver, ctx);
  if (!g) throw new TypeError(`Not a quest giver: ${giver}`);
  const depths = g.depths(log);
  const n = log.next[giver] ?? 0;
  const R = mulberry32(hash32(ctx.seed ^ hashString(giver) ^ Math.imul(n + 1, 0x9e3779b1)));
  const taken = takenTargets(log), kinds = Object.entries(g.kinds);
  while (kinds.length) {
    const [kind] = weighted(R, kinds, ([, w]) => w);
    kinds.splice(kinds.findIndex(([k]) => k === kind), 1);
    const options = KINDS[kind].targets(ctx, log, depths).filter(t => !taken.has(t.id)
      && !goalDone({ goal: kind, depth: t.depth, key: t.key }, log, ctx.gates));
    if (!options.length) continue;
    const t = weighted(R, options, o => DEPTH_WEIGHT[o.depth - log.deepest] ?? 0.5);
    const step = Math.max(0, Math.min(2, t.depth - log.deepest + (t.role === 'descent' ? 1 : 0)));
    const difficulty = DIFFICULTIES[step], made = KINDS[kind].quest(t, ctx, R);
    return { id: `${giver}:${n}`, giver, n, from: { name: g.name, title: g.title, where: g.where },
      kind, depth: t.depth, difficulty, target: { id: t.id, ...made.target },
      title: made.title, text: made.text, stages: made.stages.map(s => ({ ...s, done: false })), stage: 0,
      payout: KINDS[kind].payout, rewards: questRewards(R, t.depth, difficulty), state: 'offered', archived: false,
      created: ctx.now ?? 0, finished: 0 };
  }
  return null;
}

// an offer that can no longer be done (its goal is done already): it goes
const stale = (q, log, gates) => q.state === 'offered' && q.stages.some(s => goalDone(s, log, gates));

// Every giver's offers brought up to date: those that went stale go, and each giver with fewer
// than MAX_OFFERS makes new ones. true: something changed.
export function refreshOffers(log, ctx, givers = [...Object.keys(GIVERS), ...log.met]) {
  const before = log.list.length;
  log.list = log.list.filter(q => !stale(q, log, ctx.gates));
  let changed = log.list.length !== before;
  for (const giver of givers) {
    while (log.list.filter(q => q.giver === giver && q.state === 'offered').length < MAX_OFFERS) {
      const q = makeQuest(log, ctx, giver);
      if (!q) break;
      log.list.push(q);
      log.next[giver] = q.n + 1;
      changed = true;
    }
  }
  if (changed) log.version++;
  return changed;
}

// --- what players do ------------------------------------------------------------------------------

const find = (log, id) => log.list.find(q => q.id === id) ?? null;
const touch = log => { log.version++; return true; };

// take an offered quest
export function accept(log, id, gates = new Set()) {
  const q = find(log, id);
  if (q?.state !== 'offered') return false;
  q.state = 'active';
  settle(log, gates);
  return touch(log);
}
// put a quest away (on: true) or bring it back; offers cannot be
export function archive(log, id, on, gates = new Set()) {
  const q = find(log, id);
  if (!q || q.state === 'offered' || q.archived === !!on) return false;
  q.archived = !!on;
  if (!on) settle(log, gates);
  return touch(log);
}
// a quest that failed starts again from the beginning
export function restart(log, id, gates = new Set()) {
  const q = find(log, id);
  if (q?.state !== 'failed') return false;
  q.state = 'active'; q.stage = 0;
  for (const s of q.stages) s.done = false;
  settle(log, gates);
  return touch(log);
}
export function fail(log, id) {
  const q = find(log, id);
  if (q?.state !== 'active') return false;
  q.state = 'failed';
  return touch(log);
}
// hand a quest in to its giver: the quest (now done; its rewards go to everyone), or null
export function handIn(log, id, now = 0) {
  const q = find(log, id);
  if (q?.state !== 'ready') return null;
  q.state = 'done'; q.finished = now;
  touch(log);
  return q;
}

// --- what happens in the world --------------------------------------------------------------------

// Every quest that is going on (active, not archived) moves on past the goals that are done.
// The quests that were finished on the spot (payout 'spot'), to be paid.
export function settle(log, gates = new Set(), now = 0) {
  const paid = [];
  for (const q of log.list) {
    if (q.state !== 'active' || q.archived) continue;
    let moved = false;
    while (q.stage < q.stages.length && goalDone(q.stages[q.stage], log, gates)) { q.stages[q.stage].done = true; q.stage++; moved = true; }
    if (q.stage < q.stages.length) { if (moved) log.version++; continue; }
    q.state = q.payout === 'spot' ? 'done' : 'ready';
    if (q.state === 'done') { q.finished = now; paid.push(q); }
    log.version++;
  }
  return paid;
}

// Something happened (game/quests.js):
//   { kind: 'visit', depth }      someone came to a cube at that depth
//   { kind: 'horde', key }        the horde in that cube is broken
//   { kind: 'landmark', key }     someone stands beside the landmark in that cube
//   { kind: 'gate', key }         a guardian's gate opened (run.unlockedGates has it already)
// The log takes note, and the quests move on (settle). The quests paid on the spot.
export function questEvent(log, ev, gates = new Set(), now = 0) {
  if (ev.kind === 'visit' && Number.isInteger(ev.depth) && ev.depth > log.deepest) { log.deepest = Math.min(MAX_DEPTH, ev.depth); log.version++; }
  if (ev.kind === 'horde' && typeof ev.key === 'string' && !log.broken.includes(ev.key)) { log.broken.push(ev.key); log.version++; }
  if (ev.kind === 'landmark' && typeof ev.key === 'string') for (const q of log.list) {
    const s = q.stages[q.stage];
    if (q.state === 'active' && !q.archived && s?.goal === 'landmark' && s.key === ev.key && !s.done) { s.done = true; log.version++; }
  }
  return settle(log, gates, now);
}
// does a quest that is going on want someone at the landmark in cube `key`?
export const wantsLandmark = (log, key) => log.list.some(q => q.state === 'active' && !q.archived
  && q.stages[q.stage]?.goal === 'landmark' && q.stages[q.stage].key === key);

// A death puts the cube back as it was when you came in (game/flow.js): quest progress made since
// goes back with it. progressOf before, restoreProgress after.
export const progressOf = log => ({ broken: [...log.broken],
  quests: new Map(log.list.map(q => [q.id, { state: q.state, stage: q.stage, done: q.stages.map(s => s.done) }])) });
export function restoreProgress(log, before) {
  let changed = log.broken.length !== before.broken.length;
  log.broken = [...before.broken];
  for (const q of log.list) {
    const was = before.quests.get(q.id);
    if (!was || q.state === 'done' || was.state === q.state && was.stage === q.stage) continue;
    if (!['active', 'ready'].includes(q.state) || !['active', 'ready'].includes(was.state)) continue;
    q.state = was.state; q.stage = was.stage;
    q.stages.forEach((s, i) => { s.done = !!was.done[i]; });
    changed = true;
  }
  if (changed) log.version++;
  return changed;
}

// --- what is shown --------------------------------------------------------------------------------

// what a giver has for the players: quests to hand in, offers, and those going on
export const giverQuests = (log, giver) => log.list.filter(q => q.giver === giver && ['offered', 'ready', 'active', 'failed'].includes(q.state));
// the mark over a giver's head: '?' a quest to hand in, '!' an offer, '' nothing new
export function giverMark(log, giver) {
  const mine = log.list.filter(q => q.giver === giver);
  return mine.some(q => q.state === 'ready' && !q.archived) ? '?' : mine.some(q => q.state === 'offered') ? '!' : '';
}
// the panel's lists: going on (active, ready, failed), done, archived; newest first
export function questLists(log) {
  const shown = log.list.filter(q => q.state !== 'offered').reverse();
  return { active: shown.filter(q => !q.archived && q.state !== 'done'), done: shown.filter(q => !q.archived && q.state === 'done'),
    archived: shown.filter(q => q.archived) };
}
// a quest's state in words
export function stateText(q) {
  if (q.archived) return 'Archived';
  return { offered: 'Offered', active: q.stages[q.stage]?.text ?? 'Going on', ready: `Done: back to ${giverName(q)}`,
    done: 'Complete', failed: 'Failed' }[q.state];
}

// --- checks (saves, the others' word) -------------------------------------------------------------

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (s, max = 400) => typeof s === 'string' ? s.slice(0, max) : '';
const nat = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
function checkItem(i) {
  if (!isObj(i) || !Object.hasOwn(ITEMS, i.itemId) || ITEMS[i.itemId].category === 'currency') return null;
  const count = Number.isInteger(i.count) && i.count > 0 && i.count <= ITEMS[i.itemId].stackLimit ? i.count : null;
  if (!count) return null;
  if (i.gen !== undefined) return ITEMS[i.itemId].weapon && validGen(i.gen) ? { itemId: i.itemId, count: 1, gen: structuredClone(i.gen) } : null;
  return { itemId: i.itemId, count };
}
function checkStage(s) {
  if (!isObj(s) || !QUEST_KINDS.includes(s.goal) || !Number.isInteger(s.depth) || s.depth < 0 || s.depth > MAX_DEPTH) return null;
  if (s.key !== undefined && typeof s.key !== 'string') return null;
  return { goal: s.goal, depth: s.depth, ...(s.key !== undefined ? { key: s.key } : {}), text: text(s.text, 120), done: !!s.done };
}
// a quest's rewards as saved or told by the host
export function checkRewards(r) {
  r = isObj(r) ? r : {};
  return { xp: nat(r.xp), copper: nat(r.copper), items: (Array.isArray(r.items) ? r.items : []).map(checkItem).filter(Boolean) };
}
export function checkQuest(q) {
  if (!isObj(q) || typeof q.id !== 'string' || q.id.length > 80 || !isGiver(q.giver) || !QUEST_KINDS.includes(q.kind)) return null;
  if (!STATES.includes(q.state) || !DIFFICULTIES.includes(q.difficulty) || !['return', 'spot'].includes(q.payout)) return null;
  const stages = Array.isArray(q.stages) ? q.stages.map(checkStage) : [];
  if (!stages.length || stages.includes(null) || !Number.isInteger(q.depth)) return null;
  const target = isObj(q.target) && typeof q.target.id === 'string' ? structuredClone(q.target) : { id: q.id };
  const f = isObj(q.from) ? q.from : {}, town = GIVERS[q.giver];
  const from = { name: text(f.name, 60) || (town ? `the ${town.title}` : 'somebody'), title: text(f.title, 60) || town?.title || 'Somebody',
    where: text(f.where, 80) || town?.where || '' };
  return { id: q.id, giver: q.giver, n: nat(q.n), from, kind: q.kind, depth: q.depth, difficulty: q.difficulty, target,
    title: text(q.title, 80), text: text(q.text), stages, stage: Math.min(nat(q.stage), stages.length), payout: q.payout,
    rewards: checkRewards(q.rewards),
    state: q.state, archived: !!q.archived, created: nat(q.created), finished: nat(q.finished) };
}
// a quest log as saved or as told by the host; a damaged quest is left out
export function checkQuestLog(x) {
  const log = createQuestLog();
  if (!isObj(x)) return log;
  const seen = new Set();
  for (const q of Array.isArray(x.list) ? x.list : []) {
    const c = checkQuest(q);
    if (c && !seen.has(c.id)) { seen.add(c.id); log.list.push(c); }
  }
  if (isObj(x.next)) for (const [g, n] of Object.entries(x.next)) if (isGiver(g)) log.next[g] = nat(n);
  log.met = Array.isArray(x.met) ? [...new Set(x.met.filter(g => isNpcGiver(g) && g.length <= 60))] : [];
  log.deepest = Math.min(MAX_DEPTH, nat(x.deepest));
  log.broken = Array.isArray(x.broken) ? [...new Set(x.broken.filter(k => typeof k === 'string'))] : [];
  log.version = nat(x.version);
  return log;
}
// what is saved and sent of a log (plain JSON)
export const packQuestLog = log => structuredClone({ list: log.list, next: log.next, deepest: log.deepest, broken: log.broken, met: log.met, version: log.version });
