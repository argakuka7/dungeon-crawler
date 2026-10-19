// Weighted random, the way the game picks almost everything: lay the weights end to end on a
// line, throw a random point onto it and walk along the line, subtracting each weight until
// the point is passed. The weights are the real rarity weights (src/core/gear/rarities.js).
import { RARITIES } from '../../src/core/gear/rarities.js';
import { canvas, loop, html, t as tr } from '../deck.js';

export default function mount(el) {
  const items = RARITIES.slice(0, 4).map(r => ({ name: r.name, w: r.weight, color: r.css, n: 0 }));
  const total = items.reduce((s, i) => s + i.w, 0);
  const { g, w, h } = canvas(el, 640, 200);
  const row = html(el, `<div class="row"><button class="one">${tr('Pick one marble', 'Eine Murmel ziehen')}</button><button class="many">${tr('Pick 1,000', '1.000 ziehen')}</button><button class="clear">${tr('Empty the counts', 'Zähler leeren')}</button></div>`);
  const out = html(el, '<div class="out"></div>');
  const X0 = 20, X1 = w - 20, sx = v => X0 + v / total * (X1 - X0);
  let needle = null, anim = 0, picks = 0, steps = [];

  function pick(r) {   // r in 0..total; returns the index and the steps of the walk
    const walk = [];
    for (let i = 0; i < items.length; i++) {
      walk.push(`${r.toFixed(1)} - ${items[i].w} = ${(r - items[i].w).toFixed(1)}`);
      if ((r -= items[i].w) < 0) return [i, walk];
    }
    return [items.length - 1, walk];
  }
  row.querySelector('.one').onclick = () => {
    const r = Math.random() * total, [i, walk] = pick(r);
    items[i].n++; picks++; needle = { r, i }; anim = 0; steps = walk;
  };
  row.querySelector('.many').onclick = () => {
    for (let k = 0; k < 1000; k++) items[pick(Math.random() * total)[0]].n++;
    picks += 1000; needle = null; steps = [];
  };
  row.querySelector('.clear').onclick = () => { items.forEach(i => { i.n = 0; }); picks = 0; needle = null; steps = []; };

  loop(el, dt => {
    anim = Math.min(1, anim + dt * 2.5);
    g.clearRect(0, 0, w, h);
    g.font = "15px 'Crimson Text', serif";
    let at = 0;
    for (const it of items) {   // the line of weights
      g.fillStyle = it.color; g.globalAlpha = needle && needle.i !== items.indexOf(it) ? 0.35 : 0.9;
      g.fillRect(sx(at) + 1, 40, sx(at + it.w) - sx(at) - 2, 34);
      g.globalAlpha = 1; g.fillStyle = '#0b0d12';
      if (sx(at + it.w) - sx(at) > 60) g.fillText(`${it.name} ${it.w}`, sx(at) + 6, 62);
      at += it.w;
    }
    g.fillStyle = '#8a96a8'; g.fillText('0', X0 - 4, 90); g.fillText(String(total), X1 - 10, 90);
    if (needle) {   // the needle drops onto the line
      const x = sx(needle.r), y = 6 + 30 * anim;
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x, y + 12); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y - 6); g.lineTo(x, y + 2); g.fill();
    }
    // counts: what we got against what the weights promise
    items.forEach((it, i) => {
      const y = 110 + i * 22, share = picks ? it.n / picks : 0, want = it.w / total;
      g.fillStyle = '#e6e9ef'; g.fillText(it.name, X0, y + 12);
      g.fillStyle = '#2a2f3a'; g.fillRect(110, y, 400, 15);
      g.fillStyle = it.color; g.fillRect(110, y, 400 * share, 15);
      g.strokeStyle = '#ffcf7a'; g.beginPath(); g.moveTo(110 + 400 * want, y - 2); g.lineTo(110 + 400 * want, y + 17); g.stroke();
      g.fillStyle = '#aab3c2'; g.fillText(`${it.n}  (${(share * 100).toFixed(1)}%)`, 520, y + 12);
    });
    out.innerHTML = needle
      ? `${tr('random point', 'Zufallspunkt')}: <b>${needle.r.toFixed(1)}</b> \u2192 ${tr('walk along', 'entlanglaufen')}: ${steps.join(tr(', then ', ', dann '))} \u2192 ${tr('below zero, so it is', 'unter null, also ist es')} <b style="color:${items[needle.i].color}">${items[needle.i].name}</b>`
      : picks ? tr(`<b>${picks}</b> marbles picked. The gold lines show the share the weights promise.`, `<b>${picks}</b> Murmeln gezogen. Die goldenen Striche zeigen den Anteil, den die Gewichte versprechen.`) : tr('Pick one marble to watch the walk along the line.', 'Zieh eine Murmel und schau dem Weg entlang der Linie zu.');
  });
}
