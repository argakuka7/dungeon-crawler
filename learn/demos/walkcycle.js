// Mixing walk and run, and keeping the feet planted. A stick figure from the side: its legs follow
// a walk "clip" and a run "clip" (drawn here, not the game's), mixed by speed with the same
// weights the game uses (idle -> walk -> run, copied from updateBlend in src/render/blendtree.js,
// with the game's WALK_SPEED / RUN_SPEED). When the cycle follows the speed, a foot on the ground
// moves exactly as fast as the ground; when it plays at its own pace, the feet slide.
import { WALK_SPEED, RUN_SPEED } from '../../src/core/constants.js';
import { canvas, html, loop, t as tr, lang } from '../deck.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const num = v => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
const PX = 70;   // pixels per cell
// the two "clips": how far a foot swings in front of / behind the hip (px), how high it lifts
const CLIP = { walk: { reach: 26, lift: 10, bob: 3 }, run: { reach: 44, lift: 24, bob: 7 } };

export default function mount(el) {
  const W = 560, H = 250, { g } = canvas(el, W, H);
  const row = html(el, `<div class="row"><label>${tr('speed', 'Tempo')} <input type="range" class="sp" min="0" max="${RUN_SPEED}" step="0.05" value="${WALK_SPEED}"> <b class="sv"></b></label>
    <label><input type="checkbox" class="follow" checked> ${tr('the cycle follows the speed', 'der Zyklus folgt dem Tempo')}</label></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  const GY = 210, HX = 230, THIGH = 42, SHIN = 42;
  let phase = 0, groundX = 0, slideShown = 0;

  function leg(hx, hy, fx, fy, color) {
    // two bones from the hip to the foot, the knee bending forwards
    const dx = fx - hx, dy = fy - hy, d = Math.min(THIGH + SHIN - 0.01, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx), k = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
    const kx = hx + Math.cos(a - k) * THIGH, ky = hy + Math.sin(a - k) * THIGH;
    g.strokeStyle = color; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(hx + Math.cos(a) * d, hy + Math.sin(a) * d); g.stroke();
  }
  loop(el, dt => {
    const speed = +$('.sp').value;
    // the game's weights: idle -> walk -> run
    const loco = smooth(0.05, 0.35, speed), t = clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    const w = { idle: 1 - loco, walk: loco * (1 - t), run: loco * t };
    const mix = k => (CLIP.walk[k] * w.walk + CLIP.run[k] * w.run);
    const reach = mix('reach'), lift = mix('lift'), bob = mix('bob');
    // a foot on the ground moves back 4 × reach per cycle; to keep it planted the cycle has to
    // go round speed / (4 × reach) times a second
    const ground = speed * PX, planted = reach > 0.5 ? ground / (4 * reach) : 0;
    const rate = $('.follow').checked ? planted : (speed > 0.02 ? 1.8 : 0);
    phase = (phase + dt * rate) % 1;
    groundX = (groundX + dt * ground) % 40;
    slideShown += (Math.abs(ground - 4 * reach * rate) - slideShown) * Math.min(1, dt * 6);
    const slipping = slideShown > 12;

    g.clearRect(0, 0, W, H);
    g.fillStyle = '#2a3a2a'; g.fillRect(0, GY, W, H - GY);
    g.fillStyle = '#4a6a4a';
    for (let x = -groundX; x < W; x += 40) g.fillRect(x, GY, 18, 4);
    const hy = GY - THIGH - SHIN + 8 - Math.abs(Math.sin(phase * Math.PI * 2)) * bob;
    const foot = p => {
      const s = p < 0.5;   // first half: on the ground, moving back; second half: swinging forward
      const fx = s ? reach - 4 * reach * p : -reach + 4 * reach * (p - 0.5);
      const fy = s ? 0 : Math.sin((p - 0.5) * 2 * Math.PI) * lift;
      return { x: HX + fx, y: GY - fy, s };
    };
    const back = foot((phase + 0.5) % 1), front = foot(phase);
    leg(HX, hy, back.x, back.y, '#7f8ea3');
    // the body, the head and swinging arms
    const sway = (front.x - HX) / 50;
    g.strokeStyle = '#d8dde6'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(HX, hy); g.lineTo(HX + 6 * w.run, hy - 62); g.stroke();
    g.beginPath(); g.moveTo(HX + 4, hy - 56); g.lineTo(HX + 4 - sway * 26, hy - 22); g.stroke();
    g.fillStyle = '#d8dde6'; g.beginPath(); g.arc(HX + 8 * w.run, hy - 76, 12, 0, 7); g.fill();
    leg(HX, hy, front.x, front.y, '#d8dde6');
    for (const f of [front, back]) if (f.s && speed > 0.05) { g.fillStyle = slipping ? '#ff6a5a' : '#70d6aa'; g.beginPath(); g.arc(f.x, f.y, 4, 0, 7); g.fill(); }

    // the weights as bars
    const bars = [['idle', w.idle, '#8a96a8'], ['walk', w.walk, '#51a9ff'], ['run', w.run, '#ffcf7a']];
    g.font = "14px 'Crimson Text', serif"; g.textAlign = 'left';
    bars.forEach(([n, v, col], i) => {
      const y = 24 + i * 28;
      g.fillStyle = '#ffffff12'; g.fillRect(400, y, 120, 12);
      g.fillStyle = col; g.fillRect(400, y, 120 * v, 12);
      g.fillStyle = '#d8dde6'; g.fillText(`${n} ${Math.round(v * 100)}%`, 400, y - 2);
    });
    $('.sv').textContent = num(speed);
    out.innerHTML = speed < 0.05 ? tr('Standing still: the idle clip only.', 'Stillstehen: nur der Steh-Clip.')
      : (slipping ? tr('<b style="color:#ff9a8a">The feet slide!</b> The clip plays at its own pace, not at the pace of the ground.', '<b style="color:#ff9a8a">Die Füße rutschen!</b> Der Clip spielt in seinem eigenen Tempo, nicht im Tempo des Bodens.')
        : tr('<b style="color:#70d6aa">The feet stay planted:</b> a foot on the ground moves back exactly as fast as the ground.', '<b style="color:#70d6aa">Die Füße bleiben stehen:</b> Ein Fuß auf dem Boden bewegt sich genau so schnell nach hinten wie der Boden.'))
        + tr(`\n${num(rate)} cycles a second.`, `\n${num(rate)} Zyklen pro Sekunde.`);
  });
}
