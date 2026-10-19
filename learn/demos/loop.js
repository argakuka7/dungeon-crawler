// The game loop, three ways (data-mode):
//   basic:  a runner, an FPS slider and the listen / think / draw steps lighting up
//   dt:     two runners: one moves speed × dt, the other a fixed step per frame
//   follow: smoothing, the way the game's camera and zoom catch up (x += (target - x) × dt × k)
import { canvas, loop, html, t as tr } from '../deck.js';

const PHASES = () => [tr('LISTEN', 'HÖREN'), tr('THINK', 'DENKEN'), tr('DRAW', 'MALEN')];

function runner(g, x, y, t, color) {
  const leg = Math.sin(t * 14) * 6;
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.arc(x, y - 34, 6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x, y - 28); g.lineTo(x, y - 14);
  g.moveTo(x, y - 14); g.lineTo(x + leg, y); g.moveTo(x, y - 14); g.lineTo(x - leg, y);
  g.moveTo(x, y - 24); g.lineTo(x - leg * 0.8, y - 17); g.moveTo(x, y - 24); g.lineTo(x + leg * 0.8, y - 17);
  g.stroke();
}

export default function mount(el) {
  const mode = el.dataset.mode || 'basic';
  if (mode === 'follow') return follow(el);
  const H = mode === 'dt' ? 220 : 190, { g, w, c } = canvas(el, 640, H);
  const row = html(el, `<div class="row"><label>${tr('pictures per second', 'Bilder pro Sekunde')} <input type="range" min="1" max="60" value="60"> <b class="fps">60</b></label>
    ${mode === 'basic' ? `<span class="muted small">${tr('click the picture to jump', 'klick auf das Bild zum Springen')}</span>` : `<button class="reset">${tr('restart race', 'Rennen neu starten')}</button>`}</div>`);
  const out = html(el, '<div class="out"></div>');
  const slider = row.querySelector('input'), fpsOut = row.querySelector('.fps');
  let fps = 60, acc = 0, frames = 0, flash = 0, t = 0, wantJump = false;
  slider.oninput = () => { fps = +slider.value; fpsOut.textContent = fps; };
  c.onpointerdown = () => { wantJump = true; };
  const SPEED = 160;   // pixels per second
  const A = { x: 20, y: 0, vy: 0 }, B = { x: 20 }, race = { done: false };
  row.querySelector('.reset')?.addEventListener('click', () => { A.x = B.x = 20; race.done = false; frames = 0; });

  // one tick of the simulation, with the time since the last one
  function tick(dt) {
    frames++; t += dt;
    if (mode === 'basic') {
      const jump = wantJump; wantJump = false;            // LISTEN
      if (jump && A.y === 0) A.vy = 330;                    // THINK
      A.vy -= 900 * dt; A.y = Math.max(0, A.y + A.vy * dt);
      if (A.y === 0) A.vy = Math.max(0, A.vy);
      A.x += SPEED * dt; if (A.x > w + 20) A.x = -20;
    } else if (!race.done) {
      A.x += SPEED * dt;                                    // with dt: the same speed at any rate
      B.x += SPEED / 60;                                    // without: a fixed step, made for 60 per second
      if (A.x >= w - 40 || B.x >= w - 40) race.done = true;
    }
    draw();                                                 // DRAW
  }
  function draw() {
    g.clearRect(0, 0, w, H);
    const ground = mode === 'dt' ? [95, 190] : [150];
    g.fillStyle = '#1b2a1c';
    for (const y of ground) { g.fillRect(0, y, w, 6); }
    if (mode === 'basic') runner(g, A.x, 150 - A.y, t, '#e6e9ef');
    else {
      g.fillStyle = '#ffcf7a55'; g.fillRect(w - 40, 10, 3, H - 20);
      runner(g, A.x, 95, t, '#61dc6b'); runner(g, B.x, 190, t, '#ff8a7a');
      g.font = "15px 'Crimson Text', serif"; g.fillStyle = '#61dc6b'; g.fillText(tr('moves speed \u00D7 dt', 'bewegt sich Tempo \u00D7 dt'), 8, 20);
      g.fillStyle = '#ff8a7a'; g.fillText(tr('moves the same step every picture', 'macht in jedem Bild den gleichen Schritt'), 8, 115);
    }
  }
  loop(el, dt => {
    acc += dt;
    flash = Math.max(0, flash - dt);
    if (acc >= 1 / fps - 1e-4) {
      tick(acc); acc = 0; flash = Math.min(0.3, 1 / fps);
    }
    if (mode === 'basic') {
      // the three steps of the last tick, lit one after the other
      const p = flash > 0 ? Math.min(2, Math.floor((1 - flash / Math.min(0.3, 1 / fps)) * 3)) : -1;
      g.clearRect(0, 160, w, 30);
      PHASES().forEach((name, i) => {
        g.fillStyle = i === p ? ['#5fd3ff', '#ffcf7a', '#61dc6b'][i] : '#2a2f3a';
        g.fillRect(8 + i * 112, 164, 104, 22);
        g.fillStyle = i === p ? '#0b0d12' : '#8a96a8'; g.font = "bold 12px 'Cinzel', serif";
        g.fillText(name, 18 + i * 112, 179);
      });
      out.innerHTML = `${tr('pictures drawn', 'gemalte Bilder')}: <b>${frames}</b>   ${tr('time between pictures', 'Zeit zwischen den Bildern')}: <b>${(1000 / fps).toFixed(1)} ms</b>`;
    } else {
      out.innerHTML = race.done
        ? (Math.abs(A.x - B.x) < 8 ? tr('A tie! At 60 pictures per second both ways give the same result.', 'Unentschieden! Bei 60 Bildern pro Sekunde kommt bei beiden das Gleiche heraus.')
          : A.x > B.x ? tr('The green runner wins. Now try another speed.', 'Der grüne Läufer gewinnt. Probier jetzt eine andere Geschwindigkeit.')
          : tr('The red runner wins. Now try another speed.', 'Der rote Läufer gewinnt. Probier jetzt eine andere Geschwindigkeit.'))
        : `${tr('green', 'grün')}: <b>${Math.round(A.x)}</b> px   ${tr('red', 'rot')}: <b>${Math.round(B.x)}</b> px`;
    }
  });
  draw();
}

