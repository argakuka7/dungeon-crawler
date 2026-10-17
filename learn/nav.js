// The guide as one long-lived page: a link to another page of the guide swaps the page's <main>
// (and its title and theme) instead of loading a new page, so whatever lives outside <main> keeps
// running across rooms: the Teacher (tutor/) and the game window. Every page is still a whole HTML
// file, so a reload, a deep link or a browser without scripts work as before.
//
// deck.js starts the router and registers what to do when a page is left and entered. Scripts in
// the fetched pages do not run; deck.js knows how to set up every kind of page.
const LEARN = new URL('./', import.meta.url);
const pages = new Map();   // url -> promise of the page's HTML (also filled by hovering a link)
const hooks = { leave: [], enter: [] };
let shown = null;          // the path of the page on screen
let ticket = 0;            // the newest navigation wins

export const here = () => (globalThis.location?.pathname.split('/').pop()) || 'index.html';
export const onLeave = fn => hooks.leave.push(fn);
export const onEnter = fn => hooks.enter.push(fn);

// a page of the guide (learn/*.html or learn/ itself), not a demo or a file below it
function inGuide(url) {
  if (url.origin !== location.origin || !url.pathname.startsWith(LEARN.pathname)) return false;
  const rest = url.pathname.slice(LEARN.pathname.length);
  return rest === '' || /^[\w-]+\.html$/.test(rest);
}
function fetchPage(url) {
  const key = url.origin + url.pathname;
  if (!pages.has(key)) pages.set(key, fetch(key).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }).catch(e => { pages.delete(key); throw e; }));
  return pages.get(key);
}

// go to a page of the guide (or anywhere else, the normal way); resolves once it is on screen
export async function go(href, { push = true } = {}) {
  const url = new URL(href, location.href);
  if (!inGuide(url)) { location.href = url.href; return; }
  if (url.pathname === shown) {
    // the same page: only the slide changes (deck.js follows the hash)
    if (url.hash !== location.hash) { if (push) location.hash = url.hash; else dispatchEvent(new HashChangeEvent('hashchange')); }
    return;
  }
  const mine = ++ticket;
  let doc;
  try { doc = new DOMParser().parseFromString(await fetchPage(url), 'text/html'); }
  catch { location.href = url.href; return; }
  if (mine !== ticket) return;
  const main = doc.querySelector('main');
  if (!main) { location.href = url.href; return; }
  for (const f of hooks.leave) try { f(); } catch (e) { console.error(e); }
  if (push) history.pushState(null, '', url.href);
  shown = url.pathname;
  const title = doc.querySelector('title');
  if (title) document.querySelector('title')?.replaceWith(document.importNode(title, true));   // deck.js picks the language
  if (doc.body.dataset.theme) document.body.dataset.theme = doc.body.dataset.theme; else delete document.body.dataset.theme;
  document.querySelector('main').replaceWith(document.importNode(main, true));
  scrollTo(0, 0);
  dispatchEvent(new CustomEvent('guide:page', { detail: { file: here() } }));
  for (const f of hooks.enter) try { await f(); } catch (e) { console.error(e); }
}

export function start() {
  shown = location.pathname;
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (!inGuide(url)) return;
    e.preventDefault();
    go(url.href);
  });
  // back and forward between pages (between slides of one page, deck.js follows the hash)
  addEventListener('popstate', () => { if (location.pathname !== shown) go(location.href, { push: false }); });
  // fetch a page while the pointer rests on its link
  document.addEventListener('mouseover', e => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (inGuide(url) && url.pathname !== shown) fetchPage(url).catch(() => {});
  });
}
