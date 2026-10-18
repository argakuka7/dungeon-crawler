import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLayouts } from '../src/world/layout.js';
import { createQuestLog, refreshOffers, makeQuest, accept, archive, restart, fail, handIn, questEvent, settle, goalDone,
  progressOf, restoreProgress, checkQuestLog, packQuestLog, giverMark, giverQuests, questLists, GIVERS, QUEST_KINDS,
  MAX_OFFERS, questRewards } from '../src/core/quests.js';
import { createWorld, checkWorld } from '../src/core/save.js';
import { mulberry32 } from '../src/core/util.js';
import { ITEMS } from '../src/core/items.js';

const layouts = new Map();
const ctxOf = (seed, gates = new Set()) => {
  if (!layouts.has(seed)) layouts.set(seed, makeLayouts(seed));
  return { seed, layout: layouts.get(seed), gates, now: 1 };
};
const roundTrip = x => JSON.parse(JSON.stringify(x));
const offerOf = (log, kind) => log.list.find(q => q.state === 'offered' && q.kind === kind);
// a log with offers until one of `kind` comes up (deeper and deeper)
function withOffer(seed, kind, deepest = 1) {
  const ctx = ctxOf(seed), log = createQuestLog();
  log.deepest = deepest;
  for (let i = 0; i < 40 && !offerOf(log, kind); i++) {
    refreshOffers(log, ctx);
    if (!offerOf(log, kind)) for (const q of log.list.filter(q => q.state === 'offered')) q.state = 'done';
  }
  return { ctx, log, q: offerOf(log, kind) };
}

test('every giver offers quests, the same ones for the same world', () => {
  for (const seed of [1, 123, 9999]) {
    const a = createQuestLog(), b = createQuestLog();
    refreshOffers(a, ctxOf(seed)); refreshOffers(b, ctxOf(seed));
    assert.deepEqual(a, b, 'the same seed makes the same offers');
    const counts = Object.keys(GIVERS).map(giver => a.list.filter(q => q.giver === giver && q.state === 'offered').length);
    assert.ok(counts.every(n => n <= MAX_OFFERS));
    assert.ok(counts.filter(n => n > 0).length >= 5, `nearly every giver offers something (seed ${seed}): ${counts}`);
    assert.equal(new Set(a.list.map(q => q.target.id)).size, a.list.length, 'never two quests about one thing');
  }
});

test('quests are about what the world has, near how deep anyone got', () => {
  for (const seed of [5, 77, 4242]) {
    const ctx = ctxOf(seed);
    for (const deepest of [0, 3, 9, 18, 20]) {
      const log = createQuestLog();
      log.deepest = deepest;
      for (let round = 0; round < 6; round++) {
        refreshOffers(log, ctx);
        for (const q of log.list) if (q.state === 'offered') q.state = 'done';
      }
      assert.ok(log.list.length > 0, `quests at depth ${deepest}`);
      for (const q of log.list) {
        assert.ok(QUEST_KINDS.includes(q.kind));
        assert.ok(q.depth >= Math.max(0, deepest - 1) && q.depth <= Math.min(20, deepest + 2), `${q.id} at depth ${q.depth} near ${deepest}`);
        const s = q.stages[0], L = ctx.layout(q.depth);
        if (q.kind === 'reach') assert.ok(q.depth > deepest);
        if (q.kind === 'guardian') assert.ok(L.guardians.has(s.key));
        if (q.kind === 'horde') assert.ok(L.hordes.has(s.key));
        if (q.kind === 'landmark') assert.ok(L.sitePlans.get(s.key)?.[0]?.landmark);
        assert.ok(q.title && q.text && s.text, 'it has words');
        assert.ok(!/undefined|NaN|null/.test(q.title + q.text + s.text), q.text);
        assert.ok(q.rewards.xp > 0 && q.rewards.copper > 0);
        for (const i of q.rewards.items) assert.ok(ITEMS[i.itemId]);
      }
    }
  }
});

test('a reach quest is done by getting there, and paid by its giver', () => {
  const { ctx, log, q } = withOffer(31, 'reach', 1);
  assert.ok(q);
  assert.ok(accept(log, q.id, ctx.gates));
  assert.equal(q.state, 'active');
  questEvent(log, { kind: 'visit', depth: q.depth - 1 }, ctx.gates);
  assert.equal(q.state, 'active', 'not deep enough yet');
  questEvent(log, { kind: 'visit', depth: q.depth }, ctx.gates);
  assert.equal(q.state, 'ready', 'back to the giver');
  assert.ok(q.stages[0].done);
  assert.equal(giverMark(log, q.giver), '?');
  assert.equal(handIn(log, 'nope'), null);
  assert.equal(handIn(log, q.id, 7), q);
  assert.equal(q.state, 'done');
  assert.equal(q.finished, 7);
  assert.equal(handIn(log, q.id), null, 'paid once');
});

