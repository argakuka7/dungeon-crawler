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
//   stages: [{ goal, depth, key?, spot?, item?, person?, chest?, text, done }], one after another;
//     `stage` is the current one
//   payout: 'return' (back to the giver, who pays), 'spot' (paid where the last goal is done, by
//     whoever is there) or 'self' (the quest is its own payout: a treasure's chest; only XP)
//   state:  'offered' | 'active' | 'ready' (to hand in) | 'done' | 'failed'
//   archived: put away by the players (a soft abandon): hidden, and it counts no progress
//
// What a giver offers comes from the world's quest plan (core/questplan.js: which kind, at which
// depth, from whom), filled in from the seed and the plan's slot, checked against the world as
// it is (`ctx`, below): every target is one the layout has and nobody has done yet. The quest is
// kept whole once made, so a changed generator leaves the quests taken alone.
//
// ctx: { seed, layout: depth -> the depth's layout (world/layout.js makeLayouts), gates: the
// guardian gates open (run.unlockedGates), chests: the chests open (run.chests), now }
// The facts goals are checked against: { gates, chests } (a Set alone: the gates).
import { mulberry32, hash32 } from './util.js';
import { hashString } from './gear/drops.js';
import { rollWeapon } from './gear/generate.js';
import { RARITY } from './gear/rarities.js';
import { validGen } from './loot.js';
import { rollPotions } from './potions.js';
import { ITEMS, QUEST_THINGS } from './items.js';
import { CHESTS } from './chests.js';
import { depthLevel, grown, GROWTH, ENEMY_KINDS } from './enemies.js';
import { xpToNext } from './progression.js';
import { bossAt } from './bosses.js';
import { PROP_METADATA } from './propmetadata.js';
import { ROLES, residentOf, isNpcGiver, spotOfGiver, keyOfSpot } from './npcs.js';
import { questPlan, clueOf, lostPerson, campOf, SCOUTS } from './questplan.js';
import { pickBounty, bountyKind } from './bounties.js';

const MAX_DEPTH = 20;   // themes/depth.js MAX_DEPTH
export const STATES = ['offered', 'active', 'ready', 'done', 'failed'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
// quests a giver has out at a time: offered or not done yet (going on, to hand in, failed; also
// archived), so nobody hands out a second quest before the first is done
export const MAX_OFFERS = 1;
// offers standing in town at a time (the villagers'); new ones come only when the party comes back
// to town from below (log.townOpen): a few at a time, not all six villagers at once
export const TOWN_OFFERS = 2;
// how many things a gathering quest has you find, spread over one depth's hiding places
export const GATHER = 3;
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
  if (GIVERS[giver]) return { ...GIVERS[giver], name: `the ${GIVERS[giver].title}`, owner: `the ${GIVERS[giver].title}`, role: giver, depths: log => window(log) };
  const id = spotOfGiver(giver), key = id && keyOfSpot(id);
  if (!key) return null;
  const depth = -Number(key.split(',')[1]), plan = ctx.layout(depth)?.spots?.get(key)?.find(s => s.id === id), npc = residentOf(plan);
  if (!npc) return null;
  return { title: npc.title, name: npc.title, owner: npc.name, role: npc.role,
    where: plan.kind === 'camp' ? `at the camp on ${depthName(depth)}` : `on ${depthName(depth)}`,
    kinds: ROLES[npc.role].kinds, depths: () => range(depth, depth + 1) };
}
// how a quest names its giver: in a sentence, on its own
export const giverName = q => q.from?.name ?? `the ${GIVERS[q.giver]?.title ?? 'giver'}`;
export const giverTitle = q => q.from?.title ?? GIVERS[q.giver]?.title ?? 'Giver';

//   used:   the plan's slots offered (or passed over: core/questplan.js)
//   living: the people found and come to live at a camp: [{ id, name, tint, outfit, camp }]
//   repeats: the repeatable quests done, waiting to come back (REPEAT): [{ id, giver, kind, depth,
//           away, ready }]; repeated: how many came back (their slots' numbers)
//   townOpen: the villagers may bring out new offers (TOWN_OFFERS): at first, and each time the
//           party comes back to town from below (away: it has been below since)
export const createQuestLog = () => ({ list: [], next: {}, deepest: 0, broken: [], met: [], used: [], living: [], repeats: [], repeated: 0,
  townOpen: true, away: false, version: 0 });
// Repeatable quests (docs/quests.md "Repeatable quests"): what happens in a world again may be
// asked again. One of these done comes back to its giver once the party has been away from the
// giver's depth (the town: depth 0) and come back; filled in anew (a new target), paying half the
// XP and coins and potions instead of a weapon. They are not part of the plan's hundred.
export const REPEAT = { kinds: ['bounty', 'defense'], share: 0.5 };
const repeatable = q => REPEAT.kinds.includes(q.kind) && !q.stages.some(s => s.opens);   // (an annex's defense is done once)
const giverDepth = g => { const key = keyOfSpot(spotOfGiver(g) ?? ''); return key ? -Number(key.split(',')[1]) : 0; };
const factsOf = f => f instanceof Set ? { gates: f, chests: new Set(), defeated: new Set() }
  : { gates: f?.gates ?? new Set(), chests: f?.chests ?? new Set(), defeated: f?.defeated ?? new Set() };
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
const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five'];

// --- the things the quests are about (core/items.js QUEST_THINGS) ---------------------------------

