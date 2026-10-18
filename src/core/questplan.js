// The world's quest plan (docs/quests.md, "The numbers"): about 100 quests, which kind, at which
// depth and from whom, from the seed and the layouts alone. Pure. A giver offers its slots in
// order (core/quests.js makeQuest), each filled in when it is offered, against the world as it
// is then; a slot that cannot be filled (its target done meanwhile) gives way to another kind at
// its depth, or is passed over.
//
// Also here: the clues a quest gives about a place (from what the layout knows of it) and the
// people somebody may have lost.
import { mulberry32, hash32 } from './util.js';
import { residentOf, npcGiver, NAMES } from './npcs.js';

export const MAX_DEPTH = 20;
// quests per depth: heavier near the top, where a run spends its first hours
export const perDepth = d => d === 0 ? 4 : d <= 3 ? 7 : d <= 11 ? 5 : d <= 19 ? 4 : 3;
// the share of each kind (docs/quests.md "Kinds"). `scout` is one of the kinds about what the
// world has anyway (reach, landmark, guardian, horde), as the giver leans.
// (defense is not drawn: every outpost has one, at its depth, from whoever keeps it)
export const MIX = { find: 13, treasure: 5, rescue: 10, bounty: 15, delivery: 14, gather: 10, scout: 10, pieces: 8, prisoners: 6 };
export const SCOUTS = ['reach', 'landmark', 'guardian', 'horde'];
// the kinds there are so far; a planned kind that is not yet stands in as one of these
export const BUILT = new Set(['find', 'treasure', 'rescue', 'scout', 'bounty', 'delivery', 'relay', 'defense']);
const STAND_IN = [['find', 6], ['treasure', 1], ['scout', 3]];
// how many of a depth's quests the villagers give (the rest: the people out in the world)
const townShare = d => d <= 3 ? 0.7 : d <= 7 ? 0.45 : d <= 11 ? 0.3 : 0.1;
export const TOWN = ['innkeeper', 'groom', 'smith', 'keeper', 'alchemist', 'enchanter'];

const weighted = (R, list) => {
  let r = R() * list.reduce((n, [, w]) => n + w, 0);
  for (const [x, w] of list) if ((r -= w) < 0) return x;
  return list.at(-1)[0];
};

const plans = new WeakMap();
// The plan: { slots: [{ id, depth, kind, giver }], byGiver: giver -> its slots, by depth }
// layout: depth -> the depth's layout (world/layout.js makeLayouts)
export function questPlan(seed, layout) {
  if (plans.has(layout)) return plans.get(layout);
  const slots = [];
  for (let d = 0; d <= MAX_DEPTH; d++) {
    const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x3c6ef372) ^ 0x9a17));
    // the people of this depth and the one above who could ask (their seats and camps)
    const near = [d, d - 1].filter(x => x >= 0).flatMap(x => layout(x).spotList).filter(s => s.kind !== 'hide');
    const camps = [d, d - 1, d - 2].filter(x => x >= 0).flatMap(x => layout(x).spotList).filter(s => s.kind === 'camp');
    for (let i = 0; i < perDepth(d); i++) {
      let kind = weighted(R, Object.entries(MIX));
      if (kind === 'delivery' && R() < 0.4) kind = 'relay';   // (now and then: ask somebody, then find it)
      if (!BUILT.has(kind)) kind = weighted(R, STAND_IN);
      let giver;
      // somebody lost: asked for by whoever waits at a camp near above (they wait there together)
      if (kind === 'rescue') giver = camps.length ? npcGiver(camps[Math.floor(R() * camps.length)].id) : null;
      else if (R() < townShare(d) || !near.length) giver = TOWN[Math.floor(R() * TOWN.length)];
      else giver = npcGiver(near[Math.floor(R() * near.length)].id);
      if (!giver) { kind = 'find'; giver = TOWN[Math.floor(R() * TOWN.length)]; }
      slots.push({ id: `${d}:${i}`, depth: d, kind, giver });
    }
    // an outpost's defense, from whoever keeps it, in place of the depth's last quest
    for (const o of layout(d).spotList.filter(s => s.kind === 'outpost')) {
      const slot = slots.findLast(s => s.depth === d && s.kind !== 'defense');
      if (slot) Object.assign(slot, { kind: 'defense', giver: npcGiver(o.id) });
    }
  }
  const byGiver = new Map();
  for (const s of slots) { if (!byGiver.has(s.giver)) byGiver.set(s.giver, []); byGiver.get(s.giver).push(s); }
  const plan = { slots, byGiver };
  plans.set(layout, plan);
  return plan;
}