test('guardian, horde and landmark quests', () => {
  const g = withOffer(2, 'guardian', 2);
  accept(g.log, g.q.id, g.ctx.gates);
  settle(g.log, g.ctx.gates);
  assert.equal(g.q.state, 'active');
  g.ctx.gates.add(g.q.stages[0].key);
  settle(g.log, g.ctx.gates);
  assert.equal(g.q.state, 'ready', 'the gate is open');

  const h = withOffer(3, 'horde', 2);
  accept(h.log, h.q.id);
  questEvent(h.log, { kind: 'horde', key: 'elsewhere' });
  assert.equal(h.q.state, 'active');
  questEvent(h.log, { kind: 'horde', key: h.q.stages[0].key });
  assert.equal(h.q.state, 'ready');

  const l = withOffer(4, 'landmark', 2);
  accept(l.log, l.q.id);
  questEvent(l.log, { kind: 'landmark', key: l.q.stages[0].key });
  assert.equal(l.q.state, 'ready');
});

test('an offer whose goal got done goes, and no new one is about it', () => {
  const { ctx, log, q } = withOffer(8, 'guardian', 1);
  ctx.gates.add(q.stages[0].key);
  refreshOffers(log, ctx);
  assert.ok(!log.list.includes(q), 'the stale offer went');
  assert.ok(!log.list.some(x => x.target.id === q.target.id));
  ctx.gates.clear();
});

test('archiving pauses a quest; unarchiving catches up with the world', () => {
  const h = withOffer(11, 'horde', 1), l = withOffer(12, 'landmark', 1);
  accept(h.log, h.q.id); accept(l.log, l.q.id);
  assert.ok(archive(h.log, h.q.id, true));
  assert.ok(!archive(h.log, h.q.id, true), 'archived already');
  assert.deepEqual(questLists(h.log).archived.map(q => q.id), [h.q.id]);
  questEvent(h.log, { kind: 'horde', key: h.q.stages[0].key });
  assert.equal(h.q.state, 'active', 'paused while archived');
  archive(h.log, h.q.id, false);
  assert.equal(h.q.state, 'ready', 'the horde is broken: done once back');

  archive(l.log, l.q.id, true);
  questEvent(l.log, { kind: 'landmark', key: l.q.stages[0].key });
  archive(l.log, l.q.id, false);
  assert.equal(l.q.state, 'active', 'standing there while it was archived does not count');
  const offer = l.log.list.find(q => q.state === 'offered');
  if (offer) assert.ok(!archive(l.log, offer.id, true), 'offers cannot be archived');
});

test('a failed quest starts again from the beginning', () => {
  const { log, q } = withOffer(13, 'landmark', 1);
  accept(log, q.id);
  assert.ok(fail(log, q.id));
  assert.equal(q.state, 'failed');
  assert.equal(giverQuests(log, q.giver).includes(q), true);
  assert.ok(restart(log, q.id));
  assert.equal(q.state, 'active');
  assert.equal(q.stage, 0);
  assert.ok(q.stages.every(s => !s.done));
  assert.ok(!restart(log, q.id), 'only failed quests restart');
});

test('a death takes back the quest progress made in the cube since coming in', () => {
  const { log, q } = withOffer(14, 'horde', 1);
  accept(log, q.id);
  const mark = progressOf(log);
  questEvent(log, { kind: 'horde', key: q.stages[0].key });
  assert.equal(q.state, 'ready');
  assert.ok(restoreProgress(log, mark));
  assert.equal(q.state, 'active');
  assert.ok(!log.broken.includes(q.stages[0].key), 'the horde is back');
  assert.ok(!goalDone(q.stages[0], log, new Set()));
});

test('the quest log is saved with the world and checked when read', () => {
  const { log, q } = withOffer(15, 'reach', 2);
  accept(log, q.id);
  const w = createWorld(15, { id: 'w-1', now: 1 });
  w.run.quests = packQuestLog(log);
  const back = checkWorld(roundTrip(w));
  assert.deepEqual(back.run.quests, roundTrip(packQuestLog(log)));
  assert.deepEqual(checkWorld(roundTrip(createWorld(1, { id: 'w-2' }))).run.quests, createQuestLog(), 'a world from before quests');
  const damaged = roundTrip(packQuestLog(log));
  damaged.list.push({ id: 'x', giver: 'nobody' }, { ...damaged.list[0], state: 'weird' }, 5);
  damaged.list[0].rewards.items.push({ itemId: 'no_such_item', count: 1 });
  const c = checkQuestLog(damaged);
  assert.equal(c.list.length, log.list.length, 'damaged quests are left out');
  assert.ok(c.list[0].rewards.items.every(i => ITEMS[i.itemId]));
});

test('rewards grow with the depth and the difficulty', () => {
  const r = d => questRewards(mulberry32(1), ...d);
  assert.ok(r([5, 'hard']).xp > r([5, 'medium']).xp && r([5, 'medium']).xp > r([5, 'easy']).xp);
  assert.ok(r([10, 'medium']).xp > r([2, 'medium']).xp);
  assert.ok(r([10, 'medium']).copper > r([2, 'medium']).copper);
  assert.ok(r([4, 'hard']).items.some(i => i.gen), 'a hard quest pays a weapon');
});

test('a giver with nothing left to ask offers nothing', () => {
  const ctx = ctxOf(16), log = createQuestLog();
  log.deepest = 20;
  for (let i = 0; i < 30; i++) { refreshOffers(log, ctx); for (const q of log.list) if (q.state === 'offered') q.state = 'done'; }
  assert.equal(makeQuest(log, ctx, 'smith'), null, 'every guardian and horde near the core was asked for');
});
