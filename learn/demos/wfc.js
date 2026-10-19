// Wave function collapse with the game's own tiles and rules (src/world/tiles.js, wfc.js), one
// cube at a time so you can watch it: every step collapses the cube with the fewest pieces
// left that still fit its neighbours (the lowest entropy), exactly like WFC.collapse.
import { WFC } from '../../src/world/wfc.js';
import { KIND_COLOR, layersOf } from '../../src/world/tiles.js';
import { hashKey, step as stepKey } from '../../src/world/coords.js';
import { themeAt, worldThemes } from '../../src/themes/depth.js';
import { canvas, loop, html, t as tr, themeLabel } from '../deck.js';

const PLAY = () => tr('Play', 'Abspielen');
const COLS = 9, ROWS = 6, SOCK = { L: '#6fae4f', H: '#a08052', W: '#3f8fd8' };

export default function mount(el) {
  const W = 640, H = 430, { g, c, at } = canvas(el, W, H);
  const row = html(el, `<div class="row"><button class="step">${tr('One step', 'Ein Schritt')}</button><button class="play">${PLAY()}</button><button class="fill">${tr('Fill all', 'Alles füllen')}</button>
    <button class="reset">${tr('Start over', 'Neu anfangen')}</button><label>${tr('depth', 'Tiefe')} <select class="depth">${[1, 3, 4, 7, 9, 13].map(d => `<option value="${d}">${d}</option>`).join('')}</select></label></div>
    <div class="legend">${Object.entries(KIND_COLOR).map(([k, col]) => `<span><i style="background:${col}"></i>${k}</span>`).join('')}
    <span>${tr('edges', 'Kanten')}: <i style="background:${SOCK.L}"></i>L ${tr('lowland', 'Tiefland')} <i style="background:${SOCK.H}"></i>H ${tr('highland', 'Hochland')} <i style="background:${SOCK.W}"></i>W ${tr('river', 'Fluss')}</span></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => el.querySelector(s);
  let wfc, keys, Y, playing = false, acc = 0, lastPick = null, seed = 1, hover = null;

  function reset() {
    seed = Math.floor(Math.random() * 1e6);
    // every world picks its own theme per depth
    for (const o of $('.depth').options) o.textContent = `${o.value} \u00B7 ${themeLabel(themeAt(+o.value, worldThemes(seed)))}`;
    Y = -$('.depth').value;
    wfc = new WFC(seed);
    keys = [];
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) keys.push(`${x},${Y},${z}`);
    lastPick = null; playing = false; $('.play').textContent = PLAY();
    draw();
  }
  const weight = () => { const m = themeAt(-Y, worldThemes(seed)).tiles; return t => t.weight * (m[t.kind] ?? 1); };
  // the next cube WFC.collapse would pick: the lowest entropy (plus its tiny tie-break)
  function next() {
    let best = null, bestE = Infinity, bestDom = null;
    for (const k of keys) {
      if (wfc.tiles.has(k)) continue;
      const dom = wfc.domain(k), e = wfc.entropy(dom, weight()) + (hashKey(k) % 1000) * 1e-6;
      if (e < bestE) { best = k; bestE = e; bestDom = dom; }
    }
    return best && { k: best, dom: bestDom };
  }
  function step() {
    const n = next();
    if (!n) { playing = false; $('.play').textContent = PLAY(); return false; }
    const { k, dom } = n, R = wfc.rng(k), w = weight(), sum = dom.reduce((s, t) => s + w(t), 0);
    let r = R() * sum, tile = dom[dom.length - 1];
    for (const t of dom) if ((r -= w(t)) < 0) { tile = t; break; }
    const near = [0, 1, 2, 3].map(d => wfc.tiles.get(stepKey(k, d))?.K).filter(Boolean);
    wfc.tiles.set(k, { ...tile, K: layersOf(tile.kind, R(), near) });
    lastPick = { k, options: dom.length, tile };
    return true;
  }

  const S = 64, ox = (W - COLS * S) / 2, oy = 14;
  function draw() {
    g.clearRect(0, 0, W, H);
    const nx = next();
    g.textAlign = 'center';
    for (const k of keys) {
      const [x, , z] = k.split(',').map(Number), X = ox + x * S, Z = oy + z * S, t = wfc.tiles.get(k);
      if (t) {
        g.fillStyle = KIND_COLOR[t.kind]; g.fillRect(X + 2, Z + 2, S - 4, S - 4);
        // the four edges (sockets): east, west, south, north
        const e = [[X + S - 9, Z + 6, 6, S - 12], [X + 3, Z + 6, 6, S - 12], [X + 6, Z + S - 9, S - 12, 6], [X + 6, Z + 3, S - 12, 6]];
        t.sock.forEach((s, d) => { g.fillStyle = SOCK[s]; g.fillRect(...e[d]); g.strokeStyle = '#0008'; g.lineWidth = 1; g.strokeRect(...e[d]); });
        g.fillStyle = '#0b0d12'; g.font = "bold 11px 'Cinzel', serif";
        g.fillText(t.kind, X + S / 2, Z + S / 2 + 1);
        g.font = "13px 'Crimson Text', serif"; g.fillText(tr(`${t.K} layer${t.K > 1 ? 's' : ''}`, `${t.K} Ebene${t.K > 1 ? 'n' : ''}`), X + S / 2, Z + S / 2 + 14);
      } else {
        const n = wfc.domain(k).length;
        g.fillStyle = '#161b24'; g.fillRect(X + 2, Z + 2, S - 4, S - 4);
        g.fillStyle = n < 30 ? '#ffcf7a' : '#5a6678'; g.font = "bold 15px 'Cinzel', serif";
        g.fillText(String(n), X + S / 2, Z + S / 2 + 2);
        g.font = "13px 'Crimson Text', serif"; g.fillStyle = '#8a96a8'; g.fillText(tr('options', 'Optionen'), X + S / 2, Z + S / 2 + 16);
      }
      if (nx?.k === k) { g.strokeStyle = '#ffcf7a'; g.lineWidth = 3; g.strokeRect(X + 2, Z + 2, S - 4, S - 4); }
      if (lastPick?.k === k) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(X + 4, Z + 4, S - 8, S - 8); }
    }
    g.textAlign = 'left';
    const done = keys.filter(k => wfc.tiles.has(k)).length;
    let text = lastPick
      ? tr(`The cube at ${lastPick.k.split(',')[0]},${lastPick.k.split(',')[2]} had <b>${lastPick.options}</b> pieces that fit, the fewest of all. The dice picked <b>${lastPick.tile.kind}</b> (edges ${lastPick.tile.sock.join(' ')}: east west south north).`,
        `Der Würfel bei ${lastPick.k.split(',')[0]},${lastPick.k.split(',')[2]} hatte <b>${lastPick.options}</b> passende Teile, die wenigsten von allen. Die Würfel wählten <b>${lastPick.tile.kind}</b> (Kanten ${lastPick.tile.sock.join(' ')}: Ost West Süd Nord).`)
      : tr('Every empty cube shows how many puzzle pieces still fit there. Press "One step".', 'Jeder leere Würfel zeigt, wie viele Puzzleteile dort noch passen. Drück "Ein Schritt".');
    if (done === keys.length) text += tr('\nDone! Every edge matches its neighbour. Start over for a new world.', '\nFertig! Jede Kante passt zu ihrem Nachbarn. Fang neu an für eine neue Welt.');
    else if (nx) text += tr(`\nNext: the gold-framed cube (${nx.dom.length} options).`, `\nAls Nächstes: der gold umrandete Würfel (${nx.dom.length} Optionen).`);
    if (hover && wfc.tiles.get(hover)) { const t = wfc.tiles.get(hover); text = tr(`${hover}: ${t.kind}, edges ${t.sock.join(' ')}, ${t.K} layers`, `${hover}: ${t.kind}, Kanten ${t.sock.join(' ')}, ${t.K} Ebenen`); }
    out.innerHTML = text;
  }
  c.onpointermove = e => { const [x, y] = at(e), cx = Math.floor((x - ox) / S), cz = Math.floor((y - oy) / S);
    const k = cx >= 0 && cz >= 0 && cx < COLS && cz < ROWS ? `${cx},${Y},${cz}` : null; if (k !== hover) { hover = k; draw(); } };
  c.onpointerleave = () => { hover = null; draw(); };
  $('.step').onclick = () => { step(); draw(); };
  $('.play').onclick = () => { playing = !playing; $('.play').textContent = playing ? tr('Pause', 'Pause') : PLAY(); };
  $('.fill').onclick = () => { while (step()); draw(); };
  $('.reset').onclick = reset;
  $('.depth').onchange = reset;
  loop(el, dt => {
    if (!playing) return;
    if ((acc += dt) > 0.18) { acc = 0; step(); draw(); }
  });
  reset();
}
