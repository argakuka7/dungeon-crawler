// What the quests put in the cube we are in (docs/quests.md, "Find"): a thing to find lying on its
// hiding place, somebody lost standing on theirs, a treasure's chest; and the people found who
// live at a camp now. They show only while a quest going on (not archived) has them as its goal,
// on the spots the world keeps free for them (world/spots.js, cubegen/spots.js), so the world
// itself never depends on the quests.
//
// The people and the chests are part of the cube as it is built (game/flow.js enterCube calls
// questWorld; updateQuests builds the cube again when they change); the things are drawn with
// the loot (game/loot.js) and picked up by walking onto them.
import { state, player, setStatus } from './state.js';
import { npcsIn } from './npcs.js';
import { questGoalsIn, livingAt, giverName } from '../core/quests.js';
import { ITEMS } from '../core/items.js';
import { loadPropSets } from '../render/props.js';
import { propSetsOf } from '../render/propplace.js';
import { themeOf } from '../themes/depth.js';
import { sfx } from '../audio/sfx.js';
import { makeEnemy, coinRange } from '../core/enemies.js';
import { bountyKind, bountyLevel } from '../core/bounties.js';

const FIND_REACH = 0.75;   // cells: walking this close to a thing picks it up

const spotOf = (map, id) => (map.spots ?? []).find(s => s.id === id) ?? null;

// The quests' part of map m, as it should be now: { people, chests, placements, sig }
function overlay(map, log) {
  const people = [], chests = [], placements = [];
  if (!log || map.interior) return { people, chests, placements, sig: '' };
  for (const { quest, stage } of questGoalsIn(log, map.key)) {
    const s = spotOf(map, stage.spot ?? stage.to?.spot);
    if (!s) continue;
    if ((stage.goal === 'deliver' || stage.goal === 'talk') && stage.to.spot) {
      const s2 = spotOf(map, stage.to.spot), p = stage.to.person;
      if (s2) people.push({ id: `${quest.id}:helper`, helper: quest.id, name: stage.to.name, title: stage.to.title, tint: p.tint, outfit: p.outfit,
        x: s2.anchor.x, y: s2.anchor.y, z: s2.anchor.z, yaw: s2.approach ? Math.atan2(s2.approach.x - s2.anchor.x, s2.approach.z - s2.anchor.z) : 0 });
      continue;
    }
    if (stage.goal === 'rescue') {
      const p = stage.person;
      people.push({ id: `${quest.id}:lost`, lost: quest.id, name: p.name, title: p.name, tint: p.tint, outfit: p.outfit,
        x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, yaw: s.approach ? Math.atan2(s.approach.x - s.anchor.x, s.approach.z - s.anchor.z) : 0 });
    }
  }
  // a treasure's chest: closed while its quest is going on, and once opened it stays (open), like
  // a reward site's
  for (const q of log.list) {
    const stage = q.kind === 'treasure' && q.stages.find(x => x.goal === 'open'), s = stage?.key === map.key && spotOf(map, stage.spot);
    if (!s || !(state.run.chests.has(stage.chest) || q.state === 'active' && !q.archived)) continue;
    const yaw = Math.atan2(s.approach.x - s.anchor.x, s.approach.z - s.anchor.z);
    chests.push({ id: stage.chest, prestige: stage.prestige ?? 'basic', quest: q.id, anchor: { ...s.anchor, yaw }, approach: s.approach,
      cells: s.cells, layer: s.layer, landmark: null });
    placements.push({ name: 'treasure_chest', x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, yaw, s: 0.8, site: stage.chest });
  }
  // the people found, at the camp of whoever asked (its places beside the resident's)
  for (const s of (map.spots ?? []).filter(x => x.kind === 'camp'))
    livingAt(log, s.id).forEach((p, i) => {
      const at = s.places[1 + i];
      if (at) people.push({ id: `${p.id}:home`, name: p.name, title: p.name, tint: p.tint, outfit: p.outfit, home: true, ...at });
    });
  return { people, chests, placements, sig: [...people.map(p => p.id), ...chests.map(c => c.id)].join('|') };
}