// --- clues ----------------------------------------------------------------------------------------

// What can be said about where a spot (world/spots.js) is, from what the layout knows of its
// room: never its cube on a map, only words (docs/quests.md "Only where you have been").
export function clueOf(layout, spot, landmarkName = n => n) {
  const L = layout(spot.depth), k = spot.key, out = [];
  const route = L.route, at = L.routeIndex.get(k) ?? 0, last = route.length - 1;
  const site = (L.sitePlans.get(k) || []).find(i => i.landmark);
  const area = L.areaCells?.get(k), height = L.heightCells?.get(k), span = L.spanCells?.get(k);
  if (k === L.pinnacle) out.push('up on the needle of rock');
  else if (k === L.peak) out.push('on top of the lone peak');
  else if (k === L.lake) out.push('by the great lake');
  else if (area?.piece.kind === 'spiral') out.push('at the foot of the great mountain');
  else if (area?.piece.kind === 'hairpin') out.push(area.i === 0 ? 'at the foot of the two bridges' : 'up where the high bridge comes back');
  else if (height) out.push({ ascent: 'below the great cliff', plateau: 'up on the high plateau', descent: 'where the plateau comes down' }[height.role] ?? 'by the high ground');
  else if (span?.role === 'island') out.push('on the island at the end of the long bridge');
  if (site) out.push(`near the ${landmarkName(site.landmark)}`);
  if (L.hordes.has(k)) out.push('where the horde gathers');
  if (route.indexOf(k) < 0) out.push('off the main way');
  const gates = [...L.guardians].filter(([g, x]) => x.role === 'side' && route.indexOf(g) < at).length;
  if (gates) out.push(gates > 1 ? 'past the guardians\' gates' : 'past the guardian\'s gate');
  if (!out.length) out.push(at <= 2 ? 'not far from where the depth begins' : at >= last - 2 ? 'close to the way down' : 'about halfway along');
  return out.slice(0, 2).join(', ');
}

// --- people somebody lost -------------------------------------------------------------------------

const RELATIONS = ['daughter', 'son', 'brother', 'sister', 'friend', 'apprentice', 'cousin', 'grandson', 'granddaughter'];
const LOST_TINTS = ['#e0c7a0', '#d9b48c', '#c99a86', '#b9c79a', '#d6a9a0'];
const LOST_OUTFITS = [['wear_explorer_hat'], ['wear_headscarf'], ['wear_straw_hat'], ['wear_hood'], ['held_rope'], []];
// who went missing for quest `seed`, whose `relation` they are to the one asking
export function lostPerson(seed) {
  const R = mulberry32(hash32(seed ^ 0x1057));
  return { name: NAMES[Math.floor(R() * NAMES.length)], relation: RELATIONS[Math.floor(R() * RELATIONS.length)],
    tint: LOST_TINTS[Math.floor(R() * LOST_TINTS.length)], outfit: LOST_OUTFITS[Math.floor(R() * LOST_OUTFITS.length)] };
}
// the camp a giver lives at (its spot plan), if it does
export function campOf(layout, giver) {
  const id = String(giver).slice(4), key = id.split(':')[1];
  if (!key) return null;
  const plan = layout(-Number(key.split(',')[1]))?.spots?.get(key)?.find(s => s.id === id);
  return plan?.kind === 'camp' ? plan : null;
}
export { residentOf };
