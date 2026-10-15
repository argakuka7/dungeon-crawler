// The enemies when playing together (net/session.js wires this up). In a cube with the host
// they live on the host: its AI moves them and goes after either player (game/party.js). A
// guest exploring on its own runs its cube's enemies itself, like any game. With the host the
// guest is shown them:
//   roster  the host's enemies in its cube, once (and again when they change): who they are
//           and what they are like, so the guest can draw and fight them (`replicas`)
//   foes    about 15 times a second, where each is and what it does (one row each)
// The guest fights what it is shown: its hits go to the host (`hit`, game/sword.js), which
// applies them; until the host's next word the guest shows its own result (predicted health,
// and a predicted death stays dead). Kills give both players XP and loot of their own
// (game/enemies.js awardKills), because each side sees its enemies die.
import { player, state } from '../game/state.js';
import { allEnemies, mirrorEnemies, adoptEnemies } from '../game/enemies.js';
import { mirrorBeam } from '../game/beams.js';
import { removeEnemyViews } from '../render/enemies.js';
import { guardianId } from '../core/guardians.js';
import { Timeline, lerpAngle, PREDICT } from './sync.js';
import { MODES, BURNING, TOXIC, rosterOf, rowOf } from './protocol.js';

// --- host ------------------------------------------------------------------------------------

// The host's side: when to send a roster (a new cube, new enemies, the guest asks) and the rows
export class Host {
  constructor() { this.sent = null; }
  forget() { this.sent = null; }
  // messages to send now: a roster when the enemies changed, then the rows
  messages(now) {
    const list = allEnemies(), out = [];
    if (!this.sent || this.sent.cube !== state.cubeKey || list.some(e => e.id && !this.sent.index.has(e))) {
      const ids = list.filter(e => e.id);
      this.sent = { cube: state.cubeKey, index: new Map(ids.map((e, i) => [e, i])) };
      out.push(rosterOf(ids, state.cubeKey, state.cubes.seed));
    }
    const rows = [];
    for (const e of list) { const i = this.sent.index.get(e); if (i !== undefined) rows.push(rowOf(e, i)); }
    out.push({ t: 'foes', ts: now, cube: state.cubeKey, list: rows });
    return out;
  }
}

// --- guest -----------------------------------------------------------------------------------

// an enemy shown here, from its roster entry (the fields the game reads of an enemy)
function replica(entry, profile, i) {
  return { id: entry.id, profile, type: profile.type, level: entry.level, coinDrop: entry.coinDrop, kind: entry.kind,
    guardian: entry.guardian, guardianRole: entry.guardianRole, bossPlaceholder: entry.bossPlaceholder,
    guardianGate: entry.guardianGate, hordeId: entry.hordeId,
    x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw, hp: entry.hp, mode: entry.mode === 'dead' ? 'dead' : 'idle',
    t: 0, attacks: 0, attack: 0, speed: 0, deadT: entry.mode === 'dead' ? 1e9 : 0, hurtT: 0, stun: 0, cool: 0,
    phase: (i * 0.37) % 1, shownHp: entry.hp };
}

// The guest's side: the host's enemies in this cube, kept where the host says they are, while
// the host is here (active). ask(): request this cube's roster from the host.
// learn: network.html#guess (see learn/README.md)
export class Guest {
  constructor(ask) {
    this.ask = ask;
    this.active = false;
    this.timeline = new Timeline();
    this.byIndex = [];
    this.cube = null;
    this.mirror = { list: [], apply: dt => this.apply(dt), reset: () => this.reset() };
  }
  start() { this.active = true; mirrorEnemies(this.mirror); }
  // keep: the host left us in this cube, its enemies go on here as we were shown them
  stop(keep = false) {
    if (!this.active) return;
    const states = keep ? this.mirror.list.filter(e => e.mode !== 'dead')
      .map(e => ({ id: e.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: e.hp, mode: e.mode })) : null;
    this.active = false;
    mirrorEnemies(null);
    if (states) adoptEnemies(states);
    this.timeline.clear(); this.byIndex = []; this.cube = null;
  }
  // our cube's enemies went (we came into a cube, died, the world changed): ask for them again
  reset() { this.timeline.clear(); this.byIndex = []; this.cube = null; this.ask(); }

