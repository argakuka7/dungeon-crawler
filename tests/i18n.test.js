import test from 'node:test';
import assert from 'node:assert/strict';
import { tr, tc, say, phrase, noun, person, useLanguage, loadLocale, language, pickLanguage, parse, paramsOf, num, pct } from '../src/i18n/i18n.js';
import { check } from '../tools/i18n.mjs';

const de = await loadLocale('de');
// run fn in German with these extra messages, then back in English
function german(extra, fn) {
  const mod = { ...de, messages: { ...de.messages, ...extra } };
  useLanguage('de', mod);
  try { return fn(); } finally { useLanguage('en'); useLanguage('de', de); useLanguage('en'); }
}

test('node starts in English, and English is the code\'s own text', () => {
  assert.equal(language(), 'en');
  assert.equal(tr('Resume'), 'Resume');
  assert.equal(tr('Reached depth {depth}', { depth: 3 }), 'Reached depth 3');
  assert.equal(tr('{n, plural, one {# enemy} other {# enemies}}', { n: 1 }), '1 enemy');
  assert.equal(tr('{n, plural, =0 {none} one {# enemy} other {# enemies}}', { n: 0 }), 'none');
  assert.equal(tr('{n, plural, one {# enemy} other {# enemies}}', { n: 12000 }), '12,000 enemies');
});

test('the browser\'s languages pick the first the game speaks', () => {
  assert.equal(pickLanguage(['fr-FR', 'de-AT', 'en']), 'de');
  assert.equal(pickLanguage(['en-GB', 'de']), 'en');
  assert.equal(pickLanguage(['fr']), 'en');
  assert.equal(pickLanguage([]), 'en');
});

test('a message parses into parts, and says which parameters it uses', () => {
  assert.deepEqual([...paramsOf('{a} and {b:the}, {n, plural, one {# {c}} other {#}}')].sort(), ['a', 'b', 'c', 'n']);
  assert.throws(() => parse('{a'));
  assert.throws(() => parse('{n, plural, one {x}}'));   // no other
});

test('English nouns: articles, plurals, pronouns', () => {
  const lantern = noun('Lantern'), urn = noun('Old urn'), fireworks = noun('Fireworks'), compass = noun('Compass');
  assert.equal(tr('Find {x:the}', { x: lantern }), 'Find the lantern');
  assert.equal(tr('Find {x:a}', { x: urn }), 'Find an old urn');
  assert.equal(tr('Find {x:a}, bring {x:it}', { x: fireworks }), 'Find fireworks, bring them');
  assert.equal(tr('three {x:pl}', { x: compass }), 'three compasses');
  assert.equal(tr('bitten by {x:a}', { x: noun('Redback', { caps: true }) }), 'bitten by a Redback');
  assert.equal(tr('Find {x:the}', { x: person('Ada', 'f') }), 'Find Ada');
});

test('German: articles by case and gender, pronouns, plural', () => {
  german({
    Lantern: { text: 'Laterne', g: 'f', pl: 'Laternen' }, Compass: { text: 'Kompass', g: 'm', pl: 'Kompasse' },
    Rope: { text: 'Seil', g: 'n' }, Fireworks: { text: 'Feuerwerkskörper', g: 'pl' },
    'Find {x:the}': 'Finde {x:den}', 'with {x:a}': 'mit {x:einem}', 'bring {x:it} back': 'bring {x:ihn} zurück',
    'my {x:lower}': '{x:mein}',
  }, () => {
    assert.equal(tr('Find {x:the}', { x: noun('Lantern') }), 'Finde die Laterne');
    assert.equal(tr('Find {x:the}', { x: noun('Compass') }), 'Finde den Kompass');
    assert.equal(tr('Find {x:the}', { x: noun('Rope') }), 'Finde das Seil');
    assert.equal(tr('Find {x:the}', { x: person('Ada', 'f') }), 'Finde Ada');
    assert.equal(tr('with {x:a}', { x: noun('Compass') }), 'mit einem Kompass');
    assert.equal(tr('with {x:a}', { x: noun('Fireworks') }), 'mit Feuerwerkskörpern');
    assert.equal(tr('bring {x:it} back', { x: noun('Lantern') }), 'bring sie zurück');
    assert.equal(tr('bring {x:it} back', { x: noun('Compass') }), 'bring ihn zurück');
    assert.equal(tr('my {x:lower}', { x: noun('Compass') }), 'mein Kompass');
    assert.equal(tr('my {x:lower}', { x: noun('Lantern') }), 'meine Laterne');
  });
});

test('German numbers, plurals and contexts', () => {
  german({ '{n, plural, one {# enemy} other {# enemies}}': '{n, plural, one {# Monster} other {# Monster}}', 'toggle|Off': 'Aus' }, () => {
    assert.equal(num(1.5), '1,5');
    assert.equal(num(12000), '12.000');
    assert.equal(pct(0.25), '25\u00a0%');
    assert.equal(tr('{n, plural, one {# enemy} other {# enemies}}', { n: 2 }), '2 Monster');
    assert.equal(tc('toggle', 'Off'), 'Aus');
  });
  assert.equal(tc('toggle', 'Off'), 'Off');
});

test('kept words are data, said in the language of the moment', () => {
  const kept = JSON.parse(JSON.stringify(phrase('Find {x:the} on {where}', { x: noun('Lantern'), where: phrase('depth {d}', { d: 2 }) })));
  assert.equal(say(kept), 'Find the lantern on depth 2');
  german({ Lantern: { text: 'Laterne', g: 'f' }, 'Find {x:the} on {where}': 'Finde {x:den} auf {where}', 'depth {d}': 'Tiefe {d}' },
    () => assert.equal(say(kept), 'Finde die Laterne auf Tiefe 2'));
  assert.equal(say('plain'), 'plain');
  assert.equal(say(null), '');
});

test('every message of the game is translated, and every translation is used', async () => {
  const problems = await check();
  const show = problems.slice(0, 20).map(p => `${p.kind} ${p.lang ?? ''} ${JSON.stringify(p.text)} ${p.where?.[0] ?? ''} ${p.detail ?? ''}`);
  assert.deepEqual(show, [], `${problems.length} problems; node tools/i18n.mjs lists them`);
});
