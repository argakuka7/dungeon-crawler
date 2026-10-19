// From a click to a place in the world, seen from the side. The camera looks down through the
// screen; the mouse picks a point on the screen, and a ray goes from the camera through it. Like
// pickFloor in src/game/pointer.js, the ray is walked in small steps until a step ends up inside
// the ground (or a bridge). With big steps it can jump right through something thin.
import { canvas, html, t as tr } from '../deck.js';

export default function mount(el) {
  const W = 640, H = 300, { c, g, at } = canvas(el, W, H);
  const row = html(el, `<div class="row"><label>${tr('step size', 'Schrittgröße')} <input type="range" class="step" min="2" max="60" value="8"> <b class="sv"></b></label></div>`);
  const out = html(el, '<div class="out"></div>');
  const cam = { x: 40, y: 34 }, screen = { x: 110, top: 40, bottom: 250 };
  // the ground: hills (height above the bottom of the picture), and a thin bridge
  const ground = x => 70 + 26 * Math.sin(x / 60) + 14 * Math.sin(x / 23 + 1) + (x > 420 && x < 500 ? -50 : 0);
  const bridge = { x0: 400, x1: 520, y: 120, h: 7 };
  const solid = (x, y) => y > H - ground(x) || (x > bridge.x0 && x < bridge.x1 && y > H - bridge.y - bridge.h && y < H - bridge.y);
  let sy = 58;   // start aimed at the bridge

  function draw() {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#3a5a3a';
    g.beginPath(); g.moveTo(130, H);
    for (let x = 130; x <= W; x += 4) g.lineTo(x, H - ground(x));
    g.lineTo(W, H); g.fill();
    g.fillStyle = '#9a6b3c'; g.fillRect(bridge.x0, H - bridge.y - bridge.h, bridge.x1 - bridge.x0, bridge.h);
    // the screen: your picture, seen from the side
    g.strokeStyle = '#5fd3ff'; g.lineWidth = 4; g.beginPath(); g.moveTo(screen.x, screen.top); g.lineTo(screen.x, screen.bottom); g.stroke();
    g.fillStyle = '#5fd3ff'; g.font = "14px 'Crimson Text', serif"; g.textAlign = 'center';
    g.fillText(tr('your screen', 'dein Bildschirm'), screen.x, screen.bottom + 16);
    g.fillStyle = '#ffcf7a'; g.beginPath(); g.arc(cam.x, cam.y, 9, 0, 7); g.fill();
    g.fillText(tr('camera', 'Kamera'), cam.x, cam.y - 14);
    // the ray through the mouse's point on the screen, walked in steps
    const step = +row.querySelector('.step').value, dx = screen.x - cam.x, dy = sy - cam.y, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
    let hit = null, n = 0, missed = false;
    for (let t = l; t < 900; t += step) {
      const x = cam.x + ux * t, y = cam.y + uy * t;
      if (x > W || y > H) break;
      n++;
      const inBridge = solid(x, y) && y < H - ground(x);
      g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill();
      if (solid(x, y)) { hit = { x, y, bridge: inBridge }; break; }
    }
    // where tiny steps would have stopped: if that is earlier, the big steps jumped through something
    let fine = null;
    for (let t = l; t < 900; t += 0.5) {
      const x = cam.x + ux * t, y = cam.y + uy * t;
      if (x > W || y > H) break;
      if (solid(x, y)) { fine = { x, y }; break; }
    }
    missed = !!fine && (!hit || Math.hypot(hit.x - cam.x, hit.y - cam.y) > Math.hypot(fine.x - cam.x, fine.y - cam.y) + step);
    g.strokeStyle = '#ffffff40'; g.lineWidth = 1; g.beginPath(); g.moveTo(cam.x, cam.y); g.lineTo(hit ? hit.x : cam.x + ux * 900, hit ? hit.y : cam.y + uy * 900); g.stroke();
    g.fillStyle = '#5fd3ff'; g.beginPath(); g.arc(screen.x, sy, 5, 0, 7); g.fill();
    if (hit) { g.fillStyle = '#ffcf7a'; g.beginPath(); g.arc(hit.x, hit.y, 7, 0, 7); g.fill(); }
    row.querySelector('.sv').textContent = step;
    out.innerHTML = (!hit ? tr('The ray leaves the picture without hitting anything: no floor under the mouse.', 'Der Strahl verlässt das Bild, ohne etwas zu treffen: kein Boden unter der Maus.')
      : tr(`${n} steps until the ray was inside ${hit.bridge ? 'the <b>bridge</b>' : 'the <b>ground</b>'}: that's where you clicked.`, `${n} Schritte, bis der Strahl ${hit.bridge ? 'in der <b>Brücke</b>' : 'im <b>Boden</b>'} war: Dort hast du hingeklickt.`))
      + (missed ? tr('\n<b style="color:#ff9a8a">Oops!</b> The steps were so big that the ray jumped right through something thin. Make them smaller.', '\n<b style="color:#ff9a8a">Hoppla!</b> Die Schritte waren so groß, dass der Strahl einfach durch etwas Dünnes gesprungen ist. Mach sie kleiner.') : '');
  }
  const move = e => { const [, y] = at(e); sy = Math.max(screen.top, Math.min(screen.bottom, y)); draw(); };
  c.addEventListener('pointermove', move);
  c.addEventListener('pointerdown', move);
  row.querySelector('.step').oninput = draw;
  html(el, `<p class="small muted" style="margin:6px 0 0">${tr('Move the mouse up and down over the picture: that moves your pointer on the screen.', 'Beweg die Maus über dem Bild auf und ab: So bewegst du deinen Zeiger auf dem Bildschirm.')}</p>`);
  draw();
}
