// Every depth's look, read straight from the game's theme tables (src/themes/index.js and
// caves.js): the sky, the colours of the ground by height, the river, the song. A depth with
// several themes lists them all; each world picks one of them.
import { SLOTS } from '../../src/themes/index.js';
import { MAX_DEPTH } from '../../src/themes/depth.js';
import { html, t as tr, themeLabel } from '../deck.js';

const FLUID = () => ({ 1: ['#2e86de', tr('water', 'Wasser')], 2: ['#ff5a00', tr('lava', 'Lava')], 3: ['#7dff3a', tr('acid', 'Säure')] });

export default function mount(el) {
  const rows = SLOTS.flatMap((s, i) => s.themes.map((t, j) => ({ t, at: s.at, to: (SLOTS[i + 1]?.at ?? MAX_DEPTH + 1) - 1, first: !j })))
    .map(({ t, at, to, first }) => {
    const sky = t.light.sky;
    const sw = (c, w = 22) => `<i style="display:inline-block;width:${w}px;height:16px;background:${c};vertical-align:middle"></i>`;
    return `<tr><td class="mono">${!first ? tr('or', 'oder') : at === to ? at : `${at}\u2013${to}`}</td><td><b>${themeLabel(t)}</b>${t.cave ? ` <span class="muted small">(${tr('cave', 'Höhle')})</span>` : ''}</td>
      <td><i style="display:inline-block;width:60px;height:16px;vertical-align:middle;background:linear-gradient(${sky[0]},${sky[1]})"></i></td>
      <td>${t.top.map(([, c]) => sw(c, 14)).join('')}</td><td>${t.side.map(([, c]) => sw(c, 14)).join('')}</td>
      <td>${sw(FLUID()[t.river][0], 14)} <span class="small">${FLUID()[t.river][1]}</span></td><td class="mono small">${t.music}</td></tr>`;
  });
  html(el, `<div style="overflow:auto"><table><tr>${tr(['DEPTH', 'THEME', 'SKY', 'GROUND (LOW TO HIGH)', 'CLIFFS', 'RIVERS', 'SONG'], ['TIEFE', 'THEMA', 'HIMMEL', 'BODEN (TIEF BIS HOCH)', 'KLIPPEN', 'FLÜSSE', 'LIED']).map(h => `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table></div>`);
}
