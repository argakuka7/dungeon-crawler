// The page's own words (index.html): an element marked `data-t` has its text translated, and the
// attributes it names: data-t="title aria-label" (`text` is its content; no value: only that).
// The content may hold markup (<kbd>, <b>); the translation keeps the same tags. Mark only
// elements the code does not fill in itself, and whose children nothing holds on to: the
// content is replaced. The English stays with the element, so a later language starts from it.
import { tr, language } from './i18n.js';

const english = new WeakMap();   // element -> { text, attrs }
export const squash = s => s.replace(/\s+/g, ' ').trim();

export function translatePage(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) {
    let src = english.get(el);
    if (!src) {
      const what = (el.dataset.t || 'text').split(/\s+/).filter(Boolean);
      src = { text: what.includes('text') ? squash(el.innerHTML) : null, attrs: {} };
      for (const a of what) if (a !== 'text' && el.hasAttribute(a)) src.attrs[a] = el.getAttribute(a);
      english.set(el, src);
    }
    if (src.text) el.innerHTML = tr(src.text);
    for (const [a, v] of Object.entries(src.attrs)) el.setAttribute(a, tr(v));
  }
  if (root === document) document.documentElement.lang = language();
}
