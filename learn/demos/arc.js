// Did the blade hit? The game's real test, inSwordArc (src/core/combat.js), with a player and a
// spider you can drag around: close enough, inside the arc, and at the right height.
import { SWORD, inSwordArc } from '../../src/core/combat.js';
import { WEAPONS as ALL } from '../../src/core/items.js';
import { SPIDER, STUNDER } from '../../src/core/enemies.js';
import { canvas, loop, html, t as tr } from '../deck.js';

const WEAPONS = ALL.filter(w => w.weapon.kind === 'sword');   // the swords: they swing

export default function mount(el) {
  const W = 640, H = 320, PX = 120, { g, c, at } = canvas(el, W, H);
  const row = html(el, `<div class="row"><label>${tr('sword', 'Schwert')} <select class="w">${WEAPONS.map((w, i) => `<option value="${i}">${w.name}</option>`).join('')}</select></label>
    <label>${tr('enemy', 'Gegner')} <select class="e"><option value="spider">${tr('spider', 'Spinne')}</option><option value="stunder">${tr('Stunder (big)', 'Stunder (groß)')}</option></select></label>
    <label>${tr('enemy stands', 'Gegner steht')} <input type="range" class="h" min="-1.5" max="1.5" step="0.05" value="0"> <b class="hv">0</b> ${tr('higher', 'höher')}</label>
    <label>${tr('hero turns', 'Held dreht sich')} <input type="range" class="turn" min="-180" max="180" value="0"></label></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  const player = { x: 1.5, y: 0, z: H / PX / 2, sword: null };
  const enemy = { x: 2.3, y: 0, z: H / PX / 2 - 0.3, mode: 'chase', profile: SPIDER };
  let drag = false, yaw = Math.PI / 2;   // facing +x (the game's yaw: atan2(dx, dz))

  function draw() {
    const w = WEAPONS[+$('.w').value].weapon;
    const stats = { ...SWORD, range: w.range, arc: SWORD.arc * w.arc, activeStart: SWORD.activeStart, activeEnd: SWORD.activeEnd };
    enemy.profile = $('.e').value === 'spider' ? SPIDER : STUNDER;
    enemy.y = +$('.h').value; $('.hv').textContent = enemy.y.toFixed(2);
    yaw = Math.PI / 2 - +$('.turn').value * Math.PI / 180;
    // the real test: a swing in its contact window, aimed along yaw
    player.sword = { active: true, t: stats.activeStart, stats, yaw, hits: new Set() };
    const hit = inSwordArc(player, enemy);
    // the three parts of it, to show
    const dx = enemy.x - player.x, dz = enemy.z - player.z, d = Math.hypot(dx, dz), reach = stats.range + enemy.profile.radius;
    const near = d <= reach, inArc = d <= 0.01 || Math.cos(Math.atan2(dx, dz) - yaw) >= Math.cos(stats.arc);
    const height = enemy.y + enemy.profile.bodyHeight > player.y + 0.08 && enemy.y < player.y + 0.85;
    g.clearRect(0, 0, W, H);
    const X = x => x * PX, Y = z => z * PX;
    // grid of cells
    g.strokeStyle = '#ffffff0d'; for (let i = 0; i < W / PX; i++) { g.beginPath(); g.moveTo(i * PX, 0); g.lineTo(i * PX, H); g.stroke(); }
    for (let i = 0; i < H / PX; i++) { g.beginPath(); g.moveTo(0, i * PX); g.lineTo(W, i * PX); g.stroke(); }
    // the reach (blade + the enemy's body radius) and the arc
    const screenYaw = Math.atan2(Math.cos(yaw), Math.sin(yaw));   // game yaw -> canvas angle
    g.fillStyle = hit ? '#ffcf7a30' : '#51a9ff1c';
    g.beginPath(); g.moveTo(X(player.x), Y(player.z)); g.arc(X(player.x), Y(player.z), reach * PX, screenYaw - stats.arc, screenYaw + stats.arc); g.closePath(); g.fill();
    g.strokeStyle = '#51a9ff66'; g.setLineDash([5, 5]); g.beginPath(); g.arc(X(player.x), Y(player.z), reach * PX, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#e6e9ef'; g.beginPath(); g.arc(X(player.x), Y(player.z), 0.22 * PX, 0, 7); g.fill();
    g.strokeStyle = '#c8d0dc'; g.lineWidth = 4; g.beginPath(); g.moveTo(X(player.x), Y(player.z));
    g.lineTo(X(player.x + Math.sin(yaw) * stats.range), Y(player.z + Math.cos(yaw) * stats.range)); g.stroke();
    g.fillStyle = hit ? '#ffcf7a' : '#ff6a5a'; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(X(enemy.x), Y(enemy.z), enemy.profile.radius * PX, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = '#0b0d12'; g.font = "bold 11px 'Cinzel', serif"; g.textAlign = 'center';
    g.fillText(hit ? tr('HIT', 'TREFFER') : tr('drag me', 'zieh mich'), X(enemy.x), Y(enemy.z) + 4); g.textAlign = 'left';
    // side view of the heights, bottom right
    const sx = W - 150, sy = H - 20, S = 60;
    g.fillStyle = '#0b0d12cc'; g.fillRect(sx - 10, sy - 170, 150, 180);
    g.fillStyle = '#8a96a8'; g.font = "14px 'Crimson Text', serif"; g.fillText(tr('from the side', 'von der Seite'), sx, sy - 155);
    g.fillStyle = '#ffcf7a33'; g.fillRect(sx, sy - (0.85) * S, 130, (0.85 - 0.08) * S);
    g.fillStyle = '#ffcf7a'; g.fillText(tr('blade height', 'Klingenhöhe'), sx + 40, sy - 0.5 * S);
    g.fillStyle = '#e6e9ef'; g.fillRect(sx + 6, sy - 0.85 * S, 12, 0.85 * S);
    g.fillStyle = height ? '#61dc6b' : '#ff6a5a'; g.globalAlpha = 0.8;
    g.fillRect(sx + 90, sy - (enemy.y + enemy.profile.bodyHeight) * S, 26, enemy.profile.bodyHeight * S); g.globalAlpha = 1;
    g.fillStyle = '#5a6678'; g.fillRect(sx - 10, sy, 150, 2);
    const chip = (ok, text) => `<span class="chip ${ok ? 'ok' : 'no'}">${ok ? '\u2713' : '\u2717'} ${text}</span>`;
    out.innerHTML = chip(near, `${tr('close enough', 'nah genug')} (${d.toFixed(2)} \u2264 ${reach.toFixed(2)})`) + chip(inArc, tr('inside the arc', 'im Bogen')) + chip(height, tr('at blade height', 'auf Klingenhöhe'))
      + `\ninSwordArc() ${tr('says', 'sagt')}: <b style="color:${hit ? '#ffcf7a' : '#ff8a7a'}">${hit ? tr('HIT!', 'TREFFER!') : tr('miss', 'daneben')}</b>`;
  }
  c.onpointerdown = e => { drag = true; c.setPointerCapture(e.pointerId); move(e); };
  c.onpointermove = e => { if (drag) move(e); };
  c.onpointerup = () => { drag = false; };
  function move(e) { const [x, y] = at(e); enemy.x = x / PX; enemy.z = y / PX; }
  row.querySelectorAll('select, input').forEach(i => i.oninput = draw);
  loop(el, draw);
}
