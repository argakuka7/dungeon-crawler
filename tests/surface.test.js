import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LH, FLUIDS, WATER } from '../src/core/constants.js';
import { FLUID_MOTION, SINK, restY, tideY, surfaceY, surfaceRange, ownTakes, ownUnder } from '../src/render/surface.js';

test('every fluid is drawn under its level, its crests too, and as low as its tide goes', () => {
  for (const t of FLUIDS) {
    const S = FLUID_MOTION[t], [lo, hi] = surfaceRange(t, 5);
    assert.ok(S.lift < SINK, `fluid ${t}: crests under the level`);
    assert.ok(hi < 5 && hi === restY(5) + S.lift);
    assert.ok(Math.abs(hi - lo - (S.tide + S.ripple)) < 1e-9);
    // the tide over a period stays in the range
    for (let tm = 0; tm < S.period; tm += S.period / 50) {
      const y = surfaceY(t, 5, tm);
      assert.ok(y <= hi + 1e-9 && y >= lo - 1e-9, `fluid ${t} at ${tm}: ${y}`);
      assert.equal(y, restY(5) + tideY(S, tm));
    }
  }
});

test('a standing fluid and the cube\'s own never both draw in one column', () => {
  // a pool (bed 2, level 4) and a standing fluid at levels round it
  const pool = { fluid: WATER, top: 2, surf: 4 }, dry = { fluid: 0, top: 3 };
  for (const level of [1, 1.5, 2, 2.5, 3.99, 4, 4.0005, 4.01, 5, 6].map(l => l * LH)) {
    const ownDrawn = !ownUnder(pool.surf * LH, level), standingDrawn = !ownTakes([pool], level);
    // under the pool's bed the standing one is drawn under it, at another height
    if (level <= pool.top * LH) { assert.ok(ownDrawn && standingDrawn); continue; }
    assert.ok(ownDrawn !== standingDrawn, `level ${level}: own ${ownDrawn}, standing ${standingDrawn}`);
  }
  assert.ok(!ownTakes([dry], 2 * LH) && !ownTakes([], 2 * LH));
});
