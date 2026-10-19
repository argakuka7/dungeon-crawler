import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUES, GUARDIAN_HUES, NEUTRALS, TONES, EYES, swatch, paint, maxChroma } from '../src/core/palette.js';
import { parseColor, fromOklch, linearToOklab } from '../src/core/oklch.js';
import { ENEMY_KINDS } from '../src/core/enemies.js';

const turn = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const lab = s => linearToOklab(fromOklch(parseColor(s)));
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

test('a swatch is its family\'s hue at its tone\'s lightness, as strong as the hue allows', () => {
  for (const [family, h] of Object.entries(HUES)) for (const [tone, t] of Object.entries(TONES)) {
    const s = swatch(`${family}.${tone}`);
    assert.equal(s.l, t.l); assert.equal(s.h, h);
    assert.ok(s.c <= t.c + 1e-9 && s.c <= maxChroma(t.l, h) + 1e-9, `${family}.${tone}`);
    assert.deepEqual(parseColor(paint(`${family}.${tone}`)).h, h);
  }
  // every family's mid looks about as strong: the narrow hues give up chroma, the wide ones are capped
  const mids = Object.keys(HUES).map(f => swatch(f + '.mid').c);
  assert.ok(Math.min(...mids) > 0.08 && Math.max(...mids) <= TONES.mid.c);
  assert.ok(swatch('ink.dark').c < 0.02 && swatch('stone.mid').h === NEUTRALS.stone.h);
  assert.equal(swatch('frost.pale@-8').h, HUES.frost - 8);
  assert.equal(swatch('eyes.sun'), EYES.sun);
  for (const bad of ['frost', 'frost.bright', 'teal.mid', 'frost.mid@20', 'frost.mid@x', 'eyes.red']) assert.throws(() => swatch(bad), bad);
});

test('every kind is painted from the palette, and only guardians wear pink and amber', () => {
  const lightnesses = new Set([...Object.values(TONES), ...Object.values(EYES)].map(t => t.l));
  const hues = [...Object.values(HUES), ...Object.values(GUARDIAN_HUES), ...Object.values(NEUTRALS).map(n => n.h), ...Object.values(EYES).map(e => e.h)];
  for (const k of Object.values(ENEMY_KINDS)) {
    if (!k.colors) { assert.ok(k.boss, k.type + ' has colours'); continue; }
    for (const [role, color] of Object.entries(k.colors)) {
      const c = parseColor(color);
      assert.ok(lightnesses.has(c.l), `${k.type} ${role}: ${color} is a palette tone`);
      assert.ok(hues.some(h => turn(h, c.h) <= 12), `${k.type} ${role}: ${color} is a palette hue`);
      if (!k.guardian && role !== 'eyes' && c.c > 0.03)
        for (const h of Object.values(GUARDIAN_HUES)) assert.ok(turn(h, c.h) > 12, `${k.type} ${role} keeps off the guardians' ${h}`);
    }
  }
});

test('the kinds of a species are told apart at a glance', () => {
  const species = {};
  for (const k of Object.values(ENEMY_KINDS)) if (!k.guardian && !k.boss) (species[k.species] ??= []).push(k);
  for (const list of Object.values(species)) for (const a of list) for (const b of list) if (a !== b) {
    const role = Object.keys(a.parts)[0];
    assert.ok(dE(a.colors[role], b.colors[role]) >= 0.08, `${a.type} vs ${b.type}`);
  }
  // and every species but the bosses' own minions comes in at least three ordinary kinds
  for (const [s, list] of Object.entries(species)) if (list.some(k => !k.minion))
    assert.ok(list.filter(k => !k.minion).length >= 3, s);
});
