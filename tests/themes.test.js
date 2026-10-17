import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, THEMES } from '../src/themes/index.js';
import { worldThemes, themeAt, themeOf, lightAt, CLASSIC } from '../src/themes/depth.js';
import { BUILDS } from '../src/themes/builds.js';
import { PALETTES } from '../src/cubegen/arenaprops.js';
import { RECIPES } from '../src/cubegen/sites.js';
import { PROP_METADATA } from '../src/core/propmetadata.js';
import { props, catalogProp } from '../src/core/propcatalog.js';
import { placeProps } from '../src/render/propplace.js';
import { makeLayouts } from '../src/world/layout.js';
import { World } from '../src/world/world.js';

for (const p of PROP_METADATA) catalogProp(p);
props.ready = true;

const ids = THEMES.map(t => t.props);

test('every world picks one theme per slot from its seed, each about as often', () => {
  const counts = new Map();
  for (let seed = 0; seed < 800; seed++) {
    const picks = worldThemes(seed);
    assert.deepEqual(picks.map(p => p.at), SLOTS.map(s => s.at));
    assert.deepEqual(picks.map(p => p.theme.props), worldThemes(seed).map(p => p.theme.props));
    picks.forEach((p, i) => {
      assert.ok(SLOTS[i].themes.includes(p.theme));
      counts.set(p.theme.props, (counts.get(p.theme.props) || 0) + 1);
    });
  }
  for (const s of SLOTS) for (const t of s.themes) if (t.props !== 'meadow')
    assert.ok(Math.abs(counts.get(t.props) / 800 - 1 / s.themes.length) < 0.08, `${t.props}: ${counts.get(t.props)}`);
  // the town is always in the meadows
  for (let seed = 0; seed < 50; seed++) assert.equal(themeAt(0, worldThemes(seed)).props, 'meadow');
});

test('forced themes win their slot; without picks the classic themes apply', () => {
  const picks = worldThemes(7, ['clouds', 'forge', 'ossuary']);
  assert.equal(themeAt(1, picks).props, 'clouds');
  assert.equal(themeAt(2, picks).props, 'clouds');
  assert.equal(themeAt(14, picks).props, 'forge');
  assert.equal(themeAt(12, picks).props, 'ossuary');
  assert.deepEqual([0, 1, 3, 4, 5, 7, 9, 11, 13, 15, 17, 19, 20].map(d => themeAt(d).props),
    ['meadow', 'meadow', 'peaks', 'badlands', 'roots', 'frozen', 'swamp', 'nests', 'mines', 'ruins', 'volcanic', 'abyss', 'abyss']);
  // the classic meadows are one stretch of light from the town to the peaks
  const { a, b, t } = lightAt(1);
  assert.equal(a, themeAt(0).light); assert.equal(b, themeAt(3).light); assert.ok(Math.abs(t - 1 / 3) < 1e-9);
  assert.equal(lightAt(1, CLASSIC).t, t);
});

test('every theme is complete: a slot of its kind, structures, footing props, arenas and sites', () => {
  for (const s of SLOTS) assert.ok(s.themes.every(t => t.cave === s.themes[0].cave), `slot ${s.at} mixes caves and sky`);
  assert.equal(new Set(ids).size, ids.length, 'theme ids (prop sets) are unique');
  for (const t of THEMES) {
    assert.ok(BUILDS[t.props], `${t.props}: structures`);
    assert.ok(PALETTES[t.props], `${t.props}: arena palette`);
    assert.ok(RECIPES[t.props], `${t.props}: site recipe`);
    const set = PROP_METADATA.filter(p => p.set === t.props && p.attach === 'ground' && !p.landmark);
    assert.ok(set.some(p => p.cover) && set.some(p => !p.cover), `${t.props}: ground props`);
    for (const k of ['top', 'side', 'lip', 'under', 'bed', 'fluids', 'river', 'arche', 'light', 'music'])
      assert.ok(t[k] !== undefined, `${t.props}: ${k}`);
  }
});

test('which rooms a world has never depends on the themes it picked', () => {
  const shape = L => Array.from({ length: 21 }, (_, d) => {
    const l = L(d);
    return { route: l.route, exists: [...l.exists].sort(), portals: [...l.portals].sort(), guardians: [...l.guardians.keys()],
      spans: [...(l.spanCells?.keys() || [])], sites: [...l.sitePlans.keys()] };
  });
  for (const seed of [1, 2, 3, 4]) {
    const classic = shape(makeLayouts(seed, CLASSIC));
    for (const force of [['clouds', 'highlands', 'saltflats', 'grotto', 'hive', 'ossuary', 'forge', 'cenote'], ['lagoon'], ['karst']])
      assert.deepEqual(shape(makeLayouts(seed, worldThemes(seed, force))), classic, `seed ${seed}: ${force}`);
  }
});

test('every alternative theme generates its depths, stamps its maps and dresses them from its set', () => {
  for (const [i, s] of SLOTS.entries()) for (const theme of s.themes.slice(1)) {
    const w = new World(5, { themes: [theme.props] }), end = SLOTS[i + 1]?.at ?? 21;
    let own = 0;
    for (let d = s.at; d < end; d++) for (const k of w.layout(d).route.slice(0, 3)) {
      const m = w.cube(k).map;
      assert.equal(m.biome, theme.props);
      assert.equal(themeOf(m), theme);
      own += placeProps(m, themeOf(m)).out.filter(q => q.name.startsWith(theme.props + '_')).length;
    }
    assert.ok(own > 0, `${theme.props}: no props of its own`);
  }
});
