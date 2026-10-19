// A spider's brain: the state machine of src/game/enemyai.js with the real SPIDER numbers
// (src/core/enemies.js). It thinks five times a second (decide), and acts every frame (act):
// idle (looks about), walk (wander near home), alert (noticed you: sees you within aggro ahead,
// half that behind, or hears you right next to it), chase (follows its path to you, circles
// between bites), attack (wind-up, bite, cooldown), search (lost you: looks around where it
// last saw you), home. Drag the hero around.
import { SPIDER } from '../../src/core/enemies.js';
import { canvas, loop, html, t as tr } from '../deck.js';

const S = 32, C = 20, R = 10;   // pixels per cell, grid size
const BEHIND = 0.5, HEAR = 1.6, MEMORY = 3, SEARCH = 4;   // as in enemyai.js
const STATES = ['idle', 'walk', 'alert', 'chase', 'attack', 'search', 'home'];
const SAY = () => ({
  idle: tr('Resting and looking around. If it half sees you, it turns towards you.', 'Ruht sich aus und schaut sich um. Wenn sie dich halb sieht, dreht sie sich zu dir.'),
  walk: tr('Wandering to a random spot near home, slowly.', 'Läuft langsam zu einem zufälligen Platz nahe ihrem Zuhause.'),
  alert: tr('It noticed you! A moment to react...', 'Sie hat dich bemerkt! Einen Moment zum Reagieren...'),
  chase: tr('Hunting you: following its path to you, fast. Between bites it backs off and circles.', 'Jagt dich: folgt schnell ihrem Weg zu dir. Zwischen den Bissen weicht sie zurück und kreist um dich.'),
  attack: tr('Winding up... it is committed now and cannot stop. Step away!', 'Holt aus... jetzt kann sie nicht mehr aufhören. Geh weg!'),
  search: tr('Lost you. Looking around where it last saw you.', 'Hat dich verloren. Schaut sich dort um, wo sie dich zuletzt gesehen hat.'),
  home: tr('Gave up. Walking back home.', 'Hat aufgegeben. Läuft zurück nach Hause.'),
});

