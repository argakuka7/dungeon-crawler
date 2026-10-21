// The Teacher: a tutor beside every page of the guide that answers questions about the game by
// asking questions back (prompt.js). deck.js calls mount() once: the guide is one long-lived page
// (nav.js), so the panel and the game window (game.js) stay while the reader moves between rooms.
// The agent itself (agent.js, pi-durable, about 1 MB) loads only when the panel opens, or when a
// page closed in the middle of an answer, so that answer finishes.
//
// Everything is kept in this browser (files.js, IndexedDB). One tab at a time runs the agent:
// it takes a Web Lock, and a second tab offers to take it over.
// ?dev=1 adds a scripted "faux" model for tests and puts the tutor in window.learnTutor.
import { t, lang, highlight } from '../deck.js';
import * as page from './page.js';
import * as state from './state.js';
import * as game from './game.js';
import { md } from './markdown.js';

const VENDOR = '../../vendor/pi-durable/pi-durable.js';
const DB = 'kids-tutor';
const flag = {
  get: k => { try { return localStorage.getItem('kids.tutor.' + k) ?? ''; } catch { return ''; } },
  set: (k, v) => { try { if (v) localStorage.setItem('kids.tutor.' + k, v); else localStorage.removeItem('kids.tutor.' + k); } catch { /* private mode */ } },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dev = new URLSearchParams(location.search).has('dev');

let tutor = null;   // promise of the running tutor (boot)
let ui = null;      // the panel's elements
let chat = null;    // the conversation on screen: { conversation, view }

export function mount() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('tutor.css', import.meta.url).href;
  document.head.append(link);
  const b = document.createElement('button');
  b.id = 'tutor-btn';
  b.title = t('Ask the Teacher', 'Frag den Lehrer');
  b.innerHTML = `<i class="orb"></i><span>${t('Ask', 'Fragen')}</span>`;
  b.onclick = () => ui && !ui.panel.hidden ? close() : open(true);
  document.body.append(b);
  state.track();
  game.restore();
  if (flag.get('open')) open(false);
  else if (flag.get('busy')) boot().catch(() => {});   // finish an answer the last page left running
}

// ---- starting the agent -----------------------------------------------------------------------------
// the Web Lock: resolves once this page holds it, fails with `busy` when another tab holds it (the
// page before this one in the same tab lets go as it closes, so wait a moment); onLost runs when
// another tab takes it over
function lock(steal, onLost) {
  if (!navigator.locks) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = new AbortController(), timer = steal ? 0 : setTimeout(() => abort.abort(), 2500);
    let held = false;
    navigator.locks.request(DB, steal ? { steal: true } : { signal: abort.signal }, () => {
      clearTimeout(timer);
      held = true;
      resolve();
      return new Promise(() => {});   // held while the page lives
    }).catch(() => {
      clearTimeout(timer);
      if (held) onLost();
      else reject(Object.assign(new Error('busy'), { busy: true }));
    });
  });
}

function boot(steal = false) {
  return tutor ??= (async () => {
    const [pi, files, agent, models] = await Promise.all([import(VENDOR), import('./files.js'), import('./agent.js'), import('./models.js')]);
    let volume = null;
    // let go of the storage too, so the other tab can use it (and delete it) freely
    await lock(steal, () => { volume?.close(); failed(t('The Teacher moved to another tab.', 'Der Lehrer ist in einen anderen Tab umgezogen.'), true); });
    volume = await files.idbVolume(DB, { onGone: () => failed(t('The Teacher was reset in another tab.', 'Der Lehrer wurde in einem anderen Tab zurückgesetzt.'), true) });
    const fs = await files.openFiles(volume);
    const faux = dev ? pi.fauxProvider() : null;
    const ms = models.tutorModels(faux ? [faux.provider] : []);
    const opened = await agent.openTutor({ files: fs, models: ms, context: pi.BACKGROUND_CONTEXT });
    opened.harness.closed.then(end => { if (end.reason === 'failed') failed(t('The Teacher stopped: ', 'Der Lehrer hat angehalten: ') + (end.error?.message ?? end.error), true); });
    const T = { ...opened, pi, ctx: pi.BACKGROUND_CONTEXT, models: ms, modelsMod: models, volume, faux };
    if (dev) window.learnTutor = T;
    idleLater(T);
    return T;
  })().catch(e => { tutor = null; throw e; });
}
// remember that work is running, so the next page finishes it even with the panel closed
function idleLater(T) {
  T.harness.waitForIdle(T.ctx).then(() => flag.set('busy', ''), () => {});
}
async function model(T) {
  if (T.faux && flag.get('provider') === 'faux') return { provider: T.faux.provider.id, modelId: T.faux.getModel().id };
  return T.modelsMod.chosenModel();
}

