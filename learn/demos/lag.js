// Messages take time: Anna's hero runs about on her screen, her game sends where it is every
// SEND_EVERY ms (src/net/protocol.js), and each message needs a while to reach Ben's screen,
// not always the same. Ben's game shows her where the newest message says (jumpy), or the
// game's way: the real Timeline (src/net/sync.js), DELAY ms in the past, blended between the
// two messages around that moment. The network here is pretend; the timing code is the game's.
import { Timeline, DELAY } from '../../src/net/sync.js';
import { SEND_EVERY } from '../../src/net/protocol.js';
import { canvas, loop, html, t as tr } from '../deck.js';

export default function mount(el) {
  const W = 640, H = 270, PW = 270, GAP = W - 2 * PW, { g, c, at } = canvas(el, W, H);
  const row = html(el, `<div class="row">
    <label>${tr('a message takes', 'eine Nachricht braucht')} <input type="range" class="lag" min="10" max="300" step="5" value="40"> <b class="lv"></b> ms</label>
    <label>${tr('give or take', 'mehr oder weniger')} <input type="range" class="wob" min="0" max="150" step="5" value="40"> <b class="wv"></b> ms</label></div>
    <div class="row"><label><input type="checkbox" class="raw" checked> ${tr('jumpy: where the newest message says', 'ruckelig: wo die neueste Nachricht sagt')}</label>
    <label><input type="checkbox" class="smooth" checked> ${tr('smooth: the game\'s way', 'weich: so macht es das Spiel')}</label></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.parentElement.querySelector(s);
  const timeline = new Timeline();
  let flying = [], newest = null, lastSend = -Infinity, lastArrival = 0, pointer = null, t = 0;
  const trail = [];
  c.addEventListener('pointermove', e => { const [x, y] = at(e); pointer = x < PW ? { x, y } : null; });
  c.addEventListener('pointerleave', () => { pointer = null; });

  // where Anna's hero is at time s: running a figure eight, or after the pointer on her screen
  const hero = { x: PW / 2, y: H / 2 };
  function move(dt) {
    t += dt;
    const goal = pointer ?? { x: PW / 2 + Math.sin(t * 1.3) * 95, y: H / 2 + 10 + Math.sin(t * 2.6) * 60 };
    const dx = goal.x - hero.x, dy = goal.y - hero.y, d = Math.hypot(dx, dy), step = Math.min(d, 260 * dt);
    if (d > 0.5) { hero.x += dx / d * step; hero.y += dy / d * step; }
  }

  function circle(x, y, r, fill, stroke) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
  }
  function panel(x, title) {
    g.fillStyle = '#ffffff08'; g.fillRect(x, 0, PW, H);
    g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.strokeRect(x + 0.5, 0.5, PW - 1, H - 1);
    g.fillStyle = '#aab3c2'; g.font = "15px 'Crimson Text', serif"; g.textAlign = 'left';
    g.fillText(title, x + 8, 16);
  }

  loop(el, dt => {
    const now = performance.now(), lag = +$('.lag').value, wob = +$('.wob').value;
    $('.lv').textContent = lag; $('.wv').textContent = wob;
    move(dt);
    trail.push({ x: hero.x, y: hero.y }); if (trail.length > 40) trail.shift();
    // Anna's game sends where she is; the line delivers in order, each after its own while
    if (now - lastSend >= SEND_EVERY) {
      lastSend = now;
      const arrive = Math.max(lastArrival, now + lag + Math.random() * wob);
      lastArrival = arrive;
      flying.push({ m: { ts: now, x: hero.x, y: hero.y }, sent: now, arrive });
    }
    for (const f of flying) if (f.arrive <= now) { timeline.push(f.m, now); newest = f.m; }
    flying = flying.filter(f => f.arrive > now);

    g.clearRect(0, 0, W, H);
    panel(0, tr('Anna\'s screen', 'Annas Bildschirm'));
    panel(PW + GAP, tr('Ben\'s screen', 'Bens Bildschirm'));
    const B = PW + GAP;   // Ben's screen starts here
    trail.forEach((p, i) => circle(p.x, p.y, 2, `rgba(255, 207, 122, ${i / trail.length * 0.5})`));
    circle(hero.x, hero.y, 10, '#ffcf7a');
    // the messages on their way
    for (const f of flying) {
      const k = (now - f.sent) / (f.arrive - f.sent), x = PW + 4 + k * (GAP - 20), y = H / 2 - 30 + (f.m.ts / SEND_EVERY % 4) * 18;
      g.fillStyle = '#e6e9ef'; g.fillRect(x, y, 12, 8);
      g.strokeStyle = '#8a96a8'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + 4); g.lineTo(x + 12, y); g.stroke();
    }
    // Ben's side: where she really is now (he cannot know), and the two ways of showing her
    circle(B + hero.x, hero.y, 10, null, '#ffffff22');
    if ($('.raw').checked && newest) circle(B + newest.x, newest.y, 10, null, '#ff7a6a');
    const span = timeline.at(now);
    if ($('.smooth').checked && span) {
      const k = Math.min(1, Math.max(0, span.k));
      circle(B + span.a.x + (span.b.x - span.a.x) * k, span.a.y + (span.b.y - span.a.y) * k, 10, '#6fb4e8');
    }
    out.innerHTML = tr(
      `Anna's game sends a message every <b>${SEND_EVERY} ms</b>. ${flying.length} on their way right now. <span style="color:#ff7a6a">Red</span>: jumps to each new message. <span style="color:#6fb4e8">Blue</span>: ${DELAY} ms in the past, blended between two messages. The faint ring: where Anna really is.`,
      `Annas Spiel schickt alle <b>${SEND_EVERY} ms</b> eine Nachricht. Gerade sind ${flying.length} unterwegs. <span style="color:#ff7a6a">Rot</span>: springt zu jeder neuen Nachricht. <span style="color:#6fb4e8">Blau</span>: ${DELAY} ms in der Vergangenheit, zwischen zwei Nachrichten gemischt. Der blasse Ring: wo Anna wirklich ist.`);
  });
  html(el, `<p class="small muted" style="margin:6px 0 0">${tr('Move the pointer over Anna\'s screen to steer her. Then make the messages slow and wobbly.', 'Fahr mit dem Zeiger über Annas Bildschirm, um sie zu steuern. Dann mach die Nachrichten langsam und wackelig.')}</p>`);
}