// Put the quests' part into map m (game/flow.js, before the cube is built): its people with the
// residents (map.npcs), its chests with the reward sites. The signature of what was put there.
export function questWorld(map) {
  map.baseSites ??= map.rewardSites ?? [];
  map.basePlacements ??= map.sitePlacements ?? [];
  const o = overlay(map, state.run?.quests);
  map.npcs = [...npcsIn(map), ...o.people];
  map.rewardSites = [...map.baseSites, ...o.chests];
  map.sitePlacements = [...map.basePlacements, ...o.placements];
  // an annex's portal, sealed until a quest opens it (render/markers.js draws it grey)
  map.sealed = [0, 1, 2, 3].filter(d => map.gateKeys?.[d]?.startsWith('annex:') && !state.run?.unlockedGates.has(map.gateKeys[d]));
  map.questSig = o.sig + '|' + map.sealed.join(',');
  if (o.placements.length) loadPropSets(propSetsOf(map, themeOf(map))).catch(() => {});   // (the chest's set; game/flow.js builds again once in)
  return o.sig;
}
// has the quests' part of the cube we are in changed since it was built?
export const questWorldChanged = () => !!state.map && overlay(state.map, state.run?.quests).sig + '|'
  + [0, 1, 2, 3].filter(d => state.map.gateKeys?.[d]?.startsWith('annex:') && !state.run?.unlockedGates.has(state.map.gateKeys[d])).join(',')
  !== (state.map.questSig ?? '');

// the things to find lying here, as pickups to draw (render/loot.js drawLoot)
export function questItemsHere() {
  const map = state.map, log = state.run?.quests;
  if (!map || !log || map.interior) return [];
  const out = [];
  for (const { quest, stage } of questGoalsIn(log, map.key)) {
    if (stage.goal !== 'find' || stage.done) continue;
    const s = spotOf(map, stage.spot);
    if (s) out.push({ id: `q:${quest.id}`, quest: quest.id, itemId: stage.item, x: s.anchor.x, y: s.anchor.y, z: s.anchor.z,
      toss: 1, phase: 0, from: [s.anchor.x, s.anchor.y, s.anchor.z], count: 1, questItem: true });
  }
  return out;
}

// Every frame (game/quests.js): walking onto a thing picks it up for its quest. found: the quest
// event to raise.
const picked = new Set();
export function pickUpQuestItems(found) {
  if (state.transitioning || player.hp <= 0 || player.ragdoll) return;
  for (const p of questItemsHere()) {
    if (picked.has(p.id) || Math.hypot(p.x - player.x, p.z - player.z) > FIND_REACH || Math.abs(p.y - player.y) > 1) continue;
    picked.add(p.id);
    const q = state.run.quests.list.find(x => x.id === p.quest);
    sfx('pickup');
    setStatus(`Found the ${ITEMS[p.itemId].name.toLowerCase()}! Bring it back to ${q ? giverName(q) : 'whoever asked'}`);
    found({ kind: 'found', quest: p.quest });
  }
}
// a death put the cube back: what was picked up there may be picked up again
export const forgetPicked = () => picked.clear();

// the bounties waiting here (core/bounties.js), as enemies (game/quests.js adds them), but those
// defeated: on their hiding place, facing where you come from
export function bountiesHere() {
  const map = state.map, log = state.run?.quests;
  if (!map || !log || map.interior) return [];
  const out = [];
  for (const { stage } of questGoalsIn(log, map.key)) {
    if (stage.goal !== 'bounty' || state.run.defeated.has(stage.enemyId)) continue;
    const s = spotOf(map, stage.spot), f = s && map.floors[s.floor];
    if (!f) continue;
    const kind = bountyKind(stage.enemy, stage.name), level = bountyLevel(stage.depth), [lo, hi] = coinRange(kind, level);
    out.push(makeEnemy({ id: stage.enemyId, level, coinDrop: Math.round((lo + hi) / 2), kind, f,
      x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, yaw: Math.atan2(s.approach.x - s.anchor.x, s.approach.z - s.anchor.z) }, kind, 0));
  }
  return out;
}

// What there is to notice coming into a cube with a quest's goal in it: said once a visit
export function noticeQuestGoals() {
  const log = state.run?.quests;
  if (!log || !state.map) return;
  const goals = questGoalsIn(log, state.map.key).map(g => g.stage.goal);
  if (goals.includes('bounty')) setStatus('Something big is prowling about here...');
  else if (goals.includes('rescue')) setStatus('You hear somebody calling for help!');
  else if (goals.includes('find')) setStatus('Something glints somewhere here...');
  else if (goals.includes('open')) setStatus('The cross on the map must be here somewhere!');
}
