// The cutaway from the side, like src/game/cut.js: rays from the hero's chest towards the camera
// are probed in small steps; the first solid in the way sets how deep the cut goes (just under
// a floor above, or snapped to the terrain levels). Everything above the cut and in front of
// the hero is drawn as faint glass. The cut springs open fast and closes slowly.
import { canvas, loop, html, t as tr } from '../deck.js';

const PX = 40, LH = 0.5, STEP = 0.12, PITCH = 44 * Math.PI / 180;
// solids in a side view: [x0, x1, bottom, top] in game units
const SOLIDS = [[0, 16, -0.6, 1.5], [10.5, 16, 1.5, 3.5], [3, 10, 3.5, 4.0], [3, 3.4, 1.5, 3.5], [9.6, 10, 1.5, 3.5], [12.5, 15, 3.5, 6.5]];
const GROUND = [0, 1, 5];   // what the hero can stand on (it walks under the floor above and between its pillars)

export default function mount(el) {
  const W = 640, H = 300, { g, c, at } = canvas(el, W, H);
  const row = html(el, `<div class="row"><label><input type="checkbox" class="on" checked> ${tr('cutaway', 'Ausschnitt')}</label>
    <label><input type="checkbox" class="ray" checked> ${tr('show the probe', 'Sonde zeigen')}</label><span class="muted small">${tr('drag the hero left and right', 'zieh den Helden nach links und rechts')}</span></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  const hero = { x: 6, y: 1.5 };
  let cut = Infinity, hold = 0, drag = false;
  const inside = (x, y) => SOLIDS.some(([a, b, lo, hi]) => x >= a && x < b && y > lo && y < hi);
  const groundAt = x => Math.max(...GROUND.map(i => SOLIDS[i]).filter(([a, b]) => x >= a && x < b).map(s => s[3]));
  const TOP = 7;
  // walk from (x, y) towards the camera; the height of the first solid (Infinity if clear)
  function blockedAt(x, y) {
    const dx = Math.cos(PITCH), dy = Math.sin(PITCH), probes = [];
    for (let t = STEP; ; t += STEP) {
      const px = x + dx * t, py = y + dy * t;
      if (py > TOP || px > 16) return { h: Infinity, probes };
      probes.push([px, py]);
      if (inside(px, py)) return { h: py, probes, at: [px, py] };
    }
  }
  function target() {
    const floor = hero.y + 0.3, b = blockedAt(hero.x, hero.y + 0.6);
    if (b.h === Infinity) return { t: TOP, b };
    // prefer cutting just under a slab (the bottom of a solid floating above us) ...
    let best = -Infinity;
    for (const [, , lo] of SOLIDS) if (lo <= b.h && lo >= floor) best = Math.max(best, lo);
    // ... else snap down to the terrain levels
    if (best === -Infinity) best = Math.max(floor, Math.floor(b.h / LH) * LH - 0.02);
    return { t: best, b };
  }
  function draw(tg) {
    g.clearRect(0, 0, W, H);
    const X = x => x * PX, Y = y => H - 30 - y * PX, on = $('.on').checked;
    const cutY = on ? cut : Infinity;
    for (const [a, b, lo, hi] of SOLIDS) {
      // the part we keep: below the cut, or behind the hero (further from the camera)
      const color = lo < 1.6 && hi <= 1.5 ? '#4e382a' : lo >= 3.4 && hi <= 4.1 ? '#8a6a44' : '#6b5a48';
      g.fillStyle = color; g.fillRect(X(a), Y(hi), (b - a) * PX, (hi - lo) * PX);
      g.fillStyle = '#5c8a3c'; g.fillRect(X(a), Y(hi), (b - a) * PX, 4);
      if (cutY < hi) {   // in front of the hero and above the cut: cut away, drawn as glass
        const x0 = Math.max(a, hero.x - 0.6), y0 = Math.max(lo, cutY);
        if (x0 < b && y0 < hi) {
          g.clearRect(X(x0), Y(hi), (b - x0) * PX, (hi - y0) * PX);
          g.fillStyle = '#9ad0ff14'; g.fillRect(X(x0), Y(hi), (b - x0) * PX, (hi - y0) * PX);
          g.strokeStyle = '#9ad0ff55'; g.strokeRect(X(x0) + 0.5, Y(hi) + 0.5, (b - x0) * PX - 1, (hi - y0) * PX - 1);
          g.fillStyle = '#c9a46a'; g.fillRect(X(x0), Y(y0) - 2, (b - x0) * PX, 3);   // the flat section cap
        }
      }
    }
    // the hero
    const hx = X(hero.x), hy = Y(hero.y);
    g.fillStyle = '#e6e9ef'; g.beginPath(); g.roundRect(hx - 8, hy - 0.85 * PX, 16, 0.85 * PX, 6); g.fill();
    // the camera, far up and to the right, and the probe
    g.fillStyle = '#8a96a8'; g.font = "15px 'Crimson Text', serif"; g.fillText(tr('to the camera \u2197', 'zur Kamera \u2197'), W - 130, 18);
    if ($('.ray').checked) {
      for (const [px, py] of tg.b.probes) { g.fillStyle = '#ffffffaa'; g.fillRect(X(px) - 1, Y(py) - 1, 2, 2); }
      if (tg.b.at) { g.strokeStyle = '#ff6a5a'; g.lineWidth = 2; g.beginPath(); g.arc(X(tg.b.at[0]), Y(tg.b.at[1]), 6, 0, 7); g.stroke(); }
    }
    if (on && cut < TOP) { g.strokeStyle = '#ffcf7a'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(X(hero.x - 0.6), Y(cut)); g.lineTo(W, Y(cut)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffcf7a'; g.fillText(`${tr('cut at', 'Schnitt bei')} ${cut.toFixed(2)}`, X(hero.x) + 14, Y(cut) - 6); }
    out.innerHTML = tg.b.h === Infinity ? tr('Nothing between the hero and the camera: no cut needed.', 'Nichts zwischen Held und Kamera: kein Schnitt nötig.')
      : tr(`The probe hit something at height <b>${tg.b.h.toFixed(2)}</b> after ${tg.b.probes.length} little steps. The cut goes to <b>${tg.t.toFixed(2)}</b>${on ? '' : ' (but the cutaway is off: where is the hero?)'}.`,
        `Die Sonde ist nach ${tg.b.probes.length} kleinen Schritten in Höhe <b>${tg.b.h.toFixed(2)}</b> auf etwas gestoßen. Der Schnitt geht bis <b>${tg.t.toFixed(2)}</b>${on ? '' : ' (aber der Ausschnitt ist aus: wo ist der Held?)'}.`);
  }
  c.onpointerdown = e => { drag = true; c.setPointerCapture(e.pointerId); move(e); };
  c.onpointermove = e => { if (drag) move(e); };
  c.onpointerup = () => { drag = false; };
  function move(e) {
    const [x] = at(e), nx = Math.max(0.4, Math.min(15.6, x / PX));
    if ([3, 4].some(i => nx > SOLIDS[i][0] - 0.2 && nx < SOLIDS[i][1] + 0.2)) return;   // the pillars are in the way
    hero.x = nx; hero.y = groundAt(nx);
  }
  hero.y = groundAt(hero.x);
  loop(el, dt => {
    const tg = target();
    if (cut === Infinity) cut = tg.t;
    if (tg.t > cut + 1e-3) { if ((hold -= dt) <= 0) cut += (tg.t - cut) * Math.min(1, dt * 8); }   // restore: only after a while, slowly
    else { hold = 1; cut += (tg.t - cut) * Math.min(1, dt * 25); }                                // reveal: right away, fast
    draw(tg);
  });
}