// ---- the panel ----------------------------------------------------------------------------------------
function build() {
  const panel = document.createElement('aside');
  panel.id = 'tutor';
  panel.hidden = true;
  panel.dataset.keys = '1';
  panel.innerHTML = `<header><i class="orb"></i><div><b>${t('The Teacher', 'Der Lehrer')}</b><small class="where"></small></div>
      <button class="play" title="${t('Play the game next to the guide', 'Das Spiel neben dem Rundgang spielen')}">\u25B6 ${t('Game', 'Spiel')}</button>
      <button class="gear" title="${t('Settings', 'Einstellungen')}">\u2699</button><button class="x" title="${t('Close', 'Schließen')}">\u2715</button></header>
    <div class="log" aria-live="polite"></div>
    <div class="sheet" hidden></div>
    <form class="ask"><textarea rows="2" placeholder="${t('Ask a question\u2026', 'Stell eine Frage\u2026')}"></textarea>
      <div class="row"><span class="hint">${t('Enter sends, Shift+Enter a new line', 'Enter schickt ab, Shift+Enter neue Zeile')}</span>
      <button type="button" class="stop" hidden>${t('Stop', 'Stopp')}</button><button type="submit" class="send">${t('Send', 'Senden')}</button></div></form>`;
  document.body.append(panel);
  const $ = s => panel.querySelector(s);
  ui = { panel, log: $('.log'), sheet: $('.sheet'), form: $('.ask'), input: $('textarea'), stop: $('.stop'), send: $('.send'), items: new Map(), notice: null };
  $('.x').onclick = close;
  const where = () => { $('.where').textContent = page.roomInfo(page.here(), lang)?.title ?? (page.here() === 'words.html' ? t('The Word Book', 'Das Wörterbuch') : t('The map', 'Die Karte')); };
  where();
  addEventListener('guide:page', where);
  const play = () => { $('.play').classList.toggle('on', game.isOpen()); };
  play();
  game.onChange(play);
  $('.play').onclick = () => game.isOpen() ? game.close() : game.open({ focus: true }).catch(e => status(esc(e.message), 'bad'));
  $('.gear').onclick = () => ui.sheet.hidden ? settings() : (ui.sheet.hidden = true);
  ui.form.onsubmit = e => { e.preventDefault(); send(ui.input.value); };
  ui.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ui.input.value); }
    if (e.key === 'Escape') close();
  });
  ui.stop.onclick = async () => { const T = await tutor; await chat?.conversation.abort(T.ctx); };
  // links in answers: slides of this page turn the page, other rooms open (nav.js; the panel stays)
  ui.log.addEventListener('click', e => {
    const a = e.target.closest('a[data-slide]');
    if (a) { e.preventDefault(); location.hash = a.dataset.slide; }
    const chip = e.target.closest('button.start');
    if (chip) send(chip.textContent);
  });
}

async function open(focus = true) {
  if (!ui) build();
  ui.panel.hidden = false;
  document.body.classList.add('tutor-open');
  flag.set('open', '1');
  if (focus) ui.input.focus();
  if (chat) return;
  status(t('Waking up the Teacher\u2026', 'Der Lehrer wacht auf\u2026'));
  let T;
  try { T = await boot(); }
  catch (e) {
    if (e.busy) return elsewhere();
    console.error(e);
    return failed(t('The Teacher could not start: ', 'Der Lehrer konnte nicht starten: ') + e.message);
  }
  const { conversation, view } = T;
  chat = { conversation, view };
  status(null);
  render(view.value);
  if (!(await model(T))) setup(T);
  let queued = null;
  view.subscribe(v => { if (!queued) requestAnimationFrame(() => { render(queued); queued = null; }); queued = v; });
}
function close() {
  if (!ui) return;
  ui.panel.hidden = true;
  document.body.classList.remove('tutor-open');
  flag.set('open', '');
}

