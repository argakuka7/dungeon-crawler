// The game's typefaces for text drawn on a canvas (CSS uses the --font-* variables of
// vendor/fonts/fonts.css): Cinzel for labels and numbers, Crimson Text for words to read.
export const DISPLAY = "'Cinzel', serif";
export const BODY = "'Crimson Text', serif";

// A canvas draws with whatever is loaded at that moment, and the labels are drawn once and kept:
// load the faces they use right away (the main menu comes first, so they are in by the time play starts)
if (typeof document !== 'undefined' && document.fonts) {
  for (const f of [`bold 16px ${DISPLAY}`, `bold 16px ${BODY}`, `16px ${BODY}`]) document.fonts.load(f).catch(() => {});
}
