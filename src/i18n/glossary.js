// The glossary: the game's important words, and what they are in every language, so a thing has
// one name everywhere: in the game (src/i18n/<code>/), in the kids' guide (learn/) and in the
// docs. Before translating (or writing the guide), look a word up here; a new important word goes
// here first.
//
// Two kinds of entries:
//   GLOSSARY  the words for the game's ideas (a cube, a depth, a quest ...), written by hand, with
//             a note on what they mean and how to use them. tools/i18n.mjs checks every message:
//             one whose English says the word (`en`, a pattern) has the language's word in its
//             translation (`de`, a pattern), and a message that is the word has the glossary's.
//   names()   the names of the game's things (enemies, rarities, weapons, affixes ...), from the
//             game's own tables: their translation is the catalog's. tools/i18n.mjs checks that
//             the guide's German never calls a thing by its English name where it has a German one.
// What stays the same in every language: the world names (they are made from the seed and give
// it back: core/names.js), the bosses' names (Gusto, Totnar, Squarlo, Flip, Foggery, Renew), the
// made-up kinds (Stunder, Shraps, Spicy, Wolla, Wolk, Squirtle), "Seed" and "XP".
import { ITEMS } from '../core/items.js';
import { RARITIES } from '../core/gear/rarities.js';
import { AFFIXES } from '../core/gear/affixes.js';
import { ENCHANTS } from '../core/gear/enchants.js';
import { ENEMY_KINDS } from '../core/enemies.js';
import { TRIALS } from '../core/trials.js';

// term: what it is called in the code and the English game (for reading); en / de: the patterns a
// message that uses it matches in each language (case-insensitive); word: the word itself, for
// whoever translates; except: messages that say it otherwise on purpose (the English text)
const term = (id, words, note, { en, de, except = [] } = {}) => ({ id, ...words, note,
  en: en ?? new RegExp(`\\b${words.word.en}`, 'i'), de: de ?? new RegExp(words.word.de, 'i'), except });
