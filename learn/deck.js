// The kids' guide engine. Every page imports this. On a room page (<main class="deck">) it turns
// the <section class="slide"> elements into slides:
//   - arrow keys / the quick bar at the bottom move between slides, the URL hash names the slide
//   - each slide has a detail level (data-lv 1..3); the level picker hides deeper slides
//   - S switches between slides and one long scrolling report
//   - [data-demo="name"] loads demos/name.js when it comes into view and calls its default export
//   - <a class="w" href="words.html#seed"> shows the glossary entry when hovered
//   - <pre data-file="..."> gets light syntax colours and a file label
// Pages are bilingual: every text block is a <x lang="en"> / <x lang="de"> pair and lang.js
// shows one of them (attributes: data-de-alt, data-de-title ... replace alt, title ... in German).
//   - <pre data-code="src/x.js#name"> shows that definition, read live from the game's code
//   - <b data-val="src/x.js#NAME.field"> shows that value, read live from the game's code
//   - <span data-name="Spider"> shows the game's name for that thing in the page's language (the
//     game's own catalogs, src/i18n/: the guide and the game call things the same)
//     (demos can show live code too: set data-code on a <pre> and call liveCode)
//   - slides that stamps.json lists as outdated get a note (tools/learn.mjs, README.md)
//   - the Teacher, a tutor to ask about the room, in a side panel (tutor/tutor.js)
// The guide is one long-lived page (nav.js): links between its pages swap <main>, so this module
// runs once; enter() sets up each page as it comes, leave() takes it down again.
import { DECKS, LEVELS, THEME_NAMES, THEME_NAMES_DE, local, iconUrl } from './decks.js';
import { parseRefs, extract, readValue, formatValue } from './refs.js';
import * as nav from './nav.js';
// the game's words, in the guide's language (it reads <html data-lang>, set by lang.js)
import { tr } from '../src/i18n/i18n.js';

