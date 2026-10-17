import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, TOWN } from '../src/themes/index.js';
import { worldThemes, themesAt, themeAt, themeOf, themeById, lightAt, STICK, MAX_DEPTH } from '../src/themes/depth.js';
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
const DEPTHS = Array.from({ length: MAX_DEPTH + 1 }, (_, d) => d);

test('every world picks one theme per depth from its seed, each about as often, in stretches', () => {
  const counts = DEPTHS.map(() => new Map()), seen = new Set();
  let kept = 0, could = 0, expect = 0;
  for (let seed = 0; seed < 800; seed++) {
    // (forcing a theme that is no theme computes them afresh, past the cache)
    const picks = worldThemes(seed), again = worldThemes(seed, ['none']);
    assert.deepEqual(picks.map(p => [p.at, p.theme.props]), again.map(p => [p.at, p.theme.props]));
    assert.equal(picks[0].at, 0);
    picks.forEach((p, i) => i && assert.ok(p.at > picks[i - 1].at && p.theme !== picks[i - 1].theme, 'stretches'));
    for (const d of DEPTHS) {
      const t = themeAt(d, picks);
      assert.ok(themesAt(d).includes(t), `${seed}/${d}: ${t.props}`);
      counts[d].set(t.props, (counts[d].get(t.props) || 0) + 1);
      seen.add(t.props);
      // a depth keeps the theme above it as often as STICK says (plus the times it picks it again)
      const above = d > 1 && themeAt(d - 1, picks), n = themesAt(d).length;
      if (above && n > 1 && themesAt(d).includes(above)) { could++; kept += t === above; expect += STICK + (1 - STICK) / n; }
    }
  }
  for (const d of DEPTHS) for (const t of themesAt(d))
    assert.ok(Math.abs(counts[d].get(t.props) / 800 - 1 / themesAt(d).length) < 0.08, `${d}: ${t.props} ${counts[d].get(t.props)}`);
  assert.ok(could > 1000 && Math.abs(kept - expect) / could < 0.05, JSON.stringify({ kept, could, expect }));
  // every theme comes up (all their assets are used), the town is always in the meadows
  assert.deepEqual([...seen].sort(), [...ids].sort());
  assert.deepEqual(themesAt(0), [TOWN]);
  for (let seed = 0; seed < 50; seed++) assert.equal(themeAt(0, worldThemes(seed)), TOWN);
});

test('forced themes win every depth they may appear at; the light blends between stretches', () => {
  const picks = worldThemes(7, ['clouds', 'forge', 'ossuary']);
  assert.equal(themeAt(0, picks), TOWN);
  for (const [d, id] of [[1, 'clouds'], [2, 'clouds'], [11, 'ossuary'], [12, 'ossuary'], [13, 'forge'], [14, 'forge']])
    assert.equal(themeAt(d, picks).props, id);
  // the meadows from the town down to the peaks are one stretch of light
  const meadow = themeById('meadow'), peaks = themeById('peaks'), flats = themeById('saltflats');
  const world = [{ at: 0, theme: meadow }, { at: 3, theme: peaks }, { at: 4, theme: flats }];
  const { a, b, t } = lightAt(1, world);
  assert.equal(a, meadow.light); assert.equal(b, peaks.light); assert.ok(Math.abs(t - 1 / 3) < 1e-9);
  assert.deepEqual(lightAt(3.5, world), { a: peaks.light, b: flats.light, t: 0.5 });
  assert.deepEqual(lightAt(9, world), { a: flats.light, b: flats.light, t: 0 });
  // a map is its stamp's theme, and a map without one is a bug
  assert.equal(themeOf({ biome: 'hive' }), themeById('hive'));
  assert.throws(() => themeOf({ key: '0,-1,0' }));
});

test('every theme is complete: depths of its kind, structures, footing props, arenas, sites and spans', () => {
  for (const d of DEPTHS) {
    assert.ok(themesAt(d).length, `no theme at depth ${d}`);
    assert.ok(themesAt(d).every(t => t.cave === themesAt(d)[0].cave), `depth ${d} mixes caves and sky`);
  }
  assert.equal(new Set(ids).size, ids.length, 'theme ids (prop sets) are unique');
  for (const t of THEMES) {
    const [a, b] = t.depths;
    assert.ok(Number.isInteger(a) && Number.isInteger(b) && a <= b && a >= 0 && b <= MAX_DEPTH, `${t.props}: depths`);
    assert.ok(t === TOWN || a > 0, `${t.props}: only the town's theme at the town`);
    assert.ok(BUILDS[t.props], `${t.props}: structures`);
    assert.ok(PALETTES[t.props], `${t.props}: arena palette`);
    assert.ok(RECIPES[t.props], `${t.props}: site recipe`);
    const set = PROP_METADATA.filter(p => p.set === t.props && p.attach === 'ground' && !p.landmark);
    assert.ok(set.some(p => p.cover) && set.some(p => !p.cover), `${t.props}: ground props`);
    for (const k of ['top', 'side', 'lip', 'under', 'bed', 'fluids', 'river', 'arche', 'light', 'music'])
      assert.ok(t[k] !== undefined, `${t.props}: ${k}`);
    // gorge spans: every theme has them (some more often than others); decks stay under a cave's walls
    const s = t.spans;
    assert.ok(s && s.chance > 0 && s.chance <= 1 && s.max >= 1, `${t.props}: spans`);
    for (const k of ['route', 'island', 'sky']) assert.ok(s[k] >= 0 && s[k] <= 1, `${t.props}: spans.${k}`);
    if (t.cave) assert.ok(s.deck <= 16, `${t.props}: decks under the cave walls`);
  }
});

test('the route, its guardians and hordes never depend on the themes a world picked', () => {
  const shape = L => DEPTHS.map(d => {
    const l = L(d);
    return { route: l.route, guardians: [...l.guardians.keys()], hordes: [...l.hordes.keys()] };
  });
  for (const seed of [1, 2, 3, 4]) {
    const own = shape(makeLayouts(seed, worldThemes(seed)));
    for (const force of [['clouds', 'highlands', 'saltflats', 'grotto', 'hive', 'ossuary', 'forge', 'cenote'], ['lagoon'], ['karst', 'nests']])
      assert.deepEqual(shape(makeLayouts(seed, worldThemes(seed, force))), own, `seed ${seed}: ${force}`);
  }
});

test('every theme generates its depths, stamps its maps and dresses them from its set', () => {
  for (const theme of THEMES) {
    const w = new World(5, { themes: [theme.props] });
    let own = 0;
    for (let d = theme.depths[0]; d <= Math.min(theme.depths[1], MAX_DEPTH - 1); d++) for (const k of w.layout(d).route.slice(0, 3)) {
      const m = w.cube(k).map;
      assert.equal(m.biome, theme.props);
      assert.equal(themeOf(m), theme);
      own += placeProps(m, themeOf(m)).out.filter(q => q.name.startsWith(theme.props + '_')).length;
    }
    assert.ok(own > 0, `${theme.props}: no props of its own`);
  }
});