// what a giver is more likely to have lost, or to want gathered or carried: by villager, or by the
// role of somebody out in the world (core/npcs.js ROLES); any other thing may come up too
const LEANS = {
  innkeeper: ['cider_barrel', 'flour_sack', 'fireworks', 'honey_pot', 'pearl_clam', 'pink_salt', 'ring', 'locket'],
  groom: ['wagon_wheel', 'backpack', 'lantern', 'compass', 'supply_crate'],
  smith: ['shield', 'silver_bars', 'gears', 'crucible', 'pickaxe', 'obsidian', 'fire_crystal'],
  keeper: ['crab', 'bird_nest', 'toy_rabbit', 'spider_eggs'],
  alchemist: ['toadstool', 'cave_mushrooms', 'spore_pod', 'pitcher_plant', 'ice_shard', 'honey_pot'],
  enchanter: ['singing_crystal', 'rainbow_crystal', 'thunder_jar', 'ice_heart', 'void_crystal', 'rune_stone'],
  hermit: ['candles', 'incense_bowl', 'bone_lantern', 'prayer_stone', 'journal'],
  explorer: ['backpack', 'compass', 'lantern', 'journal'],
  miner: ['pickaxe', 'lantern', 'singing_crystal', 'silver_bars'],
  pilgrim: ['butter_lamps', 'prayer_stone', 'paper_lantern', 'incense_bowl', 'candles'],
  trapper: ['crab', 'bird_nest', 'horned_skull', 'spider_eggs'],
  scholar: ['stone_tablet', 'statue_head', 'jade_idol', 'old_urn', 'painted_pots', 'journal'],
  carter: ['supply_crate', 'flour_sack', 'cider_barrel', 'wagon_wheel'],
};
const LEAN = 4;   // how much likelier a thing the giver leans to is
// the things of the quests not done yet (offered too): a thing is about one quest at a time
const thingsOut = log => new Set(log.list.filter(q => q.state !== 'done').flatMap(q => q.stages.map(s => s.item)).filter(Boolean));
// a thing for a quest of somebody of `role` (a villager's name, or a role out in the world)
function pickThing(R, log, role) {
  const out = thingsOut(log), lean = new Set((LEANS[role] ?? []).map(id => `quest_${id}`)), free = QUEST_THINGS.filter(id => !out.has(id));
  return weighted(R, free.length ? free : QUEST_THINGS, id => lean.has(id) ? LEAN : 1);
}
// how a thing is spoken of: { name (lower case), it ('it', 'them'), many (several of it), this
// ('this', 'these') }
const PLURAL = new Set(['flour_sack', 'fireworks', 'silver_bars', 'gears', 'toadstool', 'butter_lamps', 'prayer_stone', 'paper_lantern',
  'cave_mushrooms', 'candles', 'spider_eggs', 'painted_pots'].map(id => `quest_${id}`));
const MANY = { quest_pink_salt: 'lumps of pink salt', quest_sea_glass: 'handfuls of sea glass', quest_ice_shard: 'bundles of never-melting ice',
  quest_obsidian: 'pieces of obsidian', quest_bird_nest: 'birds\' nests', quest_statue_head: 'stone heads', quest_thunder_jar: 'jars of thunder',
  quest_ice_heart: 'hearts of ice', quest_compass: 'compasses', quest_fireworks: 'boxes of fireworks', quest_silver_bars: 'stacks of silver bars',
  quest_gears: 'piles of clockwork gears', quest_butter_lamps: 'trays of butter lamps' };