export const GLOSSARY = [
  // the world
  term('cube', { word: { en: 'cube', de: 'Würfel' }, g: 'm' }, 'one room of the world: 16 by 16 cells, stacked in layers'),
  term('depth', { word: { en: 'depth', de: 'Tiefe' }, g: 'f' }, 'how far down a cube is: 0 is the road out of town, 20 the deepest',
    { en: /\bdepths?\b/i, de: /tiefe/i }),
  term('town', { word: { en: 'town', de: 'Stadt' }, g: 'f' }, 'the cube at the top of every world, where the villagers live',
    { en: /\btown\b/i, de: /stadt/i }),
  term('merchant camp', { word: { en: 'merchant camp', de: 'Händlerlager' }, g: 'n' }, 'beside the town: the Alchemist and the Enchanter'),
  term('world', { word: { en: 'world', de: 'Welt' }, g: 'f' }, 'all the cubes one seed makes', { en: /\bworlds?\b/i }),
  term('seed', { word: { en: 'seed', de: 'Seed' }, g: 'm' }, 'the number a world is made from; stays "Seed" in German, like in the guide',
    { en: /\bseed\b/i }),
  term('portal', { word: { en: 'portal', de: 'Portal' }, g: 'n' }, 'a way from one cube to another, and the scrolls that open one'),
  term('well', { word: { en: 'well', de: 'Brunnen' }, g: 'm' }, 'the way down to the next depth, at the end of the route', { en: /\bthe well\b/i }),
  term('trial room', { word: { en: 'trial room', de: 'Prüfungsraum' }, g: 'm' }, 'a room with an event or a puzzle that bars the way; "Prüfung" alone is a test of the code in the guide',
    { en: /\btrial rooms?\b/i, de: /prüfungsr(a|ä)um/i }),
  // who is there
  term('hero', { word: { en: 'hero', de: 'Held' }, g: 'm' }, 'the character you play', { en: /\bhero\b/i, de: /held/i }),
  term('enemy', { word: { en: 'enemy', de: 'Monster' }, g: 'n' }, 'anything that fights you; always "Monster", never "Gegner" (the guide says Monster)',
    { en: /\benem(y|ies)\b/i, de: /monster/i }),
  term('guardian', { word: { en: 'guardian', de: 'Wächter' }, g: 'm' }, 'a strong enemy that keeps a gate shut until it is defeated; "Wächter-Spinne" for a Guardian Spider',
    { en: /\bguardians?\b/i, de: /wächter/i }),
  term('Temp Boss', { word: { en: 'Temp Boss', de: 'Temp-Boss' }, g: 'm' }, 'the guardian of a well, standing in for a boss to come; "Temp-Boss-Spinne"',
    { en: /\bTemp Boss\b/i, de: /Temp-Boss/i }),
  term('boss', { word: { en: 'boss', de: 'Boss' }, g: 'm' }, 'a real boss: Gusto, Totnar, Squarlo, Flip, Foggery, Renew (their names stay)',
    { except: ['A painted round shield with an iron boss.'] }),
  term('horde', { word: { en: 'horde', de: 'Horde' }, g: 'f' }, 'many enemies of one kind, asleep in their camp until woken'),
  term('villager', { word: { en: 'villagers', de: 'Leute in der Stadt' }, g: 'pl' }, 'the people of the town who give quests and trade',
    { en: /\bvillagers?\b/i, de: /leute|bewohner/i }),
  term('host', { word: { en: 'host', de: 'Gastgeber' }, g: 'm' }, 'who opens their world to friends; the others are guests (Gäste)', { en: /\bhost(ing)?\b/i, de: /gastgeber|welt öffnen|welt schließen/i }),
  term('Enchanter', { word: { en: 'Enchanter', de: 'Verzauberin' }, g: 'f' }, 'she enchants weapons in the merchant camp', { en: /\bEnchanter\b/ }),
  term('Smith', { word: { en: 'Smith', de: 'Schmied' }, g: 'm' }, 'he sells armor and re-rolls affixes', { en: /\bSmith\b/ }),
  // playing
  term('level', { word: { en: 'level', de: 'Level' }, g: 'n' }, 'how strong the hero (or an enemy) is; "Level" in German too (das Level), and "Lv" for short; never "Stufe"',
    { en: /\b(level|lv)\b/i, de: /level|\bLv\b/i }),
  term('XP', { word: { en: 'XP', de: 'XP' } }, 'experience; "Erfahrung" in a sentence, "XP" in numbers', { en: /\bXP\b/, de: /XP|Erfahrung/ }),
  term('health', { word: { en: 'health', de: 'Gesundheit' }, g: 'f' }, 'what blows take away; "HP" is "Leben" in the short numbers',
    { en: /\bhealth\b/i, de: /gesund|heil/i, except: ['Wear it in good health.'] }),
  term('damage', { word: { en: 'damage', de: 'Schaden' }, g: 'm' }, 'what a hit takes off', { en: /\bdamage\b/i }),
  term('quest', { word: { en: 'quest', de: 'Auftrag' }, g: 'm', pl: 'Aufträge' }, 'a task a villager gives you; never "Quest" in German', { en: /\bquests?\b/i, de: /auftr(a|ä)g/i }),
  term('chronicle', { word: { en: 'chronicle', de: 'Chronik' }, g: 'f' }, 'the lines in the chat box of what happened'),
  // things
  term('loot', { word: { en: 'loot', de: 'Beute' }, g: 'f' }, 'what enemies and chests drop'),
  term('bag', { word: { en: 'bag', de: 'Tasche' }, g: 'f' }, 'where the hero carries things: 24 slots', { en: /\bbag\b/i, except: ['Feed bag'] }),
  term('inventory', { word: { en: 'inventory', de: 'Inventar' }, g: 'n' }, 'the panel with the bag, the hero and the quests'),
  term('quick bar', { word: { en: 'quick bar', de: 'Schnellleiste' }, g: 'f' }, 'the six slots at the bottom, keys 1 to 6'),
  term('rarity', { word: { en: 'rarity', de: 'Seltenheit' }, g: 'f' }, 'how good a weapon or armor is, from Crap (Schrott) to OMG'),
  term('item level', { word: { en: 'item level', de: 'Gegenstandslevel' }, g: 'n' }, 'how strong an item is: the depth it dropped at',
    { en: /\bitem level\b/i, de: /gegenstandslevel/i }),
  term('affix', { word: { en: 'affix', de: 'Affix' }, g: 'n' }, 'a line of bonus on an item ("Pointy": +5 damage)'),
  term('enchantment', { word: { en: 'enchantment', de: 'Verzauberung' }, g: 'f' }, 'what the Enchanter puts on a weapon: Toasty (Knusprig) ...',
    { en: /\benchant/i, de: /verzauber/i }),
  term('armor', { word: { en: 'armor', de: 'Rüstung' }, g: 'f' }, 'what the hero wears in four slots: head, body, off hand, feet'),
  term('weapon', { word: { en: 'weapon', de: 'Waffe' }, g: 'f' }, 'sword, flail (Flegel), bow (Bogen), crossbow (Armbrust), staff (Stab)'),
  term('chest', { word: { en: 'chest', de: 'Truhe' }, g: 'f' }, 'a treasure chest', { en: /\bchests?\b/i, de: /truhe/i }),
  term('potion', { word: { en: 'potion', de: 'Trank' }, g: 'm', pl: 'Tränke' }, 'something to drink: a health potion is a "Heiltrank"',
    { en: /\bpotions?\b/i, de: /tr(a|ä)nk/i }),
  term('coins', { word: { en: 'coins', de: 'Münzen' }, g: 'pl' }, 'gold, silver and copper (Gold, Silber, Kupfer): 1 gold is 100 silver, 1 silver 10 copper',
    { en: /\bcoins?\b/i, de: /münze/i }),
];

// The names of the game's things, in English (the catalogs have their translations): what the
// guide must call them by in every language.
export function names() {
  return [...new Set([
    ...RARITIES.map(r => r.name),
    ...AFFIXES.map(a => a.name),
    ...ENCHANTS.map(e => e.name),
    ...Object.values(ITEMS).map(i => i.name),
    ...Object.values(ENEMY_KINDS).filter(k => !k.baseLabel).map(k => k.label),
    ...Object.values(TRIALS).map(t => t.name),
    'Guardian', 'Temp Boss',
  ])];
}
