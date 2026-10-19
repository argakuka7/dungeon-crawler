// The experience curve, from the game's own rules: how much XP every level costs (xpToNext,
// src/core/progression.js), and how many spiders that is when you fight spiders two levels below
// you, as the game is tuned (their XP grows by level, src/core/enemies.js; xpScale), or Stunders.
import { xpToNext, xpScale } from '../../src/core/progression.js';
import { SPIDER, STUNDER, enemyProfile } from '../../src/core/enemies.js';
import { canvas, html, t as tr, lang } from '../deck.js';

const MAX = 24;
const fmt = v => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US').format(v);
const xpOf = (kind, level) => { const l = Math.max(1, level - 2); return Math.round(enemyProfile(kind, l).xp * xpScale(level, l)); };

export default function mount(el) {
  const W = 620, H = 260, { c, g, at } = canvas(el, W, H);
  const out = html(el, '<div class="out"></div>');
  const L = 40, B = 30, bw = (W - L - 10) / MAX, top = Math.max(...Array.from({ length: MAX }, (_, i) => xpToNext(i + 1)));
  let pick = 5;

  function draw() {
    g.clearRect(0, 0, W, H);
    const y = v => H - B - v / top * (H - B - 16);
    g.font = "13px 'Crimson Text', serif"; g.textAlign = 'right'; g.fillStyle = '#8a96a8';
    for (let v = 0; v <= top; v += 10000) { g.fillText(fmt(v), L - 4, y(v) + 3); g.fillStyle = '#ffffff10'; g.fillRect(L, y(v), W - L - 10, 1); g.fillStyle = '#8a96a8'; }
    for (let i = 1; i <= MAX; i++) {
      const x = L + (i - 1) * bw;
      g.fillStyle = i === pick ? '#ffcf7a' : '#51a9ff';
      g.fillRect(x + 2, y(xpToNext(i)), bw - 4, H - B - y(xpToNext(i)));
      g.fillStyle = '#8a96a8'; g.textAlign = 'center';
      if (i % 2 || i === pick) g.fillText(i, x + bw / 2, H - B + 13);
    }
    g.textAlign = 'center'; g.fillText(tr('your level', 'deine Stufe'), (W + L) / 2, H - 4);
    const need = xpToNext(pick), sp = xpOf(SPIDER, pick), st = xpOf(STUNDER, pick), l = Math.max(1, pick - 2);
    out.innerHTML = tr(`From level <b>${pick}</b> to ${pick + 1}: <b>${fmt(need)}</b> XP.\nA level-${l} spider gives you ${sp} XP, a level-${l} Stunder ${st}. So that's about <b>${Math.ceil(need / sp)} spiders</b>, or <b>${Math.ceil(need / st)} Stunders</b>.`,
      `Von Stufe <b>${pick}</b> auf ${pick + 1}: <b>${fmt(need)}</b> XP.\nEine Spinne auf Stufe ${l} gibt dir ${sp} XP, ein Stunder auf Stufe ${l} ${st}. Das sind also etwa <b>${Math.ceil(need / sp)} Spinnen</b> oder <b>${Math.ceil(need / st)} Stunder</b>.`);
  }
  const move = e => { const [x] = at(e); pick = Math.max(1, Math.min(MAX, Math.floor((x - L) / bw) + 1)); draw(); };
  c.addEventListener('pointermove', move);
  c.addEventListener('pointerdown', move);
  html(el, `<p class="small muted" style="margin:6px 0 0">${tr('Point at a bar.', 'Zeig auf einen Balken.')}</p>`);
  draw();
}