function follow(el) {
  const { g, w, h, c, at } = canvas(el, 640, 220);
  const row = html(el, `<div class="row"><label>${tr('catch-up speed', 'Aufholtempo')} <input type="range" min="1" max="40" value="8"> <b>8</b></label>
    <span class="muted small">${tr('move your mouse (or finger) over the picture', 'beweg die Maus (oder den Finger) über das Bild')}</span></div>`);
  const s = row.querySelector('input'), sOut = row.querySelector('b');
  let k = 8; s.oninput = () => { k = +s.value; sOut.textContent = k; };
  const target = [w / 2, h / 2], pos = [w / 2, h / 2], trail = [];
  c.onpointermove = e => { [target[0], target[1]] = at(e); };
  loop(el, dt => {
    const f = Math.min(1, dt * k);
    pos[0] += (target[0] - pos[0]) * f; pos[1] += (target[1] - pos[1]) * f;
    trail.push([...pos]); if (trail.length > 40) trail.shift();
    g.clearRect(0, 0, w, h);
    trail.forEach(([x, y], i) => { g.fillStyle = `rgba(255,207,122,${i / 80})`; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
    g.strokeStyle = '#5fd3ff'; g.lineWidth = 2; g.beginPath(); g.arc(...target, 10, 0, 7); g.stroke();
    g.fillStyle = '#ffcf7a'; g.beginPath(); g.arc(...pos, 9, 0, 7); g.fill();
    g.font = "15px 'Crimson Text', serif"; g.fillStyle = '#8a96a8';
    g.fillText(tr('blue: where it wants to be   gold: where it is (like the camera)', 'blau: wo es hin will   gold: wo es ist (wie die Kamera)'), 10, h - 10);
  });
}