// a line under the conversation: what is going on, or what went wrong
function status(html, kind = '') {
  ui.notice?.remove();
  ui.notice = null;
  if (html == null || html === false) return;
  ui.notice = document.createElement('div');
  ui.notice.className = 'notice ' + kind;
  ui.notice.innerHTML = html;
  ui.log.append(ui.notice);
  ui.log.scrollTop = ui.log.scrollHeight;
}
function failed(message, reload = false) {
  chat = null;
  if (!ui) return;
  ui.items.clear();
  ui.log.innerHTML = '';
  status(esc(message) + (reload ? `<br><button class="reload">${t('Start it here again', 'Hier neu starten')}</button>` : ''), 'bad');
  ui.notice.querySelector('.reload')?.addEventListener('click', () => location.reload());
}
function elsewhere() {
  status(`${t('The Teacher is busy in another tab of this guide. It can only talk in one tab at a time.', 'Der Lehrer ist gerade in einem anderen Tab dieses Rundgangs. Er kann nur in einem Tab gleichzeitig sprechen.')}
    <br><button class="take">${t('Use it here', 'Hier benutzen')}</button>`, 'bad');
  ui.notice.querySelector('.take').onclick = async () => {
    tutor = null;
    status(t('Waking up the Teacher\u2026', 'Der Lehrer wacht auf\u2026'));
    try { await boot(true); chat = null; open(false); } catch (e) { failed(e.message); }
  };
}

// ---- asking -----------------------------------------------------------------------------------------
async function send(text) {
  text = text.trim();
  if (!text || !chat) return;
  ui.input.value = '';
  status(null);
  const T = await tutor;
  const m = await model(T);
  if (!m) return setup(T);
  flag.set('busy', '1');
  try {
    const submission = await T.ask(text, last => state.pageState(last, lang), m);
    state.sent();
    idleLater(T);
    const done = await submission.wait(T.ctx);
    // a failed answer shows in the transcript already (render)
    const last = chat?.view.value?.entries.at(-1)?.model?.[0];
    if (done.status === 'unanswered' && done.reason === 'aborted' && last?.stopReason !== 'aborted') status(t('(stopped)', '(angehalten)'));
    else if (done.status === 'unanswered' && done.reason !== 'aborted' && last?.stopReason !== 'error')
      status(esc(t('No answer came: ', 'Es kam keine Antwort: ') + (done.detail ?? done.reason)), 'bad');
  } catch (e) {
    status(esc(t('That did not work: ', 'Das hat nicht geklappt: ') + e.message), 'bad');
  }
}

