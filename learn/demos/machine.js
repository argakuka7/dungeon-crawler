// Function machines: real functions from the game (src/core/), called with the number you put
// in. The code under the machine is read live from the game's file (deck.js liveCode), so what you
// see is what runs.
import { maxHealth, xpToNext, levelDamage } from '../../src/core/progression.js';
import { formatCoins } from '../../src/core/inventory.js';
import { depthLevel } from '../../src/core/enemies.js';
import { html, liveCode, t as tr, lang } from '../deck.js';

const MACHINES = [
  { name: 'maxHealth', path: 'src/core/progression.js', fn: maxHealth, input: () => tr('your level', 'dein Level'), min: 1, max: 40, value: 5,
    about: () => tr('How much health you have at a level.', 'Wie viel Gesundheit du auf einem Level hast.') },
  { name: 'xpToNext', path: 'src/core/progression.js', fn: xpToNext, input: () => tr('your level', 'dein Level'), min: 1, max: 40, value: 1,
    about: () => tr('How much experience the next level costs.', 'Wie viel Erfahrung das nächste Level kostet.') },
  { name: 'levelDamage', path: 'src/core/progression.js', fn: levelDamage, input: () => tr('your level', 'dein Level'), min: 1, max: 40, value: 10,
    about: () => tr('What your level multiplies your sword\'s damage by.', 'Womit dein Level den Schaden deines Schwerts malnimmt.') },
  { name: 'formatCoins', path: 'src/core/inventory.js', fn: formatCoins, input: () => tr('copper coins', 'Kupfermünzen'), min: 0, max: 99999, value: 1234,
    about: () => tr('Turns a pile of copper into gold (g), silver (s) and copper (c), as the bag shows it.', 'Macht aus einem Haufen Kupfer Gold (g), Silber (s) und Kupfer (c), so wie die Tasche es zeigt.') },
  { name: 'depthLevel', path: 'src/core/enemies.js', fn: depthLevel, input: () => tr('depth', 'Tiefe'), min: 0, max: 20, value: 7,
    about: () => tr('The level of the monsters at a depth.', 'Das Level der Monster in einer Tiefe.') },
];
const show = v => typeof v === 'number' ? new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 3, useGrouping: false }).format(v) : JSON.stringify(v);

export default function mount(el) {
  const row = html(el, `<div class="row">${MACHINES.map((m, i) => `<button data-i="${i}">${m.name}</button>`).join('')}</div>`);
  const box = html(el, `<div class="machine">
    <div class="in"><label class="lbl"></label><input type="number" class="val"></div>
    <div class="body"><b class="name"></b><span class="gear">\u2699</span></div>
    <div class="outv"><span class="muted small">${tr('comes out', 'heraus kommt')}</span><b class="res"></b></div></div>`);
  const call = html(el, '<div class="out"></div>');
  const code = html(el, '<pre class="mcode"></pre>');
  const $ = s => box.querySelector(s);
  let m = MACHINES[0], spin = 0;

  async function pick(i) {
    m = MACHINES[i];
    row.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
    $('.lbl').textContent = m.input();
    Object.assign($('.val'), { min: m.min, max: m.max, value: m.value });
    $('.name').textContent = m.name;
    run();
    code.dataset.code = `${m.path}#${m.name}`;
    await liveCode(code);
  }
  function run() {
    const raw = $('.val').value, x = Math.max(m.min, Math.min(m.max, Math.round(+raw || 0)));
    let out;
    try { out = show(m.fn(x)); } catch (err) { out = '\u26A0 ' + err.message; }
    $('.res').textContent = out;
    call.innerHTML = `${m.about()}\n<b>${m.name}(${x})</b> \u2192 <b>${out}</b>`;
    $('.gear').style.transform = `rotate(${spin += 90}deg)`;
  }
  row.querySelectorAll('button').forEach(b => b.onclick = () => pick(+b.dataset.i));
  $('.val').oninput = run;
  pick(0);
}
