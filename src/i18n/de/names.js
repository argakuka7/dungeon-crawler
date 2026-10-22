// Generated item names in German (core/gear/names.js): a word for each English one, in the same
// order (tools/i18n.mjs checks the lists line up), and how they go together. German adjectives
// take the gender of the noun they stand before ("Matschiges Langschwert", "Matschige Armbrust",
// "Matschiger Bogen"), so an adjective is kept as its stem ('Matschig') and gets its ending here;
// a noun of its own has its gender after a colon ('Zahn:m'). The compounds ("Grimmzahn") are all
// masculine, so their titles say "der".

const words = {
  CRAP: ['Matschig', 'Wackelig', 'Angekaut', 'Schief', 'Schimmlig', 'Quietschig', 'Rostig', 'Verbogen', 'Traurig', 'Klamm'],
  SHITTY: ['Verbeult', 'Angeschlagen', 'Stumpf', 'Krumm', 'Geliehen', 'Billig', 'Gebraucht', 'Knarzig', 'Zerkratzt', 'Fragwürdig'],
  VANILLA: ['Eisern', 'Robust', 'Wehrhaft', 'Schlicht', 'Üblich', 'Normal', 'Treu', 'Alltäglich', 'Vernünftig', 'Bewährt'],
  MEH: ['Völlig ordentlich', 'Ausreichend', 'Brauchbar', 'Leidlich', 'Unscheinbar', 'Beig', 'Unspektakulär', 'Einwandfrei'],
  ADJ: ['Hell', 'Scharf', 'Grimmig', 'Mürrisch', 'Höflich', 'Hinterlistig', 'Fröhlich', 'Frech', 'Schnippisch', 'Bitter', 'Wild', 'Kalt'],
  NOUN: ['Zahn:m', 'Dorn:m', 'Stachel:m', 'Flüstern:n', 'Versprechen:n', 'Knabberer:m', 'Kitzler:m', 'Bums:m', 'Ellbogen:m',
    'Zwinkern:n', 'Schluckauf:m', 'Klaue:f'],
  ROOT: ['Grimm', 'Dämmer', 'Sturm', 'Frost', 'Aschen', 'Blut', 'Nacht', 'Morgen', 'Düster', 'Stern', 'Knochen', 'Glut', 'Raben',
    'Dornen', 'Wolfs', 'Hohl', 'Eisen', 'Unheil', 'Sonnen', 'Leeren', 'Kobold', 'Dachs', 'Kröten', 'Motten', 'Grummel'],
  TAIL: ['zahn', 'bann', 'biss', 'brand', 'hieb', 'räuber', 'spalter', 'dorn', 'sang', 'fall', 'splitter', 'rufer', 'reißer',
    'trenner', 'flüsterer', 'stachel', 'knabberer', 'beuler', 'mampfer', 'ärgerer', 'kitzler'],
  TITLE: ['der Kühne', 'der Rastlose', 'der Geduldige', 'der Grimmige', 'der Eifrige', 'der Polierte', 'der leicht Verfluchte',
    'der angemessen Gefürchtete', 'der Wohlmeinende', 'der überraschend Schwere', 'der Zweitbeste', 'der Ungewaschene'],
  EPITHET: ['der Letzte Schwur', 'der Ungebrochene', 'Wächter der Tiefen', 'der Hungrige', 'Königsbezwinger', 'Herz aus Asche',
    'Brecher der Tore', 'die Laterne', 'Fresser der Pausenbrote', 'Fluch der Knie', 'Ruin der Dienstage', 'der leicht Verwunschene',
    'der im Dunkeln summt'],
  IMPOSSIBLE: ['der nicht sein dürfte', 'der Unerklärliche', 'Bezwinger der Mathematik', 'Reue der Physik', 'Brecher der Regeln',
    'das Paradox', 'die neunte Stunde', 'der nie geschmiedet wurde'],
  OLD: ['Ur-', 'Uralter ', 'Erster ', 'Urzeitlicher ', 'Mega-'],
  OMG: ['Fluch der Könige', 'der vor allem war', 'die Weltwurzel', 'Auge des Abgrunds', 'Letzter der Ersten Schmiede',
    'der schlafende Stern', 'Mutter aller spitzen Dinge', 'Beender aller Streitereien', 'das absolute Ungetüm'],
  ARMOR_NOUN: ['Panzer:m', 'Umarmung:f', 'Eimer:m', 'Decke:f', 'Wall:m', 'Versprechen:n', 'Deckel:m', 'Knäuel:n', 'Kuscheln:n',
    'Fell:n', 'Unterschlupf:m', 'Ellbogen:m'],
  ARMOR_TAIL: ['wächter', 'hüter', 'panzer', 'pelz', 'mantel', 'wall', 'turm', 'schleier', 'schutz', 'deckel', 'knuddler',
    'kuschler', 'eimer', 'wärmer'],
  ARMOR_OMG: ['Mutter aller Deckel', 'der Unverrückbare', 'Mauer der Welt', 'der nie verbeult wurde', 'Letzter der Ersten Schmiede',
    'der schlafende Berg', 'Beender aller Streitereien', 'das absolute Ungetüm'],
};

const ENDING = { m: 'er', f: 'e', n: 'es', pl: 'e' };
// an adjective before a noun of gender g, without an article: 'Matschig' -> 'Matschiges' (n)
export const adjective = (stem, g) => stem + (ENDING[g] ?? 'es');
const nounOf = entry => { const [word, g] = entry.split(':'); return { word, g }; };
const word = ([list, i]) => words[list][i];
const SEP = { remarkable: ' ', fabled: ', ', impossible: ', ', omg: ', ' };

// the name from its words (core/gear/names.js wordsOf: { rarity, parts }), the base's noun ({ word,
// g }) and the enchantment's adjective (already German, or null)
function say({ rarity, parts }, base, enchant) {
  let core, g = 'm';
  if (!parts.length) { core = base.word; g = base.g; }
  else if (parts.length === 1) { core = `${adjective(word(parts[0]), base.g)} ${base.word}`; g = base.g; }
  else if (rarity === 'decent') { const n = nounOf(word(parts[1])); core = `${adjective(word(parts[0]), n.g)} ${n.word}`; g = n.g; }
  else {
    const old = parts[0][0] === 'OLD' ? word(parts[0]) : '', rest = old ? parts.slice(1) : parts;
    core = old + word(rest[0]) + word(rest[1]);
    if (rest[2]) core += SEP[rarity] + word(rest[2]);
  }
  return enchant ? `${adjective(enchant, g)} ${core}` : core;
}

export const names = { words, say, adjective };
