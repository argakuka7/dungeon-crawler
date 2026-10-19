// Recolouring a species into a kind with the game's own colour math (src/core/oklch.js): pick a
// new colour for the snake's skin (the anchor), and its darker ribs follow along, keeping their
// difference. The kinds' real colours (src/core/enemies.js) are one click away.
import { recolorFn, toLinear, toHex } from '../../src/core/oklch.js';
import { SNAKE, SAND_VIPER, BLOOD_VIPER, FROST_ADDER, VENOM_ADDER, SHADOW_MAMBA } from '../../src/core/enemies.js';
import { html, t as tr } from '../deck.js';

// the snake's own material colours (BODY_HEX, RING_HEX in blender/snake.py, EYE_HEX in creature.py)
const BASE = { skin: '#a6dd7e', ribs: '#78b552', eyes: '#9b3dff' };
const KINDS = [SNAKE, SAND_VIPER, BLOOD_VIPER, FROST_ADDER, VENOM_ADDER, SHADOW_MAMBA];

export default function mount(el) {
  const box = html(el, `<div><div class="row">${KINDS.map((k, i) => `<button data-k="${i}">${k.label}</button>`).join('')}</div>
    <div class="row"><label>${tr('lightness', 'Helligkeit')} <input type="range" class="l" min="0.2" max="0.95" step="0.01" value="0.6"></label>
    <label>${tr('colourfulness', 'Buntheit')} <input type="range" class="c" min="0" max="0.25" step="0.005" value="0.19"></label>
    <label>${tr('hue', 'Farbton')} <input type="range" class="h" min="0" max="360" value="27"></label></div>
    <svg viewBox="0 0 640 170" style="width:100%;margin-top:8px;background:#070910;border-radius:4px"></svg></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => box.querySelector(s);
  function draw(op, eyesOp) {
    const skin = toLinear(BASE.skin), f = recolorFn(op, skin), ef = eyesOp ? recolorFn(eyesOp, toLinear(BASE.eyes)) : x => x;
    const col = { skin: toHex(f(skin)), ribs: toHex(f(toLinear(BASE.ribs))), eyes: toHex(ef(toLinear(BASE.eyes))) };
    // a snake drawn as a wavy chain of segments: skin with rib bands, and eyes
    let segs = '';
    for (let i = 0; i < 22; i++) {
      const x = 90 + i * 20, y = 110 + Math.sin(i * 0.55) * 22, r = 18 - Math.abs(i - 6) * 0.45;
      segs += `<circle cx="${x}" cy="${y}" r="${Math.max(7, r)}" fill="${i % 3 ? col.skin : col.ribs}"/>`;
    }
    $('svg').innerHTML = `${segs}<circle cx="520" cy="60" r="34" fill="${col.skin}"/><circle cx="508" cy="50" r="8" fill="${col.eyes}"/><circle cx="534" cy="50" r="8" fill="${col.eyes}"/>
      <rect x="20" y="16" width="26" height="26" fill="${BASE.skin}"/><rect x="50" y="16" width="26" height="26" fill="${BASE.ribs}"/>
      <text x="20" y="58" fill="#8a96a8" font-size="14" font-family="'Crimson Text', serif">${tr('before', 'vorher')}</text>
      <rect x="110" y="16" width="26" height="26" fill="${col.skin}"/><rect x="140" y="16" width="26" height="26" fill="${col.ribs}"/>
      <text x="110" y="58" fill="#8a96a8" font-size="14" font-family="'Crimson Text', serif">${tr('after', 'nachher')}</text>`;
    out.innerHTML = tr(`skin <b>${col.skin}</b> \u00B7 ribs <b>${col.ribs}</b> (they moved together) \u00B7 recipe: <b>${typeof op === 'string' ? op : 'the original snake'}</b>`,
      `Haut <b>${col.skin}</b> \u00B7 Rippen <b>${col.ribs}</b> (sie sind zusammen gewandert) \u00B7 Rezept: <b>${typeof op === 'string' ? op : 'die ursprüngliche Schlange'}</b>`);
  }
  const fromSliders = () => draw(`oklch(${$('.l').value} ${$('.c').value} ${$('.h').value})`);
  box.querySelectorAll('input').forEach(i => i.oninput = fromSliders);
  box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = KINDS[+b.dataset.k];
    if (!k.colors) return draw({}, null);
    const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(k.colors.skin);
    if (m) { $('.l').value = m[1]; $('.c').value = m[2]; $('.h').value = m[3]; }
    draw(k.colors.skin, k.colors.eyes);
  });
  fromSliders();
}