export default function mount(el) {
  const W = C * S, H = R * S, { g, c, at } = canvas(el, W, H);
  const P = SPIDER;
  const diagram = html(el, `<div class="row" style="justify-content:center">${STATES.map(s => `<span class="chip st-${s}" style="padding:3px 10px">${s}</span>`).join(' \u2192 ')}</div>`);
  const out = html(el, '<div class="out"></div>');
  const wall = new Uint8Array(C * R);
  for (let z = 1; z < 7; z++) wall[z * C + 9] = 1;
  for (let x = 3; x < 7; x++) wall[7 * C + x] = 1;
  const hero = { x: 4.5, z: 3.5, hp: 100, hurt: 0 };
  const e = { x: 15.5, z: 5.5, yaw: Math.PI, mode: 'idle', t: 2, think: 0, path: null, cool: 0, lost: 0, home: [15, 5], bit: false, speed: 0, seen: null, side: 1, look: Math.PI, wary: false };
  let drag = false, log = [];
  const cell = (x, z) => [Math.floor(x), Math.floor(z)];
  const free = (x, z) => x >= 0 && z >= 0 && x < C && z < R && !wall[z * C + x];
  function findPath(a, b, maxLen) {   // breadth-first, with a limit, like findPath in enemynav.js
    const key = ([x, z]) => z * C + x, prev = new Map([[key(a), null]]);
    let front = [a];
    for (let d = 0; d < maxLen && front.length && !prev.has(key(b)); d++) {
      const next = [];
      for (const [x, z] of front) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [x + dx, z + dz];
        if (free(...n) && !prev.has(key(n))) { prev.set(key(n), [x, z]); next.push(n); }
      }
      front = next;
    }
    if (!prev.has(key(b))) return null;
    const path = [];
    for (let f = b; f; f = prev.get(key(f))) path.unshift(f);
    return path;
  }
  function clearLine(ax, az, bx, bz) {   // line of sight in 0.15 steps, like clearLine
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.15);
    for (let i = 1; i < n; i++) { const t = i / n; if (wall[Math.floor(az + (bz - az) * t) * C + Math.floor(ax + (bx - ax) * t)]) return false; }
    return true;
  }
  const setMode = m => { if (e.mode !== m) { log.unshift(m); log = log.slice(0, 6); } e.mode = m; };
  const toHero = () => Math.atan2(hero.z - e.z, hero.x - e.x);
  const ahead = () => Math.cos(toHero() - e.yaw) > -0.2;
  const sees = range => Math.hypot(hero.x - e.x, hero.z - e.z) <= range && clearLine(e.x, e.z, hero.x, hero.z);
  const spot = () => { e.seen = cell(hero.x, hero.z); e.lost = 0; };
  const goHome = () => { setMode('home'); e.path = findPath(cell(e.x, e.z), e.home, 40); };
  // thinking, five times a second
  function decide() {
    const dist = Math.hypot(hero.x - e.x, hero.z - e.z);
    if (e.mode === 'attack' || e.mode === 'alert') return;
    if (e.mode === 'chase') {
      if (sees(P.giveUp) || dist < HEAR) spot(); else e.lost += 0.2;
      e.path = findPath(cell(e.x, e.z), e.seen, 24);
      const there = e.lost > 0.6 && (!e.path || e.path.length <= 1);
      if (e.lost > MEMORY || there) { setMode('search'); e.t = SEARCH; e.pause = 0; }
      return;
    }
    // idle, walk, search, home: does it notice you?
    e.wary = sees(P.aggro * 1.4);
    if (dist < HEAR || sees(P.aggro * (ahead() ? 1 : BEHIND))) { spot(); setMode('alert'); e.t = 0.3 + Math.random() * 0.3; e.path = null; }
  }
  const turn = (yaw, dt, rate = 8) => { e.yaw += Math.atan2(Math.sin(yaw - e.yaw), Math.cos(yaw - e.yaw)) * Math.min(1, dt * rate); };
  function steer(x, z, speed, dt) {
    const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { e.speed = 0; return true; }
    turn(Math.atan2(dz, dx), dt);
    const fwd = Math.max(0, (Math.cos(e.yaw) * dx + Math.sin(e.yaw) * dz) / d), step = Math.min(d, speed * fwd * dt);
    walk(Math.cos(e.yaw) * step, Math.sin(e.yaw) * step); e.speed = step / dt;
    return false;
  }
  function walk(mx, mz) {   // only onto free cells, sliding along walls
    if (free(...cell(e.x + mx, e.z + mz))) { e.x += mx; e.z += mz; return true; }
    if (free(...cell(e.x + mx, e.z))) { e.x += mx; return true; }
    if (free(...cell(e.x, e.z + mz))) { e.z += mz; return true; }
    return false;
  }
  function follow(speed, dt, end) {
    if (!e.path) return true;
    const here = cell(e.x, e.z), i = e.path.findIndex(([x, z]) => x === here[0] && z === here[1]);
    if (i > 0) e.path = e.path.slice(i);
    const next = e.path[1];
    if (next) { steer(next[0] + 0.5, next[1] + 0.5, speed, dt); return false; }
    return steer(end ? end[0] : here[0] + 0.5, end ? end[1] : here[1] + 0.5, speed, dt);
  }
  // between bites: back off, then circle round the hero, sidestepping (it's a spider)
  function circle(dt, d) {
    const away = Math.atan2(e.z - hero.z, e.x - hero.x), r = P.circle, backing = e.cool > P.cooldown * 0.6 && d < r;
    const a = away + e.side * (backing ? 0.4 : 0.75), rr = backing ? r + 0.4 : r;
    const ux = hero.x + Math.cos(a) * rr - e.x, uz = hero.z + Math.sin(a) * rr - e.z, l = Math.hypot(ux, uz) || 1, v = P.chase * 0.75;
    if (!walk(ux / l * v * dt, uz / l * v * dt)) e.side = -e.side;
    turn(toHero(), dt); e.speed = v;
  }
  // acting, every frame
  function act(dt) {
    const dx = hero.x - e.x, dz = hero.z - e.z, d = Math.hypot(dx, dz);
    if (e.mode === 'attack') {
      e.t += dt;
      if (e.t < P.trackUntil) turn(Math.atan2(dz, dx), dt, 6);
      if (!e.bit && e.t >= P.hitAt) {   // the bite: does it still reach?
        e.bit = true;
        const facing = Math.cos(Math.atan2(dz, dx) - e.yaw);
        if (d < P.hitReach && facing >= P.arc) { hero.hp = Math.max(0, hero.hp - P.damage); hero.hurt = 0.4; }
      }
      if (e.t >= P.attackTime) { setMode('chase'); e.cool = P.cooldown * (0.8 + Math.random() * 0.4); e.side = Math.random() < 0.5 ? -1 : 1; }
      return;
    }
    if (e.mode === 'alert') {
      e.speed = 0; turn(toHero(), dt, 10);
      if ((e.t -= dt) <= 0) { setMode('chase'); e.think = 0; }
      return;
    }
    if (e.mode === 'chase') {
      const facing = Math.cos(Math.atan2(dz, dx) - e.yaw) > 0.7;
      if (d < P.reach && e.cool <= 0) {
        e.speed = 0; turn(Math.atan2(dz, dx), dt);
        if (facing) { setMode('attack'); e.t = 0; e.bit = false; }
        return;
      }
      if (e.cool > 0 && d < 4 && e.lost === 0) { circle(dt, d); return; }
      follow(P.chase, dt, e.lost === 0 ? [hero.x, hero.z] : null); return;
    }
    if (e.mode === 'search') {
      if ((e.t -= dt) <= 0) { goHome(); return; }
      if (!follow((P.wander + P.chase) / 2, dt)) return;
      e.speed = 0; turn(e.look, dt, 3);
      if ((e.pause -= dt) > 0) return;
      const spots = [];
      for (let z = e.seen[1] - 2; z <= e.seen[1] + 2; z++) for (let x = e.seen[0] - 2; x <= e.seen[0] + 2; x++) if (free(x, z)) spots.push([x, z]);
      e.path = findPath(cell(e.x, e.z), spots[Math.floor(Math.random() * spots.length)], 6);
      e.look = e.yaw + (Math.random() - 0.5) * 3; e.pause = 0.5 + Math.random() * 0.7;
      return;
    }
    if (e.mode === 'walk' || e.mode === 'home') {
      if (follow(e.mode === 'home' ? P.homeSpeed : P.wander, dt)) { setMode('idle'); e.t = 2 + Math.random() * 4; e.look = e.yaw; }
      return;
    }
    e.speed = 0;
    if (e.wary) turn(toHero(), dt, 1.5); else turn(e.look, dt, 2);
    if ((e.t -= dt) > 0) return;
    if (Math.random() < 0.35) { e.look = e.yaw + (Math.random() - 0.5) * 2.5; e.t = 1 + Math.random() * 2; return; }
    const spots = [];
    for (let z = e.home[1] - 2; z <= e.home[1] + 2; z++) for (let x = e.home[0] - 2; x <= e.home[0] + 2; x++) if (free(x, z)) spots.push([x, z]);
    e.path = findPath(cell(e.x, e.z), spots[Math.floor(Math.random() * spots.length)], 6);
    if (e.path) setMode('walk'); else e.t = 2;
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    for (let z = 0; z < R; z++) for (let x = 0; x < C; x++) {
      g.fillStyle = wall[z * C + x] ? '#4a444a' : (x + z) % 2 ? '#15131a' : '#18161e';
      g.fillRect(x * S, z * S, S, S);
    }
    // home and the aggro circle
    g.strokeStyle = '#ffffff22'; g.setLineDash([3, 4]); g.strokeRect(e.home[0] * S - 2 * S, e.home[1] * S - 2 * S, 5 * S, 5 * S);
    // how far it sees: aggro ahead (100 degrees either side), half that behind
    const cone = Math.acos(-0.2);
    g.strokeStyle = '#d0503a88'; g.beginPath();
    g.arc(e.x * S, e.z * S, P.aggro * S, e.yaw - cone, e.yaw + cone);
    g.arc(e.x * S, e.z * S, P.aggro * BEHIND * S, e.yaw + cone, e.yaw - cone + Math.PI * 2);
    g.closePath(); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#8a96a8'; g.font = "13px 'Crimson Text', serif"; g.fillText(tr('home', 'Zuhause'), e.home[0] * S - 2 * S + 3, e.home[1] * S - 2 * S + 12);
    // what it sees
    const dist = Math.hypot(hero.x - e.x, hero.z - e.z);
    if (e.seen && (e.mode === 'chase' || e.mode === 'search')) { g.strokeStyle = '#ffcf7a'; g.strokeRect(e.seen[0] * S + 4, e.seen[1] * S + 4, S - 8, S - 8); }
    if (dist <= P.aggro) { const ok = clearLine(e.x, e.z, hero.x, hero.z); g.strokeStyle = ok ? '#61dc6b' : '#ff6a5a66'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(e.x * S, e.z * S); g.lineTo(hero.x * S, hero.z * S); g.stroke(); }
    if (e.path && e.mode !== 'idle') { g.fillStyle = e.mode === 'home' ? '#5fd3ff88' : e.mode === 'walk' ? '#ffffff55' : '#ffcf7a99';
      for (const [x, z] of e.path) { g.beginPath(); g.arc((x + 0.5) * S, (z + 0.5) * S, 3, 0, 7); g.fill(); } }
    // the hero
    g.fillStyle = hero.hurt > 0 ? '#ff6a5a' : '#e6e9ef'; g.beginPath(); g.arc(hero.x * S, hero.z * S, 9, 0, 7); g.fill();
    g.fillStyle = '#2a2f3a'; g.fillRect(hero.x * S - 14, hero.z * S - 17, 28, 4); g.fillStyle = '#61dc6b'; g.fillRect(hero.x * S - 14, hero.z * S - 17, 28 * hero.hp / 100, 4);
    // the spider: body, eight legs, red when winding up
    const wind = e.mode === 'attack' && e.t < P.hitAt;
    g.save(); g.translate(e.x * S, e.z * S); g.rotate(e.yaw);
    g.strokeStyle = '#8a6a78'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) { const a = (i - 1.5) * 0.45, w = Math.sin(performance.now() / 60 + i) * (e.speed > 0 ? 0.2 : 0);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a + w) * 9, sgn * 13); g.lineTo(Math.cos(a + w) * 13, sgn * 17); g.stroke(); }
    g.fillStyle = wind ? '#ff4a2a' : '#6a4452'; g.beginPath(); g.ellipse(0, 0, 11, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#b4e67e'; g.beginPath(); g.arc(8, -3, 2, 0, 7); g.arc(8, 3, 2, 0, 7); g.fill();
    g.restore();
    if (e.mode === 'alert' || e.mode === 'search') { g.fillStyle = '#ffcf7a'; g.font = "bold 18px 'Cinzel', serif"; g.fillText(e.mode === 'alert' ? '!' : '?', e.x * S - 5, e.z * S - 18); }
    diagram.querySelectorAll('.chip').forEach(ch => { const on = ch.classList.contains('st-' + e.mode); ch.style.background = on ? '#5a4a26' : ''; ch.style.borderColor = on ? '#ffcf7a' : ''; ch.style.color = on ? '#fff' : ''; });
    out.innerHTML = `<b>${e.mode}</b>: ${SAY()[e.mode]}\n${tr('last states', 'letzte Zustände')}: ${log.join(' \u2190 ') || '-'}   ${tr('your health', 'deine Gesundheit')}: <b>${hero.hp}</b>`;
  }
  c.onpointerdown = ev => { drag = true; c.setPointerCapture(ev.pointerId); move(ev); };
  c.onpointermove = ev => { if (drag) move(ev); };
  c.onpointerup = () => { drag = false; };
  function move(ev) { const [x, y] = at(ev), nx = x / S, nz = y / S; if (free(Math.floor(nx), Math.floor(nz))) { hero.x = nx; hero.z = nz; } }
  loop(el, dt => {
    e.cool = Math.max(0, e.cool - dt); hero.hurt -= dt;
    if (hero.hp <= 0) { hero.hp = 100; hero.x = 4.5; hero.z = 3.5; }
    if ((e.think -= dt) <= 0) { e.think = 0.2 * (0.8 + Math.random() * 0.4); decide(); }
    act(dt);
    draw();
  });
}
