// What the Teacher is told about the page with every message from the reader, without being asked:
// where they are, what they did since their last message (slides, rooms, demo buttons and
// sliders), text they selected, the demos on their slide and the game window. The slide's text
// and the room's slides are only sent again when they changed: the last message's snapshot is
// kept in its "tutor.ask" entry (agent.js), so this survives a reload.
import * as nav from '../nav.js';
import * as page from './page.js';
import * as game from './game.js';
import { fingerprint } from '../refs.js';

const MAX_EVENTS = 40;
let events = [];                 // { at, text, n }
let selection = null;            // { text, at } the last text the reader selected in the page
let since = Date.now();          // the last message

function note(text) {
  const last = events.at(-1);
  if (last?.text === text) { last.n++; return; }
  events.push({ at: Date.now(), text, n: 1 });
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
}
const label = el => {
  if (!el) return 'it';
  if (el.tagName === 'CANVAS') return 'the picture';
  const t = (el.getAttribute('aria-label') || el.title || el.textContent || el.value || el.tagName).replace(/\s+/g, ' ').trim();
  return `"${t.slice(0, 40)}"`;
};
const demoOf = el => el?.closest?.('main [data-demo]');

let tracking = false;
export function track() {
  if (tracking) return;
  tracking = true;
  let slide = null;
  addEventListener('guide:page', e => { slide = null; note(`opened ${e.detail.file}`); });
  addEventListener('guide:slide', e => { if (e.detail.id !== slide) note(`looked at slide #${slide = e.detail.id}`); });
  document.addEventListener('click', e => {
    const d = demoOf(e.target);
    if (d) note(`demo "${d.dataset.demo}": clicked ${label(e.target.closest('button, a, canvas, label, [role=button]') ?? e.target)}`);
  }, true);
  document.addEventListener('change', e => {
    const d = demoOf(e.target), c = e.target;
    if (!d) return;
    const name = (c.closest('label')?.textContent ?? c.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const value = c.type === 'checkbox' ? (c.checked ? 'on' : 'off') : c.tagName === 'SELECT' ? c.selectedOptions[0]?.textContent : c.value;
    note(`demo "${d.dataset.demo}": set ${name || c.type} to ${value}`);
  }, true);
  document.addEventListener('selectionchange', () => {
    const sel = getSelection(), text = sel?.toString().trim();
    if (text && document.querySelector('main')?.contains(sel.anchorNode)) selection = { text: text.slice(0, 800), at: Date.now() };
  });
  game.onChange(() => note(game.isOpen() ? 'opened the game window' : 'closed the game window'));
}

const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// the <page> block for the next message, and what to remember of it; `last` is the previous
// message's remembered snapshot
export function pageState(last, lang) {
  const file = nav.here(), info = page.roomInfo(file, lang), s = page.currentSlide(), all = page.slidesOf(document);
  const lines = [];
  const title = s && ((s.querySelector(`h2[lang=${lang}]`) ?? s.querySelector('h2'))?.textContent.trim());
  lines.push(`where: ${info ? `room ${info.index}/${info.count} "${info.title}" (${file})` : file}` +
    (s ? `, slide ${all.indexOf(s) + 1}/${all.length} #${s.id} "${title}" (Lv ${s.dataset.lv})` : ''));
  lines.push(`reader: picked detail Lv ${page.pickedLevel()}, page in ${lang === 'de' ? 'German' : 'English'}` +
    (all.length ? `, ${document.body.classList.contains('scroll') ? 'one long page' : 'slides'}` : ''));
  if (selection && selection.at > since) lines.push(`selected text: "${selection.text}"`);
  if (events.length) lines.push('since the last message (minutes:seconds ago):\n' +
    events.map(e => `- ${clock(Date.now() - e.at)} ${e.text}${e.n > 1 ? ` (\u00D7${e.n})` : ''}`).join('\n'));
  for (const d of s?.querySelectorAll('[data-demo]') ?? []) {
    const state = d.dataset.mounted ? page.demoState(d) : 'not opened yet';
    lines.push(`demo "${d.dataset.demo}" on this slide: ${state}`);
  }
  if (game.isOpen()) lines.push(`game window: ${game.summary()}`);
  if (info && last?.room !== file) lines.push(`slides of this room:\n${page.outline(document, lang).map(o => `${o.n}. #${o.id} (Lv ${o.lv}) ${o.title}${o.demo ? ` [demo: ${o.demo}]` : ''}`).join('\n')}`);
  const text = s ? page.slideText(s, lang) : '';
  const hash = fingerprint(text);
  if (s) lines.push(last?.room === file && last?.slide === s.id && last?.hash === hash ? 'the slide: as in an earlier message' : `the slide's text:\n${text}`);
  else if (file !== last?.room) lines.push(`the page's text:\n${(document.querySelector('main')?.innerText ?? '').slice(0, 3000)}`);
  return { text: `<page>\n${lines.join('\n')}\n</page>`, data: { room: file, slide: s?.id ?? null, hash } };
}

// the message went out: start collecting anew
export function sent() {
  events = [];
  since = Date.now();
}
