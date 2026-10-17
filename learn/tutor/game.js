// The real game, running next to the guide: a window (an iframe of ../index.html) that stays
// open while the reader walks through the rooms, because it lives outside <main> (nav.js). It is
// the same site, so the Teacher reaches right into it: its window and document, the debug hooks the
// game puts in window.__game (src/main.js), and its own modules (game.load), which are the
// running game's, not copies.
//
// It runs with ?dev=1 for the dev hooks (spawning enemies and so on); its dev panel is hidden.
//
// The keyboard goes either to the game or to the guide, never both: keys reach the game only
// while its window has focus. A click into the game gives it focus (the game cancels its pointer
// presses, which would keep focus out), a click on the guide takes it back. The window shows
// which one has the keys; without them it shows "click to play".
// Its seed, place and size are remembered, so after a reload the window comes back where it was,
// with the same world (not with what happened in it). A new world or a restart reloads the game
// inside the same window.
const t = (en, de) => globalThis.document?.documentElement.dataset.lang === 'de' ? de : en;

const ROOT = new URL('../../', import.meta.url);
const KEY = 'kids.tutor.game';
const remember = v => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* private mode */ } };
const remembered = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };

let dock = null, frame = null, ready = null, seed = null, pending = null, sizer = null;
const listeners = new Set();
const changed = () => { for (const f of listeners) f(); };

export const isOpen = () => !!dock;
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const win = () => frame?.contentWindow ?? null;
export const api = () => win()?.__game ?? null;
export const currentSeed = () => seed;

// where the window is and how big: kept across new worlds, restarts, closing and reloads; only the
// reader (dragging, resizing) and an explicit bigger / smaller change it
const save = () => {
  if (!dock) return;
  const st = dock.style, place = {};
  for (const k of ['left', 'top', 'width', 'height']) if (st[k] && st[k] !== 'auto') place[k] = st[k];
  remember({ seed, big: dock.classList.contains('big'), place });
};

// open the window (or bring it back after a reload); resolves once the game runs. A seed other
// than the one running loads that world into the same window.
// focus: give the game the keyboard once it runs (when the reader opened it, not the Teacher)
export function open({ seed: wanted, big, focus = false } = {}) {
  if (!dock) build();
  if (big != null) setBig(big);
  if (!ready || (wanted != null && wanted !== seed)) return start(wanted ?? ((Math.random() * 1e6) | 0), focus);
  if (focus) ready.then(() => win()?.focus());
  return ready;
}
// the same world again from its start, in the same window: undoes everything done in it
export function restart() {
  if (!dock) return open();
  return start(seed, dock.classList.contains('focused'));
}
export function close() {
  if (!dock) return;
  save();
  const r = remembered();
  sizer?.disconnect();
  dock.remove();
  dock = frame = ready = pending = sizer = null;
  seed = null;
  remember(r && { place: r.place, big: r.big });   // no seed: it stays closed after a reload
  changed();
}

function build() {
  dock = document.createElement('section');
  dock.id = 'game-dock';
  dock.dataset.keys = '1';
  dock.innerHTML = `<header><b>Cube Crawler</b> <span class="seed"></span>
    <button class="big" title="${t('Bigger / smaller', 'Größer / kleiner')}">\u2922</button><button class="new" title="${t('A new world', 'Eine neue Welt')}">\u21BB</button><button class="x" title="${t('Close the game', 'Spiel schließen')}">\u2715</button></header>
    <div class="frame"><iframe title="Cube Crawler" allow="autoplay; fullscreen"></iframe>
    <button class="wake" type="button">${t('Click to play', 'Klicken zum Spielen')}<small>${t('the keys then go to the game', 'die Tasten gehen dann ans Spiel')}</small></button></div>`;
  frame = dock.querySelector('iframe');
  frame.onload = loaded;
  dock.querySelector('.x').onclick = () => close();
  dock.querySelector('.new').onclick = () => start((Math.random() * 1e6) | 0, true);
  dock.querySelector('.big').onclick = () => setBig(!dock.classList.contains('big'));
  dock.querySelector('.wake').onclick = () => win()?.focus();
  const r = remembered();
  if (r?.big) dock.classList.add('big');
  if (r?.place) {
    const { left, top, width, height } = r.place;
    Object.assign(dock.style, { width, height });
    if (left && top) Object.assign(dock.style, { left: `${Math.min(parseFloat(left), innerWidth - 80)}px`, top: `${Math.min(parseFloat(top), innerHeight - 40)}px`, bottom: 'auto' });
  }
  draggable(dock, dock.querySelector('header'));
  // the reader resized it (the corner sets its width and height)
  let last = '';
  sizer = new ResizeObserver(() => {
    const now = `${dock?.style.width}x${dock?.style.height}`;
    if (dock && now !== last) { last = now; save(); win()?.dispatchEvent(new Event('resize')); }
  });
  sizer.observe(dock);
  document.body.append(dock);
}

