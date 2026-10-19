// Where things are: one cube from above (N cells, src/core/constants.js) with the hero and a
// spider you can drag. What it shows depends on the slide (data-show): "where" the hero's
// position and its cell, "arrow" the arrow from the hero to the spider, "far" how far that is
// (Math.hypot, and the spider's real aggro distance), "angle" the angle the hero turns to
// (Math.atan2, as the game's monsters do), "unit" the arrow shrunk to length 1.
import { N } from '../../src/core/constants.js';
import { SPIDER } from '../../src/core/enemies.js';
import { canvas, html, t as tr, lang } from '../deck.js';

const num = (v, d = 2) => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export default function mount(el) {
  const show = el.dataset.show || 'where';
  const S = 26, M = 26, W = N * S + M * 2, { c, g, at } = canvas(el, W, W);
  const out = html(el, '<div class="out"></div>');
  const hero = { x: 4.3, z: 10.6 }, spider = { x: 10.7, z: 5.2 };
  const px = v => M + v * S;
  let drag = null;

  function arrow(x1, z1, x2, z2, color, width = 2.5) {
    const a = Math.atan2(z2 - z1, x2 - x1), L = Math.hypot(px(x2) - px(x1), px(z2) - px(z1));
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width;
    g.beginPath(); g.moveTo(px(x1), px(z1)); g.lineTo(px(x2) - Math.cos(a) * 9, px(z2) - Math.sin(a) * 9); g.stroke();
    if (L > 6) { g.beginPath(); g.moveTo(px(x2), px(z2)); g.lineTo(px(x2) - Math.cos(a - 0.4) * 11, px(z2) - Math.sin(a - 0.4) * 11); g.lineTo(px(x2) - Math.cos(a + 0.4) * 11, px(z2) - Math.sin(a + 0.4) * 11); g.fill(); }
  }
  function label(text, x, y, color = '#d8dde6', align = 'center') {
    g.font = "15px 'Crimson Text', serif"; g.textAlign = align; g.fillStyle = '#0b0d12cc';
    const w = g.measureText(text).width + 8;
    g.fillRect(align === 'center' ? x - w / 2 : align === 'left' ? x - 4 : x - w + 4, y - 11, w, 16);
    g.fillStyle = color; g.fillText(text, x, y + 1);
  }
  function token(p, color, name) {
    g.fillStyle = color; g.beginPath(); g.arc(px(p.x), px(p.z), 8, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    label(name, px(p.x), px(p.z) - 16, color);
  }

  function draw() {
    g.clearRect(0, 0, W, W);
    // the cube's cells, numbered along the edges
    g.fillStyle = '#1b2a1c'; g.fillRect(M, M, N * S, N * S);
    g.strokeStyle = '#ffffff14'; g.lineWidth = 1;
    for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(px(i), M); g.lineTo(px(i), M + N * S); g.moveTo(M, px(i)); g.lineTo(M + N * S, px(i)); g.stroke(); }
    g.font = "13px 'Crimson Text', serif"; g.fillStyle = '#8a96a8'; g.textAlign = 'center';
    for (let i = 0; i < N; i += show === 'where' ? 1 : 3) { g.fillText(i, px(i + 0.5), M - 8); g.fillText(i, M - 12, px(i + 0.5) + 3); }
    g.fillStyle = '#ffcf7a'; g.textAlign = 'left'; g.fillText('x \u2192', px(N) + 3, M - 8); g.textAlign = 'center'; g.fillText('z \u2193', M - 12, px(N) + 14);

    const dx = spider.x - hero.x, dz = spider.z - hero.z, d = Math.hypot(dx, dz);
    if (show === 'where') {
      const cx = Math.floor(hero.x), cz = Math.floor(hero.z);
      g.fillStyle = '#5fd3ff33'; g.fillRect(px(cx), px(cz), S, S);
      g.setLineDash([3, 3]); g.strokeStyle = '#5fd3ff88'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px(hero.x), M); g.lineTo(px(hero.x), px(hero.z)); g.moveTo(M, px(hero.z)); g.lineTo(px(hero.x), px(hero.z)); g.stroke(); g.setLineDash([]);
      token(hero, '#5fd3ff', tr('hero', 'Held'));
      out.innerHTML = tr(`The hero stands at <b>x = ${num(hero.x)}</b>, <b>z = ${num(hero.z)}</b>.\nIts cell: Math.floor(${num(hero.x)}) = <b>${cx}</b>, Math.floor(${num(hero.z)}) = <b>${cz}</b>. The middle of that cell is ${num(cx + 0.5, 1)}, ${num(cz + 0.5, 1)}.`,
        `Der Held steht bei <b>x = ${num(hero.x)}</b>, <b>z = ${num(hero.z)}</b>.\nSeine Zelle: Math.floor(${num(hero.x)}) = <b>${cx}</b>, Math.floor(${num(hero.z)}) = <b>${cz}</b>. Die Mitte dieser Zelle ist ${num(cx + 0.5, 1)}, ${num(cz + 0.5, 1)}.`);
      return;
    }
    if (show === 'far') {
      g.fillStyle = '#d0503a14'; g.strokeStyle = '#d0503a66'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(px(spider.x), px(spider.z), SPIDER.aggro * S, 0, 7); g.fill(); g.stroke();
      // the right triangle under the arrow
      g.setLineDash([4, 3]); g.strokeStyle = '#ffcf7a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px(hero.x), px(hero.z)); g.lineTo(px(spider.x), px(hero.z)); g.lineTo(px(spider.x), px(spider.z)); g.stroke(); g.setLineDash([]);
      label(`dx ${num(dx, 1)}`, px((hero.x + spider.x) / 2), px(hero.z) + 18, '#ffcf7a');
      label(`dz ${num(dz, 1)}`, px(spider.x) + 8, px((hero.z + spider.z) / 2), '#ffcf7a', 'left');
    }
    if (show === 'angle') {
      // the hero faces the spider; draw the angle from "south" (+z), as the game measures yaw
      const yaw = Math.atan2(dx, dz);
      g.strokeStyle = '#ffffff55'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(px(hero.x), px(hero.z)); g.lineTo(px(hero.x), px(hero.z + 3)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#ffcf7a'; g.lineWidth = 2.5; g.beginPath();
      g.arc(px(hero.x), px(hero.z), 34, Math.PI / 2, Math.PI / 2 - yaw, yaw > 0); g.stroke();
      label(`${num(yaw * 180 / Math.PI, 0)}\u00B0`, px(hero.x) + Math.sin(yaw / 2) * 52, px(hero.z) + Math.cos(yaw / 2) * 52, '#ffcf7a');
      out.innerHTML = tr(`Math.atan2(dx, dz) = Math.atan2(${num(dx, 1)}, ${num(dz, 1)}) = <b>${num(yaw)}</b> (in radians) = <b>${num(yaw * 180 / Math.PI, 0)}\u00B0</b>.\nThat's how far the hero turns from facing south (down) to face the spider. Plus turns to the right in this picture, minus to the left.`,
        `Math.atan2(dx, dz) = Math.atan2(${num(dx, 1)}, ${num(dz, 1)}) = <b>${num(yaw)}</b> (im Bogenmaß) = <b>${num(yaw * 180 / Math.PI, 0)}\u00B0</b>.\nSo weit dreht sich der Held von Süden (unten) weg, um die Spinne anzuschauen. Plus dreht in diesem Bild nach rechts, minus nach links.`);
    }
    if (show === 'unit') {
      g.strokeStyle = '#ffffff33'; g.lineWidth = 1.5; g.beginPath(); g.arc(px(hero.x), px(hero.z), S, 0, 7); g.stroke();
      arrow(hero.x, hero.z, spider.x, spider.z, '#ffffff44', 2);
      arrow(hero.x, hero.z, hero.x + dx / (d || 1), hero.z + dz / (d || 1), '#70d6aa', 4);
      out.innerHTML = tr(`The arrow is ${num(d)} long. Divide both of its numbers by that:\n${num(dx)} / ${num(d)} = <b>${num(dx / (d || 1))}</b>, ${num(dz)} / ${num(d)} = <b>${num(dz / (d || 1))}</b>\nThe green arrow points the same way, but it is exactly 1 long (it ends on the circle). Now it says only <i>which way</i>, not how far.`,
        `Der Pfeil ist ${num(d)} lang. Teile seine beiden Zahlen dadurch:\n${num(dx)} / ${num(d)} = <b>${num(dx / (d || 1))}</b>, ${num(dz)} / ${num(d)} = <b>${num(dz / (d || 1))}</b>\nDer grüne Pfeil zeigt in dieselbe Richtung, ist aber genau 1 lang (er endet auf dem Kreis). Jetzt sagt er nur noch, <i>in welche Richtung</i>, nicht wie weit.`);
    }
    if (show !== 'unit') arrow(hero.x, hero.z, spider.x, spider.z, show === 'arrow' ? '#ffcf7a' : '#ffffffaa');
    token(hero, '#5fd3ff', tr('hero', 'Held'));
    token(spider, '#ff6a5a', tr('spider', 'Spinne'));
    if (show === 'arrow') out.innerHTML = tr(`hero (${num(hero.x, 1)}, ${num(hero.z, 1)}) \u2192 spider (${num(spider.x, 1)}, ${num(spider.z, 1)})\nThe arrow: dx = ${num(spider.x, 1)} \u2212 ${num(hero.x, 1)} = <b>${num(dx, 1)}</b>, dz = ${num(spider.z, 1)} \u2212 ${num(hero.z, 1)} = <b>${num(dz, 1)}</b>\n"Go ${num(Math.abs(dx), 1)} ${dx >= 0 ? 'right' : 'left'} and ${num(Math.abs(dz), 1)} ${dz >= 0 ? 'down' : 'up'}."`,
      `Held (${num(hero.x, 1)}, ${num(hero.z, 1)}) \u2192 Spinne (${num(spider.x, 1)}, ${num(spider.z, 1)})\nDer Pfeil: dx = ${num(spider.x, 1)} \u2212 ${num(hero.x, 1)} = <b>${num(dx, 1)}</b>, dz = ${num(spider.z, 1)} \u2212 ${num(hero.z, 1)} = <b>${num(dz, 1)}</b>\n"Geh ${num(Math.abs(dx), 1)} nach ${dx >= 0 ? 'rechts' : 'links'} und ${num(Math.abs(dz), 1)} nach ${dz >= 0 ? 'unten' : 'oben'}."`);
    if (show === 'far') {
      const seen = d < SPIDER.aggro;
      out.innerHTML = tr(`Math.hypot(${num(dx, 1)}, ${num(dz, 1)}) = \u221A(${num(dx, 1)}\u00B2 + ${num(dz, 1)}\u00B2) = <b>${num(d)}</b> cells\nThe red circle is the spider's aggro distance (${SPIDER.aggro} cells): ${seen ? '<b style="color:#ff9a8a">it has noticed you!</b>' : 'it hasn\'t noticed you yet.'}`,
        `Math.hypot(${num(dx, 1)}, ${num(dz, 1)}) = \u221A(${num(dx, 1)}\u00B2 + ${num(dz, 1)}\u00B2) = <b>${num(d)}</b> Zellen\nDer rote Kreis ist die Bemerk-Entfernung der Spinne (${SPIDER.aggro} Zellen): ${seen ? '<b style="color:#ff9a8a">Sie hat dich bemerkt!</b>' : 'Sie hat dich noch nicht bemerkt.'}`);
    }
  }

  const toCube = e => { const [x, y] = at(e); return { x: Math.max(0.05, Math.min(N - 0.05, (x - M) / S)), z: Math.max(0.05, Math.min(N - 0.05, (y - M) / S)) }; };
  c.addEventListener('pointerdown', e => {
    const p = toCube(e), near = q => Math.hypot(q.x - p.x, q.z - p.z);
    drag = show === 'where' || near(hero) < near(spider) ? hero : spider;
    Object.assign(drag, p); draw();
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', e => { if (drag) { Object.assign(drag, toCube(e)); draw(); } });
  c.addEventListener('pointerup', () => { drag = null; });
  html(el, `<p class="small muted" style="margin:6px 0 0">${show === 'where' ? tr('Drag the hero around.', 'Zieh den Helden herum.') : tr('Drag the hero and the spider around.', 'Zieh den Helden und die Spinne herum.')}</p>`);
  draw();
}
