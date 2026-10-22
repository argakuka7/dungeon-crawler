// German grammar for the messages (src/i18n/i18n.js): a noun's article and case, its plural, the
// pronoun for it. A noun in the catalog says what it needs:
//   'Lantern': { text: 'Laterne', g: 'f', pl: 'Laternen' }
//   g: 'm', 'f', 'n' or 'pl' (only plural: 'Feuerwerk' is n, 'Mehlsäcke' pl); pl: the plural
//   (default: the word); dat: the dative plural, where it is not pl + n; obl: a weak noun's
//   singular outside the nominative ('Oktonaut': 'den Oktonauten', 'einem Oktonauten')
//
// A form is said by its masculine word, which names the case:
//   der den dem des           the definite article (nominative, accusative, dative, genitive)
//   ein einen einem eines     the indefinite one (plural: none)
//   kein keinen keinem        and mein, dein, sein, ihr, unser, euer the same way
//   dieser diesen diesem      'this'
//   er ihn ihm                the pronoun for it (er / sie / es / sie)
//   pl                        the plural, without an article
//   cap                       the word with its first letter up (at the start of a sentence)
// So 'Finde {thing:den}' is 'Finde den Kompass', 'Finde die Laterne', 'Finde das Seil'.
// A name (a person, a bounty) takes no article: 'Finde Ada'.

const G = { m: 0, f: 1, n: 2, pl: 3 };
const CASES = { nom: 0, acc: 1, dat: 2, gen: 3 };
const DEFINITE = [['der', 'die', 'das', 'die'], ['den', 'die', 'das', 'die'], ['dem', 'der', 'dem', 'den'], ['des', 'der', 'des', 'der']];
// endings of ein, kein, mein ... and of dieser, by case and gender
const EIN = [['', 'e', '', 'e'], ['en', 'e', '', 'e'], ['em', 'er', 'em', 'en'], ['es', 'er', 'es', 'er']];
const DIES = [['er', 'e', 'es', 'e'], ['en', 'e', 'es', 'e'], ['em', 'er', 'em', 'en'], ['es', 'er', 'es', 'er']];
const PRONOUN = [['er', 'sie', 'es', 'sie'], ['ihn', 'sie', 'es', 'sie'], ['ihm', 'ihr', 'ihm', 'ihnen']];
const EIN_WORDS = ['ein', 'kein', 'mein', 'dein', 'sein', 'ihr', 'unser', 'euer'];
const ENDING_CASE = { '': 'nom', en: 'acc', em: 'dat', es: 'gen' };

// every form by name: { kind, case }
const FORMS = {};
['der', 'den', 'dem', 'des'].forEach((f, c) => { FORMS[f] = { kind: 'def', c }; });
for (const w of EIN_WORDS) for (const [end, c] of Object.entries(ENDING_CASE)) {
  // 'euer' + 'en' is 'euren'
  FORMS[w === 'euer' && end ? `eur${end}` : w + end] = { kind: 'ein', stem: w, c: CASES[c] };
}
['dieser', 'diesen', 'diesem', 'dieses'].forEach((f, c) => { FORMS[f] = { kind: 'dies', c }; });
['er', 'ihn', 'ihm'].forEach((f, c) => { FORMS[f] = { kind: 'pron', c }; });

const plural = n => (n.g === 'pl' ? n.word : n.pl ?? n.word);
// the noun itself in a case: only the dative plural changes ('den Kindern')
function word(n, c) {
  if (n.g !== 'pl') return c > 0 && n.obl ? n.obl : n.word;
  if (c !== 2) return plural(n);
  return n.dat ?? (/[ns]$/.test(plural(n)) ? plural(n) : `${plural(n)}n`);
}

export const grammar = {
  form(n, name) {
    if (name === 'pl') return plural(n);
    if (name === 'cap') return n.word.charAt(0).toUpperCase() + n.word.slice(1);
    const f = FORMS[name];
    if (!f) throw new Error(`Unknown German form: ${name}`);
    const g = G[n.g] ?? 2;
    if (f.kind === 'pron') return PRONOUN[f.c][n.proper ? (G[n.g] ?? 0) : g];
    if (n.proper) return n.word;
    const w = word(n, f.c);
    if (f.kind === 'def') return `${DEFINITE[f.c][g]} ${w}`;
    if (f.kind === 'dies') return `dies${DIES[f.c][g]} ${w}`;
    if (f.stem === 'ein' && g === 3) return w;   // 'ein' has no plural: 'Feuerwerk', 'Mehlsäcke'
    const end = EIN[f.c][g];
    return `${f.stem === 'euer' && end ? 'eur' : f.stem}${end} ${w}`;
  },
  forms: ['pl', 'cap', ...Object.keys(FORMS)],
};
