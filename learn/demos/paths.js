// Path finding on a grid you can draw walls on:
//   flood (default): breadth-first search like the enemies' findPath (src/physics/enemynav.js)
//                    and A* like the generator's route search (src/cubegen/route.js, with the
//                    game's binary heap from src/core/heap.js)
//   sight:           line of sight like clearLine: small steps along the line, checking each one
import { Heap } from '../../src/core/heap.js';
import { canvas, loop, html, t as tr } from '../deck.js';

const C = 26, R = 15, S = 24;

export default function mount(el) {
  const sight = el.dataset.mode === 'sight';
  const W = C * S, H = R * S, { g, c, at } = canvas(el, W, H);
  const row = html(el, sight
    ? `<div class="row"><span class="muted small">${tr('drag the two dots, draw walls with the mouse', 'zieh die zwei Punkte, mal Wände mit der Maus')}</span><button class="rnd">${tr('Random walls', 'Zufällige Wände')}</button><button class="clr">${tr('Clear walls', 'Wände weg')}</button></div>`
    : `<div class="row"><button class="bfs">${tr('Flood (BFS)', 'Flut (BFS)')}</button><button class="astar">${tr('A* search', 'A*-Suche')}</button>
       <button class="rnd">${tr('Random walls', 'Zufällige Wände')}</button><button class="clr">${tr('Clear walls', 'Wände weg')}</button>
       <span class="muted small">${tr('draw walls with the mouse, drag the dots', 'mal Wände mit der Maus, zieh die Punkte')}</span></div>`);
  const out = html(el, '<div class="out"></div>');
  const wall = new Uint8Array(C * R);
  const A = sight ? [3.5, 7.5] : [2, 7], B = sight ? [22.5, 6.5] : [23, 7];
  let order = [], dist = null, path = [], shown = 0, algo = null, want = null, drag = null, paint = 0;

  const idx = (x, z) => z * C + x;
  const cellOf = p => [Math.floor(p[0]), Math.floor(p[1])];
  function randomWalls() {
    wall.fill(0);
    for (let i = 0; i < C * R; i++) if (Math.random() < 0.28) wall[i] = 1;
    wall[idx(...cellOf(A))] = wall[idx(...cellOf(B))] = 0;
    reset();
  }
  function reset() { order = []; path = []; shown = 0; algo = null; dist = null; draw(); }
  const nbrs = i => { const x = i % C, z = (i / C) | 0, n = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = z + dz; if (a >= 0 && b >= 0 && a < C && b < R && !wall[idx(a, b)]) n.push(idx(a, b)); }
    return n; };

  // breadth-first: everything 1 step away, then 2, then 3 ... (the ripple)
  function bfs(s, t) {
    const prev = new Int32Array(C * R).fill(-2), d = new Int32Array(C * R).fill(-1), seen = [];
    prev[s] = -1; d[s] = 0;
    let front = [s];
    while (front.length && prev[t] === -2) {
      const next = [];
      for (const f of front) for (const n of nbrs(f)) if (prev[n] === -2) { prev[n] = f; d[n] = d[f] + 1; next.push(n); seen.push(n); }
      front = next;
    }
    return { prev, d, seen };
  }
  // A*: always continue from the square with the smallest (steps so far + guessed steps left)
  function astar(s, t) {
    const gs = new Float64Array(C * R).fill(Infinity), prev = new Int32Array(C * R).fill(-2), closed = new Uint8Array(C * R), seen = [];
    const guess = i => Math.abs(i % C - t % C) + Math.abs(((i / C) | 0) - ((t / C) | 0));
    const open = new Heap();
    gs[s] = 0; prev[s] = -1; open.push(guess(s), s);
    while (open.size) {
      const cur = open.pop();
      if (cur === t) break;
      if (closed[cur]) continue;
      closed[cur] = 1; if (cur !== s) seen.push(cur);
      for (const n of nbrs(cur)) {
        const ng = gs[cur] + 1;
        if (ng < gs[n]) { gs[n] = ng; prev[n] = cur; open.push(ng + guess(n), n); }
      }
    }
    return { prev, d: gs, seen };
  }
  function run(which) {
    const s = idx(...cellOf(A)), t = idx(...cellOf(B));
    const r = which === 'bfs' ? bfs(s, t) : astar(s, t);
    algo = want = which; order = r.seen; dist = r.d; shown = 0; path = [];
    if (r.prev[t] !== -2) for (let i = t; i !== -1; i = r.prev[i]) path.unshift(i);
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const visible = new Set(order.slice(0, shown));
    const maxD = Math.max(1, ...order.map(i => dist?.[i] ?? 0).filter(Number.isFinite));
    for (let z = 0; z < R; z++) for (let x = 0; x < C; x++) {
      const i = idx(x, z);
      g.fillStyle = wall[i] ? '#5a4a3a' : visible.has(i)
        ? `hsl(${190 + 120 * (dist[i] / maxD)} 55% ${algo === 'bfs' ? 30 : 34}%)` : '#141922';
      g.fillRect(x * S + 1, z * S + 1, S - 2, S - 2);
      if (wall[i]) { g.fillStyle = '#7a6448'; g.fillRect(x * S + 1, z * S + 1, S - 2, 5); }
    }
    if (!sight && shown >= order.length && path.length) {
      g.strokeStyle = '#ffcf7a'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
      path.forEach((i, j) => { const x = (i % C + 0.5) * S, y = (((i / C) | 0) + 0.5) * S; j ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
    if (sight) drawSight();
    for (const [p, col, label] of [[A, '#61dc6b', sight ? tr('eye', 'Auge') : 'S'], [B, '#ff6a5a', sight ? tr('you', 'du') : tr('G', 'Z')]]) {
      const [x, y] = sight ? p : [p[0] + 0.5, p[1] + 0.5];
      g.fillStyle = col; g.beginPath(); g.arc(x * S, y * S, S * 0.38, 0, 7); g.fill();
      g.fillStyle = '#0b0d12'; g.font = `bold ${label.length > 1 ? 9 : 12}px 'Cinzel', serif`; g.textAlign = 'center'; g.fillText(label, x * S, y * S + 4); g.textAlign = 'left';
    }
    if (!sight) {
      const looked = Math.min(shown, order.length);
      out.innerHTML = algo
        ? tr(`${algo === 'bfs' ? 'Flood (BFS)' : 'A*'} looked at <b>${looked}</b> squares`, `${algo === 'bfs' ? 'Flut (BFS)' : 'A*'} hat <b>${looked}</b> Felder angeschaut`)
          + (shown >= order.length ? (path.length ? tr(`, the path is <b>${path.length - 1}</b> steps long.`, `, der Weg ist <b>${path.length - 1}</b> Schritte lang.`) : tr(', and found <b>no way</b>!', ' und <b>keinen Weg</b> gefunden!')) : '\u2026')
        : tr('Press a button to search. Then draw some walls and compare the two.', 'Drück einen Knopf zum Suchen. Dann mal ein paar Wände und vergleiche die beiden.');
    }
  }
  // the line of sight, checked every 0.15 cells like clearLine
  function drawSight() {
    const n = Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 0.15);
    let blocked = null;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
      if (wall[idx(Math.floor(x), Math.floor(y))]) { blocked = [x, y, i]; break; }
    }
    const end = blocked ?? B, steps = blocked ? blocked[2] : n;
    g.strokeStyle = blocked ? '#ff6a5a' : '#61dc6b'; g.lineWidth = 2; g.beginPath(); g.moveTo(A[0] * S, A[1] * S); g.lineTo(end[0] * S, end[1] * S); g.stroke();
    g.fillStyle = '#ffffffaa';
    for (let i = 1; i < steps; i++) { const t = i / n; g.fillRect((A[0] + (B[0] - A[0]) * t) * S - 1, (A[1] + (B[1] - A[1]) * t) * S - 1, 2, 2); }
    if (blocked) { g.strokeStyle = '#ff6a5a'; g.lineWidth = 3; g.beginPath(); g.arc(end[0] * S, end[1] * S, 7, 0, 7); g.stroke(); }
    out.innerHTML = blocked ? tr(`Blocked after <b>${steps}</b> little steps: the eye cannot see you.`, `Blockiert nach <b>${steps}</b> kleinen Schritten: das Auge kann dich nicht sehen.`)
      : tr(`All <b>${n}</b> little steps are free: <b>it sees you!</b>`, `Alle <b>${n}</b> kleinen Schritte sind frei: <b>es sieht dich!</b>`);
  }

  c.onpointerdown = e => {
    const [x, y] = at(e), p = [x / S, y / S];
    const near = q => Math.hypot((sight ? q[0] : q[0] + 0.5) - p[0], (sight ? q[1] : q[1] + 0.5) - p[1]) < 0.8;
    drag = near(A) ? A : near(B) ? B : null;
    if (!drag) { const i = idx(...cellOf(p)); paint = wall[i] ? 0 : 1; wall[i] = paint; if (!sight) reset(); else draw(); }
    c.setPointerCapture(e.pointerId);
  };
  c.onpointermove = e => {
    if (!e.buttons) return;
    const [x, y] = at(e), p = [Math.max(0, Math.min(C - 0.01, x / S)), Math.max(0, Math.min(R - 0.01, y / S))];
    if (drag) {
      if (sight) { drag[0] = p[0]; drag[1] = p[1]; } else { [drag[0], drag[1]] = cellOf(p); wall[idx(...drag)] = 0; }
      if (!sight) reset(); else draw();
    } else { const i = idx(...cellOf(p)); if (wall[i] !== paint && !(i === idx(...cellOf(A)) || i === idx(...cellOf(B)))) { wall[i] = paint; if (!sight) reset(); else draw(); } }
  };
  c.onpointerup = () => { if (!sight && want) { run(want); shown = order.length; draw(); } drag = null; };
  row.querySelector('.rnd').onclick = randomWalls;
  row.querySelector('.clr').onclick = () => { wall.fill(0); reset(); };
  if (!sight) {
    row.querySelector('.bfs').onclick = () => run('bfs');
    row.querySelector('.astar').onclick = () => run('astar');
    loop(el, () => { if (algo && shown < order.length) { shown += Math.max(2, Math.ceil(order.length / 90)); draw(); } });
  }
  // a few walls to start with
  for (let z = 2; z < 13; z++) wall[idx(12, z)] = 1;
  for (let x = 6; x < 12; x++) wall[idx(x, 11)] = 1;
  if (sight) for (let z = 3; z < 11; z++) wall[idx(13, z)] = 1;
  draw();
}