  roster(m) {
    if (m.cube !== state.cubeKey || m.seed !== state.cubes?.seed) return;
    const old = new Map(this.mirror.list.map(e => [e.id, e]));
    const permanent = new Set([...state.run.unlockedGates].map(guardianId));
    this.byIndex = m.list.map((entry, i) => {
      const e = old.get(entry.id);
      // what the host has alive, we have not defeated (the host respawned it, after a death)
      if (entry.mode !== 'dead' && !permanent.has(entry.id)) state.run.defeated.delete(entry.id);
      if (e && !(e.mode === 'dead' && entry.mode !== 'dead')) { old.delete(entry.id); return e; }
      return replica(entry, m.profiles[entry.p], i);
    });
    removeEnemyViews([...old.values()]);
    this.mirror.list = [...this.byIndex];
    this.cube = m.cube;
    this.timeline.clear();
  }
  foes(m, now) {
    if (m.cube === this.cube && m.cube === state.cubeKey && Array.isArray(m.list)) this.timeline.push(m, now);
  }
  find(id) { return this.mirror.list.find(e => e.id === id); }

  // every frame: each enemy as the host had it DELAY ago, blended between two messages
  apply(dt) {
    const span = this.timeline.at(performance.now()), now = performance.now();
    const rowsOf = m => m.rows ??= new Map(m.list.map(r => [r[0], r]));
    const A = span && rowsOf(span.a), B = span && rowsOf(span.b), k = span ? Math.min(1, Math.max(0, span.k)) : 0;
    this.byIndex.forEach((e, i) => {
      e.hurtT = Math.max(0, e.hurtT - dt);
      if (e.mode === 'dead') { e.deadT += dt; return; }   // dead stays dead (also a death we saw first)
      if (!B) return;
      const b = B.get(i), a = A.get(i) ?? b;
      if (!b) { e.mode = 'dead'; e.hp = 0; e.deadT = 1e9; return; }   // the host let it go
      const mix = j => a[j] + (b[j] - a[j]) * k;
      e.x = mix(1); e.y = mix(2); e.z = mix(3); e.yaw = lerpAngle(a[4], b[4], k);
      e.mode = MODES[b[5]] ?? 'idle';
      e.attacks = b[7]; e.attack = b[8];
      e.t = a[7] === b[7] ? mix(6) : b[6];
      e.speed = mix(9);
      // the host's word on its health, unless our own hit is newer
      const hp = e.predUntil > now ? Math.min(b[10], e.predHp) : b[10];
      if (b[10] < e.shownHp) e.hurtT = 0.22;   // someone else hurt it
      e.shownHp = b[10];
      e.hp = hp;
      e.burning = b[11] & BURNING ? e.burning || { shown: true } : null;
      e.toxic = b[11] & TOXIC ? e.toxic || { shown: true } : null;
      if (e.mode === 'dead') { e.hp = 0; e.deadT = b[6]; e.beam && mirrorBeam(e, null); return; }
      mirrorBeam(e, Array.isArray(b[12]) ? b[12] : null);
    });
    // corpses go once they have lain their time
    const gone = this.mirror.list.filter(e => e.mode === 'dead' && e.deadT >= e.profile.corpseTime);
    if (gone.length) {
      removeEnemyViews(gone);
      this.mirror.list = this.mirror.list.filter(e => !gone.includes(e));
    }
  }
  // our own hit on e: our result stands for a moment against older word from the host
  predicted(e) { e.predHp = e.hp; e.predUntil = performance.now() + PREDICT; }
}

// is the player able to take a blow from the host's enemies now?
export const canBeHit = () => player.hp > 0 && !player.ragdoll && !state.transitioning;
