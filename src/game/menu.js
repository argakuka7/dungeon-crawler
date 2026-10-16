// The main menu: before the game starts, and after "Save and quit" in the Esc menu
// (game/escmenu.js). The dev tools and ?seed= skip it (state.js mode; ?menu=1 shows it after all).
//   title    Continue (the hero and world played last), the heroes, the controls, the guide
//   heroes   up to three (core/save.js MAX_HEROES), made with a name: choose, rename, delete
//   worlds   for the chosen hero, up to eight: play, rename, delete, make a new one (a name and a
//            seed, both left empty: made up); or join a friend's game with their code
//   joining  waiting for the friend's game; the hero comes along, the world is theirs
// ?join=CODE: straight to the heroes, and the chosen one joins that game.
import { state, view } from './state.js';
import { setHelpOpen, helpOpen } from './help.js';
import { fadeOut } from './hud.js';
import { endWorld } from './flow.js';
import { startShowcase, stopShowcase, showcaseCubes } from './showcase.js';
import { DEFAULT_ZOOM } from '../core/zoom.js';
import { store, play, playAsGuest, stopSaving, newHero, newSavedWorld, forget } from './save.js';
import { cleanName, heroLevel, MAX_HEROES, MAX_WORLDS } from '../core/save.js';
import { readSeed } from '../core/names.js';
import { ITEMS } from '../core/items.js';
import { playSong } from '../audio/music.js';
import { readCode } from '../net/protocol.js';
import { online } from '../net/online.js';
import { joinGame, leaveGame, sessionStatus, onSessionChange } from '../net/session.js';

const FADE_MS = 380, CONFIRM_MS = 4000;
const $ = id => document.getElementById(id);
const overlay = $('title-overlay'), panel = $('title-panel');
const params = new URLSearchParams(location.search), local = params.get('net') === 'local';

