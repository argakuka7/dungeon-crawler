// A side view of the character controller (src/physics/move.js) with the game's real numbers
// (src/core/constants.js): run speed that ramps up, braking, gravity, the jump, the leap
// over a gap, coyote time, the jump buffer, steps you walk up, and hard landings.
import { GRAV, JUMP_V, RUN_SPEED, RUN_RAMP, BRAKE, STEP, SNAP, SIT_IMPACT, RAGDOLL_IMPACT, CHAR_H } from '../../src/core/constants.js';
import { canvas, loop, html, t as tr } from '../deck.js';

const PX = 50, LEAP = 3.4;   // pixels per game unit; the leap speed from move.js
// the ground: [from x, to x, height] in game units; anything else is a pit
const GROUND = [[0, 4, 0], [5, 8, 0], [8, 10, 0.5], [10, 11.2, 1.2], [11.2, 12.8, 0]];

export default function mount(el) {
  const W = 640, H = 300, { g, c } = canvas(el, W, H);
  el.tabIndex = 0; el.dataset.keys = '1';   // keys go to the demo while it has focus
  const row = html(el, `<div><div class="row">
    <label>${tr('gravity', 'Schwerkraft')} <input type="range" class="grav" min="5" max="40" step="0.5" value="${GRAV}"> <b class="gv">${GRAV}</b></label>
    <label>${tr('jump speed', 'Sprungtempo')} <input type="range" class="jv" min="3" max="10" step="0.01" value="${JUMP_V}"> <b class="jvv">${JUMP_V}</b></label>
    <label><input type="checkbox" class="coyote" checked> ${tr('coyote time', 'Kojotenzeit')}</label>
    <label><input type="checkbox" class="buffer" checked> ${tr('jump buffer', 'Sprungpuffer')}</label></div>
    <div class="row"><button class="drop" data-h="2">${tr('Drop from 2 up', 'Fallen aus 2 Höhe')}</button><button class="drop" data-h="3.5">${tr('from 3.5 up', 'aus 3,5')}</button><button class="drop" data-h="6">${tr('from 6 up', 'aus 6')}</button>
    <button class="reset">${tr('Reset', 'Zurücksetzen')}</button><span class="muted small">${tr('click the picture, then <kbd>&larr;</kbd> <kbd>&rarr;</kbd> run, <kbd>Space</kbd> jump', 'klick ins Bild, dann <kbd>&larr;</kbd> <kbd>&rarr;</kbd> rennen, <kbd>Leertaste</kbd> springen')}</span></div></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  const keys = new Set();
  const p = { x: 1, y: 0, vx: 0, vy: 0, grounded: true, coyote: 0, jumpBuf: 0, trail: [], msg: '', msgT: 0, sit: 0 };
  let jumpPressed = false, grav = GRAV, jumpV = JUMP_V, lastLand = 0;

  const groundAt = (x, y) => {   // the highest ground under x that is not above y + STEP
    let best = -Infinity;
    for (const [a, b, h] of GROUND) if (x >= a && x < b && h <= y + STEP + 1e-6) best = Math.max(best, h);
    return best;
  };
  const blocked = (x, y) => GROUND.some(([a, b, h]) => x >= a && x < b && h > y + STEP + 1e-6);
  function reset() { Object.assign(p, { x: 1, y: 0, vx: 0, vy: 0, grounded: true, trail: [], sit: 0 }); }
  const say = m => { p.msg = m; p.msgT = 1.6; };

  function step(dt) {
    const dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    if (p.sit > 0) { p.sit -= dt; if (p.grounded) p.vx = 0; }
    const want = p.sit > 0 ? 0 : dir * RUN_SPEED;
    if (p.grounded) {   // ramp up, brake fast (like horizontal() in move.js)
      const cur = Math.abs(p.vx), s = Math.abs(want) > cur ? Math.min(Math.abs(want), cur + RUN_SPEED / RUN_RAMP * dt) : Math.max(Math.abs(want), cur - BRAKE * dt);
      p.vx = (want ? Math.sign(want) : Math.sign(p.vx)) * s;
    } else p.vx += (want - p.vx) * Math.min(1, 2.5 * dt);   // only a little air control
    const nx = p.x + p.vx * dt;
    if (!blocked(nx + Math.sign(p.vx) * 0.22, p.y)) p.x = nx; else p.vx = 0;
    if (p.x > 12.8) p.x -= 12.8; if (p.x < 0) p.x = 0;
    // jumping: coyote time and the jump buffer (jumping() in move.js)
    p.coyote = p.grounded ? 0.12 : p.coyote - dt;
    p.jumpBuf = jumpPressed ? 0.15 : p.jumpBuf - dt;
    if (!$('.coyote').checked && !p.grounded) p.coyote = 0;
    if (!$('.buffer').checked && !jumpPressed) p.jumpBuf = 0;
    jumpPressed = false;
    if (p.jumpBuf > 0 && p.coyote > 0 && p.sit <= 0) {
      if (!p.grounded) say(tr('coyote time saved you!', 'die Kojotenzeit hat dich gerettet!'));
      p.vy = jumpV;
      const s = Math.abs(p.vx);
      if (s > 0.8 && s < LEAP) p.vx *= LEAP / s;   // a leap: fast enough for a one-cell gap
      p.grounded = false; p.coyote = p.jumpBuf = 0; p.trail = [];
    }
    // gravity, landing and walking down slopes (the vertical part of movePlayer)
    const gr = groundAt(p.x, p.y);
    if (p.grounded && p.vy <= 0 && gr >= p.y - SNAP) { p.y = gr; p.vy = 0; }
    else {
      p.vy -= grav * dt;
      const ny = p.y + p.vy * dt;
      if (ny <= gr) {
        const impact = -p.vy; lastLand = impact;
        p.y = gr; p.vy = 0; p.grounded = true;
        if (impact > RAGDOLL_IMPACT) { say(tr(`RAGDOLL! (landed at ${impact.toFixed(1)}, more than ${RAGDOLL_IMPACT})`, `RAGDOLL! (gelandet mit ${impact.toFixed(1)}, mehr als ${RAGDOLL_IMPACT})`)); p.sit = 1.6; }
        else if (impact > SIT_IMPACT) { say(tr(`Ouch, sat down (landed at ${impact.toFixed(1)}, more than ${SIT_IMPACT})`, `Autsch, hingesetzt (gelandet mit ${impact.toFixed(1)}, mehr als ${SIT_IMPACT})`)); p.sit = 1.0; }
      } else { p.y = ny; p.grounded = false; p.trail.push([p.x, p.y]); }
      if (p.y < -3) { say(tr('Fell into the pit! Back to the start.', 'In die Grube gefallen! Zurück zum Start.')); reset(); }
    }
    p.msgT -= dt;
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const base = H - 40, X = x => x * PX, Y = y => base - y * PX;
    g.fillStyle = '#0a1420'; g.fillRect(0, base + 1, W, 40);
    for (const [a, b, h] of GROUND) {
      g.fillStyle = '#4e4436'; g.fillRect(X(a), Y(h), (b - a) * PX, H - Y(h));
      g.fillStyle = '#82a6b8'; g.fillRect(X(a), Y(h), (b - a) * PX, 5);
    }
    g.fillStyle = '#2e86de'; g.fillRect(X(4), base + 14, PX, 26);
    // levels on the side: every level is half a unit
    g.fillStyle = '#5a6678'; g.font = "13px 'Crimson Text', serif";
    for (let l = 1; l <= 8; l++) g.fillRect(W - 6, Y(l * 0.5), 6, 1);
    p.trail.forEach(([x, y], i) => { g.fillStyle = `rgba(255,207,122,${0.2 + 0.6 * i / p.trail.length})`; g.fillRect(X(x) - 1.5, Y(y) - 1.5, 3, 3); });
    // the hero: a capsule as tall as the collision body (CHAR_H)
    const h = CHAR_H * PX * (p.sit > 0 ? 0.55 : 1), x = X(p.x), y = Y(p.y);
    g.fillStyle = p.sit > 0 ? '#ff8a7a' : '#e6e9ef';
    g.beginPath(); g.roundRect(x - 0.22 * PX, y - h, 0.44 * PX, h, 10); g.fill();
    g.fillStyle = '#0b0d12'; g.fillRect(x + (p.vx >= 0 ? 2 : -6), y - h + 8, 4, 4);
    if (p.msgT > 0) { g.fillStyle = '#ffcf7a'; g.font = "bold 17px 'Crimson Text', serif"; g.fillText(p.msg, 12, 22); }
    if (document.activeElement !== el) { g.fillStyle = '#8a96a8'; g.font = "15px 'Crimson Text', serif"; g.fillText(tr('click here to play', 'hier klicken zum Spielen'), W - 160, 22); }
    out.innerHTML = tr(`speed <b>${Math.abs(p.vx).toFixed(2)}</b> units/s \u00B7 ${p.grounded ? 'on the ground' : 'in the air'} \u00B7 jump height <b>${(jumpV * jumpV / 2 / grav).toFixed(2)}</b> units \u00B7 last landing <b>${lastLand.toFixed(1)}</b> units/s`,
      `Tempo <b>${Math.abs(p.vx).toFixed(2)}</b> Einheiten/s \u00B7 ${p.grounded ? 'am Boden' : 'in der Luft'} \u00B7 Sprunghöhe <b>${(jumpV * jumpV / 2 / grav).toFixed(2)}</b> Einheiten \u00B7 letzte Landung <b>${lastLand.toFixed(1)}</b> Einheiten/s`);
  }

  el.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(e.code)) e.preventDefault();
    if (!e.repeat && ['Space', 'ArrowUp', 'KeyW'].includes(e.code)) jumpPressed = true;
    keys.add(e.code);
  });
  el.addEventListener('keyup', e => keys.delete(e.code));
  el.addEventListener('blur', () => keys.clear());
  c.onpointerdown = () => el.focus({ preventScroll: true });
  $('.grav').oninput = () => { grav = +$('.grav').value; $('.gv').textContent = grav; };
  $('.jv').oninput = () => { jumpV = +$('.jv').value; $('.jvv').textContent = jumpV.toFixed(2); };
  row.querySelectorAll('.drop').forEach(b => b.onclick = () => { reset(); p.x = 6.5; p.y = +b.dataset.h; p.grounded = false; el.focus({ preventScroll: true }); });
  $('.reset').onclick = () => { reset(); el.focus({ preventScroll: true }); };
  loop(el, dt => { step(dt); draw(); });
}