export function thingWords(id) {
  const name = ITEMS[id].name.toLowerCase(), plural = PLURAL.has(id);
  return { name, it: plural ? 'them' : 'it', many: MANY[id] ?? (plural ? name : `${name}s`), this: plural ? 'these' : 'this' };
}
// whose a lost thing is: the giver's own (mine), or somebody's they know (a name, how they are
// related, his or her)
const SHE = new Set(['daughter', 'sister', 'granddaughter']);
function ownerOf(R, g, seed) {
  if (R() < 0.5) return { name: g.owner, mine: true };
  const p = lostPerson(seed);
  return { name: p.name, relation: p.relation, his: SHE.has(p.relation) ? 'her' : 'his' };
}
const possessive = name => `${name}'s`;

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
  // find a thing somebody lost on a hiding place (world/spots.js) and bring it back
  find: {
    payout: 'return',
    targets: (ctx, log, depths) => hidingPlaces(ctx, log, depths),
    quest(t, ctx, R, { id, log, g }) {
      const item = pickThing(R, log, g.role), w = thingWords(item), where = depthName(t.depth);
      const clue = clueOf(ctx.layout, t.plan, landmarkName), o = ownerOf(R, g, hash32(ctx.seed ^ hashString(id) ^ 0x7a11));
      const label = `${possessive(o.name)} ${w.name}`, it = w.it;
      return {
        title: o.mine ? `The lost ${w.name}` : cap(label),
        text: o.mine ? pick(R, [
          `I lost my ${w.name} down on ${where}, ${clue}. Could you look for ${it} and bring ${it} back to me?`,
          `My ${w.name}! I dropped ${it} when I ran from the monsters on ${where}, ${clue}. Please bring ${it} back.`,
          `I only put my ${w.name} down for a moment on ${where}, ${clue}, and then something came at me and I ran. Would you fetch ${it} for me?`,
          `A big bird snatched my ${w.name} and let ${it} fall on ${where}, ${clue}. Can you get ${it} back for me?`,
        ]) : pick(R, [
          `My ${o.relation} ${o.name} left ${o.his} ${w.name} on ${where}, ${clue}. ${o.name} is too scared to go back. Would you fetch ${it}?`,
          `${o.name}, my ${o.relation}, was carrying ${o.his} ${w.name} down to ${where} and dropped ${it} ${clue}. Please bring ${it} back to me.`,
          `Somebody saw ${label} lying on ${where}, ${clue}. ${o.name} is my ${o.relation}. Would you bring ${it} back for us?`,
        ]),
        target: { spot: t.spot, item },
        stages: [{ goal: 'find', depth: t.depth, key: t.key, spot: t.spot, item, label, text: `Find ${label} on ${where}` }],
      };
    },
  },
  // find somebody lost on a hiding place; they go to live at the camp of whoever asked
  rescue: {
    payout: 'spot',
    targets: (ctx, log, depths, giver) => campOf(ctx.layout, giver) ? hidingPlaces(ctx, log, depths) : [],
    quest(t, ctx, R, { id }) {
      const person = lostPerson(hash32(ctx.seed ^ hashString(id))), where = depthName(t.depth);
      const clue = clueOf(ctx.layout, t.plan, landmarkName), them = { daughter: 'her', sister: 'her', granddaughter: 'her' }[person.relation] ?? 'him';
      return {
        title: `Where is ${person.name}?`,
        text: pick(R, [
          `My ${person.relation} ${person.name} went down to ${where} and has not come back. Somebody saw ${them} ${clue}. Please find ${them}! I will wait here.`,
          `${person.name}, my ${person.relation}, wanted to see ${where} and never came back. The last I heard, ${clue}. Bring ${them} home to me, please.`,
        ]),
        target: { spot: t.spot, person: person.name },
        stages: [{ goal: 'rescue', depth: t.depth, key: t.key, spot: t.spot, person, text: `Find ${person.name} on ${where}` }],
      };
    },
  },
  // a treasure map: the chest on a hiding place is the reward (opened like a reward site's)
  treasure: {
    payout: 'self',
    targets: (ctx, log, depths) => hidingPlaces(ctx, log, depths),
    quest(t, ctx, R, { id, difficulty }) {
      const where = depthName(t.depth), clue = clueOf(ctx.layout, t.plan, landmarkName);
      return {
        title: `A map with a cross`,
        text: pick(R, [
          `I found this scrap of an old map. The cross is on ${where}, ${clue}. I am too old to go digging; whatever is there is yours.`,
          `Look at this map scrap! Treasure, on ${where}, ${clue}. Find it, and keep what is in it.`,
        ]),
        target: { spot: t.spot },
        stages: [{ goal: 'open', depth: t.depth, key: t.key, spot: t.spot, chest: `q:${id}`, prestige: REWARD.chest[difficulty],
          text: `Find the treasure on ${where}` }],
      };
    },
  },
};
// beat a named, stronger enemy that waits on a hiding place (core/bounties.js)
KINDS.bounty = {
  payout: 'return',
  targets: (ctx, log, depths) => hidingPlaces(ctx, log, depths).filter(t => t.depth > 0 || t.tier > 0),
  quest(t, ctx, R, { id }) {
    const b = pickBounty(t.depth, hash32(ctx.seed ^ hashString(id))), kind = bountyKind(b.enemy, b.name), where = depthName(t.depth);
    const clue = clueOf(ctx.layout, t.plan, landmarkName), title = kind.label.replace(/^./, c => c.toUpperCase());
    return {
      title: `Wanted: ${b.name}`,
      text: pick(R, [
        `${title} has been seen on ${where}, ${clue}. It is bigger and meaner than the others of its kind. Beat it, and come back for the reward.`,
        `There is a reward on ${b.name}! A ${ENEMY_KINDS[b.enemy].label.toLowerCase()} the size of a cart, on ${where}, ${clue}. Bring me word it is gone.`,
      ]),
      target: { spot: t.spot, enemy: b.enemy },
      stages: [{ goal: 'bounty', depth: t.depth, key: t.key, spot: t.spot, enemy: b.enemy, name: b.name, enemyId: `q:${id}`,
        text: `Defeat ${b.name} on ${where}` }],
    };
  },
};
// take something to somebody further down (a letter, a parcel, or any of the quest things):
// somebody living at a seat or a camp there, else somebody waiting on a hiding place; they end it
// and pay
KINDS.delivery = {
  payout: 'spot',
  targets: (ctx, log, depths, giver) => recipients(ctx, log, depths, giver),
  quest(t, ctx, R, { log, g }) {
    const item = R() < 0.35 ? pick(R, ['quest_letter', 'quest_parcel']) : pickThing(R, log, g.role), w = thingWords(item), where = depthName(t.depth);
    const at = t.to.resident ? t.to.where : `on ${where}, ${clueOf(ctx.layout, t.plan, landmarkName)}`;
    return {
      title: `${cap(w.name)} for ${t.to.name}`,
      text: pick(R, [
        `Could you take ${w.this} ${w.name} to ${t.to.title}, ${at}? ${t.to.name} has been waiting for ${w.it} for a long time.`,
        `${cap(w.this)} ${w.name} must get to ${t.to.title}, ${at}. Nobody else dares to go that far down. ${t.to.name} will thank you for it.`,
        `${t.to.title} (${at}) asked me for ${w.this} ${w.name}, and I promised to send ${w.it}. Would you carry ${w.it} down there for me?`,
        `I owe ${t.to.name} a favour. ${cap(w.this)} ${w.name} should make us even. You will find ${t.to.title} ${at}.`,
      ]),
      target: { recipient: t.id },
      stages: [{ goal: 'deliver', depth: t.depth, key: t.key, to: t.to, item, reply: pick(R, [
        `${t.to.name}: At last! Thank you so much. Here, this is for your trouble.`,
        `${t.to.name}: For me? I hoped ${w.it} would come. Take this, you have earned it.`,
        `${t.to.name}: Oh, wonderful! I was beginning to think nobody would come. Here, take this.`]),
        text: `Bring the ${w.name} to ${t.to.title} on ${where}` }],
    };
  },
};
// ask somebody further down where a lost thing is, then find it there and bring it back
KINDS.relay = {
  payout: 'return',
  targets: (ctx, log, depths, giver) => recipients(ctx, log, depths, giver).flatMap(r => {
    const near = hidingPlaces(ctx, log, [r.depth]).filter(h => h.spot !== r.to.spot);
    return near.length ? [{ ...r, id: `${r.id}|${near[0].id}`, find: near[0] }] : [];
  }),
  quest(t, ctx, R, { log, g }) {
    const item = pickThing(R, log, g.role), w = thingWords(item), it = w.it, where = depthName(t.depth);
    const at = t.to.resident ? t.to.where : `on ${where}, ${clueOf(ctx.layout, t.plan, landmarkName)}`;
    const clue = clueOf(ctx.layout, t.find.plan, landmarkName), label = `${possessive(g.owner)} ${w.name}`;
    return {
      title: `Ask ${t.to.name}`,
      text: pick(R, [
        `My ${w.name} ${it === 'them' ? 'are' : 'is'} gone, and ${t.to.title} (${at}) saw where ${it === 'them' ? 'they' : 'it'} went. Ask ${t.to.name}, find ${it}, and bring ${it} back to me.`,
        `${t.to.title} found my ${w.name} once before! Go and ask, ${at}. Then bring ${it} back to me, please.`,
        `Somebody took my ${w.name} down below. ${t.to.title} hears all the gossip down there, ${at}. Ask, then bring ${it} back to me.`,
      ]),
      target: { recipient: t.id, spot: t.find.spot, item },
      stages: [
        { goal: 'talk', depth: t.depth, key: t.key, to: t.to, reply: `${t.to.name}: Your ${w.name}? I saw ${it} on ${where}, ${clue}.`,
          text: `Ask ${t.to.title} on ${where}` },
        { goal: 'find', depth: t.depth, key: t.find.key, spot: t.find.spot, item, label, clue, text: `Find the ${w.name} on ${where}, ${clue}` },
      ],
    };
  },
};
// gather several of one thing, spread over the hiding places of one depth (in as many different
// cubes as there are), and bring them all back
KINDS.gather = {
  payout: 'return',
  targets: (ctx, log, depths) => depths.flatMap(depth => {
    const free = hidingPlaces(ctx, log, [depth]);
    return free.length >= GATHER ? [{ id: `gather:${depth}`, depth, key: free[0].key, tier: 1, free }] : [];
  }),
  quest(t, ctx, R, { log, g }) {
    const pool = [...t.free], spots = [];
    while (spots.length < GATHER) {
      const apart = pool.filter(h => !spots.some(x => x.key === h.key)), from = apart.length ? apart : pool;
      const h = from[Math.floor(R() * from.length)];
      spots.push(h); pool.splice(pool.indexOf(h), 1);
    }
    const item = pickThing(R, log, g.role), w = thingWords(item), where = depthName(t.depth), n = NUMBER[GATHER];
    const clue = clueOf(ctx.layout, spots[0].plan, landmarkName);
    return {
      title: `${cap(w.many)} on ${where}`,
      text: pick(R, [
        `A cart tipped over on ${where}, and ${n} ${w.many} went rolling off all over the place. One was seen ${clue}. Could you gather them up and bring them back to me?`,
        `The monsters on ${where} ran off with my ${w.many}, ${n} of them, and dropped them here and there. Bring back every one! I think one is ${clue}.`,
        `I need ${n} ${w.many}, and there are some lying about on ${where}, one of them ${clue}. Would you collect them for me?`,
        `A great gust of wind blew ${n} of my ${w.many} all over ${where}. I saw one come down ${clue}. Please find them all!`,
      ]),
      target: { item },
      stages: [{ goal: 'gather', depth: t.depth, spots: spots.map(h => h.spot), keys: spots.map(h => h.key), got: spots.map(() => false),
        item, label: possessive(g.owner) + ' ' + w.name, clue, text: `Collect ${n} ${w.many} on ${where}` }],
    };
  },
};
// who a letter may go to, or who may be asked, at these depths: those living at the seats and
// camps (but whoever asks), else somebody waiting on a hiding place
function recipients(ctx, log, depths, giver) {
  return depths.flatMap(depth => {
    const living = ctx.layout(depth).spotList.filter(s => s.kind !== 'hide' && !s.annex).map(residentOf)   // (not behind a sealed portal).filter(n => n && n.giver !== giver)
      .map(n => ({ id: `to:${n.giver}`, depth, key: keyOfSpot(n.spot),
        to: { resident: n.giver, name: n.name, title: n.title, where: n.camp ? `at the camp on ${depthName(depth)}` : `on ${depthName(depth)}` } }));
    if (living.length) return living;
    return hidingPlaces(ctx, log, [depth]).map(h => {
      const p = lostPerson(hash32(ctx.seed ^ hashString(h.spot) ^ 0x4e1)), title = `${p.name} the messenger`;
      return { ...h, id: `to:${h.spot}`, to: { spot: h.spot, name: p.name, title, person: { ...p, relation: 'messenger' } } };
    });
  });
}
// defend an outpost's supply cart (world/spots.js) against raiders, for whoever keeps it
// (game/defense.js runs the raid); it may fail, and start again
KINDS.defense = {
  payout: 'spot',
  targets: (ctx, log, depths, giver) => depths.flatMap(depth => ctx.layout(depth).spotList
    .filter(s => s.kind === 'outpost' && (s.annex || residentOf(s)?.giver === giver))
    .map(plan => ({ id: `defend:${plan.id}`, depth, key: plan.key, spot: plan.id, tier: 1, plan }))),
  quest(t, ctx, R) {
    const keeper = residentOf(t.plan), where = depthName(t.depth);
    // an annex's: behind a portal sealed until the quest is taken (world/layout.js)
    if (t.plan.annex) return {
      title: `The sealed storehouse`,
      text: pick(R, [
        `Behind a sealed door on ${where} ${keeper.name} keeps a hidden storehouse, and the monsters have found it. Here is the way in: take it, and help ${keeper.name} hold the cart until they give up.`,
        `There is a door on ${where} that nobody can open. I can. Behind it, ${keeper.name}'s storehouse is under attack. Go in and keep them off the cart!`,
      ]),
      target: { spot: t.spot },
      stages: [{ goal: 'defend', depth: t.depth, key: t.key, spot: t.spot, waves: 3, opens: t.plan.annex,
        text: `Defend ${keeper.name}'s storehouse on ${where}` }],
    };
    return {
      title: `Raiders at the cart`,
      text: pick(R, [
        `Every night the monsters come for my supply cart. I cannot hold them off alone! When you are ready, stand by the cart and I will ring the bell. Keep them off it until they give up.`,
        `They have been at my cart again, and next time there will be more of them. Will you stand by it with me? Keep them away from it, wave after wave.`,
      ]),
      target: { spot: t.spot },
      stages: [{ goal: 'defend', depth: t.depth, key: t.key, spot: t.spot, waves: 3, text: `Defend ${keeper.name}'s cart on ${where}` }],
    };
  },
};
// the hiding places at these depths no quest going on is about
function hidingPlaces(ctx, log, depths) {
  // (a treasure's spot stays its: its chest stays there, open)
  const busy = new Set(log.list.filter(q => q.state !== 'done' || q.kind === 'treasure')
    .flatMap(q => q.stages.flatMap(s => [s.spot, s.to?.spot, ...(s.spots ?? [])])).filter(Boolean));
  return depths.flatMap(depth => ctx.layout(depth).spotList.filter(s => s.kind === 'hide' && !busy.has(s.id))
    .map(plan => ({ id: `spot:${plan.id}`, depth, key: plan.key, spot: plan.id, tier: plan.tier, plan })));
}
// what a goal is, by name (the kinds' stages)
export const GOALS = ['reach', 'landmark', 'guardian', 'horde', 'find', 'gather', 'rescue', 'open', 'bounty', 'deliver', 'talk', 'defend'];
export const QUEST_KINDS = Object.keys(KINDS);

