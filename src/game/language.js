// The page in the game's language: the words of index.html (src/i18n/dom.js) now, and again when
// the language changes (the settings, game/settings.js). What the code draws itself it draws in
// the language of the moment; the panels that stay open listen to onLanguageChange.
import { onLanguageChange, missing } from '../i18n/i18n.js';
import { translatePage } from '../i18n/dom.js';

translatePage();
onLanguageChange(() => translatePage());
// the translations missing on the way, for the dev tools (window.__game.i18nMissing)
export const missingTranslations = () => [...missing];