// screen: which one shows; heroId: the hero chosen; form: what is being typed ('hero': a new
// hero, 'world': a new world, { rename: id }); asked: the delete button that asks again (id,
// until when); note: what went wrong; invite: ?join=CODE, until a hero tried it; joining: the
// code of the game we wait for
let screen = 'title', heroId = null, form = null, asked = { id: null, until: 0 }, note = '';
let invite = state.mode === 'menu' ? readCode(params.get('join')) : null, joining = null;

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
function playTime(s) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min played` : `${Math.floor(m / 60)} h ${m % 60} min played`;
}
const heroIcon = h => { const s = h.inventory.slots.find(x => x?.instanceId === h.inventory.equipped); return s ? ITEMS[s.itemId]?.icon : null; };

// --- showing ------------------------------------------------------------------------------------

export function openMainMenu() {
  state.mode = 'menu';
  document.body.classList.add('in-menu');
  overlay.hidden = false;
  playSong(null);   // no music in the menu
  startShowcase();   // the living cubes behind it
  screen = invite ? 'heroes' : 'title';
  form = !store.heroes().length && screen === 'heroes' ? 'hero' : null;
  note = '';
  render();
}
// off to play: the screen goes dark (the game's first cube fades it in), the showcase stops
// (the game's world takes its place) and the view is the game's again
function closeMainMenu() {
  fadeOut();
  overlay.hidden = true;
  document.body.classList.remove('in-menu');
  setHelpOpen(false);
  stopShowcase();
  view.yaw = view.yawTarget = -Math.PI / 4; view.zoom = view.zoomTarget = DEFAULT_ZOOM;
  state.mode = 'play';
}

function deleteButton(id) {
  const sure = asked.id === id && performance.now() < asked.until;
  return `<button data-act="delete" data-id="${id}" class="${sure ? 'confirm' : ''}">${sure ? 'Sure? Click again' : 'Delete'}</button>`;
}
const renaming = id => form?.rename === id;
const renameField = (id, name) => `<span class="title-rename"><input id="title-rename" maxlength="16" value="${esc(name)}" data-enter="save-name" aria-label="New name">`
  + `<button data-act="save-name" data-id="${id}">Save</button></span>`;

const screens = {
  title() {
    const id = store.selected(), hero = id && store.hero(id), world = id && store.heroWorld(id);
    const heroes = store.heroes().length;
    return `<div class="title-list">
      ${hero && world ? `<button class="menu-big" data-act="continue">Continue<small>${esc(hero.name)} · level ${heroLevel(hero)} · in ${esc(world.name)}</small></button>` : ''}
      <button class="menu-big" data-act="heroes">${heroes ? 'Heroes' : 'New game'}</button>
      <div class="menu-row"><button data-act="controls">Controls</button><a class="title-link" href="learn/" target="_blank" rel="noopener">The guide</a></div>
    </div>`;
  },
  heroes() {
    const heroes = store.heroes();
    let formShown = false;
    const cards = Array.from({ length: MAX_HEROES }, (_, i) => {
      const h = heroes[i];
      if (h) {
        const icon = heroIcon(h);
        return `<li class="title-card">${renaming(h.id) ? renameField(h.id, h.name)
          : `<button class="title-pick" data-act="hero" data-id="${h.id}">${icon ? `<img src="${esc(icon)}" alt="">` : '<i></i>'}`
            + `<span><b>${esc(h.name)}</b><small>Level ${heroLevel(h)} · ${playTime(h.playTime)} · ${ago(h.updated)}</small></span></button>`}
          <div class="title-actions"><button data-act="rename" data-id="${h.id}">Rename</button>${deleteButton(h.id)}</div></li>`;
      }
      if (form === 'hero' && !formShown) {
        formShown = true;
        return `<li class="title-card title-form"><input id="title-name" maxlength="16" placeholder="Name your hero" data-enter="create-hero" aria-label="Hero name">
          <button data-act="create-hero">Create</button>${heroes.length ? '<button data-act="cancel">Cancel</button>' : ''}</li>`;
      }
      return `<li class="title-card title-empty"><button data-act="new-hero">+ New hero</button></li>`;
    }).join('');
    return `<h2>Choose your hero</h2>${invite ? `<p class="title-invite">to join your friend's game ${esc(invite)}</p>` : ''}
      <ul class="title-cards">${cards}</ul><button data-act="back" class="title-back">Back</button>`;
  },
  worlds() {
    const hero = store.hero(heroId), worlds = store.worlds(), names = new Map(store.heroes().map(h => [h.id, h.name]));
    const rows = worlds.map(w => `<li class="title-card">${`<button class="title-pick" data-act="world" data-id="${w.id}"><span><b>${esc(w.name)}${w.heroes.includes(heroId) ? '' : ' <em>new for this hero</em>'}</b>`
        + `<small>${w.deepest ? `depth ${w.deepest}` : 'town'} · ${ago(w.updated)}${w.heroes.length ? ' · ' + w.heroes.map(id => esc(names.get(id) ?? '?')).join(', ') : ''}</small></span></button>`}
      <div class="title-actions">${deleteButton(w.id)}</div></li>`).join('');
    const make = worlds.length >= MAX_WORLDS ? `<p>${MAX_WORLDS} worlds is the most: delete one to make a new one.</p>`
      : form === 'world' ? `<div class="title-form title-new-world">
          <label>Seed <input id="title-seed" maxlength="60" placeholder="random" data-enter="create-world" autocomplete="off" spellcheck="false"></label>
          <div class="menu-row"><button class="menu-big" data-act="create-world">Make it and play</button>${worlds.length ? '<button data-act="cancel">Cancel</button>' : ''}</div></div>`
      : '<button data-act="new-world" class="title-new">+ New world</button>';
    return `<h2>${esc(hero.name)} <small>level ${heroLevel(hero)}</small></h2>
      <h3>Play in a world</h3><ul class="title-cards">${rows}</ul>${make}
      <h3>or join a friend's game</h3>
      <div class="menu-row"><input id="title-code" maxlength="40" placeholder="CODE" data-enter="join" aria-label="Room code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button data-act="join">Join</button></div>
      <button data-act="back" class="title-back">Back</button>`;
  },
  joining() {
    const hero = store.hero(heroId);
    return `<h2>Joining ${esc(joining)}</h2><p>${esc(hero?.name ?? 'Your hero')} goes into your friend's world.</p>
      <p class="title-status">${esc(sessionStatus().text)}</p><button data-act="cancel-join" class="title-back">Cancel</button>`;
  },
};

function render() {
  if (state.mode !== 'menu') return;
  if (screen !== 'title' && screen !== 'heroes' && !store.hero(heroId)) screen = 'heroes';
  panel.innerHTML = screens[screen]() + (note ? `<p class="title-note" role="alert">${esc(note)}</p>` : '');
  panel.dataset.screen = screen;
  const first = panel.querySelector('#title-rename, #title-name, #title-seed');
  first?.focus();
}

// --- doing --------------------------------------------------------------------------------------

function start(hero, world) {
  closeMainMenu();
  play(hero, world).catch(e => {   // (the game files did not come: the server or the connection)
    console.error('could not start', e);
    stopSaving(); endWorld(); openMainMenu();   // (another showcase)
    note = 'That world would not start. Try again?'; render();
  });
}

function joinWith(code) {
  invite = null;
  if (!playAsGuest(heroId)) { note = 'That hero is gone'; render(); return; }
  joining = code; screen = 'joining'; note = '';
  render();
  joinGame(code, { name: store.hero(heroId).name, local });
}
function stopJoining(text = '') {
  joining = null;
  stopSaving();
  screen = 'worlds'; note = text;
  render();
}

const actions = {
  continue() { const h = store.selected(), w = h && store.heroWorld(h); if (w) start(h, w.id); },
  heroes() { screen = 'heroes'; form = store.heroes().length ? null : 'hero'; },
  controls() { setHelpOpen(!helpOpen()); },
  back() { form = null; screen = screen === 'worlds' ? 'heroes' : 'title'; if (screen === 'title') invite = null; },
  cancel() { form = null; },
  'new-hero'() { form = 'hero'; },
  'create-hero'() {
    const name = cleanName($('title-name').value);
    if (!name) { note = 'Your hero needs a name'; return; }
    const h = newHero(name);
    if (!h) { note = 'Could not make the hero (is the storage full?)'; return; }
    form = null; heroId = h.id;
    if (invite) { joinWith(invite); return; }
    screen = 'worlds';
    if (!store.worlds().length) form = 'world';
  },
  hero(id) {
    heroId = id; form = null;
    store.select(id);
    if (invite) { joinWith(invite); return; }
    screen = 'worlds';
    if (!store.worlds().length) form = 'world';
  },
  world(id) { start(heroId, id); },
  'new-world'() { form = 'world'; },
  'create-world'() {
    const typed = $('title-seed').value.trim(), seed = typed ? readSeed(typed) : (Math.random() * 2 ** 32) >>> 0;
    if (seed === null) { note = 'That is not a world name or a number'; return; }
    const w = newSavedWorld(seed);
    if (!w) { note = 'Could not make the world (is the storage full?)'; return; }
    start(heroId, w.id);
  },
  rename(id) { form = { rename: id }; },
  'save-name'(id) {
    const name = cleanName($('title-rename').value);
    if (!name) { note = 'A name, please'; return; }
    const h = store.hero(id);
    if (h) store.putHero({ ...h, name });
    form = null;
  },
  delete(id) {
    if (asked.id !== id || performance.now() >= asked.until) {
      asked = { id, until: performance.now() + CONFIRM_MS };
      setTimeout(render, CONFIRM_MS + 50);
      return;
    }
    asked = { id: null, until: 0 };
    forget(id);
    if (store.hero(id)) store.deleteHero(id); else store.deleteWorld(id);
    if (id === heroId) { heroId = null; screen = 'heroes'; }
  },
  join() {
    const code = readCode($('title-code').value);
    if (!code) { note = 'A code has four letters'; return; }
    joinWith(code);
  },
  'cancel-join'() { leaveGame(); stopJoining(); },
};

function act(name, id) {
  const fn = actions[name];
  if (!fn) return;
  note = '';
  fn(id);
  if (state.mode === 'menu' && screen !== 'joining') render();
}
panel.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) { e.preventDefault(); act(b.dataset.act, b.dataset.id); }
});
panel.addEventListener('keydown', e => {
  const t = e.target.dataset?.enter;
  if (e.key === 'Enter' && t) { e.preventDefault(); act(t, panel.querySelector(`[data-act="${t}"]`)?.dataset.id); }
});
// Esc: the controls closed, the form given up, else back a screen
addEventListener('keydown', e => {
  if (state.mode !== 'menu' || e.key !== 'Escape') return;
  e.preventDefault();
  if (helpOpen()) setHelpOpen(false);
  else if (form) act('cancel');
  else if (screen === 'joining') act('cancel-join');
  else if (screen !== 'title') act('back');
});

// joining: the friend's game says how it goes; a failure brings us back to the worlds
onSessionChange(s => {
  if (state.mode !== 'menu' || screen !== 'joining') return;
  if (s.phase === 'idle') stopJoining(s.text || 'Could not join');
  else render();
});

// main.js, every frame in the menu: the friend's world started (net/session.js): off we go
export function updateMenu() {
  if (joining && state.cubes && state.cubes !== showcaseCubes() && online.role === 'guest') { joining = null; closeMainMenu(); }
}

// The Esc menu's "Save and quit": the hero and world are saved a last time, a game with friends
// in it ends for them (they play on alone), and the world goes once the screen is dark
export function quitToMenu() {
  if (state.mode === 'menu') return;
  if (state.transitioning) { setTimeout(quitToMenu, 100); return; }   // not halfway into a cube
  stopSaving();
  if (online.role) leaveGame();
  state.transitioning = true;   // nothing moves while the screen goes dark
  fadeOut();
  setTimeout(() => { endWorld(); heroId = null; openMainMenu(); }, FADE_MS);
}
