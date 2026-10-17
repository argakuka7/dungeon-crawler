import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDS, BRIDGE_STYLES, bridgeFits, pickBridge, bridgesOf } from '../src/themes/builds.js';
import { SURFACES } from '../src/core/footing.js';
import { BRIDGES } from '../src/render/bridges.js';
import { THEMES } from '../src/themes/index.js';

// every situation a bridge is picked in (cubegen/shape.js, world/spans.js)
const WHERE = {
  'short, over a drop': { solid: false, k: 1 },
  'long, over a drop': { solid: false, k: 7 },
  'over ground': { solid: true, k: 3 },
  span: { span: true, sky: false, k: 12 },
  'sky span': { span: true, sky: true, k: 12 },
};

test('every bridge style has a builder, a surface and sane sag', () => {
  for (const [name, s] of Object.entries(BRIDGE_STYLES)) {
    assert.ok(BRIDGES[name], `${name}: builder`);
    assert.ok(SURFACES.includes(s.surface), `${name}: surface`);
    assert.ok(['piers', 'legs', 'none'].includes(s.supports), `${name}: supports`);
    for (let k = 1; k <= 12; k++) for (const span of [false, true]) {
      const sag = s.sag(k, span);
      assert.ok(sag >= 0 && sag <= 1, `${name}: sag ${sag} at ${k}`);
    }
  }
});

test('every theme weights known bridge styles and has one wherever a bridge goes', () => {
  for (const t of THEMES) {
    const w = BUILDS[t.props].bridges;
    for (const [s, v] of Object.entries(w)) assert.ok(BRIDGE_STYLES[s] && v > 0, `${t.props}: ${s}`);
    for (const [what, where] of Object.entries(WHERE))
      assert.ok(Object.keys(w).some(s => bridgeFits(s, where)), `${t.props}: nothing fits ${what}`);
  }
});

test('bridge picks keep to the styles that fit and to their weights', () => {
  // stone arches only over ground, never over the sky
  assert.ok(!bridgeFits('stone', WHERE['long, over a drop']) && bridgeFits('stone', WHERE['over ground']));
  assert.ok(bridgeFits('stone', WHERE.span) && !bridgeFits('stone', WHERE['sky span']));
  const count = (weights, where) => {
    const n = {};
    for (let i = 0; i < 1000; i++) { const s = pickBridge(weights, where, (i + 0.5) / 1000); n[s] = (n[s] || 0) + 1; }
    return n;
  };
  assert.deepEqual(count({ stone: 1, rope: 3 }, WHERE['over ground']), { stone: 250, rope: 750 });
  assert.deepEqual(count({ stone: 1, rope: 3 }, WHERE['sky span']), { rope: 1000 });
  assert.deepEqual(count({ stone: 1 }, WHERE['sky span']), { plank: 1000 });   // nothing fits
  // a forced style wherever it fits
  assert.deepEqual(bridgesOf(THEMES[0], 'iron'), { iron: 1 });
  assert.equal(bridgesOf(THEMES[0]), BUILDS[THEMES[0].props].bridges);
});