const store = {
  get: (k, d) => { try { return localStorage.getItem('kids.' + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('kids.' + k, v); } catch { /* private mode */ } },
};

// ---- language ---------------------------------------------------------------------------------
export const lang = document.documentElement.dataset.lang === 'de' ? 'de' : 'en';
// t('text', 'Text'): the English or the German, for the page's language
export const t = (en, de) => lang === 'de' ? de : en;
// a game theme's name (src/themes/) as the game says it; by its key (decks.js THEME_NAMES): themeName
export const themeLabel = theme => tr(theme.name);
export const themeName = key => (lang === 'de' && THEME_NAMES_DE[key]) || tr(THEME_NAMES[key] ?? key);
// the name of a thing of the game ('Spider', 'Unusual'), as the game says it in the guide's language
export const gameName = name => tr(name);
// the element of a language pair (or a single element) that is showing
export const shown = (root, sel) => root.querySelector(`${sel}[lang=${lang}]`) ?? root.querySelector(sel);
// German attributes and title
function localize(root) {
  if (lang !== 'de') return;
  for (const el of root.querySelectorAll('*')) for (const a of [...el.attributes])
    if (a.name.startsWith('data-de-')) el.setAttribute(a.name.slice(8), a.value);
  const title = document.querySelector('title[data-de]');
  if (title) document.title = title.dataset.de;
}
function langSwitch(into) {
  const b = document.createElement('button');
  b.className = 'langsw';
  b.textContent = lang === 'de' ? 'EN' : 'DE';
  b.title = lang === 'de' ? 'Switch to English' : 'Auf Deutsch lesen';
  b.onclick = () => { store.set('lang', lang === 'de' ? 'en' : 'de'); location.reload(); };
  into.append(b);
}
export const level = () => +store.get('lv', 3);
export const visited = () => new Set(JSON.parse(store.get('visited', '[]')));

// ---- the night sky behind everything (like the game's backdrop and glass cube) ---------------
function stars() {
  const c = document.createElement('canvas');
  c.id = 'stars';
  document.body.prepend(c);
  const draw = () => {
    const w = c.width = innerWidth * devicePixelRatio, h = c.height = innerHeight * devicePixelRatio, g = c.getContext('2d');
    let s = 1234567;
    const r = () => ((s = Math.imul(s ^ s >>> 15, 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.6})`;
      const z = (r() < 0.9 ? 1 : 2) * devicePixelRatio;
      g.fillRect(r() * w, r() * h, z, z);
    }
    // a faint glass cube, as the game draws around every cube
    const cx = w / 2, cy = h * 0.52, a = Math.min(w, h) * 0.42, b = a * 0.5, hh = a * 0.95;
    const top = [[cx, cy - b - hh / 2], [cx + a, cy - hh / 2], [cx, cy + b - hh / 2], [cx - a, cy - hh / 2]];
    const bot = top.map(([x, y]) => [x, y + hh]);
    g.strokeStyle = 'rgba(200,215,235,0.07)'; g.lineWidth = devicePixelRatio;
    g.beginPath();
    for (const ring of [top, bot]) { g.moveTo(...ring[3]); for (const p of ring) g.lineTo(...p); }
    for (let i = 0; i < 4; i++) { g.moveTo(...top[i]); g.lineTo(...bot[i]); }
    g.stroke();
  };
  draw();
  addEventListener('resize', draw);
}

// ---- small helpers ---------------------------------------------------------------------
const esc = s => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
// a tiny highlighter: comments, strings, keywords and numbers (good enough for short excerpts)
export function highlight(pre) {
  const code = pre.querySelector('code') || pre;
  const src = code.textContent.replace(/^\n/, '').replace(/\s+$/, '');
  const re = /(\/\/[^\n]*|#[^\n{]*$)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`)|\b(const|let|var|function|return|if|else|for|while|new|export|import|from|of|in|class|this|true|false|null|continue|break|def|await|async)\b|(\b\d+(?:\.\d+)?\b)/gm;
  let out = '', last = 0;
  for (const m of src.matchAll(re)) {
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(src.slice(last));
  code.innerHTML = label(pre) + out;
}
// the file label over a code block: data-label, else the files and names it shows
function label(pre) {
  const live = pre.dataset.code != null, refs = parseRefs(pre.dataset.code ?? pre.dataset.src);
  const byFile = new Map();
  for (const r of refs) byFile.set(r.path, [...(byFile.get(r.path) ?? []), ...(r.name && r.name !== 'header' ? [r.name] : [])]);
  const text = pre.dataset.label ?? [...byFile].map(([f, names]) => names.length ? `${f} \u00B7 ${names.join(', ')}` : f).join('  +  ');
  if (!text) return '';
  return `<span class="file">${esc(text)}${live ? ` <span class="live" title="${t('Read from the game\'s code right now', 'Gerade eben aus dem Code des Spiels gelesen')}">${t('LIVE', 'LIVE')}</span>`
    : refs.length && !pre.dataset.label ? ` <span class="excerpt">${t('excerpt', 'Auszug')}</span>` : ''}</span>`;
}

// ---- live code and values from the game ----------------------------------------------------------
const ROOT = new URL('../', import.meta.url), sources = new Map();
function source(path) {
  if (!sources.has(path)) sources.set(path, fetch(new URL(path, ROOT)).then(r => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.text();
  }));
  return sources.get(path);
}
const dedent = s => {
  const ls = s.split('\n'), n = Math.min(...ls.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return ls.map(l => l.slice(n)).join('\n');
};
export async function liveCode(pre) {
  try {
    const parts = await Promise.all(parseRefs(pre.dataset.code).map(async r => {
      const e = extract(await source(r.path), r.path, r.name);
      if (e.error) throw new Error(e.error);
      return dedent(e.text);
    }));
    pre.textContent = parts.join('\n\n');
  } catch (err) {
    pre.textContent = t(`// This code could not be read from the game's files: ${err.message}`,
      `// Dieser Code ließ sich nicht aus den Dateien des Spiels lesen: ${err.message}`);
  }
  highlight(pre);
}
// <span data-name="Spider">: the game's name for it, in the guide's language (the written one is
// the English, for when the game cannot be read)
function liveNames(root) {
  for (const el of root.querySelectorAll('[data-name]')) el.textContent = tr(el.dataset.name);
}
async function liveValues(root) {
  for (const el of root.querySelectorAll('[data-val]')) {
    const [path, expr] = el.dataset.val.split('#');
    try {
      const v = readValue(await import(new URL(path, ROOT).href), expr);
      if (v !== undefined) el.textContent = formatValue(v, el.dataset.fmt, el.closest('[lang]')?.lang === 'de' ? 'de' : 'en');
    } catch { /* keep the written value */ }
  }
}
// slides the maintenance tool marked as possibly outdated (tools/learn.mjs --defer)
async function staleNotes(slides) {
  let stamps;
  try { stamps = await (await fetch('stamps.json')).json(); } catch { return; }
  for (const s of slides) {
    const why = stamps.outdated?.[`${nav.here()}#${s.id}`];
    if (why) s.querySelector('h2:last-of-type')?.insertAdjacentHTML('afterend', `<div class="note stale"><b>${t('Heads-up', 'Achtung')}</b> ${t(
      'The game changed since this slide was written, so a detail may be out of date', 'Das Spiel hat sich geändert, seit diese Folie geschrieben wurde, ein Detail ist vielleicht veraltet')} (${esc(why)}).</div>`);
  }
}


// ---- glossary tooltips -----------------------------------------------------------------------
let words = null;
async function loadWords() {
  if (!words) words = fetch('words.html').then(r => r.text()).then(t => new DOMParser().parseFromString(t, 'text/html')).catch(() => null);
  return words;
}
function wordTips() {
  const tip = document.createElement('div');
  tip.id = 'wordtip'; tip.hidden = true;
  document.body.append(tip);
  let active = null;
  const place = e => {
    const x = Math.min(e.clientX + 14, innerWidth - 360), y = e.clientY + 18;
    tip.style.left = x + 'px'; tip.style.top = (y + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 10 : y) + 'px';
  };
  document.addEventListener('mouseover', async e => {
    const a = e.target.closest?.('a.w');
    if (!a || a === active) return;
    active = a;
    const doc = await loadWords(), id = a.hash.slice(1), el = doc?.getElementById(id);
    if (active !== a || !el) return;
    tip.innerHTML = `<b>${esc(shown(el, 'dt').textContent)}</b>${esc(shown(el, 'dd').firstChild.textContent.trim())}`;
    tip.hidden = false; place(e);
  });
  document.addEventListener('mousemove', e => { if (active && !tip.hidden) place(e); });
  document.addEventListener('mouseout', e => {
    if (active && !active.contains(e.relatedTarget)) { active = null; tip.hidden = true; }
  });
}

// ---- demos: loaded when they come into view ----------------------------------------------------
// a demo's default export may return a function (or a promise of one) that stops it when its page is left
// the faces the demos draw with on their canvases (a canvas takes what is loaded when it draws, and some draw once)
let fontsLoaded = null;
const canvasFonts = () => fontsLoaded ??= Promise.all(["bold 16px 'Cinzel'", "16px 'Crimson Text'", "bold 16px 'Crimson Text'"]
  .map(f => document.fonts.load(f))).catch(() => {});

function demos(root, page) {
  const io = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting || target.dataset.mounted) continue;
      target.dataset.mounted = '1';
      io.unobserve(target);
      const box = document.createElement('div');
      box.className = 'loading'; box.textContent = t('loading\u2026', 'lädt\u2026');
      target.append(box);
      Promise.all([import(`./demos/${target.dataset.demo}.js`), canvasFonts()])
        .then(async ([m]) => { box.remove(); const stop = await m.default(target); if (typeof stop === 'function') page.cleanups.push(stop); })
        .catch(err => {
          console.error(err);
          target.append(box);
          box.className = 'err';
          box.textContent = t('This demo did not load: ', 'Diese Demo ließ sich nicht laden: ') + err.message;
        });
    }
  }, { rootMargin: '200px' });
  for (const el of root.querySelectorAll('[data-demo]')) io.observe(el);
  page.cleanups.push(() => io.disconnect());
}
// a demo's animation loop: runs while the demo is on screen, ends when its page is left
export function loop(el, fn) {
  let last = performance.now();
  const tick = now => {
    if (!el.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (el.offsetParent !== null) fn(dt, now / 1000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// a canvas with a fixed drawing size that scales with its box
export function canvas(el, w, h) {
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  c.style.aspectRatio = `${w} / ${h}`;
  el.append(c);
  const g = c.getContext('2d');
  g.scale(2, 2);
  // pointer position in drawing units
  const at = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * w, (e.clientY - r.top) / r.height * h]; };
  return { c, g, w, h, at };
}
// html helper for demo controls
export function html(el, s) { el.insertAdjacentHTML('beforeend', s); return el.lastElementChild; }

// ---- the room page ---------------------------------------------------------------------------------
// what the page's deck offers to others (the Teacher): null on pages without slides
export let controls = null;
function deck(main, page) {
  const { signal } = page.abort, here = nav.here();
  const slides = [...main.querySelectorAll('section.slide')];
  const deckIdx = DECKS.findIndex(d => d.file === here), info = deckIdx >= 0 ? local(DECKS[deckIdx], lang) : null;
  const lvName = L => lang === 'de' ? L.de : L.name;
  slides.forEach((s, i) => {
    s.id ||= 'slide-' + (i + 1);
    s.dataset.lv ||= '1';
    const L = LEVELS[s.dataset.lv];
    s.insertAdjacentHTML('afterbegin', `<span class="tag" title="${t('Detail level', 'Detailstufe')}">${L.short} \u00B7 ${lvName(L)}</span>`);
  });
  // the last slide ends the room: the way on to the next room, or back to the map
  const next = DECKS[deckIdx + 1] && local(DECKS[deckIdx + 1], lang), prev = deckIdx > 0 && local(DECKS[deckIdx - 1], lang);
  if (slides.length) slides.at(-1).insertAdjacentHTML('beforeend', `<nav class="roomend">
    <p class="done">\u2713 ${t('You finished', 'Geschafft')}: <b>${esc(info?.title ?? '')}</b></p>
    <div class="ways">${next ? `<a class="way next" href="${next.file}"><img src="${iconUrl(next)}" alt="">
      <span><small>${t('Next room', 'Nächster Raum')} \u00B7 ${deckIdx + 2}/${DECKS.length}</small><b>${esc(next.title)}</b><i>${esc(next.teaser)}</i></span><em>\u25B8</em></a>`
      : `<p class="last">${t('That was the last room. You have seen the whole guide!', 'Das war der letzte Raum. Du hast den ganzen Rundgang gesehen!')}</p>`}
    <a class="way map" href="index.html"><em>\u25C2</em><span><small>${t('All rooms', 'Alle Räume')}</small><b>${t('Back to the map', 'Zurück zur Karte')}</b></span></a></div></nav>`);

  // top bar
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = `<a href="index.html" title="${t('The map (M)', 'Die Karte (M)')}">\u25C2 ${t('Map', 'Karte')}</a>
    <div class="where">${info ? `${t('Room', 'Raum')} ${deckIdx + 1}/${DECKS.length} \u00B7 <b>${info.title}</b> \u00B7 <i>${t('depth', 'Tiefe')} ${info.depth} \u00B7 ${themeName(info.theme)}</i>` : ''}</div>
    <div class="tools"><span class="lvpick" title="${t('How much detail do you want?', 'Wie viele Details möchtest du?')}">${[1, 2, 3].map(l =>
      `<button data-lv="${l}" style="--c:${LEVELS[l].color}" title="${lvName(LEVELS[l])}">${LEVELS[l].short}</button>`).join('')}</span>
    <button class="mode" title="${t('Slides or one long page (S)', 'Folien oder eine lange Seite (S)')}"></button><button class="helpbtn" title="${t('Keys (?)', 'Tasten (?)')}">?</button></div>`;
  langSwitch(bar.querySelector('.tools'));
  document.body.prepend(bar);
  page.cleanups.push(() => bar.remove());

  // quick bar
  const qbar = document.createElement('nav');
  qbar.className = 'qbar';
  qbar.innerHTML = `${prev ? `<a class="door" href="${prev.file}#end" title="${t('Previous room', 'Voriger Raum')}: ${esc(prev.title)}"><img src="${iconUrl(prev)}" alt=""></a>` : ''}<button class="arrow prev" title="${t('Previous', 'Zurück')} (\u2190)">\u25C2</button><div class="slots">${slides.map((s, i) =>
    `<a class="slot lv${s.dataset.lv}" href="#${s.id}" title="${esc(shown(s, 'h2')?.textContent ?? '')}"><span>${i + 1}</span></a>`).join('')}</div>
    <button class="arrow next" title="${t('Next', 'Weiter')} (\u2192)">\u25B8</button>${next
    ? `<a class="door" href="${next.file}" title="${t('Next room', 'Nächster Raum')}: ${esc(next.title)}"><img src="${iconUrl(next)}" alt=""></a>` : ''}`;
  document.body.append(qbar);
  page.cleanups.push(() => qbar.remove());
  const slots = [...qbar.querySelectorAll('.slot')];

  let cur = 0;
  const allowed = i => +slides[i].dataset.lv <= level();
  function show(i, scroll = true) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => s.classList.toggle('current', j === cur));
    slots.forEach((s, j) => s.classList.toggle('current', j === cur));
    slots[cur].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (location.hash.slice(1) !== slides[cur].id) history.replaceState(null, '', '#' + slides[cur].id);
    if (scroll && document.body.classList.contains('slides')) scrollTo(0, 0);
    // on the last slide, the next arrow leads into the next room; on the first, back arrow into the previous one
    const end = cur === slides.findLastIndex((_, j) => allowed(j)), first = cur === slides.findIndex((_, j) => allowed(j));
    const fwd = qbar.querySelector('.next'), back = qbar.querySelector('.prev');
    fwd.classList.toggle('to-room', end && !!next);
    fwd.title = end && next ? `${t('Next room', 'Nächster Raum')}: ${next.title} (\u2192)` : `${t('Next', 'Weiter')} (\u2192)`;
    back.classList.toggle('to-room', first && !!prev);
    back.title = first && prev ? `${t('Previous room', 'Voriger Raum')}: ${prev.title} (\u2190)` : `${t('Previous', 'Zurück')} (\u2190)`;
    dispatchEvent(new CustomEvent('guide:slide', { detail: { file: here, id: slides[cur].id } }));
  }
  const step = d => {
    for (let i = cur + d; i >= 0 && i < slides.length; i += d) if (allowed(i)) return show(i);
    if (d > 0 && next) nav.go(next.file);   // past the last slide: the next room
    if (d < 0 && prev) nav.go(prev.file + '#end');   // before the first: the previous room, at its end
  };
  function applyLevel() {
    const lv = level();
    bar.querySelectorAll('.lvpick button').forEach(b => b.classList.toggle('on', +b.dataset.lv === lv));
    slides.forEach((s, j) => { const deep = +s.dataset.lv > lv; s.classList.toggle('too-deep', deep); slots[j].classList.toggle('too-deep', deep); });
  }
  function setMode(m) {
    document.body.classList.toggle('scroll', m === 'scroll');
    document.body.classList.toggle('slides', m !== 'scroll');
    bar.querySelector('.mode').textContent = m === 'scroll' ? t('slides', 'Folien') : t('scroll', 'Seite');
    store.set('mode', m);
    if (m === 'scroll') slides[cur].scrollIntoView(); else show(cur);
  }
  bar.querySelectorAll('.lvpick button').forEach(b => b.onclick = () => { store.set('lv', b.dataset.lv); applyLevel(); show(cur, false); });
  bar.querySelector('.mode').onclick = () => setMode(document.body.classList.contains('scroll') ? 'slides' : 'scroll');
  bar.querySelector('.helpbtn').onclick = () => help();
  qbar.querySelector('.prev').onclick = () => step(-1);
  qbar.querySelector('.next').onclick = () => step(1);
  const fromHash = () => {
    // #end: the last slide (coming back from the next room)
    const h = decodeURIComponent(location.hash.slice(1)), i = h === 'end' ? slides.findLastIndex((_, j) => allowed(j)) : slides.findIndex(s => s.id === h);
    if (i < 0) return false;
    if (document.body.classList.contains('scroll')) slides[i].scrollIntoView(); else show(i);
    return true;
  };
  addEventListener('hashchange', fromHash, { signal });
  addEventListener('keydown', e => {
    const t = e.target;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (t.closest?.('input, select, textarea, [contenteditable], [data-keys]')) return;
    if (e.key === '?') { help(); return; }
    if (e.key === 'Escape') { document.getElementById('help')?.remove(); return; }
    if (e.key === 's' || e.key === 'S') { bar.querySelector('.mode').click(); return; }
    if (e.key === 'm' || e.key === 'M') { nav.go('index.html'); return; }
    if (document.body.classList.contains('scroll')) return;
    if (t.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const go = { ArrowRight: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (go) { e.preventDefault(); step(go); }
    if (e.key === 'Home') show(slides.findIndex((_, i) => allowed(i)));
    if (e.key === 'End') show(slides.findLastIndex((_, i) => allowed(i)));
  }, { signal });

  staleNotes(slides);
  applyLevel();
  if (!fromHash()) show(0, false);
  setMode(store.get('mode', 'slides'));
  // the browser jumps to the #slide anchor after loading; a slide starts at the top instead
  if (document.body.classList.contains('slides')) addEventListener('load', () => setTimeout(() => scrollTo(0, 0)), { once: true, signal });
  if (info) { const v = visited(); v.add(info.file); store.set('visited', JSON.stringify([...v])); }
  controls = {
    file: here, slides,
    current: () => slides[cur],
    show: id => { const i = slides.findIndex(s => s.id === id); if (i < 0) return false; if (document.body.classList.contains('scroll')) slides[i].scrollIntoView(); else show(i); return true; },
    setLevel: lv => { store.set('lv', String(lv)); applyLevel(); show(cur, false); },
    setMode: m => setMode(m),
  };
  page.cleanups.push(() => { controls = null; document.body.classList.remove('slides', 'scroll'); });
}

function help() {
  if (document.getElementById('help')) { document.getElementById('help').remove(); return; }
  const h = document.createElement('div');
  h.id = 'help';
  h.innerHTML = t(`<section><h1>Keys</h1><dl>
    <dt><kbd>\u2192</kbd> <kbd>Space</kbd></dt><dd>next slide</dd><dt><kbd>\u2190</kbd></dt><dd>previous slide</dd>
    <dt><kbd>S</kbd></dt><dd>slides or one long page</dd><dt><kbd>M</kbd></dt><dd>back to the map</dd>
    <dt>Lv 1 / 2 / 3</dt><dd>how much detail: Lv 1 is the big idea, Lv 3 shows the real code</dd>
    <dt>dotted words</dt><dd>point at them to see what they mean</dd><dt>DE</dt><dd>read this in German</dd>
    <dt><kbd>?</kbd> <kbd>Esc</kbd></dt><dd>close this</dd></dl></section>`, `<section><h1>Tasten</h1><dl>
    <dt><kbd>\u2192</kbd> <kbd>Leertaste</kbd></dt><dd>nächste Folie</dd><dt><kbd>\u2190</kbd></dt><dd>vorige Folie</dd>
    <dt><kbd>S</kbd></dt><dd>Folien oder eine lange Seite</dd><dt><kbd>M</kbd></dt><dd>zurück zur Karte</dd>
    <dt>Lv 1 / 2 / 3</dt><dd>wie viele Details: Lv 1 ist die große Idee, Lv 3 zeigt den echten Code</dd>
    <dt>gepunktete Wörter</dt><dd>zeig darauf, um zu sehen, was sie bedeuten</dd><dt>EN</dt><dd>auf Englisch lesen</dd>
    <dt><kbd>?</kbd> <kbd>Esc</kbd></dt><dd>schließen</dd></dl></section>`);
  h.onclick = () => h.remove();
  document.body.append(h);
}

// ---- the page on screen: set up as it comes (nav.js), taken down as it goes -------------------------
let page = null;
function enter() {
  page = { abort: new AbortController(), cleanups: [] };
  const main = document.querySelector('main');
  localize(main);
  for (const pre of main.querySelectorAll('pre')) if (pre.dataset.code != null) liveCode(pre); else highlight(pre);
  liveValues(main); liveNames(main);
  if (main.classList.contains('deck')) deck(main, page);
  else {
    const box = document.createElement('div'); box.className = 'langbar'; langSwitch(box); document.body.append(box);
    page.cleanups.push(() => box.remove());
  }
  if (main.querySelector('#map')) import('./map.js').then(m => m.mountMap(main));
  demos(main, page);
}
function leave() {
  page.abort.abort();
  for (const f of page.cleanups.reverse()) try { f(); } catch (e) { console.error(e); }
  document.getElementById('help')?.remove();
  const tip = document.getElementById('wordtip'); if (tip) tip.hidden = true;
}

stars();
wordTips();
enter();
nav.onLeave(leave);
nav.onEnter(enter);
nav.start();
import('./tutor/tutor.js').then(m => m.mount()).catch(err => console.error('tutor:', err));
