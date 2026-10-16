import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADJECTIVES, LANDMARKS, PREFIXES, SUFFIXES, mix, unmix, worldName, worldPlace, seedFromName, readSeed } from '../src/core/names.js';
import { mulberry32 } from '../src/core/util.js';

const join = (p, s) => (p + s).replace(/(.)\1\1/g, '$1$1');
const places = () => PREFIXES.flatMap(p => SUFFIXES.map(s => join(p, s)));

test('the lists have exactly one name for every seed', () => {
  assert.equal(ADJECTIVES.length, 512);
  assert.equal(LANDMARKS.length, 256);
  assert.equal(PREFIXES.length, 512);
  assert.equal(SUFFIXES.length, 64);
  assert.equal(ADJECTIVES.length * LANDMARKS.length * PREFIXES.length * SUFFIXES.length, 2 ** 32);
});

test('the words are single plain words, each in one place only', () => {
  for (const list of [ADJECTIVES, LANDMARKS, PREFIXES]) for (const w of list) assert.match(w, /^[A-Z][a-z]+$/);
  for (const s of SUFFIXES) assert.match(s, /^[a-z]+$/);
  for (const list of [ADJECTIVES, LANDMARKS, PREFIXES, SUFFIXES])
    assert.equal(new Set(list.map(w => w.toLowerCase())).size, list.length, 'no word twice in a list');
  const landmarks = new Set(LANDMARKS);
  assert.deepEqual(ADJECTIVES.filter(a => landmarks.has(a)), [], 'no "The Hollow Hollow"');
  const suffixes = new Set(SUFFIXES);
  assert.deepEqual(PREFIXES.filter(p => suffixes.has(p.toLowerCase())), [], 'no "Millmill"');
  for (const w of ['the', 'of']) assert.ok(![...ADJECTIVES, ...LANDMARKS].some(x => x.toLowerCase() === w));
});

test('every place reads only one way', () => {
  const all = places().map(p => p.toLowerCase());
  assert.equal(new Set(all).size, all.length);
  assert.equal(join('Moss', 'stone'), 'Mosstone', 'three letters the same: two of them');
});

test('nothing rude, also not where a prefix meets a suffix', () => {
  const rude = ['shit', 'fuck', 'cunt', 'cock', 'dick', 'piss', 'slut', 'whore', 'bitch', 'nazi', 'porn', 'wank', 'jizz',
    'nigg', 'fag', 'anus', 'anal', 'tits', 'poop', 'turd', 'arse', 'spunk', 'cum', 'boob', 'fart'];
  const found = [...ADJECTIVES, ...LANDMARKS, ...places()].filter(w => rude.some(r => w.toLowerCase().includes(r)));
  assert.deepEqual(found, []);
});

test('the stirring can be undone, and seeds side by side get names nothing alike', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 20000; i++) {
    const x = Math.floor(r() * 2 ** 32);
    assert.equal(unmix(mix(x)), x);
    assert.equal(mix(unmix(x)), x);
  }
  const names = Array.from({ length: 100 }, (_, i) => worldName(i));
  assert.equal(new Set(names).size, 100);
  const adjectives = new Set(names.map(n => n.split(' ')[1]));
  assert.ok(adjectives.size > 80, `seeds 0..99 use ${adjectives.size} adjectives`);
});

test('a world name gives its seed back', () => {
  const r = mulberry32(11);
  const seeds = [0, 1, 2, 0x7fffffff, 0x80000000, 0xffffffff, ...Array.from({ length: 20000 }, () => Math.floor(r() * 2 ** 32))];
  for (const seed of seeds) {
    const name = worldName(seed);
    assert.match(name, /^The [A-Z][a-z]+ [A-Z][a-z]+ of [A-Z][a-z]+$/);
    assert.ok(name.length <= 45, name);
    assert.equal(seedFromName(name), seed, name);
    assert.ok(name.endsWith(` of ${worldPlace(seed)}`));
  }
});

test('a name is read as typed: any letters, any spaces, "the" and "of" may go', () => {
  const seed = 123456789, name = worldName(seed), [, a, l, , p] = name.split(' ');
  for (const typed of [name.toLowerCase(), name.toUpperCase(), `  ${a}   ${l}  ${p} `, `${a} ${l} of ${p}`, `the ${a}-${l}, of ${p}!`])
    assert.equal(seedFromName(typed), seed, typed);
  for (const bad of ['', 'bob', `${a} ${l}`, `${l} ${a} of ${p}`, `${a} ${l} of ${p} ${p}`, `${a} ${l} of ${p}x`, null, 42])
    assert.equal(seedFromName(bad), null, String(bad));
});

test('a seed as typed in New Known World: a number or a world name', () => {
  assert.equal(readSeed('12345'), 12345);
  assert.equal(readSeed(' 0 '), 0);
  assert.equal(readSeed('4294967295'), 0xffffffff);
  assert.equal(readSeed('4294967296'), null, 'too big');
  assert.equal(readSeed(worldName(99)), 99);
  assert.equal(readSeed('hello there'), null);
  assert.equal(readSeed(''), null);
});