// load world `s` into the window
function start(s, focus) {
  seed = s;
  focused(false);
  ready = new Promise((resolve, reject) => { pending = { resolve, reject, focus }; });
  ready.catch(() => {});
  save();
  frame.src = new URL(`index.html?dev=1&seed=${seed}`, ROOT).href;
  changed();
  return ready;
}
async function loaded() {
  const p = pending, w = frame?.contentWindow;
  if (!p || !w || w.location.href === 'about:blank') return;
  try {
    const style = w.document.createElement('style');
    // its dev panel hidden; nothing it does scrolls the guide behind it
    style.textContent = '#dev { display: none !important; } html, body { overscroll-behavior: none; }';
    w.document.head.append(style);
    w.addEventListener('pointerdown', () => { if (!w.document.hasFocus()) w.focus(); }, true);
    w.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    w.addEventListener('focus', () => focused(true));
    w.addEventListener('blur', () => focused(false));
    focused(w.document.hasFocus());
    for (let i = 0; i < 300 && !w.__game; i++) await new Promise(r => setTimeout(r, 50));
    if (!w.__game) throw new Error('the game did not start');
    // and its first cube is there
    for (let i = 0; i < 300 && (!w.__game.map || w.__game.transitioning); i++) await new Promise(r => setTimeout(r, 50));
    if (pending !== p) return;   // another world was asked for meanwhile
    pending = null;
    p.resolve(api());
    if (p.focus) w.focus();
    changed();
  } catch (e) { if (pending === p) { pending = null; p.reject(e); } }
}

// whether the keys go to the game
function focused(on) {
  dock?.classList.toggle('focused', on);
  if (dock) dock.querySelector('.seed').textContent = on ? t('keys go to the game', 'Tasten gehen ans Spiel') : `seed ${seed}`;
}
// bigger / smaller: the one change of size that is not the reader's own resizing
function setBig(on) {
  dock.classList.toggle('big', on);
  dock.style.width = dock.style.height = '';
  save();
  // the game sizes its canvas to its window
  win()?.dispatchEvent(new Event('resize'));
}
// move the window by its title bar (the iframe would swallow the pointer, so it is switched off while moving)
function draggable(box, handle) {
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    handle.setPointerCapture(e.pointerId);
    frame.style.pointerEvents = 'none';
    const move = ev => Object.assign(box.style, {
      left: `${Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx))}px`, top: `${Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy))}px`, bottom: 'auto' });
    const up = () => { handle.removeEventListener('pointermove', move); if (frame) frame.style.pointerEvents = ''; save(); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
    handle.addEventListener('pointercancel', up, { once: true });
  });
}

// after a reload: open again if it was open
export function restore() {
  const r = remembered();
  if (r?.seed != null) open({ seed: r.seed }).catch(() => {});
}

// import one of the game's modules in the running game (path from the game's folder)
export function load(path) {
  const w = win();
  if (!w) throw new Error('The game is not open.');
  return w.eval('(url) => import(url)')(new URL(path, ROOT).href);
}

// ---- steering the game -----------------------------------------------------------------------------
// put the hero into cube `key` (like "-2,-1,4": x, y = minus the depth, z), the way the game's dev
// tools jump (src/game/dev.js goHorde); `from`: arrive through the portal on that face (0..3)
export async function enter(key, { from } = {}) {
  const [{ state }, { enterCube }, { whenReady }] = await Promise.all([load('src/game/state.js'), load('src/game/flow.js'), load('src/game/hud.js')]);
  const depth = -Number(String(key).split(',')[1]);
  if (!(depth >= 0 && state.cubes.layout(depth).exists.has(String(key)))) throw new Error(`There is no cube ${key} in this world.`);
  if (state.transitioning) throw new Error('The game is busy travelling; try again in a moment.');
  state.transitioning = true;
  try {
    const c = await whenReady(state.cubes.get(String(key)));
    enterCube(c, from ?? c.map.portals.find(p => p.kind !== 'spawn')?.dir ?? null);
  } finally { state.transitioning = false; }
  return summary();
}
// press a key in the game, as the reader would (code like "KeyG", "PageDown", "Space"; see the
// game's help, ?); `hold`: milliseconds to hold it
export async function press(code, { hold = 60, alt = false, shift = false, ctrl = false } = {}) {
  const w = win();
  if (!w) throw new Error('The game is not open.');
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code;
  const init = { code, key, altKey: alt, shiftKey: shift, ctrlKey: ctrl, bubbles: true, cancelable: true };
  w.dispatchEvent(new w.KeyboardEvent('keydown', init));
  await new Promise(r => setTimeout(r, hold));
  w.dispatchEvent(new w.KeyboardEvent('keyup', init));
}

// what is going on in the game, in a few words for the Teacher
export function summary() {
  const g = api();
  if (!g) return dock ? 'the game window is starting' : null;
  const p = g.player, s = g.state, near = [];
  for (const e of g.enemies ?? []) {
    if (e.mode === 'dead') continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < 12) near.push(`${e.profile?.name ?? e.type ?? 'enemy'} lv ${e.level} ${d.toFixed(1)} away${e.mode ? ` (${e.mode})` : ''}`);
  }
  return [`seed ${s.baseSeed}`, `depth ${g.map?.depth ?? '?'}`, `cube ${s.cubeKey}`,
    `hero level ${p.level}, ${Math.round(p.hp)}/${p.maxHp} hp at x ${p.x.toFixed(1)} z ${p.z.toFixed(1)}`,
    s.transitioning ? 'travelling' : null,
    near.length ? `near: ${near.slice(0, 8).join(', ')}` : 'no enemies near',
    g.teach?.status() || null].filter(Boolean).join('; ');
}

// a picture of the game's 3D view (the HUD on top of it is HTML and not in it), as base64 JPEG
export async function snapshot() {
  if (!api()) return null;
  const { renderer, scene, camera } = await load('src/render/scene.js');
  // a WebGL canvas can only be read right after drawing, in the same task
  renderer.render(scene, camera);
  const src = renderer.domElement, scale = Math.min(1, 900 / src.width), out = document.createElement('canvas');
  out.width = Math.round(src.width * scale); out.height = Math.round(src.height * scale);
  out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.82).split(',')[1];
}