// ---- drawing the conversation ------------------------------------------------------------------------
const TOOL_LABELS = {
  read_slide: a => a.slide === 'all' ? t('reads the whole room', 'liest den ganzen Raum') : a.slide ? t(`reads slide #${a.slide}`, `liest Folie #${a.slide}`) : t('reads your slide', 'liest deine Folie'),
  look_at_demo: () => t('looks at the demo', 'schaut sich die Demo an'),
  read_code: a => t('reads the code: ', 'liest den Code: ') + a.ref,
  search_code: a => t(`searches the code for "${a.query}"`, `sucht im Code nach \u201E${a.query}\u201C`),
  search_guide: a => t(`searches the guide for "${a.query}"`, `sucht im Rundgang nach \u201E${a.query}\u201C`),
  look_up_word: a => t(`looks up "${a.word}"`, `schlägt \u201E${a.word}\u201C nach`),
  navigate: a => [a.room && t(`takes you to ${roomName(a.room)}`, `bringt dich zu ${roomName(a.room)}`), a.slide && t(`turns to slide #${a.slide}`, `blättert zu Folie #${a.slide}`),
    a.level && t(`sets the detail to Lv ${a.level}`, `stellt die Detailstufe auf Lv ${a.level}`), a.layout && t('changes the layout', 'ändert die Ansicht')].filter(Boolean).join(', ') || t('moves you', 'bewegt dich'),
  highlight: a => t('points at something', 'zeigt auf etwas') + (a.note ? `: “${a.note}”` : ''),
  run_js: a => a.where === 'game' ? t('tries something out in the game', 'probiert im Spiel etwas aus') : t('tries something out on the page', 'probiert auf der Seite etwas aus'),
  game: a => ({ open: t('opens the game', 'öffnet das Spiel'), close: t('closes the game', 'schließt das Spiel'), restart: t('starts the game over', 'startet das Spiel neu'),
    go: t(`moves the hero to cube ${a.cube}`, `bringt den Helden in Würfel ${a.cube}`), key: t(`presses ${a.key} in the game`, `drückt ${a.key} im Spiel`), bigger: t('makes the game bigger', 'macht das Spiel größer'),
    smaller: t('makes the game smaller', 'macht das Spiel kleiner'), status: t('checks the game', 'schaut nach dem Spiel') })[a.action] ?? t('works with the game', 'arbeitet mit dem Spiel'),
  look_at_game: () => t('looks at the game', 'schaut sich das Spiel an'),
  show_code: () => t('picks some code to show you', 'sucht Code für dich heraus'),
  note: () => t('makes a note about you', 'macht sich eine Notiz über dich'),
};
const roomName = file => page.roomInfo(String(file).replace(/^.*\//, ''), lang)?.title ?? file;
const toolLabel = (name, args) => { try { return (TOOL_LABELS[name] ?? (() => name))(args ?? {}); } catch { return name; } };

function render(view) {
  if (!ui || !view) return;
  const near = ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < 80;
  const live = view.docs['pi.live'] ?? {}, inbox = view.docs['pi.inbox']?.items ?? [];
  const seen = new Set(), results = new Map();   // tool call id -> its result message
  for (const e of view.entries) if (e.kind === 'pi.tool-result') { const m = e.model?.[0]; if (m) results.set(m.toolCallId, m); }
  let at = null;   // keep the items in transcript order
  const place = (key, make, update) => {
    seen.add(key);
    let el = ui.items.get(key);
    if (!el) { el = make(); ui.items.set(key, el); }
    update?.(el);
    if (at ? at.nextSibling !== el : ui.log.firstChild !== el) at ? at.after(el) : ui.log.prepend(el);
    at = el;
  };
  const visible = view.entries.filter(e => ['tutor.ask', 'pi.user', 'pi.assistant'].includes(e.kind));
  if (!visible.length && !live.run && !inbox.length) place('hello', hello);
  for (const e of view.entries) {
    if (e.kind === 'tutor.ask') place('e' + e.id, () => bubble('me', esc(e.data?.text ?? '')));
    else if (e.kind === 'pi.user') place('e' + e.id, () => bubble('me', esc(userText(e.model?.[0]))));
    else if (e.kind === 'pi.compaction') place('e' + e.id, () => divider(t('(older messages were summed up)', '(ältere Nachrichten wurden zusammengefasst)')));
    else if (e.kind === 'pi.assistant') {
      const m = e.model?.[0];
      if (!m) continue;
      m.content.forEach((c, i) => {
        if (c.type === 'text' && c.text.trim()) place(`e${e.id}.${i}`, () => bubble('guide', md(c.text)));
        if (c.type === 'toolCall' && c.name === 'run_js' && c.arguments?.show) place('c' + c.id, () => codeCard(c.arguments), el => ranCode(el, results.get(c.id), !!live.run));
        else if (c.type === 'toolCall' && c.name === 'show_code') place('s' + c.id, shownCode, el => fillShown(el, results.get(c.id)));
        else if (c.type === 'toolCall') place('t' + c.id, () => chip(toolLabel(c.name, c.arguments)), el => {
          el.classList.toggle('err', !!results.get(c.id)?.isError);
          el.classList.toggle('running', !results.has(c.id) && !!live.run);
        });
      });
      if (m.stopReason === 'error') place(`e${e.id}.err`, () => trouble(m.errorMessage ?? ''));
      if (m.stopReason === 'aborted') place(`e${e.id}.stop`, () => notice(t('(stopped)', '(angehalten)')));
    }
  }
  // the answer being written right now, and the tools running
  const partial = live.generation?.message;
  if (partial) partial.content.forEach((c, i) => {
    if (c.type === 'text' && c.text.trim()) place(`live.${live.generation.attempt}.${i}`, () => bubble('guide live', ''), el => { el.innerHTML = md(c.text); });
    if (c.type === 'toolCall') place('t' + c.id, () => chip(toolLabel(c.name, c.arguments)), el => { el.firstChild.textContent = toolLabel(c.name, c.arguments); });
  });
  for (const item of inbox) if (item.mode !== 'write') place('q' + item.id, () => bubble('me queued', esc(item.entry?.data?.text ?? userText({ content: item.content }))));
  const thinking = live.run && !(partial?.content ?? []).some(c => c.type === 'text' && c.text.trim()) && !(live.tools ?? []).some(s => s.status !== 'done');
  if (live.generation?.retry) place('retry', () => notice('', 'warn'), el => { el.textContent = t('Trying again\u2026 ', 'Neuer Versuch\u2026 ') + live.generation.retry.error; });
  else if (thinking) place('thinking', () => { const d = document.createElement('div'); d.className = 'thinking'; d.innerHTML = '<i></i><i></i><i></i>'; return d; });
  for (const [key, el] of ui.items) if (!seen.has(key)) { el.remove(); ui.items.delete(key); }
  if (ui.notice) ui.log.append(ui.notice);
  ui.stop.hidden = !live.run;
  if (near) ui.log.scrollTop = ui.log.scrollHeight;
}
const userText = m => (typeof m?.content === 'string' ? m.content : (m?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')).replace(/^<page>[\s\S]*?<\/page>\n/, '');
function bubble(cls, html) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.innerHTML = html;
  for (const pre of d.querySelectorAll('pre')) highlight(pre);
  return d;
}
// code the Teacher chose to show the reader (run_js with show), and what it gave
function codeCard({ code = '', where }) {
  const d = document.createElement('div');
  d.className = 'ran';
  d.innerHTML = `<div class="lbl">${where === 'game' ? t('The Teacher runs this code in the game:', 'Der Lehrer lässt diesen Code im Spiel laufen:') : t('The Teacher runs this code:', 'Der Lehrer lässt diesen Code laufen:')}</div><pre><code></code></pre><div class="res"></div>`;
  d.querySelector('code').textContent = code;
  highlight(d.querySelector('pre'));
  return d;
}
function ranCode(el, result, running) {
  const res = el.querySelector('.res');
  el.classList.toggle('running', !result && running);
  el.classList.toggle('err', !!result?.isError);
  if (!result) { res.textContent = running ? t('running\u2026', 'läuft\u2026') : ''; return; }
  const out = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n').replace(/^returned: undefined\n?/, '').trim();
  res.textContent = out.split('\n').slice(0, 8).join('\n') || t('done', 'fertig');
}
// real code from the game the Teacher put in front of the reader (show_code): drawn from the
// result, so it shows again after a reload exactly as it was shown
function shownCode() {
  const d = document.createElement('div');
  d.className = 'shown pending';
  d.innerHTML = `<div class="lbl">${t('picking some code\u2026', 'sucht Code heraus\u2026')}</div>`;
  return d;
}
function fillShown(el, result) {
  if (!result || el.dataset.done) return;
  el.dataset.done = '1';
  const d = result.details;
  if (result.isError || !d?.code) { el.hidden = true; return; }
  el.classList.remove('pending');
  const [a, b] = d.focus ?? [0, -1];
  const lines = d.code.split('\n').map((line, i) => {
    const n = d.start + i, pre = document.createElement('pre');
    pre.textContent = line || ' ';
    highlight(pre);
    return `<span class="ln${n >= a && n <= b ? ' on' : ''}"><i>${n}</i>${pre.innerHTML}</span>`;
  }).join('');
  el.innerHTML = `${d.note ? `<div class="cap">${esc(d.note)}</div>` : ''}<div class="lbl">${esc(d.path)}${d.name ? ` \u00B7 ${esc(d.name)}` : ''} \u00B7 ${t('lines', 'Zeilen')} ${d.start}\u2013${d.end}</div><pre><code>${lines}</code></pre>`;
  el.querySelector('.ln.on')?.scrollIntoView?.({ block: 'nearest' });
}
function chip(label) {
  const d = document.createElement('div');
  d.className = 'act';
  d.append(document.createTextNode(label));
  return d;
}
function notice(text, kind = '') {
  const d = document.createElement('div');
  d.className = 'notice ' + kind;
  d.textContent = text;
  return d;
}
// a failed answer: what it means for the reader, and the details for a grown-up
function trouble(error) {
  const d = notice('', 'bad');
  const what = /\b401\b|authentication|api.key/i.test(error) ? t('The Teacher\'s key was not accepted. A grown-up can fix it in the settings (\u2699).', 'Der Schlüssel des Lehrers wurde nicht angenommen. Ein Erwachsener kann das in den Einstellungen (\u2699) beheben.')
    : /\b429\b|rate|overloaded|\b529\b/i.test(error) ? t('The Teacher is very busy right now. Wait a minute and ask again.', 'Der Lehrer ist gerade sehr beschäftigt. Warte eine Minute und frag noch einmal.')
    : /fetch|network|\b50\d\b/i.test(error) ? t('The Teacher could not be reached. Is the internet (or the dev server) on?', 'Der Lehrer war nicht erreichbar. Ist das Internet (oder der Dev-Server) an?')
    : t('Something went wrong with that answer. Try asking again.', 'Bei dieser Antwort ist etwas schiefgegangen. Frag noch einmal.');
  d.innerHTML = `${esc(what)}<details><summary>${t('details', 'Details')}</summary>${esc(error)}</details>`;
  return d;
}
function divider(text) { const d = notice(text); d.classList.add('divider'); return d; }
function hello() {
  const d = document.createElement('div');
  d.className = 'hello';
  d.innerHTML = `<p>${t('Hi! I am the Teacher. Ask me anything about this room, or about how the game works. I can also open the real game next to the guide, and we can poke around inside it.', 'Hallo! Ich bin der Lehrer. Frag mich alles über diesen Raum oder darüber, wie das Spiel funktioniert. Ich kann auch das echte Spiel neben dem Rundgang öffnen, und wir können darin herumstöbern.')}</p>
    <p>${t('I will not just tell you the answers: we will find them out together. Ready?', 'Ich verrate dir nicht einfach die Antworten: Wir finden sie zusammen heraus. Bereit?')}</p>
    <div class="starts">${[t('What is this slide about?', 'Worum geht es auf dieser Folie?'), t('Quiz me on this slide!', 'Stell mir eine Quizfrage zu dieser Folie!'),
      t('I don\'t get this part.', 'Diesen Teil verstehe ich nicht.'), t('How does the real game do this?', 'Wie macht das echte Spiel das?'), t('Show me in the real game!', 'Zeig es mir im echten Spiel!')]
      .map(s => `<button class="start" type="button">${esc(s)}</button>`).join('')}</div>`;
  return d;
}

// ---- setup and settings -------------------------------------------------------------------------------
// no model can be reached: a card for a grown-up, under the conversation
function setup(T) {
  status('');
  const d = ui.notice;
  d.className = 'notice setup';
  d.innerHTML = `<p><b>${t('The Teacher needs a grown-up first.', 'Der Lehrer braucht zuerst einen Erwachsenen.')}</b></p>
    <p class="small">${t('It talks to an AI model through Radius, Anthropic or OpenAI, and that needs an API key. Either start the dev server with RADIUS_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY set (the key then stays on the server), or paste a key here. A pasted key is kept only in this browser.',
      'Er spricht mit einem KI-Modell über Radius, Anthropic oder OpenAI, und dafür braucht es einen API-Schlüssel. Entweder startest du den Dev-Server mit RADIUS_API_KEY, ANTHROPIC_API_KEY oder OPENAI_API_KEY (dann bleibt der Schlüssel auf dem Server), oder du fügst hier einen Schlüssel ein. Ein eingefügter Schlüssel bleibt nur in diesem Browser.')}</p>`;
  d.append(keyForm(T, () => status(null)));
  ui.log.scrollTop = ui.log.scrollHeight;
}
function keyForm(T, done) {
  const P = T.modelsMod.PROVIDERS, f = document.createElement('form');
  f.className = 'keys';
  f.innerHTML = `<select>${Object.entries(P).map(([id, p]) => `<option value="${id}">${p.name}</option>`).join('')}</select>
    <input type="password" autocomplete="off" placeholder="${t('API key', 'API-Schlüssel')}"><button>${t('Save', 'Speichern')}</button>`;
  f.onsubmit = e => {
    e.preventDefault();
    const id = f.querySelector('select').value, key = f.querySelector('input').value.trim();
    if (!key) return;
    T.modelsMod.setStoredKey(id, key);
    T.modelsMod.choose(id);
    done();
  };
  return f;
}
async function settings() {
  const T = await tutor.catch(() => null);
  if (!T) return;
  const M = T.modelsMod, avail = await M.available(), cur = await model(T), server = await M.serverProviders();
  if (T.faux) avail.push('faux');
  const usage = await T.harness.usage(T.ctx).catch(() => null);
  const cost = Object.values(usage?.models ?? {}).reduce((n, u) => n + (u?.cost?.total ?? 0), 0);
  const notes = await T.notes();
  const s = ui.sheet;
  s.innerHTML = `<h3>${t('Settings', 'Einstellungen')}</h3>
    <label>${t('Model', 'Modell')} <select class="model">${avail.flatMap(p => p === 'faux' ? [`<option value="faux:">faux (dev)</option>`]
      : M.modelList(T.models, p).map(id => `<option value="${p}:${id}"${cur?.provider === p && cur?.modelId === id ? ' selected' : ''}>${M.PROVIDERS[p].name} \u00B7 ${id}</option>`)).join('')}</select></label>
    <p class="small">${Object.entries(M.PROVIDERS).map(([id, p]) => `${p.name}: ${M.storedKey(id) ? t('key in this browser', 'Schlüssel in diesem Browser') + ` <button type="button" class="forget-key" data-id="${id}">${t('remove', 'entfernen')}</button>` : server.includes(id) ? t('key on the dev server', 'Schlüssel auf dem Dev-Server') : t('no key', 'kein Schlüssel')}`).join('<br>')}</p>
    <div class="keyslot"></div>
    <p class="small">${t('Spent so far', 'Bisher ausgegeben')}: $${cost.toFixed(2)}</p>
    <details><summary>${t('What the Teacher noted about you', 'Was sich der Lehrer über dich gemerkt hat')} (${notes.length})</summary><ul>${notes.map(n => `<li>${esc(n.text)} <small>(${esc(n.room)})</small></li>`).join('')}</ul></details>
    <p><button type="button" class="restart">${t('Start over', 'Neu anfangen')}</button>
    <button type="button" class="wipe">${t('Forget everything', 'Alles vergessen')}</button>
    <button type="button" class="done">${t('Done', 'Fertig')}</button></p>`;
  s.querySelector('.keyslot').append(keyForm(T, () => settings()));
  s.querySelector('.model').onchange = e => { const [p, id] = e.target.value.split(':'); M.choose(p, id); flag.set('provider', p); };
  for (const b of s.querySelectorAll('.forget-key')) b.onclick = () => { M.setStoredKey(b.dataset.id, ''); settings(); };
  s.querySelector('.done').onclick = () => { s.hidden = true; };
  s.querySelector('.restart').onclick = async () => {
    if (!chat || !confirm(t('Start a new conversation? The Teacher keeps its notes about you.', 'Ein neues Gespräch beginnen? Der Lehrer behält seine Notizen über dich.'))) return;
    await chat.conversation.reset(undefined, T.ctx);
    s.hidden = true;
  };
  s.querySelector('.wipe').onclick = async () => {
    if (!confirm(t('Forget all conversations in all rooms and all notes? Keys stay.', 'Alle Gespräche in allen Räumen und alle Notizen vergessen? Schlüssel bleiben.'))) return;
    await T.harness.close(T.ctx).catch(() => {});
    await T.volume.destroy();
    flag.set('busy', '');
    location.reload();
  };
  s.hidden = false;
}