const range = (a, b) => Array.from({ length: Math.max(0, Math.min(b, MAX_DEPTH) - a + 1) }, (_, i) => a + i);
// the depths quests are about: one above how far anyone got, down to two below it
const window = log => range(Math.max(0, log.deepest - 1), log.deepest + 2);

// --- what a goal needs ----------------------------------------------------------------------------

// is the stage's goal done in the world as it is? (a landmark only by being there: `done`)
export function goalDone(stage, log, facts) {
  if (stage.done) return true;
  const f = factsOf(facts);
  switch (stage.goal) {
    case 'reach': return log.deepest >= stage.depth;
    case 'guardian': return f.gates.has(stage.key);
    case 'horde': return log.broken.includes(stage.key);
    case 'open': return f.chests.has(stage.chest);
    case 'bounty': return f.defeated.has(stage.enemyId);
    case 'gather': return !!stage.got?.length && stage.got.every(Boolean);
    default: return false;   // landmark, find, rescue: only by being there (events)
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
// the targets the quests have already: never two quests about one thing (but a hiding place
// again once its quest is done)
const takenTargets = log => new Set(log.list.filter(q => q.state !== 'done' || !q.target?.spot).map(q => q.target?.id).filter(Boolean));
// the kinds to try for a slot of the plan: its own (a scout as the giver leans), then the others
const FALLBACK = { scout: ['find', 'gather'], find: ['gather', 'treasure', 'scout'], gather: ['find', 'treasure'], treasure: ['find', 'gather'],
  rescue: ['find', 'gather'], bounty: ['find', 'gather'], delivery: ['relay', 'find', 'gather'], relay: ['delivery', 'find', 'gather'], defense: ['find'] };
function kindsFor(slot, g, R) {
  const scouts = () => {
    const left = SCOUTS.map(k => [k, g.kinds[k] ?? 0.3]), out = [];
    while (left.length) { const k = weighted(R, left, ([, w]) => w); out.push(k[0]); left.splice(left.indexOf(k), 1); }
    return out;
  };
  return [slot.kind, ...(FALLBACK[slot.kind] ?? [])].flatMap(k => k === 'scout' ? scouts() : [k]);
}
// the kinds of the quests out (offered, going on, to hand in, failed; not put away): a slot tries
// the kinds nobody has out first, so the quests going on at once differ
const kindsOut = log => new Set(log.list.filter(q => q.state !== 'done' && !q.archived).map(q => q.kind));

// The quest of `giver` for slot `slot` of the plan (core/questplan.js), or null: nothing it
// could be about at the slot's depth now. The log is not changed (refreshOffers does that).
export function makeQuest(log, ctx, giver, slot) {
  const g = giverProfile(giver, ctx);
  if (!g) throw new TypeError(`Not a quest giver: ${giver}`);
  const id = `${giver}:${slot.id}`, f = factsOf(ctx);
  const R = mulberry32(hash32(ctx.seed ^ hashString(giver) ^ hashString(slot.id)));
  const taken = takenTargets(log), out = kindsOut(log), kinds = kindsFor(slot, g, R);
  // (slot.force: of its kind or none, the dev tools' and a repeat's)
  const order = slot.force ? [slot.kind] : [...kinds.filter(k => !out.has(k)), ...kinds.filter(k => out.has(k))];
  for (const kind of order) {
    const options = KINDS[kind].targets(ctx, log, [slot.depth], giver).filter(t => !taken.has(t.id)
      && !goalDone({ goal: kind, depth: t.depth, key: t.key }, log, f));
    if (!options.length) continue;
    const t = options[Math.floor(R() * options.length)];
    const step = Math.max(0, Math.min(2, t.depth - log.deepest + (t.role === 'descent' || kind === 'bounty' || kind === 'defense' ? 1 : 0)
      + ((t.tier ?? 0) >= 3 ? 1 : 0)));
    const difficulty = DIFFICULTIES[step], made = KINDS[kind].quest(t, ctx, R, { id, giver, difficulty, log, g });
    const rewards = questRewards(R, t.depth, difficulty);
    return { id, giver, n: Number(slot.id.split(':')[1]) || 0, slot: slot.id, from: { name: g.name, title: g.title, where: g.where },
      kind, depth: t.depth, difficulty, target: { id: t.id, ...made.target },
      title: made.title, text: made.text, stages: made.stages.map(s => ({ ...s, done: false })), stage: 0,
      payout: KINDS[kind].payout, rewards: KINDS[kind].payout === 'self' ? { xp: rewards.xp, copper: 0, items: [] } : rewards,
      state: 'offered', archived: false, created: ctx.now ?? 0, finished: 0 };
  }
  return null;
}

// a repeatable quest come back (REPEAT): of its kind, at its giver's depth (a villager's: at or a
// little above the deepest anyone got), filled in anew; half the pay, potions for a weapon
function makeRepeat(log, ctx, r) {
  const R = mulberry32(hash32(ctx.seed ^ hashString(r.id) ^ Math.imul(log.repeated + 1, 0x2545f491)));
  const depth = GIVERS[r.giver] ? Math.max(1, log.deepest - Math.floor(R() * 3)) : Math.min(MAX_DEPTH, r.depth + (r.kind === 'defense' ? 0 : Math.floor(R() * 2)));
  const q = makeQuest(log, ctx, r.giver, { id: `r:${++log.repeated}`, depth, kind: r.kind, force: true });
  if (!q || q.kind !== r.kind) return null;
  const level = depthLevel(q.depth);
  Object.assign(q, { repeat: true, title: `${q.title} (again)`, text: `Back again? ${q.text}`,
    rewards: { xp: Math.round(q.rewards.xp * REPEAT.share), copper: Math.round(q.rewards.copper * REPEAT.share),
      items: rollPotions(R, level, 1 + Math.floor(R() * 2)) } });
  return q;
}
// an offer that can no longer be done (its goal is done already): it goes
const stale = (q, log, facts) => q.state === 'offered' && q.stages.some(s => goalDone(s, log, facts));

// a giver's quests out: offered, or taken and not done yet
const outFrom = (log, giver) => log.list.filter(q => q.giver === giver && q.state !== 'done').length;

// The next offer of `giver`, or null: the next slot of its plan that something fits (as far down
// as two below the deepest anyone got; a slot nothing fits is passed over, log.used), else a
// repeatable quest of theirs come back. The log notes the slots and repeats used up.
function nextOffer(log, ctx, plan, giver) {
  for (const slot of plan.byGiver.get(giver) ?? []) {
    if (log.used.includes(slot.id)) continue;
    if (slot.depth > log.deepest + 2) break;
    log.used.push(slot.id);
    const q = makeQuest(log, ctx, giver, slot);
    if (q) return q;
  }
  const r = log.repeats.find(x => x.giver === giver && x.ready);
  if (!r) return null;
  log.repeats.splice(log.repeats.indexOf(r), 1);
  return makeRepeat(log, ctx, r);
}
// how many offers stand in town
const townOffers = log => log.list.filter(q => GIVERS[q.giver] && q.state === 'offered').length;

// Every giver's offers brought up to date: those that went stale go. Out in the world each giver
// with fewer than MAX_OFFERS quests out (outFrom) offers their next one (nextOffer). In town the
// villagers take turns: when the town is open (log.townOpen: at first, and on coming back from
// below), those who have given fewest so far (and have nothing out) bring out offers until
// TOWN_OFFERS stand. true: something changed.
export function refreshOffers(log, ctx, givers = [...Object.keys(GIVERS), ...log.met]) {
  const before = log.list.length, plan = questPlan(ctx.seed, ctx.layout), usedBefore = log.used.length, repeatsBefore = log.repeats.length;
  log.list = log.list.filter(q => !stale(q, log, ctx));
  let changed = log.list.length !== before;
  if (log.townOpen && givers.some(g => GIVERS[g])) {
    const given = g => log.list.filter(q => q.giver === g).length;
    const turns = Object.keys(GIVERS).filter(g => outFrom(log, g) < MAX_OFFERS).sort((a, b) => given(a) - given(b));
    for (const giver of turns) {
      if (townOffers(log) >= TOWN_OFFERS) break;
      const q = nextOffer(log, ctx, plan, giver);
      if (q) log.list.push(q);
    }
    log.townOpen = false;
    changed = true;
  }
  for (const giver of givers.filter(g => !GIVERS[g])) {
    if (outFrom(log, giver) >= MAX_OFFERS) continue;
    const q = nextOffer(log, ctx, plan, giver);
    if (q) log.list.push(q);
  }
  changed ||= log.list.length !== before || log.used.length !== usedBefore || log.repeats.length !== repeatsBefore;
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
  for (const s of q.stages) { s.done = false; if (s.got) s.got = s.got.map(() => false); }
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
  settled(log, q);
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
    q.state = q.payout === 'return' ? 'ready' : 'done';
    if (q.state === 'done') { q.finished = now; paid.push(q); settled(log, q); }
    log.version++;
  }
  return paid;
}
// what a quest done leaves behind: somebody found goes to live at the camp of whoever asked
function settled(log, q) {
  const s = q.stages.find(x => x.goal === 'rescue');
  const camp = s && spotOfGiver(q.giver);
  if (camp && !log.living.some(p => p.id === q.id)) log.living.push({ id: q.id, ...s.person, camp });
  // a repeatable one waits to come back (REPEAT)
  if (repeatable(q) && !log.repeats.some(r => r.id === q.id))
    log.repeats.push({ id: q.id, giver: q.giver, kind: q.kind, depth: giverDepth(q.giver), away: false, ready: false });
}

// Something happened (game/quests.js):
//   { kind: 'visit', depth }      someone came to a cube at that depth
//   { kind: 'horde', key }        the horde in that cube is broken
//   { kind: 'landmark', key }     someone stands beside the landmark in that cube
//   { kind: 'gate', key }         a guardian's gate opened (run.unlockedGates has it already)
//   { kind: 'found', quest, spot } somebody picked up the thing quest `quest` is looking for (of
//                                 a gathering, the one on hiding place `spot`)
//   { kind: 'rescued', quest }    somebody found the person quest `quest` is looking for
//   { kind: 'talked', quest }     somebody talked to who quest `quest` sends them to (a letter
//                                 delivered, somebody asked)
//   { kind: 'defended', quest }   the raid on quest `quest`'s cart is beaten (game/defense.js)
// The log takes note, and the quests move on (settle). The quests paid on the spot.
export function questEvent(log, ev, gates = new Set(), now = 0) {
  if (ev.kind === 'visit' && Number.isInteger(ev.depth) && ev.depth > log.deepest) { log.deepest = Math.min(MAX_DEPTH, ev.depth); log.version++; }
  // below, and back in town: the villagers may bring out new offers (refreshOffers)
  if (ev.kind === 'visit' && Number.isInteger(ev.depth)) {
    if (ev.depth > 0 && !log.away) { log.away = true; log.version++; }
    if (ev.depth === 0 && log.away) { log.away = false; log.townOpen = true; log.version++; }
  }
  // away from a repeatable quest's giver, and back: it comes back (REPEAT)
  if (ev.kind === 'visit' && Number.isInteger(ev.depth)) for (const r of log.repeats) {
    if (r.ready) continue;
    if (ev.depth !== r.depth) { if (!r.away) { r.away = true; log.version++; } } else if (r.away) { r.ready = true; log.version++; }
  }
  if (ev.kind === 'horde' && typeof ev.key === 'string' && !log.broken.includes(ev.key)) { log.broken.push(ev.key); log.version++; }
  if (ev.kind === 'landmark' && typeof ev.key === 'string') for (const q of log.list) {
    const s = q.stages[q.stage];
    if (q.state === 'active' && !q.archived && s?.goal === 'landmark' && s.key === ev.key && !s.done) { s.done = true; log.version++; }
  }
  if (ev.kind === 'found' && typeof ev.spot === 'string') {
    const q = find(log, ev.quest), s = q?.stages[q.stage], i = s?.goal === 'gather' ? s.spots.indexOf(ev.spot) : -1;
    if (q?.state === 'active' && !q.archived && i >= 0 && !s.got[i]) { s.got[i] = true; log.version++; }
  } else if (['found', 'rescued', 'talked', 'defended'].includes(ev.kind) && typeof ev.quest === 'string') {
    const q = find(log, ev.quest), s = q?.stages[q.stage];
    const goals = { found: ['find'], rescued: ['rescue'], talked: ['deliver', 'talk'], defended: ['defend'] }[ev.kind];
    if (q?.state === 'active' && !q.archived && goals.includes(s?.goal) && !s.done) { s.done = true; log.version++; }
  }
  return settle(log, gates, now);
}
// does a quest that is going on want someone at the landmark in cube `key`?
export const wantsLandmark = (log, key) => log.list.some(q => q.state === 'active' && !q.archived
  && q.stages[q.stage]?.goal === 'landmark' && q.stages[q.stage].key === key);

// A death puts the cube back as it was when you came in (game/flow.js): quest progress made since
// goes back with it. progressOf before, restoreProgress after.
export const progressOf = log => ({ broken: [...log.broken],
  quests: new Map(log.list.map(q => [q.id, { state: q.state, stage: q.stage, done: q.stages.map(s => s.done), got: q.stages.map(s => s.got && [...s.got]) }])) });
export function restoreProgress(log, before) {
  let changed = log.broken.length !== before.broken.length;
  log.broken = [...before.broken];
  for (const q of log.list) {
    const was = before.quests.get(q.id);
    const gotSame = q.stages.every((s, i) => !s.got || String(s.got) === String(was?.got?.[i]));
    if (!was || q.state === 'done' || was.state === q.state && was.stage === q.stage && gotSame) continue;
    if (!['active', 'ready'].includes(q.state) || !['active', 'ready'].includes(was.state)) continue;
    q.state = was.state; q.stage = was.stage;
    q.stages.forEach((s, i) => { s.done = !!was.done[i]; if (s.got && was.got?.[i]) s.got = [...was.got[i]]; });
    changed = true;
  }
  if (changed) log.version++;
  return changed;
}

// --- what the quests put in the world -------------------------------------------------------------

// The quests going on whose current goal is in cube `key`: [{ quest, stage }] (a thing to find,
// somebody lost, a treasure's chest; they show only while it is the goal)
export const questGoalsIn = (log, key) => log.list.filter(q => q.state === 'active' && !q.archived && inCube(q.stages[q.stage], key))
  .map(q => ({ quest: q, stage: q.stages[q.stage] }));
// is stage s's goal (or a part of it still to do: a gathering's things not picked up) in cube `key`?
const inCube = (s, key) => s?.key === key || !!s?.keys?.some((k, i) => k === key && !s.got[i]);
// where a stage's goal is now: its cube, or a gathering's next thing still to pick up
export const stageKey = s => s.keys ? s.keys.find((k, i) => !s.got[i]) ?? null : s.key ?? null;
// the people living at camp `campId` (a spot's id), found by the quests
export const livingAt = (log, campId) => log.living.filter(p => p.camp === campId);
// what a quest carries (core/items.js QUEST_ITEMS): the things found for it, a treasure's map
export function carried(q) {
  if (q.state === 'done' || q.state === 'offered') return [];
  const out = q.stages.filter(s => s.goal === 'find' && s.done).map(s => s.item);
  for (const s of q.stages.filter(x => x.goal === 'gather')) out.push(...s.got.filter(Boolean).map(() => s.item));
  out.push(...q.stages.filter(s => s.goal === 'deliver' && !s.done).map(s => s.item));
  if (q.kind === 'treasure') out.push('quest_map_scrap');
  return out;
}

// the sealed portals the quests taken have opened (an annex's: world/layout.js annexGate); they
// stay open, also once the quest is done
export const openedGates = log => log.list.filter(q => q.state !== 'offered').flatMap(q => q.stages.map(s => s.opens)).filter(Boolean);

// --- what is shown --------------------------------------------------------------------------------

// what a giver has for the players: quests to hand in, offers, and those going on
export const giverQuests = (log, giver) => log.list.filter(q => q.giver === giver && ['offered', 'ready', 'active', 'failed'].includes(q.state));
// the mark over a giver's head: '?' a quest to hand in, '!' an offer, '' nothing new
export function giverMark(log, giver) {
  const mine = log.list.filter(q => q.giver === giver);
  const awaited = log.list.some(q => q.state === 'active' && !q.archived && ['deliver', 'talk'].includes(q.stages[q.stage]?.goal)
    && q.stages[q.stage].to.resident === giver);   // a letter for them, a question for them
  return awaited || mine.some(q => q.state === 'ready' && !q.archived) ? '?' : mine.some(q => q.state === 'offered') ? '!' : '';
}
// the panel's lists: going on (active, ready, failed), done, archived; newest first
export function questLists(log) {
  const shown = log.list.filter(q => q.state !== 'offered').reverse();
  return { active: shown.filter(q => !q.archived && q.state !== 'done'), done: shown.filter(q => !q.archived && q.state === 'done'),
    archived: shown.filter(q => q.archived) };
}
// a stage in words: a gathering with how many are found
export const stageText = s => s.goal === 'gather' ? `${s.text} (${s.got.filter(Boolean).length}/${s.got.length})` : s.text;
// a quest's state in words
export function stateText(q) {
  if (q.archived) return 'Archived';
  return { offered: 'Offered', active: q.stages[q.stage] ? stageText(q.stages[q.stage]) : 'Going on', ready: `Done: back to ${giverName(q)}`,
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
  if (!isObj(s) || !GOALS.includes(s.goal) || !Number.isInteger(s.depth) || s.depth < 0 || s.depth > MAX_DEPTH) return null;
  if (s.key !== undefined && typeof s.key !== 'string') return null;
  const out = { goal: s.goal, depth: s.depth, ...(s.key !== undefined ? { key: s.key } : {}), text: text(s.text, 120), done: !!s.done };
  if (typeof s.spot === 'string') out.spot = s.spot.slice(0, 60);
  if (typeof s.chest === 'string') out.chest = s.chest.slice(0, 90);
  if (typeof s.prestige === 'string' && CHESTS[s.prestige]) out.prestige = s.prestige;
  if (s.goal === 'find' && ITEMS[s.item]?.category !== 'quest') return null;
  if (s.goal === 'find') out.item = s.item;
  if ((s.goal === 'find' || s.goal === 'gather') && typeof s.label === 'string') out.label = text(s.label, 60);
  if (s.goal === 'gather') {
    const spots = Array.isArray(s.spots) ? s.spots : [], keys = Array.isArray(s.keys) ? s.keys : [], got = Array.isArray(s.got) ? s.got : [];
    if (ITEMS[s.item]?.category !== 'quest' || !spots.length || spots.length > 9 || keys.length !== spots.length
      || ![...spots, ...keys].every(x => typeof x === 'string' && x.length <= 60)) return null;
    Object.assign(out, { item: s.item, spots: [...spots], keys: [...keys], got: spots.map((_, i) => !!got[i]) });
  }
  if (s.goal === 'rescue') { const p = checkPerson(s.person); if (!p) return null; out.person = p; }
  if (s.goal === 'bounty') {
    if (!ENEMY_KINDS[s.enemy] || typeof s.name !== 'string' || typeof s.enemyId !== 'string') return null;
    Object.assign(out, { enemy: s.enemy, name: text(s.name, 30), enemyId: s.enemyId.slice(0, 90) });
  }
  if (s.goal === 'deliver' && ITEMS[s.item]?.category !== 'quest') return null;
  if (s.goal === 'deliver') out.item = s.item;
  if (s.goal === 'deliver' || s.goal === 'talk') {
    const t = isObj(s.to) ? s.to : {};
    out.to = { name: text(t.name, 30), title: text(t.title, 60) };
    if (isNpcGiver(t.resident)) Object.assign(out.to, { resident: t.resident.slice(0, 60), where: text(t.where, 80) });
    else if (typeof t.spot === 'string' && checkPerson(t.person)) Object.assign(out.to, { spot: t.spot.slice(0, 60), person: checkPerson(t.person) });
    else return null;
    out.reply = text(s.reply, 200);
  }
  if (typeof s.clue === 'string') out.clue = text(s.clue, 120);
  if (s.goal === 'defend') out.waves = Math.max(1, Math.min(9, nat(s.waves) || 3));
  if (typeof s.opens === 'string' && s.opens.startsWith('annex:')) out.opens = s.opens.slice(0, 60);
  if (['find', 'rescue', 'open', 'bounty', 'defend'].includes(s.goal) && !out.spot) return null;
  return out;
}
// somebody (lost, or living at a camp): their name, how they are related, how they look
function checkPerson(p) {
  if (!isObj(p) || typeof p.name !== 'string' || !p.name) return null;
  const outfit = Array.isArray(p.outfit) ? p.outfit.filter(id => ITEMS[id]?.slot) : [];
  if (new Set(outfit.map(id => ITEMS[id].slot)).size !== outfit.length) return null;
  return { name: text(p.name, 20), relation: text(p.relation, 20), tint: /^#[0-9a-f]{6}$/i.test(p.tint) ? p.tint : '#d9b48c', outfit };
}
// a quest's rewards as saved or told by the host
export function checkRewards(r) {
  r = isObj(r) ? r : {};
  return { xp: nat(r.xp), copper: nat(r.copper), items: (Array.isArray(r.items) ? r.items : []).map(checkItem).filter(Boolean) };
}
export function checkQuest(q) {
  if (!isObj(q) || typeof q.id !== 'string' || q.id.length > 80 || !isGiver(q.giver) || !QUEST_KINDS.includes(q.kind)) return null;
  if (!STATES.includes(q.state) || !DIFFICULTIES.includes(q.difficulty) || !['return', 'spot', 'self'].includes(q.payout)) return null;
  const stages = Array.isArray(q.stages) ? q.stages.map(checkStage) : [];
  if (!stages.length || stages.includes(null) || !Number.isInteger(q.depth)) return null;
  const target = isObj(q.target) && typeof q.target.id === 'string' ? structuredClone(q.target) : { id: q.id };
  const f = isObj(q.from) ? q.from : {}, town = GIVERS[q.giver];
  const from = { name: text(f.name, 60) || (town ? `the ${town.title}` : 'somebody'), title: text(f.title, 60) || town?.title || 'Somebody',
    where: text(f.where, 80) || town?.where || '' };
  return { id: q.id, giver: q.giver, n: nat(q.n), ...(typeof q.slot === 'string' ? { slot: q.slot.slice(0, 12) } : {}),
    ...(q.repeat ? { repeat: true } : {}), from, kind: q.kind, depth: q.depth, difficulty: q.difficulty, target,
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
  log.used = Array.isArray(x.used) ? [...new Set(x.used.filter(u => typeof u === 'string' && u.length <= 12))] : [];
  log.repeats = (Array.isArray(x.repeats) ? x.repeats : []).filter(r => isObj(r) && typeof r.id === 'string' && isGiver(r.giver)
    && REPEAT.kinds.includes(r.kind) && Number.isInteger(r.depth)).map(r => ({ id: r.id.slice(0, 80), giver: r.giver, kind: r.kind,
    depth: Math.min(MAX_DEPTH, nat(r.depth)), away: !!r.away, ready: !!r.ready }));
  log.repeated = nat(x.repeated);
  log.townOpen = x.townOpen !== false; log.away = !!x.away;
  log.living = (Array.isArray(x.living) ? x.living : []).map(p => {
    const c = checkPerson(p);
    return c && typeof p.id === 'string' && typeof p.camp === 'string' ? { id: p.id.slice(0, 80), ...c, camp: p.camp.slice(0, 60) } : null;
  }).filter(Boolean);
  log.deepest = Math.min(MAX_DEPTH, nat(x.deepest));
  log.broken = Array.isArray(x.broken) ? [...new Set(x.broken.filter(k => typeof k === 'string'))] : [];
  log.version = nat(x.version);
  return log;
}
// what is saved and sent of a log (plain JSON)
export const packQuestLog = log => structuredClone({ list: log.list, next: log.next, deepest: log.deepest, broken: log.broken, met: log.met,
  used: log.used, living: log.living, repeats: log.repeats, repeated: log.repeated, townOpen: log.townOpen, away: log.away, version: log.version });
