// Generated item names. Every rarity gets one; the better the item, the grander the name:
//   crap:          a sad word and the base                "Soggy Long Sword"
//   shitty:        a worn word and the base               "Wonky Long Sword"
//   vanilla:       a plain word and the base              "Sensible Long Sword"
//   unremarkable:  a lukewarm word and the base           "Perfectly Fine Long Sword"
//   decent:        two words                              "Sneaky Nibbler"
//   unusual:       a compound                             "Goblinbotherer"
//   remarkable:    a compound and a title                 "Frostbite the Mildly Cursed"
//   fabled:        a compound and an epithet              "Grimfang, Eater of Lunches"
//   impossible:    a compound and an impossible epithet   "Doomsong, That Should Not Be"
//   omg:           an old root, compound and epithet      "Ur-Stormreaver, Mother of All Pointy Things"
// The base type is always shown with it (in the UI), except where it is part of the name.
// Mostly earnest words, with a few sillier ones mixed in.
const CRAP = ['Soggy', 'Wobbly', 'Chewed', 'Lopsided', 'Mouldy', 'Squeaky', 'Rusty', 'Bent', 'Sad', 'Damp'];
const SHITTY = ['Dented', 'Chipped', 'Dull', 'Wonky', 'Borrowed', 'Discount', 'Secondhand', 'Creaky', 'Scuffed',
  'Questionable'];
const VANILLA = ['Iron', 'Sturdy', 'Militia', 'Plain', 'Standard', 'Regular', 'Trusty', 'Everyday', 'Sensible', "Guard's"];
const MEH = ['Perfectly Fine', 'Adequate', 'Serviceable', 'Okay-ish', 'Nondescript', 'Beige', 'Forgettable',
  'Unobjectionable'];
const ADJ = ['Bright', 'Keen', 'Grim', 'Grumpy', 'Polite', 'Sneaky', 'Jolly', 'Cheeky', 'Snappy', 'Bitter', 'Wild', 'Cold'];
const NOUN = ['Fang', 'Thorn', 'Sting', 'Whisper', 'Promise', 'Nibbler', 'Tickler', 'Bonk', 'Elbow', 'Wink', 'Hiccup',
  'Claw'];
const ROOT = ['Grim', 'Dusk', 'Storm', 'Frost', 'Ash', 'Blood', 'Night', 'Dawn', 'Gloom', 'Star', 'Bone', 'Ember',
  'Raven', 'Thorn', 'Wolf', 'Hollow', 'Iron', 'Doom', 'Sun', 'Void', 'Goblin', 'Badger', 'Toad', 'Moth', 'Grumble'];
const TAIL = ['fang', 'bane', 'bite', 'brand', 'edge', 'reaver', 'cleaver', 'thorn', 'song', 'fall', 'shard',
  'caller', 'render', 'splitter', 'whisper', 'sting', 'nibbler', 'bonker', 'muncher', 'botherer', 'tickler'];
const TITLE = ['the Bold', 'the Restless', 'the Patient', 'the Grim', 'the Eager', 'the Polished', 'the Mildly Cursed',
  'the Adequately Feared', 'the Well-Meaning', 'the Surprisingly Heavy', 'the Second Best', 'the Unwashed'];
const EPITHET = ['the Last Oath', 'the Unbroken', 'Warden of Depths', 'the Hungering', 'Kingslayer', 'Heart of Ash',
  'Breaker of Gates', 'the Lantern', 'Eater of Lunches', 'Bane of Knees', 'Ruin of Tuesdays', 'the Slightly Haunted',
  'Who Hums in the Dark'];
const IMPOSSIBLE = ['That Should Not Be', 'the Unexplainable', 'Defier of Arithmetic', "Physics' Regret",
  'Breaker of Rules', 'the Paradox', 'the Ninth Hour', 'Who Was Never Forged'];
const OLD = ['Ur-', 'Elder ', 'First ', 'Primal ', 'Mega-'];
const OMG = ['Bane of Kings', 'Who Was Before', 'the World-Root', 'Eye of the Abyss', 'Last of the First Forge',
  'the Sleeping Star', 'Mother of All Pointy Things', 'Ender of Arguments', 'the Absolute Unit'];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
function compound(rng) {   // never "Thornthorn" or "Boneedge"
  const root = pick(ROOT, rng), end = root.at(-1).toLowerCase();
  return root + pick(TAIL.filter(t => t !== root.toLowerCase() && t[0] !== end), rng);
}

// learn: loot.html#affixes (see learn/README.md)
export function itemName(rarity, baseName, rng) {
  switch (rarity) {
    case 'crap': return `${pick(CRAP, rng)} ${baseName}`;
    case 'shitty': return `${pick(SHITTY, rng)} ${baseName}`;
    case 'vanilla': return `${pick(VANILLA, rng)} ${baseName}`;
    case 'unremarkable': return `${pick(MEH, rng)} ${baseName}`;
    case 'decent': return `${pick(ADJ, rng)} ${pick(NOUN, rng)}`;
    case 'unusual': return compound(rng);
    case 'remarkable': return `${compound(rng)} ${pick(TITLE, rng)}`;
    case 'fabled': return `${compound(rng)}, ${pick(EPITHET, rng)}`;
    case 'impossible': return `${compound(rng)}, ${pick(IMPOSSIBLE, rng)}`;
    default: return `${pick(OLD, rng)}${compound(rng)}, ${pick(OMG, rng)}`;
  }
}
// whether the name already says what the item is (no base line needed under it)
const NAMES_BASE = new Set(['crap', 'shitty', 'vanilla', 'unremarkable']);
export const namesBase = rarity => NAMES_BASE.has(rarity);
