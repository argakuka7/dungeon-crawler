// Game feel: the same hit with and without the extras from src/game/juice.js. Hit pause (time
// at 3% for 0.055 s, 0.09 s on a kill), a camera nudge, sparks and droplets, a floating damage
// number, the enemy's white flash and push, and the generated "hit" sound (src/audio/sfx.js).
import { canvas, loop, html, t as tr } from '../deck.js';

let ac = null;
// the "hit" and "kill" recipes from src/audio/sfx.js: a thump, a body of noise, a bright crack
function sound(kill) {
  ac ||= new AudioContext();
  const t = ac.currentTime + 0.005, out = ac.createGain(); out.gain.value = 0.45; out.connect(ac.destination);
  const amp = (attack, peak, decay) => { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); g.connect(out); return g; };
  const noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); noiseBuf.getChannelData(0).forEach((_, i, d) => { d[i] = Math.random() * 2 - 1; });
  const noise = (dur, into) => { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.connect(into); s.start(t, 0, dur + 0.05); };
  const filter = (type, f, q, into) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(into); return b; };
  const tone = (f0, f1, dur, into) => { const o = ac.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(into); o.start(t); o.stop(t + dur + 0.05); };
  if (kill) { tone(120, 32, 0.35, amp(0.002, 1, 0.35)); noise(0.32, filter('lowpass', 900, 0.7, amp(0.003, 0.8, 0.3))); noise(0.05, filter('highpass', 3000, 0.7, amp(0.001, 0.35, 0.04))); }
  else { tone(180, 50, 0.12, amp(0.002, 0.8, 0.12)); noise(0.1, filter('lowpass', 2200, 0.7, amp(0.002, 0.7, 0.08))); noise(0.04, filter('highpass', 3500, 0.7, amp(0.001, 0.3, 0.03))); }
}

export default function mount(el) {
  const W = 640, H = 230, { g, c } = canvas(el, W, H);
  const FX = [['stop', tr('hit pause', 'Trefferpause')], ['kick', tr('camera nudge', 'Kamera-Schubs')], ['sparks', tr('sparks', 'Funken')], ['num', tr('damage number', 'Schadenszahl')], ['flash', tr('white flash + push', 'weißer Blitz + Stoß')], ['snd', tr('sound', 'Geräusch')]];
  const row = html(el, `<div><div class="row"><button class="hit">${tr('Hit it! (or click the picture)', 'Hau drauf! (oder klick ins Bild)')}</button><button class="all">${tr('all on', 'alle an')}</button><button class="none">${tr('all off', 'alle aus')}</button></div>
    <div class="row">${FX.map(([k, n]) => `<label><input type="checkbox" class="${k}" checked> ${n}</label>`).join('')}</div></div>`);
  const on = k => row.querySelector('.' + k).checked;
  const blob = { x: 430, hp: 100, flash: 0, push: 0, dead: 0 };
  let stop = 0, kick = 0, kickV = 0, swing = 0, parts = [], nums = [];
  function hit() {
    if (blob.dead > 0) return;
    const dmg = 22 + Math.floor(Math.random() * 6), killed = blob.hp - dmg <= 0;
    blob.hp = Math.max(0, blob.hp - dmg); swing = 0.18;
    if (on('stop')) stop = killed ? 0.09 : 0.055;
    if (on('kick')) kickV = killed ? 16 : 8;
    if (on('flash')) { blob.flash = 0.22; blob.push = killed ? 40 : 18; }
    if (on('sparks')) for (let i = 0; i < (killed ? 16 : 9); i++) {
      const a = (Math.random() - 0.5) * 1.8, s = 150 + Math.random() * 200;
      parts.push({ x: blob.x - 30, y: 130, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.25 + Math.random() * 0.1, col: i % 3 ? '#ffd27a' : '#fff', r: 2.5 });
      parts.push({ x: blob.x - 30, y: 130, vx: Math.cos(a) * s * 0.5, vy: -60 - Math.random() * 120, life: 0.5, col: i % 2 ? '#a6d84e' : '#5f8f22', r: 4, grav: 600 });
    }
    if (on('num')) nums.push({ x: blob.x, y: 70, t: 0.8, text: String(dmg), big: killed });
    if (on('snd')) sound(killed);
    if (killed) blob.dead = 1.2;
  }
  row.querySelector('.hit').onclick = hit;
  c.onpointerdown = hit;
  row.querySelector('.all').onclick = () => FX.forEach(([k]) => { row.querySelector('.' + k).checked = true; });
  row.querySelector('.none').onclick = () => FX.forEach(([k]) => { row.querySelector('.' + k).checked = false; });

  loop(el, real => {
    const dt = stop > 0 ? real * 0.03 : real;   // the hit pause: time nearly stops (timeScale in juice.js)
    stop -= real;
    swing = Math.max(0, swing - dt); blob.flash = Math.max(0, blob.flash - dt);
    blob.push *= Math.exp(-dt * 10);
    if (blob.dead > 0 && (blob.dead -= dt) <= 0) blob.hp = 100;
    kickV *= Math.exp(-real * 16); kick = kickV;
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.grav ?? 400) * dt; p.vx *= Math.exp(-3 * dt); p.life -= dt; }
    parts = parts.filter(p => p.life > 0);
    for (const n of nums) { n.t -= dt; n.y -= 50 * dt; }
    nums = nums.filter(n => n.t > 0);

    g.save(); g.clearRect(0, 0, W, H); g.translate(kick, 0);
    g.fillStyle = '#142010'; g.fillRect(-20, 170, W + 40, 60);
    // the hero and the sword swinging
    g.fillStyle = '#e6e9ef'; g.beginPath(); g.arc(300, 112, 12, 0, 7); g.fill(); g.fillRect(292, 124, 16, 46);
    const a = swing > 0 ? -1.3 + 2.4 * (1 - swing / 0.18) : -1.3;
    g.strokeStyle = '#c8d0dc'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(310, 140); g.lineTo(310 + Math.cos(a) * 80, 140 + Math.sin(a) * 80); g.stroke();
    // the blob
    if (blob.dead <= 0 || blob.dead > 1.0) {
      const x = blob.x + blob.push, squash = blob.flash > 0 ? 1.15 : 1;
      g.fillStyle = blob.flash > 0 ? '#ffffff' : '#7fbf4a';
      g.beginPath(); g.ellipse(x, 140, 42 * squash, 32 / squash, 0, 0, 7); g.fill();
      g.fillStyle = '#1d0a29'; g.beginPath(); g.arc(x - 14, 132, 5, 0, 7); g.arc(x + 4, 132, 5, 0, 7); g.fill();
    }
    g.fillStyle = '#2a2f3a'; g.fillRect(blob.x - 40, 90, 80, 6); g.fillStyle = '#ff6a5a'; g.fillRect(blob.x - 40, 90, 80 * blob.hp / 100, 6);
    for (const p of parts) { g.fillStyle = p.col; g.globalAlpha = Math.min(1, p.life * 4); g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    for (const n of nums) { g.fillStyle = n.big ? '#ffb347' : '#fff'; g.globalAlpha = Math.min(1, n.t * 3); g.font = `bold ${n.big ? 26 : 20}px 'Cinzel', serif`; g.fillText(n.text, n.x - 10, n.y); }
    g.globalAlpha = 1; g.restore();
  });
}
